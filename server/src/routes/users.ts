import { Router } from "express";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { requireAuthentication } from "../middleware/authenticate";
import { validateBody } from "../middleware/validate-body";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/api-error";

export const usersRouter = Router();
const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());
const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  email: emailSchema.optional(),
  phone: z.string().trim().min(7).max(32).nullable().optional(),
  collectionAddress: z.string().trim().min(5).max(300).nullable().optional(),
  collectionLatitude: z.number().min(-90).max(90).nullable().optional(),
  collectionLongitude: z.number().min(-180).max(180).nullable().optional(),
}).strict().refine((input) => Object.keys(input).length > 0, "Provide at least one profile field.").refine(
  (input) => (input.collectionLatitude === undefined) === (input.collectionLongitude === undefined),
  "Provide both collection coordinates or neither.",
);
const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128).refine((password) => Buffer.byteLength(password, "utf8") <= 72),
}).strict();

function requireRecycler(userId: string, role: UserRole) {
  if (role !== UserRole.RECYCLER) throw new ApiError(403, "FORBIDDEN", "Only Recycler accounts can manage this profile.");
  return userId;
}

usersRouter.use(requireAuthentication);

usersRouter.get("/me", (request, response) => {
  const user = request.auth!;
  response.status(200).json({
    data: {
      id: user.userId,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    },
  });
});

usersRouter.get("/me/profile", async (request, response, next) => {
  try {
    const userId = requireRecycler(request.auth!.userId, request.auth!.role);
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { recyclerProfile: true } });
    if (!user?.recyclerProfile) throw new ApiError(404, "PROFILE_NOT_FOUND", "Recycler profile was not found.");
    response.json({ data: {
      displayName: user.recyclerProfile.displayName,
      email: user.email,
      phone: user.recyclerProfile.phone,
      collectionAddress: user.recyclerProfile.collectionAddress,
      collectionLatitude: user.recyclerProfile.collectionLatitude,
      collectionLongitude: user.recyclerProfile.collectionLongitude,
    } });
  } catch (error) {
    next(error);
  }
});

usersRouter.patch("/me/profile", validateBody(profileSchema), async (request, response, next) => {
  try {
    const userId = requireRecycler(request.auth!.userId, request.auth!.role);
    const input = profileSchema.parse(request.body);
    try {
      const updated = await prisma.$transaction(async (transaction) => {
        const user = await transaction.user.findUnique({ where: { id: userId }, include: { recyclerProfile: true } });
        if (!user?.recyclerProfile) throw new ApiError(404, "PROFILE_NOT_FOUND", "Recycler profile was not found.");
        const savedUser = input.email ? await transaction.user.update({ where: { id: userId }, data: { email: input.email } }) : user;
        const profile = await transaction.recyclerProfile.update({
          where: { userId },
          data: {
            ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
            ...(input.phone !== undefined ? { phone: input.phone } : {}),
            ...(input.collectionAddress !== undefined ? { collectionAddress: input.collectionAddress } : {}),
            ...(input.collectionLatitude !== undefined ? { collectionLatitude: input.collectionLatitude, collectionLongitude: input.collectionLongitude } : {}),
          },
        });
        return { profile, email: savedUser.email };
      });
      response.json({ data: {
        displayName: updated.profile.displayName,
        email: updated.email,
        phone: updated.profile.phone,
        collectionAddress: updated.profile.collectionAddress,
        collectionLatitude: updated.profile.collectionLatitude,
        collectionLongitude: updated.profile.collectionLongitude,
      } });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        throw new ApiError(409, "EMAIL_IN_USE", "That email address is already registered.");
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/me/password", validateBody(passwordSchema), async (request, response, next) => {
  try {
    const userId = requireRecycler(request.auth!.userId, request.auth!.role);
    const input = passwordSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      throw new ApiError(400, "CURRENT_PASSWORD_INVALID", "The current password is incorrect.");
    }
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.session.updateMany({ where: { userId, id: { not: request.auth!.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    response.json({ data: { passwordUpdated: true, otherSessionsRevoked: true } });
  } catch (error) {
    next(error);
  }
});
