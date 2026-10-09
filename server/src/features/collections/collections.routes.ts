import { randomUUID } from "node:crypto";
import { Router, type Request, type RequestHandler, type Response } from "express";
import {
  AccountStatus,
  ApprovalStatus,
  AssignmentStatus,
  CollectionStatus,
  CollectorAvailability,
  FacilityMembershipRole,
  FacilityOperationalStatus,
  Prisma,
  RedemptionType,
  ReportType,
  RedemptionStatus,
  RewardTransactionType,
  UserRole,
} from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuthentication } from "../../middleware/authenticate";
import { validateBody } from "../../middleware/validate-body";
import { ApiError } from "../../utils/api-error";
import { bufferedCollectionEventSchema, collectionCancellationSchema, collectionRequestSchema, collectedWeightSchema, collectorAvailabilitySchema, collectorDeclineSchema, collectorLocationSchema, collectorProgressSchema, electricityRedemptionSchema, facilityCapacitySchema, facilityDashboardQuerySchema, facilityIncidentSchema, facilityProfileSchema, facilityReceiveSchema, facilityRejectSchema, facilitySearchSchema, facilityStatusSchema, reportSubmissionSchema, rewardOptionRedemptionSchema, rewardRedemptionSchema, verifiedWeightSchema } from "./collections.schemas";
import { distanceBetweenKm } from "../../utils/geo";
import { calculateIncidentPriorityScore, redactCollectorCoordinates, shouldGroupIncident } from "./citizen.logic";
import { getFacilityCapacityLevel, statusForCapacity } from "./facility-operations.logic";
import { orderCollectionRequestsByPriority, rankCollectorCandidates, type CollectorCandidateInput } from "../admin/admin.logic";

export const collectionsRouter = Router();
const activeAssignmentStatuses = [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED];

function asyncHandler(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

function pathParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== "string" || !value) throw new ApiError(400, "INVALID_PATH", "A required path value is missing.");
  return value;
}

function requireFacility(request: Request) {
  if (request.auth!.role !== UserRole.FACILITY) throw new ApiError(403, "FORBIDDEN", "Only Facility accounts can perform this action.");
  return request.auth!.userId;
}

async function facilityMembership(userId: string, facilityId: string) {
  const membership = await prisma.facilityMembership.findUnique({ where: { facilityId_userId: { facilityId, userId } } });
  if (!membership) throw new ApiError(403, "FACILITY_MISMATCH", "You do not have access to this facility.");
  return membership;
}

function requireFacilityManager(role: FacilityMembershipRole) {
  if (role !== FacilityMembershipRole.OWNER && role !== FacilityMembershipRole.MANAGER) {
    throw new ApiError(403, "FACILITY_PERMISSION_REQUIRED", "Only Facility owners and managers can change facility settings.");
  }
}

async function selectedFacilityMembership(userId: string, requestedFacilityId?: string) {
  if (requestedFacilityId) return facilityMembership(userId, requestedFacilityId);
  const memberships = await prisma.facilityMembership.findMany({ where: { userId }, take: 2, orderBy: { createdAt: "asc" } });
  if (!memberships.length) throw new ApiError(404, "FACILITY_PROFILE_NOT_FOUND", "No facility profile is linked to this account.");
  if (memberships.length > 1) throw new ApiError(400, "FACILITY_SELECTION_REQUIRED", "Select a facility before continuing.");
  return memberships[0];
}

function requireRecycler(request: Request) {
  if (request.auth!.role !== UserRole.RECYCLER) throw new ApiError(403, "FORBIDDEN", "Only Recycler accounts can perform this action.");
  return request.auth!.userId;
}

function requireCollector(request: Request) {
  if (request.auth!.role !== UserRole.COLLECTOR) throw new ApiError(403, "FORBIDDEN", "Only Collector accounts can perform this action.");
  return request.auth!.userId;
}

function requireNotificationOwner(request: Request) {
  if (request.auth!.role !== UserRole.RECYCLER && request.auth!.role !== UserRole.COLLECTOR) {
    throw new ApiError(403, "FORBIDDEN", "Only Recycler and Collector accounts can access personal notifications.");
  }
  return request.auth!.userId;
}

function currentFacilityOpen(hours: Array<{ dayOfWeek: number; opensAt: string | null; closesAt: string | null; isClosed: boolean }>) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const dayOfWeek = weekdays.indexOf(part("weekday"));
  const currentTime = `${part("hour")}:${part("minute")}`;
  const today = hours.find((hour) => hour.dayOfWeek === dayOfWeek);
  return Boolean(today && !today.isClosed && today.opensAt && today.closesAt && currentTime >= today.opensAt && currentTime < today.closesAt);
}

function requestInclude(includeCompletedAssignments = false, collectorUserId?: string) {
  return {
    requester: { include: { recyclerProfile: true } },
    material: true,
    destinationFacility: true,
    assignments: {
      where: collectorUserId
        ? { collector: { userId: collectorUserId } }
        : { status: { in: includeCompletedAssignments ? [...activeAssignmentStatuses, AssignmentStatus.COMPLETED] : activeAssignmentStatuses } },
      include: { collector: { include: { user: { include: { recyclerProfile: true } } } } },
      orderBy: { assignedAt: "desc" as const },
    },
    statusEvents: { orderBy: { createdAt: "desc" as const }, take: 20 },
    weight: { include: { receivedBy: { select: { id: true, email: true } }, verifiedBy: { select: { id: true, email: true } } } },
    materialWeights: { include: { material: true }, orderBy: { recordedAt: "asc" as const } },
  };
}

async function notifyAdmins(type: "COLLECTION_REQUEST_CREATED" | "COLLECTOR_ASSIGNED" | "COLLECTOR_REGISTRATION" | "COLLECTOR_DECLINED" | "REPORT_SUBMITTED", title: string, body: string) {
  const admins = await prisma.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
  if (admins.length) {
    await prisma.notification.createMany({ data: admins.map(({ id }) => ({ userId: id, type, title, body })) });
  }
}

async function notifyActiveCollectorsOfFacilityIssue(transaction: Prisma.TransactionClient, facilityId: string, reportId: string) {
  const affectedAssignments = await transaction.collectionAssignment.findMany({
    where: {
      status: { in: activeAssignmentStatuses },
      request: {
        destinationFacilityId: facilityId,
        status: { in: [CollectionStatus.COLLECTOR_ASSIGNED, CollectionStatus.COLLECTOR_ON_THE_WAY, CollectionStatus.COLLECTOR_ARRIVED] },
      },
    },
    select: { requestId: true, collector: { select: { userId: true } } },
  });
  if (affectedAssignments.length) await transaction.notification.createMany({
    data: affectedAssignments.map((assignment) => ({
      userId: assignment.collector.userId,
      type: "FACILITY_ISSUE",
      title: "Facility issue reported",
      body: "A reported issue may affect a facility on one of your active jobs. Check the pickup details before traveling.",
      metadata: { reportId, requestId: assignment.requestId, facilityId },
    })),
  });
}

export async function dispatchWaitingCollections() {
  await prisma.$transaction(async (transaction) => {
    const waitingRequests = await transaction.collectionRequest.findMany({
      where: { status: CollectionStatus.WAITING_FOR_ADMIN },
      orderBy: { createdAt: "asc" },
    });
    for (const collectionRequest of orderCollectionRequestsByPriority(waitingRequests)) {
      const declinedAssignments = await transaction.collectionAssignment.findMany({
        where: { requestId: collectionRequest.id, status: AssignmentStatus.DECLINED },
        select: { collectorProfileId: true },
      });
      const profiles = await transaction.collectorProfile.findMany({
        where: {
          id: { notIn: declinedAssignments.map((assignment) => assignment.collectorProfileId) },
          approvalStatus: ApprovalStatus.APPROVED,
          availability: CollectorAvailability.AVAILABLE,
          qualifiedMaterialIds: { has: collectionRequest.materialId },
          user: { status: AccountStatus.ACTIVE },
        },
        include: {
          user: { include: { recyclerProfile: true } },
          assignments: { where: { status: { in: activeAssignmentStatuses } }, select: { id: true } },
        },
      });
      const candidates: CollectorCandidateInput[] = profiles.map((profile) => ({
        profileId: profile.id,
        userId: profile.userId,
        displayName: profile.user.recyclerProfile?.displayName ?? null,
        email: profile.user.email,
        accountStatus: profile.user.status,
        approvalStatus: profile.approvalStatus,
        availability: profile.availability,
        serviceRadiusKm: profile.serviceRadiusKm,
        serviceCenterLatitude: profile.serviceCenterLatitude,
        serviceCenterLongitude: profile.serviceCenterLongitude,
        currentLatitude: profile.currentLatitude,
        currentLongitude: profile.currentLongitude,
        lastLocationUpdatedAt: profile.lastLocationUpdatedAt,
        activeWorkload: profile.assignments.length,
        qualifiedMaterialIds: profile.qualifiedMaterialIds,
      }));
      const ranked = rankCollectorCandidates(
        { latitude: collectionRequest.pickupLatitude, longitude: collectionRequest.pickupLongitude },
        candidates,
        { requiredMaterialId: collectionRequest.materialId },
      );

      for (const candidate of ranked) {
        const collectorChanged = await transaction.collectorProfile.updateMany({
          where: { id: candidate.profileId, availability: CollectorAvailability.AVAILABLE },
          data: { availability: CollectorAvailability.ON_COLLECTION },
        });
        if (collectorChanged.count !== 1) continue;
        const requestChanged = await transaction.collectionRequest.updateMany({
          where: { id: collectionRequest.id, status: CollectionStatus.WAITING_FOR_ADMIN },
          data: { status: CollectionStatus.COLLECTOR_ASSIGNED },
        });
        if (requestChanged.count !== 1) {
          await transaction.collectorProfile.updateMany({ where: { id: candidate.profileId, availability: CollectorAvailability.ON_COLLECTION }, data: { availability: CollectorAvailability.AVAILABLE } });
          break;
        }

        await transaction.collectionAssignment.create({
          data: { requestId: collectionRequest.id, collectorProfileId: candidate.profileId, assignedByUserId: null },
        });
        await transaction.collectionStatusEvent.create({
          data: {
            requestId: collectionRequest.id,
            toStatus: CollectionStatus.COLLECTOR_ASSIGNED,
            note: `Automatically assigned to the closest qualified available collector (${candidate.distanceKm.toFixed(1)} km).`,
          },
        });
        await transaction.notification.createMany({
          data: [
            { userId: collectionRequest.requesterId, type: "COLLECTOR_ASSIGNED", title: "Collector assigned", body: "A qualified collector was assigned to your collection.", metadata: { requestId: collectionRequest.id } },
            { userId: candidate.userId, type: "COLLECTOR_ASSIGNED", title: "New collection assignment", body: `A ${collectionRequest.priority.toLowerCase()} priority collection is ready for your response.`, metadata: { requestId: collectionRequest.id } },
          ],
        });
        const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
        if (admins.length) await transaction.notification.createMany({
          data: admins.map(({ id }) => ({ userId: id, type: "COLLECTOR_ASSIGNED", title: "Collection automatically assigned", body: `Request ${collectionRequest.id.slice(-8)} was automatically assigned.`, metadata: { requestId: collectionRequest.id } })),
        });
        break;
      }
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

collectionsRouter.use(requireAuthentication);

collectionsRouter.get("/collector/dashboard", asyncHandler(async (request, response) => {
  const userId = requireCollector(request);
  const profile = await prisma.collectorProfile.findUnique({
    where: { userId },
    include: { user: { include: { recyclerProfile: true } } },
  });
  if (!profile) throw new ApiError(404, "COLLECTOR_PROFILE_NOT_FOUND", "No collector profile is linked to this account.");
  const [assignments, materials, notifications] = await Promise.all([
    prisma.collectionAssignment.findMany({
      where: { collectorProfileId: profile.id },
      include: {
        request: {
          include: {
            requester: { include: { recyclerProfile: true } },
            material: true,
            destinationFacility: true,
            weight: true,
            materialWeights: { include: { material: true }, orderBy: { recordedAt: "asc" } },
            statusEvents: { orderBy: { createdAt: "asc" } },
          },
        },
      },
      orderBy: { assignedAt: "desc" },
      take: 200,
    }),
    prisma.material.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  const hasRecentCollectorLocation = profile.lastLocationUpdatedAt !== null
    && Date.now() - profile.lastLocationUpdatedAt.getTime() <= 30 * 60 * 1000
    && profile.currentLatitude !== null
    && profile.currentLongitude !== null;
  const collectorLocation = hasRecentCollectorLocation
    ? { latitude: profile.currentLatitude!, longitude: profile.currentLongitude! }
    : profile.serviceCenterLatitude !== null && profile.serviceCenterLongitude !== null
      ? { latitude: profile.serviceCenterLatitude, longitude: profile.serviceCenterLongitude }
      : null;
  const history = assignments.map((assignment) => ({
    ...assignment.request,
    distanceKm: collectorLocation ? distanceBetweenKm(collectorLocation, { latitude: assignment.request.pickupLatitude, longitude: assignment.request.pickupLongitude }) : null,
    assignments: [{
      id: assignment.id,
      status: assignment.status,
      reason: assignment.reason,
      declineReasonCode: assignment.declineReasonCode,
      assignedAt: assignment.assignedAt,
      acceptedAt: assignment.acceptedAt,
      unassignedAt: assignment.unassignedAt,
      collector: {
        currentLatitude: profile.currentLatitude,
        currentLongitude: profile.currentLongitude,
        lastLocationUpdatedAt: profile.lastLocationUpdatedAt,
        user: { id: profile.userId, email: profile.user.email, recyclerProfile: profile.user.recyclerProfile },
      },
    }],
  }));
  const completedAssignments = assignments.filter((assignment) => assignment.status === AssignmentStatus.COMPLETED);
  const collectedKg = (assignment: (typeof assignments)[number]) => assignment.request.materialWeights.length
    ? assignment.request.materialWeights.reduce((sum, item) => sum + Number(item.actualKg), 0)
    : Number(assignment.request.weight?.actualKg ?? 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const responseTimes = assignments.flatMap((assignment) => assignment.acceptedAt
    ? [(assignment.acceptedAt.getTime() - assignment.assignedAt.getTime()) / 60000]
    : []);
  const durations = completedAssignments.flatMap((assignment) => {
    const started = assignment.request.statusEvents.find((event) => event.toStatus === CollectionStatus.COLLECTING);
    const completed = assignment.request.statusEvents.find((event) => event.toStatus === CollectionStatus.VERIFICATION_PENDING);
    return started && completed && completed.createdAt >= started.createdAt
      ? [(completed.createdAt.getTime() - started.createdAt.getTime()) / 60000]
      : [];
  });
  const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  const activeStatuses = new Set<CollectionStatus>([
    CollectionStatus.COLLECTOR_ASSIGNED,
    CollectionStatus.COLLECTOR_ON_THE_WAY,
    CollectionStatus.COLLECTOR_ARRIVED,
    CollectionStatus.COLLECTING,
    CollectionStatus.PAUSED,
  ]);

  response.json({ data: {
    profile: {
      approvalStatus: profile.approvalStatus,
      availability: profile.availability,
      qualifiedMaterialIds: profile.qualifiedMaterialIds,
      currentLatitude: profile.currentLatitude,
      currentLongitude: profile.currentLongitude,
    },
    materials,
    requests: history,
    performance: {
      completedCollections: completedAssignments.length,
      totalCollectedKg: completedAssignments.reduce((sum, assignment) => sum + collectedKg(assignment), 0),
      todayCollectedKg: completedAssignments.filter((assignment) => (assignment.request.weight?.recordedAt ?? assignment.assignedAt) >= today).reduce((sum, assignment) => sum + collectedKg(assignment), 0),
      averageResponseTimeMinutes: average(responseTimes),
      averageCollectionDurationMinutes: average(durations),
      declinedJobs: assignments.filter((assignment) => assignment.status === AssignmentStatus.DECLINED).length,
      cancelledJobs: assignments.filter((assignment) => assignment.status === AssignmentStatus.REVOKED || assignment.request.status === CollectionStatus.CANCELLED).length,
      pausedJobs: assignments.filter((assignment) => assignment.request.statusEvents.some((event) => event.toStatus === CollectionStatus.PAUSED)).length,
    },
    activeRequestId: history.find((item) => activeStatuses.has(item.status))?.id ?? null,
    notifications,
  } });
}));

collectionsRouter.put("/collector/profile", validateBody(collectorAvailabilitySchema), asyncHandler(async (request, response) => {
  const userId = requireCollector(request);
  const input = collectorAvailabilitySchema.parse(request.body);
  const profile = await prisma.collectorProfile.findUnique({ where: { userId } });
  if (!profile) throw new ApiError(404, "COLLECTOR_PROFILE_NOT_FOUND", "No collector profile is linked to this account.");

  if (input.qualifiedMaterialIds) {
    const selectedIds = new Set(input.qualifiedMaterialIds);
    if (selectedIds.size !== input.qualifiedMaterialIds.length) throw new ApiError(400, "DUPLICATE_MATERIAL", "Each qualified material can only be selected once.");
    const activeMaterials = await prisma.material.count({ where: { id: { in: input.qualifiedMaterialIds }, isActive: true } });
    if (activeMaterials !== input.qualifiedMaterialIds.length) throw new ApiError(400, "UNKNOWN_MATERIAL", "Select only active materials.");
  }

  const activeAssignments = await prisma.collectionAssignment.count({
    where: { collectorProfileId: profile.id, status: { in: activeAssignmentStatuses } },
  });
  const availability = input.availability === "AVAILABLE" && activeAssignments > 0
    ? CollectorAvailability.ON_COLLECTION
    : input.availability as CollectorAvailability | undefined;
  if (availability === CollectorAvailability.AVAILABLE && profile.approvalStatus !== ApprovalStatus.APPROVED) {
    throw new ApiError(403, "COLLECTOR_NOT_APPROVED", "Your collector profile must be approved before going online.");
  }
  const updated = await prisma.collectorProfile.update({
    where: { id: profile.id },
    data: {
      ...(availability ? { availability } : {}),
      ...(input.qualifiedMaterialIds ? { qualifiedMaterialIds: input.qualifiedMaterialIds } : {}),
    },
    select: { availability: true, approvalStatus: true, qualifiedMaterialIds: true },
  });
  if ((updated.availability === CollectorAvailability.OFFLINE || updated.availability === CollectorAvailability.UNAVAILABLE) && profile.availability !== updated.availability) {
    await notifyAdmins("COLLECTOR_REGISTRATION", "Collector unavailable", `${request.auth!.displayName ?? request.auth!.email} is now ${updated.availability.toLowerCase().replaceAll("_", " ")}.`);
  }
  if (updated.availability === CollectorAvailability.AVAILABLE) await dispatchWaitingCollections();
  response.json({ data: updated });
}));

function facilityProfileResult(facility: {
  id: string;
  name: string;
  description: string | null;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  email: string | null;
  website: string | null;
  operationalStatus: FacilityOperationalStatus;
  approvalStatus: ApprovalStatus;
  isSuspended: boolean;
  materials: Array<{ material: { id: string; name: string }; capacityKg: Prisma.Decimal | null; currentKg: Prisma.Decimal }>;
  openingHours: Array<{ dayOfWeek: number; opensAt: string | null; closesAt: string | null; isClosed: boolean }>;
}, role?: FacilityMembershipRole) {
  return {
    id: facility.id,
    name: facility.name,
    description: facility.description,
    address: facility.address,
    latitude: facility.latitude,
    longitude: facility.longitude,
    phone: facility.phone,
    email: facility.email,
    website: facility.website,
    operationalStatus: facility.operationalStatus,
    approvalStatus: facility.approvalStatus,
    isSuspended: facility.isSuspended,
    ...(role ? { membershipRole: role } : {}),
    acceptedMaterials: facility.materials.map((entry) => entry.material.name),
    materials: facility.materials.map((entry) => ({
      id: entry.material.id,
      name: entry.material.name,
      capacityKg: entry.capacityKg === null ? null : Number(entry.capacityKg),
      currentKg: Number(entry.currentKg),
    })),
    openingHours: facility.openingHours,
  };
}

function southAfricanDayBounds(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "0";
  const localMidnightUtc = Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day"))) - 2 * 60 * 60 * 1000;
  return { start: new Date(localMidnightUtc), end: new Date(localMidnightUtc + 24 * 60 * 60 * 1000) };
}

async function refreshFacilityCapacity(transaction: Prisma.TransactionClient, facilityId: string) {
  const facility = await transaction.facility.findUnique({
    where: { id: facilityId },
    include: { materials: { include: { material: true } }, memberships: { select: { userId: true } } },
  });
  if (!facility) return;

  let maximumPercentage = 0;
  const now = new Date();
  for (const link of facility.materials) {
    const capacityKg = link.capacityKg === null ? null : Number(link.capacityKg);
    const currentKg = Number(link.currentKg);
    const level = getFacilityCapacityLevel(currentKg, capacityKg);
    const percentage = capacityKg && capacityKg > 0 ? currentKg / capacityKg * 100 : 0;
    maximumPercentage = Math.max(maximumPercentage, percentage);
    const dedupeKey = `capacity:${facilityId}:${link.materialId}`;
    const existing = await transaction.incident.findUnique({ where: { dedupeKey } });
    if (level === "UNCONFIGURED" || level === "NORMAL") {
      if (existing) await transaction.incident.update({ where: { id: existing.id }, data: { resolvedAt: now, dedupeKey: null } });
      continue;
    }

    const priority = level === "CRITICAL" ? "CRITICAL" as const : "HIGH" as const;
    const details = `${link.material.name} storage is ${Math.round(percentage)}% full.`;
    const incident = existing
      ? await transaction.incident.update({ where: { id: existing.id }, data: { priority, details, lastReportedAt: now } })
      : await transaction.incident.create({ data: {
        type: ReportType.CAPACITY_PROBLEM,
        priority,
        facilityId,
        materialId: link.materialId,
        details,
        dedupeKey,
        latitude: facility.latitude,
        longitude: facility.longitude,
        reportCount: 1,
      } });
    const crossedCritical = level === "CRITICAL" && existing?.priority !== "CRITICAL";
    if (!existing || crossedCritical) {
      const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
      const type = level === "CRITICAL" ? "FACILITY_FULL" as const : "CAPACITY_WARNING" as const;
      const title = level === "CRITICAL" ? "Facility capacity critical" : "Facility nearing capacity";
      const body = `${facility.name}: ${details}`;
      const recipients = [...facility.memberships, ...admins.map(({ id }) => ({ userId: id }))];
      if (recipients.length) await transaction.notification.createMany({ data: recipients.map(({ userId }) => ({
        userId,
        facilityId,
        type,
        title,
        body,
        metadata: { incidentId: incident.id, materialId: link.materialId, percentage },
      })) });
    }
  }

  const nextStatus = statusForCapacity(facility.operationalStatus, maximumPercentage);
  if (nextStatus !== facility.operationalStatus) {
    await transaction.facility.update({ where: { id: facilityId }, data: { operationalStatus: nextStatus } });
  }
}

collectionsRouter.get("/facility-profile", asyncHandler(async (request, response) => {
  const userId = requireFacility(request);
  const query = facilityDashboardQuerySchema.parse(request.query);
  const membership = await selectedFacilityMembership(userId, query.facilityId);
  const facility = await prisma.facility.findUniqueOrThrow({
    where: { id: membership.facilityId },
    include: { materials: { include: { material: true } }, openingHours: { orderBy: { dayOfWeek: "asc" } } },
  });
  response.json({ data: facilityProfileResult(facility, membership.role) });
}));

collectionsRouter.put("/facility-profile", validateBody(facilityProfileSchema), asyncHandler(async (request, response) => {
  const userId = requireFacility(request);
  const input = facilityProfileSchema.parse(request.body);
  const membership = await selectedFacilityMembership(userId, input.facilityId);
  requireFacilityManager(membership.role);

  const profile = await prisma.$transaction(async (transaction) => {
    const materialRecords = await Promise.all(input.acceptedMaterials.map((name) => {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return transaction.material.upsert({ where: { slug }, update: { isActive: true }, create: { slug, name } });
    }));
    const materialIds = materialRecords.map((material) => material.id);
    await transaction.facility.update({ where: { id: membership.facilityId }, data: {
      name: input.name,
      address: input.address,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude, longitude: input.longitude } : {}),
    } });
    await transaction.facilityMaterial.deleteMany({ where: { facilityId: membership.facilityId, materialId: { notIn: materialIds } } });
    await transaction.facilityMaterial.createMany({ data: materialIds.map((materialId) => ({ facilityId: membership.facilityId, materialId })), skipDuplicates: true });
    await Promise.all(input.openingHours.map((hours, dayOfWeek) => {
      const [opensAt, closesAt] = hours.split("-");
      const isClosed = !hours || /^closed$/i.test(hours);
      return transaction.facilityOpeningHour.upsert({
        where: { facilityId_dayOfWeek: { facilityId: membership.facilityId, dayOfWeek } },
        update: { opensAt: isClosed ? null : opensAt, closesAt: isClosed ? null : closesAt, isClosed },
        create: { facilityId: membership.facilityId, dayOfWeek, opensAt: isClosed ? null : opensAt, closesAt: isClosed ? null : closesAt, isClosed },
      });
    }));
    await refreshFacilityCapacity(transaction, membership.facilityId);
    return transaction.facility.findUniqueOrThrow({
      where: { id: membership.facilityId },
      include: { materials: { include: { material: true } }, openingHours: { orderBy: { dayOfWeek: "asc" } } },
    });
  });
  response.json({ data: facilityProfileResult(profile, membership.role) });
}));

collectionsRouter.get("/facility/dashboard", asyncHandler(async (request, response) => {
  const userId = requireFacility(request);
  const query = facilityDashboardQuerySchema.parse(request.query);
  const memberships = await prisma.facilityMembership.findMany({
    where: { userId },
    include: { facility: { select: { id: true, name: true, address: true, operationalStatus: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!memberships.length) throw new ApiError(404, "FACILITY_PROFILE_NOT_FOUND", "No facility profile is linked to this account.");
  const facilities = memberships.map(({ facility, role }) => ({ ...facility, membershipRole: role }));
  if (!query.facilityId) {
    response.json({ data: { facilities, facility: null, collections: [], capacity: [], reports: [], incidents: [], notifications: [], summary: null } });
    return;
  }
  const membership = memberships.find((item) => item.facilityId === query.facilityId);
  if (!membership) throw new ApiError(403, "FACILITY_MISMATCH", "You do not have access to this facility.");
  const facility = await prisma.facility.findUniqueOrThrow({
    where: { id: membership.facilityId },
    include: { materials: { include: { material: true } }, openingHours: { orderBy: { dayOfWeek: "asc" } } },
  });
  const { start: todayStart, end: todayEnd } = southAfricanDayBounds();
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [collections, reports, incidents, notifications, allWeights, todayWeights, monthWeights, materialWeights, legacyCollections, receivedCount, verifiedCollectionCount, todayIncoming, pendingDeliveries] = await Promise.all([
    prisma.collectionRequest.findMany({ where: { destinationFacilityId: facility.id }, include: requestInclude(true), orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.report.findMany({ where: { facilityId: facility.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.incident.findMany({ where: { facilityId: facility.id, resolvedAt: null }, include: { material: { select: { name: true } } }, orderBy: { lastReportedAt: "desc" }, take: 20 }),
    prisma.notification.findMany({ where: { userId, facilityId: facility.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.collectionWeight.aggregate({ where: { verifiedFacilityId: facility.id, verifiedAt: { not: null } }, _sum: { verifiedKg: true } }),
    prisma.collectionWeight.aggregate({ where: { request: { destinationFacilityId: facility.id }, receivedAt: { gte: todayStart, lt: todayEnd } }, _sum: { facilityReceivedKg: true } }),
    prisma.collectionWeight.aggregate({ where: { verifiedFacilityId: facility.id, verifiedAt: { gte: monthAgo } }, _sum: { verifiedKg: true } }),
    prisma.collectionMaterialWeight.groupBy({ by: ["materialId"], where: { request: { destinationFacilityId: facility.id }, verifiedAt: { not: null } }, _sum: { verifiedKg: true } }),
    prisma.collectionRequest.findMany({ where: { destinationFacilityId: facility.id, materialWeights: { none: {} }, weight: { is: { verifiedFacilityId: facility.id, verifiedKg: { not: null } } } }, include: { material: { select: { name: true } }, weight: { select: { verifiedKg: true } } } }),
    prisma.collectionWeight.count({ where: { request: { destinationFacilityId: facility.id }, receivedAt: { not: null } } }),
    prisma.collectionWeight.count({ where: { verifiedFacilityId: facility.id, verifiedAt: { not: null } } }),
    prisma.collectionRequest.count({ where: { destinationFacilityId: facility.id, requestedFor: { gte: todayStart, lt: todayEnd }, status: { notIn: [CollectionStatus.CANCELLED, CollectionStatus.REJECTED, CollectionStatus.VERIFIED, CollectionStatus.COMPLETED] } } }),
    prisma.collectionRequest.count({ where: { destinationFacilityId: facility.id, status: { in: [CollectionStatus.COLLECTOR_ASSIGNED, CollectionStatus.COLLECTOR_ON_THE_WAY, CollectionStatus.COLLECTOR_ARRIVED, CollectionStatus.COLLECTING, CollectionStatus.PAUSED, CollectionStatus.VERIFICATION_PENDING] } } }),
  ]);
  const materialTotals = new Map<string, number>();
  const groupedMaterialIds = materialWeights.map((item) => item.materialId);
  const groupedMaterials = groupedMaterialIds.length ? await prisma.material.findMany({ where: { id: { in: groupedMaterialIds } }, select: { id: true, name: true } }) : [];
  const materialNames = new Map(groupedMaterials.map((item) => [item.id, item.name]));
  for (const item of materialWeights) {
    const name = materialNames.get(item.materialId);
    const weight = Number(item._sum.verifiedKg ?? 0);
    if (name && weight > 0) materialTotals.set(name, (materialTotals.get(name) ?? 0) + weight);
  }
  for (const collection of legacyCollections) {
    const weight = Number(collection.weight?.verifiedKg ?? 0);
    if (weight > 0) materialTotals.set(collection.material.name, (materialTotals.get(collection.material.name) ?? 0) + weight);
  }
  const capacity = facility.materials.map((item) => {
    const currentKg = Number(item.currentKg);
    const capacityKg = item.capacityKg === null ? null : Number(item.capacityKg);
    const percentage = capacityKg && capacityKg > 0 ? currentKg / capacityKg * 100 : null;
    return { materialId: item.materialId, material: item.material.name, currentKg, capacityKg, percentage, level: getFacilityCapacityLevel(currentKg, capacityKg) };
  });
  const totalKgReceived = Number(allWeights._sum.verifiedKg ?? 0);
  const nowMs = Date.now();
  const collectionsWithEta = collections.map((collection) => {
    const collector = collection.assignments[0]?.collector;
    const updatedAt = collector?.lastLocationUpdatedAt?.getTime();
    const hasRecentLocation = updatedAt !== undefined && nowMs - updatedAt <= 30 * 60 * 1000;
    const hasCoordinates = collector?.currentLatitude !== null && collector?.currentLatitude !== undefined && collector.currentLongitude !== null && collector.currentLongitude !== undefined;
    const estimatedEtaMinutes = hasRecentLocation && hasCoordinates
      ? Math.max(1, Math.ceil(distanceBetweenKm({ latitude: collector.currentLatitude!, longitude: collector.currentLongitude! }, { latitude: facility.latitude, longitude: facility.longitude }) / 20 * 60))
      : null;
    return { ...collection, estimatedEtaMinutes };
  });
  response.json({ data: {
    facilities,
    facility: facilityProfileResult(facility, membership.role),
    collections: collectionsWithEta,
    capacity,
    reports,
    incidents,
    notifications,
    summary: {
      todayIncomingCollections: todayIncoming,
      todayReceivedKg: Number(todayWeights._sum.facilityReceivedKg ?? 0),
      pendingDeliveries,
      totalKgReceived,
      materialTotals: Array.from(materialTotals, ([material, verifiedKg]) => ({ material, verifiedKg })).sort((a, b) => b.verifiedKg - a.verifiedKg),
      collectionsReceived: receivedCount,
      averageDailyIntakeKg: Number(monthWeights._sum.verifiedKg ?? 0) / 30,
      capacityUsagePercent: capacity.reduce((maximum, item) => Math.max(maximum, item.percentage ?? 0), 0),
      verifiedCollectionCount,
    },
  } });
}));

collectionsRouter.patch("/facility/status", validateBody(facilityStatusSchema), asyncHandler(async (request, response) => {
  const userId = requireFacility(request);
  const input = facilityStatusSchema.parse(request.body);
  const membership = await facilityMembership(userId, input.facilityId);
  requireFacilityManager(membership.role);
  const updated = await prisma.$transaction(async (transaction) => {
    await transaction.facility.update({ where: { id: input.facilityId }, data: { operationalStatus: input.status } });
    await refreshFacilityCapacity(transaction, input.facilityId);
    return transaction.facility.findUniqueOrThrow({ where: { id: input.facilityId } });
  });
  const facilityUsers = await prisma.facilityMembership.findMany({ where: { facilityId: input.facilityId, userId: { not: userId } }, select: { userId: true } });
  const admins = await prisma.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
  const recipients = [...facilityUsers, ...admins.map(({ id }) => ({ userId: id }))];
  if (recipients.length) await prisma.notification.createMany({ data: recipients.map(({ userId: recipientId }) => ({
    userId: recipientId,
    facilityId: updated.id,
    type: "FACILITY_ISSUE",
    title: "Facility status updated",
    body: `${updated.name} is now ${updated.operationalStatus.replaceAll("_", " ").toLowerCase()}.`,
    metadata: { facilityId: updated.id, status: updated.operationalStatus },
  })) });
  response.json({ data: { id: updated.id, operationalStatus: updated.operationalStatus } });
}));

collectionsRouter.put("/facility/capacity", validateBody(facilityCapacitySchema), asyncHandler(async (request, response) => {
  const userId = requireFacility(request);
  const input = facilityCapacitySchema.parse(request.body);
  const membership = await facilityMembership(userId, input.facilityId);
  requireFacilityManager(membership.role);
  await prisma.$transaction(async (transaction) => {
    const linkedMaterials = await transaction.facilityMaterial.findMany({ where: { facilityId: input.facilityId, materialId: { in: input.materials.map((item) => item.materialId) } }, select: { materialId: true } });
    if (linkedMaterials.length !== input.materials.length) throw new ApiError(400, "FACILITY_MATERIAL_MISMATCH", "Capacity can only be configured for materials accepted by this facility.");
    await Promise.all(input.materials.map((item) => transaction.facilityMaterial.update({
      where: { facilityId_materialId: { facilityId: input.facilityId, materialId: item.materialId } },
      data: { capacityKg: item.capacityKg, currentKg: item.currentKg },
    })));
    await refreshFacilityCapacity(transaction, input.facilityId);
  });
  const updated = await prisma.facilityMaterial.findMany({ where: { facilityId: input.facilityId }, include: { material: { select: { id: true, name: true } } }, orderBy: { material: { name: "asc" } } });
  response.json({ data: updated.map((item) => ({ materialId: item.materialId, material: item.material.name, capacityKg: item.capacityKg === null ? null : Number(item.capacityKg), currentKg: Number(item.currentKg) })) });
}));

collectionsRouter.post("/facility/incidents", validateBody(facilityIncidentSchema), asyncHandler(async (request, response) => {
  const userId = requireFacility(request);
  const input = facilityIncidentSchema.parse(request.body);
  await facilityMembership(userId, input.facilityId);
  const created = await prisma.$transaction(async (transaction) => {
    const facility = await transaction.facility.findUniqueOrThrow({ where: { id: input.facilityId }, select: { id: true, name: true, latitude: true, longitude: true } });
    const priorityCalculation = calculateIncidentPriorityScore({
      type: input.type as ReportType,
      reportCount: 1,
      waitingHours: 0,
      facilityUrgency: input.type === "CAPACITY_PROBLEM" || input.type === "SAFETY_ISSUE",
      proximityKm: null,
      proximitySource: "REMOTE",
    });
    const incident = await transaction.incident.create({ data: {
      type: input.type as ReportType,
      priority: priorityCalculation.priority,
      priorityScore: priorityCalculation.score,
      priorityFactors: priorityCalculation.factors,
      facilityId: facility.id,
      details: input.description,
      dedupeKey: `facility-report:${randomUUID()}`,
      latitude: facility.latitude,
      longitude: facility.longitude,
      reportCount: 1,
      firstReportedAt: new Date(),
      lastReportedAt: new Date(),
    } });
    const report = await transaction.report.create({ data: {
      reporterId: userId,
      facilityId: input.facilityId,
      type: input.type as ReportType,
      description: input.description,
      latitude: facility.latitude,
      longitude: facility.longitude,
      incidentId: incident.id,
    } });
    const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
    if (admins.length) await transaction.notification.createMany({ data: admins.map(({ id }) => ({
      userId: id,
      facilityId: facility.id,
      type: "FACILITY_ISSUE",
      title: "Facility issue reported",
      body: `${facility.name}: ${input.description}`,
      metadata: { reportId: report.id, facilityId: facility.id, type: input.type },
    })) });
    return report;
  });
  response.status(201).json({ data: created });
}));

collectionsRouter.post("/:requestId/facility/receive", validateBody(facilityReceiveSchema), asyncHandler(async (request, response) => {
  const userId = requireFacility(request);
  const requestId = pathParam(request, "requestId");
  const input = facilityReceiveSchema.parse(request.body);
  await facilityMembership(userId, input.facilityId);
  const current = await prisma.collectionRequest.findUnique({ where: { id: requestId }, include: { weight: true } });
  if (!current || current.destinationFacilityId !== input.facilityId || current.status !== CollectionStatus.COLLECTOR_ARRIVED) {
    throw new ApiError(409, "RECEIVE_NOT_AVAILABLE", "This delivery is not awaiting receipt at the selected facility.");
  }
  const received = await prisma.$transaction(async (transaction) => {
    const changed = await transaction.collectionRequest.updateMany({ where: { id: requestId, destinationFacilityId: input.facilityId, status: CollectionStatus.COLLECTOR_ARRIVED }, data: { status: CollectionStatus.COLLECTING } });
    if (changed.count !== 1) throw new ApiError(409, "RECEIVE_NOT_AVAILABLE", "This delivery has already changed.");
    await transaction.collectionWeight.update({ where: { requestId }, data: {
      facilityReceivedKg: input.receivedKg,
      receivedByUserId: userId,
      receivedAt: new Date(),
      facilityCondition: input.condition,
      facilityNotes: input.notes,
    } });
    await transaction.collectionStatusEvent.create({ data: {
      requestId,
      actorId: userId,
      fromStatus: CollectionStatus.COLLECTOR_ARRIVED,
      toStatus: CollectionStatus.COLLECTING,
      note: `Facility received ${input.receivedKg} kg of ${current.materialId}; condition ${input.condition}.${input.notes ? ` ${input.notes}` : ""}`,
    } });
    const facilityMembers = await transaction.facilityMembership.findMany({ where: { facilityId: input.facilityId }, select: { userId: true } });
    if (facilityMembers.length) await transaction.notification.createMany({ data: facilityMembers.map(({ userId: memberId }) => ({
      userId: memberId,
      facilityId: input.facilityId,
      type: "COLLECTION_STARTED",
      title: "Delivery receiving started",
      body: `A facility member recorded ${input.receivedKg} kg received.`,
      metadata: { requestId, condition: input.condition },
    })) });
    return transaction.collectionRequest.findUniqueOrThrow({ where: { id: requestId }, include: requestInclude(true) });
  });
  response.json({ data: received });
}));

collectionsRouter.post("/:requestId/facility/reject", validateBody(facilityRejectSchema), asyncHandler(async (request, response) => {
  const userId = requireFacility(request);
  const requestId = pathParam(request, "requestId");
  const input = facilityRejectSchema.parse(request.body);
  await facilityMembership(userId, input.facilityId);
  const current = await prisma.collectionRequest.findUnique({ where: { id: requestId }, include: { assignments: { include: { collector: { select: { userId: true } } }, orderBy: { assignedAt: "desc" } } } });
  const rejectable = current && (current.status === CollectionStatus.COLLECTOR_ARRIVED || current.status === CollectionStatus.COLLECTING || current.status === CollectionStatus.VERIFICATION_PENDING);
  if (!current || current.destinationFacilityId !== input.facilityId || !rejectable) {
    throw new ApiError(409, "REJECTION_NOT_AVAILABLE", "This delivery cannot be rejected in its current state.");
  }
  const reason = `${input.reasonCode}${input.notes ? `: ${input.notes}` : ""}`;
  const rejected = await prisma.$transaction(async (transaction) => {
    const changed = await transaction.collectionRequest.updateMany({ where: { id: requestId, destinationFacilityId: input.facilityId, status: current.status }, data: { status: CollectionStatus.REJECTED } });
    if (changed.count !== 1) throw new ApiError(409, "REJECTION_NOT_AVAILABLE", "This delivery has already changed.");
    await transaction.collectionStatusEvent.create({ data: { requestId, actorId: userId, fromStatus: current.status, toStatus: CollectionStatus.REJECTED, note: `Facility rejected delivery: ${reason}` } });
    const notificationData = [{ userId: current.requesterId, facilityId: input.facilityId, type: "FACILITY_ISSUE" as const, title: "Facility rejected delivery", body: `The facility could not accept your material: ${reason}`, metadata: { requestId } }];
    const collectorUserId = current.assignments.find((assignment) => assignment.collector.userId !== userId)?.collector.userId;
    if (collectorUserId) notificationData.push({ userId: collectorUserId, facilityId: input.facilityId, type: "FACILITY_ISSUE", title: "Delivery rejected", body: `The facility rejected the delivery: ${reason}`, metadata: { requestId } });
    const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
    notificationData.push(...admins.map(({ id }) => ({ userId: id, facilityId: input.facilityId, type: "FACILITY_ISSUE" as const, title: "Facility rejected delivery", body: `Request ${requestId.slice(-8)} was rejected: ${reason}`, metadata: { requestId } })));
    await transaction.notification.createMany({ data: notificationData });
    return transaction.collectionRequest.findUniqueOrThrow({ where: { id: requestId }, include: requestInclude(true) });
  });
  response.json({ data: rejected });
}));

collectionsRouter.get("/facility/notifications", asyncHandler(async (request, response) => {
  const userId = requireFacility(request);
  const query = facilityDashboardQuerySchema.extend({ facilityId: facilityDashboardQuerySchema.shape.facilityId.unwrap() }).parse(request.query);
  await facilityMembership(userId, query.facilityId);
  const notifications = await prisma.notification.findMany({ where: { userId, facilityId: query.facilityId }, orderBy: { createdAt: "desc" }, take: 50 });
  response.json({ data: notifications });
}));

collectionsRouter.post("/facility/notifications/:notificationId/read", asyncHandler(async (request, response) => {
  const userId = requireFacility(request);
  const query = facilityDashboardQuerySchema.extend({ facilityId: facilityDashboardQuerySchema.shape.facilityId.unwrap() }).parse(request.query);
  await facilityMembership(userId, query.facilityId);
  const notificationId = pathParam(request, "notificationId");
  const changed = await prisma.notification.updateMany({ where: { id: notificationId, userId, facilityId: query.facilityId, readAt: null }, data: { readAt: new Date() } });
  if (!changed.count) {
    const existing = await prisma.notification.findFirst({ where: { id: notificationId, userId, facilityId: query.facilityId }, select: { id: true, readAt: true } });
    if (!existing) throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "Notification was not found.");
    response.json({ data: { id: existing.id, read: Boolean(existing.readAt) } });
    return;
  }
  response.json({ data: { id: notificationId, read: true } });
}));

collectionsRouter.get("/facilities", asyncHandler(async (request, response) => {
  const query = facilitySearchSchema.parse(request.query);
  const facilities = await prisma.facility.findMany({
    where: {
      approvalStatus: ApprovalStatus.APPROVED,
      isSuspended: false,
      ...(query.material ? { materials: { some: { material: { name: { equals: query.material, mode: "insensitive" } } } } } : {}),
      ...(query.query ? { OR: [
        { name: { contains: query.query, mode: "insensitive" } },
        { address: { contains: query.query, mode: "insensitive" } },
        { materials: { some: { material: { name: { contains: query.query, mode: "insensitive" } } } } },
      ] } : {}),
    },
    include: { materials: { include: { material: true } }, openingHours: { orderBy: { dayOfWeek: "asc" } } },
    orderBy: { name: "asc" },
  });
  const results = facilities.map((facility) => {
    const distanceKm = query.latitude === undefined || query.longitude === undefined ? null : distanceBetweenKm(
      { latitude: query.latitude, longitude: query.longitude },
      { latitude: facility.latitude, longitude: facility.longitude },
    );
    return {
    id: facility.id,
    name: facility.name,
    address: facility.address,
    latitude: facility.latitude,
    longitude: facility.longitude,
    phone: facility.phone,
    email: facility.email,
    acceptedMaterials: facility.materials.map((link) => link.material.name),
    openingHours: facility.openingHours,
    status: facility.operationalStatus === FacilityOperationalStatus.CLOSED || facility.operationalStatus === FacilityOperationalStatus.TEMPORARILY_CLOSED || facility.operationalStatus === FacilityOperationalStatus.FULL || !currentFacilityOpen(facility.openingHours) ? "CLOSED" as const : "OPEN" as const,
    distanceKm,
  };
  }).filter((facility) => query.maxDistanceKm === undefined || (facility.distanceKm !== null && facility.distanceKm <= query.maxDistanceKm));
  if (query.openNow === "true") results.splice(0, results.length, ...results.filter((facility) => facility.status === "OPEN"));
  if (query.openNow === "false") results.splice(0, results.length, ...results.filter((facility) => facility.status === "CLOSED"));
  if (query.latitude !== undefined) results.sort((left, right) => (left.distanceKm ?? Infinity) - (right.distanceKm ?? Infinity));
  response.json({ data: results });
}));

collectionsRouter.get("/", asyncHandler(async (request, response) => {
  const userId = request.auth!.userId;
  const role = request.auth!.role;
  let where: Prisma.CollectionRequestWhereInput;

  if (role === UserRole.RECYCLER) {
    where = { requesterId: userId };
  } else if (role === UserRole.COLLECTOR) {
    where = { assignments: { some: { collector: { userId } } } };
  } else if (role === UserRole.FACILITY) {
    const memberships = await prisma.facilityMembership.findMany({ where: { userId }, select: { facilityId: true } });
    where = { destinationFacilityId: { in: memberships.map((membership) => membership.facilityId) } };
  } else {
    throw new ApiError(403, "FORBIDDEN", "Use the Admin collections view to access all requests.");
  }

  const requests = await prisma.collectionRequest.findMany({
    where,
    include: requestInclude(role === UserRole.COLLECTOR, role === UserRole.COLLECTOR ? userId : undefined),
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const now = Date.now();
  response.json({ data: requests.map((collectionRequest) => {
    const collector = collectionRequest.assignments[0]?.collector;
    const locationUpdatedAt = collector?.lastLocationUpdatedAt?.getTime();
    const hasRecentLocation = locationUpdatedAt !== undefined && now - locationUpdatedAt <= 30 * 60 * 1000;
    const hasCoordinates = collector?.currentLatitude !== null && collector?.currentLatitude !== undefined && collector.currentLongitude !== null && collector.currentLongitude !== undefined;
    const estimatedEtaMinutes = hasRecentLocation && hasCoordinates
      ? Math.max(1, Math.ceil(distanceBetweenKm(
        { latitude: collector.currentLatitude!, longitude: collector.currentLongitude! },
        { latitude: collectionRequest.pickupLatitude, longitude: collectionRequest.pickupLongitude },
      ) / 20 * 60))
      : null;
    const assignments = role === UserRole.RECYCLER
      ? collectionRequest.assignments.map((assignment) => ({
        ...assignment,
        collector: redactCollectorCoordinates(assignment.collector),
      }))
      : collectionRequest.assignments;
    return { ...collectionRequest, assignments, estimatedEtaMinutes };
  }) });
}));

collectionsRouter.get("/summary", asyncHandler(async (request, response) => {
  const userId = requireRecycler(request);
  const [requests, wallet, notifications] = await Promise.all([
    prisma.collectionRequest.findMany({
      where: { requesterId: userId },
      include: { material: true, weight: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.rewardWallet.findUnique({ where: { userId }, select: { pointsBalance: true } }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const activeStatuses = new Set<CollectionStatus>([CollectionStatus.COLLECTOR_ASSIGNED, CollectionStatus.COLLECTOR_ON_THE_WAY, CollectionStatus.COLLECTOR_ARRIVED, CollectionStatus.COLLECTING, CollectionStatus.PAUSED]);
  const completedStatuses = new Set<CollectionStatus>([CollectionStatus.VERIFIED, CollectionStatus.COMPLETED]);
  const impact = new Map<string, number>();
  let totalRecycledKg = 0;
  for (const collection of requests) {
    const verifiedKg = Number(collection.weight?.verifiedKg ?? 0);
    if (verifiedKg <= 0) continue;
    totalRecycledKg += verifiedKg;
    impact.set(collection.material.name, (impact.get(collection.material.name) ?? 0) + verifiedKg);
  }
  const activeRequest = requests.find((collection) => activeStatuses.has(collection.status));
  response.json({ data: {
    pendingRequests: requests.filter((collection) => collection.status === CollectionStatus.PENDING || collection.status === CollectionStatus.WAITING_FOR_ADMIN).length,
    completedCollections: requests.filter((collection) => completedStatuses.has(collection.status)).length,
    totalRecycledKg,
    pointsBalance: wallet?.pointsBalance ?? 0,
    impactByMaterial: Array.from(impact, ([material, verifiedKg]) => ({ material, verifiedKg })).sort((left, right) => right.verifiedKg - left.verifiedKg),
    activeRequest: activeRequest ? { id: activeRequest.id, status: activeRequest.status, material: activeRequest.material.name, pickupAddress: activeRequest.pickupAddress } : null,
    recentNotifications: notifications,
  } });
}));

collectionsRouter.put("/location", validateBody(collectorLocationSchema), asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.COLLECTOR) throw new ApiError(403, "FORBIDDEN", "Only Collectors can update a collector location.");
  const input = collectorLocationSchema.parse(request.body);
  const profile = await prisma.collectorProfile.findUnique({ where: { userId: request.auth!.userId } });
  if (!profile || profile.approvalStatus !== ApprovalStatus.APPROVED) throw new ApiError(403, "COLLECTOR_NOT_APPROVED", "Your collector profile is not approved.");
  const updated = await prisma.collectorProfile.update({
    where: { id: profile.id },
    data: { currentLatitude: input.latitude, currentLongitude: input.longitude, lastLocationUpdatedAt: new Date() },
    select: { id: true, currentLatitude: true, currentLongitude: true, lastLocationUpdatedAt: true },
  });
  response.json({ data: updated });
}));

collectionsRouter.post("/", validateBody(collectionRequestSchema), asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.RECYCLER) throw new ApiError(403, "FORBIDDEN", "Only recyclers can request a collection.");
  const input = collectionRequestSchema.parse(request.body);
  const material = await prisma.material.findFirst({ where: { name: { equals: input.material, mode: "insensitive" }, isActive: true } });
  if (!material) throw new ApiError(400, "UNKNOWN_MATERIAL", "This material is not currently supported.");

  const facility = await prisma.facility.findFirst({
    where: {
      id: input.destinationFacilityId,
      approvalStatus: ApprovalStatus.APPROVED,
      isSuspended: false,
      materials: { some: { materialId: material.id } },
    },
    select: { id: true },
  });
  if (!facility) throw new ApiError(400, "FACILITY_UNAVAILABLE", "Choose an approved facility that accepts this material.");

  const created = await prisma.$transaction(async (transaction) => {
    const requestedFor = new Date(input.requestedFor);
    const requestedWindowEnd = new Date(requestedFor.getTime() + 60 * 60 * 1000);
    const maintenanceWindow = await transaction.facilityMaintenanceWindow.findFirst({
      where: {
        facilityId: facility.id,
        status: { in: ["SCHEDULED", "ACTIVE"] },
        startsAt: { lt: requestedWindowEnd },
        endsAt: { gt: requestedFor },
      },
      orderBy: { startsAt: "asc" },
    });
    const initialStatus = maintenanceWindow ? CollectionStatus.SCHEDULED_MAINTENANCE : CollectionStatus.WAITING_FOR_ADMIN;
    const collectionRequest = await transaction.collectionRequest.create({
      data: {
        requesterId: request.auth!.userId,
        materialId: material.id,
        destinationFacilityId: facility.id,
        estimatedKg: input.estimatedKg,
        requestedFor,
        pickupAddress: input.pickupAddress,
        pickupLatitude: input.pickupLatitude,
        pickupLongitude: input.pickupLongitude,
        notes: input.notes,
        status: initialStatus,
        maintenanceWindowId: maintenanceWindow?.id,
        weight: { create: { estimatedKg: input.estimatedKg } },
        statusEvents: { create: {
          actorId: request.auth!.userId,
          toStatus: initialStatus,
          note: maintenanceWindow ? `Held for scheduled facility maintenance at ${facility.id}.` : undefined,
        } },
      },
    });
    return { id: collectionRequest.id, status: collectionRequest.status, hasMaintenanceWindow: Boolean(maintenanceWindow) };
  });

  try {
    const admins = await prisma.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
    const notifications: Prisma.NotificationCreateManyInput[] = [
      {
      userId: request.auth!.userId,
      type: "COLLECTION_REQUEST_CREATED",
      title: "Collection request submitted",
      body: created.hasMaintenanceWindow ? "Your request is scheduled around a facility maintenance window and will not be dispatched until service resumes." : "Your request is being matched with a qualified available collector.",
      metadata: { requestId: created.id },
      },
      ...admins.map(({ id }): Prisma.NotificationCreateManyInput => ({
      userId: id,
      type: "COLLECTION_REQUEST_CREATED",
      title: "New collection request",
      body: `${request.auth!.displayName ?? request.auth!.email} requested ${material.name} collection.`,
      metadata: { requestId: created.id },
      })),
    ];
    await prisma.notification.createMany({ data: notifications });
  } catch (error) {
    console.error("Collection request was saved, but notifications could not be created.", error);
  }
  if (created.status !== CollectionStatus.SCHEDULED_MAINTENANCE) {
    try {
      await dispatchWaitingCollections();
    } catch (error) {
      console.error("Collection request was saved, but automatic dispatch failed.", error);
    }
  }
  const assigned = await prisma.collectionRequest.findUnique({ where: { id: created.id }, include: requestInclude() });
  response.status(201).json({ data: assigned ?? created });
}));

collectionsRouter.post("/buffered-events", validateBody(bufferedCollectionEventSchema), asyncHandler(async (request, response) => {
  const userId = requireRecycler(request);
  const input = bufferedCollectionEventSchema.parse(request.body);
  const existing = await prisma.bufferedCollectionEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.requesterId !== userId) throw new ApiError(409, "IDEMPOTENCY_KEY_IN_USE", "This event key is already in use.");
    response.json({ data: { id: existing.id, status: existing.status, priority: existing.priority, activateAt: existing.activateAt } });
    return;
  }
  const material = await prisma.material.findFirst({ where: { name: { equals: input.material, mode: "insensitive" }, isActive: true } });
  if (!material) throw new ApiError(400, "UNKNOWN_MATERIAL", "This material is not currently supported.");
  const facility = await prisma.facility.findFirst({
    where: { id: input.destinationFacilityId, approvalStatus: ApprovalStatus.APPROVED, isSuspended: false, materials: { some: { materialId: material.id } } },
    select: { id: true },
  });
  if (!facility) throw new ApiError(400, "FACILITY_UNAVAILABLE", "Choose an approved facility that accepts this material.");
  const event = await prisma.bufferedCollectionEvent.create({
    data: {
      idempotencyKey: input.idempotencyKey,
      requesterId: userId,
      materialId: material.id,
      destinationFacilityId: facility.id,
      estimatedKg: input.estimatedKg,
      requestedFor: new Date(input.requestedFor),
      pickupAddress: input.pickupAddress,
      pickupLatitude: input.pickupLatitude,
      pickupLongitude: input.pickupLongitude,
      notes: input.notes,
      activateAt: new Date(Date.now() + 10_000),
    },
  });
  response.status(201).json({ data: { id: event.id, status: event.status, priority: event.priority, activateAt: event.activateAt } });
}));

collectionsRouter.get("/buffered-events", asyncHandler(async (request, response) => {
  const userId = requireRecycler(request);
  const events = await prisma.bufferedCollectionEvent.findMany({
    where: { requesterId: userId, status: "OPEN" },
    select: { id: true, status: true, priority: true, activateAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  response.json({ data: events });
}));

collectionsRouter.post("/buffered-events/:eventId/resolve", asyncHandler(async (request, response) => {
  const userId = requireRecycler(request);
  const eventId = pathParam(request, "eventId");
  const updated = await prisma.bufferedCollectionEvent.updateMany({ where: { id: eventId, requesterId: userId, status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  if (updated.count !== 1) throw new ApiError(409, "EVENT_NOT_OPEN", "This event is no longer waiting for activation.");
  response.json({ data: { id: eventId, status: "RESOLVED" } });
}));

collectionsRouter.post("/:requestId/cancel", validateBody(collectionCancellationSchema), asyncHandler(async (request, response) => {
  const userId = requireRecycler(request);
  const requestId = pathParam(request, "requestId");
  const { reason } = collectionCancellationSchema.parse(request.body);
  const current = await prisma.collectionRequest.findFirst({
    where: { id: requestId, requesterId: userId },
    include: {
      assignments: {
        where: { status: { in: activeAssignmentStatuses } },
        include: { collector: true },
      },
    },
  });
  if (!current) throw new ApiError(404, "COLLECTION_NOT_FOUND", "Collection request was not found.");
  const cancellableStatuses: CollectionStatus[] = [
    CollectionStatus.PENDING,
    CollectionStatus.WAITING_FOR_ADMIN,
    CollectionStatus.COLLECTOR_ASSIGNED,
    CollectionStatus.COLLECTOR_ON_THE_WAY,
    CollectionStatus.COLLECTOR_ARRIVED,
  ];
  if (!cancellableStatuses.includes(current.status)) throw new ApiError(409, "COLLECTION_NOT_CANCELLABLE", "A collection cannot be cancelled after work has started.");

  const cancelled = await prisma.$transaction(async (transaction) => {
    const changed = await transaction.collectionRequest.updateMany({
      where: { id: requestId, requesterId: userId, status: current.status },
      data: { status: CollectionStatus.CANCELLED, cancellationReason: reason },
    });
    if (changed.count !== 1) throw new ApiError(409, "COLLECTION_NOT_CANCELLABLE", "This collection has already changed.");
    const now = new Date();
    for (const assignment of current.assignments) {
      const revoked = await transaction.collectionAssignment.updateMany({
        where: { id: assignment.id, status: { in: activeAssignmentStatuses } },
        data: { status: AssignmentStatus.REVOKED, unassignedAt: now, reason: reason ?? "Cancelled by requester." },
      });
      if (revoked.count === 1) {
        await transaction.collectorProfile.updateMany({
          where: { id: assignment.collectorProfileId, availability: CollectorAvailability.ON_COLLECTION },
          data: { availability: CollectorAvailability.AVAILABLE },
        });
        await transaction.notification.create({
          data: {
            userId: assignment.collector.userId,
            type: "COLLECTION_CANCELLED",
            title: "Collection cancelled",
            body: `Request ${requestId.slice(-8)} was cancelled by the requester.`,
            metadata: { requestId },
          },
        });
      }
    }
    await transaction.collectionStatusEvent.create({
      data: { requestId, actorId: userId, fromStatus: current.status, toStatus: CollectionStatus.CANCELLED, note: reason ?? "Cancelled by requester." },
    });
    await transaction.notification.create({
      data: { userId, type: "COLLECTION_CANCELLED", title: "Collection cancelled", body: "Your collection request was cancelled.", metadata: { requestId } },
    });
    const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
    if (admins.length) await transaction.notification.createMany({
      data: admins.map(({ id }) => ({ userId: id, type: "COLLECTION_CANCELLED", title: "Collection cancelled", body: `Request ${requestId.slice(-8)} was cancelled by the requester.`, metadata: { requestId } })),
    });
    return transaction.collectionRequest.findUniqueOrThrow({ where: { id: requestId }, include: requestInclude() });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await dispatchWaitingCollections();
  response.json({ data: cancelled });
}));

collectionsRouter.post("/:requestId/accept", asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.COLLECTOR) throw new ApiError(403, "FORBIDDEN", "Only the assigned Collector can accept a collection.");
  const requestId = pathParam(request, "requestId");
  const profile = await prisma.collectorProfile.findUnique({ where: { userId: request.auth!.userId } });
  if (!profile || profile.approvalStatus !== ApprovalStatus.APPROVED) throw new ApiError(403, "COLLECTOR_NOT_APPROVED", "Your collector account is not approved.");

  const collectionRequest = await prisma.$transaction(async (transaction) => {
    const assignment = await transaction.collectionAssignment.findFirst({
      where: { requestId, collectorProfileId: profile.id, status: AssignmentStatus.ASSIGNED },
      include: { request: { include: { destinationFacility: { include: { memberships: { select: { userId: true } } } } } } },
    });
    if (!assignment || assignment.request.status !== CollectionStatus.COLLECTOR_ASSIGNED) throw new ApiError(409, "ASSIGNMENT_NOT_AVAILABLE", "This request is not assigned to you or has already changed.");
    const requestChanged = await transaction.collectionRequest.updateMany({
      where: { id: requestId, status: CollectionStatus.COLLECTOR_ASSIGNED },
      data: { status: CollectionStatus.COLLECTOR_ON_THE_WAY },
    });
    if (requestChanged.count !== 1) throw new ApiError(409, "ASSIGNMENT_NOT_AVAILABLE", "This request has already changed.");
    const assignmentChanged = await transaction.collectionAssignment.updateMany({
      where: { id: assignment.id, status: AssignmentStatus.ASSIGNED },
      data: { status: AssignmentStatus.ACCEPTED, acceptedAt: new Date() },
    });
    if (assignmentChanged.count !== 1) throw new ApiError(409, "ASSIGNMENT_NOT_AVAILABLE", "This assignment has already changed.");
    await transaction.collectionStatusEvent.create({ data: {
      requestId,
      actorId: request.auth!.userId,
      fromStatus: CollectionStatus.COLLECTOR_ASSIGNED,
      toStatus: CollectionStatus.COLLECTOR_ON_THE_WAY,
      note: "Collector accepted the assignment.",
    } });
    await transaction.notification.create({ data: {
      userId: assignment.request.requesterId,
      type: "COLLECTOR_ON_THE_WAY",
      title: "Collector accepted",
      body: `${request.auth!.displayName ?? "Your collector"} is on the way.`,
      metadata: { requestId },
    } });
    const facilityMembers = assignment.request.destinationFacility?.memberships ?? [];
    if (facilityMembers.length) await transaction.notification.createMany({ data: facilityMembers.map(({ userId: memberId }) => ({
      userId: memberId,
      facilityId: assignment.request.destinationFacility!.id,
      type: "COLLECTOR_ON_THE_WAY",
      title: "Collector approaching",
      body: "An assigned collector has accepted the delivery and is on the way.",
      metadata: { requestId },
    })) });
    await transaction.notification.create({ data: {
      userId: request.auth!.userId,
      type: "COLLECTION_REASSIGNED",
      title: "Job returned to the queue",
      body: "The collection is being offered to the next qualified available collector.",
      metadata: { requestId },
    } });
    const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
    if (admins.length) await transaction.notification.createMany({ data: admins.map(({ id }) => ({
      userId: id,
      type: "COLLECTOR_ON_THE_WAY",
      title: "Collector accepted a job",
      body: `A collector accepted request ${requestId.slice(-8)}.`,
      metadata: { requestId },
    })) });
    return transaction.collectionRequest.findUniqueOrThrow({ where: { id: requestId }, include: requestInclude() });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.json({ data: collectionRequest });
}));

collectionsRouter.post("/:requestId/progress", validateBody(collectorProgressSchema), asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.COLLECTOR) throw new ApiError(403, "FORBIDDEN", "Only the assigned Collector can update pickup progress.");
  const requestId = pathParam(request, "requestId");
  const { action, delayCode, explanation } = collectorProgressSchema.parse(request.body);
  const profile = await prisma.collectorProfile.findUnique({ where: { userId: request.auth!.userId } });
  if (!profile || profile.approvalStatus !== ApprovalStatus.APPROVED) throw new ApiError(403, "COLLECTOR_NOT_APPROVED", "Your collector account is not approved.");
  const collectionRequest = await prisma.$transaction(async (transaction) => {
    const assignment = await transaction.collectionAssignment.findFirst({
      where: { requestId, collectorProfileId: profile.id, status: AssignmentStatus.ACCEPTED },
      include: { request: { include: { destinationFacility: { include: { memberships: { select: { userId: true } } } } } } },
    });
    if (!assignment) throw new ApiError(409, "ASSIGNMENT_NOT_ACTIVE", "There is no active assignment for this collector.");
    const transitions = {
      ARRIVED: { from: CollectionStatus.COLLECTOR_ON_THE_WAY, to: CollectionStatus.COLLECTOR_ARRIVED, type: "COLLECTOR_ARRIVED" as const, title: "Collector arrived", body: "Your collector has arrived at the pickup address." },
      START: { from: CollectionStatus.COLLECTOR_ARRIVED, to: CollectionStatus.COLLECTING, type: "COLLECTION_STARTED" as const, title: "Collection started", body: "Your collection has started." },
      PAUSE: { from: CollectionStatus.COLLECTING, to: CollectionStatus.PAUSED, type: "COLLECTION_PAUSED" as const, title: "Collection paused", body: "Your collection is temporarily paused." },
      RESUME: { from: CollectionStatus.PAUSED, to: CollectionStatus.COLLECTING, type: "COLLECTION_RESUMED" as const, title: "Collection resumed", body: "Your collection has resumed." },
    };
    const transition = transitions[action];
    if (assignment.request.status !== transition.from) throw new ApiError(409, "INVALID_COLLECTION_TRANSITION", "This pickup cannot make that status transition.");
    const changed = await transaction.collectionRequest.updateMany({ where: { id: requestId, status: transition.from }, data: { status: transition.to } });
    if (changed.count !== 1) throw new ApiError(409, "INVALID_COLLECTION_TRANSITION", "This pickup has already changed.");
    const note = action === "PAUSE" ? `Collection paused (${delayCode}): ${explanation ?? "No additional details."}` : transition.body;
    await transaction.collectionStatusEvent.create({ data: { requestId, actorId: request.auth!.userId, fromStatus: transition.from, toStatus: transition.to, note } });
    await transaction.notification.create({ data: { userId: assignment.request.requesterId, type: transition.type, title: transition.title, body: transition.body, metadata: { requestId } } });
    if (action === "ARRIVED") {
      const facilityMembers = assignment.request.destinationFacility?.memberships ?? [];
      if (facilityMembers.length) await transaction.notification.createMany({ data: facilityMembers.map(({ userId: memberId }) => ({
        userId: memberId,
        facilityId: assignment.request.destinationFacility!.id,
        type: "COLLECTOR_ARRIVED",
        title: "Collection arrived",
        body: "An assigned collector has arrived with a delivery for your facility.",
        metadata: { requestId },
      })) });
    }
    return transaction.collectionRequest.findUniqueOrThrow({ where: { id: requestId }, include: requestInclude() });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.json({ data: collectionRequest });
}));

collectionsRouter.post("/:requestId/decline", validateBody(collectorDeclineSchema), asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.COLLECTOR) throw new ApiError(403, "FORBIDDEN", "Only the assigned Collector can decline a collection.");
  const requestId = pathParam(request, "requestId");
  const { reasonCode, explanation } = collectorDeclineSchema.parse(request.body);
  const reason = explanation ? `${reasonCode}: ${explanation}` : reasonCode;
  const profile = await prisma.collectorProfile.findUnique({ where: { userId: request.auth!.userId } });
  if (!profile || profile.approvalStatus !== ApprovalStatus.APPROVED) throw new ApiError(403, "COLLECTOR_NOT_APPROVED", "Your collector account is not approved.");

  const collectionRequest = await prisma.$transaction(async (transaction) => {
    const assignment = await transaction.collectionAssignment.findFirst({
      where: { requestId, collectorProfileId: profile.id, status: AssignmentStatus.ASSIGNED },
      include: { request: true },
    });
    if (!assignment || assignment.request.status !== CollectionStatus.COLLECTOR_ASSIGNED) throw new ApiError(409, "ASSIGNMENT_NOT_AVAILABLE", "This request is not assigned to you or has already changed.");

    const requestChanged = await transaction.collectionRequest.updateMany({
      where: { id: requestId, status: CollectionStatus.COLLECTOR_ASSIGNED },
      data: { status: CollectionStatus.WAITING_FOR_ADMIN },
    });
    if (requestChanged.count !== 1) throw new ApiError(409, "ASSIGNMENT_NOT_AVAILABLE", "This request has already changed.");
    const assignmentChanged = await transaction.collectionAssignment.updateMany({
      where: { id: assignment.id, status: AssignmentStatus.ASSIGNED },
      data: { status: AssignmentStatus.DECLINED, reason, declineReasonCode: reasonCode },
    });
    if (assignmentChanged.count !== 1) throw new ApiError(409, "ASSIGNMENT_NOT_AVAILABLE", "This assignment has already changed.");
    await transaction.collectorProfile.updateMany({
      where: { id: profile.id, availability: CollectorAvailability.ON_COLLECTION },
      data: { availability: CollectorAvailability.AVAILABLE },
    });
    await transaction.collectionStatusEvent.create({ data: {
      requestId,
      actorId: request.auth!.userId,
      fromStatus: CollectionStatus.COLLECTOR_ASSIGNED,
      toStatus: CollectionStatus.WAITING_FOR_ADMIN,
      note: `Collector declined the assignment: ${reason}`,
    } });
    await transaction.notification.create({ data: {
      userId: assignment.request.requesterId,
      type: "COLLECTOR_DECLINED",
      title: "Collector declined assignment",
      body: `The assigned Collector declined: ${reason} The request is being offered to another qualified collector.`,
      metadata: { requestId },
    } });
    const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
    if (admins.length) await transaction.notification.createMany({ data: admins.map(({ id }) => ({
      userId: id,
      type: "COLLECTOR_DECLINED",
      title: "Collection needs reassignment",
      body: `A Collector declined request ${requestId.slice(-8)}. Reason: ${reason}`,
      metadata: { requestId },
    })) });
    return transaction.collectionRequest.findUniqueOrThrow({ where: { id: requestId }, include: requestInclude() });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await dispatchWaitingCollections();
  const reassigned = await prisma.collectionRequest.findUnique({ where: { id: requestId }, include: requestInclude() });
  response.json({ data: reassigned ?? collectionRequest });
}));

collectionsRouter.post("/:requestId/collect", validateBody(collectedWeightSchema), asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.COLLECTOR) throw new ApiError(403, "FORBIDDEN", "Only the assigned Collector can record collected material.");
  const requestId = pathParam(request, "requestId");
  const input = collectedWeightSchema.parse(request.body);
  const profile = await prisma.collectorProfile.findUnique({ where: { userId: request.auth!.userId } });
  if (!profile || profile.approvalStatus !== ApprovalStatus.APPROVED) throw new ApiError(403, "COLLECTOR_NOT_APPROVED", "Your collector account is not approved.");

  const updated = await prisma.$transaction(async (transaction) => {
    const assignment = await transaction.collectionAssignment.findFirst({
      where: { requestId, collectorProfileId: profile.id, status: AssignmentStatus.ACCEPTED },
      include: { request: { include: { destinationFacility: { include: { memberships: { select: { userId: true } }, materials: { select: { materialId: true } } } } } } },
    });
    const collectableStatuses: CollectionStatus[] = [CollectionStatus.COLLECTING];
    if (!assignment || !collectableStatuses.includes(assignment.request.status)) throw new ApiError(409, "COLLECTION_NOT_ACTIVE", "There is no active assignment for this collector.");
    const materialWeights = input.materials ?? [{ materialId: assignment.request.materialId, actualKg: input.actualKg! }];
    const materialIds = materialWeights.map((item) => item.materialId);
    const activeMaterials = await transaction.material.findMany({ where: { id: { in: materialIds }, isActive: true }, select: { id: true } });
    if (activeMaterials.length !== materialIds.length) throw new ApiError(400, "UNKNOWN_MATERIAL", "Select only active material categories.");
    const acceptedMaterialIds = new Set(assignment.request.destinationFacility?.materials.map((item) => item.materialId) ?? []);
    if (materialWeights.some((item) => !acceptedMaterialIds.has(item.materialId))) throw new ApiError(400, "FACILITY_MATERIAL_MISMATCH", "The destination facility does not accept every recorded material.");
    const actualKg = materialWeights.reduce((total, item) => total + item.actualKg, 0);
    const now = new Date();
    await transaction.collectionWeight.update({
      where: { requestId },
      data: { actualKg, notes: input.notes, recordedByUserId: request.auth!.userId, recordedAt: now },
    });
    await transaction.collectionMaterialWeight.deleteMany({ where: { requestId } });
    await transaction.collectionMaterialWeight.createMany({
      data: materialWeights.map((item) => ({ requestId, materialId: item.materialId, actualKg: item.actualKg, recordedAt: now })),
    });
    await transaction.collectionAssignment.update({ where: { id: assignment.id }, data: { status: AssignmentStatus.COMPLETED } });
    await transaction.collectionRequest.update({ where: { id: requestId }, data: { status: CollectionStatus.VERIFICATION_PENDING } });
    await transaction.collectorProfile.updateMany({ where: { id: profile.id, availability: CollectorAvailability.ON_COLLECTION }, data: { availability: CollectorAvailability.AVAILABLE } });
    await transaction.collectionStatusEvent.create({ data: {
      requestId,
      actorId: request.auth!.userId,
      fromStatus: assignment.request.status,
      toStatus: CollectionStatus.VERIFICATION_PENDING,
      note: `Collector recorded ${actualKg} kg across ${materialWeights.length} material categories; facility verification is pending.`,
    } });
    await transaction.notification.create({ data: {
      userId: assignment.request.requesterId,
      type: "COLLECTION_COMPLETED",
      title: "Waste Cleared",
      body: `Your waste has been cleared. ${actualKg} kg collected; facility verification is pending.`,
      metadata: { requestId },
    } });
    const facilityUserIds = assignment.request.destinationFacility?.memberships.map((membership) => membership.userId) ?? [];
    if (facilityUserIds.length) await transaction.notification.createMany({ data: facilityUserIds.map((userId) => ({
      userId,
      facilityId: assignment.request.destinationFacilityId,
      type: "COLLECTION_COMPLETED",
      title: "Materials awaiting verification",
      body: `A collector delivered ${actualKg} kg for facility verification.`,
      metadata: { requestId },
    })) });
    return transaction.collectionRequest.findUniqueOrThrow({ where: { id: requestId }, include: requestInclude() });
  });
  response.json({ data: updated });
}));

collectionsRouter.post("/:requestId/verify", validateBody(verifiedWeightSchema), asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.FACILITY) throw new ApiError(403, "FORBIDDEN", "Only a Facility member can verify received material.");
  const requestId = pathParam(request, "requestId");
  const input = verifiedWeightSchema.parse(request.body);
  const current = await prisma.collectionRequest.findUnique({ where: { id: requestId }, include: { material: true, weight: true, materialWeights: true } });
  if (!current || current.status !== CollectionStatus.VERIFICATION_PENDING || !current.destinationFacilityId) throw new ApiError(409, "VERIFICATION_NOT_AVAILABLE", "This request is not awaiting facility verification.");
  const membership = await prisma.facilityMembership.findFirst({ where: { facilityId: current.destinationFacilityId, userId: request.auth!.userId } });
  if (!membership) throw new ApiError(403, "FACILITY_MISMATCH", "This request is assigned to a different facility.");
  const facility = await prisma.facility.findUnique({ where: { id: current.destinationFacilityId } });
  if (!facility || facility.approvalStatus !== ApprovalStatus.APPROVED || facility.isSuspended) throw new ApiError(403, "FACILITY_UNAVAILABLE", "This facility is not approved to verify materials.");

  const verifiedMaterials = input.materials ?? [{ materialId: current.materialId, verifiedKg: input.verifiedKg! }];
  const actualByMaterial = new Map(current.materialWeights.map((item) => [item.materialId, Number(item.actualKg)]));
  if (current.materialWeights.length) {
    if (verifiedMaterials.length !== current.materialWeights.length || verifiedMaterials.some((item) => actualByMaterial.get(item.materialId) === undefined)) {
      throw new ApiError(400, "MATERIAL_WEIGHTS_MISMATCH", "Verify each material weight recorded by the Collector.");
    }
    if (verifiedMaterials.some((item) => item.verifiedKg > (actualByMaterial.get(item.materialId) ?? 0))) {
      throw new ApiError(400, "VERIFIED_WEIGHT_EXCEEDS_RECORDED", "A verified material weight cannot exceed the Collector's recorded weight.");
    }
  } else if (verifiedMaterials.length !== 1 || verifiedMaterials[0].materialId !== current.materialId) {
    throw new ApiError(400, "MATERIAL_WEIGHTS_MISMATCH", "This request only supports verification of its requested material.");
  }

  const verifiedKg = verifiedMaterials.reduce((total, item) => total + item.verifiedKg, 0);
  const materialIds = verifiedMaterials.filter((item) => item.verifiedKg > 0).map((item) => item.materialId);
  const now = new Date();
  const activeRates = await prisma.materialRewardRate.findMany({
    where: { materialId: { in: materialIds }, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    orderBy: { startsAt: "desc" },
  });
  const rateByMaterial = new Map<string, (typeof activeRates)[number]>();
  for (const rate of activeRates) if (!rateByMaterial.has(rate.materialId)) rateByMaterial.set(rate.materialId, rate);
  if (materialIds.some((materialId) => !rateByMaterial.has(materialId))) throw new ApiError(409, "REWARD_RATE_MISSING", "An active points rate is missing for a verified material.");
  const pointsAwarded = verifiedMaterials.reduce((total, item) => total + Math.floor(item.verifiedKg * (rateByMaterial.get(item.materialId)?.pointsPerKg ?? 0)), 0);
  const activeRate = rateByMaterial.get(current.materialId) ?? activeRates[0];

  const verified = await prisma.$transaction(async (transaction) => {
    const existingTransaction = await transaction.rewardTransaction.findUnique({ where: { idempotencyKey: `verified:${requestId}` } });
    if (existingTransaction) throw new ApiError(409, "ALREADY_REWARDED", "Points have already been issued for this request.");
    const changed = await transaction.collectionRequest.updateMany({ where: { id: requestId, status: CollectionStatus.VERIFICATION_PENDING }, data: { status: CollectionStatus.VERIFIED } });
    if (changed.count !== 1) throw new ApiError(409, "VERIFICATION_NOT_AVAILABLE", "Another facility has already verified this request.");
    await transaction.collectionWeight.update({
      where: { requestId },
      data: { verifiedKg, verifiedByUserId: request.auth!.userId, verifiedFacilityId: facility.id, verifiedAt: now },
    });
    if (current.materialWeights.length) {
      await Promise.all(verifiedMaterials.map((item) => transaction.collectionMaterialWeight.update({
        where: { requestId_materialId: { requestId, materialId: item.materialId } },
        data: { verifiedKg: item.verifiedKg, verifiedAt: now },
      })));
    }
    for (const item of verifiedMaterials) {
      const stored = await transaction.facilityMaterial.updateMany({
        where: { facilityId: facility.id, materialId: item.materialId },
        data: { currentKg: { increment: item.verifiedKg } },
      });
      if (stored.count !== 1) throw new ApiError(400, "FACILITY_MATERIAL_MISMATCH", "The facility no longer accepts one of the verified materials.");
    }
    await refreshFacilityCapacity(transaction, facility.id);
    await transaction.collectionStatusEvent.create({ data: {
      requestId,
      actorId: request.auth!.userId,
      fromStatus: CollectionStatus.VERIFICATION_PENDING,
      toStatus: CollectionStatus.VERIFIED,
      note: `Facility verified ${verifiedKg} kg.`,
    } });
    if (pointsAwarded > 0) {
      const wallet = await transaction.rewardWallet.upsert({
        where: { userId: current.requesterId },
        update: { pointsBalance: { increment: pointsAwarded } },
        create: { userId: current.requesterId, pointsBalance: pointsAwarded },
      });
      await transaction.rewardTransaction.create({ data: {
        walletId: wallet.id,
        requestId,
        type: RewardTransactionType.EARN,
        pointsDelta: pointsAwarded,
        randValueCents: pointsAwarded * 20,
        idempotencyKey: `verified:${requestId}`,
        description: verifiedMaterials.map((item) => `${item.verifiedKg} kg at ${rateByMaterial.get(item.materialId)?.pointsPerKg ?? 0} points/kg`).join(", "),
      } });
    }
    await transaction.notification.createMany({ data: [
      { userId: current.requesterId, type: "MATERIAL_VERIFIED", title: "Recycling confirmed", body: `Your recycling has been confirmed. The facility verified ${verifiedKg} kg of ${current.material.name}.`, metadata: { requestId } },
      ...(pointsAwarded > 0 ? [{ userId: current.requesterId, type: "POINTS_AWARDED" as const, title: "Points added", body: `${pointsAwarded} points were added to your wallet.`, metadata: { requestId } }] : []),
    ] });
    const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
    if (admins.length) await transaction.notification.createMany({ data: admins.map(({ id }) => ({
      userId: id,
      type: "MATERIAL_VERIFIED",
      title: "Collection weight verified",
      body: `${verifiedKg} kg of ${current.material.name} was verified.`,
      metadata: { requestId },
    })) });
    return transaction.collectionRequest.findUniqueOrThrow({ where: { id: requestId }, include: requestInclude() });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.json({ data: { request: verified, pointsAwarded, randValue: pointsAwarded * 0.2, pointsPerKg: activeRate?.pointsPerKg ?? 0 } });
}));

collectionsRouter.get("/rewards", asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.RECYCLER) throw new ApiError(403, "FORBIDDEN", "Only recyclers can view a personal rewards wallet.");
  const [wallet, materials, redemptions, transactions, rewards] = await Promise.all([
    prisma.rewardWallet.findUnique({ where: { userId: request.auth!.userId } }),
    prisma.material.findMany({ where: { isActive: true }, include: { rewardRates: { where: { endsAt: null }, orderBy: { startsAt: "desc" }, take: 1 } }, orderBy: { name: "asc" } }),
    prisma.rewardRedemption.findMany({ where: { wallet: { userId: request.auth!.userId } }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.rewardTransaction.findMany({ where: { wallet: { userId: request.auth!.userId } }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.rewardCatalogItem.findMany({ where: { isAvailable: true }, orderBy: { pointsCost: "asc" } }),
  ]);
  response.json({ data: {
    pointsBalance: wallet?.pointsBalance ?? 0,
    pointValueRand: 0.2,
    rewards: rewards.map(({ id, name, description, pointsCost }) => ({ id, name, description, pointsCost, available: true })),
    rates: materials.map((material) => ({ material: material.name, pointsPerKg: material.rewardRates[0]?.pointsPerKg ?? 0 })),
    redemptions: redemptions.map((redemption) => ({
      id: redemption.id,
      reference: redemption.reference,
      type: redemption.type,
      pointsCost: redemption.pointsCost,
      valueCents: redemption.valueCents,
      status: redemption.status,
      rewardName: redemption.rewardName,
      meterNumberMasked: redemption.meterNumber ? `****${redemption.meterNumber.slice(-4)}` : null,
      createdAt: redemption.createdAt,
    })),
    transactions: transactions.map(({ id, type, pointsDelta, randValueCents, description, createdAt }) => ({ id, type, pointsDelta, randValueCents, description, createdAt })),
  } });
}));

collectionsRouter.get("/notifications", asyncHandler(async (request, response) => {
  const userId = requireNotificationOwner(request);
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  response.json({ data: notifications });
}));

collectionsRouter.post("/notifications/:notificationId/read", asyncHandler(async (request, response) => {
  const userId = requireNotificationOwner(request);
  const notificationId = pathParam(request, "notificationId");
  const updated = await prisma.notification.updateMany({ where: { id: notificationId, userId, readAt: null }, data: { readAt: new Date() } });
  if (updated.count === 0) {
    const existing = await prisma.notification.findFirst({ where: { id: notificationId, userId }, select: { id: true, readAt: true } });
    if (!existing) throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "Notification was not found.");
    response.json({ data: { id: existing.id, read: Boolean(existing.readAt) } });
    return;
  }
  response.json({ data: { id: notificationId, read: true } });
}));

collectionsRouter.post("/reports", validateBody(reportSubmissionSchema), asyncHandler(async (request, response) => {
  const userId = requireRecycler(request);
  const input = reportSubmissionSchema.parse(request.body);
  const facility = input.facilityId ? await prisma.facility.findUnique({ where: { id: input.facilityId }, select: { id: true, latitude: true, longitude: true } }) : null;
  if (input.facilityId) {
    if (!facility) throw new ApiError(404, "FACILITY_NOT_FOUND", "The reported facility was not found.");
  }
  const latitude = input.latitude ?? facility?.latitude ?? input.suggestedLatitude ?? null;
  const longitude = input.longitude ?? facility?.longitude ?? input.suggestedLongitude ?? null;
  const incidentTypes = new Set<ReportType>([
    ReportType.OVERFLOWING_BIN,
    ReportType.OVERFLOWING_DROP_OFF,
    ReportType.FACILITY_FULL,
    ReportType.FACILITY_CLOSED,
    ReportType.INCORRECT_OPENING_HOURS,
    ReportType.COLLECTOR_PROBLEM,
    ReportType.COLLECTION_PROBLEM,
    ReportType.SAFETY_ISSUE,
    ReportType.ILLEGAL_DUMPING,
    ReportType.BROKEN_GLASS,
    ReportType.HAZARDOUS_WASTE,
  ]);
  const createsIncident = incidentTypes.has(input.type as ReportType);
  if (createsIncident && (latitude === null || longitude === null)) throw new ApiError(400, "REPORT_LOCATION_REQUIRED", "Provide coordinates or select a facility for this issue.");
  const recyclerProfile = await prisma.recyclerProfile.findUnique({ where: { userId }, select: { collectionLatitude: true, collectionLongitude: true } });
  const proximityKm = recyclerProfile?.collectionLatitude === null || recyclerProfile?.collectionLatitude === undefined || recyclerProfile.collectionLongitude === null
    ? null
    : distanceBetweenKm(
      { latitude: recyclerProfile.collectionLatitude, longitude: recyclerProfile.collectionLongitude },
      { latitude: latitude ?? recyclerProfile.collectionLatitude, longitude: longitude ?? recyclerProfile.collectionLongitude },
    );

  const report = await prisma.$transaction(async (transaction) => {
    const now = new Date();
    let incidentId: string | undefined;
    let incidentSummary: { id: string; reportCount: number; communityVerified: boolean; priority: string } | undefined;
    if (createsIncident && latitude !== null && longitude !== null) {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.type}))`;
      const candidates = await transaction.incident.findMany({
        where: { type: input.type as ReportType, resolvedAt: null, lastReportedAt: { gte: new Date(now.getTime() - 6 * 60 * 60 * 1000) } },
        orderBy: { lastReportedAt: "desc" },
        take: 100,
      });
      const existing = candidates.find((candidate) => shouldGroupIncident({
        existingType: candidate.type,
        incomingType: input.type as ReportType,
        existingFacilityId: candidate.facilityId,
        incomingFacilityId: input.facilityId ?? null,
        existingPosition: { latitude: candidate.latitude, longitude: candidate.longitude },
        incomingPosition: { latitude, longitude },
        lastReportedAt: candidate.lastReportedAt,
        now,
      }));
      const reportCount = (existing?.reportCount ?? 0) + 1;
      const firstReportedAt = existing?.firstReportedAt ?? now;
      const calculation = calculateIncidentPriorityScore({
        type: input.type as ReportType,
        reportCount,
        waitingHours: (now.getTime() - firstReportedAt.getTime()) / (60 * 60 * 1000),
        facilityUrgency: input.type === ReportType.FACILITY_FULL || input.type === ReportType.FACILITY_CLOSED,
        proximityKm,
        proximitySource: proximityKm === null ? "REMOTE" : "REGISTERED",
      });
      const communityVerified = reportCount >= 2;
      const savedIncident = existing
        ? await transaction.incident.update({ where: { id: existing.id }, data: {
          reportCount,
          communityVerified,
          priority: existing.priorityOverridden ? existing.priority : calculation.priority,
          priorityScore: calculation.score,
          priorityFactors: calculation.factors,
          lastReportedAt: now,
        } })
        : await transaction.incident.create({ data: {
          type: input.type as ReportType,
          priority: calculation.priority,
          priorityScore: calculation.score,
          priorityFactors: calculation.factors,
          facilityId: input.facilityId,
          latitude,
          longitude,
          reportCount,
          communityVerified,
          firstReportedAt: now,
          lastReportedAt: now,
        } });
      incidentId = savedIncident.id;
      incidentSummary = { id: savedIncident.id, reportCount: savedIncident.reportCount, communityVerified: savedIncident.communityVerified, priority: savedIncident.priority };
    }
    const created = await transaction.report.create({ data: {
      reporterId: userId,
      facilityId: input.facilityId,
      type: input.type as ReportType,
      description: input.description,
      latitude,
      longitude,
      incidentId,
      suggestedName: input.suggestedName,
      suggestedAddress: input.suggestedAddress,
      suggestedLatitude: input.suggestedLatitude,
      suggestedLongitude: input.suggestedLongitude,
      suggestedAcceptedMaterials: input.suggestedAcceptedMaterials ?? [],
    } });
    const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
    await transaction.notification.create({ data: {
      userId,
      type: "REPORT_SUBMITTED",
      title: incidentSummary?.priority === "CRITICAL" ? "Critical issue reported" : "Report submitted",
      body: incidentSummary?.priority === "CRITICAL" ? "Your report was classified as a critical issue." : "Your report has been sent for review.",
      metadata: { reportId: created.id, ...(incidentSummary ? { incidentId: incidentSummary.id } : {}) },
    } });
    const facilityIssueTypes = new Set<ReportType>([
      ReportType.OVERFLOWING_BIN,
      ReportType.OVERFLOWING_DROP_OFF,
      ReportType.FACILITY_FULL,
      ReportType.FACILITY_CLOSED,
      ReportType.INCORRECT_OPENING_HOURS,
    ]);
    if (input.facilityId && facilityIssueTypes.has(input.type as ReportType)) {
      await notifyActiveCollectorsOfFacilityIssue(transaction, input.facilityId, created.id);
    }
    if (admins.length) await transaction.notification.createMany({ data: admins.map(({ id }) => ({
      userId: id,
      type: "REPORT_SUBMITTED",
      title: incidentSummary?.communityVerified && incidentSummary.reportCount === 2
        ? "Community verified incident"
        : incidentSummary?.priority === "CRITICAL"
          ? "Critical incident reported"
          : incidentSummary?.priority === "HIGH"
            ? "High-priority incident reported"
            : "New report submitted",
      body: incidentSummary?.communityVerified && incidentSummary.reportCount === 2
        ? `A ${input.type.toLowerCase().replaceAll("_", " ")} incident now has multiple community reports.`
        : `${request.auth!.displayName ?? request.auth!.email} submitted a ${input.type.toLowerCase().replaceAll("_", " ")} report.`,
      metadata: { reportId: created.id },
    })) });
    return created;
  });
  response.status(201).json({ data: { id: report.id, status: report.status, incident: report.incidentId ? await prisma.incident.findUnique({ where: { id: report.incidentId }, select: { id: true, reportCount: true, communityVerified: true, priority: true } }) : null } });
}));

async function createRedemption(request: Request, pointsCost: number, type: RedemptionType, options: { meterNumber?: string; rewardId?: string; rewardName?: string; idempotencyKey?: string } = {}) {
  const reference = `WW-${randomUUID().slice(0, 8).toUpperCase()}`;
  const redemption = await prisma.$transaction(async (transaction) => {
    if (options.idempotencyKey) {
      const previous = await transaction.rewardRedemption.findUnique({ where: { idempotencyKey: options.idempotencyKey } });
      if (previous) {
        const wallet = await transaction.rewardWallet.findUnique({ where: { id: previous.walletId }, select: { userId: true } });
        if (wallet?.userId !== request.auth!.userId) throw new ApiError(409, "IDEMPOTENCY_KEY_IN_USE", "This redemption key is already in use.");
        return previous;
      }
    }
    const wallet = await transaction.rewardWallet.findUnique({ where: { userId: request.auth!.userId } });
    if (!wallet || wallet.pointsBalance < pointsCost) throw new ApiError(409, "INSUFFICIENT_POINTS", "There are not enough points for this redemption.");
    const changed = await transaction.rewardWallet.updateMany({ where: { id: wallet.id, pointsBalance: { gte: pointsCost } }, data: { pointsBalance: { decrement: pointsCost } } });
    if (changed.count !== 1) throw new ApiError(409, "INSUFFICIENT_POINTS", "There are not enough points for this redemption.");
    const valueCents = pointsCost * 20;
    const created = await transaction.rewardRedemption.create({ data: {
      walletId: wallet.id,
      idempotencyKey: options.idempotencyKey,
      reference,
      type,
      meterNumber: options.meterNumber,
      rewardId: options.rewardId,
      rewardName: options.rewardName,
      pointsCost,
      valueCents,
    } });
    await transaction.rewardTransaction.create({ data: {
      walletId: wallet.id,
      redemptionId: created.id,
      type: RewardTransactionType.REDEEM,
      pointsDelta: -pointsCost,
      randValueCents: valueCents,
      idempotencyKey: `redemption:${created.id}`,
      description: `Reward redemption request ${reference}`,
    } });
    await transaction.notification.create({ data: {
      userId: request.auth!.userId,
      type: "REWARD_REDEEMED",
      title: type === RedemptionType.ELECTRICITY ? "Electricity request submitted" : "Redemption requested",
      body: `${pointsCost} points (R${(valueCents / 100).toFixed(2)}) are awaiting Admin review.`,
      metadata: { redemptionId: created.id },
    } });
    const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
    if (admins.length) await transaction.notification.createMany({ data: admins.map(({ id }) => ({
      userId: id,
      type: "REWARD_REDEEMED",
      title: type === RedemptionType.ELECTRICITY ? "Electricity redemption requested" : "Reward redemption requested",
      body: `${request.auth!.displayName ?? request.auth!.email} requested a ${pointsCost}-point ${type === RedemptionType.ELECTRICITY ? "electricity" : "reward"} redemption.`,
      metadata: { redemptionId: created.id },
    })) });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return {
    id: redemption.id,
    reference: redemption.reference,
    type: redemption.type,
    pointsCost: redemption.pointsCost,
    valueCents: redemption.valueCents,
    randValue: redemption.valueCents / 100,
    status: redemption.status,
    rewardName: redemption.rewardName,
  };
}

collectionsRouter.post("/rewards/redemptions", validateBody(rewardRedemptionSchema), asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.RECYCLER) throw new ApiError(403, "FORBIDDEN", "Only recyclers can request a reward redemption.");
  const input = rewardOptionRedemptionSchema.parse(request.body);
  const reward = await prisma.rewardCatalogItem.findFirst({ where: { id: input.rewardId, isAvailable: true } });
  if (!reward) throw new ApiError(404, "REWARD_UNAVAILABLE", "This reward is no longer available.");
  const redemption = await createRedemption(request, reward.pointsCost, RedemptionType.REWARD, { rewardId: reward.id, rewardName: reward.name, idempotencyKey: input.idempotencyKey });
  response.status(201).json({ data: redemption });
}));

collectionsRouter.post("/rewards/redemptions/electricity", validateBody(electricityRedemptionSchema), asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.RECYCLER) throw new ApiError(403, "FORBIDDEN", "Only recyclers can request an electricity redemption.");
  const input = electricityRedemptionSchema.parse(request.body);
  const redemption = await createRedemption(request, input.pointsCost, RedemptionType.ELECTRICITY, { meterNumber: input.meterNumber });
  response.status(201).json({ data: redemption });
}));

export const collectionsRouterProtected = collectionsRouter;