# Additional APIs Reference

## Assessments & Questions

Questionnaire system for compliance assessments with topics and subtopics.

**Assessments:**
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/assessments` | GET | List all assessments |
| `/api/assessments/:id` | GET | Get assessment by ID |
| `/api/assessments/project/byid/:id` | GET | Get assessment for project |
| `/api/assessments/getAnswers/:id` | GET | Get answers for assessment |

**Questions:**
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/questions` | GET | List all questions |
| `/api/questions/:id` | GET | Get question by ID |
| `/api/questions/bytopic/:id` | GET | Get questions by topic |
| `/api/questions/bysubtopic/:id` | GET | Get questions by subtopic |

Structure: Assessment → Topics → Subtopics → Questions → Answers

---

## Subscriptions & Tiers

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/subscriptions` | GET | Get current subscription |
| `/api/subscriptions` | POST | Create subscription |
| `/api/subscriptions/:id` | PUT | Update subscription |
| `/api/tiers/features/:id` | GET | Get tier features |

Properties: `organization_id`, `tier_id`, `status` ("active" | "cancelled" | "expired"), `start_date`, `end_date`, `features[]`.

---

## API Tokens

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/tokens` | GET | List API tokens |
| `/api/tokens` | POST | Create token |
| `/api/tokens/:id` | DELETE | Delete token |

- Tokens are hashed before storage
- Full token shown only once on creation
- Properties: `name`, `token` ("vw_..."), `scopes`, `expires_at`, `last_used_at`

---

## Dataset Bulk Upload

Plugin: `dataset-bulk-upload` (must be installed)

```
POST /api/dataset-bulk-upload/upload
Content-Type: multipart/form-data
```

- Supported: CSV, XLS, XLSX
- Max file size: 30MB
- Admin or Editor role required
- Error 413 (too large), 415 (wrong type), 403 (plugin not installed)

---

## Compliance Score

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/compliance/score` | GET | Get score for current org |
| `/api/compliance/score/:organizationId` | GET | Get score for specific org |
| `/api/compliance/details/:organizationId` | GET | Detailed breakdown |

Response includes `overall_score`, module breakdowns (risk_management, vendor_management, model_governance, policy_compliance, training), `data_quality`.

---

## Policy Linked Objects

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/policy-linked` | GET | Get all linked objects |
| `/api/policy-linked/:policyId/linked-objects` | GET | Get linked objects for policy |
| `/api/policy-linked/:policyId/linked-objects` | POST | Create link |
| `/api/policy-linked/:policyId/linked-objects` | DELETE | Delete link |
| `/api/policy-linked/risk/:riskId/unlink-all` | DELETE | Unlink risk from all policies |
| `/api/policy-linked/evidence/:evidenceId/unlink-all` | DELETE | Unlink evidence from all |

Link types: `risk`, `evidence`

---

## Dashboard Data

```
GET /api/dashboard
```

Returns: `compliance_score`, `risk_summary` (total/high/medium/low), `vendor_summary`, `model_summary`, `task_summary` (total/overdue/due_this_week), `recent_activity[]`.
