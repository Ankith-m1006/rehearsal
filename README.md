# Rehearsal

**Payment bugs are found by customers. Rehearse them first.**

Rehearsal plays real PayPal payment scenarios against your app in the **PayPal sandbox** before your customers hit them:
a capture that stays PENDING, a webhook PayPal delivers twice, events that arrive out of order, a refund your app never
hears about, a forged webhook. You pick or describe a scenario in plain English; Rehearsal turns it into a validated
plan, runs it against the real sandbox, forwards the **real signed PayPal webhooks** to your app (as sent, twice, late,
out of order, or with a tampered signature) and checks your app's state after every step.

Built for the PayPal AI Hackathon 2026.

## How it works
1. **Your app exposes two small hooks**: create an order, and read an order's state. The demo shop, Chai Corner, shows both.
2. **A scenario becomes a plan**: a strict whitelist of steps (`create_order`, `pay`, `refund`, `deliver`, `deliver_out_of_order`, `expect`, `wait`). Plans are validated with zod; amounts and currencies are checked in code.
3. **The runner plays the plan in the PayPal sandbox**: Orders v2 (create and capture with sandbox cards), Payments v2 refunds, and negative testing through the `PayPal-Mock-Response` header.
4. **The webhook relay** is the URL registered with PayPal. Each real delivery is verified with `verify-webhook-signature`, matched to its run, and forwarded to your app as the scenario says. If the sandbox does not emit an event, Rehearsal builds a clearly labelled synthetic one from the real sandbox resource.
5. **Grading**: after each step Rehearsal reads your app's order state and marks it pass or fail, with a full timeline of PayPal calls, webhooks and app responses (AG Grid).

## Demo shop: Chai Corner
`/shop/buggy` has five bugs that real integrations ship with; `/shop/fixed` is the same shop done right:
- marks the order paid on `CHECKOUT.ORDER.APPROVED`
- ships again on a redelivered `PAYMENT.CAPTURE.COMPLETED`
- treats `PAYMENT.CAPTURE.PENDING` as paid
- never verifies webhook signatures
- ignores `PAYMENT.CAPTURE.REFUNDED`

## Run it
```bash
npm install
PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... PUBLIC_URL=https://your-public-url npm start
```
On start it registers (or reuses) a PayPal webhook for `PUBLIC_URL/hooks/paypal`. Sandbox credentials only; never commit them.

## Tests
`npm test` covers the plan schema and the demo shop's planted bugs.

## License
MIT
