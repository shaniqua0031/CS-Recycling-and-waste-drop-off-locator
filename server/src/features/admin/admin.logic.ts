import { distanceBetweenKm, type Coordinates } from "../../utils/geo";

const RECENT_LOCATION_MAX_AGE_MS = 30 * 60 * 1000;
const ESTIMATED_AVERAGE_SPEED_KMH = 20;

export type CollectorCandidateInput = {
  profileId: string;
  userId: string;
  displayName: string | null;
  email: string;
  accountStatus: string;
  approvalStatus: string;
  availability: string;
  serviceRadiusKm: number | null;
  serviceCenterLatitude: number | null;
  serviceCenterLongitude: number | null;
  currentLatitude: number | null;
  currentLongitude: number | null;
  lastLocationUpdatedAt: Date | null;
  activeWorkload: number;
};

export type RankedCollectorCandidate = CollectorCandidateInput & {
  distanceKm: number;
  etaMinutes: number;
  locationSource: "CURRENT" | "SERVICE_CENTER";
};

function hasCoordinates(point: { latitude: number | null; longitude: number | null }): point is Coordinates {
  return point.latitude !== null && point.longitude !== null && Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

export function rankCollectorCandidates(
  requestLocation: Coordinates,
  collectors: CollectorCandidateInput[],
  now = new Date(),
): RankedCollectorCandidate[] {
  return collectors.flatMap((collector) => {
    if (
      collector.accountStatus !== "ACTIVE" ||
      collector.approvalStatus !== "APPROVED" ||
      collector.availability !== "AVAILABLE"
    ) return [];

    const locationIsRecent = collector.lastLocationUpdatedAt !== null &&
      now.getTime() - collector.lastLocationUpdatedAt.getTime() <= RECENT_LOCATION_MAX_AGE_MS;
    const currentLocation = { latitude: collector.currentLatitude, longitude: collector.currentLongitude };
    const serviceCenter = { latitude: collector.serviceCenterLatitude, longitude: collector.serviceCenterLongitude };
    const hasCurrentLocation = locationIsRecent && hasCoordinates(currentLocation);
    const location = hasCurrentLocation ? currentLocation : serviceCenter;
    if (!hasCoordinates(location)) return [];

    const distanceKm = distanceBetweenKm(requestLocation, location);
    if (collector.serviceRadiusKm !== null && collector.serviceRadiusKm > 0 && distanceKm > collector.serviceRadiusKm) return [];

    return [{
      ...collector,
      distanceKm,
      etaMinutes: Math.max(1, Math.ceil((distanceKm / ESTIMATED_AVERAGE_SPEED_KMH) * 60)),
      locationSource: hasCurrentLocation ? "CURRENT" as const : "SERVICE_CENTER" as const,
    }];
  }).sort((left, right) => left.distanceKm - right.distanceKm || left.activeWorkload - right.activeWorkload);
}