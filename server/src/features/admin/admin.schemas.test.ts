import assert from "node:assert/strict";
import test from "node:test";
import { accountStatusSchema, approvalDecisionSchema, materialRateSchema, redemptionDecisionSchema } from "./admin.schemas";

test("suspension and rejection actions require an audit reason", () => {
  assert.equal(accountStatusSchema.safeParse({ status: "SUSPENDED", reason: "Policy violation" }).success, true);
  assert.equal(accountStatusSchema.safeParse({ status: "SUSPENDED", reason: "" }).success, false);
  assert.equal(approvalDecisionSchema.safeParse({ status: "APPROVED" }).success, true);
  assert.equal(approvalDecisionSchema.safeParse({ status: "REJECTED" }).success, false);
  assert.equal(approvalDecisionSchema.safeParse({ status: "REJECTED", reason: "Incomplete documents" }).success, true);
  assert.equal(redemptionDecisionSchema.safeParse({ status: "REJECTED" }).success, false);
});

test("material rates are bounded non-negative integers", () => {
  assert.equal(materialRateSchema.safeParse({ pointsPerKg: 10 }).success, true);
  assert.equal(materialRateSchema.safeParse({ pointsPerKg: -1 }).success, false);
  assert.equal(materialRateSchema.safeParse({ pointsPerKg: 1.5 }).success, false);
});