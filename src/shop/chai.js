// "Chai Corner": a tiny demo shop that integrates PayPal webhooks, in two versions.
//   /shop/buggy : the mistakes real integrations make (planted on purpose, listed below)
//   /shop/fixed : the same shop done right
// Rehearsal only talks to it through two hooks any shop can expose: create an order, read its state.
import crypto from "node:crypto";
import express from "express";
import { verify } from "../paypal/webhooks.js";

export const PLANTED_BUGS = {
  paid_on_approval: "Marks the order paid (and ships) on CHECKOUT.ORDER.APPROVED, before any money is captured.",
  no_idempotency: "Ships again every time PAYMENT.CAPTURE.COMPLETED arrives, so a redelivered event ships twice.",
  pending_is_paid: "Treats PAYMENT.CAPTURE.PENDING as paid and ships before the money settles.",
  no_signature_check: "Never verifies the webhook signature, so a forged event is accepted.",
  ignores_refunds: "Ignores PAYMENT.CAPTURE.REFUNDED, so a refunded order still shows as paid.",
};

const SYNTH_SECRET = () => process.env.REHEARSAL_SYNTH_SECRET || "dev-only-synthetic-secret";

/** HMAC Rehearsal puts on synthetic (PayPal-sample based) events so a correct shop can trust them in tests. */
export function synthSignature(rawBody) {
  return crypto.createHmac("sha256", SYNTH_SECRET()).update(rawBody).digest("hex");
}

function orderIdOf(resource, captureToOrder) {
  if (!resource) return null;
  if (resource.custom_id) return resource.custom_id;
  const pu = resource.purchase_units?.[0];
  if (pu?.custom_id) return pu.custom_id;
  const up = (resource.links || []).find((l) => l.rel === "up" && /\/captures\//.test(l.href));
  if (up) return captureToOrder.get(up.href.split("/").pop()) || null;
  return null;
}

export function chaiCorner(variant) {
  const fixed = variant === "fixed";
  const orders = new Map(); // id -> state
  const seen = new Set(); // processed webhook event ids (fixed only)
  const captureToOrder = new Map();
  const r = express.Router();

  r.post("/api/orders", express.json(), (req, res) => {
    const id = `chai_${crypto.randomBytes(4).toString("hex")}`;
    const { item = "masala chai", amount = "12.00", currency = "USD" } = req.body || {};
    orders.set(id, { id, item, amount, currency, status: "created", paid: false, shipped_count: 0, refunded: "0.00", events: [] });
    res.status(201).json(orders.get(id));
  });

  r.get("/api/orders/:id", (req, res) => {
    const o = orders.get(req.params.id);
    return o ? res.json(o) : res.status(404).json({ error: "not found" });
  });

  r.post("/webhooks/paypal", express.text({ type: "*/*", limit: "1mb" }), async (req, res) => {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    let ev;
    try { ev = JSON.parse(raw); } catch { return res.status(400).send("bad json"); }

    if (fixed) { // a correct shop verifies every delivery
      const synthetic = req.get("x-rehearsal-synthetic");
      const ok = synthetic
        ? synthetic === synthSignature(raw)
        : (await verify(req.headers, raw)) === "SUCCESS";
      if (!ok) return res.status(401).send("signature rejected");
      if (seen.has(ev.id)) return res.status(200).send("duplicate ignored");
      seen.add(ev.id);
    }

    const resource = ev.resource || {};
    if (ev.event_type?.startsWith("PAYMENT.CAPTURE.") && resource.id && resource.custom_id) captureToOrder.set(resource.id, resource.custom_id);
    const id = orderIdOf(resource, captureToOrder);
    const o = id && orders.get(id);
    if (!o) return res.status(200).send("unknown order");
    o.events.push(ev.event_type);

    const ship = () => { o.shipped_count += 1; };
    switch (ev.event_type) {
      case "CHECKOUT.ORDER.APPROVED":
        if (!fixed) { o.status = "paid"; o.paid = true; ship(); } // bug: paid_on_approval
        else if (o.status === "created") o.status = "approved";
        break;
      case "PAYMENT.CAPTURE.PENDING":
        if (!fixed) { o.status = "paid"; o.paid = true; ship(); } // bug: pending_is_paid
        else { o.status = "payment_pending"; o.paid = false; }
        break;
      case "PAYMENT.CAPTURE.COMPLETED":
        if (!fixed) { o.status = "paid"; o.paid = true; ship(); } // bug: no_idempotency
        else { o.status = "paid"; o.paid = true; if (o.shipped_count === 0) ship(); }
        break;
      case "PAYMENT.CAPTURE.DENIED":
      case "PAYMENT.CAPTURE.DECLINED":
        o.status = "payment_failed"; o.paid = false;
        break;
      case "PAYMENT.CAPTURE.REFUNDED":
        if (fixed) { // bug in buggy: ignores_refunds
          const amt = resource.amount?.value || o.amount;
          o.refunded = (Number(o.refunded) + Number(amt)).toFixed(2);
          o.status = Number(o.refunded) >= Number(o.amount) ? "refunded" : "partially_refunded";
          o.paid = o.status !== "refunded";
        }
        break;
      default:
        break;
    }
    res.status(200).send("ok");
  });

  return r;
}
