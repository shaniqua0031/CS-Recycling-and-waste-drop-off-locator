# Sprint 7: Uploaded Design Alignment and QA Polish

## Goal

Update the existing WasteWise MVP to align with the supplied `Recycling Drop-Off Locator App.zip` design and interaction reference, following Sprint 7 in `PROJECT_CONTRACT.md` (testing, bug fixing, polish). Treat the ZIP as a source of UI ideas and mock flows, not as a replacement project scaffold.

## Repository constraints

- Keep the current Next.js frontend and Express backend. Do not migrate the repository to Vite or copy the ZIP's package/configuration files.
- Read the Next.js guide applicable to the installed version from `client/node_modules/next/dist/docs/` before changing app code, as required by `client/AGENTS.md`.
- Preserve all existing user changes in `client/app/page.tsx`, `client/app/globals.css`, `client/app/layout.tsx`, root `AGENTS.md`, and `PROJECT_CONTRACT.md`. Read current content and make focused compatible edits; do not revert or overwrite unrelated work.
- Keep this an MVP prototype. Do not add production authentication, database/admin features, live routing, payments, or scope from the future roadmap. Do not expose or alter `.env` secrets.
- Avoid adding dependencies unless a concrete need is established.

## Sprint scope

Polish the current auth-to-discovery journey against the uploaded app’s visual and interaction direction while remaining consistent with the WasteWise contract. Keep the existing contracted screen flow: auth, dashboard, find/search, map, facility details, and report/suggest. Reuse structured mock facility data and the existing navigation model where practical; do not scatter new per-screen data shapes.

Use the uploaded prototype as a reference for useful patterns such as a mobile-friendly dashboard/search entry, readable facility summaries, facility detail sections for accepted materials/contact/hours, saved locations where they fit the current flow, and a clear report submission/confirmation state. Implement only interactions that belong to the current MVP and can work with local mock data. Prioritise the most important usability and responsive defects found during inspection instead of mechanically copying every ZIP screen.

## Acceptance criteria

- The existing app builds and continues to use Next.js; the Express server remains intact.
- Primary navigation remains clear and stable through auth, dashboard, find, map, detail, and report.
- Search/filter/list and facility selection behaviors exposed in the UI give coherent results using the reusable sample data; controls are not left as inert decoration.
- Facility details accurately reflect the selected facility’s materials, hours, and contact information.
- Report/suggest submission validates required information and shows a clear completion state without claiming backend persistence.
- Layouts remain usable at narrow mobile and desktop widths; no text/control overlap or inaccessible unlabeled controls are introduced.
- Keep changes small and limited to Sprint 7 polish; document any discovered issues that are outside this sprint rather than expanding scope.

## Validation

Run the client lint and production build (`npm run lint` and `npm run build` from `client/`). Run an appropriate available check for the Express server if server code changes; otherwise leave the backend untouched. Report exact manual test steps covering login/signup prototype entry, search/filter, facility detail, map navigation, report submission, and a mobile-width viewport.
