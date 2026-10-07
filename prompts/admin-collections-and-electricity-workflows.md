# Implementation Prompt: Admin Collections and Electricity Rewards

## Goal
Complete WasteWise's existing persisted Admin and role workflows so Recycler accounts, Collector profiles, Facilities, collection assignments, verification, notifications, and point redemptions are clearly separated and work end to end. Fix the immediate React warning on the Admin Users table. Preserve the existing Next.js + Express + Prisma architecture and current role workflows.

## Current state and root cause
- The browser warning shown on `/admin` is caused by `filteredUsers.map((user) => <>{...}</>)` in `client/app/admin-dashboard.tsx`: the shorthand Fragment is the direct list child and has no `key`. Keys on its nested `<tr>` rows do not satisfy React's requirement. Add a keyed `Fragment` (import it from React) or restructure the mapped rows so each top-level list item has a stable key. Keep the detail row associated with its user's stable ID.
- `User` is the authentication/account identity, not the collector or facility business record. Prisma already models `CollectorProfile` with a unique `userId`, `Facility` as its own entity, and `FacilityMembership` to link facility staff accounts. Keep these normalized relationships; do not duplicate collector/facility data into user records or remove account references needed for authentication and ownership.
- The Admin console already has navigation for Users, Collectors, Facilities, Collection Requests, Active Collections, Verification, Redemptions, Analytics, Reports, Notifications, and Audit log. Validate that each section renders its persisted data and usable actions in the existing dashboard rather than adding another console.
- Admin assignment and collector acceptance endpoints exist. `AssignmentStatus` already includes `DECLINED` and `CollectionAssignment` has a `reason`; there is no collector decline endpoint/UI yet. A Collector assignment board currently exposes accept only.
- Recycler collection tracking is driven by persisted requests, but the current `CollectionRequest` client type omits assignment ETA and location-display state. Collector pickup UI has the address/directions and can submit timestamped last-known coordinates; it is not live tracking.
- Generic reward redemptions currently debit points and use a fixed informational conversion of 1 point = R0.20 (500 points = R100). The redemption record does not include a redemption kind or electricity meter number. No electricity provider/payment integration exists or should be added.

## Required behavior

### Admin identities and dashboard
- Fix the missing-key warning on the Users list without suppressing React warnings or changing unrelated table markup.
- Keep account identity separate from role profiles and facility records. Make the Admin Users section clearly about Recycler/user accounts (or otherwise provide explicit role filtering); show collectors in Collectors and locations/business records in Facilities. Do not treat a CollectorProfile or Facility as a generic User row, while retaining the linked account email/name and user ID where needed for ownership, status, and authentication.
- Keep the existing Admin navigation and make Verification, Collection Requests, Active Collections, Analytics, Reports, Redemptions, Audit log, and Notifications visibly populated from their existing API data, with correct loading/error/empty states and links or actions appropriate to each record. Counts/links on Overview should take the Admin to the corresponding section.
- Preserve auditability for Admin decisions, collection assignment, redemption decisions, and account/profile status changes. Never expose server credentials in client code.

### Assignment accept/decline and shared collection state
- Admin can assign an eligible Collector profile to a Recycler request using the existing request/candidate flow. Assignment updates must be concurrency-safe and reflected in all relevant role views.
- On an assigned request, the Collector can Accept or Decline. Decline opens an accessible dialog or inline modal containing a required multiline reason and Confirm/Cancel actions; blank reasons cannot be submitted. Disable duplicate submissions and show API errors in the workflow.
- Persist a declined assignment as `DECLINED` with its reason, update the request so Admin can reassign it (use the existing `WAITING_FOR_ADMIN` lifecycle unless the current state machine requires a narrowly additive alternative), record a status event, and notify the Recycler and Admin. Do not silently delete assignment history. Enforce that only the assigned, approved Collector can accept/decline and reject stale/repeated decisions.
- In the Admin Collection Requests section, show declined reason/history and make the request available for reassignment. Keep assignment state, notifications, and status history transactionally consistent where practical.

### Recycler assignment status, ETA, and tracking
- On the Recycler's tracking view, show whether a Collector is assigned, the Collector's display name when available, whether they accepted, the current request status, and an ETA once a valid location-based estimate can be calculated. Display the estimate as approximate and timestamp its source; never imply live routing or guaranteed arrival.
- Recalculate an estimate from the assigned Collector's most recent stored coordinates and the pickup coordinates using the existing geographic utility and the documented speed assumption. If coordinates are absent or stale, clearly show ETA unavailable instead of inventing one.
- Show last-known Collector position on the existing map for the associated request when available, with its update time. Keep location sharing explicit and limited to relevant collection participants. Do not add background polling/live GPS or turn-by-turn routing.

### Collector assigned pickup
- Ensure the assigned Collector can see the Recycler's pickup address and request details after assignment and can open directions using the current map link behavior. Show the request's accepted/declined/in-progress status and continue to support timestamped location updates and recording collected weight.
- Do not expose an unassigned Recycler's private pickup address to unrelated Collectors. Keep Collector location labeled as timestamped last-known location; no fake motion or unsupported real-time tracking.

### Electricity redemption using points
- Add an electricity redemption option to the Recycler's Use points/rewards flow. Before submitting, require the user to enter a meter number and choose the number of points to redeem; show the calculated Rand-equivalent value using the existing 1 point = R0.20 informational conversion and clearly state that this prototype does not directly purchase electricity or issue a utility token.
- Persist the redemption as a distinct electricity redemption with the meter number, points cost, generated reference, status, and user. Use a minimal additive Prisma migration/schema update and validate meter-number format/length without logging or unnecessarily exposing the full number.
- Debit points and create the redemption/ledger transaction atomically, enforcing sufficient balance and idempotency. If the redemption is rejected, return the points through a compensating ledger transaction exactly once. Preserve existing rewards and redemptions.
- Show electricity redemptions in the Admin Redemptions section with masked meter number, requested points/value, reference, and status. Admin can approve/reject (reason required for rejection) and mark approved requests fulfilled after external/manual fulfillment. User sees status changes and notifications. Never claim that electricity was purchased or a token delivered automatically.

## Implementation constraints
- Read `client/AGENTS.md` and the installed Next.js docs relevant to changed APIs before editing client code.
- Follow existing auth, Express router, Zod validation, Prisma transaction, audit, notification, and migration conventions. Do not add public Admin signup or change account roles through the client.
- Prefer existing Prisma models and status values. Add only narrowly needed fields/enum values and an additive migration. Preserve assignment, report, status-event, and reward-ledger history.
- Keep the UI state-driven, accessible by keyboard, responsive, and visually consistent with current WasteWise screens. Use explicit types and focused helpers; avoid unrelated refactors or new dependencies unless required.
- Do not implement utility-provider APIs, payments, turn-by-turn navigation, or live GPS tracking; those are outside this prototype's scope.

## Acceptance criteria
1. `/admin` renders without the missing-key React warning, including expanded user-history rows.
2. Admin Users, Collectors, and Facilities clearly represent separate account/profile/location concepts while preserving their links.
3. All existing requested Admin sections display their persisted data and appropriate loading, error, empty, and action states.
4. A Collector can accept or decline an assignment; decline requires a reason, persists history, notifies affected roles, and returns the request to the Admin reassignment queue.
5. Recycler sees assignment, acceptance, approximate ETA when supported, and timestamped last-known Collector location; Collector sees assigned pickup address and directions only for their assignment.
6. Collection status/assignment changes are consistent across Admin, Recycler, and Collector views and resist duplicate/stale actions.
7. Recycler can submit an electricity redemption only after providing meter number and points amount; Admin can review, decide, and fulfill it; ledger debit/reversal, audit, and notifications are consistent and idempotent.
8. Electricity workflow communicates that fulfillment is manual/external and does not claim real electricity purchase or token delivery.
9. Existing role workflows, standard rewards, collection verification, audit history, and non-electricity redemptions continue to work.

## Verification
- Add/update focused server tests for collector accept/decline authorization, required decline reason, valid/invalid status transitions, notification/history persistence, reassignment eligibility, and electricity redemption validation, atomic point debit, rejection reversal idempotency, and Admin decisions.
- Run client `npm run lint` and `npm run build`.
- Run server `npm run api:build`, `npm run test:api`, and supported Prisma schema/migration validation.
- Manually test one Admin, Recycler, and approved Collector: create request, assign, decline with reason, reassign, accept, confirm user assignment and ETA/location state, then submit an electricity redemption with a meter number, reject it and verify returned points; repeat with approval/fulfillment and inspect Admin notifications/audit. Check invalid/empty meter and decline reasons are blocked.
