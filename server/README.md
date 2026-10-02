# WasteWise API

The HTTP server has a single entry point: `index.js`. It starts the Express app assembled from the TypeScript modules in `src/`.

## Local setup

1. Run `npm install` in `server/`.
2. Copy `.env.example` to `.env`, set `DATABASE_URL` to a Neon PostgreSQL connection string, and replace `AUTH_JWT_SECRET` with at least 32 random characters. Keep `.env` private.
3. Run `npm run prisma:validate` and `npm run prisma:generate`.
4. Run `npm run prisma:migrate:dev` to apply checked-in migrations to your development database.
5. Run `npm run prisma:seed` to add material categories and initial reward rates.
6. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to a dedicated Admin identity in the private `server/.env`, then run `npm run admin:create`. The password must be 12-128 characters and no more than 72 UTF-8 bytes. This command refuses to promote an existing non-Admin account; never add Admin to public signup.
7. Start the API in development with `npm run api:dev`; this watches the TypeScript modules and launches through `index.js`. `GET /api/v1/health` is the health check. Set `CLIENT_ORIGINS` to the exact browser origin(s) used by Next.js.

For production, apply checked-in migrations with `npx prisma migrate deploy`, configure the Admin bootstrap variables privately, run `npm run admin:create`, then run `npm start`. This builds the TypeScript modules and starts the compiled app through `index.js`.

The API can be typechecked with `npm run api:build` and its unit tests run with `npm run test:api`. The checked-in migration does not connect to a database during build or validation. Login sessions use an HttpOnly, SameSite=Lax cookie; production deployments require HTTPS so the cookie can be marked Secure. Login rate limiting currently uses in-memory storage and must use a shared store when horizontally scaling the API.
