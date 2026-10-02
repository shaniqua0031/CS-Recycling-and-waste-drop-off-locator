import type { RequestHandler } from "express";
import { env } from "../config/env";
import { ApiError } from "../utils/api-error";

export const requireTrustedOrigin: RequestHandler = (request, _response, next) => {
  const origin = request.get("origin");
  if (origin && !env.CLIENT_ORIGINS.includes(origin)) {
    next(new ApiError(403, "UNTRUSTED_ORIGIN", "This request origin is not allowed."));
    return;
  }
  next();
};
