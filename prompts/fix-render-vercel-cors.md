# Implementation Prompt: Allow the Vercel Frontend to Call the Render API

The browser reports a CORS failure for frontend origin `https://cs-recycling-and-waste-drop-off-loc.vercel.app` when calling the Render backend at `https://cs-recycling-and-waste-drop-off-locator.onrender.com/auth/session`. The Express CORS and trusted-origin middleware both use `CLIENT_ORIGINS`, whose default currently permits only localhost. The displayed API request path also omits the server's `/api/v1` route prefix.

## Requirements

- Add the exact production frontend origin `https://cs-recycling-and-waste-drop-off-loc.vercel.app` to the default trusted client-origin allowlist while preserving localhost origins.
- Keep using the same configured allowlist for CORS and `requireTrustedOrigin`; do not use wildcard origins. Credentialed requests must remain enabled.
- Keep operator overrides through `CLIENT_ORIGINS`; document that when this variable is set on Render, it must include the exact frontend origin (comma-separated with any other trusted origins).
- Make the client API URL resolver append `/api/v1` when its configured absolute API URL contains only the origin/root path. Avoid duplicating the prefix if already present. Preserve HTTPS validation for production and all existing dev fallback behavior.
- Add focused tests proving the Vercel origin receives credentialed CORS headers and is not rejected by trusted-origin middleware, while existing untrusted origins remain rejected.
- Do not modify `.env` files, print or expose secrets, change database/auth semantics, or broaden the origin policy beyond the explicit origins.

## Validation

- Run backend API tests and backend build.
- Run client lint and production build.
- Confirm the API URL for the provided Render host resolves under `/api/v1` and the configured Vercel origin is included in the allowlist.
- Run `git diff --check` and confirm no `.env` files changed.

## Completion

List changed paths and checks. Explain that the Render service must be redeployed with `CLIENT_ORIGINS` either unset (to use the defaults) or explicitly containing `https://cs-recycling-and-waste-drop-off-loc.vercel.app`, and that the frontend must be rebuilt/redeployed to pick up its API URL. Do not claim external hosting settings were changed.
