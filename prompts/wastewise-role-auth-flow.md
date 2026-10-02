# WasteWise role-aware auth and dashboard flow

## Goal
Create a working MVP flow for three account types: recycler, collector, and facility/business. The login flow should greet the user by the registered display name and should route the "Directions" action to a map app using the user's current location when available.

## Requirements
- Keep the app prototype-friendly and focused on the MVP.
- Support sign-up for the following roles: RECYCLER, COLLECTOR, FACILITY.
- Reject privileged roles such as ADMIN at validation time.
- After login, show a dashboard greeting in the format: "Hello, [display name]".
- Directions should open a map with the destination facility and the user's current location as the origin when browser geolocation is available.
- Keep the app role-aware so each user sees the right dashboard actions for their responsibilities.
- Maintain the existing backend style and auth contract while allowing the role to be persisted in the demo fallback and DB-backed paths.

## Acceptance criteria
1. Registration accepts a role selection for recycler, collector, and facility members.
2. Validation rejects ADMIN or other disallowed roles.
3. The session and auth response include the role and display name for the signed-in user.
4. The dashboard greeting uses the registered display name.
5. Clicking Directions opens an external maps route using the user’s current location when available.
6. The dashboard content differs by role and matches the user needs for each role.

## Scope
- Frontend: Next.js client UI, auth form, greeting, directions link, role-aware dashboard.
- Backend: Express auth schema and registration logic.
- Validation: relevant auth tests should pass.
