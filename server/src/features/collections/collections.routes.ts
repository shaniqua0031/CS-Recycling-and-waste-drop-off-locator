import { randomUUID } from "node:crypto";
import { Router, type Request, type RequestHandler, type Response } from "express";
import {
  AccountStatus,
  ApprovalStatus,
  AssignmentStatus,
  CollectionStatus,
  CollectorAvailability,
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
import { collectionRequestSchema, collectedWeightSchema, collectorDeclineSchema, collectorLocationSchema, electricityRedemptionSchema, facilityProfileSchema, reportSubmissionSchema, rewardRedemptionSchema, verifiedWeightSchema } from "./collections.schemas";
import { distanceBetweenKm } from "../../utils/geo";

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
    statusEvents: { orderBy: { createdAt: "desc" as const }, take: 20 },
    weight: true,
  };
}

async function notifyAdmins(type: "COLLECTION_REQUEST_CREATED" | "REPORT_SUBMITTED", title: string, body: string) {
  const admins = await prisma.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
  if (admins.length) {
    await prisma.notification.createMany({ data: admins.map(({ id }) => ({ userId: id, type, title, body })) });
  }
}

collectionsRouter.use(requireAuthentication);

collectionsRouter.get("/facility-profile", asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.FACILITY) throw new ApiError(403, "FORBIDDEN", "Only Facility accounts can view a facility profile.");
  const membership = await prisma.facilityMembership.findFirst({
    where: { userId: request.auth!.userId },
    include: { facility: { include: { materials: { include: { material: true } }, openingHours: { orderBy: { dayOfWeek: "asc" } } } } },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) throw new ApiError(404, "FACILITY_PROFILE_NOT_FOUND", "No facility profile is linked to this account.");
  response.json({ data: {
    id: membership.facility.id,
    name: membership.facility.name,
    address: membership.facility.address,
    acceptedMaterials: membership.facility.materials.map((entry) => entry.material.name),
    openingHours: membership.facility.openingHours,
  } });
}));

collectionsRouter.put("/facility-profile", validateBody(facilityProfileSchema), asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.FACILITY) throw new ApiError(403, "FORBIDDEN", "Only Facility accounts can update a facility profile.");
  const input = facilityProfileSchema.parse(request.body);
  const membership = await prisma.facilityMembership.findFirst({ where: { userId: request.auth!.userId }, orderBy: { createdAt: "asc" } });
  if (!membership) throw new ApiError(404, "FACILITY_PROFILE_NOT_FOUND", "No facility profile is linked to this account.");

  const profile = await prisma.$transaction(async (transaction) => {
    const materialRecords = await Promise.all(input.acceptedMaterials.map((name) => {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return transaction.material.upsert({ where: { slug }, update: { isActive: true }, create: { slug, name } });
    }));
    await transaction.facility.update({ where: { id: membership.facilityId }, data: { name: input.name, address: input.address } });
    await transaction.facilityMaterial.deleteMany({ where: { facilityId: membership.facilityId } });
    await transaction.facilityMaterial.createMany({ data: materialRecords.map((material) => ({ facilityId: membership.facilityId, materialId: material.id })) });
    await Promise.all(input.openingHours.map((hours, dayOfWeek) => {
      const [opensAt, closesAt] = hours.split("-");
      const isClosed = !hours || /^closed$/i.test(hours);
      return transaction.facilityOpeningHour.upsert({
        where: { facilityId_dayOfWeek: { facilityId: membership.facilityId, dayOfWeek } },
        update: { opensAt: isClosed ? null : opensAt, closesAt: isClosed ? null : closesAt, isClosed },
        create: { facilityId: membership.facilityId, dayOfWeek, opensAt: isClosed ? null : opensAt, closesAt: isClosed ? null : closesAt, isClosed },
      });
    }));
    return transaction.facility.findUniqueOrThrow({
      where: { id: membership.facilityId },
      include: { materials: { include: { material: true } }, openingHours: { orderBy: { dayOfWeek: "asc" } } },
    });
  });
  response.json({ data: {
    id: profile.id,
    name: profile.name,
    address: profile.address,
    acceptedMaterials: profile.materials.map((entry) => entry.material.name),
    openingHours: profile.openingHours,
  } });
}));

collectionsRouter.get("/facilities", asyncHandler(async (request, response) => {
  const material = typeof request.query.material === "string" ? request.query.material.trim() : "";
  const facilities = await prisma.facility.findMany({
    where: {
      approvalStatus: ApprovalStatus.APPROVED,
      isSuspended: false,
      ...(material ? { materials: { some: { material: { name: { equals: material, mode: "insensitive" } } } } } : {}),
    },
    include: { materials: { include: { material: true } }, openingHours: { orderBy: { dayOfWeek: "asc" } } },
    orderBy: { name: "asc" },
  });
  response.json({ data: facilities.map((facility) => ({
    id: facility.id,
    name: facility.name,
    address: facility.address,
    latitude: facility.latitude,
    longitude: facility.longitude,
    acceptedMaterials: facility.materials.map((link) => link.material.name),
    openingHours: facility.openingHours,
  })) });
}));

collectionsRouter.get("/", asyncHandler(async (request, response) => {
  const userId = request.auth!.userId;
  const role = request.auth!.role;
  let where: Prisma.CollectionRequestWhereInput;

  if (role === UserRole.RECYCLER) {
    where = { requesterId: userId };
  } else if (role === UserRole.COLLECTOR) {
    where = { assignments: { some: { collector: { userId }, status: { in: activeAssignmentStatuses } } } };
  } else if (role === UserRole.FACILITY) {
    const memberships = await prisma.facilityMembership.findMany({ where: { userId }, select: { facilityId: true } });
    where = { destinationFacilityId: { in: memberships.map((membership) => membership.facilityId) } };
  } else {
    throw new ApiError(403, "FORBIDDEN", "Use the Admin collections view to access all requests.");
  }

  const requests = await prisma.collectionRequest.findMany({ where, include: requestInclude(), orderBy: { createdAt: "desc" }, take: 200 });
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
    return { ...collectionRequest, estimatedEtaMinutes };
  }) });
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
    const collectionRequest = await transaction.collectionRequest.create({
      data: {
        requesterId: request.auth!.userId,
        materialId: material.id,
        destinationFacilityId: facility.id,
        estimatedKg: input.estimatedKg,
        requestedFor: new Date(input.requestedFor),
        pickupAddress: input.pickupAddress,
        pickupLatitude: input.pickupLatitude,
        pickupLongitude: input.pickupLongitude,
        status: CollectionStatus.WAITING_FOR_ADMIN,
        weight: { create: { estimatedKg: input.estimatedKg } },
        statusEvents: { create: { actorId: request.auth!.userId, toStatus: CollectionStatus.WAITING_FOR_ADMIN } },
      },
      include: requestInclude(),
    });
    await transaction.notification.create({ data: {
      userId: request.auth!.userId,
      type: "COLLECTION_REQUEST_CREATED",
      title: "Collection request submitted",
      body: "Your request is waiting for an Admin to assign a collector.",
      metadata: { requestId: collectionRequest.id },
    } });
    const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
    if (admins.length) await transaction.notification.createMany({ data: admins.map(({ id }) => ({
      userId: id,
      type: "COLLECTION_REQUEST_CREATED",
      title: "New collection request",
      body: `${request.auth!.displayName ?? request.auth!.email} requested ${material.name} collection.`,
      metadata: { requestId: collectionRequest.id },
    })) });
    return collectionRequest;
  });
  response.status(201).json({ data: created });
}));

collectionsRouter.post("/:requestId/accept", asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.COLLECTOR) throw new ApiError(403, "FORBIDDEN", "Only the assigned Collector can accept a collection.");
  const requestId = pathParam(request, "requestId");
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
    return transaction.collectionRequest.findUniqueOrThrow({ where: { id: requestId }, include: requestInclude() });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.json({ data: collectionRequest });
}));

collectionsRouter.post("/:requestId/decline", validateBody(collectorDeclineSchema), asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.COLLECTOR) throw new ApiError(403, "FORBIDDEN", "Only the assigned Collector can decline a collection.");
  const requestId = pathParam(request, "requestId");
  const { reason } = collectorDeclineSchema.parse(request.body);
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
      data: { status: AssignmentStatus.DECLINED, reason },
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
      body: `The assigned Collector declined: ${reason} The request is waiting for reassignment.`,
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
  response.json({ data: collectionRequest });
}));

collectionsRouter.post("/:requestId/collect", validateBody(collectedWeightSchema), asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.COLLECTOR) throw new ApiError(403, "FORBIDDEN", "Only the assigned Collector can record collected material.");
  const requestId = pathParam(request, "requestId");
  const { actualKg } = collectedWeightSchema.parse(request.body);
  const profile = await prisma.collectorProfile.findUnique({ where: { userId: request.auth!.userId } });
  if (!profile || profile.approvalStatus !== ApprovalStatus.APPROVED) throw new ApiError(403, "COLLECTOR_NOT_APPROVED", "Your collector account is not approved.");

  const updated = await prisma.$transaction(async (transaction) => {
    const assignment = await transaction.collectionAssignment.findFirst({
      where: { requestId, collectorProfileId: profile.id, status: AssignmentStatus.ACCEPTED },
      include: { request: { include: { destinationFacility: { include: { memberships: { select: { userId: true } } } } } } },
    });
    if (!assignment || assignment.request.status !== CollectionStatus.COLLECTOR_ON_THE_WAY) throw new ApiError(409, "COLLECTION_NOT_ACTIVE", "There is no active assignment for this collector.");
    const now = new Date();
    await transaction.collectionWeight.update({
      where: { requestId },
      data: { actualKg, recordedByUserId: request.auth!.userId, recordedAt: now },
    });
    await transaction.collectionAssignment.update({ where: { id: assignment.id }, data: { status: AssignmentStatus.COMPLETED } });
    await transaction.collectionRequest.update({ where: { id: requestId }, data: { status: CollectionStatus.VERIFICATION_PENDING } });
    await transaction.collectorProfile.update({ where: { id: profile.id }, data: { availability: CollectorAvailability.AVAILABLE } });
    await transaction.collectionStatusEvent.create({ data: {
      requestId,
      actorId: request.auth!.userId,
      fromStatus: CollectionStatus.COLLECTOR_ON_THE_WAY,
      toStatus: CollectionStatus.VERIFICATION_PENDING,
      note: `Collector recorded ${actualKg} kg; facility verification is pending.`,
    } });
    await transaction.notification.create({ data: {
      userId: assignment.request.requesterId,
      type: "COLLECTION_COMPLETED",
      title: "Materials collected",
      body: `The collector recorded ${actualKg} kg. Facility verification is pending.`,
      metadata: { requestId },
    } });
    const facilityUserIds = assignment.request.destinationFacility?.memberships.map((membership) => membership.userId) ?? [];
    if (facilityUserIds.length) await transaction.notification.createMany({ data: facilityUserIds.map((userId) => ({
      userId,
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
  const { verifiedKg } = verifiedWeightSchema.parse(request.body);
  const current = await prisma.collectionRequest.findUnique({ where: { id: requestId }, include: { material: true, weight: true } });
  if (!current || current.status !== CollectionStatus.VERIFICATION_PENDING || !current.destinationFacilityId) throw new ApiError(409, "VERIFICATION_NOT_AVAILABLE", "This request is not awaiting facility verification.");
  const membership = await prisma.facilityMembership.findFirst({ where: { facilityId: current.destinationFacilityId, userId: request.auth!.userId } });
  if (!membership) throw new ApiError(403, "FACILITY_MISMATCH", "This request is assigned to a different facility.");
  const facility = await prisma.facility.findUnique({ where: { id: current.destinationFacilityId } });
  if (!facility || facility.approvalStatus !== ApprovalStatus.APPROVED || facility.isSuspended) throw new ApiError(403, "FACILITY_UNAVAILABLE", "This facility is not approved to verify materials.");

  const now = new Date();
  const activeRate = await prisma.materialRewardRate.findFirst({
    where: { materialId: current.materialId, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    orderBy: { startsAt: "desc" },
  });
  if (!activeRate) throw new ApiError(409, "REWARD_RATE_MISSING", "No active points rate exists for this material.");
  const pointsAwarded = Math.floor(verifiedKg * activeRate.pointsPerKg);

  const verified = await prisma.$transaction(async (transaction) => {
    const existingTransaction = await transaction.rewardTransaction.findUnique({ where: { idempotencyKey: `verified:${requestId}` } });
    if (existingTransaction) throw new ApiError(409, "ALREADY_REWARDED", "Points have already been issued for this request.");
    const changed = await transaction.collectionRequest.updateMany({ where: { id: requestId, status: CollectionStatus.VERIFICATION_PENDING }, data: { status: CollectionStatus.VERIFIED } });
    if (changed.count !== 1) throw new ApiError(409, "VERIFICATION_NOT_AVAILABLE", "Another facility has already verified this request.");
    await transaction.collectionWeight.update({
      where: { requestId },
      data: { verifiedKg, verifiedByUserId: request.auth!.userId, verifiedFacilityId: facility.id, verifiedAt: now },
    });
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
        description: `${verifiedKg} kg ${current.material.name} at ${activeRate.pointsPerKg} points/kg`,
      } });
    }
    await transaction.notification.createMany({ data: [
      { userId: current.requesterId, type: "MATERIAL_VERIFIED", title: "Materials verified", body: `The facility verified ${verifiedKg} kg of ${current.material.name}.`, metadata: { requestId } },
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
  response.json({ data: { request: verified, pointsAwarded, randValue: pointsAwarded * 0.2, pointsPerKg: activeRate.pointsPerKg } });
}));

collectionsRouter.get("/rewards", asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.RECYCLER) throw new ApiError(403, "FORBIDDEN", "Only recyclers can view a personal rewards wallet.");
  const [wallet, materials, redemptions] = await Promise.all([
    prisma.rewardWallet.findUnique({ where: { userId: request.auth!.userId } }),
    prisma.material.findMany({ where: { isActive: true }, include: { rewardRates: { where: { endsAt: null }, orderBy: { startsAt: "desc" }, take: 1 } }, orderBy: { name: "asc" } }),
    prisma.rewardRedemption.findMany({ where: { wallet: { userId: request.auth!.userId } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  response.json({ data: {
    pointsBalance: wallet?.pointsBalance ?? 0,
    pointValueRand: 0.2,
    rates: materials.map((material) => ({ material: material.name, pointsPerKg: material.rewardRates[0]?.pointsPerKg ?? 0 })),
    redemptions: redemptions.map((redemption) => ({
      id: redemption.id,
      reference: redemption.reference,
      type: redemption.type,
      pointsCost: redemption.pointsCost,
      valueCents: redemption.valueCents,
      status: redemption.status,
      meterNumberMasked: redemption.meterNumber ? `****${redemption.meterNumber.slice(-4)}` : null,
      createdAt: redemption.createdAt,
    })),
  } });
}));

collectionsRouter.get("/notifications", asyncHandler(async (request, response) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: request.auth!.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  response.json({ data: notifications });
}));

collectionsRouter.post("/reports", validateBody(reportSubmissionSchema), asyncHandler(async (request, response) => {
  if (request.auth!.role === UserRole.ADMIN) throw new ApiError(403, "FORBIDDEN", "Admins review reports and cannot submit user reports.");
  const input = reportSubmissionSchema.parse(request.body);
  if (input.facilityId) {
    const facility = await prisma.facility.findUnique({ where: { id: input.facilityId }, select: { id: true } });
    if (!facility) throw new ApiError(404, "FACILITY_NOT_FOUND", "The reported facility was not found.");
  }

  const report = await prisma.$transaction(async (transaction) => {
    const created = await transaction.report.create({ data: {
      reporterId: request.auth!.userId,
      facilityId: input.facilityId,
      type: input.type as ReportType,
      description: input.description,
      suggestedName: input.suggestedName,
      suggestedAddress: input.suggestedAddress,
      suggestedLatitude: input.suggestedLatitude,
      suggestedLongitude: input.suggestedLongitude,
      suggestedAcceptedMaterials: input.suggestedAcceptedMaterials ?? [],
    } });
    const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
    if (admins.length) await transaction.notification.createMany({ data: admins.map(({ id }) => ({
      userId: id,
      type: "REPORT_SUBMITTED",
      title: "New report submitted",
      body: `${request.auth!.displayName ?? request.auth!.email} submitted a ${input.type.toLowerCase().replaceAll("_", " ")} report.`,
      metadata: { reportId: created.id },
    })) });
    return created;
  });
  response.status(201).json({ data: report });
}));

async function createRedemption(request: Request, pointsCost: number, type: RedemptionType, meterNumber?: string) {
  const reference = `WW-${randomUUID().slice(0, 8).toUpperCase()}`;
  const redemption = await prisma.$transaction(async (transaction) => {
    const wallet = await transaction.rewardWallet.findUnique({ where: { userId: request.auth!.userId } });
    if (!wallet || wallet.pointsBalance < pointsCost) throw new ApiError(409, "INSUFFICIENT_POINTS", "There are not enough points for this redemption.");
    const changed = await transaction.rewardWallet.updateMany({ where: { id: wallet.id, pointsBalance: { gte: pointsCost } }, data: { pointsBalance: { decrement: pointsCost } } });
    if (changed.count !== 1) throw new ApiError(409, "INSUFFICIENT_POINTS", "There are not enough points for this redemption.");
    const valueCents = pointsCost * 20;
    const created = await transaction.rewardRedemption.create({ data: { walletId: wallet.id, reference, type, meterNumber, pointsCost, valueCents } });
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
  };
}

collectionsRouter.post("/rewards/redemptions", validateBody(rewardRedemptionSchema), asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.RECYCLER) throw new ApiError(403, "FORBIDDEN", "Only recyclers can request a reward redemption.");
  const input = rewardRedemptionSchema.parse(request.body);
  const redemption = await createRedemption(request, input.pointsCost, RedemptionType.REWARD);
  response.status(201).json({ data: redemption });
}));

collectionsRouter.post("/rewards/redemptions/electricity", validateBody(electricityRedemptionSchema), asyncHandler(async (request, response) => {
  if (request.auth!.role !== UserRole.RECYCLER) throw new ApiError(403, "FORBIDDEN", "Only recyclers can request an electricity redemption.");
  const input = electricityRedemptionSchema.parse(request.body);
  const redemption = await createRedemption(request, input.pointsCost, RedemptionType.ELECTRICITY, input.meterNumber);
  response.status(201).json({ data: redemption });
}));

export const collectionsRouterProtected = collectionsRouter;