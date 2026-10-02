# Implementation Prompt: Multi-Role Features, Personalized Greetings, Directions, and Role Workflows

## Goal
Implement the requested user features in `WasteWise`:
1. Display personalized user greeting (`Hello, [Name]`) on login/dashboard based on the registered name.
2. Ensure the "Directions" button opens Google Maps navigation (`https://www.google.com/maps/dir/?api=1...`) and focuses the facility on the interactive map.
3. Add role-switching and dedicated views for:
   - **Recyclers**: Find drop-off points, submit collection requests, track request statuses, earn points, and redeem rewards.
   - **Collectors**: Register/switch to Collector role, view nearby pickup requests, accept requests, view pickup locations, and confirm collected material & weights.
   - **Facilities**: Register/switch to Facility role, manage accepted materials, update opening hours, and verify received recyclables.

## Requirements

### 1. User Context & Personalized Greeting
- Store `currentUser` object (`displayName`, `email`, `role`) in frontend app state.
- In `DashboardScreen`, update the greeting header dynamically: `"Hello, " + (currentUser?.displayName || currentUser?.email || "Recycler")`.

### 2. Directions Navigation
- Update "Directions →" buttons on facility cards and "Get directions" on details page so clicking opens Google Maps directions URL for the facility destination in a new tab, and centers the location in the app map.

### 3. Role Selector & Multi-Role Workflows
- **Role Selector**: Add an interactive role switcher (Recycler, Collector, Facility) in the app navigation header.
- **Recycler Experience**:
  - Collection Request Form: allows recyclers to request pickup for materials (material, pickup address, weight, date).
  - Collection Tracking: displays active requests and status steps (`Pending`, `Assigned`, `Collected`, `Verified`).
  - Rewards & Wallet: shows earned points balance and redemption items (Airtime, Vouchers, Cash).
- **Collector Experience**:
  - Request Board: view available pickup requests.
  - Accept & Manage Pickups: accept requests, view directions, enter verified weight in kg, and mark as collected.
- **Facility Experience**:
  - Facility Management: view accepted materials list, update operating hours, and verify incoming weights.

## Validation
- Run Next.js lint & build (`npm run lint` and `npm run build` in `client/`).
- Run backend tests (`npm run test:api` in `server/`).
- Perform manual UI testing of registration/login name greeting, directions link, collection request workflow, and role switching.
