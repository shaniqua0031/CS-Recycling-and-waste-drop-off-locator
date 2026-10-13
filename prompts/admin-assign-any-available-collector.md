# Admin Assignment: Any Available Collector

## Goal
Allow any approved, active, Available collector to be assigned to any waiting collection request. Do not reject a collector because of material qualification, service radius, missing/stale location, or distance. Keep collector availability and account/approval status visible to the admin. Remove request-specific "Not eligible" messaging.

## Scope
- Update the admin request-candidates endpoint and assignment endpoint in `server/src/features/admin/admin.routes.ts`.
- Keep automatic dispatch behavior in `server/src/features/admin/admin.logic.ts` and `server/src/features/collections/collections.routes.ts` unchanged; its material/location ranking is a separate workflow.
- Update the collector candidate API type and the assignment panel in `client/lib/dashboard-api.ts` and `client/app/admin-dashboard.tsx` as needed.
- Keep the full collector roster visible, including offline, busy, pending, and suspended accounts. Show their actual availability, account, and approval statuses. Allow Assign only for APPROVED + ACTIVE + AVAILABLE collectors. Never describe an otherwise available collector as unavailable because of request-specific material or location rules.

## Backend behavior
1. Candidate listing returns all profiles whose approval status is APPROVED, user account status is ACTIVE, and availability is AVAILABLE. Do not apply qualified-material, coordinates, service-radius, or proximity requirements.
2. Preserve deterministic ordering, such as active workload followed by display name or creation time.
3. Assignment uses this same candidate rule. Inside the transaction, re-fetch and revalidate profile approval, user account status, availability, and active workload to retain race protection.
4. Preserve request-state validation, assignment history, notifications, and availability transition to ON_COLLECTION.
5. Do not loosen rules for offline, busy, unapproved, or inactive collectors.

## Frontend behavior
- Preserve the full roster and separate collector status from assignability.
- Remove all request-specific "Not eligible" text. Available + active + approved collectors display an enabled Assign action. Other collectors show their actual status and a disabled action with a status-accurate label if needed.
- Keep the assignment panel map-free.

## Verification
- Update focused tests to prove an approved, active, Available collector is a candidate even with no location and without qualification for the request material.
- Verify inactive, unapproved, OFFLINE, and ON_COLLECTION collectors remain non-assignable.
- Run the server's focused API/logic tests and TypeScript build/check, plus client ESLint and `tsc --noEmit`.
- Manually test a waiting request using an available collector with no location or matching material qualification; assignment should succeed and the collector should receive the assignment notification.
