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

  const isDatabaseUnavailable = ["P1001", "P1002", "P1003", "P1008", "P1017", "P2028"].includes(error.code ?? "")
    || error.name === "PrismaClientInitializationError"
    || error.message.includes("Can't reach database server")
    || error.message.includes("Transaction already closed");
  if (isDatabaseUnavailable) {
    console.error(error);
    response.status(503).json({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: error.code === "P2028" || error.message.includes("Transaction already closed")
          ? "The database operation took too long. Please retry."
          : "The database is currently unavailable. Please try again shortly.",
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
