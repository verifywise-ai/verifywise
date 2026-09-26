# EvalServer — Python LLM Evaluation Service

> **Last Updated:** 2026-09-23

---

## Multi-Tenancy

Uses `search_path` for queries (unqualified `llm_evals_*` table names). FK references in DDL point to `public.organizations(id)` and `public.users(id)` — NOT `verifywise.*` — because EvalServer starts in parallel with the main server and can't depend on `verifywise` tables existing first.

---

## Migrations (Alembic)

EvalServer uses Alembic (not Sequelize) for migrations. All `llm_evals_*` tables are defined in a single consolidated migration.

```bash
cd src
alembic upgrade head                    # Run migrations
alembic downgrade -1                    # Rollback last
```

### Key Files

| Purpose | Path |
|---------|------|
| Alembic config | `src/alembic.ini` |
| Migration environment | `src/database/migrations/env.py` |
| DDL migration (all 14 tables) | `src/database/migrations/versions/c20260303115117_create_shared_schema_tables.py` |
| Data migration script | `src/scripts/migrate_to_shared_schema.py` |
| Migration config | `src/scripts/migration_config.py` |

### Version Tracking

`verifywise.alembic_version` (NOT `public.alembic_version`). The `env.py` drops `public.alembic_version` on startup for backward compatibility with older EvalServer versions.

### Startup Order (Docker & local)

```bash
alembic upgrade head && uvicorn app:app --host 0.0.0.0 --port 8000 --workers 4
```

Alembic runs ONCE before uvicorn spawns workers. Data migration (`run_data_migration()`) runs per-worker in the startup event but is protected by `pg_advisory_lock(8675309)` so only one worker executes it.

**Always run `alembic upgrade head` before starting the app**, including local/manual setups (`python app.py`, bare `uvicorn`). Docker's `start.sh` already does this.

### Data Migration

`src/scripts/migrate_to_shared_schema.py` migrates `llm_evals_*` data from old tenant schemas. Config in `src/scripts/migration_config.py`. Handles JSONB serialization (`json.dumps` for asyncpg), NOT NULL safety checks, and FK remapping with `IdMapping`.

Both entry points (startup `check_and_run_migration()` and the CLI `migrate_to_shared_schema()`) go through `plan_migration()`:

1. **Status first.** If `evalserver_migration_status` says `completed` and no org is stranded (see 3), return `already_completed` without further checks.
2. **`schema_not_ready`.** If any shared `verifywise.llm_evals_*` table is missing, return `schema_not_ready` and do NOT write the status row, so the migration runs on the next start after `alembic upgrade head`. `migrate_table()` also raises if a target table is missing while the source has rows, so a run can never be recorded `completed` with data left behind.
3. **Stranded-data auto-recovery.** Older builds could record `completed` after copying 0 rows (shared tables missing at the time). When status is `completed` but an org has rows in its legacy tenant schema and **zero rows in every shared `llm_evals_*` table**, the migration is re-run for those orgs only, with a log line naming them. The "shared side empty" condition is what makes the rerun safe: `SERIAL_ID_TABLES` (api_keys, datasets, bias_audit_results) are inserted without `ON CONFLICT` and would duplicate. An org that already has any shared rows is never re-migrated automatically.

---

## Environment

`.env` is at `EvalServer/.env` (NOT `EvalServer/src/.env`). The `database/config.py` loads it via `Path(__file__).parent.parent.parent / ".env"`.

Key variables: `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `LLM_EVALS_PORT`, `ENCRYPTION_KEY`

**AI Gateway (LiteLLM) — cloud LLM calls:** Set `AI_GATEWAY_URL` (default `http://127.0.0.1:8100`) and `AI_GATEWAY_INTERNAL_KEY` to match the Node backend. When the internal key is set, evaluations route provider calls through the gateway’s `/internal/v1/chat/completions` instead of direct vendor SDKs. Provider secrets are read from `verifywise.ai_gateway_api_keys` (same table as AI Gateway Settings).

**Note:** EvalServer may use a different database/port than the main server (e.g., port `5433` vs `5432`).

---

## Key Files

| Purpose | Path |
|---------|------|
| FastAPI entry point | `src/app.py` |
| API routes | `src/routers/` |
| DB config | `src/database/config.py` |
| Tenant middleware | `src/middlewares/` |

---

## References

| When working on... | Read this file |
|---------------------|---------------|
| EvalServer entry & routes | `src/app.py` |
| Database & migrations | `src/database/` |

> All `src/` paths are relative to `EvalServer/`. All `docs/` paths are relative to the repository root.
