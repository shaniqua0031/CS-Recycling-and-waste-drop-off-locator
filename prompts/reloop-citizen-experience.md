# Citizen Experience Implementation Prompt

## Objective

Modify the existing WasteWise citizen/recycler experience in this repository to deliver the user-facing collection, discovery, reporting, tracking, impact, reward, profile, notification, and mobile workflows described below. The request refers to the product as ReLoop, but this repository is WasteWise. Preserve its existing brand, app structure, authentication, role model, map library, APIs, and Tailwind language unless the product owner separately approves a brand change. Implement the Citizen as the existing `RECYCLER` role; do not add a parallel `CITIZEN` role or create another app.

This is an integrated feature in the existing Next.js client and Express/Prisma/PostgreSQL server, not a demo. Keep admin, collector, and facility management screens and APIs inaccessible to recycler accounts. Do not redesign or rebuild those role experiences.

## Repository Findings

- The citizen application is primarily `client/app/page.tsx` and `client/app/workflow-screens.tsx`. `DashboardScreen` is currently role-aware, but recycler dashboard statistics are not API-backed and are not displayed as requested.
- `client/app/locations.ts` contains hard-coded facility entries used by the current search and map. The database already has `Facility`, `FacilityMaterial`, `FacilityOpeningHour`, and approval/suspension fields. The authenticated `GET /api/v1/collections/facilities?material=` API returns approved facilities and hours but currently omits status/distance and only filters by a single material.
- The existing map uses the current Leaflet/React-Leaflet implementation. Reuse it; do not introduce another map provider or expose private collector coordinates to recyclers.
- `CollectionRequest` currently stores one `materialId`, total estimated kg, requested date, pickup address, and pickup coordinates. The client request form has one material, date, address, and coordinates; it has no preferred time or notes. Requests are persisted and Admin assignment, collector acceptance/decline, collection, facility verification, and reward earning already exist.
- Collection statuses currently include `PENDING`, `WAITING_FOR_ADMIN`, `COLLECTOR_ASSIGNED`, `COLLECTOR_ON_THE_WAY`, `COLLECTOR_ARRIVED`, `COLLECTED`, `VERIFICATION_PENDING`, `VERIFIED`, `COMPLETED`, `CANCELLED`, and `REJECTED`. `COLLECTING`, `PAUSED`, and `RESUMED` do not exist. Avoid replacing persisted status names just to match display copy; extend transitions only where the server can enforce them and maintain compatibility with existing records/admin workflows.
- A privacy issue exists: `GET /api/v1/collections` uses a common include that can return the collector's exact stored latitude/longitude to the recycler. Redact sensitive collector fields in the API response for recyclers, and remove the recycler-facing exact-location map/marker. Keep any necessary collector location visibility within currently authorized Admin/Collector workflows.
- `Report` currently represents standalone facility-data reports/suggestions with a small enum and has no location coordinates for general incidents, priority, duplicate grouping, or incident count. There is no `Incident` model or upload flow. Do not invent image upload support; omit images unless an existing supported upload path is found.
- Reward wallets, server-calculated earning, reward transactions, and balance-checked redemption transactions already exist. The current recycler reward endpoint returns balance, rates, and recent redemptions, but not transaction history or a server-owned reward catalog. The current reward screen's options are client-side mock data. Keep fulfillment clearly marked as prototype/manual unless actual fulfillment exists.
- Notifications are persisted and user-scoped on listing, but there is no user mark-read endpoint. Existing notification types cover request, assignment, on-the-way, arrival, collection completion, verification, points, and redemption; add only necessary transitions/types. Keep read state owner-scoped.
- `RecyclerProfile` stores name/phone and `User` stores email; there is no citizen profile update/password-change API or collection-address field. `GET /api/v1/users/me` exposes a basic session profile but is not a profile-management contract.
- Auth uses the existing authenticated HTTP-only session cookie. Collections routes require authentication, but each new/changed citizen operation must also check `request.auth.role === RECYCLER`. In particular, do not rely on hidden buttons: reports currently reject Admins but do not explicitly restrict submission to recyclers.
- `server/src/features/collections/collections.schemas.test.ts`, feature route tests, `server/src/app.test.ts`, and the client build/lint scripts are existing validation surfaces. Prisma changes require a migration and generated client; preserve existing data and deployed compatibility.

## Implementation Requirements

### 1. Citizen Dashboard and Impact

- Upgrade only the recycler dashboard. Show welcome/name, active request and status, pending request count, completed collection count, verified total kilograms, points balance, recent notifications, and recycling impact by material (plastic, paper, glass, metal, e-waste, and other supported materials).
- All figures must come from authenticated user-scoped API/database queries. Do not use constants, sample data, or Admin-wide analytics. Add a small citizen summary/impact API if the current data contract cannot provide these values.
- Show clear actions for Find Drop-Off, Request Collection, and Track Collection, keeping existing navigation stable and mobile-first.

### 2. Facility Discovery

- Make the existing recycler search/list/map use database-backed approved, non-suspended facilities rather than hard-coded facility records. Keep existing map components and location UX; preserve any non-facility static content only if it is clearly separate and cannot be mistaken for live database results.
- Support text search across facility name/address/material; material, distance, opening-hours, accepted-material, and facility-status filters. Return accepted materials, opening hours, approval/operational status, coordinates required for facility markers, and distance when a valid user position is available. Do not include collector coordinates.
- Keep the endpoint authenticated and recycler-scoped where personal/location context is involved. Validate query parameters server-side. Use existing distance utilities where suitable; distance may be calculated from an explicitly supplied current location or a user-entered location. Do not silently claim a distance without an origin.
- Results show facility name, address, distance or unavailable state, hours, accepted materials, current status, and actions to view details, get facility directions, and start a collection request with the selected facility/material prefilled.

### 3. Collection Requests

- Improve the recycler request form with material selection, estimated kg, pickup address/location, preferred date and time, and optional additional notes. Support multiple materials only with an end-to-end persisted representation and per-material quantities/verification/reward accounting; the present schema supports only one material. If extending it, add a forward-only Prisma migration with safe backfill/compatibility for existing requests, and update admin/facility/collector API contracts that consume request materials. Never pretend multiple materials were saved if only one was persisted.
- Persist through the existing backend, enforce recycler authorization and validation, default to the existing pending-for-Admin-assignment lifecycle, and show a clear pending confirmation. Do not bypass Admin assignment or collector approval/decline already in place.
- Store optional notes and preferred time with a schema/API migration if necessary. Keep the existing pickup address and coordinate validation and make location entry accessible on mobile.

### 4. Durable 10-Second Event Buffer

- The repository has no sensor/bin-full event model, event scheduler, or queue. Do not implement this as a browser-only timer or claim physical bin telemetry exists.
- If implementing this requested event workflow, define a durable server-side event record with an idempotency key, event/location/material reference, created time, activation deadline, resolution/cancellation state, and low default priority. Persist the event first; have server-owned processing activate it after 10 seconds only if unresolved. Ensure transaction-level idempotency and a restart-safe strategy (for example, a database-backed due-event sweeper that is safe across multiple server instances). Document operational assumptions and tests for restart/race behavior. Do not make an automatic event into an Admin-assigned collection without preserving the existing assignment workflow.
- If no trustworthy event source exists, implement the backend contract and a clearly identified citizen/manual event trigger only; do not fabricate IoT integration.

### 5. Community Reports, Incidents, and Priority

- Add citizen reporting for overflowing bin/drop-off point, facility full/closed, incorrect hours, illegal dumping, broken glass, hazardous/toxic/dangerous waste, collection problem, and other. Capture issue type, description, and an actionable location; link a facility/bin when known. Keep existing facility suggestion/correction reporting available.
- Reports near the same facility/location with compatible issue type inside a documented time window should attach to one incident rather than create duplicate incidents. Add the smallest sound Prisma incident/report relationship and migration needed. Return incident identity, report count, and a community verification/count state to ordinary report submitters without exposing Admin incident-management controls.
- Calculate priority on the backend only. Citizens cannot provide or alter priority. Apply documented, deterministic factors for hazard, time waiting, affected/report count, facility urgency, and proximity; use registered/verified location context for proximity and give remote/unverified reports less weight. Configured hazard types (including toxic/dangerous materials, illegal dumping, and broken glass as appropriate) must resolve to CRITICAL according to backend rules. Keep priority out of client write schemas and protect every update route from priority overrides.
- Show the outcome/priority appropriately to the reporting user, including a critical warning for critical incidents. Do not expose internal scoring details or management controls.
- If a submitted issue already belongs to an incident, return the existing incident and updated count. Add tests for same-location grouping, distant locations, time-window boundaries, incompatible issue types, and hazard priority.

### 6. Tracking, Privacy, Notifications, and Polling

- Provide a recycler-facing progress tracker using persisted backend state and status events. Map existing server values to citizen-friendly milestones. Add `COLLECTING`, `PAUSED`, or other statuses only with authorized server transitions and explicit collector/API behavior; never accept arbitrary status strings from a recycler.
- Ensure all transition notifications are persisted for request submitted, collector assigned/accepted, on the way, arrival, collection start/pause/resume/completion, facility verification, and points awarded. Do not emit misleading duplicate notifications on polling/retries. Add an owner-authorized mark-read endpoint/action so notifications remain visible until opened where appropriate.
- Poll only relevant citizen data (collection state/ETA, unread notifications, balance/impact as needed) every 2-5 seconds while the relevant screen/session is active. Update component state without a full-page reload, avoid overlapping requests, and clean up timers on unmount/session change. Do not poll excessively on screens that do not need live updates.
- CRITICAL: recycler API responses must never expose exact collector coordinates, location timestamps/history, or a collector GPS marker. Redact at the API/data-contract layer, not only in the UI. The citizen may see only a safe status and ETA. If ETA computation requires raw collector location, compute a sanitized ETA server-side and return only the estimate and its freshness/availability state.

### 7. Rewards and Redemptions

- Continue using server-verified weight and material reward rates to award points. Citizens cannot change verified weight, rate, wallet balance, transaction type, or point delta.
- Add reward transaction history and any available reward options to a recycler-scoped API contract. Require user confirmation before redemption. Keep balance decrement, redemption creation, and unique reward transaction atomic, idempotent, and protected against concurrent/double redemption. Keep the current balance nonnegative.
- Do not present a reward as available or redeemable unless the backend catalog/eligibility says so. Do not claim real payment, electricity fulfillment, or delivery when the existing prototype requires manual Admin review.

### 8. Citizen Profile and Authorization

- Add recycler-only self-service APIs/UI for display name, email, phone, collection address, and password change, using existing User/RecyclerProfile data where possible. Add a collection-address field only if needed and migrate safely. Never expose password hashes, internal roles, admin data, collector profiles, audit information, or management fields.
- Validate email uniqueness, phone/address formats, password policy, and current-password verification for password changes. Preserve/revoke sessions appropriately after sensitive account changes.
- Ensure all citizen-specific endpoints authorize the authenticated `RECYCLER` and scope reads/mutations to that user. Test that recycler sessions receive 403 for Admin, Collector, and Facility management endpoints/actions and cannot read another user's profile, requests, reports, notifications, rewards, or transactions. Continue relying on server authorization as the actual boundary.

### 9. Mobile UI

- Maintain current WasteWise Tailwind visual language and React component conventions. Optimize citizen workflows for phones: touch-sized actions, legible status, responsive filters, usable map/list transitions, accessible labels, loading/empty/error states, and no overlapping content.
- Do not use decorative marketing sections or create a separate app. Ensure admin/collector/facility navigation and workflows are unchanged except for necessary contract compatibility.

## Delivery Sequence

1. Inspect existing client instructions and relevant Next.js 16 documentation before editing client code. Reconfirm current schema/routes/tests and preserve any pre-existing worktree changes.
2. Write/update the data contracts and Prisma migration plan for only the necessary new capabilities. Separate supported existing behavior from features that require new persistence.
3. Implement server schemas, authorization, data queries, transactions, endpoints, and focused tests first, including collector-location redaction and recycler role isolation.
4. Implement the citizen UI against those contracts, reusing existing screens, map, collection lifecycle, authentication, and API helpers.
5. Generate Prisma client and validate/apply the migration according to repository scripts/environment; never run a destructive database reset.
6. Run focused server tests, full server API tests, client lint, client TypeScript/build checks, and Prisma validation. Fix regressions and report any check blocked by unavailable database/environment.
7. Summarize changed contracts/migrations, exact checks, and practical manual test steps for recycler, collector, facility, and Admin roles. Do not claim external sensor integrations, live routing, or reward fulfillment that were not actually implemented.

## Acceptance Criteria

- Recycler dashboard statistics/impact are real and scoped to the logged-in recycler.
- Recycler discovery uses approved database facilities and working filters/actions.
- Collection requests persist required details and clearly retain Admin assignment and collector acceptance flow.
- Buffer/incident/priority behavior, if implemented, is durable, backend-enforced, idempotent, tested, and not controllable by citizens.
- Recycler sees status, safe ETA, progress, and owner-scoped notifications; no collector exact coordinates leave the server response.
- Verified weights alone award points; redemption cannot overspend or double-debit.
- Profile operations are self-scoped and password changes are secure.
- Recycler accounts cannot call management APIs even by crafting direct HTTP requests.
- Existing Admin, Collector, Facility, authentication, map, and collection functionality passes regression checks.
- Client builds and server tests pass, or any environment-dependent blocker is explicitly identified.
