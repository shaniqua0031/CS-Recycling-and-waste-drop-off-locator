# Implementation Prompt: Add Server SQL Schema

Create a standalone PostgreSQL schema file at `server/schema.sql` for the WasteWise project.

## Source of truth

- Use `server/prisma/schema.prisma` and the existing initial migration at `server/prisma/migrations/0001_initial/migration.sql` as the authoritative contract.
- The SQL must represent the complete current server data model, not just the MVP facility lookup tables. Do not design new entities or change the Prisma model.
- Preserve PostgreSQL identifiers, enum values, SQL types, nullability, primary keys, unique constraints, indexes, defaults, foreign keys, and `ON DELETE` behavior as represented by the Prisma migration.
- Keep table creation ordered so referenced tables exist before their foreign keys are added.

## Requirements

- Include every enum and table from the initial Prisma migration, along with its indexes and foreign-key constraints.
- Preserve Prisma-managed behavior accurately: do not invent database-side ID generation or `updatedAt` defaults where the migration does not define them.
- Make the file directly usable with PostgreSQL, with no environment-specific credentials or destructive reset commands.
- Keep this change scoped to `server/schema.sql`; do not modify Prisma schema, migrations, application code, or unrelated documentation.

## Validation

- Compare the resulting DDL against `server/prisma/migrations/0001_initial/migration.sql` to ensure the schema is complete and consistent.
- Run an available SQL parser or PostgreSQL validation if one is installed. If no database/parser is available, report that limitation and perform a careful structural comparison.
- Do not run the schema against a configured database or alter database state.

## Completion

Report the created path and the validation performed. Do not commit the change.