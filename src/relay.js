// Webhook relay. Our /hooks/paypal is the URL registered with PayPal. Every real delivery is verified with
// PayPal, stored, and matched to the run that caused it (by PayPal order id, capture id or custom_id).
// The runner then forwards it to the app under test exactly as received, twice, late, out of order,
// or with a tampered signature, so the app's handling is tested against real PayPal traffic.
import { SIGNATURE_HEADERS, verify } from "./paypal/webhooks.js";
import { synthSignature } from "./shop/chai.js";

const byKey = new Map(); // paypal order id | capture id | custom_id -> run
const unmatched = []; // recent deliveries we could not match (shown on /api/relay)

export function track(run, ...keys) { for (const k of keys) if (k) byKey.set(k, run); }

function keysOf(ev) {
  const r = ev.resource || {};
  const up = (r.links || []).map((l) => l.href?.split("/").pop());
  return [r.id, r.custom_id, r.purchase_units?.[0]?.custom_id, r.supplementary_data?.related_ids?.order_id, ...up].filter(Boolean);
}

/** Express handler for PayPal's deliveries. */
export async function receive(req, res) {
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  let ev;
  try { ev = JSON.parse(raw); } catch { return res.status(400).end(); }
  const headers = Object.fromEntries(SIGNATURE_HEADERS.map((h) => [h, req.get(h)]).filter(([, v]) => v));
  const signature = await verify(headers, raw).catch(() => "FAILURE");
  const run = keysOf(ev).map((k) => byKey.get(k)).find(Boolean);
  const rec = { at: Date.now(), id: ev.id, type: ev.event_type, raw, headers, signature, source: "paypal" };
  if (run) run.inbox.push(rec);
  else { unmatched.push({ at: rec.at, type: rec.type, signature }); if (unmatched.length > 50) unmatched.shift(); }
  res.status(200).end(); // always ack PayPal quickly
}

export function recentUnmatched() { return unmatched.slice(-20); }

/** Build a synthetic event around a real PayPal resource (used when the sandbox does not emit that event). */
export function synthesize(eventType, resource) {
  const ev = {
    id: `WH-REHEARSAL-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    event_version: "1.0", create_time: new Date().toISOString(),
    resource_type: eventType.startsWith("CHECKOUT.ORDER") ? "checkout-order" : eventType.endsWith("REFUNDED") ? "refund" : "capture",
    resource_version: "2.0", event_type: eventType, summary: `Synthetic ${eventType} built by Rehearsal from a real sandbox resource`,
    resource,
  };
  const raw = JSON.stringify(ev);
  return { at: Date.now(), id: ev.id, type: eventType, raw, headers: { "x-rehearsal-synthetic": synthSignature(raw) }, signature: "SYNTHETIC", source: "synthetic" };
}

/** Forward one stored delivery to the app under test. */
export async function forward(target, rec, { tamper = false } = {}) {
  const headers = { "Content-Type": "application/json", ...rec.headers };
  if (tamper) {
    if (headers["paypal-transmission-sig"]) headers["paypal-transmission-sig"] = "AAAA" + headers["paypal-transmission-sig"].slice(4);
    if (headers["x-rehearsal-synthetic"]) headers["x-rehearsal-synthetic"] = "0".repeat(64);
  }
  const t0 = Date.now();
  try {
    const r = await fetch(target, { method: "POST", headers, body: rec.raw });
    return { status: r.status, body: (await r.text()).slice(0, 200), ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, body: String(e.message || e), ms: Date.now() - t0 };
  }
}
