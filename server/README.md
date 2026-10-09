# WasteWise API

The HTTP server has a single entry point: `index.js`. It starts the Express app assembled from the TypeScript modules in `src/`.

## Deployment environment

For Render, set `CORS_ORIGINS` to `https://cs-recycling-and-waste-drop-off-locator-jclyuxq6y.vercel.app,https://cs-recycling-and-waste-drop-off-loc.vercel.app` (comma-separated, add localhost only for local development). `CLIENT_ORIGINS` remains a backwards-compatible alias. CORS also allows this project's `cs-recycling-and-waste-drop-off-loc*.vercel.app` deployment URLs. The Render API URL is the request destination, not a browser origin to add to this allowlist. Keep credentialed requests restricted to this Vercel project and other explicitly trusted origins.

The frontend separately requires `NEXT_PUBLIC_API_BASE_URL` set to this API's public base URL ending in `/api/v1` before its build/deployment. Since Next.js embeds this public variable at build time, redeploy the frontend after changing it.

## Local setup

1. Run `npm install` in `server/`.
2. Copy `.env.example` to `.env`, set `DATABASE_URL` to a Neon PostgreSQL connection string, and replace `AUTH_JWT_SECRET` with at least 32 random characters. Keep `.env` private.
3. Run `npm run prisma:validate` and `npm run prisma:generate`.
4. Run `npm run prisma:migrate:dev` to apply checked-in migrations to your development database.
5. Run `npm run prisma:seed` to add material categories and initial reward rates.
6. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to a dedicated Admin identity in the private `server/.env`, then run `npm run admin:create`. The password must be 12-128 characters and no more than 72 UTF-8 bytes. This command refuses to promote an existing non-Admin account; never add Admin to public signup.
7. Start the API in development with `npm run api:dev`; this watches the TypeScript modules and launches through `index.js`. `GET /api/v1/health` is the health check. Set `CLIENT_ORIGINS` to the exact browser origin(s) used by Next.js.

For production on Render, use `npm ci && npm run api:build` as the build command and `npm start` as the start command. `api:build` generates Prisma Client, clears stale `dist`, and compiles production TypeScript only; `start` runs only `node index.js --compiled`. Tests are excluded from the production TypeScript build and run only when explicitly requested with `npm run test:api`. Apply checked-in migrations with `npx prisma migrate deploy`, then configure the Admin bootstrap variables privately and run `npm run admin:create`. Ensure `DATABASE_URL` is configured on the API host; `prisma.config.ts` requires it during client generation.

The API can be typechecked with `npm run api:build` and its unit tests run with `npm run test:api`. The checked-in migration does not connect to a database during build or validation. Login sessions use an HttpOnly, SameSite=Lax cookie; production deployments require HTTPS so the cookie can be marked Secure. Login rate limiting currently uses in-memory storage and must use a shared store when horizontally scaling the API.
