# Implementation Prompt: Make `index.js` the Backend Entry Point

Consolidate the WasteWise backend startup so `server/index.js` is the sole file that starts the HTTP server.

## Current behavior

- `server/index.js` starts a legacy hard-coded Express API.
- `server/src/server.ts` starts the current WasteWise API assembled from `src/app.ts` and `src/config/env.ts`.
- `server/dist/server.js` is the ignored compiled duplicate of `src/server.ts`.
- `server/package.json` currently points its main start command at `dist/server.js` and its development command at `src/server.ts`.
- The app module already wires configuration, features, libraries, middleware, routes, and utilities. Preserve that structure and connect the canonical entry point to it; do not move or rewrite those modules.

## Requirements

- Make `server/index.js` start the current WasteWise API from `src/app.ts`'s compiled app and the existing validated environment configuration. Remove the old hard-coded mock endpoints from `index.js`.
- Preserve the existing port configuration, startup logging, and graceful `SIGINT`/`SIGTERM` shutdown behavior.
- Update package scripts so the documented development and production startup workflows both execute `index.js`. Ensure required TypeScript compilation happens before a run that loads compiled output, and do not leave a second listening entry point behind.
- Remove `server/src/server.ts` after moving its startup/shutdown behavior into `index.js`. Remove the stale generated `server/dist/server.js` entry file if present; do not delete the rest of `dist` or the TypeScript feature modules.
- Update `server/README.md` to describe the single-entry startup flow and health check.
- Preserve existing uncommitted changes in `server/package.json`, `server/.gitignore`, and other files. Make only the edits needed for this startup change.
- Do not remove tests, alter API behavior, expose secrets, or connect to/modify a database.

## Validation

- Run `npm run api:build` and `npm run test:api` from `server/`.
- Start the backend through `index.js` using the documented command, confirm `GET /api/v1/health` returns the existing successful API response, then stop it cleanly.
- Confirm no other source or generated file remains as an HTTP server entry point and that the legacy mock endpoints are no longer served.

## Completion

List the changed and removed paths, the exact startup command, and validation results. Do not commit the change.