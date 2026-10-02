import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

type HttpError = Error & {
  statusCode?: number;
  code?: string;
};

export const errorHandler: ErrorRequestHandler = (error: HttpError, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: error.flatten(),
      },
    });
    return;
  }

  const isConflict = error.code === "P2002";
  const statusCode = isConflict ? 409 : error.statusCode ?? 500;
  const code = isConflict ? "CONFLICT" : error.code ?? "INTERNAL_SERVER_ERROR";
  const message = isConflict
    ? "A record with this value already exists."
    : statusCode >= 500 && process.env.NODE_ENV === "production"
    ? "An unexpected server error occurred."
    : error.message;

  if (statusCode >= 500) {
    console.error(error);
  }

  response.status(statusCode).json({
    error: {
      code,
      message,
    },
  });
};
