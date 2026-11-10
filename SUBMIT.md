# PayPal AI Hackathon: Rehearsal. Everything left, in order

Our deadline: **Thu 12 Nov 20:00 IST** (official: Fri 13 Nov 01:30 IST).
YouTube upload by **Thu 12 Nov 14:00 IST**, because processing can take hours.

## 1. Record the video (Ankith, under 3 minutes)
Screen-record the live app: https://rehearsal-1037019152152.asia-south1.run.app
- Voice: yours, or an AI voiceover (the hackathon update says that's fine).
- No music with copyright.
- Cut the loading screens.

Script. The lines are a suggestion; say them your way.

**0:00–0:15 Problem.** Show the Chai Corner shop.
"Payment bugs are found by customers. A PayPal webhook that arrives twice ships the order twice. A refund that arrives before the payment re-opens the order. You only find out when a customer complains."

**0:15–0:35 What Rehearsal is.**
"Rehearsal plays those situations against your app in the real PayPal sandbox: real orders, real refunds, and real signed PayPal webhooks, delivered twice, late, out of order, or forged. Then it checks your app's state after every step."

**0:35–1:05 AI compiler.** Type this into the AI box: "A buyer pays $9 for ginger chai, PayPal sends the completed webhook three times, and the shop must ship only once." Show the plan it produces.
"I describe the situation in plain English. Gemini turns it into a plan. Code checks the plan before anything runs."

**1:05–1:40 Run it on the buggy shop.** Run duplicate-COMPLETED and pending-capture on /shop/buggy. Show the timeline:
- the real PayPal order;
- "Real PayPal webhook received, signature SUCCESS";
- the red step: "shipped twice".

**1:40–2:10 AI diagnoser.** Click "Why it failed".
"The diagnoser reads the timeline and the handler, and tells me the cause, the fix and the patch."

**2:10–2:40 The real catch.** Show the out-of-order run on the fixed shop failing, then passing after the fix.
"On its first live run, Rehearsal caught a bug in our own fixed shop. A refund that arrived first was undone by a late payment event, and the order shipped. None of our unit tests tried that order. We fixed it from the diagnosis, and the re-run passed."

**2:40–2:55 Close.** Show the results table from the README.
"Eight PayPal situations, buggy against fixed, on real sandbox money. Rehearse your payments before your customers do."

Upload to YouTube as **Public** (or Unlisted if the rules allow it), and send me the link.

## 2. Devpost form (I fill it in Chrome once the video link exists; you check it, then click Submit)

**Name:** Rehearsal

**Tagline:** Payment bugs are found by customers. Rehearse them first in the PayPal sandbox.

**Description:**
Rehearsal tests how an app handles real PayPal situations before customers hit them:
- a capture that stays PENDING;
- a webhook PayPal delivers twice;
- events that arrive out of order;
- a refund the app never hears about;
- a forged webhook.

You pick a scenario, or describe one in plain English. Gemini compiles it into a plan, and code validates every step and amount. Rehearsal then runs the plan in the PayPal sandbox with Orders v2 captures, Payments v2 refunds and negative testing through PayPal-Mock-Response. It forwards the real PayPal webhooks, each checked with verify-webhook-signature, to your app as sent, twice, late, out of order or tampered. After each step it reads your app's state and grades it. When a step fails, the AI diagnoser explains the cause and proposes the fix.

Live results (10 Nov): we ran 8 scenarios against a deliberately buggy shop and a fixed shop. The buggy shop fails the 5 scenarios that match its 5 planted bugs. The fixed shop passes all 8. On its first live run, Rehearsal also caught a real bug in our own "fixed" shop: a refund that arrived before the payment event was undone by the late event, and the order shipped. The diagnoser proposed the same one-line fix we shipped.

**Built with:** Node.js, Express, PayPal Orders v2, Payments v2, Webhooks (verify-webhook-signature), PayPal-Mock-Response negative testing, Google Gemini, zod, Google Cloud Run, AG Grid.

**AI tools and how each is used:**
- Gemini (gemini-3.8-flash) compiles English into a test plan, with code validation and a repair loop.
- Gemini diagnoses failed runs: cause, fix, patch and evidence.
- AI coding assistants helped write the code; every change was tested, and the live results are reproducible from the repo.

**Links:**
- Repo: https://github.com/Ankith-m1006/rehearsal (MIT licence)
- Live demo: https://rehearsal-1037019152152.asia-south1.run.app

**Testing instructions:** Open the live demo, pick a scenario, choose "buggy" or "fixed", and click Run. No login needed. It uses PayPal sandbox only, and the credentials stay active until judging ends.

**Sponsor prize:** AG Grid (the run timeline uses AG Grid). Tick it on the form.

## 3. Keep alive until 15 Dec
- Keep the Cloud Run service and the PayPal sandbox app "Rehearsal US" running.
- Don't rotate the secrets.
