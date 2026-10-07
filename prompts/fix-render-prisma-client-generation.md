# Implementation Prompt: Generate Prisma Client for Render Builds

Render's current build command is `npm install`, and its start command is `npm start`. The server's `start` script runs `npm run api:build`, but `api:build` currently invokes only `tsc -p tsconfig.json`. On Render's clean install, Prisma Client's generated declarations are absent, so TypeScript reports missing Prisma enums and types, followed by many implicit-`any` errors.

## Requirements

- Ensure every `npm run api:build` generates Prisma Client from `prisma/schema.prisma` before running TypeScript compilation. This must fix the existing Render `npm start` flow without requiring undocumented dashboard command changes.
- Reuse the existing `prisma:generate` script and preserve the schema, migrations, and database contents.
- Keep `DATABASE_URL` and all credentials private. Do not print or edit `.env` values.
- Document that the API deployment must provide `DATABASE_URL` at build/start time because `prisma.config.ts` requires it.
- Do not change authentication, API routes, schema, migration policy, or unrelated code.

## Validation

- Run Prisma Client generation, backend TypeScript build, and API tests.
- Confirm no database migration or record write is run during validation.
- If local Prisma generation is blocked by an in-use Windows engine DLL, report the blocker without stopping an existing server process; validate after that process is stopped only if safely possible.
- Run `git diff --check` and confirm no `.env` files or secrets changed.

## Completion

Explain that the existing Render `npm start` flow will now generate types before compiling, list the checks, and remind the operator to redeploy with `DATABASE_URL` configured. Do not claim Render was deployed or externally verified.
