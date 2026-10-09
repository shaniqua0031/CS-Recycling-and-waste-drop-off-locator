import { randomUUID } from "node:crypto";
import { Router, type Request, type RequestHandler, type Response } from "express";
import {
  AccountStatus,
  ApprovalStatus,
  AssignmentStatus,
  CollectionStatus,
  CollectorAvailability,
  FacilityOperationalStatus,
  Prisma,
  RedemptionStatus,
  ReportStatus,
  RewardTransactionType,
  UserRole,
} from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuthentication, requireRoles } from "../../middleware/authenticate";
import { validateBody } from "../../middleware/validate-body";
import { ApiError } from "../../utils/api-error";
import { rankCollectorCandidates, type CollectorCandidateInput } from "./admin.logic";
import { performAdminSimulatorAction } from "./admin-simulator.logic";
import { collectionPrioritySchema } from "../collections/collections.schemas";
import {
  accountStatusSchema,
  approvalDecisionSchema,
  assignmentSchema,
  collectorMessageSchema,
  incidentAssignmentSchema,
  incidentPriorityOverrideSchema,
  incidentResolutionSchema,
  materialRateSchema,
  maintenanceOverrunSchema,
  maintenanceWindowSchema,
  notificationReadSchema,
  redemptionDecisionSchema,
  reportStatusSchema,
  requestCancellationSchema,
  sensorEventSchema,
  sensorResetSchema,
  simulatorActionSchema,
} from "./admin.schemas";

const adminRouter = Router();
const activeAssignmentStatuses = [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED];
const activeCollectionStatuses = [
  CollectionStatus.COLLECTOR_ASSIGNED,
  CollectionStatus.COLLECTOR_ON_THE_WAY,
  CollectionStatus.COLLECTOR_ARRIVED,
  CollectionStatus.COLLECTING,
  CollectionStatus.PAUSED,
  CollectionStatus.COLLECTED,
  CollectionStatus.VERIFICATION_PENDING,
];

adminRouter.use(requireAuthentication, requireRoles(UserRole.ADMIN));

function asyncHandler(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

function adminId(request: Request): string {
  return request.auth!.userId;
}

function pathParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== "string" || value.length === 0) throw new ApiError(400, "INVALID_PATH", "A required path value is missing.");
  return value;
}

async function addAudit(
  transaction: Prisma.TransactionClient,
  actorId: string,
  entityType: string,
  entityId: string,
  action: string,
  reason?: string,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  await transaction.adminAuditLog.create({
    data: { adminId: actorId, entityType, entityId, action, reason, metadata },
  });
}

function approvalToAccountStatus(status: ApprovalStatus): AccountStatus {
  return status === ApprovalStatus.APPROVED ? AccountStatus.ACTIVE : AccountStatus.PENDING_APPROVAL;
}

function todayStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function requestInclude() {
  return {
    requester: { include: { recyclerProfile: true } },
    material: true,
    destinationFacility: true,
    assignments: {
      include: { collector: { include: { user: { include: { recyclerProfile: true } } } } },
      orderBy: { assignedAt: "desc" as const },
    },
    statusEvents: {
      include: { actor: { select: { id: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" as const },
      take: 20,
    },
    weight: true,
  };
}

async function collectorCandidatesForRequest(requestId: string) {
  const request = await prisma.collectionRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new ApiError(404, "NOT_FOUND", "Collection request was not found.");

  const profiles = await prisma.collectorProfile.findMany({
    where: {
      approvalStatus: ApprovalStatus.APPROVED,
      availability: CollectorAvailability.AVAILABLE,
      user: { status: AccountStatus.ACTIVE },
    },
    include: {
      user: { include: { recyclerProfile: true } },
      assignments: { where: { status: { in: activeAssignmentStatuses } }, select: { id: true } },
    },
  });

  const inputs: CollectorCandidateInput[] = profiles.map((profile) => ({
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

  return rankCollectorCandidates(
    { latitude: request.pickupLatitude, longitude: request.pickupLongitude },
    inputs,
    { requiredMaterialId: request.materialId },
  );
}

adminRouter.get("/overview", asyncHandler(async (_request, response) => {
  const today = todayStart();
  const [
    totalUsers,
    activeCollectors,
    onlineCollectors,
    facilities,
    pendingRequests,
    activePickups,
    completedToday,
    pendingCollectorApprovals,
    pendingFacilityApprovals,
    verifiedWeight,
    pointsIssued,
    pointsRedeemed,
    rewardsRedeemed,
    completedCollections,
    activeFacilities,
    criticalIncidents,
  ] = await Promise.all([
    prisma.user.count({ where: { role: { not: UserRole.ADMIN } } }),
    prisma.collectorProfile.count({ where: { approvalStatus: ApprovalStatus.APPROVED, availability: CollectorAvailability.AVAILABLE, user: { status: AccountStatus.ACTIVE } } }),
    prisma.collectorProfile.count({ where: { approvalStatus: ApprovalStatus.APPROVED, availability: { in: [CollectorAvailability.AVAILABLE, CollectorAvailability.ON_COLLECTION] }, user: { status: AccountStatus.ACTIVE } } }),
    prisma.facility.count({ where: { approvalStatus: ApprovalStatus.APPROVED, isSuspended: false } }),
    prisma.collectionRequest.count({ where: { status: { in: [CollectionStatus.PENDING, CollectionStatus.WAITING_FOR_ADMIN] } } }),
    prisma.collectionRequest.count({ where: { status: { in: activeCollectionStatuses } } }),
    prisma.collectionRequest.count({ where: { status: CollectionStatus.COMPLETED, updatedAt: { gte: today } } }),
    prisma.collectorProfile.count({ where: { approvalStatus: ApprovalStatus.PENDING } }),
    prisma.facility.count({ where: { approvalStatus: ApprovalStatus.PENDING, isSuspended: false } }),
    prisma.collectionWeight.aggregate({ where: { verifiedKg: { not: null } }, _sum: { verifiedKg: true } }),
    prisma.rewardTransaction.aggregate({ where: { type: RewardTransactionType.EARN }, _sum: { pointsDelta: true } }),
    prisma.rewardTransaction.aggregate({ where: { type: RewardTransactionType.REDEEM }, _sum: { pointsDelta: true } }),
    prisma.rewardRedemption.count({ where: { status: RedemptionStatus.FULFILLED } }),
    prisma.collectionRequest.count({ where: { status: CollectionStatus.COMPLETED } }),
    prisma.facility.count({ where: { approvalStatus: ApprovalStatus.APPROVED, isSuspended: false, operationalStatus: { in: [FacilityOperationalStatus.OPEN, FacilityOperationalStatus.NEAR_CAPACITY, FacilityOperationalStatus.FULL] } } }),
    prisma.incident.count({ where: { priority: "CRITICAL", resolvedAt: null } }),
  ]);

  response.json({ data: {
    totalUsers,
    activeCollectors,
    onlineCollectors,
    facilities,
    activeFacilities,
    pendingRequests,
    activePickups,
    activeCollectionRequests: activePickups,
    criticalIncidents,
    completedCollections,
    completedToday,
    pendingCollectorApprovals,
    pendingFacilityApprovals,
    totalRecycledKg: Number(verifiedWeight._sum.verifiedKg ?? 0),
    pointsIssued: pointsIssued._sum.pointsDelta ?? 0,
    pointsRedeemed: Math.abs(pointsRedeemed._sum.pointsDelta ?? 0),
    rewardsRedeemed,
  } });
}));

adminRouter.get("/users", asyncHandler(async (request, response) => {
  const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
  const users = await prisma.user.findMany({
    where: {
      role: UserRole.RECYCLER,
      ...(search ? { OR: [
        { email: { contains: search, mode: "insensitive" } },
        { recyclerProfile: { displayName: { contains: search, mode: "insensitive" } } },
      ] } : {}),
    },
    include: {
      recyclerProfile: true,
      rewardWallet: { include: { transactions: { orderBy: { createdAt: "desc" }, take: 10 } } },
      createdCollectionRequests: { include: { material: true, weight: true }, orderBy: { createdAt: "desc" }, take: 10 },
      _count: { select: { createdCollectionRequests: true, reports: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const verifiedWeights = users.length ? await prisma.collectionWeight.findMany({
    where: { verifiedKg: { not: null }, request: { requesterId: { in: users.map((user) => user.id) } } },
    select: { verifiedKg: true, request: { select: { requesterId: true } } },
  }) : [];
  const verifiedKgByUser = new Map<string, number>();
  for (const weight of verifiedWeights) {
    const requesterId = weight.request.requesterId;
    verifiedKgByUser.set(requesterId, (verifiedKgByUser.get(requesterId) ?? 0) + Number(weight.verifiedKg ?? 0));
  }
  response.json({ data: users.map((user) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    displayName: user.recyclerProfile?.displayName ?? user.email,
    collections: user._count.createdCollectionRequests,
    totalRecycledKg: verifiedKgByUser.get(user.id) ?? 0,
    reports: user._count.reports,
    pointsBalance: user.rewardWallet?.pointsBalance ?? 0,
    recentTransactions: user.rewardWallet?.transactions ?? [],
    recentCollections: user.createdCollectionRequests,
  })) });
}));

adminRouter.patch("/users/:userId/status", validateBody(accountStatusSchema), asyncHandler(async (request, response) => {
  const target = await prisma.user.findUnique({ where: { id: pathParam(request, "userId") }, select: { id: true, role: true, status: true } });
  if (!target || target.role === UserRole.ADMIN) throw new ApiError(404, "NOT_FOUND", "Manageable user was not found.");
  if (target.id === adminId(request)) throw new ApiError(400, "INVALID_ACTION", "An Admin cannot suspend their own account.");
  const input = accountStatusSchema.parse(request.body);

  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({ where: { id: target.id }, data: { status: input.status } });
    if (input.status === AccountStatus.SUSPENDED) {
      await transaction.session.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await addAudit(transaction, adminId(request), "USER", target.id, input.status, input.reason, { fromStatus: target.status, toStatus: input.status });
  });
  response.json({ data: { id: target.id, status: input.status } });
}));

adminRouter.get("/collectors", asyncHandler(async (_request, response) => {
  const collectors = await prisma.collectorProfile.findMany({
    include: {
      user: { include: { recyclerProfile: true } },
      assignments: {
        where: { status: { in: [...activeAssignmentStatuses, AssignmentStatus.COMPLETED, AssignmentStatus.DECLINED] } },
        include: { request: { include: { material: true, weight: true } } },
        orderBy: { assignedAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  response.json({ data: collectors.map((collector) => ({
    id: collector.id,
    userId: collector.userId,
    displayName: collector.user.recyclerProfile?.displayName ?? collector.user.email,
    email: collector.user.email,
    accountStatus: collector.user.status,
    approvalStatus: collector.approvalStatus,
    availability: collector.availability,
    serviceArea: collector.serviceArea,
    serviceRadiusKm: collector.serviceRadiusKm,
    vehicleType: collector.vehicleType,
    vehicleDescription: collector.vehicleDescription,
    vehicleRegistration: collector.vehicleRegistration,
    currentLatitude: collector.currentLatitude,
    currentLongitude: collector.currentLongitude,
    lastLocationUpdatedAt: collector.lastLocationUpdatedAt,
    currentCollection: collector.assignments.find((assignment) => assignment.status === AssignmentStatus.ASSIGNED || assignment.status === AssignmentStatus.ACCEPTED)?.request ?? null,
    workload: collector.assignments.filter((assignment) => assignment.status === AssignmentStatus.ASSIGNED || assignment.status === AssignmentStatus.ACCEPTED).length,
    completedJobs: collector.assignments.filter((assignment) => assignment.status === AssignmentStatus.COMPLETED).length,
    declinedJobs: collector.assignments.filter((assignment) => assignment.status === AssignmentStatus.DECLINED).length,
    totalCollectedKg: collector.assignments.filter((assignment) => assignment.status === AssignmentStatus.COMPLETED)
      .reduce((total, assignment) => total + Number(assignment.request.weight?.verifiedKg ?? assignment.request.weight?.actualKg ?? 0), 0),
    averageResponseTimeMinutes: (() => {
      const responseTimes = collector.assignments.flatMap((assignment) => assignment.acceptedAt
        ? [(assignment.acceptedAt.getTime() - assignment.assignedAt.getTime()) / 60_000]
        : []);
      return responseTimes.length ? responseTimes.reduce((sum, minutes) => sum + minutes, 0) / responseTimes.length : null;
    })(),
  })) });
}));

adminRouter.post("/collectors/:profileId/messages", validateBody(collectorMessageSchema), asyncHandler(async (request, response) => {
  const profileId = pathParam(request, "profileId");
  const { message } = collectorMessageSchema.parse(request.body);
  const profile = await prisma.collectorProfile.findUnique({ where: { id: profileId }, select: { id: true, userId: true } });
  if (!profile) throw new ApiError(404, "NOT_FOUND", "Collector profile was not found.");
  await prisma.$transaction(async (transaction) => {
    await transaction.notification.create({
      data: { userId: profile.userId, type: "ADMIN_MESSAGE", title: "Message from Admin", body: message, metadata: { profileId } },
    });
    await addAudit(transaction, adminId(request), "COLLECTOR", profile.id, "MESSAGE_SENT", undefined, { message });
  });
  response.status(201).json({ data: { sent: true, profileId } });
}));

adminRouter.patch("/collectors/:profileId/approval", validateBody(approvalDecisionSchema), asyncHandler(async (request, response) => {
  const input = approvalDecisionSchema.parse(request.body);
  const profile = await prisma.collectorProfile.findUnique({ where: { id: pathParam(request, "profileId") }, include: { user: true } });
  if (!profile) throw new ApiError(404, "NOT_FOUND", "Collector profile was not found.");

  await prisma.$transaction(async (transaction) => {
    await transaction.collectorProfile.update({
      where: { id: profile.id },
      data: {
        approvalStatus: input.status,
        ...(input.status === ApprovalStatus.APPROVED ? { availability: CollectorAvailability.AVAILABLE } : { availability: CollectorAvailability.OFFLINE }),
      },
    });
    await addAudit(transaction, adminId(request), "COLLECTOR", profile.id, input.status, input.reason);
    await transaction.notification.create({ data: {
      userId: profile.userId,
      type: "COLLECTOR_REGISTRATION",
      title: input.status === ApprovalStatus.APPROVED ? "Collector approved" : "Collector application update",
      body: input.status === ApprovalStatus.APPROVED ? "Your collector account is approved and ready." : `Your collector application was rejected. ${input.reason ?? ""}`.trim(),
    } });
  });
  response.json({ data: { id: profile.id, approvalStatus: input.status } });
}));

adminRouter.get("/facilities", asyncHandler(async (_request, response) => {
  const [facilities, incomingRequests] = await Promise.all([
    prisma.facility.findMany({
      include: {
        materials: { include: { material: true } },
        openingHours: { orderBy: { dayOfWeek: "asc" } },
        memberships: { include: { user: { include: { recyclerProfile: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.collectionRequest.groupBy({
      by: ["destinationFacilityId"],
      where: { destinationFacilityId: { not: null }, status: { in: [CollectionStatus.PENDING, CollectionStatus.WAITING_FOR_ADMIN, ...activeCollectionStatuses] } },
      _count: { _all: true },
    }),
  ]);
  const incomingByFacility = new Map(incomingRequests.flatMap((item) => item.destinationFacilityId ? [[item.destinationFacilityId, item._count._all] as const] : []));
  response.json({ data: facilities.map((facility) => ({
    ...facility,
    acceptedMaterials: facility.materials.map((entry) => entry.material.name),
    capacity: facility.materials.map((entry) => {
      const capacityKg = entry.capacityKg === null ? null : Number(entry.capacityKg);
      const currentKg = Number(entry.currentKg);
      const percentage = capacityKg === null || capacityKg <= 0 ? null : (currentKg / capacityKg) * 100;
      return {
        materialId: entry.materialId,
        material: entry.material.name,
        capacityKg,
        currentKg,
        percentage,
        level: percentage === null ? "UNCONFIGURED" : percentage >= 100 ? "FULL" : percentage >= 95 ? "CRITICAL" : percentage >= 80 ? "NEAR_CAPACITY" : "NORMAL",
      };
    }),
    incomingCollections: incomingByFacility.get(facility.id) ?? 0,
    owner: facility.memberships[0] ? {
      id: facility.memberships[0].user.id,
      email: facility.memberships[0].user.email,
      displayName: facility.memberships[0].user.recyclerProfile?.displayName ?? facility.memberships[0].user.email,
    } : null,
  })) });
}));

adminRouter.patch("/facilities/:facilityId/approval", validateBody(approvalDecisionSchema), asyncHandler(async (request, response) => {
  const input = approvalDecisionSchema.parse(request.body);
  const facility = await prisma.facility.findUnique({ where: { id: pathParam(request, "facilityId") } });
  if (!facility) throw new ApiError(404, "NOT_FOUND", "Facility was not found.");
  await prisma.$transaction(async (transaction) => {
    await transaction.facility.update({ where: { id: facility.id }, data: { approvalStatus: input.status } });
    await addAudit(transaction, adminId(request), "FACILITY", facility.id, input.status, input.reason);
    const memberships = await transaction.facilityMembership.findMany({ where: { facilityId: facility.id }, select: { userId: true } });
    if (memberships.length) {
      await transaction.notification.createMany({ data: memberships.map(({ userId }) => ({
        userId,
        facilityId: facility.id,
        type: "FACILITY_REGISTRATION",
        title: input.status === ApprovalStatus.APPROVED ? "Facility approved" : "Facility application update",
        body: input.status === ApprovalStatus.APPROVED ? `${facility.name} is approved.` : `${facility.name} was rejected. ${input.reason ?? ""}`.trim(),
      })) });
    }
  });
  response.json({ data: { id: facility.id, approvalStatus: input.status } });
}));

adminRouter.patch("/facilities/:facilityId/status", validateBody(accountStatusSchema), asyncHandler(async (request, response) => {
  const input = accountStatusSchema.parse(request.body);
  const facility = await prisma.facility.findUnique({ where: { id: pathParam(request, "facilityId") } });
  if (!facility) throw new ApiError(404, "NOT_FOUND", "Facility was not found.");
  const isSuspended = input.status === AccountStatus.SUSPENDED;
  await prisma.$transaction(async (transaction) => {
    await transaction.facility.update({ where: { id: facility.id }, data: { isSuspended } });
    await addAudit(transaction, adminId(request), "FACILITY", facility.id, input.status, input.reason, { fromSuspended: facility.isSuspended, toSuspended: isSuspended });
  });
  response.json({ data: { id: facility.id, isSuspended } });
}));

adminRouter.post("/facilities/:facilityId/message", validateBody(collectorMessageSchema), asyncHandler(async (request, response) => {
  const facilityId = pathParam(request, "facilityId");
  const { message } = collectorMessageSchema.parse(request.body);
  const facility = await prisma.facility.findUnique({ where: { id: facilityId }, select: { id: true, name: true } });
  if (!facility) throw new ApiError(404, "NOT_FOUND", "Facility was not found.");
  await prisma.$transaction(async (transaction) => {
    const memberships = await transaction.facilityMembership.findMany({ where: { facilityId }, select: { userId: true } });
    if (!memberships.length) throw new ApiError(409, "FACILITY_HAS_NO_MEMBERS", "This facility has no members to notify.");
    await transaction.notification.createMany({ data: memberships.map(({ userId }) => ({
      userId,
      facilityId,
      type: "ADMIN_MESSAGE",
      title: "Message from Admin",
      body: message,
      metadata: { facilityId },
    })) });
    await addAudit(transaction, adminId(request), "FACILITY", facilityId, "MESSAGE_SENT", undefined, { message });
  });
  response.status(201).json({ data: { sent: true, facilityId } });
}));

adminRouter.get("/requests", asyncHandler(async (request, response) => {
  const status = typeof request.query.status === "string" && Object.values(CollectionStatus).includes(request.query.status as CollectionStatus)
    ? request.query.status as CollectionStatus
    : undefined;
  const requests = await prisma.collectionRequest.findMany({
    where: status ? { status } : undefined,
    include: requestInclude(),
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  response.json({ data: requests });
}));

adminRouter.get("/maintenance-windows", asyncHandler(async (_request, response) => {
  const windows = await prisma.facilityMaintenanceWindow.findMany({
    include: { facility: { select: { id: true, name: true, address: true } } },
    orderBy: { startsAt: "desc" },
    take: 100,
  });
  response.json({ data: windows });
}));

adminRouter.get("/simulator/events", asyncHandler(async (_request, response) => {
  const events = await prisma.adminSimulatorEvent.findMany({
    where: { resetAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  response.json({ data: events });
}));

adminRouter.post("/simulator/actions", validateBody(simulatorActionSchema), asyncHandler(async (request, response) => {
  const input = simulatorActionSchema.parse(request.body);
  const event = await performAdminSimulatorAction(adminId(request), input);
  response.status(201).json({ data: event });
}));

adminRouter.post("/maintenance-windows", validateBody(maintenanceWindowSchema), asyncHandler(async (request, response) => {
  const input = maintenanceWindowSchema.parse(request.body);
  const facility = await prisma.facility.findUnique({ where: { id: input.facilityId }, select: { id: true, name: true } });
  if (!facility) throw new ApiError(404, "NOT_FOUND", "Facility was not found.");
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  const window = await prisma.$transaction(async (transaction) => {
    const created = await transaction.facilityMaintenanceWindow.create({ data: {
      facilityId: facility.id,
      createdByUserId: adminId(request),
      startsAt,
      endsAt,
      gracePeriodMinutes: input.gracePeriodMinutes,
      status: startsAt <= new Date() ? "ACTIVE" : "SCHEDULED",
    } });
    const affected = await transaction.collectionRequest.findMany({
      where: {
        destinationFacilityId: facility.id,
        requestedFor: { gte: startsAt, lt: endsAt },
        status: { in: [CollectionStatus.PENDING, CollectionStatus.WAITING_FOR_ADMIN] },
      },
      select: { id: true, status: true },
    });
    if (affected.length) {
      await transaction.collectionRequest.updateMany({
        where: { id: { in: affected.map(({ id }) => id) } },
        data: { status: CollectionStatus.SCHEDULED_MAINTENANCE, maintenanceWindowId: created.id },
      });
      await transaction.collectionStatusEvent.createMany({ data: affected.map((item) => ({
        requestId: item.id,
        actorId: adminId(request),
        fromStatus: item.status,
        toStatus: CollectionStatus.SCHEDULED_MAINTENANCE,
        note: `Held for scheduled maintenance at ${facility.name}.`,
      })) });
    }
    await addAudit(transaction, adminId(request), "FACILITY", facility.id, "MAINTENANCE_SCHEDULED", undefined, {
      maintenanceWindowId: created.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      gracePeriodMinutes: input.gracePeriodMinutes,
      affectedRequests: affected.length,
    });
    return created;
  });
  response.status(201).json({ data: { ...window, facility, affectedRequests: await prisma.collectionRequest.count({ where: { maintenanceWindowId: window.id } }) } });
}));

adminRouter.patch("/maintenance-windows/:windowId/overrun", validateBody(maintenanceOverrunSchema), asyncHandler(async (request, response) => {
  const windowId = pathParam(request, "windowId");
  const { enabled } = maintenanceOverrunSchema.parse(request.body);
  const window = await prisma.facilityMaintenanceWindow.findUnique({ where: { id: windowId } });
  if (!window || ["COMPLETE", "OVERRUN"].includes(window.status)) throw new ApiError(404, "ACTIVE_MAINTENANCE_NOT_FOUND", "An active maintenance window was not found.");
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.facilityMaintenanceWindow.update({ where: { id: window.id }, data: { overrunEnabled: enabled } });
    await addAudit(transaction, adminId(request), "FACILITY", window.facilityId, enabled ? "MAINTENANCE_OVERRUN_ENABLED" : "MAINTENANCE_OVERRUN_DISABLED", undefined, { maintenanceWindowId: window.id });
    return result;
  });
  response.json({ data: updated });
}));

adminRouter.get("/sensors", asyncHandler(async (request, response) => {
  const facilityId = typeof request.query.facilityId === "string" ? request.query.facilityId : undefined;
  const events = await prisma.facilitySensorEvent.findMany({
    where: { expiresAt: { gt: new Date() }, resetAt: null, ...(facilityId ? { facilityId } : {}) },
    include: { facility: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  response.json({ data: events });
}));

adminRouter.post("/sensors/spike", validateBody(sensorEventSchema), asyncHandler(async (request, response) => {
  const input = sensorEventSchema.parse(request.body);
  const facility = await prisma.facility.findUnique({ where: { id: input.facilityId }, select: { id: true, name: true } });
  if (!facility) throw new ApiError(404, "NOT_FOUND", "Facility was not found.");
  const event = await prisma.$transaction(async (transaction) => {
    const created = await transaction.facilitySensorEvent.create({ data: {
      facilityId: facility.id,
      createdByUserId: adminId(request),
      reading: input.reading,
      expiresAt: new Date(Date.now() + 6000),
    } });
    await addAudit(transaction, adminId(request), "FACILITY_SENSOR", created.id, "SENSOR_SPIKE_TRIGGERED", undefined, { facilityId: facility.id, reading: input.reading, expiresAt: created.expiresAt.toISOString() });
    return created;
  });
  response.status(201).json({ data: { ...event, facility } });
}));

adminRouter.post("/sensors/reset", validateBody(sensorResetSchema), asyncHandler(async (request, response) => {
  const { facilityId } = sensorResetSchema.parse(request.body);
  const facility = await prisma.facility.findUnique({ where: { id: facilityId }, select: { id: true } });
  if (!facility) throw new ApiError(404, "NOT_FOUND", "Facility was not found.");
  const resetAt = new Date();
  const result = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.facilitySensorEvent.updateMany({
      where: { facilityId, resetAt: null, expiresAt: { gt: resetAt } },
      data: { resetAt },
    });
    await addAudit(transaction, adminId(request), "FACILITY_SENSOR", facilityId, "SENSOR_EVENTS_RESET", undefined, { resetCount: updated.count });
    return updated.count;
  });
  response.json({ data: { facilityId, resetCount: result } });
}));

adminRouter.get("/incidents", asyncHandler(async (request, response) => {
  const includeResolved = request.query.status === "ALL";
  const incidents = await prisma.incident.findMany({
    where: includeResolved ? undefined : { resolvedAt: null },
    include: {
      facility: { select: { id: true, name: true, address: true } },
      material: { select: { id: true, name: true } },
      assignedCollector: { include: { user: { include: { recyclerProfile: true } } } },
      reports: {
        select: {
          id: true,
          description: true,
          createdAt: true,
          reporter: { select: { recyclerProfile: { select: { displayName: true } } } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ resolvedAt: "asc" }, { priorityScore: "desc" }, { lastReportedAt: "asc" }],
    take: 200,
  });
  response.json({ data: incidents.map((incident) => ({
    ...incident,
    status: incident.resolvedAt ? "RESOLVED" : incident.communityVerified ? "COMMUNITY_VERIFIED" : "OPEN",
    assignedCollector: incident.assignedCollector ? {
      id: incident.assignedCollector.id,
      displayName: incident.assignedCollector.user.recyclerProfile?.displayName ?? "Collector",
      availability: incident.assignedCollector.availability,
    } : null,
    reports: incident.reports.map((report) => ({
      id: report.id,
      description: report.description,
      createdAt: report.createdAt,
      reporterName: report.reporter.recyclerProfile?.displayName ?? "Community member",
    })),
  })) });
}));

adminRouter.patch("/incidents/:incidentId/priority", validateBody(incidentPriorityOverrideSchema), asyncHandler(async (request, response) => {
  const incidentId = pathParam(request, "incidentId");
  const input = incidentPriorityOverrideSchema.parse(request.body);
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident || incident.resolvedAt) throw new ApiError(404, "ACTIVE_INCIDENT_NOT_FOUND", "An active incident was not found.");
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.incident.update({ where: { id: incident.id }, data: {
      priority: input.priority,
      priorityOverridden: true,
      priorityOverriddenByUserId: adminId(request),
      priorityOverrideReason: input.reason,
      priorityOverriddenAt: new Date(),
    } });
    await addAudit(transaction, adminId(request), "INCIDENT", incident.id, "PRIORITY_OVERRIDDEN", input.reason, {
      from: incident.priority,
      to: input.priority,
      score: incident.priorityScore,
    });
    return result;
  });
  response.json({ data: updated });
}));

adminRouter.patch("/incidents/:incidentId/assignment", validateBody(incidentAssignmentSchema), asyncHandler(async (request, response) => {
  const incidentId = pathParam(request, "incidentId");
  const { collectorProfileId } = incidentAssignmentSchema.parse(request.body);
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident || incident.resolvedAt) throw new ApiError(404, "ACTIVE_INCIDENT_NOT_FOUND", "An active incident was not found.");
  const collector = await prisma.collectorProfile.findUnique({
    where: { id: collectorProfileId },
    include: { user: { select: { id: true, status: true, role: true } } },
  });
  if (!collector || collector.user.status !== AccountStatus.ACTIVE || collector.approvalStatus !== ApprovalStatus.APPROVED) {
    throw new ApiError(409, "COLLECTOR_UNAVAILABLE", "Select an approved, active collector.");
  }
  const previousCollectorProfileId = incident.assignedCollectorProfileId;
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.incident.update({ where: { id: incident.id }, data: { assignedCollectorProfileId: collector.id } });
    await addAudit(transaction, adminId(request), "INCIDENT", incident.id, previousCollectorProfileId ? "REASSIGNED" : "ASSIGNED", undefined, {
      fromCollectorProfileId: previousCollectorProfileId,
      toCollectorProfileId: collector.id,
    });
    await transaction.notification.create({ data: {
      userId: collector.userId,
      type: "COLLECTOR_ASSIGNED",
      title: "Incident assigned",
      body: `Incident ${incident.id.slice(-8)} was assigned to you by Admin.`,
      metadata: { incidentId: incident.id },
    } });
    return result;
  });
  response.json({ data: updated });
}));

adminRouter.patch("/incidents/:incidentId/status", validateBody(incidentResolutionSchema), asyncHandler(async (request, response) => {
  const incidentId = pathParam(request, "incidentId");
  const input = incidentResolutionSchema.parse(request.body);
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) throw new ApiError(404, "NOT_FOUND", "Incident was not found.");
  const resolvedAt = input.status === "RESOLVED" ? incident.resolvedAt ?? new Date() : null;
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.incident.update({ where: { id: incident.id }, data: { resolvedAt, dedupeKey: null } });
    await addAudit(transaction, adminId(request), "INCIDENT", incident.id, input.status, input.reason, {
      fromStatus: incident.resolvedAt ? "RESOLVED" : "OPEN",
      toStatus: input.status,
    });
    return result;
  });
  response.json({ data: updated });
}));

adminRouter.patch("/requests/:requestId/priority", validateBody(collectionPrioritySchema), asyncHandler(async (request, response) => {
  const requestId = pathParam(request, "requestId");
  const { priority, reason } = collectionPrioritySchema.parse(request.body);
  const current = await prisma.collectionRequest.findUnique({
    where: { id: requestId },
    include: { assignments: { where: { status: { in: activeAssignmentStatuses } }, include: { collector: { select: { userId: true } } } } },
  });
  if (!current) throw new ApiError(404, "NOT_FOUND", "Collection request was not found.");
  if (current.status === CollectionStatus.VERIFIED || current.status === CollectionStatus.COMPLETED || current.status === CollectionStatus.CANCELLED || current.status === CollectionStatus.REJECTED) {
    throw new ApiError(409, "REQUEST_NOT_ACTIVE", "Priority cannot be changed after a collection is closed.");
  }
  if (current.priority === priority) {
    const unchanged = await prisma.collectionRequest.findUniqueOrThrow({ where: { id: requestId }, include: requestInclude() });
    response.json({ data: unchanged });
    return;
  }

  const updated = await prisma.$transaction(async (transaction) => {
    await transaction.collectionRequest.update({ where: { id: requestId }, data: { priority } });
    await transaction.collectionStatusEvent.create({
      data: { requestId, actorId: adminId(request), fromStatus: current.status, toStatus: current.status, note: `Priority changed from ${current.priority} to ${priority}. ${reason}` },
    });
    await addAudit(transaction, adminId(request), "COLLECTION_REQUEST", requestId, "PRIORITY_CHANGED", reason, { from: current.priority, to: priority });
    const recipients = [current.requesterId, ...current.assignments.map((assignment) => assignment.collector.userId)];
    if (recipients.length) await transaction.notification.createMany({
      data: Array.from(new Set(recipients)).map((userId) => ({
        userId,
        type: "COLLECTION_PRIORITY_CHANGED",
        title: "Collection priority updated",
        body: `The collection priority changed to ${priority.toLowerCase()}.`,
        metadata: { requestId, priority },
      })),
    });
    return transaction.collectionRequest.findUniqueOrThrow({ where: { id: requestId }, include: requestInclude() });
  });
  response.json({ data: updated });
}));

adminRouter.get("/requests/:requestId/candidates", asyncHandler(async (request, response) => {
  response.json({ data: await collectorCandidatesForRequest(pathParam(request, "requestId")) });
}));

adminRouter.post("/requests/:requestId/assign", validateBody(assignmentSchema), asyncHandler(async (request, response) => {
  const input = assignmentSchema.parse(request.body);
  const requestId = pathParam(request, "requestId");
  const candidates = await collectorCandidatesForRequest(requestId);
  const candidate = candidates.find((item) => item.profileId === input.collectorProfileId);
  if (!candidate) throw new ApiError(409, "COLLECTOR_UNAVAILABLE", "This collector is not currently eligible for the request.");

  const assignmentId = randomUUID();
  await prisma.$transaction(async (transaction) => {
    const collectionRequest = await transaction.collectionRequest.findUnique({ where: { id: requestId } });
    if (!collectionRequest || (collectionRequest.status !== CollectionStatus.WAITING_FOR_ADMIN && collectionRequest.status !== CollectionStatus.COLLECTOR_ASSIGNED)) {
      throw new ApiError(409, "REQUEST_NOT_ASSIGNABLE", "Only waiting or not-yet-accepted requests can be assigned or reassigned.");
    }
    const previousAssignment = await transaction.collectionAssignment.findFirst({ where: { requestId, status: { in: activeAssignmentStatuses } }, include: { collector: { select: { id: true, userId: true } } } });
    const collector = await transaction.collectorProfile.findUnique({ where: { id: candidate.profileId }, include: { assignments: { where: { status: { in: activeAssignmentStatuses } }, select: { id: true } } } });
    if (!collector || collector.approvalStatus !== ApprovalStatus.APPROVED || collector.availability !== CollectorAvailability.AVAILABLE || collector.assignments.length !== candidate.activeWorkload) {
      throw new ApiError(409, "COLLECTOR_UNAVAILABLE", "This collector's status changed. Refresh candidates and try again.");
    }
    const changed = await transaction.collectionRequest.updateMany({
      where: { id: collectionRequest.id, status: collectionRequest.status },
      data: { status: CollectionStatus.COLLECTOR_ASSIGNED },
    });
    if (changed.count !== 1) throw new ApiError(409, "REQUEST_NOT_ASSIGNABLE", "Another Admin has already assigned this request.");

    if (previousAssignment) {
      await transaction.collectionAssignment.update({ where: { id: previousAssignment.id }, data: { status: AssignmentStatus.REVOKED, unassignedAt: new Date(), reason: "Reassigned by Admin" } });
      const remainingAssignments = await transaction.collectionAssignment.count({ where: { collectorProfileId: previousAssignment.collector.id, status: { in: activeAssignmentStatuses } } });
      if (!remainingAssignments) await transaction.collectorProfile.update({ where: { id: previousAssignment.collector.id }, data: { availability: CollectorAvailability.AVAILABLE } });
      await transaction.notification.create({ data: {
        userId: previousAssignment.collector.userId,
        type: "COLLECTION_REASSIGNED",
        title: "Collection reassigned",
        body: `Request ${requestId.slice(-8)} was reassigned by Admin.`,
        metadata: { requestId },
      } });
    }

    await transaction.collectionAssignment.create({ data: {
      id: assignmentId,
      requestId: collectionRequest.id,
      collectorProfileId: collector.id,
      assignedByUserId: adminId(request),
      status: AssignmentStatus.ASSIGNED,
    } });
    await transaction.collectorProfile.update({ where: { id: collector.id }, data: { availability: CollectorAvailability.ON_COLLECTION } });
    await transaction.collectionStatusEvent.create({ data: {
      requestId: collectionRequest.id,
      actorId: adminId(request),
      fromStatus: collectionRequest.status,
      toStatus: CollectionStatus.COLLECTOR_ASSIGNED,
      note: `${previousAssignment ? "Reassigned" : "Assigned"} to collector profile ${collector.id}.`,
    } });
    await transaction.notification.createMany({ data: [
      { userId: collectionRequest.requesterId, type: "COLLECTOR_ASSIGNED", title: "Collector assigned", body: `${candidate.displayName ?? "A collector"} was assigned to your collection.` },
      { userId: collector.userId, type: "COLLECTOR_ASSIGNED", title: "New collection assignment", body: "A new collection request has been assigned to you." },
    ] });
    await addAudit(transaction, adminId(request), "COLLECTION_REQUEST", collectionRequest.id, previousAssignment ? "REASSIGNED" : "ASSIGNED", undefined, {
      previousCollectorProfileId: previousAssignment?.collector.id ?? null,
      assignmentId,
      collectorProfileId: collector.id,
      distanceKm: candidate.distanceKm,
      etaMinutes: candidate.etaMinutes,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const assigned = await prisma.collectionRequest.findUnique({ where: { id: requestId }, include: requestInclude() });
  response.status(201).json({ data: assigned });
}));

adminRouter.post("/requests/:requestId/cancel", validateBody(requestCancellationSchema), asyncHandler(async (request, response) => {
  const requestId = pathParam(request, "requestId");
  const { reason } = requestCancellationSchema.parse(request.body);
  const current = await prisma.collectionRequest.findUnique({
    where: { id: requestId },
    include: { assignments: { where: { status: { in: activeAssignmentStatuses } }, include: { collector: { select: { id: true, userId: true } } } } },
  });
  if (!current) throw new ApiError(404, "NOT_FOUND", "Collection request was not found.");
  if (current.status === CollectionStatus.VERIFIED || current.status === CollectionStatus.COMPLETED || current.status === CollectionStatus.CANCELLED || current.status === CollectionStatus.REJECTED) {
    throw new ApiError(409, "REQUEST_ALREADY_CLOSED", "A closed collection request cannot be cancelled.");
  }

  const cancelled = await prisma.$transaction(async (transaction) => {
    const changed = await transaction.collectionRequest.updateMany({
      where: { id: current.id, status: current.status },
      data: { status: CollectionStatus.CANCELLED, cancellationReason: reason },
    });
    if (changed.count !== 1) throw new ApiError(409, "REQUEST_STATE_CHANGED", "The request changed before it could be cancelled.");
    await transaction.collectionAssignment.updateMany({
      where: { requestId: current.id, status: { in: activeAssignmentStatuses } },
      data: { status: AssignmentStatus.REVOKED, unassignedAt: new Date(), reason },
    });
    for (const assignment of current.assignments) {
      const remainingAssignments = await transaction.collectionAssignment.count({ where: { collectorProfileId: assignment.collector.id, status: { in: activeAssignmentStatuses } } });
      if (!remainingAssignments) await transaction.collectorProfile.update({ where: { id: assignment.collector.id }, data: { availability: CollectorAvailability.AVAILABLE } });
    }
    await transaction.collectionStatusEvent.create({ data: {
      requestId: current.id,
      actorId: adminId(request),
      fromStatus: current.status,
      toStatus: CollectionStatus.CANCELLED,
      note: reason,
    } });
    const recipients = [...new Set([current.requesterId, ...current.assignments.map((assignment) => assignment.collector.userId)])];
    if (recipients.length) await transaction.notification.createMany({ data: recipients.map((userId) => ({
      userId,
      type: "COLLECTION_CANCELLED",
      title: "Collection cancelled by Admin",
      body: `Request ${current.id.slice(-8)} was cancelled. ${reason}`,
      metadata: { requestId: current.id },
    })) });
    await addAudit(transaction, adminId(request), "COLLECTION_REQUEST", current.id, "CANCELLED", reason, { fromStatus: current.status, toStatus: CollectionStatus.CANCELLED });
    return transaction.collectionRequest.findUniqueOrThrow({ where: { id: current.id }, include: requestInclude() });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.json({ data: cancelled });
}));

adminRouter.get("/active-collections", asyncHandler(async (_request, response) => {
  const requests = await prisma.collectionRequest.findMany({
    where: { status: { in: activeCollectionStatuses } },
    include: requestInclude(),
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  response.json({ data: requests });
}));

adminRouter.get("/verification", asyncHandler(async (_request, response) => {
  const requests = await prisma.collectionRequest.findMany({
    where: { status: CollectionStatus.VERIFICATION_PENDING },
    include: requestInclude(),
    orderBy: { updatedAt: "asc" },
    take: 200,
  });
  response.json({ data: requests });
}));

adminRouter.get("/material-rates", asyncHandler(async (_request, response) => {
  const materials = await prisma.material.findMany({
    where: { isActive: true },
    include: { rewardRates: { orderBy: { startsAt: "desc" }, take: 10 } },
    orderBy: { name: "asc" },
  });
  response.json({ data: materials.map((material) => ({
    id: material.id,
    name: material.name,
    rates: material.rewardRates,
    activeRate: material.rewardRates.find((rate) => rate.endsAt === null) ?? null,
  })) });
}));

adminRouter.put("/material-rates/:materialId", validateBody(materialRateSchema), asyncHandler(async (request, response) => {
  const input = materialRateSchema.parse(request.body);
  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
  const material = await prisma.material.findUnique({ where: { id: pathParam(request, "materialId") } });
  if (!material || !material.isActive) throw new ApiError(404, "NOT_FOUND", "Active material was not found.");
  if (startsAt.getTime() < Date.now() - 60_000) throw new ApiError(400, "INVALID_START_DATE", "A new rate must start now or in the future.");

  const rate = await prisma.$transaction(async (transaction) => {
    await transaction.materialRewardRate.updateMany({
      where: { materialId: material.id, endsAt: null, startsAt: { lt: startsAt } },
      data: { endsAt: startsAt },
    });
    const created = await transaction.materialRewardRate.create({ data: { materialId: material.id, pointsPerKg: input.pointsPerKg, startsAt } });
    await addAudit(transaction, adminId(request), "MATERIAL_RATE", created.id, "UPDATED", undefined, {
      materialId: material.id,
      material: material.name,
      pointsPerKg: input.pointsPerKg,
      startsAt: startsAt.toISOString(),
    });
    return created;
  });
  response.status(201).json({ data: { ...rate, material } });
}));

adminRouter.get("/redemptions", asyncHandler(async (_request, response) => {
  const redemptions = await prisma.rewardRedemption.findMany({
    include: {
      wallet: { include: { user: { include: { recyclerProfile: true } } } },
      transaction: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  response.json({ data: redemptions.map((redemption) => ({
    id: redemption.id,
    reference: redemption.reference,
    type: redemption.type,
    pointsCost: redemption.pointsCost,
    valueCents: redemption.valueCents,
    status: redemption.status,
    createdAt: redemption.createdAt,
    meterNumberMasked: redemption.meterNumber ? `****${redemption.meterNumber.slice(-4)}` : null,
    user: {
      id: redemption.wallet.user.id,
      email: redemption.wallet.user.email,
      displayName: redemption.wallet.user.recyclerProfile?.displayName ?? redemption.wallet.user.email,
    },
    randValue: redemption.valueCents / 100,
  })) });
}));

adminRouter.patch("/redemptions/:redemptionId", validateBody(redemptionDecisionSchema), asyncHandler(async (request, response) => {
  const input = redemptionDecisionSchema.parse(request.body);
  const current = await prisma.rewardRedemption.findUnique({ where: { id: pathParam(request, "redemptionId") }, include: { wallet: { select: { userId: true } } } });
  if (!current) throw new ApiError(404, "NOT_FOUND", "Redemption was not found.");
  const allowed: Record<RedemptionStatus, RedemptionStatus[]> = {
    REQUESTED: [RedemptionStatus.APPROVED, RedemptionStatus.REJECTED],
    APPROVED: [RedemptionStatus.FULFILLED, RedemptionStatus.REJECTED],
    FULFILLED: [],
    REJECTED: [],
    CANCELLED: [],
  };
  if (!allowed[current.status].includes(input.status)) throw new ApiError(409, "INVALID_TRANSITION", "This redemption cannot move to the requested status.");

  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.rewardRedemption.update({ where: { id: current.id }, data: { status: input.status } });
    if (input.status === RedemptionStatus.REJECTED) {
      const wallet = await transaction.rewardWallet.update({ where: { id: current.walletId }, data: { pointsBalance: { increment: current.pointsCost } } });
      await transaction.rewardTransaction.create({ data: {
        walletId: wallet.id,
        type: RewardTransactionType.ADJUSTMENT,
        pointsDelta: current.pointsCost,
        randValueCents: current.valueCents,
        idempotencyKey: `redemption-reversal:${current.id}`,
        description: `Points returned after redemption ${current.reference} was rejected.`,
      } });
    }
    await addAudit(transaction, adminId(request), "REDEMPTION", current.id, input.status, input.reason, { fromStatus: current.status, toStatus: input.status });
    await transaction.notification.create({ data: {
      userId: current.wallet.userId,
      type: "REWARD_REDEEMED",
      title: input.status === RedemptionStatus.REJECTED ? "Redemption rejected" : input.status === RedemptionStatus.APPROVED ? "Redemption approved" : "Reward delivered",
      body: input.status === RedemptionStatus.REJECTED
        ? `${current.pointsCost} points were returned to your wallet. ${input.reason ?? ""}`.trim()
        : `Your redemption ${current.reference} is now ${input.status.toLowerCase()}.`,
      metadata: { redemptionId: current.id },
    } });
    return result;
  });
  response.json({ data: updated });
}));

adminRouter.get("/reports", asyncHandler(async (_request, response) => {
  const reports = await prisma.report.findMany({
    include: {
      reporter: { include: { recyclerProfile: true } },
      facility: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  response.json({ data: reports.map((report) => ({
    ...report,
    reporterName: report.reporter.recyclerProfile?.displayName ?? report.reporter.email,
    reporterEmail: report.reporter.email,
  })) });
}));

adminRouter.patch("/reports/:reportId/status", validateBody(reportStatusSchema), asyncHandler(async (request, response) => {
  const input = reportStatusSchema.parse(request.body);
  const report = await prisma.report.findUnique({ where: { id: pathParam(request, "reportId") } });
  if (!report) throw new ApiError(404, "NOT_FOUND", "Report was not found.");
  const status = input.status as ReportStatus;
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.report.update({ where: { id: report.id }, data: { status } });
    await addAudit(transaction, adminId(request), "REPORT", report.id, status, input.reason, { fromStatus: report.status, toStatus: status });
    return result;
  });
  response.json({ data: updated });
}));

adminRouter.get("/notifications", asyncHandler(async (request, response) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: adminId(request) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  response.json({ data: notifications });
}));

adminRouter.patch("/notifications/:notificationId", validateBody(notificationReadSchema), asyncHandler(async (request, response) => {
  const input = notificationReadSchema.parse(request.body);
  const updated = await prisma.notification.updateMany({
    where: { id: pathParam(request, "notificationId"), userId: adminId(request) },
    data: { readAt: input.read ? new Date() : null },
  });
  if (!updated.count) throw new ApiError(404, "NOT_FOUND", "Notification was not found.");
  response.json({ data: { id: pathParam(request, "notificationId"), read: input.read } });
}));

adminRouter.get("/audit", asyncHandler(async (request, response) => {
  const entityType = typeof request.query.entityType === "string" ? request.query.entityType.trim() : "";
  const entries = await prisma.adminAuditLog.findMany({
    where: entityType ? { entityType } : undefined,
    include: { admin: { select: { id: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  response.json({ data: entries });
}));

adminRouter.get("/analytics/30-days", asyncHandler(async (_request, response) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [requests, weights, issued, redeemed, totalRequests, completed, cancelled, activeUsers, activeCollectors, registeredFacilities, acceptedAssignments, resolvedIncidents, incidentVolume, facilityActivity] = await Promise.all([
    prisma.collectionRequest.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, estimatedKg: true, material: { select: { name: true } } },
    }),
    prisma.collectionWeight.findMany({
      where: { verifiedAt: { gte: since }, verifiedKg: { not: null } },
      select: {
        verifiedKg: true,
        request: { select: {
          material: { select: { name: true } },
          destinationFacility: { select: { id: true, name: true } },
          materialWeights: { where: { verifiedAt: { gte: since }, verifiedKg: { not: null } }, select: { verifiedKg: true, material: { select: { name: true } } } },
        } },
      },
    }),
    prisma.rewardTransaction.aggregate({ where: { type: RewardTransactionType.EARN, createdAt: { gte: since } }, _sum: { pointsDelta: true } }),
    prisma.rewardTransaction.aggregate({ where: { type: RewardTransactionType.REDEEM, createdAt: { gte: since } }, _sum: { pointsDelta: true } }),
    prisma.collectionRequest.count({ where: { createdAt: { gte: since } } }),
    prisma.collectionRequest.count({ where: { status: CollectionStatus.COMPLETED, updatedAt: { gte: since } } }),
    prisma.collectionRequest.count({ where: { status: CollectionStatus.CANCELLED, updatedAt: { gte: since } } }),
    prisma.user.count({ where: { role: { not: UserRole.ADMIN }, status: AccountStatus.ACTIVE } }),
    prisma.collectorProfile.count({ where: { approvalStatus: ApprovalStatus.APPROVED, availability: CollectorAvailability.AVAILABLE, user: { status: AccountStatus.ACTIVE } } }),
    prisma.facility.count({ where: { approvalStatus: ApprovalStatus.APPROVED, isSuspended: false } }),
    prisma.collectionAssignment.findMany({ where: { acceptedAt: { gte: since } }, select: { assignedAt: true, acceptedAt: true } }),
    prisma.incident.findMany({ where: { resolvedAt: { gte: since } }, select: { createdAt: true, resolvedAt: true } }),
    prisma.incident.count({ where: { createdAt: { gte: since } } }),
    prisma.collectionRequest.groupBy({ by: ["destinationFacilityId"], where: { createdAt: { gte: since }, destinationFacilityId: { not: null } }, _count: { _all: true } }),
  ]);

  const categoryNames = ["Plastic", "Paper", "Glass", "Metal", "E-waste", "Other"];
  const categoryFor = (material: string) => {
    const name = material.toLowerCase().replaceAll(" ", "");
    if (name.includes("plastic")) return "Plastic";
    if (name.includes("paper") || name.includes("cardboard")) return "Paper";
    if (name.includes("glass")) return "Glass";
    if (name.includes("metal") || name.includes("aluminium") || name.includes("aluminum")) return "Metal";
    if (name.includes("e-waste") || name.includes("ewaste") || name.includes("electronic")) return "E-waste";
    return "Other";
  };
  const materialTotals = new Map(categoryNames.map((material) => [material, { material, estimatedKg: 0, verifiedKg: 0 }]));
  for (const request of requests) materialTotals.get(categoryFor(request.material.name))!.estimatedKg += Number(request.estimatedKg);
  let totalVerifiedKg = 0;
  const facilityKg = new Map<string, number>();
  for (const weight of weights) {
    const verifiedKg = Number(weight.verifiedKg ?? 0);
    totalVerifiedKg += verifiedKg;
    const materialLines = weight.request.materialWeights;
    if (materialLines.length) {
      for (const line of materialLines) materialTotals.get(categoryFor(line.material.name))!.verifiedKg += Number(line.verifiedKg ?? 0);
    } else {
      materialTotals.get(categoryFor(weight.request.material.name))!.verifiedKg += verifiedKg;
    }
    if (weight.request.destinationFacility) {
      facilityKg.set(weight.request.destinationFacility.id, (facilityKg.get(weight.request.destinationFacility.id) ?? 0) + verifiedKg);
    }
  }
  const facilityIds = facilityActivity.flatMap(({ destinationFacilityId }) => destinationFacilityId ? [destinationFacilityId] : []);
  const facilities = facilityIds.length ? await prisma.facility.findMany({ where: { id: { in: facilityIds } }, select: { id: true, name: true } }) : [];
  const facilityNames = new Map(facilities.map((facility) => [facility.id, facility.name]));
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const responseMinutes = average(acceptedAssignments.flatMap(({ assignedAt, acceptedAt }) => acceptedAt ? [(acceptedAt.getTime() - assignedAt.getTime()) / 60_000] : []));
  const resolutionHours = average(resolvedIncidents.flatMap(({ createdAt, resolvedAt }) => resolvedAt ? [(resolvedAt.getTime() - createdAt.getTime()) / 3_600_000] : []));
  const pointsRedeemed = Math.abs(redeemed._sum.pointsDelta ?? 0);

  response.json({ data: {
    periodDays: 30,
    totalVerifiedKg,
    materialTotals: [...materialTotals.values()],
    totalCollections: totalRequests,
    completedCollections: completed,
    cancelledCollections: cancelled,
    activeUsers,
    activeCollectors,
    registeredFacilities,
    pointsIssued: issued._sum.pointsDelta ?? 0,
    pointsRedeemed,
    rewardValueRand: pointsRedeemed * 0.2,
    averageResolutionTimeHours: resolutionHours,
    averageResponseTimeMinutes: responseMinutes,
    incidentVolume,
    facilityActivity: facilityActivity.map((item) => ({
      facilityId: item.destinationFacilityId!,
      facility: facilityNames.get(item.destinationFacilityId!) ?? "Facility",
      requestCount: item._count._all,
      verifiedKg: facilityKg.get(item.destinationFacilityId!) ?? 0,
    })).sort((left, right) => right.requestCount - left.requestCount),
  } });
}));

adminRouter.get("/analytics", asyncHandler(async (_request, response) => {
  const [requests, totalUsers, activeCollectors, registeredFacilities, issued, redeemed, completed, cancelled] = await Promise.all([
    prisma.collectionRequest.findMany({
      include: { material: true, weight: true },
      orderBy: { createdAt: "desc" },
      take: 10000,
    }),
    prisma.user.count({ where: { role: { not: UserRole.ADMIN }, status: AccountStatus.ACTIVE } }),
    prisma.collectorProfile.count({ where: { approvalStatus: ApprovalStatus.APPROVED, user: { status: AccountStatus.ACTIVE } } }),
    prisma.facility.count({ where: { approvalStatus: ApprovalStatus.APPROVED, isSuspended: false } }),
    prisma.rewardTransaction.aggregate({ where: { type: RewardTransactionType.EARN }, _sum: { pointsDelta: true } }),
    prisma.rewardTransaction.aggregate({ where: { type: RewardTransactionType.REDEEM }, _sum: { pointsDelta: true } }),
    prisma.collectionRequest.count({ where: { status: CollectionStatus.COMPLETED } }),
    prisma.collectionRequest.count({ where: { status: CollectionStatus.CANCELLED } }),
  ]);

  const materialTotals = new Map<string, { material: string; estimatedKg: number; verifiedKg: number }>();
  let totalVerifiedKg = 0;
  for (const request of requests) {
    const total = materialTotals.get(request.material.name) ?? { material: request.material.name, estimatedKg: 0, verifiedKg: 0 };
    total.estimatedKg += Number(request.estimatedKg);
    total.verifiedKg += Number(request.weight?.verifiedKg ?? 0);
    totalVerifiedKg += Number(request.weight?.verifiedKg ?? 0);
    materialTotals.set(request.material.name, total);
  }

  response.json({ data: {
    totalVerifiedKg,
    materialTotals: [...materialTotals.values()].sort((a, b) => b.verifiedKg - a.verifiedKg),
    totalCollections: requests.length,
    completedCollections: completed,
    cancelledCollections: cancelled,
    activeUsers: totalUsers,
    activeCollectors,
    registeredFacilities,
    pointsIssued: issued._sum.pointsDelta ?? 0,
    pointsRedeemed: Math.abs(redeemed._sum.pointsDelta ?? 0),
    rewardValueRand: Math.abs(redeemed._sum.pointsDelta ?? 0) * 0.2,
  } });
}));

export const adminRouterProtected = adminRouter;