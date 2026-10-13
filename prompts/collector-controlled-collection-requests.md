# Collector-Controlled Collection Requests

## Current Workflow
Recycler requests are created in `server/src/features/collections/collections.routes.ts` with `WAITING_FOR_ADMIN` unless facility maintenance delays them. Request creation and collector availability changes can invoke `dispatchWaitingCollections()`, which assigns requests automatically. Admins also have manual candidate and assignment routes in `server/src/features/admin/admin.routes.ts`. The collector dashboard at `/collector/dashboard` returns assignments already tied to that collector; `CollectorBoardScreen` accepts or declines those assigned jobs. Declines currently require a reason code but allow an empty explanation, return the request to `WAITING_FOR_ADMIN`, and trigger reassignment. Recycler tracking is requester-scoped but does not render the decline reason as request status/details.

## Goal
Make collection requests collector-controlled. A newly submitted request remains pending and appears in an authenticated collector request queue. One collector can atomically accept or decline it. A decline requires a non-whitespace reason and closes the shared request to further decisions. Requesters see the decision and reason. Admins can monitor request statuses but cannot assign, accept, or decline requests.

## Existing Data to Reuse
- `CollectionRequest.requesterId`, `status`, status events, timestamps, request details, and requester-scoped queries.
- `CollectionAssignment.collectorProfileId`, `status`, `reason`, `declineReasonCode`, and `acceptedAt`.
- Existing in-app notifications and authenticated role middleware.
- Add a semantic `declinedAt` timestamp only if needed; do not duplicate existing ownership or actor fields.

## Backend and Database
1. Add explicit collection statuses for `ACCEPTED` and `DECLINED` if existing statuses cannot represent the requested user-facing states. Create a Prisma migration and update status/API types and status mappings. New non-maintenance recycler requests start `PENDING`; maintenance-held requests remain held until released, then become `PENDING`.
2. Stop automatic assignment of user collection requests. Remove dispatch triggers from request creation, collector availability changes, declines, cancellations, and maintenance release as applicable. Do not leave a hidden admin or simulator path that assigns ordinary requests automatically. Preserve unrelated maintenance, simulator, analytics, and facility workflows where possible.
3. Add an authenticated collector-only available-request feed, preferably to the existing collector dashboard response. Return only pending requests to approved, active collector accounts. Do not require material qualification, current location, or service radius for visibility or acceptance. Include the request ID, requester display name, material, estimate, pickup address/location, requested date, instructions, status, priority, and created time. Preserve appropriate authorization and do not expose unrelated users' records to recyclers or facilities.
4. Replace assigned-only acceptance with a transaction that conditionally changes a `PENDING` request to `ACCEPTED`, creates its assignment for the authenticated approved collector with `ACCEPTED` status and `acceptedAt`, updates collector availability consistently, records a status event, and notifies the requester. Use a conditional update/transaction so concurrent acceptances have exactly one winner and return a clear conflict to the other collector.
5. Replace assigned-only decline with a collector-only transaction allowed only while the request is `PENDING`. Validate and trim a required non-empty reason server-side. Atomically set request status to `DECLINED`, create a declined assignment linked to the authenticated collector and save the reason plus decision time, add a status event, and notify the requester with the reason. A declined request must disappear from every collector's pending queue and cannot be decided again.
6. Keep existing progress authorization bound to the accepting collector. Continue the existing route/arrival/collection/verification transitions after acceptance; introduce the smallest status transition needed to move from `ACCEPTED` into the existing on-the-way flow.
7. Keep recycler reads scoped by `requesterId`; include the accepting/declining assignment and decision details only for that request's owner. Keep collector reads limited to open queue items and that collector's own assignments/history.
8. Remove the Admin candidate and assignment endpoints (`GET /admin/requests/:requestId/candidates`, `POST /admin/requests/:requestId/assign`) and their obsolete status-only helper. Keep the Admin request list read-only for assignment decisions and preserve unrelated dashboard sections, reports, statistics, and management features.

## Frontend
- Update `client/lib/dashboard-api.ts`, `client/app/page.tsx`, and `client/app/workflow-screens.tsx` to expose a clearly titled **Available Collection Requests** section on the existing collector board.
- Show the available request details and working Accept Request / Decline Request actions. Disable duplicate submissions, show success/error/loading states, and use an accessible decline form with a required `Reason for Declining` textarea that rejects whitespace-only input.
- On accept, remove the request from the open queue and show it in the collector's active/accepted workflow while preserving later progress actions. On decline, remove it from all pending queues and show a confirmation.
- Update `CollectionRequest`/API response mapping and `TrackingScreen` so a requester sees Pending, Accepted, Declined, existing progress states, the decline reason and decision time, and accepted collector information where appropriate.
- Remove admin assignment controls, candidate maps/lists, and client API calls. Keep the Admin requests table as read-only status monitoring; do not remove unrelated Admin capabilities.
- Preserve existing visual styling, navigation, responsiveness, and existing role workflows.

## Tests and Verification
- Add migration/schema validation for the new status/timestamp fields.
- Test queue authorization and visibility, requester ownership, required/trimmed decline reason, and rejection of non-pending decisions.
- Test concurrent accept attempts: exactly one succeeds; the other gets a conflict. Test a decline closes the queue item and persists collector ID, reason, and decision time.
- Test requester responses show only that request's decision details; test that unrelated users and roles cannot read the open collector queue or act on requests.
- Run existing server API tests, focused collection/collector tests, Prisma validation/generation as applicable, server TypeScript checks, client ESLint, and client TypeScript checks.
- Manually test request creation, collector accept, collector decline, requester tracking/notification, Admin read-only visibility, and existing accepted-collection progress through completion.

## Constraints
Do not rebuild the application or change unrelated workflows. Reuse the Express/Prisma and Next.js/TypeScript architecture, authentication, notification system, existing data model, and established design. Preserve pre-existing working-tree changes unless they directly conflict with the approved collector-controlled request workflow.
