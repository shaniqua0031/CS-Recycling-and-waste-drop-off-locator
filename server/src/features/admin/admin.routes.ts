import { randomUUID } from "node:crypto";
import { Router, type Request, type RequestHandler, type Response } from "express";
import {
  AccountStatus,
  ApprovalStatus,
  AssignmentStatus,
  CollectionStatus,
  CollectorAvailability,
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
import {
  accountStatusSchema,
  approvalDecisionSchema,
  assignmentSchema,
  materialRateSchema,
  notificationReadSchema,
  redemptionDecisionSchema,
  reportStatusSchema,
} from "./admin.schemas";

const adminRouter = Router();
const activeAssignmentStatuses = [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED];
const activeCollectionStatuses = [
  CollectionStatus.COLLECTOR_ASSIGNED,
  CollectionStatus.COLLECTOR_ON_THE_WAY,
  CollectionStatus.COLLECTOR_ARRIVED,
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
      where: { status: { in: activeAssignmentStatuses } },
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
  }));

  return rankCollectorCandidates(
    { latitude: request.pickupLatitude, longitude: request.pickupLongitude },
    inputs,
  );
}

adminRouter.get("/overview", asyncHandler(async (_request, response) => {
  const today = todayStart();
  const [
    totalUsers,
    activeCollectors,
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
  ] = await Promise.all([
    prisma.user.count({ where: { role: { not: UserRole.ADMIN } } }),
    prisma.collectorProfile.count({ where: { approvalStatus: ApprovalStatus.APPROVED, availability: CollectorAvailability.AVAILABLE, user: { status: AccountStatus.ACTIVE } } }),
    prisma.facility.count({ where: { approvalStatus: ApprovalStatus.APPROVED, isSuspended: false } }),
    prisma.collectionRequest.count({ where: { status: CollectionStatus.WAITING_FOR_ADMIN } }),
    prisma.collectionRequest.count({ where: { status: { in: activeCollectionStatuses } } }),
    prisma.collectionRequest.count({ where: { status: CollectionStatus.COMPLETED, updatedAt: { gte: today } } }),
    prisma.collectorProfile.count({ where: { approvalStatus: ApprovalStatus.PENDING } }),
    prisma.facility.count({ where: { approvalStatus: ApprovalStatus.PENDING, isSuspended: false } }),
    prisma.collectionWeight.aggregate({ where: { verifiedKg: { not: null } }, _sum: { verifiedKg: true } }),
    prisma.rewardTransaction.aggregate({ where: { type: RewardTransactionType.EARN }, _sum: { pointsDelta: true } }),
    prisma.rewardTransaction.aggregate({ where: { type: RewardTransactionType.REDEEM }, _sum: { pointsDelta: true } }),
    prisma.rewardRedemption.count({ where: { status: RedemptionStatus.FULFILLED } }),
  ]);

  response.json({ data: {
    totalUsers,
    activeCollectors,
    facilities,
    pendingRequests,
    activePickups,
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
      role: { not: UserRole.ADMIN },
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
  response.json({ data: users.map((user) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    displayName: user.recyclerProfile?.displayName ?? user.email,
    collections: user._count.createdCollectionRequests,
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
        where: { status: { in: activeAssignmentStatuses } },
        include: { request: { include: { material: true } } },
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
    currentCollection: collector.assignments[0]?.request ?? null,
    workload: collector.assignments.length,
  })) });
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
  const facilities = await prisma.facility.findMany({
    include: {
      materials: { include: { material: true } },
      openingHours: { orderBy: { dayOfWeek: "asc" } },
      memberships: { include: { user: { include: { recyclerProfile: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  response.json({ data: facilities.map((facility) => ({
    ...facility,
    acceptedMaterials: facility.materials.map((entry) => entry.material.name),
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
    if (!collectionRequest || collectionRequest.status !== CollectionStatus.WAITING_FOR_ADMIN) {
      throw new ApiError(409, "REQUEST_NOT_ASSIGNABLE", "This request has already changed or is no longer waiting for assignment.");
    }
    const collector = await transaction.collectorProfile.findUnique({ where: { id: candidate.profileId }, include: { assignments: { where: { status: { in: activeAssignmentStatuses } }, select: { id: true } } } });
    if (!collector || collector.approvalStatus !== ApprovalStatus.APPROVED || collector.availability !== CollectorAvailability.AVAILABLE || collector.assignments.length !== candidate.activeWorkload) {
      throw new ApiError(409, "COLLECTOR_UNAVAILABLE", "This collector's status changed. Refresh candidates and try again.");
    }
    const changed = await transaction.collectionRequest.updateMany({
      where: { id: collectionRequest.id, status: CollectionStatus.WAITING_FOR_ADMIN },
      data: { status: CollectionStatus.COLLECTOR_ASSIGNED },
    });
    if (changed.count !== 1) throw new ApiError(409, "REQUEST_NOT_ASSIGNABLE", "Another Admin has already assigned this request.");

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
      fromStatus: CollectionStatus.WAITING_FOR_ADMIN,
      toStatus: CollectionStatus.COLLECTOR_ASSIGNED,
      note: `Assigned to collector profile ${collector.id}.`,
    } });
    await transaction.notification.createMany({ data: [
      { userId: collectionRequest.requesterId, type: "COLLECTOR_ASSIGNED", title: "Collector assigned", body: `${candidate.displayName ?? "A collector"} was assigned to your collection.` },
      { userId: collector.userId, type: "COLLECTOR_ASSIGNED", title: "New collection assignment", body: "A new collection request has been assigned to you." },
    ] });
    await addAudit(transaction, adminId(request), "COLLECTION_REQUEST", collectionRequest.id, "ASSIGNED", undefined, {
      assignmentId,
      collectorProfileId: collector.id,
      distanceKm: candidate.distanceKm,
      etaMinutes: candidate.etaMinutes,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const assigned = await prisma.collectionRequest.findUnique({ where: { id: requestId }, include: requestInclude() });
  response.status(201).json({ data: assigned });
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
    ...redemption,
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