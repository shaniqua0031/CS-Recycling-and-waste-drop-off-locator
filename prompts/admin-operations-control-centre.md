# ReLoop Admin Operations Control Centre

Modify the existing ReLoop admin dashboard into a backend-driven operational control centre. Do not rebuild the application, remove existing admin functionality, or replace existing domain models/routes with parallel implementations. Preserve the current design language and existing user, collector, facility, collection, verification, rewards, redemption, report, notification, map, analytics, and audit workflows.

## Repository context

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS. The main dashboard is `client/app/admin-dashboard.tsx`; its API client and admin types are in `client/lib/dashboard-api.ts`; the current collection map is `client/app/admin-collections-map.tsx`.
- Backend: Express 5, TypeScript, Prisma/PostgreSQL. Admin APIs are mounted at `/api/v1/admin` from `server/src/app.ts`; their handlers/schemas/tests are in `server/src/features/admin/`.
- `adminRouter` already applies `requireAuthentication` and `requireRoles(UserRole.ADMIN)` to every admin route. Preserve backend enforcement and add/extend tests proving non-admins receive 403 and unauthenticated callers receive 401 for new protected operations.
- Existing Prisma models include `Incident`, `Report`, `BufferedCollectionEvent`, `CollectionRequest`, `CollectionAssignment`, `CollectionStatusEvent`, facility capacity (`FacilityMaterial`), `Notification`, and `AdminAuditLog`. Reuse and evolve them only where necessary; create and commit a Prisma migration for schema changes.
- Existing collection report handling groups same-type reports on the same facility or within 250 metres during a six-hour window. `Incident.reportCount` and `communityVerified` represent aggregation state. `ILLEGAL_DUMPING`, `BROKEN_GLASS`, and `HAZARDOUS_WASTE` already receive a critical-priority override. Preserve and strengthen this behavior rather than creating a second report pipeline.
- Automatic dispatch already ranks eligible available collectors by distance, then active workload, checks material qualification, excludes collectors who declined, and records collection status history. Admin assignment and reassignment controls should reuse these rules where appropriate and record assignment decisions.
- Existing admin routes include overview, users, collectors, facilities, requests, active collections, verification, material rates, redemptions, reports, notifications, audit, and analytics. Existing audit records are append-only through current APIs. The current `/admin/analytics` is lifetime-oriented, not the requested 30-day report.
- The current admin map shows active pickup requests and assigned collectors only. Facility operations already expose facility capacity/incident views to facility users. There is currently no Admin incident-list/override API or simulator API/service. There is no scheduled-maintenance or sensor-telemetry service. Do not claim these are already implemented.
- Check nearby Next.js 16 guidance under `client/node_modules/next/dist/docs/` before editing Next.js code, following `client/AGENTS.md`.

## Implementation requirements

### Admin overview and polling

- Replace/extend overview KPIs with backend-derived values: active collection requests, pending requests, collectors online, active facilities, critical active incidents, total verified collected kg, points issued, and completed collections. Retain useful existing approval/reward indicators where space permits. Never hard-code operational values.
- Add a consolidated Admin incidents view and surface critical/unassigned work from the overview.
- Poll incidents, requests, collectors, facilities, notifications, and KPIs every 2–5 seconds without full-page reload. Avoid overlapping requests, stale responses, and unmount updates; retain last good data and show refresh failures accessibly.

### Incidents and priority

- Expose active incidents to Admins with ID, type, privacy-safe location/facility, priority, report count, status/resolution state, assigned collector where applicable, created/last-reported time, and linked reports.
- Keep duplicate prevention transactional: same active condition, facility/bin or nearby coordinates, matching issue, and configured time window update one parent incident and increment linked reports/count. Concurrent reports must not create duplicate active incidents. A second independent report marks the incident community-verified. Retain the existing grouping criteria unless tests or data contracts justify a carefully documented adjustment.
- Implement an explainable priority score using affected-user count, facility urgency, proximity, hazard, and wait time. Put weights/thresholds in one configurable domain location. Distinguish registered-user proximity from remote reports (1.0 versus 0.5 contribution) where the source is available; do not infer unavailable data. Keep the supported hazard override for toxic/hazardous waste, illegal dumping, and broken glass as CRITICAL. Return score and factor breakdown to Admin UI/API.
- Add Admin priority override for LOW/MEDIUM/HIGH/CRITICAL. Require a trimmed, non-empty reason in both API schema and UI. In one transaction record previous/new priority, reason, Admin, timestamp in the audit log and relevant history; notify affected parties as appropriate. Reject invalid/closed targets.

### Collection operations and dispatch

- Extend request list/details with ID, Recycler identity, material, estimated kg, location, priority, assigned collector, persisted status, created time, and complete transition/assignment history. Preserve current status enums; map requested display terms onto existing statuses unless a justified Prisma migration is required. Include view, manual assign/reassign, cancel, and history inspection.
- Manual assignment/reassignment must revalidate availability, approval, material qualification, workload, and request state transactionally. Cancellation requires a reason and creates history, notifications, and an audit entry.
- Preserve automatic dispatch order: eligible/qualified, closest available, least busy as a ranking input, then request priority. On decline or timeout/unanswered policy, attempt the next eligible collector and record the candidate/decision/outcome in persisted history/audit. Do not claim timeout automation unless a real scheduled mechanism is implemented; make the timeout policy explicit/configurable.

### Collectors, facilities, users, and map

- Collector operations include name, online/availability status, current job, active/completed/declined counts, collected kg, and average response time. Map persisted availability states to the requested operational labels without inventing live presence data.
- Facility operations include location, operational/approval status, accepted materials, capacity/current usage, opening hours, incoming collections, and maintenance state where implemented. Use existing facility capacity data and status thresholds where possible.
- Preserve user search. Display name/email/role/status, collection count, verified recycled kg, points, and recent activity while retaining backend privacy boundaries.
- Expand the existing Leaflet map with filters for All, Collectors, Facilities, Requests, Incidents, and Critical. Reuse existing map and API data. Avoid displaying unnecessary personal information or exposing exact Recycler information beyond what Admin operations require. Clearly distinguish current versus stale/approximate Collector coordinates.

### Simulator, scheduled maintenance, and telemetry

- Add a persistent simulator panel with these backend-backed actions: Individual Pickup Request, Bin Full, Complete Collection, Record Weight; Zone Overflow, Facility Storage Full, Create Community Report, Create Duplicate Report; Collector Offline, Collector Accept, Collector Decline, Drive Collector to Site; Facility Full, Facility Maintenance, Facility Recovered; Start Service Pause, Enable Overrun; Trigger Sensor Spike, Reset Sensor; Seed Demo Data, Reset Simulation.
- Simulator actions must call authenticated Admin API endpoints and persist their effects. Do not implement them as React-only state changes. Define bounded schemas, idempotency where retries could duplicate actions, audit entries, and notifications for actions with operational consequences. Demo seed/reset must be isolated to explicitly tagged simulator records, require a deliberate confirmation, and never delete or rewrite real user data.
- Add scheduled facility/service maintenance windows and a grace period. Requests affected by a window must be marked/unavailable for dispatch as `SCHEDULED_MAINTENANCE` or an equivalent explicit persisted state, with assignment prevented. When an enabled overrun exceeds grace, activate affected pending requests as incidents. Use a real server-side scheduled/checked mechanism and make its lifecycle observable; do not rely on a browser timer.
- Sensor spikes are short-lived telemetry records (for example, six seconds), not collection requests and not dispatch triggers. Persist/expire them server-side and show them in Sensors/Facility Operations with a reset path.

### Notifications, analytics, and audit

- Generate Admin notifications for critical incidents, facility capacity warnings, Collector unavailability, high-priority requests, community verification, failed collections, and service-pause overruns. Avoid duplicate notification storms during polling/retries.
- Provide a real rolling 30-day analytics view from persisted data: verified kg, completed collections, request volume, average resolution/response time, points issued, material breakdown (Plastic, Paper, Glass, Metal, E-waste, Other), active Collectors, facility activity, and incident volume. Bound queries by date in SQL/Prisma and use verified weights for collected totals. Handle empty data without fabricated chart values.
- Keep audit history append-only through the application: priority overrides, assignment/reassignment, declines, cancellation, facility status/maintenance changes, reward/rate changes, simulator events, and other Admin actions. Each entry includes action, Admin, entity/type ID, description/reason, timestamp, and relevant metadata. Do not add update/delete audit endpoints. Ensure sensitive data is not copied into audit metadata.

### UI, security, and compatibility

- Preserve existing Admin navigation and actions. Use the current Tailwind/component patterns and existing map; do not add a competing component system or redesign the whole product.
- Admin route hiding is not security. Every new read/mutation API must be protected by backend authentication and ADMIN role middleware. Validate inputs server-side, return standard unauthorized/forbidden errors, and prevent cross-entity access.
- Keep API types and UI aligned with persisted domain contracts. Handle loading, empty, error, stale, and mutation states. Do not add mock operational values to production UI.
- Update `PROJECT_CONTRACT.md` API contracts and documented simulator/maintenance/telemetry capabilities when implemented. Do not silently claim unsupported infrastructure exists.

## Tests and acceptance criteria

- Add focused tests for incident grouping (including concurrent/duplicate conditions), community verification, priority score factors and hazard override, required override reason, maintenance dispatch blocking/overrun, telemetry not dispatching, simulator isolation, dispatch candidate progression/audit, and Admin-only route enforcement.
- Verify existing auth, collection, facility, notification, reward, and Admin flows remain intact; update tests only where contracts intentionally change.
- Run Prisma validation and generate the client when schema changes; run server API tests and TypeScript build; run client lint/typecheck and production build. Fix errors introduced by this work and report any environment-blocked check.
- Provide concise manual test steps for Admin and non-Admin users, including priority override without a reason, incident duplicate report grouping, assignment/reassignment, polling, map filters, simulator isolation, maintenance overrun, and telemetry expiration.

## Execution guardrails

Work in the existing codebase only. Before editing, inspect the owning handlers, UI flows, relevant migrations, auth tests, and available scripts. Make focused vertical changes and validate each slice. Never remove existing functionality, bypass backend authorization, fake backend state in React, or use destructive reset behavior against non-simulator data. Do not commit changes.