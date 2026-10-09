import { createHash, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";

const TOKEN_ISSUER = "wastewise-api";
const TOKEN_AUDIENCE = "wastewise-client";

function getSecret(): string {
  const secret = env.AUTH_JWT_SECRET || (process.env.NODE_ENV !== "production" ? "development-secret-key-32-characters-minimum-length" : undefined);
  if (!secret) {
    throw new ApiError(503, "AUTH_NOT_CONFIGURED", "Authentication is not configured on this server.");
  }
  return secret;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function issueSessionToken(userId: string, sessionId: string): string {
  return jwt.sign({ sid: sessionId }, getSecret(), {
    subject: userId,
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
    expiresIn: `${env.SESSION_TTL_HOURS}h`,
  });
}

export function verifySessionToken(token: string): { userId: string; sessionId: string } {
  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(token, getSecret(), {
      algorithms: ["HS256"],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "UNAUTHENTICATED", "Your session is invalid or has expired.");
  }

  if (typeof payload === "string" || typeof payload.sub !== "string" || typeof payload.sid !== "string") {
    throw new ApiError(401, "UNAUTHENTICATED", "Your session is invalid or has expired.");
  }

  return { userId: payload.sub, sessionId: payload.sid };
}

export function matchesSessionToken(token: string, storedHash: string): boolean {
  const provided = Buffer.from(hashSessionToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return provided.length === stored.length && timingSafeEqual(provided, stored);
}

export function getSessionCookieOptions(options: { isProduction?: boolean; maxAge?: number } = {}): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax" | "none";
  path: string;
  maxAge?: number;
} {
  const isProduction = options.isProduction ?? env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: options.maxAge ?? env.SESSION_TTL_HOURS * 60 * 60 * 1000,
  };
}

export function setSessionCookie(response: Response, token: string): void {
  response.cookie(env.AUTH_COOKIE_NAME, token, getSessionCookieOptions());
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(env.AUTH_COOKIE_NAME, getSessionCookieOptions({ maxAge: 0 }));
}
