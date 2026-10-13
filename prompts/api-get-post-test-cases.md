# Implementation Prompt: GET and POST API Test Case Documentation

Create a plain-text developer reference at the repository root named `API_GET_POST_TEST_CASES.txt`.

## Purpose

Document how developers can manually test representative WasteWise GET and POST API behavior, including request setup, positive cases, validation failures, authorization failures, and expected responses. This is test documentation, not a request to add or change application code or automated tests.

## Source of truth to inspect

Confirm all paths, role rules, required fields, and status codes against current source before writing:

- `server/src/app.ts` and `server/src/routes/health.ts`
- `server/src/features/collections/collections.routes.ts`
- `server/src/features/collections/collections.schemas.ts`
- `server/src/features/auth/auth.routes.ts` and `auth.schemas.ts`
- `server/src/middleware/authenticate.ts` and `error-handler.ts`
- `server/src/app.test.ts`, `collections.schemas.test.ts`, and server `package.json`
- `server/README.md` and `client/lib/auth-api.ts` only as needed for setup and cookie behavior

Use only actual implemented routes. Do not invent endpoint behavior or present the project contract as proof of implementation.

## Required content

1. Short purpose, API base URL, and required local test setup. Identify that database-backed cases require a configured development/test database and suitable seeded/approved records.
2. Explain JSON success/error envelopes, session cookie handling, role requirements, and the use of `curl.exe` syntax suitable for Windows. Use placeholders for credentials, IDs, hostnames, and secrets; include no real secret values.
3. Provide a test-case format with ID, method/path, role/auth state, request data, steps, expected status, expected response checks, and cleanup or data impact.
4. Cover these representative cases, adjusting details to match source:
   - `GET /api/v1/health`: success envelope and status.
   - Unknown GET route: 404 shared error envelope.
   - `GET /api/v1/collections/facilities`: authenticated facility discovery; query filtering and paired latitude/longitude validation.
   - `GET /api/v1/collections`: role-scoped visibility and unauthenticated/unsupported-role behavior.
   - `POST /api/v1/auth/register`: valid registration and session cookie, plus attempted privileged-role registration rejection.
   - `POST /api/v1/collections`: valid Recycler request; required fields and 201 response; invalid payload, unknown material/facility, unauthenticated request, and wrong-role rejection where implemented.
   - At least one report POST validation case only if it can be accurately specified from the current schema and route.
5. Include concise `curl.exe` examples for at least one successful GET and one successful POST. Use a cookie jar or explicit placeholder cookie for authenticated requests. Make clear how to obtain a test session without publishing passwords.
6. Explain how to run existing automated server checks (`npm run test:api`, and optionally `npm run api:build`), and distinguish automated coverage from manual cases in this document. Do not claim the manual cases have been run.
7. Include cautions about test data, development-only use, avoiding production writes, and cleanup of created users/collection requests.

## Writing constraints

- Plain ASCII text with simple headings and numbered/bulleted test cases.
- Keep expected status codes and fields exact; derive them from implementation/tests.
- Mark cases that require database fixtures or an authenticated session.
- Keep GET and POST sections distinct and make the document usable as a checklist.
- Do not change application code, automated test files, environment files, or other docs.
- After writing, cross-check each documented route and status against the source and verify every npm script mentioned exists.
