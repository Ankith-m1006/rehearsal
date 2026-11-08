// Starter pack: common PayPal scenarios every integration should survive. Each is a validated plan.
export const STARTER = [
  {
    id: "happy-path", english: "A buyer pays $12 for chai and the capture completes.",
    plan: { title: "Happy path: paid once, shipped once", steps: [
      { type: "create_order", item: "masala chai", amount: "12.00", currency: "USD" },
      { type: "pay", outcome: "completed" },
      { type: "deliver", event: "PAYMENT.CAPTURE.COMPLETED", mode: "as_is" },
      { type: "expect", status: "paid", paid: true, shipped_count: 1, why: "One completed capture means paid and shipped exactly once." },
    ] },
  },
  {
    id: "duplicate-completed", english: "PayPal delivers PAYMENT.CAPTURE.COMPLETED twice.",
    plan: { title: "Redelivered capture event must not ship twice", steps: [
      { type: "create_order", item: "cardamom chai", amount: "9.50", currency: "USD" },
      { type: "pay", outcome: "completed" },
      { type: "deliver", event: "PAYMENT.CAPTURE.COMPLETED", mode: "duplicate" },
      { type: "expect", status: "paid", shipped_count: 1, why: "PayPal retries deliveries; handlers must be idempotent on the event id." },
    ] },
  },
  {
    id: "approved-not-paid", english: "The order is approved but the money has not been captured yet.",
    plan: { title: "Approval is not payment", steps: [
      { type: "create_order", item: "ginger chai", amount: "7.00", currency: "USD" },
      { type: "deliver", event: "CHECKOUT.ORDER.APPROVED", mode: "as_is" },
      { type: "expect", paid: false, shipped_count: 0, why: "CHECKOUT.ORDER.APPROVED means the buyer approved; no money has moved until a capture completes." },
    ] },
  },
  {
    id: "pending-capture", english: "The capture comes back PENDING, then completes later.",
    plan: { title: "Pending capture: don't ship until it completes", steps: [
      { type: "create_order", item: "kashmiri kahwa", amount: "15.00", currency: "USD" },
      { type: "pay", outcome: "pending" },
      { type: "deliver", event: "PAYMENT.CAPTURE.PENDING", mode: "as_is" },
      { type: "expect", paid: false, shipped_count: 0, why: "A PENDING capture can still fail (e.g. eCheck, review); ship only on COMPLETED." },
      { type: "deliver", event: "PAYMENT.CAPTURE.COMPLETED", mode: "as_is" },
      { type: "expect", status: "paid", shipped_count: 1 },
    ] },
  },
  {
    id: "forged-signature", english: "Someone posts a forged PAYMENT.CAPTURE.COMPLETED to the webhook URL.",
    plan: { title: "Forged webhook must be rejected", steps: [
      { type: "create_order", item: "lemon tea", amount: "5.00", currency: "USD" },
      { type: "pay", outcome: "completed" },
      { type: "deliver", event: "PAYMENT.CAPTURE.COMPLETED", mode: "bad_signature" },
    ] },
  },
  {
    id: "refund", english: "The merchant refunds the full amount after payment.",
    plan: { title: "Full refund updates the order", steps: [
      { type: "create_order", item: "tulsi tea", amount: "8.00", currency: "USD" },
      { type: "pay", outcome: "completed" },
      { type: "deliver", event: "PAYMENT.CAPTURE.COMPLETED", mode: "as_is" },
      { type: "refund" },
      { type: "deliver", event: "PAYMENT.CAPTURE.REFUNDED", mode: "as_is" },
      { type: "expect", status: "refunded", paid: false, why: "After a full refund the order must stop showing as paid." },
    ] },
  },
  {
    id: "out-of-order", english: "The REFUNDED event arrives before COMPLETED.",
    plan: { title: "Events out of order", steps: [
      { type: "create_order", item: "irani chai", amount: "6.00", currency: "USD" },
      { type: "pay", outcome: "completed" },
      { type: "refund" },
      { type: "deliver_out_of_order", events: ["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.REFUNDED"] },
      { type: "expect", paid: false, shipped_count: 0, why: "PayPal does not guarantee order; a refund that arrives first must not be undone by a late COMPLETED." },
    ] },
  },
  {
    id: "declined", english: "The buyer's card is declined at capture.",
    plan: { title: "Declined capture", steps: [
      { type: "create_order", item: "masala chai", amount: "12.00", currency: "USD" },
      { type: "pay", outcome: "declined" },
      { type: "expect", paid: false, shipped_count: 0, why: "A declined capture must leave the order unpaid and unshipped." },
    ] },
  },
];
