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

- users can sign in or sign up
- users can search for nearby drop-off points by location and material
- a user can view a facility’s accepted materials and hours
- the map and detail views feel useful and intuitive
- the reporting flow is available for incorrect or missing data
- the app is polished enough to act as a realistic MVP prototype

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
