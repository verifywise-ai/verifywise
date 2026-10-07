# Seeders

Every seeder in the repo, grouped by purpose. Run all commands from `Servers/`.
Arguments pass through npm with `--`, for example `npm run seed:demo -- --org 1`.

All demo seeders are for local or demo databases only. Never point them at production.

## Demo data (this directory)

| Command                                                    | What it does                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run seed:demo -- --org <id>`                          | Seeds Shadow AI and the full AI Gateway demo (endpoints, 90 days of traffic, guardrails, prompts, Agent Control, gateway risk) into one org. Same code as the UI "Create demo data" button (`autoDriver.driver.ts`), called directly through sequelize.                                                                                                                |
| `npm run seed:demo -- --org <id> --with-use-cases`         | Also seeds the governance set: 3 demo use cases (EU AI Act), risks, vendors, models, dataset, tasks, trainings, policies, AI apps and incidents. It also adds a demo organizational project with ISO 42001. Skipped if the org already has demo (`is_demo`) projects.                                                                                                  |
| `npm run seed:demo:delete -- --org <id>`                   | Removes that org's demo data (`is_demo` rows plus the gateway and Shadow AI rows the seeder created).                                                                                                                                                                                                                                                                  |
| `npm run seed:demo:reset -- --org <id> [--with-use-cases]` | Delete, then seed.                                                                                                                                                                                                                                                                                                                                                     |
| `npm run seed:demo-org`                                    | Creates (or reuses) a dedicated demo org, "Meridian Financial Group (demo)", with an Admin. Logs in over HTTP and runs the autoDriver through `POST /api/autoDrivers`, then layers on NIST AI RMF and ISO 42001 coverage, extra models, team members, agents, AI apps, incidents, LLM Evals, an intake form, dated tasks, notifications and dashboard trend snapshots. |
| `npm run seed:demo-org:reset`                              | Wipes the demo org's seeded data and reseeds it.                                                                                                                                                                                                                                                                                                                       |
| `npm run seed:incidents`                                   | Creates 8 AI incidents through `POST /api/ai-incident-managements` in the org of the user you authenticate as. `-- --json` prints the payloads and writes nothing.                                                                                                                                                                                                     |
| `npm run seed:automation-logs -- --org <id>`               | Adds 30 days of run history (default 15 runs, `--runs <n>`) to each of the org's existing automations. `--clear` removes only the seeded rows.                                                                                                                                                                                                                         |

Safety and idempotency notes:

- `seed:demo`: every part is idempotent, so a second run adds nothing. `--user <id>` must belong to the org. It defaults to the org's first Admin (role 1). The org's own, non-demo projects are never touched. `delete`/`reset` remove _all_ of the org's demo rows, including ones created from the UI button, so only run them on orgs whose demo data you can lose. Change-history rows (`risk_history`, `model_inventory_history`) for deleted demo entities remain.
- `seed:demo-org`: needs the backend running (`API_BASE`, default `http://localhost:3000`). The backend must include the autoDriver framework fix (commit "fix(seeder): create demo data without violating the framework org-level partition", in v2.5.2). Without it, `POST /api/autoDrivers` returns 500. Env: `DEMO_ADMIN_EMAIL` (default `demo-admin@verifywise.local`), `DEMO_ADMIN_PASSWORD` (default `DemoAdmin#1`), `DEMO_ORG_NAME`. It refuses to run if `DEMO_ADMIN_EMAIL` belongs to a user in any other org, so it can't adopt or reset a real org. Plain reruns don't stack rows, but they add audit and change-history entries.
- `seed:incidents`: needs the backend running. Auth comes from env only: `AUTH_TOKEN=<jwt>`, or `SEED_EMAIL` + `SEED_PASSWORD`. `API_BASE_URL` defaults to `http://localhost:3000/api`. Incidents whose description already exists are skipped. They're created as regular (not `is_demo`) incidents, so `seed:demo:delete` does not remove them.
- `seed:automation-logs`: never creates automations. If the org has none, it says so and exits. Seeded rows are tagged `trigger_data.seeded_by = "demo-seed"`. Reruns replace only those, and real run history is left alone.

## Risk-links demo SQL (`scripts/seeds/sql/`)

Plain SQL fixtures for the risk-links / risk-inheritance feature, run with
`psql` against a **scratch local database only**. They target org 1 / user 1
and are idempotent by deleting and re-inserting fixed id ranges.

**Warning:** the clean-slate DELETEs match on id ranges (for example
`evidence_hub` ids 9700-9799) without an `organization_id` filter. On any
database that holds real data they delete whatever rows have those ids, in
any organization. Never run them against a shared, staging or production
database.

Run order matters: `seed_risk_links_demo.sql` defines the base project and
risks the others build on, and it clean-slates rows the later seeds add, so
re-running it means re-running the rest. The coverage seed needs risk 9561,
which only the duplicates seed creates.

| Order | File                                 | What it adds                                                         |
| ----- | ------------------------------------ | -------------------------------------------------------------------- |
| 1     | `seed_risk_links_demo.sql`           | Base demo project, risks, evidence and risk links (features 1-5).    |
| 2     | `seed_risk_duplicates_demo.sql`      | Near-duplicate risks for duplicate detection.                        |
| 3     | `seed_risk_coverage_demo.sql`        | Control-coverage gap data. Needs risk 9561 from the duplicates seed. |
| 4     | `seed_risk_deadlines_demo.sql`       | Deadlines on existing demo risks for the escalation sweep.           |
| 5     | `seed_vendor_questionnaire_demo.sql` | Vendor questionnaire risks.                                          |

```bash
for f in seed_risk_links_demo seed_risk_duplicates_demo seed_risk_coverage_demo \
         seed_risk_deadlines_demo seed_vendor_questionnaire_demo; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/seeds/sql/$f.sql
done
```

## E2E and CI seeders (left in `scripts/` on purpose)

CI and the Playwright suite reference these by path, so don't move or rename them.

| File                                           | Used by                                                                                              | What it does                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `scripts/seedTestData.ts` (`npm run seed:e2e`) | `.github/workflows/e2e-tests.yml` and `zap-api-scan.yml` (as `dist/scripts/seedTestData.js`)         | Test org, test user, and sample vendors, projects and risks.         |
| `scripts/seedE2EAdmin.ts`                      | `Clients/e2e/global.setup.ts`, `Clients/e2e/factories/api.factory.ts`, `scripts/apiContractSmoke.ts` | Deterministic Admin user in an org (`[orgId] --output-file=<path>`). |

## Full database reset

`npm run reset-db` (`scripts/resetDatabase.ts`) **drops every table and enum** in the schema, reruns migrations, creates a default admin, and seeds demo data. It is destructive for the whole database, not one org.

## Reference data (runs with migrations, not demo data)

These ship product data every install needs, and they run with `npx sequelize db:migrate`:

- `database/migrations/*seed*`: framework structures (`20260302111132-seed-framework-struct-data.js`, EU AI Act reseed), risk benchmarks, approval workflows and entity types, governance control mappings, report templates, and the AI Trust Index snapshot.
- `database/seeders/systemReportTemplates.js`: the system report template library, read by its seed migration and its tests.
- `database/seeds/ai-trust-index-snapshot.json`: loaded by the AI Trust Index seed migration. (`database/seeds/plugins/manifests.json` sits alongside it, but no Servers code references it.)
