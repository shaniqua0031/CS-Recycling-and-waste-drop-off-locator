import assert from "node:assert/strict";
import test from "node:test";
import { ReportType } from "@prisma/client";
import { calculateIncidentPriority, calculateIncidentPriorityScore, redactCollectorCoordinates, shouldGroupIncident } from "./citizen.logic";

const position = { latitude: -26.2041, longitude: 28.0473 };
const recent = new Date("2026-10-08T10:00:00.000Z");

function grouping(overrides: Partial<Parameters<typeof shouldGroupIncident>[0]> = {}) {
  return shouldGroupIncident({
    existingType: ReportType.OVERFLOWING_BIN,
    incomingType: ReportType.OVERFLOWING_BIN,
    existingFacilityId: null,
    incomingFacilityId: null,
    existingPosition: position,
    incomingPosition: position,
    lastReportedAt: recent,
    now: new Date(recent.getTime() + 60_000),
    ...overrides,
  });
}

test("groups reports only for matching issue, nearby location, and six-hour window", () => {
  assert.equal(grouping(), true);
  assert.equal(grouping({ incomingType: ReportType.FACILITY_CLOSED }), false);
  assert.equal(grouping({ incomingPosition: { latitude: -25.0, longitude: 28.0 } }), false);
  assert.equal(grouping({ now: new Date(recent.getTime() + 6 * 60 * 60 * 1000 + 1) }), false);
  assert.equal(grouping({ existingFacilityId: "facility-1", incomingFacilityId: "facility-1" }), true);
  assert.equal(grouping({ existingFacilityId: "facility-1", incomingFacilityId: "facility-2" }), false);
});

test("hazards are critical and non-hazard priority uses server-owned factors", () => {
  assert.equal(calculateIncidentPriority({ type: ReportType.BROKEN_GLASS, reportCount: 1, waitingHours: 0, facilityUrgency: false, proximityKm: null }), "CRITICAL");
  assert.equal(calculateIncidentPriority({ type: ReportType.OVERFLOWING_BIN, reportCount: 1, waitingHours: 0, facilityUrgency: false, proximityKm: null }), "LOW");
  assert.equal(calculateIncidentPriority({ type: ReportType.OVERFLOWING_BIN, reportCount: 5, waitingHours: 24, facilityUrgency: true, proximityKm: 0.5 }), "HIGH");
  assert.equal(calculateIncidentPriority({ type: ReportType.OVERFLOWING_BIN, reportCount: 5, waitingHours: 0, facilityUrgency: false, proximityKm: 80 }), "LOW");
});

test("priority score exposes registered/remote proximity factors and wait time", () => {
  const registered = calculateIncidentPriorityScore({ type: ReportType.OVERFLOWING_BIN, reportCount: 2, waitingHours: 24, facilityUrgency: false, proximityKm: 0, proximitySource: "REGISTERED" });
  const remote = calculateIncidentPriorityScore({ type: ReportType.OVERFLOWING_BIN, reportCount: 2, waitingHours: 24, facilityUrgency: false, proximityKm: 0, proximitySource: "REMOTE" });
  assert.equal(registered.factors.affectedUsers, 0.5);
  assert.equal(registered.factors.waitTime, 1);
  assert.equal(registered.factors.proximity, 1);
  assert.equal(remote.factors.proximity, 0.5);
  assert.ok(registered.score > remote.score);
  assert.equal(calculateIncidentPriorityScore({ type: ReportType.OVERFLOWING_BIN, reportCount: 1, waitingHours: 0, facilityUrgency: false, proximityKm: null, proximitySource: "REMOTE" }).factors.proximity, 0.5);
  assert.equal(calculateIncidentPriorityScore({ type: ReportType.ILLEGAL_DUMPING, reportCount: 1, waitingHours: 0, facilityUrgency: false, proximityKm: null }).priority, "CRITICAL");
});

test("recycler collection responses can redact every collector location field", () => {
  const safeCollector = redactCollectorCoordinates({
    id: "collector-1",
    currentLatitude: -26.2,
    currentLongitude: 28,
    lastLocationUpdatedAt: recent,
  });
  assert.equal(safeCollector.currentLatitude, null);
  assert.equal(safeCollector.currentLongitude, null);
  assert.equal(safeCollector.lastLocationUpdatedAt, null);
  assert.equal(safeCollector.id, "collector-1");
});
