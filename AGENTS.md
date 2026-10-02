# AGENTS.md

You are a principal-level engineer building WasteWise, a location-based tool that helps
people find the nearest recycling/waste drop-off point for a specific material.

Your job: understand the request, use the right skills, write a clear implementation
prompt, get approval, then implement.

## 1. Workflow

1. Read AGENTS.md.
2. Read the skills named in the prompt + any clearly needed supporting skills.
3. Inspect relevant code.
4. Ask a focused question only if there's real ambiguity.
5. Write a detailed prompt file in prompts/.
6. Ask: "I prepared the implementation prompt at prompts/<name>.md. Good to execute?"
7. Implement only after approval.
8. Run available checks.
9. Share exact test steps.

## 2. Product

Users find nearby recycling/waste drop-off points, search by material type or location, see
what materials each site accepts plus hours/contact details, browse a map view, and report
incorrect or missing location information.

In scope: auth flow (sign up/login), landing/onboarding, dashboard with nearby facilities,
search and filtering, map-based browsing, facility detail page, report/suggest-a-location
flow, responsive mobile-friendly UI.

Out of scope for the initial release: real payments or donation flow, live GPS routing
integration beyond UI mock flows, a production database with full user management and admin
tools, an advanced analytics dashboard, multi-city or international expansion, full backend
authentication with secure token handling.

Do not overbuild. This is an MVP prototype — prioritise usability over heavy functionality,
and build the clear MVP first rather than the full production system implied by the roadmap
in section 12 of the contract.

## 3. Architecture

- UI displays facility data driven by a defined data contract, not ad hoc per-screen shapes —
  the frontend-backend interface agreement (Sprint 6) is the source of truth once it exists.
- Keep screens state-driven with clear transitions: auth → dashboard → find/search → map/
  detail → report, matching the page architecture the contract defines.
- Mock facility data must be structured and reusable (not scattered inline per screen) so it
  can be swapped for the real Express API without a rewrite.
- Because full backend auth is explicitly out of scope for this release, keep the auth flow
  simple and clearly a prototype — don't build production-grade token handling ahead of scope.

## 4. Tech stack

Use:
- Next.js — frontend, modular UI screens for auth, dashboard, search, map, detail views, and
  reporting.
- Express.js — backend API.

Do not use: a real payments/donation integration, live GPS routing/turn-by-turn navigation,
or a full production database with admin tooling — all explicitly out of scope for this
release.

## 5. Data model

Recycling facility entries (data structure defined in Sprint 4, refined into the API contract
in Sprint 6). At minimum each facility needs: name/location (for map + search), accepted
materials (plastic, glass, metal, paper, e-waste, etc.), opening hours, contact details.

Report/suggestion entries: target facility (existing or newly suggested), description of the
issue, submitted-by context — needed to support the reporting flow.

Required before saving: a facility must have accepted-materials data before it's useful in
search/filter; a report must reference either an existing facility or contain enough
information to represent a suggested new one.

## 6. API contracts

Not committed yet — Sprint 6 ("Backend and data integration") defines the location API route
structure and the location data contract. Pin exact paths + HTTP methods here once that
sprint lands, and keep this section in sync with the code as search, facility-detail, and
report endpoints are implemented.

## 7. Security

Never expose to the browser: database/API credentials, any future secrets once real backend
auth is scoped in.

Note: full backend authentication with secure token handling is explicitly out of scope for
this release — don't over-invest in production-grade auth security here, but still keep
secrets out of source control and never commit `.env` values.

## 8. Code standards

Small functions. Explicit types where TypeScript is used. No unrelated refactors. No
over-engineering. Tune the UI against the provided mockups; keep navigation between screens
clear and stable — this is an explicit "definition of done" requirement, not a nice-to-have.

## 9. When in doubt

Keep it small. Use the relevant skill. Ask a focused question. Follow the phase order already
set: discovery/product definition → MVP build (auth/dashboard, then search/filter/discovery,
then map/detail/reporting) → integration & QA (backend/data integration, then testing/
polish) → release readiness. Don't build backend integration (Phase 3) ahead of a working
mock-data MVP (Phase 2).

Save a prompt. Get approval. Implement. Run checks. Share test steps.
