import { AccountStatus, ApprovalStatus, AssignmentStatus, CollectionStatus, CollectorAvailability, FacilityOperationalStatus, IncidentPriority, Prisma, ReportType, UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { dispatchWaitingCollections } from "../collections/collections.routes";
import { calculateIncidentPriorityScore } from "../collections/citizen.logic";
import { simulatorActionSchema } from "./admin.schemas";

type SimulatorActionInput = ReturnType<typeof simulatorActionSchema.parse>;

export async function performAdminSimulatorAction(adminId: string, input: SimulatorActionInput) {
  let dispatchAfter = false;
  const result = await prisma.$transaction(async (transaction) => {
    const event = await transaction.adminSimulatorEvent.create({ data: { adminId, action: input.action } });
    const metadata: Record<string, string | number | boolean | null> = {};
    let entityType: string | null = null;
    let entityId: string | null = null;

    if (input.action === "RESET_SIMULATION") {
      const activeEvents = await transaction.adminSimulatorEvent.findMany({ where: { resetAt: null, id: { not: event.id } }, orderBy: { createdAt: "desc" } });
      const now = new Date();
      for (const previous of activeEvents) {
        const prior = previous.metadata && typeof previous.metadata === "object" && !Array.isArray(previous.metadata)
          ? previous.metadata as Record<string, unknown>
          : {};
        if (previous.entityType === "COLLECTOR" && previous.entityId && typeof prior.previousAvailability === "string") {
          await transaction.collectorProfile.updateMany({ where: { id: previous.entityId }, data: { availability: prior.previousAvailability as CollectorAvailability } });
        } else if (previous.entityType === "FACILITY" && previous.entityId && typeof prior.previousOperationalStatus === "string") {
          await transaction.facility.updateMany({ where: { id: previous.entityId }, data: { operationalStatus: prior.previousOperationalStatus as FacilityOperationalStatus } });
        } else if (previous.entityType === "COLLECTION_REQUEST" && previous.entityId) {
          const collection = await transaction.collectionRequest.findUnique({ where: { id: previous.entityId } });
          const action = typeof prior.action === "string" ? prior.action : "";
          if (collection?.notes?.startsWith("[SIMULATOR:")) {
            if (action === "DRIVE_COLLECTOR_TO_SITE" && typeof prior.collectorProfileId === "string") {
              await transaction.collectorProfile.updateMany({ where: { id: prior.collectorProfileId }, data: {
                currentLatitude: typeof prior.previousLatitude === "number" ? prior.previousLatitude : null,
                currentLongitude: typeof prior.previousLongitude === "number" ? prior.previousLongitude : null,
                lastLocationUpdatedAt: typeof prior.previousLocationUpdatedAt === "string" ? new Date(prior.previousLocationUpdatedAt) : null,
              } });
            } else if (["COLLECTOR_ACCEPT", "COLLECTOR_DECLINE", "COMPLETE_COLLECTION"].includes(action) && typeof prior.assignmentId === "string") {
              const activeAssignments = await transaction.collectionAssignment.findMany({
                where: { requestId: collection.id, status: { in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED] }, id: { not: prior.assignmentId } },
                select: { id: true, collectorProfileId: true },
              });
              if (action === "COLLECTOR_DECLINE") {
                await transaction.collectionAssignment.updateMany({ where: { id: { in: activeAssignments.map(({ id: assignmentId }) => assignmentId) } }, data: { status: AssignmentStatus.REVOKED, unassignedAt: now, reason: "Simulator reset" } });
              }
              for (const active of activeAssignments) {
                const remaining = await transaction.collectionAssignment.count({ where: { collectorProfileId: active.collectorProfileId, status: { in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED] }, requestId: { not: collection.id } } });
                if (!remaining) await transaction.collectorProfile.updateMany({ where: { id: active.collectorProfileId }, data: { availability: CollectorAvailability.AVAILABLE } });
              }
              await transaction.collectionAssignment.updateMany({ where: { id: prior.assignmentId }, data: {
                status: typeof prior.previousAssignmentStatus === "string" ? prior.previousAssignmentStatus as AssignmentStatus : AssignmentStatus.ASSIGNED,
                acceptedAt: typeof prior.previousAcceptedAt === "string" ? new Date(prior.previousAcceptedAt) : null,
                unassignedAt: null,
                reason: null,
                declineReasonCode: null,
              } });
              if (typeof prior.collectorProfileId === "string") await transaction.collectorProfile.updateMany({ where: { id: prior.collectorProfileId }, data: {
                availability: typeof prior.previousAvailability === "string" ? prior.previousAvailability as CollectorAvailability : CollectorAvailability.ON_COLLECTION,
              } });
              await transaction.collectionRequest.update({ where: { id: collection.id }, data: { status: typeof prior.previousStatus === "string" ? prior.previousStatus as CollectionStatus : CollectionStatus.COLLECTOR_ASSIGNED } });
            } else if (action === "RECORD_WEIGHT") {
              await transaction.collectionWeight.updateMany({ where: { requestId: collection.id }, data: {
                actualKg: typeof prior.previousActualKg === "string" ? new Prisma.Decimal(prior.previousActualKg) : null,
                recordedByUserId: typeof prior.previousRecordedByUserId === "string" ? prior.previousRecordedByUserId : null,
                recordedAt: typeof prior.previousRecordedAt === "string" ? new Date(prior.previousRecordedAt) : null,
              } });
              await transaction.collectionRequest.update({ where: { id: collection.id }, data: { status: typeof prior.previousStatus === "string" ? prior.previousStatus as CollectionStatus : CollectionStatus.COLLECTOR_ASSIGNED } });
            } else if (collection.status !== CollectionStatus.COMPLETED && collection.status !== CollectionStatus.VERIFIED) {
              await transaction.collectionRequest.update({ where: { id: collection.id }, data: { status: CollectionStatus.CANCELLED, cancellationReason: "Simulator reset" } });
              await transaction.collectionAssignment.updateMany({ where: { requestId: collection.id, status: { in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED] } }, data: { status: AssignmentStatus.REVOKED, unassignedAt: now, reason: "Simulator reset" } });
            }
            await transaction.collectionStatusEvent.create({ data: {
              requestId: collection.id,
              actorId: adminId,
              fromStatus: collection.status,
              toStatus: typeof prior.previousStatus === "string" ? prior.previousStatus as CollectionStatus : CollectionStatus.CANCELLED,
              note: "Simulator state reset to its prior value.",
            } });
          }
        } else if (previous.entityType === "INCIDENT" && previous.entityId) {
          await transaction.incident.updateMany({ where: { id: previous.entityId, resolvedAt: null }, data: { resolvedAt: now, dedupeKey: null } });
          await transaction.report.updateMany({ where: { incidentId: previous.entityId, description: { startsWith: "[SIMULATOR:" } }, data: { status: "RESOLVED" } });
        } else if (previous.entityType === "MAINTENANCE_WINDOW" && previous.entityId) {
          await transaction.collectionRequest.updateMany({ where: { maintenanceWindowId: previous.entityId, status: CollectionStatus.SCHEDULED_MAINTENANCE }, data: { status: CollectionStatus.WAITING_FOR_ADMIN, maintenanceWindowId: null } });
          await transaction.facilityMaintenanceWindow.updateMany({ where: { id: previous.entityId }, data: { status: "COMPLETE" } });
        } else if (previous.entityType === "SENSOR_EVENT" && previous.entityId) {
          await transaction.facilitySensorEvent.updateMany({ where: { id: previous.entityId, resetAt: null }, data: { resetAt: now } });
        }
        await transaction.adminSimulatorEvent.update({ where: { id: previous.id }, data: { resetAt: now } });
      }
      const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
      if (admins.length) await transaction.notification.createMany({ data: admins.map(({ id: userId }) => ({
        userId,
        type: "COLLECTION_CANCELLED",
        title: "Simulation reset",
        body: `Admin reset ${activeEvents.length} simulator event(s). Real user data was not deleted.`,
        metadata: { resetEventId: event.id },
      })) });
      metadata.resetEventCount = activeEvents.length;
      entityType = "SIMULATION";
      entityId = event.id;
    } else if (input.action === "INDIVIDUAL_PICKUP_REQUEST" || input.action === "SEED_DEMO_DATA") {
      const collection = await transaction.collectionRequest.create({
        data: await (async () => {
          const recycler = await transaction.user.findFirst({ where: { role: UserRole.RECYCLER, status: AccountStatus.ACTIVE }, include: { recyclerProfile: true }, orderBy: { createdAt: "asc" } });
          if (!recycler) throw new ApiError(409, "SIMULATOR_REQUIRES_RECYCLER", "Create an active Recycler account before simulating pickup requests.");
          const facility = await transaction.facility.findFirst({
            where: {
              ...(input.facilityId ? { id: input.facilityId } : {}),
              approvalStatus: ApprovalStatus.APPROVED,
              isSuspended: false,
              materials: { some: { material: { isActive: true } } },
            },
            include: {
              materials: {
                where: { material: { isActive: true } },
                orderBy: { material: { name: "asc" } },
                take: 1,
              },
            },
          });
          const material = facility?.materials[0];
          if (!facility || !material) throw new ApiError(409, "SIMULATOR_REQUIRES_FACILITY", "Select an approved facility with an active material.");
          const requestedFor = new Date();
          const window = await transaction.facilityMaintenanceWindow.findFirst({ where: { facilityId: facility.id, status: { in: ["SCHEDULED", "ACTIVE"] }, startsAt: { lt: new Date(requestedFor.getTime() + 60 * 60 * 1000) }, endsAt: { gt: requestedFor } } });
          const status = window ? CollectionStatus.SCHEDULED_MAINTENANCE : CollectionStatus.WAITING_FOR_ADMIN;
          return {
            requesterId: recycler.id,
            materialId: material.materialId,
            destinationFacilityId: facility.id,
            estimatedKg: new Prisma.Decimal(12),
            requestedFor,
            requestedWindowEnd: new Date(requestedFor.getTime() + 60 * 60 * 1000),
            pickupAddress: recycler.recyclerProfile?.collectionAddress ?? facility.address,
            pickupLatitude: recycler.recyclerProfile?.collectionLatitude ?? facility.latitude,
            pickupLongitude: recycler.recyclerProfile?.collectionLongitude ?? facility.longitude,
            notes: `[SIMULATOR:${event.id}] Admin-created test request.`,
            status,
            maintenanceWindowId: window?.id,
            weight: { create: { estimatedKg: new Prisma.Decimal(12) } },
            statusEvents: { create: { actorId: adminId, toStatus: status, note: `Simulator event ${event.id}.` } },
          };
        })(),
        include: { destinationFacility: true },
      });
      entityType = "COLLECTION_REQUEST";
      entityId = collection.id;
      metadata.facilityId = collection.destinationFacilityId;
      metadata.status = collection.status;
      dispatchAfter = collection.status !== CollectionStatus.SCHEDULED_MAINTENANCE;
    } else if (["BIN_FULL", "ZONE_OVERFLOW", "FACILITY_STORAGE_FULL", "CREATE_COMMUNITY_REPORT", "CREATE_DUPLICATE_REPORT"].includes(input.action)) {
      const facility = await transaction.facility.findUnique({ where: { id: input.facilityId! }, select: { id: true, name: true, latitude: true, longitude: true } });
      if (!facility) throw new ApiError(404, "NOT_FOUND", "Facility was not found.");
      const reportType = input.action === "ZONE_OVERFLOW" ? ReportType.OVERFLOWING_DROP_OFF
        : input.action === "FACILITY_STORAGE_FULL" ? ReportType.FACILITY_FULL
          : ReportType.OVERFLOWING_BIN;
      const reportCount = input.action === "CREATE_DUPLICATE_REPORT" ? 2 : 1;
      const reporters = await transaction.user.findMany({ where: { role: UserRole.RECYCLER, status: AccountStatus.ACTIVE }, select: { id: true }, orderBy: { createdAt: "asc" }, take: reportCount });
      if (reporters.length < reportCount) throw new ApiError(409, "SIMULATOR_REQUIRES_REPORTERS", `This scenario needs ${reportCount} active Recycler account(s).`);
      const calculation = calculateIncidentPriorityScore({ type: reportType, reportCount, waitingHours: 0, facilityUrgency: reportType === ReportType.FACILITY_FULL, proximityKm: null, proximitySource: "REMOTE" });
      const incident = await transaction.incident.create({ data: {
        type: reportType,
        priority: calculation.priority,
        priorityScore: calculation.score,
        priorityFactors: calculation.factors,
        facilityId: facility.id,
        details: `[SIMULATOR:${event.id}] ${input.action.toLowerCase().replaceAll("_", " ")}`,
        dedupeKey: `simulator:${event.id}`,
        latitude: facility.latitude,
        longitude: facility.longitude,
        reportCount,
        communityVerified: reportCount > 1,
        firstReportedAt: new Date(),
        lastReportedAt: new Date(),
      } });
      await transaction.report.createMany({ data: reporters.map(({ id: reporterId }) => ({
        reporterId,
        facilityId: facility.id,
        type: reportType,
        status: "OPEN",
        description: `[SIMULATOR:${event.id}] ${input.action.toLowerCase().replaceAll("_", " ")}`,
        latitude: facility.latitude,
        longitude: facility.longitude,
        incidentId: incident.id,
      })) });
      entityType = "INCIDENT";
      entityId = incident.id;
      metadata.facilityId = facility.id;
      metadata.reportCount = reportCount;
    } else if (input.action === "FACILITY_FULL" || input.action === "FACILITY_RECOVERED") {
      const facility = await transaction.facility.findUnique({ where: { id: input.facilityId! }, select: { id: true, operationalStatus: true } });
      if (!facility) throw new ApiError(404, "NOT_FOUND", "Facility was not found.");
      const status = input.action === "FACILITY_FULL" ? FacilityOperationalStatus.FULL : FacilityOperationalStatus.OPEN;
      await transaction.facility.update({ where: { id: facility.id }, data: { operationalStatus: status } });
      entityType = "FACILITY";
      entityId = facility.id;
      metadata.previousOperationalStatus = facility.operationalStatus;
      metadata.operationalStatus = status;
    } else if (input.action === "COLLECTOR_OFFLINE") {
      const collector = await transaction.collectorProfile.findUnique({ where: { id: input.collectorProfileId! }, select: { id: true, availability: true } });
      if (!collector) throw new ApiError(404, "NOT_FOUND", "Collector was not found.");
      await transaction.collectorProfile.update({ where: { id: collector.id }, data: { availability: CollectorAvailability.OFFLINE } });
      entityType = "COLLECTOR";
      entityId = collector.id;
      metadata.previousAvailability = collector.availability;
    } else if (input.action === "FACILITY_MAINTENANCE" || input.action === "START_SERVICE_PAUSE") {
      const facility = await transaction.facility.findUnique({ where: { id: input.facilityId! }, select: { id: true, name: true } });
      if (!facility) throw new ApiError(404, "NOT_FOUND", "Facility was not found.");
      const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
      const endsAt = input.endsAt ? new Date(input.endsAt) : new Date(startsAt.getTime() + 30 * 60 * 1000);
      const window = await transaction.facilityMaintenanceWindow.create({ data: { facilityId: facility.id, createdByUserId: adminId, startsAt, endsAt, gracePeriodMinutes: input.gracePeriodMinutes ?? 15, status: startsAt <= new Date() ? "ACTIVE" : "SCHEDULED" } });
      const affected = await transaction.collectionRequest.findMany({ where: { destinationFacilityId: facility.id, requestedFor: { gte: startsAt, lt: endsAt }, status: { in: [CollectionStatus.PENDING, CollectionStatus.WAITING_FOR_ADMIN] } }, select: { id: true, status: true } });
      if (affected.length) {
        await transaction.collectionRequest.updateMany({ where: { id: { in: affected.map(({ id }) => id) } }, data: { status: CollectionStatus.SCHEDULED_MAINTENANCE, maintenanceWindowId: window.id } });
        await transaction.collectionStatusEvent.createMany({ data: affected.map((item) => ({ requestId: item.id, actorId: adminId, fromStatus: item.status, toStatus: CollectionStatus.SCHEDULED_MAINTENANCE, note: `Held for simulator maintenance at ${facility.name}.` })) });
      }
      entityType = "MAINTENANCE_WINDOW";
      entityId = window.id;
      metadata.facilityId = facility.id;
      metadata.affectedRequests = affected.length;
    } else if (input.action === "ENABLE_OVERRUN") {
      const window = await transaction.facilityMaintenanceWindow.findFirst({ where: { facilityId: input.facilityId!, status: { in: ["SCHEDULED", "ACTIVE"] } }, orderBy: { startsAt: "desc" } });
      if (!window) throw new ApiError(404, "ACTIVE_MAINTENANCE_NOT_FOUND", "No scheduled maintenance exists for this facility.");
      await transaction.facilityMaintenanceWindow.update({ where: { id: window.id }, data: { overrunEnabled: true } });
      entityType = "MAINTENANCE_WINDOW";
      entityId = window.id;
      metadata.facilityId = window.facilityId;
      metadata.previousOverrunEnabled = window.overrunEnabled;
    } else if (input.action === "TRIGGER_SENSOR_SPIKE") {
      const sensor = await transaction.facilitySensorEvent.create({ data: { facilityId: input.facilityId!, createdByUserId: adminId, reading: 100, expiresAt: new Date(Date.now() + 6000) } });
      entityType = "SENSOR_EVENT";
      entityId = sensor.id;
      metadata.facilityId = input.facilityId!;
      metadata.expiresAt = sensor.expiresAt.toISOString();
    } else if (input.action === "RESET_SENSOR") {
      const now = new Date();
      const reset = await transaction.facilitySensorEvent.updateMany({ where: { facilityId: input.facilityId!, resetAt: null, expiresAt: { gt: now } }, data: { resetAt: now } });
      entityType = "FACILITY_SENSOR";
      entityId = input.facilityId!;
      metadata.resetCount = reset.count;
    } else if (["COMPLETE_COLLECTION", "RECORD_WEIGHT", "COLLECTOR_ACCEPT", "COLLECTOR_DECLINE", "DRIVE_COLLECTOR_TO_SITE"].includes(input.action)) {
      const collection = await transaction.collectionRequest.findUnique({ where: { id: input.requestId! }, include: { assignments: { where: { status: { in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED] } }, include: { collector: true }, orderBy: { assignedAt: "desc" }, take: 1 }, weight: true } });
      if (!collection) throw new ApiError(404, "NOT_FOUND", "Collection request was not found.");
      if (!collection.notes?.startsWith("[SIMULATOR:")) throw new ApiError(409, "REQUEST_NOT_SIMULATED", "Simulator workflow actions are limited to simulator-tagged collection requests.");
      const assignment = collection.assignments[0];
      if (!assignment) throw new ApiError(409, "NO_ACTIVE_ASSIGNMENT", "The request has no active collector assignment.");
      const now = new Date();
      if (input.action === "COLLECTOR_ACCEPT") {
        await transaction.collectionAssignment.update({ where: { id: assignment.id }, data: { status: AssignmentStatus.ACCEPTED, acceptedAt: assignment.acceptedAt ?? now } });
        await transaction.collectionRequest.update({ where: { id: collection.id }, data: { status: CollectionStatus.COLLECTOR_ON_THE_WAY } });
        await transaction.collectionStatusEvent.create({ data: { requestId: collection.id, actorId: adminId, fromStatus: collection.status, toStatus: CollectionStatus.COLLECTOR_ON_THE_WAY, note: "Simulator: collector accepted the assignment." } });
      } else if (input.action === "COLLECTOR_DECLINE") {
        await transaction.collectionAssignment.update({ where: { id: assignment.id }, data: { status: AssignmentStatus.DECLINED, unassignedAt: now, reason: "Simulator: collector declined the assignment." } });
        await transaction.collectorProfile.update({ where: { id: assignment.collector.id }, data: { availability: CollectorAvailability.AVAILABLE } });
        await transaction.collectionRequest.update({ where: { id: collection.id }, data: { status: CollectionStatus.WAITING_FOR_ADMIN } });
        await transaction.collectionStatusEvent.create({ data: { requestId: collection.id, actorId: adminId, fromStatus: collection.status, toStatus: CollectionStatus.WAITING_FOR_ADMIN, note: "Simulator: collector declined; request returned to dispatch." } });
        dispatchAfter = true;
      } else if (input.action === "DRIVE_COLLECTOR_TO_SITE") {
        await transaction.collectorProfile.update({ where: { id: assignment.collector.id }, data: { currentLatitude: collection.pickupLatitude, currentLongitude: collection.pickupLongitude, lastLocationUpdatedAt: now } });
        metadata.previousLatitude = assignment.collector.currentLatitude;
        metadata.previousLongitude = assignment.collector.currentLongitude;
      } else if (input.action === "RECORD_WEIGHT") {
        await transaction.collectionWeight.upsert({
          where: { requestId: collection.id },
          create: { requestId: collection.id, estimatedKg: collection.estimatedKg, actualKg: input.actualKg!, recordedByUserId: adminId, recordedAt: now },
          update: { actualKg: input.actualKg!, recordedByUserId: adminId, recordedAt: now },
        });
        await transaction.collectionRequest.update({ where: { id: collection.id }, data: { status: CollectionStatus.COLLECTED } });
        await transaction.collectionStatusEvent.create({ data: { requestId: collection.id, actorId: adminId, fromStatus: collection.status, toStatus: CollectionStatus.COLLECTED, note: `Simulator: ${input.actualKg} kg recorded.` } });
      } else {
        await transaction.collectionRequest.update({ where: { id: collection.id }, data: { status: CollectionStatus.COMPLETED } });
        await transaction.collectionAssignment.update({ where: { id: assignment.id }, data: { status: AssignmentStatus.COMPLETED } });
        await transaction.collectorProfile.update({ where: { id: assignment.collector.id }, data: { availability: CollectorAvailability.AVAILABLE } });
        await transaction.collectionStatusEvent.create({ data: { requestId: collection.id, actorId: adminId, fromStatus: collection.status, toStatus: CollectionStatus.COMPLETED, note: "Simulator: collection completed." } });
      }
      entityType = "COLLECTION_REQUEST";
      entityId = collection.id;
      metadata.action = input.action;
      metadata.previousStatus = collection.status;
      if (assignment) metadata.collectorProfileId = assignment.collector.id;
      metadata.assignmentId = assignment.id;
      metadata.previousAssignmentStatus = assignment.status;
      metadata.previousAcceptedAt = assignment.acceptedAt?.toISOString() ?? null;
      metadata.previousAvailability = assignment.collector.availability;
      if (input.action === "RECORD_WEIGHT") {
        metadata.previousActualKg = collection.weight?.actualKg?.toString() ?? null;
        metadata.previousRecordedByUserId = collection.weight?.recordedByUserId ?? null;
        metadata.previousRecordedAt = collection.weight?.recordedAt?.toISOString() ?? null;
      }
      if (input.action === "DRIVE_COLLECTOR_TO_SITE") metadata.previousLocationUpdatedAt = assignment.collector.lastLocationUpdatedAt?.toISOString() ?? null;
    }

    await transaction.adminSimulatorEvent.update({ where: { id: event.id }, data: { entityType, entityId, metadata, ...(input.action === "RESET_SIMULATION" ? { resetAt: new Date() } : {}) } });
    await transaction.adminAuditLog.create({ data: {
      adminId,
      entityType: entityType ?? "SIMULATION",
      entityId: entityId ?? event.id,
      action: `SIMULATOR_${input.action}`,
      metadata: { simulatorEventId: event.id, ...metadata },
    } });
    return { ...event, entityType, entityId, metadata };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (dispatchAfter) await dispatchWaitingCollections();
  return result;
}