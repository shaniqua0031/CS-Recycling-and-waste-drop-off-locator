# Implementation Prompt: Handle an Invalid API URL

The login page now returns a generic request error after the API URL compatibility fallback was added. The local `NEXT_PUBLIC_API_URL` setting is present but is not an absolute HTTP URL. Fetch can resolve such a value as a relative path on the frontend origin, yielding a non-API response that is displayed as a generic error.

## Requirements

- Validate configured `NEXT_PUBLIC_API_BASE_URL` and legacy `NEXT_PUBLIC_API_URL` as absolute `http:` or `https:` URLs before passing them to `fetch`.
- Keep `NEXT_PUBLIC_API_BASE_URL` higher priority than the legacy name.
- In development, when a configured value is malformed, fall back to `http://localhost:5000/api/v1` so the local API can still be used. Preserve the existing behavior when no URL is configured.
- In production, reject malformed URLs with a clear `AuthApiError`; preserve the HTTPS-only requirement and do not infer the API host from the frontend hostname.
- Do not print or reveal environment values, and do not edit `.env` files.
- Keep credentialed API requests, endpoint paths, and backend behavior unchanged.

## Validation

- Run client lint and production build.
- Verify malformed values cannot become relative fetch paths and development fallback remains localhost; do not print local environment values.
- Run backend API tests if the implementation touches shared backend behavior.
- Check the diff for environment files and accidental secret disclosure.

## Completion

List changed paths and checks. Remind the operator to set `NEXT_PUBLIC_API_BASE_URL` to the real HTTPS API base URL ending in `/api/v1` for live deployment. Do not claim the external hosting settings were changed.
