// Webhooks: register our relay URL, verify a delivery's signature with PayPal, and fire PayPal's
// simulator for events the sandbox does not produce on demand.
import { api } from "./client.js";

export const SIGNATURE_HEADERS = [
  "paypal-transmission-id", "paypal-transmission-time", "paypal-transmission-sig", "paypal-cert-url", "paypal-auth-algo",
];

/** Verify one delivery with PayPal's verify-webhook-signature API. Returns "SUCCESS" or "FAILURE". */
export async function verify(headers, rawBody, webhookId = process.env.PAYPAL_WEBHOOK_ID) {
  if (!webhookId) return "NO_WEBHOOK_ID";
  let event;
  try { event = JSON.parse(rawBody); } catch { return "FAILURE"; }
  const h = (k) => headers[k] ?? headers[k.toLowerCase()];
  const r = await api("POST", "/v1/notifications/verify-webhook-signature", {
    transmission_id: h("paypal-transmission-id"),
    transmission_time: h("paypal-transmission-time"),
    cert_url: h("paypal-cert-url"),
    auth_algo: h("paypal-auth-algo"),
    transmission_sig: h("paypal-transmission-sig"),
    webhook_id: webhookId,
    webhook_event: event,
  });
  return r.ok ? r.body?.verification_status || "FAILURE" : "FAILURE";
}

export async function listWebhooks() {
  return api("GET", "/v1/notifications/webhooks");
}

/** Create (or reuse) a webhook subscription for all events pointing at `url`. */
export async function ensureWebhook(url) {
  const list = await listWebhooks();
  const found = (list.body?.webhooks || []).find((w) => w.url === url);
  if (found) return { id: found.id, created: false };
  const r = await api("POST", "/v1/notifications/webhooks", { url, event_types: [{ name: "*" }] });
  if (!r.ok) throw new Error(`create webhook failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { id: r.body.id, created: true };
}

export async function simulate(eventType, webhookId = process.env.PAYPAL_WEBHOOK_ID) {
  return api("POST", "/v1/notifications/simulate-event", { webhook_id: webhookId, event_type: eventType, resource_version: "2.0" });
}
