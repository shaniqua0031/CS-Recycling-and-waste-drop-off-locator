import { apiRequest } from "./auth-api";

export type ApiCollectionStatus =
  | "PENDING"
  | "WAITING_FOR_ADMIN"
  | "COLLECTOR_ASSIGNED"
  | "COLLECTOR_ON_THE_WAY"
  | "COLLECTOR_ARRIVED"
  | "COLLECTED"
  | "VERIFICATION_PENDING"
  | "VERIFIED"
  | "COMPLETED"
  | "CANCELLED"
  | "REJECTED";

export type CollectionRecord = {
  id: string;
  requesterId: string;
  destinationFacilityId: string | null;
  estimatedKg: number | string;
  requestedFor: string;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  status: ApiCollectionStatus;
  requester?: { email: string; recyclerProfile?: { displayName: string } | null };
  material: { id: string; name: string };
  destinationFacility?: { id: string; name: string; address: string } | null;
  assignments: Array<{
    id: string;
    status: string;
    collector: {
      currentLatitude: number | null;
      currentLongitude: number | null;
      lastLocationUpdatedAt: string | null;
      user: { id: string; email: string; recyclerProfile?: { displayName: string } | null };
    };
  }>;
  statusEvents: Array<{ id: string; fromStatus: ApiCollectionStatus | null; toStatus: ApiCollectionStatus; note: string | null; createdAt: string }>;
  weight: { estimatedKg: number | string; actualKg: number | string | null; verifiedKg: number | string | null } | null;
};

export type AvailableFacility = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  acceptedMaterials: string[];
  openingHours: Array<{ dayOfWeek: number; opensAt: string | null; closesAt: string | null; isClosed: boolean }>;
};

export type FacilityProfileRecord = {
  id: string;
  name: string;
  address: string;
  acceptedMaterials: string[];
  openingHours: AvailableFacility["openingHours"];
};

export type RecyclerRewards = {
  pointsBalance: number;
  pointValueRand: number;
  rates: Array<{ material: string; pointsPerKg: number }>;
};

export type AdminOverview = {
  totalUsers: number;
  activeCollectors: number;
  facilities: number;
  pendingRequests: number;
  activePickups: number;
  completedToday: number;
  pendingCollectorApprovals: number;
  pendingFacilityApprovals: number;
  totalRecycledKg: number;
  pointsIssued: number;
  pointsRedeemed: number;
  rewardsRedeemed: number;
};

export type AdminUser = {
  id: string;
  email: string;
  role: "RECYCLER" | "COLLECTOR" | "FACILITY";
  status: "ACTIVE" | "SUSPENDED" | "PENDING_APPROVAL";
  displayName: string;
  collections: number;
  reports: number;
  pointsBalance: number;
  recentTransactions: Array<{ id: string; type: string; pointsDelta: number; randValueCents: number; createdAt: string; description: string | null }>;
  recentCollections: Array<{ id: string; status: ApiCollectionStatus; estimatedKg: number | string; createdAt: string; pickupAddress: string; material: { name: string }; weight: { actualKg: number | string | null; verifiedKg: number | string | null } | null }>;
};

export type AdminAuditEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  reason: string | null;
  metadata: unknown;
  createdAt: string;
  admin: { id: string; email: string };
};

export type AdminCollector = {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  accountStatus: string;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  availability: string;
  serviceArea: string | null;
  serviceRadiusKm: number | null;
  vehicleType: string | null;
  vehicleDescription: string | null;
  vehicleRegistration: string | null;
  currentLatitude: number | null;
  currentLongitude: number | null;
  lastLocationUpdatedAt: string | null;
  currentCollection: CollectionRecord | null;
  workload: number;
};

export type AdminFacility = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  isSuspended: boolean;
  acceptedMaterials: string[];
  openingHours: AvailableFacility["openingHours"];
  owner: { id: string; email: string; displayName: string } | null;
};

export type CollectorCandidate = {
  profileId: string;
  userId: string;
  displayName: string | null;
  email: string;
  distanceKm: number;
  etaMinutes: number;
  locationSource: "CURRENT" | "SERVICE_CENTER";
  currentLatitude: number | null;
  currentLongitude: number | null;
  serviceCenterLatitude: number | null;
  serviceCenterLongitude: number | null;
  activeWorkload: number;
};

export type MaterialRate = {
  id: string;
  name: string;
  activeRate: { id: string; pointsPerKg: number; startsAt: string; endsAt: string | null } | null;
  rates: Array<{ id: string; pointsPerKg: number; startsAt: string; endsAt: string | null }>;
};

export type AdminRedemption = {
  id: string;
  reference: string;
  pointsCost: number;
  valueCents: number;
  randValue: number;
  status: "REQUESTED" | "APPROVED" | "FULFILLED" | "REJECTED" | "CANCELLED";
  createdAt: string;
  user: { id: string; email: string; displayName: string };
};

export type AdminReport = {
  id: string;
  type: string;
  status: "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED";
  description: string;
  createdAt: string;
  reporterName: string;
  reporterEmail: string;
  facility?: { id: string; name: string } | null;
};

export type AdminNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export type AdminAnalytics = {
  totalVerifiedKg: number;
  materialTotals: Array<{ material: string; estimatedKg: number; verifiedKg: number }>;
  totalCollections: number;
  completedCollections: number;
  cancelledCollections: number;
  activeUsers: number;
  activeCollectors: number;
  registeredFacilities: number;
  pointsIssued: number;
  pointsRedeemed: number;
  rewardValueRand: number;
};

export function getCollectionRequests() {
  return apiRequest<CollectionRecord[]>("/collections");
}

export function getFacilityProfile() { return apiRequest<FacilityProfileRecord>("/collections/facility-profile"); }
export function saveFacilityProfile(input: { name: string; address: string; acceptedMaterials: string[]; openingHours: string[] }) {
  return apiRequest<FacilityProfileRecord>("/collections/facility-profile", { method: "PUT", body: JSON.stringify(input) });
}

export function getAvailableFacilities(material: string) {
  return apiRequest<AvailableFacility[]>(`/collections/facilities?material=${encodeURIComponent(material)}`);
}

export function createCollectionRequest(input: {
  material: string;
  destinationFacilityId: string;
  estimatedKg: number;
  requestedFor: string;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
}) {
  return apiRequest<CollectionRecord>("/collections", { method: "POST", body: JSON.stringify(input) });
}

export function acceptCollection(requestId: string) {
  return apiRequest<CollectionRecord>(`/collections/${encodeURIComponent(requestId)}/accept`, { method: "POST" });
}

export function updateCollectorLocation(latitude: number, longitude: number) {
  return apiRequest<{ id: string; currentLatitude: number; currentLongitude: number; lastLocationUpdatedAt: string }>("/collections/location", { method: "PUT", body: JSON.stringify({ latitude, longitude }) });
}

export function recordCollectedWeight(requestId: string, actualKg: number) {
  return apiRequest<CollectionRecord>(`/collections/${encodeURIComponent(requestId)}/collect`, { method: "POST", body: JSON.stringify({ actualKg }) });
}

export function verifyCollectedWeight(requestId: string, verifiedKg: number) {
  return apiRequest<{ request: CollectionRecord; pointsAwarded: number; randValue: number; pointsPerKg: number }>(`/collections/${encodeURIComponent(requestId)}/verify`, { method: "POST", body: JSON.stringify({ verifiedKg }) });
}

export function getRecyclerRewards() {
  return apiRequest<RecyclerRewards>("/collections/rewards");
}

export function requestRewardRedemption(pointsCost: number) {
  return apiRequest<{ id: string; reference: string; pointsCost: number; valueCents: number; randValue: number; status: string }>("/collections/rewards/redemptions", { method: "POST", body: JSON.stringify({ pointsCost }) });
}

export function createUserReport(input: {
  type: "INCORRECT_INFORMATION" | "SUGGEST_NEW_FACILITY" | "COLLECTOR_PROBLEM" | "COLLECTION_PROBLEM" | "OTHER";
  description: string;
  suggestedName?: string;
  suggestedAddress?: string;
  suggestedLatitude?: number;
  suggestedLongitude?: number;
  suggestedAcceptedMaterials?: string[];
}) {
  return apiRequest<{ id: string; status: string }>("/collections/reports", { method: "POST", body: JSON.stringify(input) });
}

export function getAdminOverview() { return apiRequest<AdminOverview>("/admin/overview"); }
export function getAdminUsers(search = "") { return apiRequest<AdminUser[]>(`/admin/users?search=${encodeURIComponent(search)}`); }
export function setAdminUserStatus(userId: string, status: "ACTIVE" | "SUSPENDED", reason: string) {
  return apiRequest<{ id: string; status: string }>(`/admin/users/${encodeURIComponent(userId)}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
}
export function getAdminCollectors() { return apiRequest<AdminCollector[]>("/admin/collectors"); }
export function decideCollector(profileId: string, status: "APPROVED" | "REJECTED", reason?: string) {
  return apiRequest<{ id: string; approvalStatus: string }>(`/admin/collectors/${encodeURIComponent(profileId)}/approval`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
}
export function getAdminFacilities() { return apiRequest<AdminFacility[]>("/admin/facilities"); }
export function decideFacility(facilityId: string, status: "APPROVED" | "REJECTED", reason?: string) {
  return apiRequest<{ id: string; approvalStatus: string }>(`/admin/facilities/${encodeURIComponent(facilityId)}/approval`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
}
export function setAdminFacilityStatus(facilityId: string, status: "ACTIVE" | "SUSPENDED", reason: string) {
  return apiRequest<{ id: string; isSuspended: boolean }>(`/admin/facilities/${encodeURIComponent(facilityId)}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
}
export function getAdminRequests(status?: string) {
  return apiRequest<CollectionRecord[]>(`/admin/requests${status ? `?status=${encodeURIComponent(status)}` : ""}`);
}
export function getCollectorCandidates(requestId: string) {
  return apiRequest<CollectorCandidate[]>(`/admin/requests/${encodeURIComponent(requestId)}/candidates`);
}
export function assignCollector(requestId: string, collectorProfileId: string) {
  return apiRequest<CollectionRecord>(`/admin/requests/${encodeURIComponent(requestId)}/assign`, { method: "POST", body: JSON.stringify({ collectorProfileId }) });
}
export function getAdminActiveCollections() { return apiRequest<CollectionRecord[]>("/admin/active-collections"); }
export function getAdminVerificationQueue() { return apiRequest<CollectionRecord[]>("/admin/verification"); }
export function getMaterialRates() { return apiRequest<MaterialRate[]>("/admin/material-rates"); }
export function updateMaterialRate(materialId: string, pointsPerKg: number) {
  return apiRequest<MaterialRate>(`/admin/material-rates/${encodeURIComponent(materialId)}`, { method: "PUT", body: JSON.stringify({ pointsPerKg }) });
}
export function getAdminRedemptions() { return apiRequest<AdminRedemption[]>("/admin/redemptions"); }
export function decideRedemption(redemptionId: string, status: "APPROVED" | "REJECTED" | "FULFILLED", reason?: string) {
  return apiRequest<AdminRedemption>(`/admin/redemptions/${encodeURIComponent(redemptionId)}`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
}
export function getAdminAnalytics() { return apiRequest<AdminAnalytics>("/admin/analytics"); }
export function getAdminReports() { return apiRequest<AdminReport[]>("/admin/reports"); }
export function updateAdminReport(reportId: string, status: "UNDER_REVIEW" | "RESOLVED" | "REJECTED", reason?: string) {
  return apiRequest<AdminReport>(`/admin/reports/${encodeURIComponent(reportId)}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
}
export function getAdminNotifications() { return apiRequest<AdminNotification[]>("/admin/notifications"); }
export function markAdminNotification(notificationId: string, read: boolean) {
  return apiRequest<{ id: string; read: boolean }>(`/admin/notifications/${encodeURIComponent(notificationId)}`, { method: "PATCH", body: JSON.stringify({ read }) });
}
export function getAdminAudit() { return apiRequest<AdminAuditEntry[]>("/admin/audit"); }
