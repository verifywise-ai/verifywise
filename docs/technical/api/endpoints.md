# API Endpoints

## Overview

VerifyWise exposes a REST API at `http://localhost:3000/api/`. All routes use JWT authentication via `authenticateJWT` middleware unless otherwise specified. The API is organized by domain with consistent patterns for CRUD operations.

## Authentication

### JWT Authentication

All protected routes require a valid JWT token in the Authorization header:

```
Authorization: Bearer <access_token>
```

Tokens are obtained via `/api/users/login` and refreshed via `/api/users/refresh-token`.

### Rate Limiting

| Endpoint | Limit |
|----------|-------|
| Login | 5 req/min per IP |
| Password reset | 5 req/min per IP |
| Invite | 5 req/min per IP |
| AI Detection scans | 30 req/15 min |
| Webhook creation | 10 req/hour |
| Plugin installation | 20 req/hour per IP |
| File operations | Configured limit |

### Roles

| Role | ID | Description |
|------|-----|-------------|
| Admin | 1 | Full access |
| Reviewer | 2 | Review permissions |
| Editor | 3 | Edit permissions |
| Auditor | 4 | Read-only audit access |

---

## Authentication & Users

**Base Path:** `/api/users`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/login` | User login | None |
| POST | `/register` | Register new user | None |
| POST | `/refresh-token` | Refresh access token | None |
| POST | `/reset-password` | Reset password | None |
| GET | `/` | Get all users in org | JWT |
| GET | `/:id` | Get user by ID | JWT |
| GET | `/:id/profile-photo` | Get profile photo | JWT |
| GET | `/:id/calculate-progress` | Get user progress | JWT |
| GET | `/check/exists` | Check if users exist | JWT |
| POST | `/:id/profile-photo` | Upload profile photo | JWT |
| PATCH | `/:id` | Update user | JWT |
| PATCH | `/chng-pass/:id` | Change password | JWT |
| DELETE | `/:id` | Delete user | JWT |
| DELETE | `/:id/profile-photo` | Delete profile photo | JWT |

---

## Organizations

**Base Path:** `/api/organizations`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/exists` | Check if orgs exist | None |
| GET | `/:id` | Get organization | JWT |
| POST | `/` | Create organization | None |
| PATCH | `/:id` | Update organization | JWT |
| PATCH | `/:id/onboarding-status` | Complete onboarding | JWT |

---

## Projects

**Base Path:** `/api/projects`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get all projects | JWT |
| GET | `/:id` | Get project by ID | JWT |
| GET | `/stats/:id` | Get project statistics | JWT |
| GET | `/complainces/:projid` | Get project compliances | JWT |
| GET | `/compliance/progress/:id` | Get compliance progress | JWT |
| GET | `/assessment/progress/:id` | Get assessment progress | JWT |
| GET | `/all/compliance/progress` | All projects compliance | JWT |
| GET | `/all/assessment/progress` | All projects assessment | JWT |
| GET | `/calculateProjectRisks/:id` | Calculate project risks | JWT |
| GET | `/calculateVendorRisks/:id` | Calculate vendor risks | JWT |
| POST | `/` | Create project | JWT |
| PATCH | `/:id` | Update project | JWT |
| PATCH | `/:id/status` | Update project status | JWT |
| DELETE | `/:id` | Delete project | JWT |

---

## Project Risks

**Base Path:** `/api/projectRisks`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get all risks | JWT |
| GET | `/:id` | Get risk by ID | JWT |
| GET | `/by-projid/:id` | Get risks by project | JWT |
| GET | `/by-frameworkid/:id` | Get risks by framework | JWT |
| POST | `/` | Create risk | JWT |
| PUT | `/:id` | Update risk | JWT |
| DELETE | `/:id` | Delete risk | JWT |

---

## Vendors

**Base Path:** `/api/vendors`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get all vendors | JWT |
| GET | `/:id` | Get vendor by ID | JWT |
| GET | `/project-id/:id` | Get vendors by project | JWT |
| POST | `/` | Create vendor | JWT |
| PATCH | `/:id` | Update vendor | JWT |
| DELETE | `/:id` | Delete vendor | JWT |

---

## Vendor Risks

**Base Path:** `/api/vendorRisks`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get vendor risks by project | JWT |
| GET | `/:id` | Get vendor risk by ID | JWT |
| GET | `/by-projid/:id` | Get by project ID | JWT |
| GET | `/by-vendorid/:id` | Get by vendor ID | JWT |
| GET | `/all` | Get all vendor risks | JWT |
| POST | `/` | Create vendor risk | JWT |
| PATCH | `/:id` | Update vendor risk | JWT |
| DELETE | `/:id` | Delete vendor risk | JWT |

---

## Model Inventory

**Base Path:** `/api/modelInventory`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get all models | JWT |
| GET | `/:id` | Get model by ID | JWT |
| GET | `/by-projectId/:projectId` | Get by project | JWT |
| GET | `/by-frameworkId/:frameworkId` | Get by framework | JWT |
| POST | `/` | Create model | JWT |
| PATCH | `/:id` | Update model | JWT |
| DELETE | `/:id` | Delete model | JWT |

---

## Model Risks

**Base Path:** `/api/modelRisks`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get all model risks | JWT |
| GET | `/:id` | Get model risk by ID | JWT |
| POST | `/` | Create model risk | JWT |
| PUT | `/:id` | Update model risk | JWT |
| DELETE | `/:id` | Delete model risk | JWT |

---

## Controls

**Base Path:** `/api/controls`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get all controls | JWT |
| GET | `/:id` | Get control by ID | JWT |
| GET | `/all/bycategory/:id` | Get by category | JWT |
| POST | `/` | Create control | JWT |
| POST | `/compliance/:id` | Get compliance by ID | JWT |
| PUT | `/:id` | Update control | JWT |
| PATCH | `/saveControls/:id` | Save with files | JWT |
| DELETE | `/:id` | Delete control | JWT |

---

## Frameworks

**Base Path:** `/api/frameworks`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get all frameworks | JWT |
| GET | `/:id` | Get framework by ID | JWT |
| POST | `/toProject` | Add to project | JWT |
| DELETE | `/fromProject` | Remove from project | JWT |

---

## EU AI Act

**Base Path:** `/api/eu-ai-act`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/controlCategories` | Get categories | JWT |
| GET | `/controls/byControlCategoryId/:id` | Get controls | JWT |
| GET | `/topics` | Get topics | JWT |
| GET | `/assessments/byProjectId/:id` | Get assessments | JWT |
| GET | `/compliances/byProjectId/:id` | Get compliances | JWT |
| GET | `/compliances/progress/:id` | Compliance progress | JWT |
| GET | `/assessments/progress/:id` | Assessment progress | JWT |
| GET | `/all/compliances/progress` | All compliance progress | JWT |
| GET | `/all/assessments/progress` | All assessment progress | JWT |
| GET | `/topicById` | Get topic by ID | JWT |
| GET | `/controlById` | Get control by ID | JWT |
| PATCH | `/saveControls/:id` | Save controls | JWT |
| PATCH | `/saveAnswer/:id` | Save answer | JWT |
| DELETE | `/assessments/byProjectId/:id` | Delete assessments | JWT |
| DELETE | `/compliances/byProjectId/:id` | Delete compliances | JWT |

---

## ISO 42001

**Base Path:** `/api/iso-42001`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/clauses` | Get all clauses | JWT |
| GET | `/clauses/struct/byProjectId/:id` | Clauses structure | JWT |
| GET | `/annexes` | Get all annexes | JWT |
| GET | `/annexes/struct/byProjectId/:id` | Annexes structure | JWT |
| GET | `/clauses/byProjectId/:id` | Clauses by project | JWT |
| GET | `/annexes/byProjectId/:id` | Annexes by project | JWT |
| GET | `/subClauses/byClauseId/:id` | Subclauses by clause | JWT |
| GET | `/annexCategories/byAnnexId/:id` | Categories by annex | JWT |
| GET | `/subClause/byId/:id` | Subclause by ID | JWT |
| GET | `/subclauses/:id/risks` | Risks linked to subclause | JWT |
| GET | `/annexCategories/:id/risks` | Risks linked to category | JWT |
| GET | `/annexCategory/byId/:id` | Category by ID | JWT |
| GET | `/clauses/progress/:id` | Clauses progress | JWT |
| GET | `/annexes/progress/:id` | Annexes progress | JWT |
| GET | `/all/clauses/progress` | All clauses progress | JWT |
| GET | `/all/annexes/progress` | All annexes progress | JWT |
| GET | `/clauses/assignments/:id` | Clauses assignments | JWT |
| GET | `/annexes/assignments/:id` | Annexes assignments | JWT |
| PATCH | `/saveClauses/:id` | Save clauses | JWT |
| PATCH | `/saveAnnexes/:id` | Save annexes | JWT |
| DELETE | `/clauses/byProjectId/:id` | Delete clauses | JWT |
| DELETE | `/annexes/byProjectId/:id` | Delete annexes | JWT |

---

## ISO 27001

**Base Path:** `/api/iso-27001`

Same structure as ISO 42001 with:
- `/clauses`, `/annexes` endpoints
- `/subClauses`, `/annexControls` endpoints
- Progress and assignment endpoints
- Save and delete endpoints

---

## NIST AI RMF

**Base Path:** `/api/nist-ai-rmf`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/functions` | Get all functions | JWT |
| GET | `/functions/:id` | Get function by ID | JWT |
| GET | `/categories/:title` | Get categories | JWT |
| GET | `/subcategories/byId/:id` | Get subcategory | JWT |
| GET | `/subcategories/:id/risks` | Linked risks | JWT |
| GET | `/subcategories/:categoryId/:title` | Subcategories | JWT |
| GET | `/progress` | Total progress | JWT |
| GET | `/progress-by-function` | Progress by function | JWT |
| GET | `/assignments` | Assignments data | JWT |
| GET | `/assignments-by-function` | By function | JWT |
| GET | `/status-breakdown` | Status breakdown | JWT |
| GET | `/overview` | Full overview | JWT |
| PATCH | `/subcategories/:id` | Update subcategory | JWT |
| PATCH | `/subcategories/:id/status` | Update status | JWT |

---

## Policies

**Base Path:** `/api/policies`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get all policies | JWT |
| GET | `/:id` | Get policy by ID | JWT |
| GET | `/tags` | Get policy tags | JWT |
| GET | `/:id/export/pdf` | Export as PDF | JWT |
| GET | `/:id/export/docx` | Export as DOCX | JWT |
| POST | `/` | Create policy | JWT |
| PUT | `/:id` | Update policy | JWT |
| DELETE | `/:id` | Delete policy | JWT |

---

## Evidence Hub

**Base Path:** `/api/evidenceHub`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get all evidences | JWT |
| GET | `/:id` | Get evidence by ID | JWT |
| POST | `/` | Create evidence | JWT |
| PATCH | `/:id` | Update evidence | JWT |
| DELETE | `/:id` | Delete evidence | JWT |

---

## Files

**Base Path:** `/api/files`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get user's files | JWT |
| GET | `/by-projid/:id` | Get by project | JWT |
| GET | `/:id` | Get file content | JWT |
| POST | `/` | Upload file | JWT |

---

## File Manager

**Base Path:** `/api/file-manager`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/` | List org files | JWT | All |
| GET | `/:id` | Download file | JWT | All |
| POST | `/` | Upload file | JWT | Admin/Editor |
| DELETE | `/:id` | Delete file | JWT | Admin/Editor |

---

## Reporting

**Base Path:** `/api/reporting`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/generate-report` | Generate report (legacy) | JWT |
| POST | `/v2/generate-report` | Generate report (v2) | JWT |
| GET | `/generate-report` | Get all reports | JWT |
| DELETE | `/:id` | Delete report | JWT |

---

## Tasks

**Base Path:** `/api/tasks`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get all tasks | JWT |
| GET | `/:id` | Get task by ID | JWT |
| POST | `/` | Create task | JWT |
| PUT | `/:id/restore` | Restore task | JWT |
| PUT | `/:id` | Update task | JWT |
| DELETE | `/:id/hard` | Hard delete | JWT |
| DELETE | `/:id` | Soft delete | JWT |

---

## Incidents

**Base Path:** `/api/ai-incident-managements`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get all incidents | JWT |
| GET | `/:id` | Get incident by ID | JWT |
| POST | `/` | Create incident | JWT |
| PATCH | `/:id` | Update incident | JWT |
| PATCH | `/:id/archive` | Archive incident | JWT |
| DELETE | `/:id` | Delete incident | JWT |

---

## Training Register

**Base Path:** `/api/training`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get all records | JWT |
| GET | `/training-id/:id` | Get by ID | JWT |
| POST | `/` | Create record | JWT |
| PATCH | `/:id` | Update record | JWT |
| DELETE | `/:id` | Delete record | JWT |

---

## Post-Market Monitoring

**Base Path:** `/api/pmm`

### Configuration

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/config/:projectId` | Get config | JWT |
| POST | `/config` | Create config | JWT |
| PUT | `/config/:configId` | Update config | JWT |
| DELETE | `/config/:configId` | Delete config | JWT |

### Questions

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/config/:configId/questions` | Get questions | JWT |
| GET | `/org/questions` | Get org template | JWT |
| POST | `/config/:configId/questions` | Add question | JWT |
| PUT | `/questions/:questionId` | Update question | JWT |
| DELETE | `/questions/:questionId` | Delete question | JWT |
| POST | `/questions/reorder` | Reorder | JWT |

### Cycles

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/active-cycle/:projectId` | Get active cycle | JWT |
| GET | `/cycles/:cycleId` | Get cycle details | JWT |
| GET | `/cycles/:cycleId/responses` | Get responses | JWT |
| POST | `/cycles/:cycleId/responses` | Save responses | JWT |
| POST | `/cycles/:cycleId/submit` | Submit cycle | JWT |
| POST | `/cycles/:cycleId/flag` | Flag concern | JWT |

### Reports

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/reports` | List reports | JWT |
| GET | `/reports/:reportId/download` | Download PDF | JWT |

---

## Approval Workflows

**Base Path:** `/api/approval-workflows`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/` | List workflows | JWT | All |
| GET | `/:id` | Get workflow | JWT | All |
| POST | `/` | Create workflow | JWT | Admin |
| PUT | `/:id` | Update workflow | JWT | Admin |
| DELETE | `/:id` | Delete workflow | JWT | Admin |

---

## Approval Requests

**Base Path:** `/api/approval-requests`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/` | Create request | JWT | All |
| GET | `/my-requests` | User's requests | JWT | All |
| GET | `/pending-approvals` | Pending approvals | JWT | All |
| GET | `/all` | All requests | JWT | Admin |
| GET | `/:id` | Get request | JWT | All |
| POST | `/:id/approve` | Approve | JWT | Approvers |
| POST | `/:id/reject` | Reject | JWT | Approvers |
| POST | `/:id/withdraw` | Withdraw | JWT | Requestor |

---

## Automations

**Base Path:** `/api/automations`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get automations | JWT |
| GET | `/triggers` | Get triggers | JWT |
| GET | `/actions/by-triggerId/:triggerId` | Get actions | JWT |
| GET | `/:id` | Get by ID | JWT |
| GET | `/:id/history` | Get history | JWT |
| GET | `/:id/stats` | Get statistics | JWT |
| POST | `/` | Create automation | JWT |
| PUT | `/:id` | Update automation | JWT |
| DELETE | `/:id` | Delete automation | JWT |

---

## AI Detection

**Base Path:** `/api/ai-detection`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/scans` | Start scan | JWT | Admin/Editor |
| GET | `/scans` | Scan history | JWT | All |
| GET | `/scans/active` | Active scan | JWT | All |
| GET | `/scans/:scanId` | Scan details | JWT | All |
| GET | `/scans/:scanId/status` | Scan status | JWT | All |
| GET | `/scans/:scanId/findings` | Findings | JWT | All |
| GET | `/scans/:scanId/security-findings` | Security | JWT | All |
| GET | `/scans/:scanId/security-summary` | Security summary | JWT | All |
| GET | `/scans/:scanId/governance-summary` | Governance | JWT | All |
| GET | `/stats` | Statistics | JWT | All |
| GET | `/scans/:scanId/export/ai-bom` | Export AI BOM | JWT | All |
| GET | `/scans/:scanId/dependency-graph` | Dependency graph | JWT | All |
| GET | `/scans/:scanId/compliance` | Compliance map | JWT | All |
| POST | `/scans/:scanId/cancel` | Cancel scan | JWT | Admin/Editor |
| POST | `/scans/:scanId/findings/:findingId/governance` | Update governance | JWT | Admin/Editor |
| DELETE | `/scans/:scanId` | Delete scan | JWT | Admin |

---

## AI Trust Centre

**Base Path:** `/api/aiTrustCentre`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/overview` | Get overview | JWT |
| GET | `/resources` | Get resources | JWT |
| GET | `/subprocessors` | Get subprocessors | JWT |
| GET | `/:hash` | Public page | None |
| GET | `/:hash/logo` | Public logo | None |
| GET | `/:hash/resources/:id` | Public resource | None |
| POST | `/resources` | Create resource | JWT |
| POST | `/subprocessors` | Create subprocessor | JWT |
| POST | `/logo` | Upload logo | JWT |
| PUT | `/overview` | Update overview | JWT |
| PUT | `/resources/:id` | Update resource | JWT |
| PUT | `/subprocessors/:id` | Update subprocessor | JWT |
| DELETE | `/logo` | Delete logo | JWT |
| DELETE | `/resources/:id` | Delete resource | JWT |
| DELETE | `/subprocessors/:id` | Delete subprocessor | JWT |

---

## Share Links

**Base Path:** `/api/shares`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/token/:token` | Get by token | None |
| GET | `/view/:token` | View shared data | None |
| POST | `/` | Create share | JWT |
| GET | `/:resourceType/:resourceId` | Get shares | JWT |
| PATCH | `/:id` | Update share | JWT |
| DELETE | `/:id` | Delete share | JWT |

---

## Notifications

**Base Path:** `/api/notifications`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/stream` | SSE notifications | JWT |

---

## Email

**Base Path:** `/api/mail`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/invite` | Send invite | None |
| POST | `/reset-password` | Reset email | None |

---

## Dashboard

**Base Path:** `/api/dashboard`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get dashboard data | JWT |

---

## Search

**Base Path:** `/api/search`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Global search | JWT |

Query params: `query`, `limit`, `offset`

---

## Integrations

### MLFlow

**Base Path:** `/api/integrations/mlflow`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/test` | Test connection | JWT |
| GET | `/config` | Get config | JWT |
| POST | `/configure` | Configure | JWT |
| GET | `/models` | Get models | JWT |
| GET | `/sync-status` | Sync status | JWT |
| GET | `/health` | Health check | None |

### GitHub

**Base Path:** `/api/integrations/github`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/token` | Token status | JWT | Admin |
| POST | `/token` | Save token | JWT | Admin |
| DELETE | `/token` | Delete token | JWT | Admin |
| POST | `/token/test` | Test token | JWT | Admin |

---

## Plugins

**Base Path:** `/api/plugins`

### Marketplace

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/marketplace` | List all published plugins | JWT |
| GET | `/marketplace/:key` | Get plugin by key | JWT |
| GET | `/marketplace/search?q=` | Search plugins | JWT |
| GET | `/categories` | Get plugin categories | JWT |

### Installation Management

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/install` | Install plugin | JWT |
| GET | `/installations` | List installed plugins | JWT |
| DELETE | `/installations/:id` | Uninstall plugin | JWT |
| PUT | `/installations/:id/configuration` | Update configuration | JWT |
| POST | `/:key/test-connection` | Test plugin connection | JWT |

### OAuth (Slack Plugin)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/:key/oauth/connect` | Connect OAuth workspace | JWT |
| GET | `/:key/oauth/workspaces` | Get connected workspaces | JWT |
| PATCH | `/:key/oauth/workspaces/:webhookId` | Update workspace settings | JWT |
| DELETE | `/:key/oauth/workspaces/:webhookId` | Disconnect workspace | JWT |

### Plugin-Specific

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/:key/models` | Get MLflow models | JWT |
| POST | `/:key/sync` | Sync MLflow models | JWT |
| GET | `/:key/template` | Get risk import template | JWT |
| POST | `/:key/import` | Import risks from CSV | JWT |

---

## Change History Endpoints

All change history endpoints follow the same pattern:

| Base Path | Method | Endpoint |
|-----------|--------|----------|
| `/api/policy-change-history` | GET | `/:id` |
| `/api/vendor-change-history` | GET | `/:id` |
| `/api/vendor-risk-change-history` | GET | `/:id` |
| `/api/incident-change-history` | GET | `/:incidentId` |
| `/api/use-case-change-history` | GET | `/:useCaseId` |
| `/api/risk-change-history` | GET | `/:projectRiskId` |
| `/api/model-inventory-change-history` | GET | `/:id` |

---

## Other Endpoints

### Roles
**Base Path:** `/api/roles`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get all roles | JWT |
| GET | `/:id` | Get role by ID | JWT |

### API Tokens
**Base Path:** `/api/tokens`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get tokens | JWT |
| POST | `/` | Create token | JWT |
| DELETE | `/:id` | Delete token | JWT |

### User Preferences
**Base Path:** `/api/user-preferences`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/:userId` | Get preferences | JWT |
| POST | `/` | Create preferences | JWT |
| PATCH | `/:userId` | Update preferences | JWT |

### Notes
**Base Path:** `/api/notes`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Create note | JWT |
| GET | `/` | Get notes | JWT |
| PUT | `/:id` | Update note | JWT |
| DELETE | `/:id` | Delete note | JWT |

### Slack Webhooks
**Base Path:** `/api/slackWebhooks`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get webhooks | JWT |
| GET | `/:id` | Get by ID | JWT |
| POST | `/` | Create webhook | JWT |
| PATCH | `/:id` | Update webhook | JWT |
| DELETE | `/:id` | Delete webhook | JWT |
| POST | `/:id/send` | Send message | JWT |

---

## Features to Frontend Pages Mapping

| Feature | Backend Route | Frontend Page |
|---------|--------------|---------------|
| Dashboard | `/api/dashboard` | `/` |
| Projects/Use Cases | `/api/projects` | `/project-view` |
| Risk Management | `/api/projectRisks` | `/risk-management` |
| Vendors | `/api/vendors`, `/api/vendorRisks` | `/vendors` |
| Model Inventory | `/api/modelInventory`, `/api/modelRisks` | `/model-inventory` |
| Datasets | `/api/datasets` | `/datasets` |
| Policies | `/api/policies` | `/policies` |
| Tasks | `/api/tasks` | `/tasks` |
| Automations | `/api/automations` | `/automations` |
| Incidents | `/api/ai-incident-managements` | `/ai-incident-managements` |
| File Manager | `/api/files`, `/api/file-manager` | `/file-manager` |
| Reporting | `/api/reporting` | `/reporting` |
| Training Registry | `/api/training` | `/training` |
| AI Trust Center | `/api/aiTrustCentre` | `/ai-trust-center` |
| Plugins | `/api/plugins` | `/plugins` |
| Settings | `/api/organizations` | `/settings` |
| LLM Evals | `/api/deepeval` | `/evals` |
| AI Detection | `/api/ai-detection` | `/ai-detection` |
| Shadow AI | `/api/shadow-ai` | `/shadow-ai` |
| Agent Discovery | `/api/agent-primitives` | `/agent-discovery` |
| Approval Workflows | `/api/approval-workflows` | `/approval-workflows` |
| Post-Market Monitoring | `/api/pmm` | `/monitoring` |

---

## Key Files

| File | Purpose |
|------|---------|
| `routes/index.ts` | Main router registration |
| `middleware/auth.middleware.ts` | JWT authentication |
| `middleware/accessControl.middleware.ts` | Role-based access |
| `controllers/*.ctrl.ts` | Route handlers |
| `utils/*.utils.ts` | Database queries |

## Related Documentation

- [Architecture Overview](../architecture/overview.md)
- [Authentication](../architecture/authentication.md)
- [API Conventions](../guides/api-conventions.md)
