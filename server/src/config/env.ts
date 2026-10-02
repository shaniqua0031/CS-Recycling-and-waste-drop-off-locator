import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z.string().url().optional(),
  AUTH_JWT_SECRET: z.string().min(32).optional(),
  AUTH_COOKIE_NAME: z.string().min(1).default("wastewise_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  CLIENT_ORIGINS: z.string().default("http://localhost:3000,http://127.0.0.1:3000").transform((value) =>
    value.split(",").map((origin) => origin.trim()).filter(Boolean),
  ),
});

export const env = environmentSchema.parse(process.env);

if (env.NODE_ENV === "production" && !env.AUTH_JWT_SECRET) {
  throw new Error("AUTH_JWT_SECRET must be set in production.");
}
