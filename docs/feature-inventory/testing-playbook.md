# VerifyWise Testing Playbook

A practical, concrete guide for running and writing tests across the VerifyWise frontend, backend, and end-to-end flows.

---

## 1. How to run the test suites

### 1.1 Frontend unit / component tests

Location: `Clients/`

```bash
cd C:\Workspace\verifywise\Clients

# Interactive watch mode (default)
npm test

# CI / single run with coverage
npm run test:ci

# Coverage only
npm run test:coverage

# Run a single test file
npx vitest run src/presentation/pages/Vendors/__tests__/Vendors.test.tsx

# Run tests matching a pattern
npx vitest run -t "creates a vendor"
```

Stack: Vitest, React Testing Library, jsdom, MSW for API mocking.

### 1.2 Frontend E2E tests

Location: `Clients/e2e/`

```bash
cd C:\Workspace\verifywise\Clients

# Run the whole E2E suite (Playwright automatically starts the Vite dev server)
npm run test:e2e

# Run one spec file
npx playwright test e2e/vendors.spec.ts

# Run a specific test by title
npx playwright test -g "CRUD: create and delete vendor"

# Headed / debug mode
npm run test:e2e:headed
npm run test:e2e:debug

# Run only the setup project to refresh auth state
npx playwright test --project=setup

# Use system Chrome instead of the bundled Chromium
set PLAYWRIGHT_USE_SYSTEM_CHROME=1
npx playwright test
```

Stack: Playwright, Axe-core for accessibility checks.

### 1.3 Backend unit / integration tests

Location: `Servers/`

```bash
cd C:\Workspace\verifywise\Servers

# Unit tests only (default npm test)
npm run test:unit

# Unit tests with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Run a single unit test file
npx jest controllers/__tests__/project.ctrl.test.ts

# Integration tests (requires PostgreSQL, uses a dedicated test DB)
npm run test:integration

# Run a single integration test
npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" tests/integration/projects.test.ts --runInBand

# Smoke test (deadline summary endpoint)
npm run test:smoke
```

Stack: Jest, ts-jest, Supertest, `createTestApp` helper.

### 1.4 Coverage

| Suite | Command | Output |
|---|---|---|
| Frontend unit | `npm run test:coverage` | `Clients/coverage/` |
| Frontend E2E | Playwright trace / screenshot on failure | `playwright-report/`, test output |
| Backend unit | `npm run test:coverage` | `Servers/coverage/` |
| Backend integration | Built-in Jest assertions, no coverage by default | console |

---

## 2. Test environment setup

### 2.1 Required services

| Service | Why it is needed | How to start |
|---|---|---|
| PostgreSQL | Main data store for backend and E2E | Local install, Docker, or WSL. Default port `5432`. |
| Redis | Sessions, rate-limit counters, background jobs, real-time notifications | `redis-server` or Docker. Default port `6379`. |
| VerifyWise backend | API for frontend unit mocks, E2E, and integration tests | `cd Servers && npm run build && npm run start` or `npm run watch` |
| VerifyWise frontend | E2E target | Playwright starts `npm run dev:vite` automatically; or run it manually on `http://localhost:5173` |
| AI Gateway (optional) | LLM proxy for AI Gateway, Evals playground, advisor | Start the AIGateway service separately if testing LLM calls |
| EvalServer (optional) | DeepEval/LLM eval execution | Start EvalServer if running eval jobs |

### 2.2 Environment files

**Backend:**
- Copy `Servers/.env.example` to `Servers/.env` and fill it.
- For integration tests, copy `Servers/.env` to `Servers/.env.test` and change `DB_NAME` to a dedicated test database (e.g., `verifywise_test`). The integration guard refuses to run if `DB_NAME` matches the dev database.
- Key variables: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `REDIS_HOST`, `REDIS_PORT`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `MULTI_TENANCY_ENABLED`.

**Frontend E2E:**
- `Clients/.env` is used by Vite.
- Optional overrides via environment:
  - `E2E_EMAIL` / `E2E_PASSWORD` — default super-admin credentials (default: `verifywise@email.com` / `Verifywise#1`).
  - `E2E_BASE_URL` — frontend URL (default: `http://localhost:5173`).
  - `E2E_BACKEND_URL` — backend URL used by setup to create the E2E org (default: `http://localhost:3000`).
  - `PLAYWRIGHT_USE_SYSTEM_CHROME=1` to use local Chrome.

### 2.3 Seed data

**Fresh backend:**
```bash
cd C:\Workspace\verifywise\Servers
npm run build
npx sequelize db:migrate
# Optional dev auto-bootstrap (creates first org + admin)
# Set DEV_AUTO_BOOTSTRAP=true in .env before starting
npm run start
```

**E2E setup (`Clients/e2e/global.setup.ts`):**
1. Logs in as the default super-admin.
2. Creates a new organization via `/api/super-admin/organizations`.
3. Runs `Servers/scripts/seedE2EAdmin.ts` to create an Admin user in that org.
4. Logs in as the Admin and saves two auth states:
   - `e2e/.auth/user.json` — super-admin
   - `e2e/.auth/admin.json` — org Admin

**Integration tests:**
- `tests/integration/globalSetup.js` creates the test DB if missing, builds the backend, and runs migrations.
- Each test uses helpers from `tests/integration/helpers.ts` (`createTestOrganization`, `createTestUser`, `seedFrameworks`, `cleanupDatabase`).

---

## 3. Per-feature testing instructions

### Legend

- **Route(s)** — frontend path(s).
- **Prerequisites** — data/role needed before testing.
- **Manual interaction** — click path and expected outcome.
- **API equivalent** — backend call(s) that power the feature.
- **Automated tests** — existing e2e/unit/integration files.
- **Run just these tests** — exact command.
- **Edge cases** — things to watch.

---

### 3.1 Authentication & onboarding

#### Login / logout

| | |
|---|---|
| **Routes** | `/login`, `/user-reg`, `/forgot-password`, `/reset-password`, `/set-new-password`, `/reset-password-continue`, `/auth/microsoft/callback` |
| **Prerequisites** | Backend running and seeded with at least one user; for SSO, `SSO_ENABLED=true` and valid Azure AD config |
| **Manual interaction** | 1. Open `/login`.<br>2. Fill email and password.<br>3. Click **Sign in**.<br>4. Expect redirect to `/` (org user) or `/super-admin` (bootstrap SuperAdmin).<br>5. Open user menu in sidebar footer → click **Logout** → expect redirect to `/login`. |
| **API equivalent** | `POST /api/users/login` returns `{ token, refreshToken }`. `POST /api/users/logout` clears cookies. |
| **Automated tests** | `Clients/e2e/auth.spec.ts`, `Clients/src/presentation/pages/Authentication/Login/__tests__/Login.test.tsx` |
| **Run** | `npx playwright test e2e/auth.spec.ts` |
| **Edge cases** | Invalid credentials show an alert; SuperAdmin with no `organizationId` is redirected to `/super-admin`; `/register` and `/admin-reg` redirect to `/login`. |

#### First user registration

| | |
|---|---|
| **Route** | `/user-reg` |
| **Prerequisites** | No users exist yet (or registration is allowed) |
| **Manual interaction** | 1. Open `/user-reg`.<br>2. Fill name, surname, email, password, confirm password.<br>3. Click **Get started**.<br>4. Expect validation errors if fields are empty; otherwise success/onboarding. |
| **API equivalent** | `POST /api/users/register` |
| **Automated tests** | `Clients/e2e/auth.spec.ts` |
| **Run** | `npx playwright test e2e/auth.spec.ts -g "registration"` |

#### Password reset

| | |
|---|---|
| **Routes** | `/forgot-password`, `/set-new-password` |
| **Prerequisites** | A user with a valid email exists; mail provider configured if testing real delivery |
| **Manual interaction** | 1. From `/login`, click **Forgot password**.<br>2. Enter email and click **Reset password**.<br>3. Use the one-time link (`/set-new-password?token=...`) to set a new password.<br>4. Login with new password. |
| **API equivalent** | `POST /api/users/forgot-password` (stores token); `POST /api/users/set-new-password` |
| **Automated tests** | `Clients/e2e/auth.spec.ts` |
| **Edge cases** | Token is single-use and expires in 1 hour; non-existent emails return the same success message to avoid user enumeration. |

#### Onboarding / Start Here

| | |
|---|---|
| **Routes** | `/`, `/start-here` |
| **Prerequisites** | Fresh user or incomplete onboarding flag |
| **Manual interaction** | 1. Login for the first time.<br>2. `SetupModal` prompts for organization name.<br>3. Visit `/start-here` to see onboarding progress, shortcuts, and explore carousel. |
| **API equivalent** | `PATCH /api/organizations/:id/onboarding-status` |
| **Automated tests** | `Clients/e2e/onboarding.spec.ts`, `Clients/e2e/start-here.spec.ts` |
| **Run** | `npx playwright test e2e/onboarding.spec.ts e2e/start-here.spec.ts` |

---

### 3.2 Core workspace

#### Integrated Dashboard

| | |
|---|---|
| **Route** | `/` |
| **Prerequisites** | Authenticated user |
| **Manual interaction** | 1. Login.<br>2. Dashboard loads with Operations / Executive toggle.<br>3. Verify stat cards, charts, and task radar render.<br>4. Toggle views and project selector. |
| **API equivalent** | `GET /api/dashboard`, `GET /api/projects`, `GET /api/quantitative-risk/portfolio`, `GET /api/quantitative-risk/trend` |
| **Automated tests** | `Clients/e2e/dashboard.spec.ts`, `Clients/e2e/overview.spec.ts`, `Clients/src/presentation/pages/DashboardOverview/__tests__/IntegratedDashboard.test.tsx` |
| **Run** | `npx playwright test e2e/dashboard.spec.ts` |
| **Edge cases** | Welcome dialog may overlay content; dismiss with **Skip for now** in tests. Hidden AI-agent dashboard tabs are gated by `SHOW_AI_AGENT_DASHBOARD_TABS=false`. |

#### Tasks

| | |
|---|---|
| **Route** | `/tasks` |
| **Prerequisites** | At least one project exists |
| **Manual interaction** | 1. Go to `/tasks`.<br>2. Click **Add new task**.<br>3. Fill title, assignees, due date.<br>4. Submit.<br>5. Verify task appears; test filters and bulk actions. |
| **API equivalent** | `GET /api/tasks`, `POST /api/tasks`, `PUT /api/tasks/:id`, `DELETE /api/tasks/:id`, `GET /api/deadlines/summary` |
| **Automated tests** | `Clients/e2e/tasks.spec.ts`, `Clients/e2e/critical-journey.spec.ts` |
| **Run** | `npx playwright test e2e/tasks.spec.ts` |
| **Edge cases** | Tasks due within the configured window trigger `deadline-warning-banner`; snooze state is stored in `localStorage` under `deadline_snooze_*`. |

#### Settings

| | |
|---|---|
| **Routes** | `/settings`, `/settings/:tab` |
| **Prerequisites** | Authenticated; some tabs require Admin |
| **Manual interaction** | 1. Go to `/settings`.<br>2. Switch tabs: Profile, Password, Preferences, Team, Organization, Features, API Keys, Audit ledger, SSO, Custom fields.<br>3. Admin-only tabs (Team, API Keys, SSO) should be hidden or disabled for non-Admins. |
| **API equivalent** | `GET/PATCH /api/users`, `GET/PATCH /api/organizations`, `GET /api/roles`, `POST /api/api-keys`, `GET /api/audit-ledger`, `GET/PUT /api/sso-config`, `GET/POST/PATCH/DELETE /api/custom-fields` |
| **Automated tests** | `Clients/e2e/settings.spec.ts`, `Clients/src/presentation/pages/SettingsPage/**/*.test.tsx` |
| **Run** | `npx playwright test e2e/settings.spec.ts` |
| **Edge cases** | SSO tab is hidden unless `SSO_ENABLED=true`; AI Approval Rules tab is hidden by `SHOW_AI_APPROVAL_RULES=false`. |

---

### 3.3 Governance — Use cases, frameworks, compliance

#### Use cases (projects)

| | |
|---|---|
| **Routes** | `/overview`, `/project-view?projectId=...` |
| **Prerequisites** | Admin/Editor to create; any authenticated user to view |
| **Manual interaction** | 1. Go to `/overview`.<br>2. Click **New use case**.<br>3. Fill title, goal, owner, AI risk classification, high-risk role, geography.<br>4. Submit and verify row appears.<br>5. Click row to open `/project-view`. |
| **API equivalent** | `GET /api/projects`, `POST /api/projects`, `PATCH /api/projects/:id`, `DELETE /api/projects/:id` |
| **Automated tests** | `Clients/e2e/use-cases.spec.ts`, `Clients/e2e/overview.spec.ts`, `Clients/e2e/project-view.spec.ts`, `Servers/tests/integration/projects.test.ts` |
| **Run** | `npx playwright test e2e/use-cases.spec.ts` |
| **Edge cases** | AI-or-Not screening modal may appear first; dismiss with Skip/No. Many downstream features require a project to exist. |

#### Frameworks

| | |
|---|---|
| **Routes** | `/framework/:tab?`, `/projects/:projectId/framework/:frameworkId` |
| **Prerequisites** | At least one project; frameworks seeded (EU AI Act, ISO 42001, ISO 27001, NIST AI RMF) |
| **Manual interaction** | 1. Go to `/framework`.<br>2. Select a framework tab (Dashboard, Risks, Linked models, Requirements and Controls, Settings).<br>3. Toggle control statuses and assign owners/reviewers.<br>4. Drill down into a project-linked framework. |
| **API equivalent** | `GET /api/frameworks`, `GET /api/frameworks/:id/tree/:projectId`, `PATCH /api/frameworks/:id/impl/:level/:id`, `GET /api/eu-ai-act/*`, `GET /api/iso-27001/*`, `GET /api/iso-42001/*`, `GET /api/nist-ai-rmf/*` |
| **Automated tests** | `Clients/e2e/frameworks.spec.ts`, `Clients/e2e/assessment.spec.ts`, `Clients/e2e/compliance-tracker.spec.ts` |
| **Run** | `npx playwright test e2e/frameworks.spec.ts` |

#### Compliance tracker

| | |
|---|---|
| **Route** | `/framework` and sub-routes |
| **Prerequisites** | Project with frameworks assigned |
| **Manual interaction** | 1. Open framework view.<br>2. Mark subcontrols/clauses as Not started / In progress / Implemented / Not applicable.<br>3. Verify progress cards update. |
| **API equivalent** | `PATCH /api/eu-ai-act/saveControls/:id`, `PATCH /api/eu-ai-act/saveAnswer/:id`, `PATCH /api/iso-27001/saveClauses/:id`, `PATCH /api/iso-42001/saveClauses/:id`, `PATCH /api/nist-ai-rmf/subcategories/:id` |
| **Automated tests** | `Clients/e2e/compliance-tracker.spec.ts` |
| **Run** | `npx playwright test e2e/compliance-tracker.spec.ts` |

---

### 3.4 Inventory

#### Model inventory

| | |
|---|---|
| **Routes** | `/model-inventory`, `/model-inventory/model-risks`, `/model-inventory/evidence-hub`, `/model-inventory/model-risk-management`, `/model-inventory/models/:id` |
| **Prerequisites** | Authenticated user |
| **Manual interaction** | 1. Go to `/model-inventory`.<br>2. Click **Add model**.<br>3. Fill name, version, provider, status.<br>4. Save and verify row appears.<br>5. Click row to open lifecycle detail.<br>6. Test share-link generation from the detail page. |
| **API equivalent** | `GET/POST /api/modelInventory`, `GET/POST /api/modelRisks`, `GET/POST /api/evidenceHub`, `GET/POST /api/mrm/*`, `POST /api/shares` |
| **Automated tests** | `Clients/e2e/model-inventory.spec.ts`, `Servers/controllers/__tests__/modelInventory.ctrl.test.ts` |
| **Run** | `npx playwright test e2e/model-inventory.spec.ts` |
| **Edge cases** | Extension tabs (MLflow, Azure AI Foundry) only appear when enabled. Share links may be disabled by role. |

#### AI apps

| | |
|---|---|
| **Routes** | `/ai-apps`, `/ai-apps/:id` |
| **Prerequisites** | Admin/Editor to create |
| **Manual interaction** | 1. Go to `/ai-apps`.<br>2. Click **Add AI app**.<br>3. Fill name, status, and mapping.<br>4. Save and open detail to verify approval center and model dependencies. |
| **API equivalent** | `GET/POST /api/ai-apps`, `POST /api/ai-apps/:id/models`, `POST /api/ai-apps/:id/policies` |
| **Automated tests** | `Clients/e2e/ai-trust-center.spec.ts` (related coverage), `Clients/src/presentation/pages/AIApps/__tests__/AIApps.test.tsx` |
| **Run** | `npx playwright test e2e/ai-trust-center.spec.ts` |

#### Datasets

| | |
|---|---|
| **Route** | `/datasets` |
| **Prerequisites** | Admin/Editor to create |
| **Manual interaction** | 1. Go to `/datasets`.<br>2. Click **Add dataset**.<br>3. Fill name, version, source.<br>4. Save; verify status cards update. |
| **API equivalent** | `GET/POST /api/datasets` |
| **Automated tests** | `Clients/e2e/datasets.spec.ts`, `Servers/controllers/__tests__/dataset.ctrl.test.ts` |
| **Run** | `npx playwright test e2e/datasets.spec.ts` |
| **Edge cases** | Bulk upload uses the `dataset-bulk-upload` extension (`POST /api/extensions/dataset-bulk-upload/upload`). |

#### Agent discovery

| | |
|---|---|
| **Route** | `/agent-discovery` |
| **Prerequisites** | Admin to create/link |
| **Manual interaction** | 1. Go to `/agent-discovery`.<br>2. Review discovered agents table.<br>3. Use **Link model** or **Review agent** modals. |
| **API equivalent** | `GET/POST /api/agent-primitives`, `PATCH /api/agent-primitives/:id/link-model` |
| **Automated tests** | `Clients/e2e/agent-discovery.spec.ts`, `Servers/controllers/__tests__/aiApp.ctrl.test.ts` |
| **Run** | `npx playwright test e2e/agent-discovery.spec.ts` |

---

### 3.5 Assurance

#### Risk management

| | |
|---|---|
| **Route** | `/risk-management` |
| **Prerequisites** | At least one project |
| **Manual interaction** | 1. Go to `/risk-management`.<br>2. Click **Add new risk**.<br>3. Fill risk name, owner, category, impact, likelihood.<br>4. Save and verify heatmap/timeline update.<br>5. Toggle quantitative assessment mode. |
| **API equivalent** | `GET/POST /api/projectRisks`, `GET/POST /api/vendorRisks`, `GET/POST /api/modelRisks`, `GET/POST /api/quantitative-risk/*` |
| **Automated tests** | `Clients/e2e/risk-management.spec.ts`, `Servers/controllers/__tests__/risks.ctrl.test.ts`, `Servers/controllers/__tests__/risks.bulk.ctrl.test.ts` |
| **Run** | `npx playwright test e2e/risk-management.spec.ts` |
| **Edge cases** | Risk creation requires `projects` array in payload; bulk update is at `PATCH /api/projectRisks/bulk`. |

#### Training registry

| | |
|---|---|
| **Routes** | `/training`, `/training/evidence-hub` |
| **Prerequisites** | Admin/Editor to create |
| **Manual interaction** | 1. Go to `/training`.<br>2. Click **Add training**.<br>3. Fill title, trainer, dates, attendees.<br>4. Save and switch to Evidence hub tab. |
| **API equivalent** | `GET/POST /api/training`, `GET/POST /api/evidenceHub`, `GET/POST /api/files` |
| **Automated tests** | `Clients/e2e/training.spec.ts` |
| **Run** | `npx playwright test e2e/training.spec.ts` |

#### Evidence / File manager

| | |
|---|---|
| **Route** | `/file-manager` |
| **Prerequisites** | Admin/Reviewer/Editor to upload |
| **Manual interaction** | 1. Go to `/file-manager`.<br>2. Create a folder.<br>3. Upload a file via drag/drop or upload modal.<br>4. Open file preview and version history.<br>5. Update metadata. |
| **API equivalent** | `POST /api/file-manager`, `GET /api/file-manager`, `GET /api/file-manager/:id/preview`, `GET /api/file-manager/:id/versions`, `PATCH /api/file-manager/:id/metadata` |
| **Automated tests** | `Clients/e2e/file-manager.spec.ts`, `Servers/controllers/__tests__/fileManager.ctrl.test.ts` |
| **Run** | `npx playwright test e2e/file-manager.spec.ts` |

#### Reporting

| | |
|---|---|
| **Route** | `/reporting` |
| **Prerequisites** | Admin to generate reports |
| **Manual interaction** | 1. Go to `/reporting`.<br>2. Click **Generate report**.<br>3. Select sections.<br>4. Submit and wait for report run.<br>5. Download from the report table. |
| **API equivalent** | `GET /api/reporting/sections`, `POST /api/reporting/generate-report`, `GET /api/reporting/runs/:id/download`, `GET /api/reporting/scheduled-reports` |
| **Automated tests** | `Clients/e2e/reporting.spec.ts`, `Servers/controllers/__tests__/reporting.ctrl.test.ts`, `Servers/services/reporting/__tests__/*.test.ts` |
| **Run** | `npx playwright test e2e/reporting.spec.ts` |
| **Edge cases** | Report runs are async; tests should wait for run status or use API polling. |

#### AI Trust Center

| | |
|---|---|
| **Routes** | `/ai-trust-center`, `/ai-trust-center/:tab` |
| **Prerequisites** | Authenticated user; Settings tab requires Admin |
| **Manual interaction** | 1. Go to `/ai-trust-center`.<br>2. Review Overview, Resources, Subprocessors tabs.<br>3. Admin: go to Settings to configure public page, logo, and subprocessors. |
| **API equivalent** | `GET/POST/PUT/DELETE /api/aiTrustCentre/overview`, `/api/aiTrustCentre/resources`, `/api/aiTrustCentre/subprocessors`, `/api/aiTrustCentre/logo` |
| **Automated tests** | `Clients/e2e/ai-trust-center.spec.ts`, `Servers/controllers/__tests__/aiTrustCentre.ctrl.test.ts` |
| **Run** | `npx playwright test e2e/ai-trust-center.spec.ts` |

---

### 3.6 Governance

#### Vendors

| | |
|---|---|
| **Routes** | `/vendors`, `/vendors/risks` |
| **Prerequisites** | At least one project exists |
| **Manual interaction** | 1. Go to `/vendors`.<br>2. Click **Add new vendor**.<br>3. Fill name, select project, status.<br>4. Save and verify row appears.<br>5. Switch to **Risks** tab and add a vendor risk. |
| **API equivalent** | `GET/POST /api/vendors`, `GET/POST /api/vendorRisks`, `GET /api/projects` |
| **Automated tests** | `Clients/e2e/vendors.spec.ts`, `Servers/tests/integration/vendors.test.ts`, `Servers/controllers/__tests__/vendor.ctrl.test.ts` |
| **Run** | `npx playwright test e2e/vendors.spec.ts` |
| **Edge cases** | The **Add new vendor** button is disabled until a project exists. |

#### Policy manager

| | |
|---|---|
| **Routes** | `/policies`, `/policies/templates`, `/policies/new`, `/policies/:id/edit` |
| **Prerequisites** | Admin/Editor to create/edit |
| **Manual interaction** | 1. Go to `/policies`.<br>2. Click **New policy**.<br>3. Fill title, status, rich-text body.<br>4. Use AI editor menu if enabled.<br>5. Save and request review/approve.<br>6. Switch to Templates tab. |
| **API equivalent** | `GET/POST/PUT/DELETE /api/policies`, `POST /api/policies/:id/review/request`, `PUT /api/policies/:id/review/approve`, `GET /api/policy-templates` |
| **Automated tests** | `Clients/e2e/policies.spec.ts`, `Clients/e2e/policy-editor.spec.ts` |
| **Run** | `npx playwright test e2e/policies.spec.ts e2e/policy-editor.spec.ts` |

#### Incident management

| | |
|---|---|
| **Route** | `/ai-incident-managements` |
| **Prerequisites** | Admin/Editor to create |
| **Manual interaction** | 1. Go to `/ai-incident-managements`.<br>2. Click **Add incident**.<br>3. Fill title, severity, status, linked entities.<br>4. Save; test archive action. |
| **API equivalent** | `GET/POST /api/ai-incident-managements`, `PATCH /api/ai-incident-managements/:id/archive` |
| **Automated tests** | `Clients/e2e/incidents.spec.ts` |
| **Run** | `npx playwright test e2e/incidents.spec.ts` |

#### Event tracker (WatchTower)

| | |
|---|---|
| **Routes** | `/event-tracker`, `/event-tracker/logs` |
| **Prerequisites** | Authenticated user |
| **Manual interaction** | 1. Go to `/event-tracker`.<br>2. View audit/event table.<br>3. Apply filters and export. |
| **API equivalent** | `GET /api/events`, `GET /api/audit-logs`, `GET /api/logger/events`, `GET /api/logger/logs` |
| **Automated tests** | `Clients/e2e/event-tracker.spec.ts` |
| **Run** | `npx playwright test e2e/event-tracker.spec.ts` |

---

### 3.7 AI Product

#### Approval workflows

| | |
|---|---|
| **Route** | `/approval-workflows` |
| **Prerequisites** | Admin to create workflows |
| **Manual interaction** | 1. Go to `/approval-workflows`.<br>2. Click **Add workflow**.<br>3. Define steps and approvers.<br>4. Save and submit a request. |
| **API equivalent** | `GET/POST /api/approval-workflows`, `GET/POST /api/approval-requests` |
| **Automated tests** | `Clients/e2e/approval-workflows.spec.ts`, `Servers/tests/integration/approval-workflows.test.ts` |
| **Run** | `npx playwright test e2e/approval-workflows.spec.ts` |

#### Automations

| | |
|---|---|
| **Route** | `/automations` |
| **Prerequisites** | Admin/Editor |
| **Manual interaction** | 1. Go to `/automations`.<br>2. Create automation, pick trigger and action.<br>3. Save and view history. |
| **API equivalent** | `GET/POST /api/automations`, `GET /api/automations/:id/history` |
| **Automated tests** | `Clients/e2e/automations.spec.ts` |
| **Run** | `npx playwright test e2e/automations.spec.ts` |

#### Post-market monitoring

| | |
|---|---|
| **Routes** | `/monitoring/cycle/:cycleId`, `/monitoring/reports` |
| **Prerequisites** | Project with active monitoring cycle |
| **Manual interaction** | 1. Navigate to an active cycle.<br>2. Fill responses and submit.<br>3. View reports archive. |
| **API equivalent** | `GET/POST /api/pmm/*` |
| **Automated tests** | `Clients/e2e/post-market-monitoring.spec.ts` |
| **Run** | `npx playwright test e2e/post-market-monitoring.spec.ts` |

#### Intake forms

| | |
|---|---|
| **Routes** | `/intake-forms`, `/intake-forms/submissions`, `/intake-forms/:formId/edit` |
| **Prerequisites** | Admin/Editor to build forms |
| **Manual interaction** | 1. Go to `/intake-forms`.<br>2. Click **Create form**.<br>3. Drag/drop fields, set validation.<br>4. Save and copy public link.<br>5. Visit public link in an incognito window and submit. |
| **API equivalent** | `GET/POST /api/intake/forms`, `GET/POST /api/intake/public/:tenantSlug/:formSlug`, `POST /api/intake/public/by-id/:publicId` |
| **Automated tests** | `Clients/e2e/intake-forms.spec.ts`, `Clients/e2e/public-intake-form.spec.ts` |
| **Run** | `npx playwright test e2e/intake-forms.spec.ts e2e/public-intake-form.spec.ts` |
| **Edge cases** | Public form has a math captcha; success page is at `/:publicId/use-case-form-intake/success`. |

---

### 3.8 LLM Evals

| | |
|---|---|
| **Routes** | `/evals`, `/evals/:projectId`, `/evals/:projectId/datasets/editor`, `/evals/settings` |
| **Prerequisites** | DeepEval project; AI Gateway + API key for playground/arena |
| **Manual interaction** | 1. Open app switcher → **LLM Evals**.<br>2. Select a project.<br>3. Create a dataset, run an experiment, or open Playground.<br>4. Run a bias audit or arena comparison. |
| **API equivalent** | `GET/POST /api/deepeval/projects`, `/api/deepeval/experiments`, `/api/deepeval/datasets`, `/api/deepeval/scorers`, `/api/deepeval/models`, `/api/deepeval/bias-audits`, `/api/deepeval/arena`, `/api/deepeval/reports` |
| **Automated tests** | `Clients/e2e/evals-dashboard.spec.ts`, `Servers/routes/__tests__/deepEvalRoutes.test.ts` |
| **Run** | `npx playwright test e2e/evals-dashboard.spec.ts` |
| **Edge cases** | Playground needs a provider API key configured in AI Gateway settings; without one it shows a setup-required empty state. |

---

### 3.9 AI Detection

| | |
|---|---|
| **Routes** | `/ai-detection/scan`, `/ai-detection/repositories`, `/ai-detection/history`, `/ai-detection/scans/:scanId`, `/ai-detection/settings` |
| **Prerequisites** | GitHub token or other provider configured |
| **Manual interaction** | 1. Go to `/ai-detection/scan`.<br>2. Select provider and repository.<br>3. Start scan and wait for progress.<br>4. Open a finished scan from history and review findings. |
| **API equivalent** | `POST /api/ai-detection/scans`, `GET /api/ai-detection/scans/:scanId`, `GET /api/ai-detection/scans/:scanId/findings`, `GET/POST /api/ai-detection/repositories` |
| **Automated tests** | `Clients/e2e/ai-detection.spec.ts` |
| **Run** | `npx playwright test e2e/ai-detection.spec.ts` |
| **Edge cases** | Scans can be long-running; tests may need to mock or wait for status updates. |

---

### 3.10 Shadow AI

| | |
|---|---|
| **Routes** | `/shadow-ai/insights`, `/shadow-ai/user-activity`, `/shadow-ai/tools`, `/shadow-ai/rules`, `/shadow-ai/settings` |
| **Prerequisites** | Shadow AI data ingested (via syslog or API) |
| **Manual interaction** | 1. Open app switcher → **Shadow AI**.<br>2. Review Insights dashboard.<br>3. Browse AI tools and approve/block.<br>4. Create rules and view alerts. |
| **API equivalent** | `GET /api/shadow-ai/insights/*`, `GET/PATCH /api/shadow-ai/tools`, `GET/POST /api/shadow-ai/rules`, `POST /api/v1/shadow-ai/events` (ingestion) |
| **Automated tests** | `Clients/e2e/shadow-ai.spec.ts`, `Servers/controllers/__tests__/shadowAi.ctrl.test.ts` |
| **Run** | `npx playwright test e2e/shadow-ai.spec.ts` |

---

### 3.11 AI Gateway

| | |
|---|---|
| **Routes** | `/ai-gateway/dashboard`, `/ai-gateway/endpoints`, `/ai-gateway/playground`, `/ai-gateway/guardrails/:tab`, `/ai-gateway/models/:tab`, `/ai-gateway/logs`, `/ai-gateway/prompts`, `/ai-gateway/virtual-keys`, `/ai-gateway/settings/:tab`, plus MCP sub-routes |
| **Prerequisites** | AI Gateway service running; provider API keys for real LLM calls |
| **Manual interaction** | 1. Open app switcher → **AI Gateway**.<br>2. Create an endpoint.<br>3. Configure guardrails.<br>4. Open Playground and send a chat message.<br>5. Review logs and virtual keys. |
| **API equivalent** | `GET/POST /api/ai-gateway/*`, `/api/ai-gateway/mcp/*` |
| **Automated tests** | `Clients/e2e/ai-gateway.spec.ts` |
| **Run** | `npx playwright test e2e/ai-gateway.spec.ts` |
| **Edge cases** | Prompts sub-page is hidden when `SHOW_AI_GATEWAY_PROMPTS=false`. MCP pages depend on agent-control feature availability. |

---

### 3.12 AI Trust Index

| | |
|---|---|
| **Routes** | `/ai-trust-index`, `/ai-trust-index/browse`, `/ai-trust-index/tracked`, `/ai-trust-index/settings`, `/ai-trust-index/:slug` |
| **Prerequisites** | Authenticated; Settings requires Admin |
| **Manual interaction** | 1. Open app switcher → **AI Trust Index**.<br>2. Browse apps and view score breakdown.<br>3. Track an app.<br>4. Review tracked apps list. |
| **API equivalent** | `GET /api/ai-trust-index/apps`, `GET/POST/DELETE /api/ai-trust-index/tracked`, `GET/PUT /api/ai-trust-index/settings` |
| **Automated tests** | `Clients/src/presentation/pages/AITrustIndex/**/*.test.tsx`, `Servers/controllers/__tests__/aiTrustIndex.ctrl.test.ts` |
| **Run** | `npx vitest run src/presentation/pages/AITrustIndex` |

---

### 3.13 Super Admin

| | |
|---|---|
| **Routes** | `/super-admin`, `/super-admin/users`, `/super-admin/organizations/:id/users`, `/super-admin/settings/:tab` |
| **Prerequisites** | SuperAdmin account |
| **Manual interaction** | 1. Login as SuperAdmin.<br>2. App switcher shows **Super Admin**.<br>3. Create/edit organizations.<br>4. View all users, filter by org/role.<br>5. Invite users to an org. |
| **API equivalent** | `GET/POST/DELETE/PATCH /api/super-admin/organizations`, `GET /api/super-admin/users`, `POST /api/super-admin/organizations/:id/invite` |
| **Automated tests** | `Clients/e2e/super-admin.spec.ts`, `Servers/controllers/__tests__/organization.ctrl.test.ts`, `Servers/controllers/__tests__/user.ctrl.test.ts` |
| **Run** | `npx playwright test e2e/super-admin.spec.ts` |
| **Edge cases** | Non-SuperAdmins are redirected away from `/super-admin`. Bootstrap SuperAdmin (no org) is pinned to `/super-admin`. |

---

## 4. Auth / role testing patterns

### 4.1 Role model

The backend recognizes four tenant roles plus SuperAdmin:

| Role | Capabilities |
|---|---|
| **Admin** | Full tenant management: users, settings, delete operations, API keys, SSO, extensions. |
| **Editor** | Create/edit most entities (projects, vendors, risks, models, policies, reports). Cannot manage tenant settings or delete some high-privilege items. |
| **Reviewer** | Review evidence, policies, tasks; upload files. Limited write scope. |
| **Auditor** | Read-only access to most governance data. |
| **SuperAdmin** | Cross-tenant: manage organizations and all users. Role/organization IDs are `NULL` in DB. |

### 4.2 How to test each role

#### E2E

The Playwright setup only seeds Admin and SuperAdmin. To test Editor/Reviewer/Auditor:

1. Create a user with the desired role via API or Super Admin UI.
2. Save a new storage state for that role using a custom setup script.
3. Reference it in `playwright.config.ts` as a new project:

```ts
{
  name: "editor",
  testMatch: /editor-flows\.spec\.ts/,
  dependencies: ["setup"],
  use: {
    ...devices["Desktop Chrome"],
    storageState: "e2e/.auth/editor.json",
  },
}
```

#### API integration

Use `createTestUser` with the correct `role_id`:

```ts
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

describe("Editor permissions", () => {
  let orgId: number;
  let editorId: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    editorId = await createTestUser(orgId, 2, "editor@test.com", "Pass123!"); // role_id 2 = Editor
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("allows Editor to create a project", async () => {
    const app = createTestApp();
    const login = await testRequest(app)
      .post("/api/users/login")
      .send({ email: "editor@test.com", password: "Pass123!" });
    const token = login.body.data.token;

    const res = await testRequest(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ project_title: "Editor project", owner: editorId, start_date: "2024-06-01", geography: 1, framework: [], members: [] });

    expect(res.status).toBe(201);
  });
});
```

Role IDs used in helpers (verify in your seeders):
- `1` — Admin
- `2` — Editor
- `3` — Reviewer
- `4` — Auditor

#### Middleware unit tests

Test role guards directly:

```ts
authorize(["Admin", "Editor"])(req, res, next);
expect(next).toHaveBeenCalled();
```

See `Servers/middleware/__tests__/accessControl.middleware.test.ts`.

### 4.3 Common auth assertions

| Check | How |
|---|---|
| Unauthenticated | Call without `Authorization` header → expect `401`. |
| Wrong role | Authenticate as Auditor, call Admin-only endpoint → expect `403`. |
| Cross-tenant | Create resource in org A, read with org B token → expect `404` or `403`. |
| SuperAdmin only | Call `/api/super-admin/*` with tenant Admin token → expect `403`. |
| Self-only | User A tries `PATCH /api/users/:b` → expect `403` (unless Admin/SuperAdmin). |

---

## 5. Public / shared link testing

### 5.1 Public AI Trust Centre

| | |
|---|---|
| **Route** | `/aiTrustCentre/:hash` |
| **Prerequisites** | Org admin configures AI Trust Center and copies public link |
| **Manual interaction** | 1. As Admin, go to `/ai-trust-center` → Settings.<br>2. Enable public page and copy link.<br>3. Open link in incognito window.<br>4. Verify Overview, Resources, Subprocessors tabs render without login. |
| **API equivalent** | `GET /api/aiTrustCentre/:hash` (special/public) |
| **Automated tests** | `Clients/e2e/ai-trust-center.spec.ts` (covers config), `Servers/controllers/__tests__/aiTrustCentre.ctrl.test.ts` |
| **Run** | `npx playwright test e2e/ai-trust-center.spec.ts` |
| **Edge cases** | Expired or invalid hash should render a not-found / unavailable message. |

### 5.2 Shared views

| | |
|---|---|
| **Route** | `/shared/:resourceType/:token` |
| **Prerequisites** | A shareable resource exists (e.g., model inventory, vendor, risk table) |
| **Manual interaction** | 1. Open a model detail page.<br>2. Click **Share**.<br>3. Toggle sharing on and copy link.<br>4. Open link in incognito window.<br>5. Verify read-only table renders and respects export/open-record settings. |
| **API equivalent** | `POST /api/shares`, `GET /api/shares/view/:token`, `GET /api/shares/token/:token` |
| **Automated tests** | `Clients/e2e/model-inventory.spec.ts` (Share Links section), `docs/user-guide-audit/ai-governance/share-links.md` |
| **Run** | `npx playwright test e2e/model-inventory.spec.ts -g "Share Links"` |
| **Edge cases** | Revoked/deleted share links should return 404; disabled export buttons should not allow downloads. |

### 5.3 Public intake forms

| | |
|---|---|
| **Routes** | `/:publicId/use-case-form-intake`, `/:publicId/use-case-form-intake/success`, legacy `/intake/:tenantSlug/:formSlug` |
| **Prerequisites** | Admin/Editor created and published an intake form |
| **Manual interaction** | 1. As Admin, go to `/intake-forms`.<br>2. Create a form and copy public URL.<br>3. Open URL in incognito window.<br>4. Fill required fields and math captcha.<br>5. Submit → redirect to success page.<br>6. As Admin, review submission under `/intake-forms/submissions`. |
| **API equivalent** | `GET /api/intake/public/by-id/:publicId`, `POST /api/intake/public/by-id/:publicId`, `GET/POST /api/intake/public/:tenantSlug/:formSlug` |
| **Automated tests** | `Clients/e2e/public-intake-form.spec.ts`, `Clients/e2e/intake-forms.spec.ts` |
| **Run** | `npx playwright test e2e/public-intake-form.spec.ts` |
| **Edge cases** | Empty required fields show validation errors; wrong captcha blocks submission; legacy and new URL formats should both work. |

---

## 6. Tenant isolation smoke tests

### 6.1 What to verify

When `MULTI_TENANCY_ENABLED=true` (and optionally `RLS_ENFORCEMENT_ENABLED=true`):

1. Users in org A cannot see resources from org B.
2. `organization_id` on create is stamped from the JWT, not from request body.
3. SuperAdmin can access cross-tenant data only through SuperAdmin routes.
4. Shared/public links do not leak cross-tenant data.

### 6.2 Run the backend isolation suite

```bash
cd C:\Workspace\verifywise\Servers
npm run test:integration -- tests/integration/tenant-isolation/
```

### 6.3 Quick manual curl smoke test

```bash
# 1. Create two orgs and two users (use integration helpers or seed scripts)
# 2. Login as user from org A
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"org-a@example.com","password":"Pass123!"}'

# 3. Create a project in org A
curl -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer <org-a-token>" \
  -H "Content-Type: application/json" \
  -d '{"project_title":"Org A Project","owner":1,"start_date":"2024-06-01","geography":1,"framework":[],"members":[]}'

# 4. Login as user from org B
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"org-b@example.com","password":"Pass123!"}'

# 5. List projects as org B — should NOT include Org A Project
curl http://localhost:3000/api/projects \
  -H "Authorization: Bearer <org-b-token>"

# 6. Try to update org A's project with org B's token — should fail
curl -X PATCH http://localhost:3000/api/projects/<org-a-project-id> \
  -H "Authorization: Bearer <org-b-token>" \
  -H "Content-Type: application/json" \
  -d '{"project_title":"Hacked"}'
```

### 6.4 Representative isolation tests

| Domain | Test file |
|---|---|
| Projects | `Servers/tests/integration/tenant-isolation/projects.isolation.test.ts` |
| Vendors | `Servers/tests/integration/tenant-isolation/vendors.isolation.test.ts` |
| Risks | `Servers/tests/integration/tenant-isolation/risks.isolation.test.ts` |
| Tasks | `Servers/tests/integration/tenant-isolation/tasks.isolation.test.ts` |
| Files | `Servers/tests/integration/tenant-isolation/files.isolation.test.ts` |
| Evidence hub | `Servers/tests/integration/tenant-isolation/evidence-hub.isolation.test.ts` |
| MRM | `Servers/tests/integration/tenant-isolation/mrm-*.isolation.test.ts` |

### 6.5 RLS Phase 2

If `RLS_ENFORCEMENT_ENABLED=true`, every authenticated request runs inside a transaction with `SET LOCAL app.current_org = :orgId`. Smoke test:

1. Enable the flag.
2. Run the tenant-isolation suite.
3. Check PostgreSQL logs that RLS policies are applied.
4. Verify that direct SQL queries outside the app (using owner role) still see all rows, but app-role queries are scoped.

---

## 7. Troubleshooting common issues

### 7.1 Flakiness

| Symptom | Cause | Fix |
|---|---|---|
| E2E fails because element not found | Lazy-loaded route or slow network | Increase timeout, wait for `networkidle`, or use `page.waitForResponse`. |
| Welcome dialog blocks interactions | Onboarding modal | Dismiss with `page.getByRole("button", { name: /skip for now/i }).click()`. |
| Project dropdown has no options | Fixture created project but UI not refreshed | Reload page or wait for `page.waitForResponse(/api/projects/)`. |
| Date picker day cell not clickable | MUI popper animation | Wait for `.MuiPickerPopper-root` visible state before clicking. |
| Backend integration test deadlocks | `cleanupDatabase` contention | Helpers already retry 3× on deadlock; avoid parallel tests (`--runInBand`). |

### 7.2 Timeouts

- Playwright default timeout: `60_000` ms per test.
- Increase for slow operations:
  ```ts
  test.setTimeout(120_000);
  ```
- Backend integration: `jest.setTimeout(60000)` in slow suites.
- AI Gateway / Evals calls may need `AbortSignal.timeout(120_000)`.

### 7.3 CSRF

The backend uses double-submit cookie CSRF protection (`csrf.middleware`).

- Frontend automatically reads `XSRF-TOKEN` cookie and sends `X-XSRF-TOKEN` header via Axios interceptors.
- In raw `curl`/`fetch`, you must:
  1. Make a GET request to obtain the cookie.
  2. Read the cookie value.
  3. Send it back as `X-XSRF-TOKEN` header for state-changing requests.

Example:

```bash
# 1. Get CSRF cookie
curl -c cookies.txt http://localhost:3000/api/users/login

# 2. Extract token and login
CSRF=$(grep XSRF-TOKEN cookies.txt | awk '{print $7}')
curl -X POST http://localhost:3000/api/users/login \
  -b cookies.txt -c cookies.txt \
  -H "X-XSRF-TOKEN: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@local.dev","password":"Admin123!"}'
```

### 7.4 Token refresh

- Access tokens expire; refresh tokens are stored in `httpOnly` cookies.
- Frontend Redux auth slice handles `401` responses and calls `POST /api/users/refresh-token`.
- E2E tests reuse `storageState`, so refresh is rarely exercised.
- To test refresh manually:
  1. Login.
  2. Wait for access token expiry (or tamper with it).
  3. Make an authenticated request.
  4. Verify the app calls `/api/users/refresh-token` and retries.

### 7.5 Database guard errors

```
Refusing to run: .env.test sets DB_NAME="verifywise", the same database as Servers/.env.
```

Fix: set `DB_NAME=verifywise_test` in `Servers/.env.test`.

### 7.6 Auth state stale

If E2E fails with redirect to `/login`:

1. Delete `Clients/e2e/.auth/user.json` and `admin.json`.
2. Re-run setup: `npx playwright test --project=setup`.
3. Ensure backend is running and `E2E_EMAIL`/`E2E_PASSWORD` are correct.

### 7.7 Missing seeded data

If specs skip because no model/vendor/project exists:

- For model/vendor tests: run specs that use `project.fixture.ts` first, or manually create a project.
- For public intake tests: create and publish an intake form, then re-run.

### 7.8 AI service unavailable

If AI Gateway / Evals / Advisor tests fail:

- Check `AI_GATEWAY_URL` and `AI_GATEWAY_KEY` in backend `.env`.
- Verify provider API keys in Settings → API Keys.
- Many UI tests gracefully degrade to empty/setup-required states.

---

## Quick reference cheat sheet

```bash
# Full local verification
cd Servers && npm run test:unit && npm run test:integration
cd Clients && npm run test:ci && npm run test:e2e

# One spec each
npx playwright test e2e/vendors.spec.ts
npx jest controllers/__tests__/project.ctrl.test.ts
npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" tests/integration/projects.test.ts --runInBand

# Debug
npm run test:e2e:debug
npm run test:watch
```

---

*Last generated: 2026-08-24. Keep this document updated when route tables, feature flags, or seed scripts change.*
