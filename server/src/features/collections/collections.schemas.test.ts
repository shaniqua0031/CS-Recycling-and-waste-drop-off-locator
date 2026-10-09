import assert from "node:assert/strict";
import test from "node:test";
import { bufferedCollectionEventSchema, collectionCancellationSchema, collectionPrioritySchema, collectionRequestSchema, collectedWeightSchema, collectorAvailabilitySchema, collectorDeclineSchema, collectorProgressSchema, electricityRedemptionSchema, facilityCapacitySchema, facilityIncidentSchema, facilityProfileSchema, facilityReceiveSchema, facilityRejectSchema, facilitySearchSchema, facilityStatusSchema, reportSubmissionSchema, rewardOptionRedemptionSchema, verifiedWeightSchema } from "./collections.schemas";

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
  assert.equal(facilityProfileSchema.safeParse({ ...valid, latitude: -26.2 }).success, false);
  assert.equal(facilityProfileSchema.safeParse({ ...valid, openingHours: ["17:00-08:00", "", "", "", "", "", ""] }).success, false);
});

test("facility status, capacity, receipt, and incident payloads are bounded", () => {
  assert.equal(facilityStatusSchema.safeParse({ facilityId: "facility-1", status: "TEMPORARILY_CLOSED" }).success, true);
  assert.equal(facilityStatusSchema.safeParse({ facilityId: "facility-1", status: "FULL" }).success, false);
  const capacity = { facilityId: "facility-1", materials: [{ materialId: "plastic", capacityKg: 1000, currentKg: 850 }] };
  assert.equal(facilityCapacitySchema.safeParse(capacity).success, true);
  assert.equal(facilityCapacitySchema.safeParse({ ...capacity, materials: [...capacity.materials, capacity.materials[0]] }).success, false);
  assert.equal(facilityReceiveSchema.safeParse({ facilityId: "facility-1", receivedKg: 24.8, condition: "ACCEPTABLE" }).success, true);
  assert.equal(facilityReceiveSchema.safeParse({ facilityId: "facility-1", receivedKg: 0, condition: "ACCEPTABLE" }).success, false);
  assert.equal(facilityRejectSchema.safeParse({ facilityId: "facility-1", reasonCode: "CONTAMINATED" }).success, true);
  assert.equal(facilityRejectSchema.safeParse({ facilityId: "facility-1", reason: "Rejected" }).success, false);
  assert.equal(facilityIncidentSchema.safeParse({ facilityId: "facility-1", type: "SAFETY_ISSUE", description: "A damaged guard is exposing moving machinery." }).success, true);
});

test("verified quantities must be positive", () => {
  assert.equal(verifiedWeightSchema.safeParse({ verifiedKg: 27 }).success, true);
  assert.equal(verifiedWeightSchema.safeParse({ verifiedKg: 0 }).success, false);
});

test("collector decline requires a supported reason code", () => {
  assert.equal(collectorDeclineSchema.safeParse({ reasonCode: "VEHICLE_FULL" }).success, true);
  assert.equal(collectorDeclineSchema.safeParse({ reasonCode: "OTHER", explanation: "  " }).success, false);
  assert.equal(collectorDeclineSchema.safeParse({ reason: "Vehicle unavailable" }).success, false);
});

test("electricity redemptions require points and a valid meter number", () => {
  assert.equal(electricityRedemptionSchema.safeParse({ pointsCost: 500, meterNumber: "12345678" }).success, true);
  assert.equal(electricityRedemptionSchema.safeParse({ pointsCost: 0, meterNumber: "12345678" }).success, false);
  assert.equal(electricityRedemptionSchema.safeParse({ pointsCost: 500, meterNumber: "123" }).success, false);
  assert.equal(electricityRedemptionSchema.safeParse({ pointsCost: 500, meterNumber: "1234 @78" }).success, false);
});

test("buffered events require a stable idempotency key", () => {
  const valid = {
    material: "Plastic",
    destinationFacilityId: "facility-1",
    estimatedKg: 10,
    requestedFor: "2026-10-05T12:00:00.000Z",
    pickupAddress: "12 Example Road, Johannesburg",
    pickupLatitude: -26.2,
    pickupLongitude: 28,
    idempotencyKey: "buffer-event-unique-1",
  };
  assert.equal(bufferedCollectionEventSchema.safeParse(valid).success, true);
  assert.equal(bufferedCollectionEventSchema.safeParse({ ...valid, priority: "LOW" }).success, false);
  assert.equal(bufferedCollectionEventSchema.safeParse({ ...valid, idempotencyKey: "short" }).success, false);
});

test("facility distance searches require paired coordinates", () => {
  assert.equal(facilitySearchSchema.safeParse({ latitude: -26.2, longitude: 28, maxDistanceKm: "25" }).success, true);
  assert.equal(facilitySearchSchema.safeParse({ latitude: -26.2 }).success, false);
});

test("hazard reports require location and cannot set priority", () => {
  const valid = { type: "BROKEN_GLASS", description: "Broken glass at the public drop-off point.", latitude: -26.2, longitude: 28 };
  assert.equal(reportSubmissionSchema.safeParse(valid).success, true);
  assert.equal(reportSubmissionSchema.safeParse({ ...valid, priority: "LOW" }).success, false);
  assert.equal(reportSubmissionSchema.safeParse({ type: "HAZARDOUS_WASTE", description: "Toxic liquid leaking beside the public collection bin." }).success, false);
});

test("collector progress accepts only supported transition actions", () => {
  assert.equal(collectorProgressSchema.safeParse({ action: "ARRIVED" }).success, true);
  assert.equal(collectorProgressSchema.safeParse({ action: "PAUSE", delayCode: "SAFETY_ISSUE" }).success, true);
  assert.equal(collectorProgressSchema.safeParse({ action: "PAUSE" }).success, false);
  assert.equal(collectorProgressSchema.safeParse({ action: "COMPLETED" }).success, false);
});

test("collector availability and material qualifications validate server-side", () => {
  assert.equal(collectorAvailabilitySchema.safeParse({ availability: "AVAILABLE", qualifiedMaterialIds: ["material-plastic"] }).success, true);
  assert.equal(collectorAvailabilitySchema.safeParse({ availability: "ON_COLLECTION" }).success, true);
  assert.equal(collectorAvailabilitySchema.safeParse({ availability: "BUSY" }).success, false);
  assert.equal(collectorAvailabilitySchema.safeParse({}).success, false);
});

test("collection priority overrides require a meaningful reason", () => {
  assert.equal(collectionPrioritySchema.safeParse({ priority: "CRITICAL", reason: "Immediate public safety risk" }).success, true);
  assert.equal(collectionPrioritySchema.safeParse({ priority: "CRITICAL", reason: "  " }).success, false);
  assert.equal(collectionPrioritySchema.safeParse({ priority: "CRITICAL" }).success, false);
});

test("collected and verified material weights must be valid and unique", () => {
  const weights = [{ materialId: "plastic", actualKg: 18.5 }, { materialId: "paper", actualKg: 4.2 }];
  assert.equal(collectedWeightSchema.safeParse({ materials: weights }).success, true);
  assert.equal(collectedWeightSchema.safeParse({ materials: [...weights, weights[0]] }).success, false);
  assert.equal(collectedWeightSchema.safeParse({ materials: [{ materialId: "plastic", actualKg: -1 }] }).success, false);
  assert.equal(verifiedWeightSchema.safeParse({ materials: [{ materialId: "plastic", verifiedKg: 18.5 }] }).success, true);
  assert.equal(verifiedWeightSchema.safeParse({ materials: [{ materialId: "plastic", verifiedKg: 0 }] }).success, false);
});

test("collection priority accepts only supported levels", () => {
  assert.equal(collectionPrioritySchema.safeParse({ priority: "CRITICAL", reason: "Immediate public safety risk" }).success, true);
  assert.equal(collectionPrioritySchema.safeParse({ priority: "URGENT", reason: "Invalid priority level" }).success, false);
});

test("reward redemption accepts a catalog id but never a client-selected point cost", () => {
  const valid = { rewardId: "recycling-bag", idempotencyKey: "redemption-request-1" };
  assert.equal(rewardOptionRedemptionSchema.safeParse(valid).success, true);
  assert.equal(rewardOptionRedemptionSchema.safeParse({ ...valid, pointsCost: 1 }).success, false);
  assert.equal(rewardOptionRedemptionSchema.safeParse({ ...valid, idempotencyKey: "short" }).success, false);
});

test("collection cancellation accepts an optional bounded reason", () => {
  assert.equal(collectionCancellationSchema.safeParse({ reason: "Plans changed" }).success, true);
  assert.equal(collectionCancellationSchema.safeParse({ reason: "   " }).success, false);
  assert.equal(collectionCancellationSchema.safeParse({ force: true }).success, false);
});