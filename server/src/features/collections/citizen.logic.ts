import { ReportType } from "@prisma/client";
import { distanceBetweenKm } from "../../utils/geo";

const criticalReportTypes = new Set<ReportType>([
  ReportType.ILLEGAL_DUMPING,
  ReportType.BROKEN_GLASS,
  ReportType.HAZARDOUS_WASTE,
]);

export const incidentPriorityWeights = {
  affectedUsers: 1,
  facilityUrgency: 2,
  proximity: 1,
  waitTime: 1,
} as const;

export type IncidentPriorityCalculation = {
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  score: number;
  factors: {
    affectedUsers: number;
    facilityUrgency: number;
    proximity: number;
    proximitySource: "REGISTERED" | "REMOTE" | "UNKNOWN";
    hazardOverride: boolean;
    waitTime: number;
  };
};

export function calculateIncidentPriorityScore(input: {
  type: ReportType;
  reportCount: number;
  waitingHours: number;
  facilityUrgency: boolean;
  proximityKm: number | null;
  proximitySource?: "REGISTERED" | "REMOTE";
}): IncidentPriorityCalculation {
  const proximitySource = input.proximitySource ?? (input.proximityKm === null ? "UNKNOWN" : "REGISTERED");
  const factors: IncidentPriorityCalculation["factors"] = {
    affectedUsers: input.reportCount >= 5 ? 1 : input.reportCount >= 2 ? 0.5 : 0,
    facilityUrgency: input.facilityUrgency ? 2 : 0,
    proximity: proximitySource === "UNKNOWN"
      ? 0
      : (proximitySource === "REMOTE" ? 0.5 : 1) * (input.proximityKm === null ? 1 : Math.max(0, 1 - input.proximityKm / 25)),
    proximitySource,
    hazardOverride: criticalReportTypes.has(input.type),
    waitTime: Math.min(2, Math.max(0, Math.floor(input.waitingHours / 24))),
  };
  const score = factors.affectedUsers * incidentPriorityWeights.affectedUsers
    + factors.facilityUrgency * incidentPriorityWeights.facilityUrgency
    + factors.proximity * incidentPriorityWeights.proximity
    + factors.waitTime * incidentPriorityWeights.waitTime;
  const priority = factors.hazardOverride
    ? "CRITICAL"
    : score >= 4.5
      ? "HIGH"
      : score >= 2
        ? "MEDIUM"
        : "LOW";

  return { priority, score: Math.round(score * 100) / 100, factors };
}

export function calculateIncidentPriority(input: {
  type: ReportType;
  reportCount: number;
  waitingHours: number;
  facilityUrgency: boolean;
  proximityKm: number | null;
}): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  return calculateIncidentPriorityScore(input).priority;
}

export function shouldGroupIncident(input: {
  existingType: ReportType;
  incomingType: ReportType;
  existingFacilityId: string | null;
  incomingFacilityId: string | null;
  existingPosition: { latitude: number; longitude: number };
  incomingPosition: { latitude: number; longitude: number };
  lastReportedAt: Date;
  now: Date;
}): boolean {
  const windowMs = 6 * 60 * 60 * 1000;
  if (input.existingType !== input.incomingType || input.now.getTime() - input.lastReportedAt.getTime() > windowMs) return false;
  if (input.existingFacilityId || input.incomingFacilityId) {
    return input.existingFacilityId !== null && input.existingFacilityId === input.incomingFacilityId;
  }
  return distanceBetweenKm(input.existingPosition, input.incomingPosition) <= 0.25;
}

export function redactCollectorCoordinates<T extends {
  currentLatitude: number | null;
  currentLongitude: number | null;
  lastLocationUpdatedAt: Date | null;
}>(collector: T): T {
  return { ...collector, currentLatitude: null, currentLongitude: null, lastLocationUpdatedAt: null };
}
