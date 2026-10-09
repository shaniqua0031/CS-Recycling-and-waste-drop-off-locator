import { apiRequest } from "./auth-api";

export type ApiCollectionStatus =
  | "PENDING"
  | "WAITING_FOR_ADMIN"
  | "SCHEDULED_MAINTENANCE"
  | "COLLECTOR_ASSIGNED"
  | "COLLECTOR_ON_THE_WAY"
  | "COLLECTOR_ARRIVED"
  | "COLLECTING"
  | "PAUSED"
  | "COLLECTED"
  | "VERIFICATION_PENDING"
  | "VERIFIED"
  | "COMPLETED"
  | "CANCELLED"
  | "REJECTED";

export type CollectionPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type CollectionRecord = {
  id: string;
  requesterId: string;
  destinationFacilityId: string | null;
  estimatedKg: number | string;
  requestedFor: string;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  notes?: string | null;
  estimatedEtaMinutes?: number | null;
  distanceKm?: number | null;
  priority?: CollectionPriority;
  createdAt: string;
  status: ApiCollectionStatus;
  requester?: { email: string; recyclerProfile?: { displayName: string } | null };
  material: { id: string; name: string };
  destinationFacility?: { id: string; name: string; address: string } | null;
  assignments: Array<{
    id: string;
    status: string;
    reason?: string | null;
    declineReasonCode?: string | null;
    assignedAt?: string;
    acceptedAt?: string | null;
    unassignedAt?: string | null;
    collector: {
      currentLatitude: number | null;
      currentLongitude: number | null;
      lastLocationUpdatedAt: string | null;
      user: { id: string; email: string; recyclerProfile?: { displayName: string } | null };
    };
  }>;
  statusEvents: Array<{ id: string; fromStatus: ApiCollectionStatus | null; toStatus: ApiCollectionStatus; note: string | null; createdAt: string }>;
  weight: { estimatedKg: number | string; actualKg: number | string | null; facilityReceivedKg?: number | string | null; receivedAt?: string | null; facilityCondition?: string | null; facilityNotes?: string | null; receivedBy?: { id: string; email: string } | null; verifiedKg: number | string | null; recordedAt?: string | null; verifiedAt?: string | null; verifiedBy?: { id: string; email: string } | null; notes?: string | null } | null;
  materialWeights?: Array<{
    materialId: string;
    actualKg: number | string;
    verifiedKg: number | string | null;
    recordedAt: string;
    material: { id: string; name: string };
  }>;
};

export type CollectorDashboard = {
  profile: {
    approvalStatus: string;
    availability: "AVAILABLE" | "UNAVAILABLE" | "ON_COLLECTION" | "OFFLINE";
    qualifiedMaterialIds: string[];
    currentLatitude: number | null;
    currentLongitude: number | null;
  };
  materials: Array<{ id: string; name: string }>;
  requests: CollectionRecord[];
  performance: {
    completedCollections: number;
    totalCollectedKg: number;
    todayCollectedKg: number;
    averageResponseTimeMinutes: number | null;
    averageCollectionDurationMinutes: number | null;
    declinedJobs: number;
    cancelledJobs: number;
    pausedJobs: number;
  };
  activeRequestId: string | null;
  notifications: UserNotification[];
};

export type AvailableFacility = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  acceptedMaterials: string[];
  openingHours: Array<{ dayOfWeek: number; opensAt: string | null; closesAt: string | null; isClosed: boolean }>;
  status: "OPEN" | "CLOSED";
  distanceKm: number | null;
  phone: string | null;
  email: string | null;
};

export type FacilityProfileRecord = {
  id: string;
  name: string;
  description: string | null;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  email: string | null;
  website: string | null;
  operationalStatus: "OPEN" | "CLOSED" | "TEMPORARILY_CLOSED" | "NEAR_CAPACITY" | "FULL";
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  isSuspended: boolean;
  membershipRole?: "OWNER" | "MANAGER" | "STAFF";
  acceptedMaterials: string[];
  materials: Array<{ id: string; name: string; capacityKg: number | null; currentKg: number }>;
  openingHours: AvailableFacility["openingHours"];
};

export type FacilityCapacityRecord = {
  materialId: string;
  material: string;
  currentKg: number;
  capacityKg: number | null;
  percentage: number | null;
  level: "UNCONFIGURED" | "NORMAL" | "NEAR_CAPACITY" | "CRITICAL";
};

export type FacilityOperationsDashboard = {
  facilities: Array<{ id: string; name: string; address: string; operationalStatus: FacilityProfileRecord["operationalStatus"]; membershipRole: "OWNER" | "MANAGER" | "STAFF" }>;
  facility: FacilityProfileRecord | null;
  collections: CollectionRecord[];
  capacity: FacilityCapacityRecord[];
  reports: Array<{ id: string; type: string; status: string; description: string; createdAt: string }>;
  incidents: Array<{ id: string; type: string; priority: string; details: string | null; material: { name: string } | null; createdAt: string; lastReportedAt: string }>;
  notifications: UserNotification[];
  summary: {
    todayIncomingCollections: number;
    todayReceivedKg: number;
    pendingDeliveries: number;
    totalKgReceived: number;
    materialTotals: Array<{ material: string; verifiedKg: number }>;
    collectionsReceived: number;
    averageDailyIntakeKg: number;
    capacityUsagePercent: number;
    verifiedCollectionCount: number;
  } | null;
};

export type RecyclerRewards = {
  pointsBalance: number;
  pointValueRand: number;
  rates: Array<{ material: string; pointsPerKg: number }>;
  rewards: Array<{ id: string; name: string; description: string; pointsCost: number; available: boolean }>;
  transactions: Array<{ id: string; type: string; pointsDelta: number; randValueCents: number; description: string | null; createdAt: string }>;
  redemptions: Array<{
    id: string;
    reference: string;
    type: "REWARD" | "ELECTRICITY";
    pointsCost: number;
    valueCents: number;
    status: string;
    rewardName: string | null;
    meterNumberMasked: string | null;
    createdAt: string;
  }>;
};

export type RecyclerSummary = {
  pendingRequests: number;
  completedCollections: number;
  totalRecycledKg: number;
  pointsBalance: number;
  impactByMaterial: Array<{ material: string; verifiedKg: number }>;
  activeRequest: { id: string; status: ApiCollectionStatus; material: string; pickupAddress: string } | null;
  recentNotifications: UserNotification[];
};

export type RecyclerProfileRecord = {
  displayName: string;
  email: string;
  phone: string | null;
  collectionAddress: string | null;
  collectionLatitude: number | null;
  collectionLongitude: number | null;
};

export type BufferedCollectionEvent = {
  id: string;
  status: "OPEN" | "RESOLVED" | "ACTIVATED";
  priority: "LOW";
  activateAt: string;
};

export type UserNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export type AdminOverview = {
  totalUsers: number;
  activeCollectors: number;
  onlineCollectors: number;
  facilities: number;
  activeFacilities: number;
  pendingRequests: number;
  activePickups: number;
  activeCollectionRequests: number;
  criticalIncidents: number;
  completedCollections: number;
  completedToday: number;
  pendingCollectorApprovals: number;
  pendingFacilityApprovals: number;
  totalRecycledKg: number;
  pointsIssued: number;
  pointsRedeemed: number;
  rewardsRedeemed: number;
};

export type AdminIncident = {
  id: string;
  type: string;
  priority: CollectionPriority;
  priorityScore: number;
  priorityFactors: {
    affectedUsers: number;
    facilityUrgency: number;
    proximity: number;
    proximitySource: "REGISTERED" | "REMOTE" | "UNKNOWN";
    hazardOverride: boolean;
    waitTime: number;
  } | null;
  priorityOverridden: boolean;
  priorityOverrideReason: string | null;
  priorityOverriddenAt: string | null;
  latitude: number;
  longitude: number;
  reportCount: number;
  communityVerified: boolean;
  firstReportedAt: string;
  lastReportedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  status: "OPEN" | "COMMUNITY_VERIFIED" | "RESOLVED";
  facility: { id: string; name: string; address: string } | null;
  material: { id: string; name: string } | null;
  assignedCollector: { id: string; displayName: string; availability: string } | null;
  reports: Array<{ id: string; description: string; createdAt: string; reporterName: string }>;
};

export type AdminMaintenanceWindow = {
  id: string;
  facilityId: string;
  startsAt: string;
  endsAt: string;
  gracePeriodMinutes: number;
  overrunEnabled: boolean;
  status: string;
  facility?: { id: string; name: string; address?: string };
  affectedRequests?: number;
};

export type AdminSensorEvent = {
  id: string;
  facilityId: string;
  reading: number;
  expiresAt: string;
  createdAt: string;
  facility: { id: string; name: string };
};

export type AdminSimulatorEvent = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
};

export type AdminSimulatorAction =
  | "INDIVIDUAL_PICKUP_REQUEST" | "BIN_FULL" | "COMPLETE_COLLECTION" | "RECORD_WEIGHT"
  | "ZONE_OVERFLOW" | "FACILITY_STORAGE_FULL" | "CREATE_COMMUNITY_REPORT" | "CREATE_DUPLICATE_REPORT"
  | "COLLECTOR_OFFLINE" | "COLLECTOR_ACCEPT" | "COLLECTOR_DECLINE" | "DRIVE_COLLECTOR_TO_SITE"
  | "FACILITY_FULL" | "FACILITY_MAINTENANCE" | "FACILITY_RECOVERED" | "START_SERVICE_PAUSE" | "ENABLE_OVERRUN"
  | "TRIGGER_SENSOR_SPIKE" | "RESET_SENSOR" | "SEED_DEMO_DATA" | "RESET_SIMULATION";

export type AdminUser = {
  id: string;
  email: string;
  role: "RECYCLER";
  status: "ACTIVE" | "SUSPENDED" | "PENDING_APPROVAL";
  displayName: string;
  collections: number;
  totalRecycledKg: number;
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
  completedJobs: number;
  declinedJobs: number;
  totalCollectedKg: number;
  averageResponseTimeMinutes: number | null;
};

export type AdminFacility = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  operationalStatus: "OPEN" | "CLOSED" | "TEMPORARILY_CLOSED" | "NEAR_CAPACITY" | "FULL";
  isSuspended: boolean;
  acceptedMaterials: string[];
  capacity: Array<{ materialId: string; material: string; capacityKg: number | null; currentKg: number; percentage: number | null; level: "UNCONFIGURED" | "NORMAL" | "NEAR_CAPACITY" | "CRITICAL" | "FULL" }>;
  incomingCollections: number;
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
  type: "REWARD" | "ELECTRICITY";
  pointsCost: number;
  valueCents: number;
  randValue: number;
  status: "REQUESTED" | "APPROVED" | "FULFILLED" | "REJECTED" | "CANCELLED";
  createdAt: string;
  meterNumberMasked: string | null;
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
  periodDays: 30;
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
  averageResolutionTimeHours: number | null;
  averageResponseTimeMinutes: number | null;
  incidentVolume: number;
  facilityActivity: Array<{ facilityId: string; facility: string; requestCount: number; verifiedKg: number }>;
};

export function getCollectionRequests() {
  return apiRequest<CollectionRecord[]>("/collections");
}

export function getCollectorDashboard() {
  return apiRequest<CollectorDashboard>("/collections/collector/dashboard");
}

export function updateCollectorProfile(input: { availability?: "AVAILABLE" | "ON_COLLECTION" | "OFFLINE" | "UNAVAILABLE"; qualifiedMaterialIds?: string[] }) {
  return apiRequest<Pick<CollectorDashboard["profile"], "approvalStatus" | "availability" | "qualifiedMaterialIds">>("/collections/collector/profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function getRecyclerSummary() {
  return apiRequest<RecyclerSummary>("/collections/summary");
}

export function getFacilityProfile(facilityId?: string) {
  return apiRequest<FacilityProfileRecord>(`/collections/facility-profile${facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : ""}`);
}
export function saveFacilityProfile(input: { facilityId?: string; name: string; address: string; description?: string | null; phone?: string | null; email?: string | null; website?: string | null; latitude?: number; longitude?: number; acceptedMaterials: string[]; openingHours: string[] }) {
  return apiRequest<FacilityProfileRecord>("/collections/facility-profile", { method: "PUT", body: JSON.stringify(input) });
}

export function getFacilityOperations(facilityId?: string) {
  return apiRequest<FacilityOperationsDashboard>(`/collections/facility/dashboard${facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : ""}`);
}

export function updateFacilityStatus(facilityId: string, status: "OPEN" | "CLOSED" | "TEMPORARILY_CLOSED") {
  return apiRequest<{ id: string; operationalStatus: FacilityProfileRecord["operationalStatus"] }>("/collections/facility/status", { method: "PATCH", body: JSON.stringify({ facilityId, status }) });
}

export function updateFacilityCapacity(input: { facilityId: string; materials: Array<{ materialId: string; capacityKg: number | null; currentKg: number }> }) {
  return apiRequest<Array<{ materialId: string; material: string; capacityKg: number | null; currentKg: number }>>("/collections/facility/capacity", { method: "PUT", body: JSON.stringify(input) });
}

export function createFacilityIncident(input: { facilityId: string; type: "EQUIPMENT_ISSUE" | "CAPACITY_PROBLEM" | "COLLECTION_PROBLEM" | "SAFETY_ISSUE" | "INCORRECT_MATERIAL" | "OTHER"; description: string }) {
  return apiRequest<FacilityOperationsDashboard["reports"][number]>("/collections/facility/incidents", { method: "POST", body: JSON.stringify(input) });
}

export function receiveFacilityCollection(requestId: string, input: { facilityId: string; receivedKg: number; condition: "ACCEPTABLE" | "CONTAMINATED" | "WRONG_MATERIAL" | "DAMAGED" | "OTHER"; notes?: string }) {
  return apiRequest<CollectionRecord>(`/collections/${encodeURIComponent(requestId)}/facility/receive`, { method: "POST", body: JSON.stringify(input) });
}

export function rejectFacilityCollection(requestId: string, input: { facilityId: string; reasonCode: "WRONG_MATERIAL" | "CONTAMINATED" | "FACILITY_FULL" | "UNSUPPORTED_MATERIAL" | "OTHER"; notes?: string }) {
  return apiRequest<CollectionRecord>(`/collections/${encodeURIComponent(requestId)}/facility/reject`, { method: "POST", body: JSON.stringify(input) });
}

export function markFacilityNotificationRead(facilityId: string, notificationId: string) {
  return apiRequest<{ id: string; read: boolean }>(`/collections/facility/notifications/${encodeURIComponent(notificationId)}/read?facilityId=${encodeURIComponent(facilityId)}`, { method: "POST" });
}

export function getAvailableFacilities(material: string) {
  return apiRequest<AvailableFacility[]>(`/collections/facilities${material && material !== "All materials" ? `?material=${encodeURIComponent(material)}` : ""}`);
}

export function searchAvailableFacilities(input: { query?: string; material?: string; latitude?: number; longitude?: number; maxDistanceKm?: number; openNow?: boolean } = {}) {
  const params = new URLSearchParams();
  if (input.query) params.set("query", input.query);
  if (input.material && input.material !== "All materials") params.set("material", input.material);
  if (input.latitude !== undefined && input.longitude !== undefined) {
    params.set("latitude", String(input.latitude));
    params.set("longitude", String(input.longitude));
  }
  if (input.maxDistanceKm !== undefined) params.set("maxDistanceKm", String(input.maxDistanceKm));
  if (input.openNow !== undefined) params.set("openNow", String(input.openNow));
  return apiRequest<AvailableFacility[]>(`/collections/facilities${params.size ? `?${params}` : ""}`);
}

export function createCollectionRequest(input: {
  material: string;
  destinationFacilityId: string;
  estimatedKg: number;
  requestedFor: string;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  notes?: string;
}) {
  return apiRequest<CollectionRecord>("/collections", { method: "POST", body: JSON.stringify(input) });
}

export function createBufferedCollectionEvent(input: Parameters<typeof createCollectionRequest>[0] & { idempotencyKey: string }) {
  return apiRequest<BufferedCollectionEvent>("/collections/buffered-events", { method: "POST", body: JSON.stringify(input) });
}

export function getBufferedCollectionEvents() {
  return apiRequest<BufferedCollectionEvent[]>("/collections/buffered-events");
}

export function resolveBufferedCollectionEvent(eventId: string) {
  return apiRequest<{ id: string; status: "RESOLVED" }>(`/collections/buffered-events/${encodeURIComponent(eventId)}/resolve`, { method: "POST" });
}

export function acceptCollection(requestId: string) {
  return apiRequest<CollectionRecord>(`/collections/${encodeURIComponent(requestId)}/accept`, { method: "POST" });
}

export function declineCollection(requestId: string, reasonCode: string, explanation?: string) {
  return apiRequest<CollectionRecord>(`/collections/${encodeURIComponent(requestId)}/decline`, { method: "POST", body: JSON.stringify({ reasonCode, ...(explanation ? { explanation } : {}) }) });
}

export function updateCollectionProgress(requestId: string, action: "ARRIVED" | "START" | "PAUSE" | "RESUME", details?: { delayCode?: string; explanation?: string }) {
  return apiRequest<CollectionRecord>(`/collections/${encodeURIComponent(requestId)}/progress`, { method: "POST", body: JSON.stringify({ action, ...details }) });
}

export function updateCollectorLocation(latitude: number, longitude: number) {
  return apiRequest<{ id: string; currentLatitude: number; currentLongitude: number; lastLocationUpdatedAt: string }>("/collections/location", { method: "PUT", body: JSON.stringify({ latitude, longitude }) });
}

export function recordCollectedWeight(requestId: string, input: number | { materials: Array<{ materialId: string; actualKg: number }>; notes?: string }) {
  return apiRequest<CollectionRecord>(`/collections/${encodeURIComponent(requestId)}/collect`, { method: "POST", body: JSON.stringify(typeof input === "number" ? { actualKg: input } : input) });
}

export function verifyCollectedWeight(requestId: string, input: number | { materials: Array<{ materialId: string; verifiedKg: number }> }) {
  return apiRequest<{ request: CollectionRecord; pointsAwarded: number; randValue: number; pointsPerKg: number }>(`/collections/${encodeURIComponent(requestId)}/verify`, { method: "POST", body: JSON.stringify(typeof input === "number" ? { verifiedKg: input } : input) });
}

export function getRecyclerRewards() {
  return apiRequest<RecyclerRewards>("/collections/rewards");
}

export function redeemReward(rewardId: string, idempotencyKey: string) {
  return apiRequest<{ id: string; reference: string; type: "REWARD"; pointsCost: number; valueCents: number; randValue: number; status: string; rewardName: string | null }>("/collections/rewards/redemptions", { method: "POST", body: JSON.stringify({ rewardId, idempotencyKey }) });
}

export function requestElectricityRedemption(pointsCost: number, meterNumber: string) {
  return apiRequest<{ id: string; reference: string; type: "ELECTRICITY"; pointsCost: number; valueCents: number; randValue: number; status: string }>("/collections/rewards/redemptions/electricity", { method: "POST", body: JSON.stringify({ pointsCost, meterNumber }) });
}

export function getUserNotifications() {
  return apiRequest<UserNotification[]>("/collections/notifications");
}

export function markUserNotificationRead(notificationId: string) {
  return apiRequest<{ id: string; read: boolean }>(`/collections/notifications/${encodeURIComponent(notificationId)}/read`, { method: "POST" });
}

export function getRecyclerProfile() {
  return apiRequest<RecyclerProfileRecord>("/users/me/profile");
}

export function updateRecyclerProfile(input: Partial<RecyclerProfileRecord>) {
  return apiRequest<RecyclerProfileRecord>("/users/me/profile", { method: "PATCH", body: JSON.stringify(input) });
}

export function changeRecyclerPassword(currentPassword: string, newPassword: string) {
  return apiRequest<{ passwordUpdated: boolean; otherSessionsRevoked: boolean }>("/users/me/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
}

export function createUserReport(input: {
  type: "INCORRECT_INFORMATION" | "SUGGEST_NEW_FACILITY" | "COLLECTOR_PROBLEM" | "COLLECTION_PROBLEM" | "OVERFLOWING_BIN" | "OVERFLOWING_DROP_OFF" | "FACILITY_FULL" | "FACILITY_CLOSED" | "INCORRECT_OPENING_HOURS" | "ILLEGAL_DUMPING" | "BROKEN_GLASS" | "HAZARDOUS_WASTE" | "SAFETY_ISSUE" | "OTHER";
  description: string;
  facilityId?: string;
  latitude?: number;
  longitude?: number;
  suggestedName?: string;
  suggestedAddress?: string;
  suggestedLatitude?: number;
  suggestedLongitude?: number;
  suggestedAcceptedMaterials?: string[];
}) {
  return apiRequest<{ id: string; status: string; incident: { id: string; reportCount: number; communityVerified: boolean; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } | null }>("/collections/reports", { method: "POST", body: JSON.stringify(input) });
}

export function getAdminOverview() { return apiRequest<AdminOverview>("/admin/overview"); }
export function getAdminMaintenanceWindows() { return apiRequest<AdminMaintenanceWindow[]>("/admin/maintenance-windows"); }
export function scheduleAdminMaintenance(input: { facilityId: string; startsAt: string; endsAt: string; gracePeriodMinutes: number }) {
  return apiRequest<AdminMaintenanceWindow & { affectedRequests: number }>("/admin/maintenance-windows", { method: "POST", body: JSON.stringify(input) });
}
export function setAdminMaintenanceOverrun(windowId: string, enabled: boolean) {
  return apiRequest<AdminMaintenanceWindow>(`/admin/maintenance-windows/${encodeURIComponent(windowId)}/overrun`, { method: "PATCH", body: JSON.stringify({ enabled }) });
}
export function getAdminSensors(facilityId?: string) {
  return apiRequest<AdminSensorEvent[]>(`/admin/sensors${facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : ""}`);
}
export function triggerAdminSensorSpike(facilityId: string, reading: number) {
  return apiRequest<AdminSensorEvent>("/admin/sensors/spike", { method: "POST", body: JSON.stringify({ facilityId, reading }) });
}
export function resetAdminSensors(facilityId: string) {
  return apiRequest<{ facilityId: string; resetCount: number }>("/admin/sensors/reset", { method: "POST", body: JSON.stringify({ facilityId }) });
}
export function getAdminSimulatorEvents() { return apiRequest<AdminSimulatorEvent[]>("/admin/simulator/events"); }
export function performAdminSimulatorAction(input: { action: AdminSimulatorAction; facilityId?: string; collectorProfileId?: string; requestId?: string; startsAt?: string; endsAt?: string; gracePeriodMinutes?: number; actualKg?: number }) {
  return apiRequest<AdminSimulatorEvent>("/admin/simulator/actions", { method: "POST", body: JSON.stringify(input) });
}
export function getAdminIncidents(status = "OPEN") { return apiRequest<AdminIncident[]>(`/admin/incidents?status=${encodeURIComponent(status)}`); }
export function updateAdminIncidentPriority(incidentId: string, priority: CollectionPriority, reason: string) {
  return apiRequest<AdminIncident>(`/admin/incidents/${encodeURIComponent(incidentId)}/priority`, { method: "PATCH", body: JSON.stringify({ priority, reason }) });
}
export function assignAdminIncident(incidentId: string, collectorProfileId: string) {
  return apiRequest<AdminIncident>(`/admin/incidents/${encodeURIComponent(incidentId)}/assignment`, { method: "PATCH", body: JSON.stringify({ collectorProfileId }) });
}
export function updateAdminIncidentStatus(incidentId: string, status: "RESOLVED" | "REOPENED", reason: string) {
  return apiRequest<AdminIncident>(`/admin/incidents/${encodeURIComponent(incidentId)}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
}
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

export function cancelAdminCollectionRequest(requestId: string, reason: string) {
  return apiRequest<CollectionRecord>(`/admin/requests/${encodeURIComponent(requestId)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function updateCollectionPriority(requestId: string, priority: CollectionPriority, reason: string) {
  return apiRequest<CollectionRecord>(`/admin/requests/${encodeURIComponent(requestId)}/priority`, { method: "PATCH", body: JSON.stringify({ priority, reason }) });
}

export function sendCollectorMessage(profileId: string, message: string) {
  return apiRequest<{ sent: boolean; profileId: string }>(`/admin/collectors/${encodeURIComponent(profileId)}/messages`, { method: "POST", body: JSON.stringify({ message }) });
}

export function sendFacilityMessage(facilityId: string, message: string) {
  return apiRequest<{ sent: boolean; facilityId: string }>(`/admin/facilities/${encodeURIComponent(facilityId)}/message`, { method: "POST", body: JSON.stringify({ message }) });
}

export function cancelCollection(requestId: string, reason?: string) {
  return apiRequest<CollectionRecord>(`/collections/${encodeURIComponent(requestId)}/cancel`, { method: "POST", body: JSON.stringify(reason ? { reason } : {}) });
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
export function getAdminAnalytics() { return apiRequest<AdminAnalytics>("/admin/analytics/30-days"); }
export function getAdminReports() { return apiRequest<AdminReport[]>("/admin/reports"); }
export function updateAdminReport(reportId: string, status: "UNDER_REVIEW" | "RESOLVED" | "REJECTED", reason?: string) {
  return apiRequest<AdminReport>(`/admin/reports/${encodeURIComponent(reportId)}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
}
export function getAdminNotifications() { return apiRequest<AdminNotification[]>("/admin/notifications"); }
export function markAdminNotification(notificationId: string, read: boolean) {
  return apiRequest<{ id: string; read: boolean }>(`/admin/notifications/${encodeURIComponent(notificationId)}`, { method: "PATCH", body: JSON.stringify({ read }) });
}
export function getAdminAudit() { return apiRequest<AdminAuditEntry[]>("/admin/audit"); }
