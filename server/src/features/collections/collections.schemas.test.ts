import assert from "node:assert/strict";
import test from "node:test";
import { collectionRequestSchema, collectorDeclineSchema, electricityRedemptionSchema, facilityProfileSchema, verifiedWeightSchema } from "./collections.schemas";

test("collection requests require facility, pickup coordinates, material, date, and positive weight", () => {
  const valid = {
    material: "Plastic",
    destinationFacilityId: "facility-1",
    estimatedKg: 25,
    requestedFor: "2026-10-05T12:00:00.000Z",
    pickupAddress: "12 Example Road, Johannesburg",
    pickupLatitude: -26.2,
    pickupLongitude: 28.0,
  };
  assert.equal(collectionRequestSchema.safeParse(valid).success, true);
  assert.equal(collectionRequestSchema.safeParse({ ...valid, pickupLatitude: 91 }).success, false);
  assert.equal(collectionRequestSchema.safeParse({ ...valid, estimatedKg: 0 }).success, false);
});

test("facility profile hours use the supported time-range or Closed format", () => {
  const valid = {
    name: "Green Centre",
    address: "14 Eco Street, Johannesburg",
    acceptedMaterials: ["Plastic", "Paper"],
    openingHours: ["08:00-17:00", "08:00-17:00", "08:00-17:00", "08:00-17:00", "08:00-17:00", "", "Closed"],
  };
  assert.equal(facilityProfileSchema.safeParse(valid).success, true);
  assert.equal(facilityProfileSchema.safeParse({ ...valid, acceptedMaterials: [] }).success, false);
  assert.equal(facilityProfileSchema.safeParse({ ...valid, openingHours: ["8 AM", "", "", "", "", "", ""] }).success, false);
});

test("verified quantities must be positive", () => {
  assert.equal(verifiedWeightSchema.safeParse({ verifiedKg: 27 }).success, true);
  assert.equal(verifiedWeightSchema.safeParse({ verifiedKg: 0 }).success, false);
});

test("collector decline requires a useful reason", () => {
  assert.equal(collectorDeclineSchema.safeParse({ reason: "Vehicle unavailable" }).success, true);
  assert.equal(collectorDeclineSchema.safeParse({ reason: "   " }).success, false);
  assert.equal(collectorDeclineSchema.safeParse({ reason: "No" }).success, false);
});

test("electricity redemptions require points and a valid meter number", () => {
  assert.equal(electricityRedemptionSchema.safeParse({ pointsCost: 500, meterNumber: "12345678" }).success, true);
  assert.equal(electricityRedemptionSchema.safeParse({ pointsCost: 0, meterNumber: "12345678" }).success, false);
  assert.equal(electricityRedemptionSchema.safeParse({ pointsCost: 500, meterNumber: "123" }).success, false);
  assert.equal(electricityRedemptionSchema.safeParse({ pointsCost: 500, meterNumber: "1234 @78" }).success, false);
});