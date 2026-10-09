import assert from "node:assert/strict";
import test from "node:test";
import { orderCollectionRequestsByPriority, rankCollectorCandidates, type CollectorCandidateInput } from "./admin.logic";

const now = new Date("2026-10-01T12:00:00.000Z");

function candidate(overrides: Partial<CollectorCandidateInput> = {}): CollectorCandidateInput {
  return {
    profileId: "profile-1",
    userId: "collector-1",
    displayName: "Collector One",
    email: "collector@example.com",
    accountStatus: "ACTIVE",
    approvalStatus: "APPROVED",
    availability: "AVAILABLE",
    serviceRadiusKm: 20,
    serviceCenterLatitude: -26.2,
    serviceCenterLongitude: 28.0,
    currentLatitude: null,
    currentLongitude: null,
    lastLocationUpdatedAt: null,
    activeWorkload: 0,
    ...overrides,
  };
}

test("ranks eligible collectors by distance then workload and estimates ETA", () => {
  const ranked = rankCollectorCandidates(
    { latitude: -26.2, longitude: 28.0 },
    [
      candidate({ profileId: "far", serviceCenterLongitude: 28.1 }),
      candidate({ profileId: "near-busy", activeWorkload: 1 }),
      candidate({ profileId: "near", activeWorkload: 0 }),
    ],
    { now },
  );

  assert.deepEqual(ranked.map((item) => item.profileId), ["near", "near-busy", "far"]);
  assert.equal(ranked[0].distanceKm, 0);
  assert.equal(ranked[0].etaMinutes, 1);
});

test("excludes unapproved, unavailable, out-of-area, and unlocated collectors", () => {
  const ranked = rankCollectorCandidates(
    { latitude: -26.2, longitude: 28.0 },
    [
      candidate({ profileId: "pending", approvalStatus: "PENDING" }),
      candidate({ profileId: "busy", availability: "ON_COLLECTION" }),
      candidate({ profileId: "out-of-area", serviceCenterLongitude: 29, serviceRadiusKm: 10 }),
      candidate({ profileId: "no-location", serviceCenterLatitude: null, serviceCenterLongitude: null }),
    ],
    { now },
  );

  assert.deepEqual(ranked, []);
});

test("uses fresh current coordinates and falls back to the service center when stale", () => {
  const fresh = candidate({
    currentLatitude: -26.2,
    currentLongitude: 28.05,
    lastLocationUpdatedAt: new Date(now.getTime() - 60_000),
  });
  const stale = candidate({
    profileId: "stale",
    serviceCenterLongitude: 28.1,
    currentLatitude: -26.2,
    currentLongitude: 28.05,
    lastLocationUpdatedAt: new Date(now.getTime() - 60 * 60_000),
  });

  const ranked = rankCollectorCandidates({ latitude: -26.2, longitude: 28.0 }, [fresh, stale], { now });

  assert.equal(ranked[0].locationSource, "CURRENT");
  assert.equal(ranked[1].locationSource, "SERVICE_CENTER");
  assert.ok(ranked[0].distanceKm < ranked[1].distanceKm);
});

test("excludes collectors who are not qualified for the requested material", () => {
  const ranked = rankCollectorCandidates(
    { latitude: -26.2, longitude: 28.0 },
    [
      candidate({ profileId: "qualified", qualifiedMaterialIds: ["material-plastic"] }),
      candidate({ profileId: "unqualified", qualifiedMaterialIds: ["material-glass"] }),
    ],
    { now, requiredMaterialId: "material-plastic" },
  );

  assert.deepEqual(ranked.map((item) => item.profileId), ["qualified"]);
});

test("orders waiting requests by priority before creation time", () => {
  const requests = [
    { id: "old-low", priority: "LOW" as const, createdAt: new Date("2026-10-01T00:00:00Z") },
    { id: "new-critical", priority: "CRITICAL" as const, createdAt: new Date("2026-10-02T00:00:00Z") },
    { id: "old-high", priority: "HIGH" as const, createdAt: new Date("2026-10-01T00:00:00Z") },
    { id: "old-critical", priority: "CRITICAL" as const, createdAt: new Date("2026-10-01T00:00:00Z") },
  ];

  assert.deepEqual(orderCollectionRequestsByPriority(requests).map((request) => request.id), ["old-critical", "new-critical", "old-high", "old-low"]);
});