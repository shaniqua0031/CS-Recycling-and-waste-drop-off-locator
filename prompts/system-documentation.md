# Implementation Prompt: WasteWise System Documentation

Create a plain-text system documentation file at the repository root named `SYSTEM_DOCUMENTATION.txt`.

## Purpose and audience

Write a self-contained technical reference for a developer, maintainer, or project reviewer who needs to understand and run the current WasteWise system. Keep it readable without assuming the reader has already read `PROJECT_CONTRACT.md`. Distinguish current implementation from planned product scope and roadmap items.

## Inspect before writing

Use the current source of truth in the repository, especially:

- `AGENTS.md`, `PROJECT_CONTRACT.md`, and the root/client/server README files.
- Client package manifest, app entry points, API clients, and role workflow screens.
- `server/index.js`, `server/src/app.ts`, feature routers/controllers/services, environment validation, middleware, Prisma schema, and migrations.
- Existing tests and deployment/setup instructions.

Do not invent routes, environment variables, role capabilities, runtime behavior, or deployment settings. Resolve uncertain details from source. If a detail remains uncertain, label it as such or omit it.

## Required sections

1. System name, purpose, audience, and current implementation status.
2. High-level architecture and request/data flow between the Next.js client, Express API, and PostgreSQL/Prisma.
3. Technology stack and repository directory guide.
4. User roles and the principal supported workflows: Recycler, Collector, Facility, and Admin. Describe authorization boundaries based on the implemented code.
5. Core domain data and relationships, using the Prisma schema as authority.
6. API overview: base prefix, route families, important operations, authentication/session behavior, health check, and error/CORS behavior. Prefer concise route-family summaries and do not duplicate every line of the project contract.
7. Configuration and local setup, including required environment variable names only when confirmed by `.env.example` or source. Never include actual secret values.
8. Database migration/seed/admin bootstrap, development and production commands, testing, and deployment notes.
9. Security and operational considerations, including secrets, cookies, role checks, CORS, scheduled server processing, and any documented scaling limitations.
10. Known limitations and roadmap distinction. Make clear that simulator/sensor behavior is simulated if that is still true in code; avoid presenting mock or demo behavior as a real external integration.
11. A short maintenance note identifying which source files should be checked when this document becomes stale.

## Writing constraints

- Output must be plain text suitable for `SYSTEM_DOCUMENTATION.txt`; use simple numbered headings and plain ASCII text.
- Be concise but complete, with copyable commands where useful.
- Keep production and local settings distinct. Clearly identify commands that modify a database or create an Admin account.
- Avoid repeating the entire product contract. Technical accuracy and current implementation take priority over aspirational scope.
- Do not modify application code, environment files, API contracts, or other documentation as part of this task.
- After writing, perform a focused consistency check against the referenced setup files and implementation; report any items that could not be verified.
