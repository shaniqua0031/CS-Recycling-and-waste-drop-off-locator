# Implementation Prompt: Facility Operations Dashboard

## Goal
Upgrade the existing ReLoop Facility experience into a responsive, persisted operations dashboard. Modify the current role-aware application; do not rebuild it or replace existing Recycler, Collector, Admin, map, authentication, collection, material, hours, notification, or reward workflows.

## Existing implementation to preserve and extend
- The Facility role is part of the existing session/auth flow. `Facility` is connected to users through `FacilityMembership` (`OWNER`, `MANAGER`, `STAFF`); facilities, materials, opening hours, collection requests, weights, notifications, reports, incidents, and rewards already have Prisma models.
- The facility UI is currently routed through `client/app/page.tsx` into `FacilityProfileScreen` and `FacilityVerificationScreen` in `client/app/workflow-screens.tsx`. The dashboard actions lead only to profile editing and verification.
- `GET/PUT /api/v1/collections/facility-profile` reads/writes a member's first facility membership, its material links, and seven opening-hour rows. `GET /api/v1/collections` scopes Facility collection requests to the user's memberships. `POST /:requestId/verify` checks the request's destination membership, retains collector `actualKg`, stores facility `verifiedKg` and verifier/time, awards rewards idempotently, writes a status event, and notifies the recycler and admins.
- The existing facility profile does not return coordinates, contact fields, status, capacity, or membership choices. `FacilityMaterial` has no capacity values. Facility open/closed display is currently inferred from opening hours. There is no facility-specific notification read/feed route; the current personal notification API is Recycler/Collector-only. `Incident` and `Report` are available for operational reporting, but the current report submission endpoint is Recycler-only.
- A 3-second polling loop exists in `client/app/page.tsx` for selected screens, but Facility views are not included. `SouthAfricaMap.tsx` uses Leaflet and existing locations carry facility coordinates.
- Respect all in-progress user changes in the worktree, especially current edits to collection routes/schemas, auth, Prisma, tests, dashboard API, workflow screens, page routing, and migrations. Inspect diffs before editing these files; integrate with current work and do not overwrite or revert it.

## Implementation requirements

### Facility operations dashboard
- Replace the Facility role's two-action landing experience with a dashboard built into the existing page/navigation and visual system. Include facility selection when the signed-in user belongs to multiple facilities; never silently select the oldest membership for a write.
- Show facility name and persisted operational status; today's incoming/received collections and received kg; current capacity usage; pending deliveries; and clear loading, error, empty, and success states. Use real database values and South African local-day boundaries where dates are grouped.
- Show incoming/active collections with ID, collector, material(s), estimated and collector-recorded weights, ETA when derivable, and status. Include recent collection history and filters for date, material, collector, and status. Reuse the current collection request, assignment, status-event, and weight records.
- Provide sections or tabs for Overview, Collections/History, Materials & Hours/Profile, Capacity, Incidents, and Analytics, sized for efficient mobile as well as desktop use.

### Facility profile, accepted materials, opening hours, and map
- Extend the existing profile editor to support facility name, description if represented in the chosen contract, address, phone/email/website fields already present in `Facility`, map location coordinates, accepted active materials, seven days of opening hours, and capacity configuration.
- Reuse `Material`, `FacilityMaterial`, and `FacilityOpeningHour`; do not create duplicate material or hours models. Replace stringly typed hours only as needed to preserve and validate the existing API contract and compatibility.
- Display the facility's persisted map location using the existing Leaflet map. Let appropriately authorized members update coordinates using supported map interactions and validate latitude/longitude server-side.
- Keep saved facilities discoverable by existing search/map flows, and preserve approval/suspension visibility behavior.

### Status and capacity
- Support `OPEN`, `CLOSED`, `TEMPORARILY_CLOSED`, `NEAR_CAPACITY`, and `FULL` as persisted operational states. Keep operating status separate from approval/suspension and do not infer manual temporary closure or capacity state solely from opening hours. Validate allowed transitions and notify members/admins when the facility becomes full.
- Reuse database-backed capacity if present in the current worktree/schema. The inspected schema has no facility or per-material capacity fields, so if still absent add only the minimum additive Prisma fields/migration needed to configure per-material capacity and represent current usage. Do not use hard-coded capacity limits or derive current inventory from a lifetime total unless the data contract makes that valid.
- Calculate usage by material and classify 0-79% NORMAL, 80-94% NEAR_CAPACITY, and 95-100% CRITICAL/FULL. Validate capacity and usage values, handle zero/missing capacity without division errors, and define how verified intake affects current usage.
- On threshold crossing, create/reuse a facility-linked incident and notify facility members and admins. Deduplicate active incidents for the same facility/material/condition, including concurrent requests where practical. Do not create a new incident on every poll or repeated save.

### Collection receiving, verification, confirmation, and rejection
- Use the existing persisted lifecycle and statuses wherever possible: map existing `COLLECTOR_ON_THE_WAY`, `COLLECTOR_ARRIVED`, `COLLECTING`, `VERIFICATION_PENDING`, `VERIFIED`, `COMPLETED`, and `REJECTED` to clear Facility-facing labels such as EN_ROUTE, ARRIVED, RECEIVING, EXPECTED, VERIFIED, COMPLETED, and REJECTED. Do not add duplicate request/collection entities or status enums without proving an additive migration is necessary.
- Add a receive action for an arrived, assigned delivery that records material, collector weight, condition, and notes using current collection weight records and status events. Only the assigned delivery for the selected facility may be changed.
- Show the collector-recorded weight separately from the facility-verified weight, plus difference, verifier, and timestamp. Preserve the original collector `actualKg`; continue to write the separate `verifiedKg` fields and verifier/time through the existing verification transition.
- Preserve the existing reward calculation, idempotency, notifications, and status history. Treat the existing verified/confirmed transition as recycling confirmation unless the current data contract requires a narrowly scoped status addition. Ensure the recycler receives the requested confirmation wording and never award points twice.
- Permit rejection only with a required reason selected from Wrong material, Contaminated, Facility full, Unsupported material, or Other, with optional explanatory notes. Persist the reason/status event and notify the relevant collector, recycler, and admins. Do not erase assignment or weight history.

### Facility incidents and notifications
- Allow Facility members to submit operational reports for equipment, capacity, collection, safety, incorrect material, or other issues; validate and persist them through the backend using the existing `Report`/`Incident` structures where they fit. Include facility, reporter, description, status, and timestamps. Do not make Admin audit records on behalf of a facility user.
- Add a facility-scoped notifications endpoint/feed that only returns notifications for the authenticated user's valid memberships, with an ownership-checked mark-read action. Facility users should receive collector approaching/arrival, delivery awaiting verification, warning/full capacity, incident, and Admin-message notices where supported.
- Do not broaden Recycler/Collector notification access or expose another facility's private management data.

### Analytics and polling
- Show database-backed total received kg, material totals (Plastic, Paper, Glass, Metal, E-waste and available active materials), collections received, average daily intake, and current capacity usage. Define the date range and exclude unverified/rejected weights where appropriate; do not fabricate values for missing data.
- Poll dashboard summary, incoming collections, capacity, and facility notifications every 2-5 seconds while a Facility dashboard view is active. Update state in place, prevent overlapping requests, and clean up timers on navigation/unmount. Do not reload the page or poll irrelevant screens.

### Authorization and validation
- Enforce Facility role and membership/ownership on every new and changed facility endpoint, including profile, location, status, capacity, collection transitions, incident reports, analytics, and notifications. Resolve the selected `facilityId` from a validated membership on every request. Facility A members must not read or mutate Facility B.
- Define a small permission matrix consistent with `OWNER`/`MANAGER`/`STAFF`: members may view only their own facility; restrict configuration/status edits to authorized management members; allow operational receive/verify/report actions to authorized facility members. Return 401/403/404/409 consistently and validate bodies with existing Zod middleware.
- Preserve existing role boundaries: Facility accounts cannot access Admin, other facilities' private management, Collector administration, simulator, or Admin audit APIs. Do not rely on hidden client navigation for security.
- Add focused backend tests for cross-facility isolation, role/permission boundaries, invalid payloads, legal status transitions, no original-weight overwrite, duplicate incident prevention, notification ownership, and verification/reward idempotency. Add focused UI/type coverage only if an existing suitable harness is available; do not add a heavyweight test framework just for this feature.

## Constraints
- Read `client/AGENTS.md` and the installed Next.js 16 documentation relevant to changed APIs before editing application code.
- Follow the existing Express/Zod/Prisma/auth/transaction conventions and current migration naming. Keep database migrations additive and preserve all existing data and current uncommitted work.
- Prefer existing models and utilities. Add no duplicate Facility, Material, OpeningHours, Collection, Notification, or report models unless inspection establishes a genuine modeling gap that cannot be safely addressed additively.
- Keep the scope to the Facility experience and its required backend contracts. Do not redesign unrelated roles or rebuild app navigation/authentication.
- Use responsive Tailwind styling consistent with the existing ReLoop UI, keyboard-accessible controls, server-side authorization, explicit TypeScript types, and no secrets in browser code.

## Acceptance criteria
1. An authenticated Facility member can select only a facility they belong to and sees a real, responsive operational dashboard for that facility.
2. Dashboard counts, status, collections, verified weights, capacity, analytics, and notifications come from persisted data and refresh in place on the specified polling interval.
3. Authorized members can update supported profile/map/material/hour/status/capacity fields, and invalid or unauthorized changes are rejected by the backend.
4. Facility membership boundaries apply to every facility-specific API; a Facility A user cannot read or mutate Facility B, and Admin-only routes remain forbidden.
5. Incoming delivery receiving, verification, confirmation, and rejection preserve collector-reported values, record actor/time/reasons, follow valid existing status transitions, and notify the appropriate users.
6. Verification continues to calculate rewards exactly once and informs the recycler that recycling is confirmed.
7. Capacity thresholds use persisted per-material data; threshold incidents and notifications are deduplicated and do not multiply due to polling.
8. Facility operational reports and notification read state persist through scoped backend endpoints.
9. Existing Recycler discovery/map/reporting, Collector workflows, Admin operations, role authentication, and existing collection migrations continue to work.

## Verification
- From `client/`, run `npm run lint` and `npm run build`.
- From `server/`, run `npm run api:build`, `npm run test:api`, and `npm run prisma:validate`; generate the Prisma client and validate the additive migration using the repository's supported workflow.
- Manually test as two Facility memberships plus Recycler, Collector, and Admin: cross-facility access denial; update profile/hours/materials/map/status; receive and verify a delivery; confirm the Recycler message/reward occurs once; reject with and without a reason; cross capacity thresholds and verify incident deduplication; submit an incident; mark notifications read; and verify the dashboard refreshes without a full reload. Check existing role workflows after the change.