// Plays one validated plan against the real PayPal sandbox and the app under test, and grades the app.
import crypto from "node:crypto";
import { api } from "../paypal/client.js";
import { forward, synthesize, track } from "../relay.js";

const runs = new Map(); // id -> run (in memory; one Cloud Run instance)
export const getRun = (id) => runs.get(id);
export const listRuns = () => [...runs.values()].slice(-50).reverse().map(summary);

// Sandbox card used to pay without a buyer login (override with SANDBOX_CARD_NUMBER / SANDBOX_CARD_EXPIRY).
const CARD = () => ({
  number: process.env.SANDBOX_CARD_NUMBER || "4032039317984658",
  expiry: process.env.SANDBOX_CARD_EXPIRY || "2030-12",
  name: "Rehearsal Test Buyer",
});
const MOCK = { declined: "INSTRUMENT_DECLINED", pending: process.env.PENDING_MOCK_CODE || "PENDING" };

function summary(r) {
  const fails = r.timeline.filter((t) => t.kind === "expect" && t.ok === false).length;
  const passes = r.timeline.filter((t) => t.kind === "expect" && t.ok === true).length;
  return { id: r.id, title: r.plan.title, target: r.target.label, status: r.status, passes, fails, startedAt: r.startedAt, endedAt: r.endedAt };
}

/** target = { label, createUrl, stateUrl(orderId), webhookUrl } */
export function startRun(plan, target) {
  const run = {
    id: `run_${crypto.randomBytes(4).toString("hex")}`, plan, target, status: "running",
    startedAt: Date.now(), endedAt: null, timeline: [], inbox: [], ctx: {},
  };
  runs.set(run.id, run);
  execute(run).catch((e) => log(run, "error", "Run stopped", String(e.message || e), false)).finally(() => {
    if (run.status === "running") run.status = run.timeline.some((t) => t.ok === false) ? "failed" : "passed";
    run.endedAt = Date.now();
  });
  return run;
}

function log(run, kind, title, detail = "", ok = null, step = null) {
  run.timeline.push({ t: Date.now() - run.startedAt, kind, title, detail: typeof detail === "string" ? detail : JSON.stringify(detail), ok, step });
}

async function execute(run) {
  const c = run.ctx;
  for (const [i, s] of run.plan.steps.entries()) {
    const n = i + 1;
    switch (s.type) {
      case "create_order": {
        const r = await fetch(run.target.createUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
        const o = await r.json();
        c.shopOrderId = o.id; c.amount = s.amount; c.currency = s.currency;
        track(run, o.id);
        log(run, "app", `App created order ${o.id}`, `${s.item}, ${s.amount} ${s.currency}`, r.ok, n);
        break;
      }
      case "pay": await pay(run, s, n); break;
      case "refund": {
        if (!c.captureId) { log(run, "error", "Nothing to refund: no capture yet", "", false, n); break; }
        const body = s.amount ? { amount: { value: s.amount, currency_code: c.currency } } : {};
        const r = await api("POST", `/v2/payments/captures/${c.captureId}/refund`, body);
        if (r.ok) { c.refund = r.body; track(run, r.body.id); }
        log(run, "paypal", `PayPal refund ${s.amount ? s.amount + " " + c.currency : "(full)"}: ${r.body?.status || r.status}`, debugLine(r), r.ok, n);
        break;
      }
      case "deliver": await deliver(run, s, n); break;
      case "deliver_out_of_order": {
        const recs = [];
        for (const e of s.events) recs.push(await obtain(run, e, n));
        const order = recs.filter(Boolean).reverse();
        log(run, "note", `Delivering ${order.map((r) => r.type).join(" → ")} in reverse of PayPal's order`, "", null, n);
        for (const rec of order) await send(run, rec, n, "out of order");
        break;
      }
      case "expect": await expect(run, s, n); break;
      case "wait": await sleep(s.seconds * 1000); log(run, "note", `Waited ${s.seconds}s`, "", null, n); break;
    }
  }
}

async function pay(run, s, n) {
  const c = run.ctx;
  const create = await api("POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [{ reference_id: c.shopOrderId, custom_id: c.shopOrderId, amount: { currency_code: c.currency, value: c.amount } }],
    payment_source: { card: CARD() },
  });
  c.paypalOrderId = create.body?.id; c.order = create.body;
  track(run, c.paypalOrderId);
  log(run, "paypal", `PayPal order ${c.paypalOrderId || "?"} created: ${create.body?.status || create.status}`, debugLine(create), create.ok, n);
  if (!create.ok) return;
  // Card orders may already be captured by PayPal on create when the payment source is complete.
  let cap = create.body?.purchase_units?.[0]?.payments?.captures?.[0];
  if (!cap || s.outcome !== "completed") {
    const r = await api("POST", `/v2/checkout/orders/${c.paypalOrderId}/capture`, {}, { mock: s.outcome === "completed" ? undefined : MOCK[s.outcome] });
    cap = r.body?.purchase_units?.[0]?.payments?.captures?.[0] || null;
    const label = s.outcome === "completed" ? "Capture" : `Capture (forced ${s.outcome} with PayPal-Mock-Response)`;
    log(run, "paypal", `${label}: ${cap?.status || r.body?.name || r.status}`, debugLine(r), s.outcome === "completed" ? r.ok : null, n);
    if (r.body?.details) c.captureError = r.body;
  }
  if (cap) { c.capture = cap; c.captureId = cap.id; track(run, cap.id); }
}

/** Get a delivery of `type` for this run: the real one from PayPal if it arrives, else a labelled synthetic one. */
async function obtain(run, type, n, waitMs = Number(process.env.REAL_EVENT_WAIT_MS || 20000)) {
  const used = run.ctx.used || (run.ctx.used = new Set());
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) {
    const rec = run.inbox.find((e) => e.type === type && !used.has(e.id));
    if (rec) { used.add(rec.id); log(run, "event", `Real PayPal webhook received: ${type}`, `signature ${rec.signature}`, rec.signature === "SUCCESS" ? true : null, n); return rec; }
    await sleep(1000);
  }
  const c = run.ctx;
  const resource = type === "PAYMENT.CAPTURE.REFUNDED" ? { ...(c.refund || {}), custom_id: c.shopOrderId, links: c.refund?.links || [] }
    : type === "CHECKOUT.ORDER.APPROVED" ? { ...(c.order || {}), status: "APPROVED" }
      : { ...(c.capture || { id: c.captureId }), custom_id: c.shopOrderId, status: type.split(".").pop() };
  const rec = synthesize(type, resource);
  log(run, "event", `Synthetic ${type} (PayPal did not send one within ${Math.round(waitMs / 1000)}s)`, "built from the real sandbox resource, signed for the test", null, n);
  return rec;
}

async function send(run, rec, n, how, opts = {}) {
  const r = await forward(run.target.webhookUrl, rec, opts);
  log(run, "forward", `Delivered ${rec.type} to the app (${how}): HTTP ${r.status}`, r.body, null, n);
  return r;
}

async function deliver(run, s, n) {
  const rec = await obtain(run, s.event, n);
  if (s.mode === "delayed") { await sleep((s.delay_seconds ?? 5) * 1000); return send(run, rec, n, `after ${s.delay_seconds ?? 5}s`); }
  if (s.mode === "bad_signature") {
    const r = await send(run, rec, n, "with a tampered signature", { tamper: true });
    const rejected = r.status >= 400;
    log(run, "expect", rejected ? "App rejected the forged delivery" : "App ACCEPTED a delivery with a forged signature", `HTTP ${r.status}`, rejected, n);
    return r;
  }
  await send(run, rec, n, "as PayPal sent it");
  if (s.mode === "duplicate") await send(run, rec, n, "again: PayPal redelivers when it gets no 2xx in time");
}

async function expect(run, s, n) {
  const r = await fetch(run.target.stateUrl(run.ctx.shopOrderId));
  const st = await r.json().catch(() => ({}));
  const misses = [];
  for (const k of ["status", "paid", "shipped_count", "refunded"]) {
    if (s[k] !== undefined && String(st[k]) !== String(s[k])) misses.push(`${k}: expected ${s[k]}, app has ${st[k]}`);
  }
  log(run, "expect", misses.length ? `App state wrong: ${misses.join("; ")}` : `App state correct (${Object.entries(s).filter(([k]) => !["type", "why"].includes(k)).map(([k, v]) => `${k}=${v}`).join(", ")})`,
    s.why || "", misses.length === 0, n);
}

const debugLine = (r) => `HTTP ${r.status}${r.debugId ? ` · debug ${r.debugId}` : ""} · ${r.ms} ms${r.ok ? "" : ` · ${JSON.stringify(r.body).slice(0, 300)}`}`;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
