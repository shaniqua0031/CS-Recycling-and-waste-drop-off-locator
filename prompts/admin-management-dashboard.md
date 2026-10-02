# Implementation Prompt: Admin Management Dashboard

## Goal
Add Admin as a fourth, separate WasteWise role. Admin coordinates the existing Recycler, Collector, and Facility workflows; it must not replace or remove those roles or their screens.

## Current implementation and constraints
- The client auth type and Prisma `UserRole` include `ADMIN`, but public registration correctly accepts only `RECYCLER`, `COLLECTOR`, and `FACILITY`.
- The client currently has role-specific Recycler, Collector, and Facility screens, with collection and reward data held in browser memory.
- Express currently exposes auth, health, and `/users/me`; it has no Admin management routes.
- Prisma already models account and approval status, collector availability/service area/current coordinates/vehicle details, facilities and materials/hours, collection requests/assignments/status events/weights, reward rates/transactions/redemptions, notifications, and reports.
- Use the existing Prisma models and auth/session patterns. Keep secrets out of source control. Do not allow public Admin registration or a client-side role switcher.
- Because Admin must coordinate real shared requests between accounts, replace the collection lifecycle's in-memory-only source with the authenticated API where needed. Keep existing locator mock data and unrelated screens intact.
- Read `client/AGENTS.md` and the installed Next.js docs for each changed API boundary before implementation. Follow the repo's additive Prisma migration conventions; never recreate an enum such as `UserRole` that already exists.

## Admin access and security
- Add a protected Admin dashboard for users whose authenticated session role is `ADMIN`.
- Non-Admin users must receive an authorization error from every Admin API endpoint, with regression tests.
- Do not add `ADMIN` to public signup options or permit role changes from the client.
- Provide a documented local Admin provisioning command that reads credentials from environment variables, hashes the password using the existing auth library, and creates/updates only an Admin account. Never commit real credentials or print secrets.
- Record security-sensitive Admin decisions (approvals/rejections, suspensions/reactivations, assignments, rate changes, redemption decisions, and any exceptional verification override) with actor, target, action, timestamp, and reason where applicable. Keep reward points ledger-based; do not add an unaudited balance-edit action.

## Admin dashboard navigation
Create an Admin-only responsive console with Overview, Users, Collectors, Facilities, Collection Requests, Active Collections, Verification, Rewards, Redemptions, Analytics, Reports, and Notifications sections. Use a compact desktop navigation and responsive mobile navigation. Keep Recycler, Collector, and Facility dashboards unchanged for those roles.

### Overview
- Compute dashboard counts from persisted data, not fixed sample values: total users, active collectors, facilities, pending requests, active pickups, verified kg, collections completed today, pending collector/facility approvals, points issued, and rewards redeemed.
- Add useful loading, error, and empty states. Do not show invented live movement or counts.

### Users
- Search and view registered user email, display name, role, status, collection/recycling history, points balance, and reward transaction history.
- Support suspend and reactivate with a required reason and an audit entry.
- Do not expose arbitrary points editing. Show the underlying earn/redeem ledger and its collection/redemption references.

### Collectors
- List approval status, availability, service area/radius, vehicle details, current collection, workload, and last known location update.
- Approve or reject pending collector applications; require a reason for rejection. Allow suspension/reactivation and collection-history review.
- Only use stored collector coordinates when present and recent. Label stale/missing location accurately; do not simulate live GPS.

### Facilities
- List pending and approved facilities, contact/location, accepted materials, opening hours, and status.
- Review facility information and approve/reject applications. Support facility suspension/reactivation without conflating suspension with rejection; use a minimal additive schema migration if the current model cannot represent it.

### Collection requests and collector assignment
- List/filter requests by status, material, date, recycler, and location; show request detail, estimated weight, pickup location, status history, assignment, and weight records.
- For a request with coordinates, calculate candidate distance with the existing geographic utility. Rank only approved, available collectors that meet service-area constraints, accounting for active workload. Show distance and an explicitly estimated ETA using a documented configurable/simple speed assumption.
- Let Admin assign a selected eligible collector. Apply assignment, request status transition, status event, and user/collector notifications atomically where practical. Reject duplicate/stale assignments and explain why no candidate is eligible.
- The Recycler's tracker and Collector's assigned-pickup screen must show the same persisted status and assignment. Preserve the existing user workflow; do not claim live tracking when only a stored location is available.

### Active collections
- Show assigned/in-progress collections and the latest stored Recycler and Collector coordinates on the existing map technology when both exist.
- Show status, distance, last location update, and estimated ETA where calculable. Clearly label coordinates as last known and provide a refresh action; no fake movement or unsupported real-time tracking.

### Weight verification and points
- Preserve the responsibility chain: Collector records actual kg; Facility verifies the received kg; Admin monitors and audits the transaction. Admin may flag a discrepancy and, only if an override is required, must enter a reason that is preserved in the audit trail.
- Award points only once from facility-verified kilograms using the active configured material rate. Record the calculation and link it to the request and immutable reward transaction; prevent duplicate awards on retries.
- Use the configured conversion of 500 points = R100 (1 point = R0.20) for informational Rand values only. Do not implement payments or cash transfer.

### Rewards and redemptions
- Let Admin manage effective-dated material rates using the requested initial values: Plastic 10, Paper 5, Glass 8, Metal 15, and E-waste 20 points/kg. Use the existing `MaterialRewardRate` model and retain rate history.
- Show redemption user, point cost, calculated Rand value, reward/reference, and status. Support approve, reject (reason required), and mark delivered/fulfilled. Extend the enum additively only if an explicit approved state is needed; do not edit or delete ledger history.
- Keep the rewards balance derived from persisted transactions and enforce sufficient balance transactionally when a redemption is requested.

### Analytics, reports, and notifications
- Provide persisted analytics for total/verified kilograms by material, request totals by status, completion/cancellation counts, active collectors/users, facilities, points issued/redeemed, and informational Rand reward value. Use clear charts or tables with empty states.
- Let Admin review and update report status through investigation, resolution, or rejection; record the responsible Admin and reason where available.
- Show unread/recent Admin notifications for new requests, collector/facility registrations, collection completion/verification, reports, and redemptions. Mark notifications read and link each to its related record.

## Data/API implementation
- Add an Admin router under `/api/v1/admin` and role-protect it with the existing authentication middleware.
- Define explicit typed request/response contracts and validate all mutation inputs with Zod. Keep Prisma credentials server-side.
- Add only the API endpoints needed by the UI, covering overview, users/status/history, collector approval/status, facility approval/status, requests/candidates/assignment, active collections, weight review, material rates, redemptions, analytics, reports, and notifications.
- Update current Recycler request creation/tracking, Collector assignment/collection recording, and Facility verification views to read/write the shared API so Admin decisions are reflected across accounts and browser sessions.
- Update role-specific registration to create the correct role profile and pending approval record for Collectors/Facilities. Collect only the minimum profile and location data needed for review/assignment; validate coordinates and disclose that collector location is stored/last-known.
- Use existing status, assignment, notification, reward, and report tables wherever possible. If a migration is required for facility suspension, Admin audit entries, or redemption approval, make a minimal additive Prisma migration and update the Prisma schema; do not recreate existing enum types.

## Acceptance criteria
1. Admin is an additional role: Recycler, Collector, and Facility registration and dashboards remain available; public Admin signup is rejected.
2. A provisioned Admin can sign in and access the dashboard; non-Admins cannot access any Admin endpoint or view.
3. Overview counts and analytics are computed from persisted records.
4. Admin can review users, collectors, and facilities; approve/reject eligible registrations; suspend/reactivate with an auditable reason; and inspect collection/reward history.
5. Admin can view collection requests, see eligible collector candidates with distance/estimated ETA/workload context, and assign a collector. The assignment, status history, and notification are persisted and reflected in Recycler and Collector views.
6. Collector-recorded weight and Facility-verified weight remain distinct and auditable. Points use only verified kg and the active material rate, and duplicate verification cannot issue duplicate points.
7. Admin can manage material rates and redemption decisions while retaining rate and reward-transaction history. The Rand calculation is informational only.
8. Active collections, reports, and notifications have working filters/actions and clear empty/loading/error states; location freshness is explicit.
9. No points can be changed without a ledger transaction and audit record; preferably provide no manual balance adjustment feature.
10. Existing auth, personalized greeting, directions, locator, and role workflows continue to work.

## Verification
- Run client `npm run lint` and `npm run build`.
- Run server `npm run api:build`, `npm run test:api`, and Prisma schema validation/migration checks supported by the repository.
- Add focused tests for Admin authorization, approval/suspension transitions, nearest eligible collector ranking, assignment concurrency/status history/notifications, verified-weight points idempotency, reward rate history, redemption decisions, and analytics aggregates.
- Manually test with one provisioned Admin plus Recycler, Collector, and Facility accounts: submit a request, assign the nearest eligible collector, record actual weight, verify it at the facility, confirm Admin audit and notification views, confirm points/Rand calculation, then request and decide a redemption. Also verify public Admin signup and non-Admin Admin-route access are rejected.