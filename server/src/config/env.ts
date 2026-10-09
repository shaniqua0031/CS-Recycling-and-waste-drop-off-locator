import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z.string().url().optional(),
  AUTH_JWT_SECRET: z.string().min(32).optional(),
  AUTH_COOKIE_NAME: z.string().min(1).default("wastewise_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  CORS_ORIGINS: z.string().optional(),
  CLIENT_ORIGINS: z.string().optional(),
});

const parsedEnvironment = environmentSchema.parse(process.env);
const defaultClientOrigins = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,https://cs-recycling-and-waste-drop-off-loc.vercel.app,https://cs-recycling-and-waste-drop-off-locator-jclyuxq6y.vercel.app";
const configuredOrigins = parsedEnvironment.CORS_ORIGINS ?? parsedEnvironment.CLIENT_ORIGINS ?? defaultClientOrigins;

export const env = {
  ...parsedEnvironment,
  CLIENT_ORIGINS: configuredOrigins.split(",").map((origin) => origin.trim()).filter(Boolean),
};

const reloopVercelDeploymentOrigin = /^https:\/\/cs-recycling-and-waste-drop-off-loc(?:ator)?(?:-[a-z0-9-]+)?\.vercel\.app$/;

export function isTrustedClientOrigin(origin: string | undefined): boolean {
  return origin === undefined || env.CLIENT_ORIGINS.includes(origin) || reloopVercelDeploymentOrigin.test(origin);
}

if (env.NODE_ENV === "production" && !env.AUTH_JWT_SECRET) {
  throw new Error("AUTH_JWT_SECRET must be set in production.");
}
