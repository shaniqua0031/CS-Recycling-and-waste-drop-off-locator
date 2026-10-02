# Implementation Prompt: Role-Specific Recycling Workflows (MVP)

## Goal
Turn the existing Recycler, Collector, and Facility dashboard actions into usable end-to-end prototype workflows. Keep the current Next.js and Express architecture, role-aware signup, and mock-data-first MVP approach.

## Current behavior
- Signup supports `RECYCLER`, `COLLECTOR`, and `FACILITY` roles, and the dashboard greeting uses the signed-in display name.
- The dashboard displays role-specific action labels, but most non-recycler actions route to the generic Find screen.
- Facility locations are represented by the shared `Location` type and sample data in `client/app/locations.ts`.
- No collection-request, collector-work, reward, or facility-management API contract exists yet.

## Scope and implementation constraints
- Implement the workflows in the client using typed, reusable mock data and React state. Keep state for the active session; do not imply persistence across reloads.
- Do not add backend endpoints, database tables/migrations, role-switching, payments, live routing, or production authentication.
- Keep each workflow restricted to the signed-in user's existing role. Users who need another role should create an account with that role.
- Preserve the existing recycler search, map, facility details, reporting, and saved-location flows.
- Follow the repository's Next.js instructions in `client/AGENTS.md` and read the installed Next.js guidance relevant to any API changed before editing application code.
- Keep the UI responsive, keyboard-accessible, and consistent with the current WasteWise styling.

## Required workflows

### Recycler
- Provide a collection-request form with material, pickup address, estimated quantity/weight, and preferred date. Validate required values and positive quantity before submission.
- On submission, add a typed request to the in-memory request list with a stable ID and `Pending` status; show a clear success state.
- Show the recycler's requests and status (`Pending`, `Assigned`, `Collected`, `Verified`) in a tracking view.
- Show a points balance and a small, clearly labeled mock rewards catalogue. Redeem a reward only when the balance is sufficient; update the in-memory balance and show confirmation. Do not present rewards as real payments or cash payouts.

### Collector
- Show available pending requests and allow a collector to accept one. Accepted requests become assigned to that collector and disappear from the available list.
- Show the collector's assigned requests, pickup address, materials, and quantity. Provide a directions action that opens Google Maps to the entered pickup address; do not claim browser GPS is used for this free-text address unless it is actually available and correctly encoded.
- Let the collector record the collected quantity and mark the pickup as collected after validating a positive amount. Keep status progression consistent with the recycler tracking view.

### Facility / Business
- Provide a facility profile form with facility name, address, accepted materials, and opening hours. Require a name, address, at least one material, and valid non-empty hours before saving.
- Allow editing the signed-in user's in-memory facility profile, including accepted materials and opening hours.
- Show requests marked collected that are awaiting facility verification. Let the facility verify the received quantity and move the request to `Verified`.
- Reflect the verified status in the recycler tracking view and update recycler points using a simple documented local rule; do not claim external settlement or payment.

## Navigation and state
- Replace generic Find-screen handlers on collector/facility dashboard actions with explicit workflow navigation.
- Add clear back navigation and role-appropriate links between the dashboard and each workflow.
- Keep shared collection requests in one typed client-side state model so recycler tracking, collector actions, and facility verification show the same updates during the current app session.
- Handle empty states, form validation errors, success feedback, and requests in each workflow status.
- Do not expose irrelevant Recycler-only discovery sections as the primary content for Collector or Facility dashboards. Preserve access to location discovery only where it makes sense.

## Acceptance criteria
1. Each dashboard action for each role opens the corresponding functional view rather than the generic Find page.
2. A Recycler can create a request, see it as Pending, and see subsequent status changes made by Collector and Facility actions.
3. A Collector can accept a pending request, record a valid collected quantity, and mark it Collected.
4. A Facility can edit its profile/materials/hours and verify a collected request, moving it to Verified.
5. Recycler points and mock rewards have understandable balance, eligibility, and confirmation states, and verified collections award points according to a stated local rule.
6. Invalid forms cannot mutate shared workflow state; empty and success states are visible and accessible.
7. Existing authentication, personalized greeting, search/map/details/reporting flows continue to work.
8. No backend or schema changes are made in this MVP slice.

## Verification
- Run `npm run lint` and `npm run build` from `client/`.
- Run `npm run test:api` from `server/` to verify backend auth behavior remains unaffected.
- Manually test one complete cross-role lifecycle: create a recycler request, sign in as a collector in a separate session and accept/collect it, then sign in as a facility and verify it; return to the recycler and confirm status and points. Also test validation failures and the rewards insufficient/sufficient balance cases.