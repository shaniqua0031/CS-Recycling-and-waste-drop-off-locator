# Implementation Prompt: Fix Live API Connectivity

The deployed WasteWise login page reports that it cannot reach the API. The frontend currently reads `NEXT_PUBLIC_API_BASE_URL` and otherwise constructs `http://<frontend-host>:5000/api/v1`, which points a deployed Vercel page at the wrong host. The checked-in local client environment uses a differently named `NEXT_PUBLIC_API_URL` variable. The Express API enables credentialed CORS only for `CLIENT_ORIGINS`, whose default contains localhost origins only.

## Requirements

- Make the frontend API base URL configuration explicit and consistent. Prefer `NEXT_PUBLIC_API_BASE_URL`; support the existing `NEXT_PUBLIC_API_URL` name as a compatibility fallback if appropriate.
- Preserve local development behavior against `http://localhost:5000/api/v1`.
- Do not silently infer a production API host from the frontend hostname or use an insecure HTTP URL on a deployed HTTPS page. Fail with an actionable configuration message when no production API URL is configured.
- Preserve credentialed requests and existing authentication behavior.
- Keep backend CORS restricted to explicitly configured `CLIENT_ORIGINS`; do not allow arbitrary origins. Document that the deployed frontend origin must be included exactly in the API deployment's comma-separated `CLIENT_ORIGINS` value.
- Update the relevant client/server deployment documentation with the required environment variable names, expected URL shape (`https://<api-host>/api/v1` for the frontend setting), and reminder to redeploy the frontend after changing its build-time environment variables.
- Do not edit `.env` files, expose environment values, hardcode the user's deployment hostnames, change database/auth behavior, or include secrets in source control.

## Validation

- Run the client lint and production build.
- Run the backend API build and tests, including existing trusted-origin behavior.
- Check the diff for accidental changes to `.env` files or secret values.
- Report that hosting-provider environment settings are required separately: set the frontend API URL to the actual public API base URL, and set backend `CLIENT_ORIGINS` to the actual deployed frontend origin(s). Do not claim the external deployment has been changed or verified unless it was.

## Completion

List changed paths, checks, and the exact environment settings the operator still needs to configure. Do not commit the change or print any secret values.
