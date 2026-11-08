// The two AI pieces, both on Gemini:
//  compile(): plain English -> a plan that must pass the zod schema (repair loop on validation errors).
//  diagnose(): a failed run's timeline (+ the handler source when we have it) -> cause, fix and patch, citing steps.
// The model never calls PayPal itself: it only proposes a plan; code validates and runs it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVENT_TYPES, validate } from "./runner/plan.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const aiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

async function gemini(prompt, { json = true, temperature = 0.2 } = {}) {
  if (!aiConfigured()) throw new Error("GEMINI_API_KEY is not set");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature, ...(json ? { responseMimeType: "application/json" } : {}) },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  return json ? JSON.parse(text) : text;
}

const STEP_GUIDE = `Step types (use only these; the first step must be create_order; include at least one expect):
- {"type":"create_order","item":string,"amount":"12.00","currency":"USD"|"EUR"|"GBP"|"AUD"|"CAD"}
- {"type":"pay","outcome":"completed"|"declined"|"pending"}   (PayPal sandbox order + capture; declined/pending are forced with PayPal negative testing)
- {"type":"refund","amount":"5.00"}   (omit amount for a full refund)
- {"type":"deliver","event":EVENT,"mode":"as_is"|"duplicate"|"bad_signature"|"delayed","delay_seconds":0-30}
- {"type":"deliver_out_of_order","events":[EVENT,EVENT,...]}   (delivered in REVERSE of the order listed)
- {"type":"expect","status":string,"paid":boolean,"shipped_count":int,"refunded":"8.00","why":string}   (only fields you are sure of)
- {"type":"wait","seconds":1-20}
EVENT is one of: ${EVENT_TYPES.join(", ")}.
App state the shop reports: status ("created"|"approved"|"payment_pending"|"paid"|"payment_failed"|"partially_refunded"|"refunded"), paid (bool), shipped_count (int), refunded (string amount).
Correct behaviour to assert: approval is not payment; PENDING is not paid and must not ship; COMPLETED ships exactly once even if redelivered; forged signatures are rejected; a full refund makes paid=false and status=refunded; a late COMPLETED after REFUNDED must not re-mark the order paid.`;

/** English scenario -> validated plan. Returns { plan, attempts, errors? }. */
export async function compile(english) {
  let prompt = `You turn a developer's plain-English PayPal payment scenario into a test plan for "Rehearsal".
${STEP_GUIDE}
Return JSON: {"title": short title (max 80 chars), "steps": [...]}.
Scenario: """${String(english).slice(0, 600)}"""`;
  let last = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const out = await gemini(prompt);
    const v = validate(out);
    if (v.ok) return { plan: v.plan, attempts: attempt };
    last = v.errors;
    prompt += `\n\nYour previous plan was rejected by the validator with these errors:\n- ${last.join("\n- ")}\nReturn a corrected plan as JSON only.`;
  }
  return { plan: null, attempts: 3, errors: last };
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const shopSource = () => fs.readFileSync(path.join(dir, "shop", "chai.js"), "utf-8");

/** Explain why a run failed and how to fix it. */
export async function diagnose(run) {
  const failed = run.timeline.filter((t) => t.ok === false);
  if (!failed.length) return { summary: "Every check passed; nothing to fix.", findings: [] };
  const timeline = run.timeline.map((t) => `#${t.step ?? "-"} [${t.kind}] ${t.ok === false ? "FAIL " : t.ok === true ? "PASS " : ""}${t.title}${t.detail ? " :: " + t.detail.slice(0, 200) : ""}`).join("\n");
  const source = run.target.label.startsWith("Chai Corner") ? `\nThe app's webhook handler source (the shop runs the "${run.target.label.includes("fixed") ? "fixed" : "buggy"}" variant):\n\`\`\`js\n${shopSource()}\n\`\`\`` : "";
  const prompt = `You are a PayPal integration reviewer. A scenario was run against a merchant app in the PayPal sandbox and some checks failed.
Scenario: ${run.plan.title}
Timeline (step, type, result, what happened):
${timeline}
${source}
For each distinct failure, explain the root cause in the app's PayPal handling and the exact fix. Cite the step number and the PayPal event or API call you rely on. If the source is shown, point to the exact branch to change and give a minimal patch.
Return JSON: {"summary": one sentence, "findings": [{"step": number, "cause": string, "fix": string, "patch": string (code, may be empty), "evidence": string}]}`;
  return gemini(prompt);
}
