import test from "node:test";
import assert from "node:assert/strict";
import { validate } from "../src/runner/plan.js";
import { STARTER } from "../src/scenarios.js";

test("every starter scenario is a valid plan", () => {
  for (const s of STARTER) assert.ok(validate(s.plan).ok, `${s.id}: ${JSON.stringify(validate(s.plan).errors)}`);
});

test("plans must start with create_order and contain an expect", () => {
  assert.equal(validate({ title: "x", steps: [{ type: "pay", outcome: "completed" }] }).ok, false);
  assert.equal(validate({ title: "x", steps: [{ type: "create_order", amount: "1.00" }] }).ok, false);
});

test("unknown step types and bad money are rejected", () => {
  assert.equal(validate({ title: "x", steps: [{ type: "create_order", amount: "1.00" }, { type: "transfer_all_money" }, { type: "expect", paid: true }] }).ok, false);
  assert.equal(validate({ title: "x", steps: [{ type: "create_order", amount: "lots" }, { type: "expect", paid: true }] }).ok, false);
});
