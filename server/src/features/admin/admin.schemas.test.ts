import assert from "node:assert/strict";
import test from "node:test";
import { accountStatusSchema, approvalDecisionSchema, collectorMessageSchema, incidentAssignmentSchema, incidentPriorityOverrideSchema, incidentResolutionSchema, maintenanceOverrunSchema, maintenanceWindowSchema, materialRateSchema, redemptionDecisionSchema, requestCancellationSchema, sensorEventSchema, sensorResetSchema, simulatorActionSchema } from "./admin.schemas";

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

test("Admin-to-Collector messages require non-empty bounded text", () => {
  assert.equal(collectorMessageSchema.safeParse({ message: "Review the facility access note." }).success, true);
  assert.equal(collectorMessageSchema.safeParse({ message: "   " }).success, false);
  assert.equal(collectorMessageSchema.safeParse({ message: "message", title: "untrusted" }).success, false);
});

test("incident overrides require an audit reason and valid target values", () => {
  assert.equal(incidentPriorityOverrideSchema.safeParse({ priority: "CRITICAL", reason: "Immediate public safety risk" }).success, true);
  assert.equal(incidentPriorityOverrideSchema.safeParse({ priority: "CRITICAL", reason: " " }).success, false);
  assert.equal(incidentPriorityOverrideSchema.safeParse({ priority: "URGENT", reason: "Immediate public safety risk" }).success, false);
  assert.equal(incidentAssignmentSchema.safeParse({ collectorProfileId: "collector-1" }).success, true);
  assert.equal(incidentResolutionSchema.safeParse({ status: "RESOLVED", reason: "Issue verified as cleared" }).success, true);
  assert.equal(incidentResolutionSchema.safeParse({ status: "REOPENED", reason: "" }).success, false);
});

test("Admin request cancellation requires a meaningful reason", () => {
  assert.equal(requestCancellationSchema.safeParse({ reason: "Duplicate request created by mistake" }).success, true);
  assert.equal(requestCancellationSchema.safeParse({ reason: "  " }).success, false);
});

test("maintenance schedules and sensor events have bounded server inputs", () => {
  const window = { facilityId: "facility-1", startsAt: "2026-10-09T10:00:00.000Z", endsAt: "2026-10-09T12:00:00.000Z" };
  assert.equal(maintenanceWindowSchema.safeParse(window).success, true);
  assert.equal(maintenanceWindowSchema.safeParse({ ...window, endsAt: window.startsAt }).success, false);
  assert.equal(maintenanceOverrunSchema.safeParse({ enabled: true }).success, true);
  assert.equal(sensorEventSchema.safeParse({ facilityId: "facility-1", reading: 88.5 }).success, true);
  assert.equal(sensorEventSchema.safeParse({ facilityId: "facility-1", reading: -1 }).success, false);
  assert.equal(sensorResetSchema.safeParse({ facilityId: "facility-1" }).success, true);
});

test("simulator actions require the backend entity inputs they mutate", () => {
  assert.equal(simulatorActionSchema.safeParse({ action: "RESET_SIMULATION" }).success, true);
  assert.equal(simulatorActionSchema.safeParse({ action: "COLLECTOR_ACCEPT" }).success, false);
  assert.equal(simulatorActionSchema.safeParse({ action: "COLLECTOR_ACCEPT", requestId: "request-1" }).success, true);
  assert.equal(simulatorActionSchema.safeParse({ action: "RECORD_WEIGHT", requestId: "request-1", actualKg: 12.5 }).success, true);
  assert.equal(simulatorActionSchema.safeParse({ action: "FACILITY_FULL" }).success, false);
});