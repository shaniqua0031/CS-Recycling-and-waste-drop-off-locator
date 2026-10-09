# WasteWise Project Contract

## 1. Project identity

- Project name: WasteWise
- Repository: CS-Recycling-and-waste-drop-off-locator
- Type: Web application for recycling and waste drop-off discovery
- Primary stack: Next.js (frontend), Express.js (backend API), modular UI screens for authentication, dashboard, search, map, detail views, and reporting

## 2. Problem statement

People who want to recycle often do not know the nearest drop-off point for a specific material such as plastic, glass, metal, paper, or e-waste. Because of this, recyclable waste often ends up in general bins instead of being sent to the correct facilities. The project aims to reduce this problem by creating a simple, location-based tool that helps users find appropriate recycling facilities quickly and confidently.

## 3. Project objective

WasteWise will provide users with a clear and accessible way to:

- find nearby recycling and waste drop-off points
- search by material type or location
- understand which materials are accepted at each site
- view daily opening hours and contact details
- access a map view of nearby facilities
- report incorrect or missing location information

## 4. Target users

- households wanting to recycle correctly
- environmentally conscious residents
- students and community members searching for local waste facilities
- local organisations and civic users contributing to better recycling data

## 5. Scope

### In scope

- user authentication flow (sign up / login)
- landing and onboarding experience
- dashboard with nearby facilities
- search and filtering of facilities
- map-based location browsing
- facility detail page
- reporting and suggesting a new or corrected location
- responsive, mobile-friendly UI

### Out of scope for the initial release

- real payments or donation flow
- live GPS routing integration beyond UI mock flows
- production database with full user management and admin tools
- advanced analytics dashboard
- multi-city or international expansion
- full backend authentication with secure token handling

## 6. Success criteria

The project will be considered successful when:


### API contracts and verification

The Express API is mounted under `/api/v1`.

### Collection and collector routes

- `GET /collections` — authenticated Recycler requests, Collector-owned assignments/history, or Facility destination requests, scoped by role and signed-in user/membership.
- `POST /collections` — Recycler creates a request. The server creates it in `WAITING_FOR_ADMIN` and dispatches it to the closest qualified available collector, with request priority and active workload as ranking inputs. Admin assignment remains available when no automatic candidate is eligible.
- `POST /collections/:requestId/cancel` — the requesting Recycler may cancel before collection starts. Active assignment records are revoked and affected users/Admin are notified.
- `GET /collections/collector/dashboard` — Collector-only profile, qualifications, owned jobs/history, metrics, and notifications.
- `PUT /collections/collector/profile` — Collector-only availability (`AVAILABLE`, `ON_COLLECTION`, `OFFLINE`, `UNAVAILABLE`) and active material qualification updates. `ON_COLLECTION` is the persisted `BUSY` state; assignment and job completion may also update it server-side.
- `POST /collections/:requestId/accept` — assigned Collector accepts; transition and notifications are recorded atomically.
- `POST /collections/:requestId/decline` — assigned Collector declines with `reasonCode` (`VEHICLE_FULL`, `TOO_FAR`, `UNAVAILABLE`, `MATERIAL_UNSUPPORTED`, `SAFETY_ISSUE`, `OTHER`) and optional `explanation`; the server attempts reassignment.
- `POST /collections/:requestId/progress` — assigned Collector transitions via `ARRIVED`, `START`, `PAUSE`, or `RESUME`. `PAUSE` requires a delay code (`VEHICLE_PROBLEM`, `SAFETY_ISSUE`, `SORTING_DELAY`, `CUSTOMER_DELAY`, `OTHER`).
- `POST /collections/:requestId/collect` — assigned Collector records either legacy `actualKg` or material lines (`materials: [{ materialId, actualKg }]`) and optional notes. Collection must be `COLLECTING`; each category must be active and accepted by the destination facility. The request moves to facility verification.
- `POST /collections/:requestId/verify` — authorized Facility member verifies legacy `verifiedKg` or per-material values (`materials: [{ materialId, verifiedKg }]`). Existing idempotent reward calculation remains tied to facility verification.
- `GET /collections/notifications` and `POST /collections/notifications/:notificationId/read` — personal Recycler/Collector notifications, always scoped to the authenticated user.

### Admin route

- `PATCH /admin/requests/:requestId/priority` — Admin-only priority update (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) requiring a reason; recorded in collection status history and Admin audit, with notifications to the requester and current collector.
- `POST /admin/requests/:requestId/assign` — Admin-only assignment or reassignment while a request is waiting or assigned but not accepted; eligibility is revalidated transactionally and assignment history/audit are recorded.
- `POST /admin/requests/:requestId/cancel` — Admin-only cancellation requiring a reason; active assignments are revoked, collectors released, and status history, notifications, and audit are recorded.
- `GET /admin/incidents` — Admin-only active incident list with linked reports, community verification, explainable score factors, and assigned Collector.
- `PATCH /admin/incidents/:incidentId/priority`, `/assignment`, and `/status` — Admin-only incident override (reason required), Collector assignment, and resolve/reopen actions with audit history.
- `GET /admin/analytics/30-days` — Admin-only rolling persisted 30-day operations and recycling analytics.
- `GET|POST /admin/maintenance-windows` and `PATCH /admin/maintenance-windows/:windowId/overrun` — Admin-only facility service schedules, request dispatch blocking, and overrun controls. The server worker processes windows and grace periods.
- `GET /admin/sensors`, `POST /admin/sensors/spike`, and `POST /admin/sensors/reset` — Admin-only short-lived facility telemetry. Sensor events do not create or dispatch collection requests.
- `GET /admin/simulator/events` and `POST /admin/simulator/actions` — Admin-only persisted simulator operations. Simulator reset only reverses records linked to simulator events; ordinary user records are not deleted.
- `POST /admin/collectors/:profileId/messages` — Admin-only personal message to one Collector; delivery creates a Collector notification and Admin audit entry.

Collectors cannot access Admin routes or another Collector's profile/jobs/notifications. Recycler-facing collection responses redact exact Collector coordinates; Collector dashboard coordinates are returned only to that authenticated Collector. Polling remains client-side at a three-second interval without page reloads.

Facility-condition reports notify only collectors with active assignments for the affected facility.

The simulator is an Admin-only demonstration service, not a physical sensor integration. Sensor events are simulated, short-lived telemetry records. There is no proof-photo storage integration. The collection completion notification says “Your waste has been cleared,” but the app does not claim that a physical sensor or photo upload was completed.
## 7. Delivery principles

- keep the experience simple and intuitive
- prioritise usability over heavy functionality
- build a clear MVP first
- reduce waste and confusion around recycling decisions
- make the app useful for everyday users, not only technical audiences

## 8. Phased delivery plan

### Phase 1: Discovery and product definition

Goal: clarify the product vision, target user problem, and core MVP outcome.

#### Sprint 1: Problem validation and product framing

- define project problem and solution statement
- identify the target user and main pain points
- confirm the product purpose and value proposition
- define initial MVP features and risks
- review the current UI and product direction

Deliverables:
- product brief
- problem statement
- scope list
- MVP definition

#### Sprint 2: UX and technical foundation

- finalise the screens and user flow
- define the page architecture: auth, dashboard, find, map, details, report
- confirm technical stack and project structure
- set up frontend and backend baseline
- create initial UI styling system and design tokens

Deliverables:
- wireframe-level UX flow
- base Next.js frontend
- Express API scaffold
- initial design direction

### Phase 2: MVP build

Goal: implement the main entry points and core functionality of the application.

#### Sprint 3: Authentication and dashboard

- create the landing/auth experience
- implement sign-up and login screens
- create dashboard layout with greeting and search area
- add nearby drop-off cards and category filters
- establish a working state-driven UI flow between screens

Deliverables:
- auth flow
- dashboard screen
- interactive screen transitions

#### Sprint 4: Search, filtering, and location discovery

- build the Find Points screen
- add filters for material type, distance, and opening hours
- create list view of nearby locations
- connect search to the map and detail screen flow
- create data structure for sample facility locations

Deliverables:
- search and filter experience
- location list screen
- data model for recycling facility entries

#### Sprint 5: Map, detail, and reporting flows

- build map-like location screen with visual facility markers
- create facility detail screen with accepted materials and hours
- add report or suggest location form
- connect screen transitions and navigation actions
- validate user journey end-to-end

Deliverables:
- map interaction screen
- detail page
- reporting/suggestion form
- end-to-end MVP flow

### Phase 3: Integration and quality assurance

Goal: make the product reliable, usable, and prepared for demonstration or handoff.

#### Sprint 6: Backend and data integration

- connect the frontend with the Express API
- define location API routes and sample data structure
- refine static mock data into a structured, reusable format
- review how screens depend on data contracts

Deliverables:
- API route structure
- location data contract
- frontend-backend interface agreement

#### Sprint 7: Testing, bug fixing, and polish

- validate all user flows and states
- fix UI inconsistencies and responsiveness issues
- tune design against provided mockups
- improve accessibility and usability
- prepare demo-ready version

Deliverables:
- QA checklist
- bug tracking and resolution log
- polished UI update

### Phase 4: Release preparation and launch readiness

Goal: prepare the app for stakeholder review, demo, and future extension.

#### Sprint 8: Release readiness

- final review of MVP against requirements
- ensure project documentation is complete
- confirm the app runs locally without setup issues
- prepare final presentation/demo narrative
- define next-step roadmap for production growth

Deliverables:
- final project walkthrough
- release notes
- roadmap for post-MVP improvements

## 9. Team roles

### Product owner

- defines the problem, priority, and user value
- approves scope and releases

### UI/UX lead

- manages visual design, screen flow, responsiveness, and mockup alignment
- validates usability and polish

### Frontend engineer

- builds the Next.js user interface
- creates interactive flows and screens
- connects UI states and navigation

### Backend engineer

- creates the Express API layer
- exposes location data and future service endpoints

### QA and validation lead

- tests features across flows
- checks quality and catch issues before launch

## 10. Definition of done

A feature is considered done when:

- it matches the intended workflow and design direction
- it works without major UI or behavior issues
- navigation between screens is clear and stable
- any required data is displayed correctly
- it has been reviewed against the mockup or requirement
- it is stable enough for demo and stakeholder review

## 11. Risks and constraints

- limited dataset and real location source availability
- UI mockup fidelity may require repeated design iteration
- backend and frontend must remain in sync as data structure evolves
- production readiness depends on future data validation and authentication security

## 12. Future roadmap beyond MVP

- real API integration with map and live location services
- user accounts with secure backend auth and saved locations
- admin dashboard for reviewing reports and managing locations
- expanded coverage across cities and regions
- sustainability metrics and user impact tracking
- mobile-first optimisation and native app direction

## 13. Final project commitment

This project is committed to solving a practical sustainability and civic problem: helping people easily find the right place to recycle their waste. The MVP will focus on a clean, accessible, location-aware web experience that reduces confusion and supports better recycling habits.

---

Document status: Working project contract for MVP planning and phased delivery.
