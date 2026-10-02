# Implementation Prompt: Graceful In-Memory Auth Fallback on Database Unavailability

## Context
When signing up or logging in on WasteWise, the backend API attempts to connect to a PostgreSQL database via Prisma. If the configured `DATABASE_URL` is unreachable (e.g. Neon database server offline or network unavailable returning Prisma error P1001), sign-up and sign-in requests fail with:
`Can't reach database server at 'ep-bitter-resonance-b58ss80v-pooler.c-7.us-east-2.aws.neon.tech:5432'`.

Per `AGENTS.md` and `PROJECT_CONTRACT.md`, a production database with full user management is explicitly out of scope for this release, and prototype in-memory auth structures (`demo-store.ts`) are provided.

## Requirements

1. **Auth Endpoints Graceful Fallback (`server/src/features/auth/auth.routes.ts`)**:
   - In `/register`, attempt Prisma creation first. If Prisma throws a database connection/initialization error (e.g. `P1001` or unreachable DB server), fall back to saving the new user and session in `demo-store.ts`, issue the session cookie, and return a `201 Created` response.
   - In `/login`, attempt to query Prisma first. If Prisma throws a database connection error or the user is not found in Prisma, check `demo-store.ts`, verify the password with bcrypt, save/issue the session, and return a `200 OK` response.
   - In `/logout`, revoke session in Prisma if connected, or revoke in `demo-store.ts`, clear session cookie, and return `200 OK`.

2. **Authentication Middleware (`server/src/middleware/authenticate.ts`)**:
   - In `requireAuthentication`, if querying Prisma throws a database error or finds no active session, check `demo-store.ts` for a matching session token identity. If valid and unexpired, authenticate the request with the `demo-store` user context.

3. **No Breaking Changes**:
   - Maintain full compatibility when PostgreSQL database is reachable.
   - Do not alter API request/response schemas or types.
   - Do not print, echo, or expose secrets in logs.

## Validation
- Run backend API tests (`npm run test:api` in `server/`).
- Verify backend build succeeds (`npm run api:build` in `server/`).
- Test sign up and sign in flows via HTTP API to ensure registration and login succeed even when the remote database is unreachable.
