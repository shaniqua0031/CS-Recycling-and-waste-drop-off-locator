import { AccountStatus, CollectionStatus, IncidentPriority, Prisma, ReportType, UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { dispatchWaitingCollections } from "../collections/collections.routes";

export async function processFacilityMaintenance(now = new Date()): Promise<{ activated: number; released: number; overruns: number }> {
  const windows = await prisma.facilityMaintenanceWindow.findMany({
    where: { status: { in: ["SCHEDULED", "ACTIVE"] } },
    select: { id: true },
    orderBy: { startsAt: "asc" },
    take: 50,
  });
  let activated = 0;
  let released = 0;
  let overruns = 0;

  for (const { id } of windows) {
    const result = await prisma.$transaction(async (transaction) => {
      const window = await transaction.facilityMaintenanceWindow.findUnique({
        where: { id },
        include: { facility: { select: { id: true, name: true, latitude: true, longitude: true } } },
      });
      if (!window || window.status === "COMPLETE" || window.status === "OVERRUN") return null;

      let didActivate = false;
      if (window.status === "SCHEDULED" && window.startsAt <= now) {
        await transaction.facilityMaintenanceWindow.update({ where: { id }, data: { status: "ACTIVE" } });
        didActivate = true;
      }
      if (window.endsAt > now) return { activated: didActivate, released: false, overrun: false };

      if (window.overrunEnabled) {
        const graceEndsAt = new Date(window.endsAt.getTime() + window.gracePeriodMinutes * 60_000);
        if (now < graceEndsAt) return { activated: didActivate, released: false, overrun: false };
        const requests = await transaction.collectionRequest.findMany({
          where: { maintenanceWindowId: id, status: CollectionStatus.SCHEDULED_MAINTENANCE },
          select: { id: true, requesterId: true },
        });
        if (requests.length) {
          await transaction.incident.upsert({
            where: { dedupeKey: `maintenance-overrun:${id}` },
            create: {
              type: ReportType.FACILITY_CLOSED,
              priority: IncidentPriority.HIGH,
              priorityScore: 4,
              priorityFactors: { facilityUrgency: 2, affectedRequests: requests.length, maintenanceOverrun: true },
              facilityId: window.facilityId,
              details: `Scheduled maintenance overran its grace period; ${requests.length} collection request(s) are waiting.`,
              dedupeKey: `maintenance-overrun:${id}`,
              latitude: window.facility.latitude,
              longitude: window.facility.longitude,
              reportCount: requests.length,
              firstReportedAt: window.endsAt,
              lastReportedAt: now,
            },
            update: { reportCount: requests.length, lastReportedAt: now },
          });
          const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
          if (admins.length) await transaction.notification.createMany({ data: admins.map(({ id: userId }) => ({
            userId,
            type: "FACILITY_FULL",
            title: "Service pause overrun",
            body: `${window.facility.name} maintenance exceeded its grace period; ${requests.length} request(s) require attention.`,
            metadata: { maintenanceWindowId: id, facilityId: window.facilityId, requestCount: requests.length },
          })) });
          await transaction.adminAuditLog.create({ data: {
            adminId: window.createdByUserId,
            entityType: "MAINTENANCE_WINDOW",
            entityId: id,
            action: "SERVICE_PAUSE_OVERRUN",
            reason: "The scheduled maintenance grace period elapsed with affected requests pending.",
            metadata: { facilityId: window.facilityId, requestCount: requests.length },
          } });
        }
        await transaction.facilityMaintenanceWindow.update({ where: { id }, data: { status: "OVERRUN" } });
        return { activated: didActivate, released: false, overrun: requests.length > 0 };
      }

      const affected = await transaction.collectionRequest.findMany({
        where: { maintenanceWindowId: id, status: CollectionStatus.SCHEDULED_MAINTENANCE },
        select: { id: true },
      });
      if (affected.length) {
        await transaction.collectionRequest.updateMany({
          where: { maintenanceWindowId: id, status: CollectionStatus.SCHEDULED_MAINTENANCE },
          data: { status: CollectionStatus.WAITING_FOR_ADMIN, maintenanceWindowId: null },
        });
        await transaction.collectionStatusEvent.createMany({ data: affected.map(({ id: requestId }) => ({
          requestId,
          actorId: window.createdByUserId,
          fromStatus: CollectionStatus.SCHEDULED_MAINTENANCE,
          toStatus: CollectionStatus.WAITING_FOR_ADMIN,
          note: `Facility maintenance at ${window.facility.name} ended.`,
        })) });
      }
      await transaction.facilityMaintenanceWindow.update({ where: { id }, data: { status: "COMPLETE" } });
      return { activated: didActivate, released: affected.length > 0, overrun: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!result) continue;
    if (result.activated) activated += 1;
    if (result.released) released += 1;
    if (result.overrun) overruns += 1;
  }

  if (released) await dispatchWaitingCollections();
  return { activated, released, overruns };
}