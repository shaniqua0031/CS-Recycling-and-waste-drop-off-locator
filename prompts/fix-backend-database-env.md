# Implementation Prompt: Load Backend Database Configuration

Fix the backend's missing `DATABASE_URL` error. The currently configured URL in `client/.env` has been verified with a read-only PostgreSQL `SELECT 1`; `server/.env` is missing, so the backend does not load that configuration.

## Requirements

- Make the backend load its environment file from the `server/` directory relative to `index.js`, independent of the caller's current working directory.
- Move only the `DATABASE_URL` setting from `client/.env` to a new local `server/.env` without printing, echoing, or copying the secret into source control, prompts, logs, or command output.
- Preserve all other client environment settings, especially `NEXT_PUBLIC_API_URL`; remove the database URL from `client/.env` so backend credentials are not kept in the client project configuration.
- Replace any credential-looking values in `server/.env.example` with non-secret placeholders. Do not rotate or replace the active local database credentials.
- Keep `.env` files ignored by Git. Do not change database schema, auth flows, API behavior, or unrelated project files.

## Validation

- Verify the local server environment contains `DATABASE_URL` without displaying its value.
- Run a read-only `SELECT 1` through the URL loaded from `server/.env` and report pass/fail only, never the connection string or password.
- Run the backend build and API tests.
- Start the backend through `index.js` and confirm `GET /api/v1/health` returns 200. Do not submit a signup or create a database record as part of validation.

## Completion

List the changed paths and checks. Do not commit the change or include any secret values in the report.