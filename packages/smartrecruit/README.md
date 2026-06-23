# @seta/smartrecruit

Domain: SmartRecruit recruitment assistant. It manages job description criteria extraction, semantic CV parsing with YOE duration checks, anti-hallucination email outreach drafting, bulk approvals, and interview calendar scheduling integration.

## Public surface

- `@seta/smartrecruit` — application services (Node)
- `@seta/smartrecruit/events` — event type constants + zod payload schemas
- `@seta/smartrecruit/rbac` — permission constants
- `@seta/smartrecruit/contracts` — browser-safe DTOs + zod schemas
- `@seta/smartrecruit/register` — `ContributionRegistry` hook (Node)

## Running Integration Tests

Integration tests in this module run against a real PostgreSQL database instance. By default, they boot a Postgres container via Testcontainers, which requires a running Docker Desktop (or another container runtime) on your machine.

### Local PostgreSQL Fallback (No Docker)

If you are developing on a local Windows environment without Docker Desktop installed, you can configure the tests to run against a local running PostgreSQL instance (e.g., your local development database) instead of Testcontainers.

To do this, set the `LOCAL_PG_URL` environment variable containing your local Postgres connection details (excluding the database name, which the test setup will generate automatically for template isolation).

#### On Windows (PowerShell):
```powershell
$env:LOCAL_PG_URL="postgresql://postgres:postgres@localhost:5432"
pnpm --filter @seta/smartrecruit test
```

#### On Git Bash / macOS / Linux:
```bash
LOCAL_PG_URL="postgresql://postgres:postgres@localhost:5432" pnpm --filter @seta/smartrecruit test
```

> [!NOTE]
> The database user configured in `LOCAL_PG_URL` must have permissions to create databases and toggle `datistemplate=true` on the database engine.
