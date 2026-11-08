import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { chaiCorner, synthSignature } from "../src/shop/chai.js";

async function withShop(variant, fn) {
  const app = express(); app.use("/s", chaiCorner(variant));
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}/s`;
  try { await fn(base); } finally { srv.close(); }
}
const post = (u, body, headers = {}) => fetch(u, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const ev = (type, orderId, id = "WH-1") => JSON.stringify({ id, event_type: type, resource: { id: "CAP1", custom_id: orderId, amount: { value: "12.00" } } });

test("buggy shop ships twice on a duplicate COMPLETED; fixed ships once", async () => {
  for (const [variant, want] of [["buggy", 2], ["fixed", 1]]) {
    await withShop(variant, async (b) => {
      const o = await (await post(`${b}/api/orders`, { amount: "12.00" })).json();
      const raw = ev("PAYMENT.CAPTURE.COMPLETED", o.id);
      for (let i = 0; i < 2; i++) await post(`${b}/webhooks/paypal`, raw, { "x-rehearsal-synthetic": synthSignature(raw) });
      const st = await (await fetch(`${b}/api/orders/${o.id}`)).json();
      assert.equal(st.shipped_count, want, variant);
    });
  }
});

test("fixed shop rejects a forged synthetic signature; buggy accepts it", async () => {
  for (const [variant, code] of [["buggy", 200], ["fixed", 401]]) {
    await withShop(variant, async (b) => {
      const o = await (await post(`${b}/api/orders`, {})).json();
      const r = await post(`${b}/webhooks/paypal`, ev("PAYMENT.CAPTURE.COMPLETED", o.id), { "x-rehearsal-synthetic": "0".repeat(64) });
      assert.equal(r.status, code, variant);
    });
  }
});

test("approval and pending do not ship in the fixed shop", async () => {
  await withShop("fixed", async (b) => {
    const o = await (await post(`${b}/api/orders`, {})).json();
    for (const [t, id] of [["CHECKOUT.ORDER.APPROVED", "WH-A"], ["PAYMENT.CAPTURE.PENDING", "WH-P"]]) {
      const raw = ev(t, o.id, id); await post(`${b}/webhooks/paypal`, raw, { "x-rehearsal-synthetic": synthSignature(raw) });
    }
    const st = await (await fetch(`${b}/api/orders/${o.id}`)).json();
    assert.equal(st.shipped_count, 0); assert.equal(st.paid, false);
  });
});
