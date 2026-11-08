// The scenario plan: a strict whitelist of step types. The AI compiler may only produce plans that pass
// this schema; money and currencies are checked in code, never trusted from the model.
import { z } from "zod";

const money = z.string().regex(/^\d{1,6}(\.\d{2})?$/, "amount like 12.00");
const currency = z.enum(["USD", "EUR", "GBP", "AUD", "CAD"]);
export const EVENT_TYPES = [
  "CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED",
];
const eventType = z.enum(EVENT_TYPES);

export const Step = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_order"), item: z.string().max(60).default("masala chai"), amount: money, currency: currency.default("USD") }),
  z.object({ type: z.literal("pay"), outcome: z.enum(["completed", "declined", "pending"]).default("completed") }),
  z.object({ type: z.literal("refund"), amount: money.optional() }),
  z.object({
    type: z.literal("deliver"),
    event: eventType,
    mode: z.enum(["as_is", "duplicate", "bad_signature", "delayed"]).default("as_is"),
    delay_seconds: z.number().int().min(0).max(30).optional(),
  }),
  z.object({ type: z.literal("deliver_out_of_order"), events: z.array(eventType).min(2).max(4) }),
  z.object({
    type: z.literal("expect"),
    status: z.string().max(40).optional(),
    paid: z.boolean().optional(),
    shipped_count: z.number().int().min(0).max(5).optional(),
    refunded: money.optional(),
    why: z.string().max(200).optional(),
  }),
  z.object({ type: z.literal("wait"), seconds: z.number().int().min(1).max(20) }),
]);

export const Plan = z.object({
  title: z.string().max(120),
  steps: z.array(Step).min(1).max(20),
}).superRefine((p, ctx) => {
  if (p.steps[0].type !== "create_order") ctx.addIssue({ code: "custom", message: "the first step must be create_order" });
  const graded = p.steps.some((s) => s.type === "expect" || (s.type === "deliver" && s.mode === "bad_signature"));
  if (!graded) ctx.addIssue({ code: "custom", message: "a plan needs at least one expect step (or a bad_signature delivery, which grades itself)" });
});

export function validate(plan) {
  const r = Plan.safeParse(plan);
  return r.success ? { ok: true, plan: r.data } : { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}
