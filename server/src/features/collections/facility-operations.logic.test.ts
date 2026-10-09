import assert from "node:assert/strict";
import test from "node:test";
import { getFacilityCapacityLevel, statusForCapacity } from "./facility-operations.logic";

test("facility capacity levels use the configured thresholds", () => {
  assert.equal(getFacilityCapacityLevel(790, 1000), "NORMAL");
  assert.equal(getFacilityCapacityLevel(800, 1000), "NEAR_CAPACITY");
  assert.equal(getFacilityCapacityLevel(949, 1000), "NEAR_CAPACITY");
  assert.equal(getFacilityCapacityLevel(950, 1000), "CRITICAL");
  assert.equal(getFacilityCapacityLevel(1001, 1000), "CRITICAL");
  assert.equal(getFacilityCapacityLevel(12, null), "UNCONFIGURED");
});

test("capacity status preserves manual closures and restores open below warning", () => {
  assert.equal(statusForCapacity("OPEN", 95), "FULL");
  assert.equal(statusForCapacity("OPEN", 83), "NEAR_CAPACITY");
  assert.equal(statusForCapacity("FULL", 40), "OPEN");
  assert.equal(statusForCapacity("CLOSED", 100), "CLOSED");
  assert.equal(statusForCapacity("TEMPORARILY_CLOSED", 40), "TEMPORARILY_CLOSED");
});