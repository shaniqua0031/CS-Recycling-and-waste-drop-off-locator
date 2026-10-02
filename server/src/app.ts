import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error-handler";
import { authRouter } from "./features/auth/auth.routes";
import { adminRouterProtected } from "./features/admin/admin.routes";
import { collectionsRouterProtected } from "./features/collections/collections.routes";
import { healthRouter } from "./routes/health";
import { usersRouter } from "./routes/users";

export const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: env.CLIENT_ORIGINS, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/admin", adminRouterProtected);
app.use("/api/v1/collections", collectionsRouterProtected);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1", healthRouter);
app.use((_request, response) => {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested API route was not found.",
    },
  });
});
app.use(errorHandler);
