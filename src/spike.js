// Day-1 spike: which sandbox features work for this PayPal app? Logs statuses only, never credentials.
import { api, token } from "./paypal/client.js";
import { listWebhooks } from "./paypal/webhooks.js";

const CARDS = (process.env.SPIKE_CARDS || "4032039317984658,4111111111111111,4012888888881881").split(",");

export async function spike() {
  const out = {};
  out.token = Boolean(await token());
  for (const number of CARDS) {
    const r = await api("POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [{ custom_id: "spike", amount: { currency_code: "USD", value: "1.00" } }],
      payment_source: { card: { number, expiry: "2030-12", name: "Spike Test" } },
    });
    const cap = r.body?.purchase_units?.[0]?.payments?.captures?.[0];
    out[`card_${number.slice(-4)}`] = { http: r.status, order: r.body?.status, capture: cap?.status, issue: r.body?.details?.[0]?.issue };
    if (r.ok && !cap && r.body?.id) {
      const c = await api("POST", `/v2/checkout/orders/${r.body.id}/capture`, {});
      out[`card_${number.slice(-4)}`].capture_after = c.body?.purchase_units?.[0]?.payments?.captures?.[0]?.status || c.body?.details?.[0]?.issue || c.status;
    }
  }
  // Negative testing on capture: which mock codes does the sandbox honour?
  for (const code of ["INSTRUMENT_DECLINED", "PENDING", "TRANSACTION_REFUSED"]) {
    const o = await api("POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [{ custom_id: "spike-neg", amount: { currency_code: "USD", value: "1.00" } }],
      payment_source: { card: { number: CARDS[0], expiry: "2030-12", name: "Spike Test" } },
    }, { mock: code });
    out[`mock_create_${code}`] = { http: o.status, issue: o.body?.details?.[0]?.issue || o.body?.name, status: o.body?.status };
  }
  const w = await listWebhooks();
  out.webhooks = (w.body?.webhooks || []).map((x) => ({ url: x.url, events: x.event_types?.length }));
  return out;
}
