# Rehearsal

**Payment bugs are found by customers. Rehearse them first.**

Rehearsal plays real PayPal payment scenarios against your app in the **PayPal sandbox** before your customers hit them:
a capture that stays PENDING, a webhook PayPal delivers twice, events that arrive out of order, a refund your app never
hears about, a forged webhook. You pick or describe a scenario in plain English; Rehearsal turns it into a validated
plan, runs it against the real sandbox, forwards the **real signed PayPal webhooks** to your app (as sent, twice, late,
out of order, or with a tampered signature) and checks your app's state after every step.

Built for the PayPal AI Hackathon 2026. **Live demo:** https://rehearsal-1037019152152.asia-south1.run.app (PayPal sandbox only).

## How it works
1. **Your app exposes two small hooks**: create an order, and read an order's state. The demo shop, Chai Corner, shows both.
2. **A scenario becomes a plan**: a strict whitelist of steps (`create_order`, `pay`, `refund`, `deliver`, `deliver_out_of_order`, `expect`, `wait`). Plans are validated with zod; amounts and currencies are checked in code.
3. **The runner plays the plan in the PayPal sandbox**: Orders v2 (create and capture with sandbox cards), Payments v2 refunds, and negative testing through the `PayPal-Mock-Response` header.
4. **The webhook relay** is the URL registered with PayPal. Each real delivery is verified with `verify-webhook-signature`, matched to its run, and forwarded to your app as the scenario says. If the sandbox does not emit an event, Rehearsal builds a clearly labelled synthetic one from the real sandbox resource.
5. **Grading**: after each step Rehearsal reads your app's order state and marks it pass or fail, with a full timeline of PayPal calls, webhooks and app responses (AG Grid).

## Where AI is used
- **Scenario compiler (Gemini):** plain English such as "a buyer pays $9 for ginger chai, PayPal sends the completed webhook three times, the shop must ship once" becomes a plan. The model only proposes; the plan is validated against the step whitelist in code, and invalid output goes back to the model with the validation errors (repair loop).
- **Failure diagnoser (Gemini):** for a failed run, it reads the plan, the full timeline and the app's handler code, and returns the cause, the fix, a patch and the evidence (which step, which event). On the out-of-order failure below, it proposed exactly the one-line fix we shipped.

## Live results (10 Nov 2026, PayPal sandbox)
Every scenario run against both shops on the live deployment, with real sandbox orders and real signed PayPal webhooks (synthetic events only where the sandbox does not emit one, and labelled as such). Full data: `docs/live-runs-2026-11-10.json`.

| Scenario | Buggy shop | Fixed shop |
|---|---|---|
| Happy path | pass | pass |
| Duplicate COMPLETED webhook | **fail** (shipped twice) | pass |
| Approved but never paid | pass | pass |
| Pending capture | **fail** (shipped before money settled) | pass |
| Forged webhook signature | **fail** (accepted) | pass |
| Refund | **fail** (still shown as paid) | pass |
| Events out of order | **fail** | pass (after fix, see below) |
| Declined card | pass | pass |

**What it caught in our own code.** The first live run failed the *fixed* shop on "events out of order": PayPal sent COMPLETED then REFUNDED, Rehearsal delivered them reversed, and the late COMPLETED re-opened the refunded order and shipped it. Our unit tests had never tried that order. The diagnoser pointed at the COMPLETED handler; we added a test from the run, fixed it (`543545e`), redeployed, and the live re-run passed.

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
`npm test` covers the plan schema, the demo shop's planted bugs, and the out-of-order refund case found live (7 tests).

## License
MIT
