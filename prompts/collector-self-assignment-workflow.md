# Collector self-assignment workflow change

## Goal
Change the collection-request workflow from admin-assigned collectors to collector self-assignment while preserving the current business logic and existing data model as much as possible.

## Current state observed in the codebase
- `CollectionRequest` has a `status` field with `PENDING`, `WAITING_FOR_ADMIN`, `ACCEPTED`, `DECLINED`, `COLLECTOR_ASSIGNED`, etc.
- `CollectionAssignment` stores collector decisions and assignment history with `status`, `reason`, `declinedAt`, `acceptedAt`, and `assignedByUserId`.
- Collection endpoints already include collector accept and decline handlers under `server/src/features/collections/collections.routes.ts`.
- Admin routes still expose collection-monitoring tools and simulator/admin logic, but no direct manual assignment flow appears in the current collection request admin UI.
- The existing workflow already provides a collector dashboard and status transitions for accepted collections.

## Required change
1. Keep `CollectionRequest.status` as the system-wide request state.
2. Ensure a new collection request is created with `PENDING` and no assigned collector.
3. Make pending requests visible to eligible collectors.
4. Let a collector accept a pending request via `POST /api/v1/collections/:requestId/accept`.
5. Enforce a single-winner claim on the backend using a transaction/conditional update.
6. Let a collector decline a pending request via `POST /api/v1/collections/:requestId/decline` with a required textual reason.
7. Record decline reasons without turning the whole request into a global decline if another collector can still accept it.
8. Keep admin monitoring capabilities, but remove any manual collection-request collector assignment flow.
9. Preserve all existing collection progress updates after acceptance.
10. Update tests and run validation commands.

## Technical constraints
- Do not destroy or reset data.
- Do not blindly replace Prisma models or routes.
- Reuse the existing `CollectionAssignment` pattern where possible, and only add a dedicated `CollectorResponse` table if the current schema cannot safely represent multiple collector decisions without overloading the request-level status.
- Respect existing auth middleware and role checks.
- Use the project’s existing response and validation conventions.
- Create a Prisma migration for any required schema updates.

## Specific requirements to preserve
- User can still create collection requests.
- Admin remains able to monitor and manage collection requests without manually assigning collectors.
- Collector dashboard shows pending requests they can accept/decline.
- Accepted request transitions continue through the current collection workflow.
- Existing API tests and Prisma schema must continue to validate.
- New tests must cover accept, decline, duplicate claim prevention, and admin visibility.

## Execution
After approval, implement the minimal required changes in the existing server and client code only, then run the relevant checks and share the exact test steps and results.
