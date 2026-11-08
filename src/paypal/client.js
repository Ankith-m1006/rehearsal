// Minimal PayPal REST client for the sandbox: OAuth client-credentials token (cached), JSON requests,
// idempotency keys and the negative-testing header. Secrets come only from the environment.
import crypto from "node:crypto";

export const BASE = process.env.PAYPAL_BASE || "https://api-m.sandbox.paypal.com";
let cached = null; // { token, expiresAt }

export function configured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export async function token() {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  if (!configured()) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`PayPal token failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  cached = { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

/**
 * Call the PayPal REST API.
 * @param {string} method
 * @param {string} path  e.g. "/v2/checkout/orders"
 * @param {object} [body]
 * @param {{mock?: string, requestId?: string, headers?: object}} [opt]
 *   mock: a negative-testing code such as "INSTRUMENT_DECLINED" (sent as PayPal-Mock-Response)
 * @returns {Promise<{status:number, ok:boolean, body:any, debugId:string|null, ms:number}>}
 */
export async function api(method, path, body, opt = {}) {
  const t0 = Date.now();
  const headers = {
    Authorization: `Bearer ${await token()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    "PayPal-Request-Id": opt.requestId || crypto.randomUUID(),
    ...(opt.headers || {}),
  };
  if (opt.mock) headers["PayPal-Mock-Response"] = JSON.stringify({ mock_application_codes: opt.mock });
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: r.status, ok: r.ok, body: parsed, debugId: r.headers.get("paypal-debug-id"), ms: Date.now() - t0 };
}
