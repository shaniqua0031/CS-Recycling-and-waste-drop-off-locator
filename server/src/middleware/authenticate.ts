import type { RequestHandler } from "express";
import { UserRole } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../features/auth/auth.types";
import { hashSessionToken, matchesSessionToken, verifySessionToken } from "../features/auth/auth.security";
import { ApiError } from "../utils/api-error";

import { findDemoSessionById, findDemoUserById, isDbError } from "../lib/demo-store";

function readCookie(header: string | undefined, cookieName: string): string | undefined {
  const tokenCookie = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
  if (!tokenCookie) return undefined;

  try {
    return decodeURIComponent(tokenCookie.slice(cookieName.length + 1));
  } catch {
    return undefined;
  }
}

export const requireAuthentication: RequestHandler = (request, _response, next) => {
  const token = readCookie(request.headers.cookie, env.AUTH_COOKIE_NAME);
  if (!token) {
    next(new ApiError(401, "UNAUTHENTICATED", "Sign in to continue."));
    return;
  }

  let tokenIdentity: { userId: string; sessionId: string };
  try {
    tokenIdentity = verifySessionToken(token);
  } catch (error) {
    next(error);
    return;
  }

  const checkDemoFallback = () => {
    const demoSession = findDemoSessionById(tokenIdentity.sessionId);
    const demoUser = findDemoUserById(tokenIdentity.userId);

    if (
      !demoSession ||
      !demoUser ||
      demoSession.userId !== tokenIdentity.userId ||
      demoSession.revokedAt ||
      demoSession.expiresAt <= new Date() ||
      !matchesSessionToken(token, demoSession.tokenHash) ||
      demoUser.status !== "ACTIVE"
    ) {
      throw new ApiError(401, "UNAUTHENTICATED", "Your session is invalid or has expired.");
    }

    const auth: AuthenticatedUser = {
      userId: demoUser.id,
      sessionId: demoSession.id,
      email: demoUser.email,
      role: demoUser.role,
      displayName: demoUser.displayName,
    };
    request.auth = auth;
    next();
  };

  void prisma.session.findUnique({
    where: { id: tokenIdentity.sessionId },
    include: { user: { include: { recyclerProfile: true } } },
  }).then((session) => {
    if (!session) {
      checkDemoFallback();
      return;
    }

    if (
      session.userId !== tokenIdentity.userId ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !matchesSessionToken(token, session.tokenHash) ||
      session.user.status !== "ACTIVE"
    ) {
      throw new ApiError(401, "UNAUTHENTICATED", "Your session is invalid or has expired.");
    }

    const auth: AuthenticatedUser = {
      userId: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      role: session.user.role,
      displayName: session.user.recyclerProfile?.displayName ?? null,
    };
    request.auth = auth;
    next();
  }).catch((error) => {
    if (isDbError(error)) {
      try {
        checkDemoFallback();
      } catch (fallbackError) {
        next(fallbackError);
      }
    } else {
      next(error);
    }
  });
};

export function requireRoles(...roles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) {
      next(new ApiError(401, "UNAUTHENTICATED", "Sign in to continue."));
      return;
    }
    if (!roles.includes(request.auth.role)) {
      next(new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action."));
      return;
    }
    next();
  };
}
