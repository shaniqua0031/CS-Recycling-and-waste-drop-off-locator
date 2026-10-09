import { AccountStatus, CollectionStatus, UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export async function activateDueCollectionEvents(now = new Date()): Promise<number> {
  const dueEvents = await prisma.bufferedCollectionEvent.findMany({
    where: { status: "OPEN", activateAt: { lte: now } },
    select: { id: true },
    orderBy: { activateAt: "asc" },
    take: 50,
  });
  let activatedCount = 0;

  for (const { id } of dueEvents) {
    const didActivate = await prisma.$transaction(async (transaction) => {
      const event = await transaction.bufferedCollectionEvent.findUnique({ where: { id } });
      if (!event || event.status !== "OPEN" || event.activateAt > now) return false;

      const claimed = await transaction.bufferedCollectionEvent.updateMany({
        where: { id, status: "OPEN", activateAt: { lte: now } },
        data: { status: "ACTIVATED", resolvedAt: now },
      });
      if (claimed.count !== 1) return false;

      const collection = await transaction.collectionRequest.create({
        data: {
          requesterId: event.requesterId,
          materialId: event.materialId,
          destinationFacilityId: event.destinationFacilityId,
          estimatedKg: event.estimatedKg,
          requestedFor: event.requestedFor,
          pickupAddress: event.pickupAddress,
          pickupLatitude: event.pickupLatitude,
          pickupLongitude: event.pickupLongitude,
          notes: event.notes,
          bufferedEventId: event.id,
          status: CollectionStatus.WAITING_FOR_ADMIN,
          weight: { create: { estimatedKg: event.estimatedKg } },
          statusEvents: { create: { actorId: event.requesterId, toStatus: CollectionStatus.WAITING_FOR_ADMIN, note: "Buffered bin-full event activated after ten seconds." } },
        },
      });
      await transaction.notification.create({
        data: {
          userId: event.requesterId,
          type: "COLLECTION_REQUEST_CREATED",
          title: "Pickup pending",
          body: "The bin-full event remained unresolved for ten seconds. Your collection request is waiting for Admin assignment.",
          metadata: { requestId: collection.id, eventId: event.id },
        },
      });
      const admins = await transaction.user.findMany({ where: { role: UserRole.ADMIN, status: AccountStatus.ACTIVE }, select: { id: true } });
      if (admins.length) {
        await transaction.notification.createMany({
          data: admins.map(({ id: userId }) => ({
            userId,
            type: "COLLECTION_REQUEST_CREATED",
            title: "Buffered bin-full pickup",
            body: `A bin-full event created collection request ${collection.id.slice(-8)} after the ten-second buffer.`,
            metadata: { requestId: collection.id, eventId: event.id },
          })),
        });
      }
      return true;
    }, { isolationLevel: "Serializable" });
    if (didActivate) activatedCount += 1;
  }

  return activatedCount;
}
