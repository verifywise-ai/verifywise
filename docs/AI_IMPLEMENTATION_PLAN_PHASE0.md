# Phase 0 — AI Implementation Plan & Progress

> **Last Updated:** 2026-03-25

Phase 0 delivers three immediate-priority AI features that form the foundation for VerifyWise's AI-powered compliance intelligence.

---

## Dependencies

All Phase 0 features depend on shared infrastructure (#3596):
- **Database migration:** `20260325161242-create-phase0-ai-tables.js` — 4 tables
- **Backend interfaces:** `i.evidenceAi.ts`, `i.readiness.ts`, `i.aiContent.ts`
- **Frontend interfaces:** mirrored in `Clients/src/domain/interfaces/`
- **Agent registry:** `Servers/advisor/agents/agentRegistry.ts`
- **Document parsers:** `Servers/advisor/parsers/` (PDF, DOCX)

**Status:** COMPLETED (commit `bb4b39705`)

---

## P0-1: Evidence Agent — Document Intelligence (#3597)

**Status:** IN PROGRESS

AI agent that transforms the Evidence Hub from passive storage into an active compliance intelligence system.

### Completed

| Task | File | Status |
|------|------|--------|
| Evidence Agent definition | `Servers/advisor/agents/evidence.agent.ts` | Done |
| Tool schemas (4 tools) | `Servers/advisor/tools/evidenceAiTools.ts` | Done |
| Tool implementations | `Servers/advisor/functions/evidenceAiFunctions.ts` | Done |
| Content analyzer | Included in evidenceAiFunctions.ts | Done |
| Quality scorer (5 dimensions) | Included in evidenceAiFunctions.ts | Done |
| Control matcher | Included in evidenceAiFunctions.ts | Done |
| Gap analyzer | Included in evidenceAiFunctions.ts | Done |
| DB utils | `Servers/utils/evidenceAi.utils.ts` | Done |
| Controller (6 endpoints) | `Servers/controllers/evidenceAi.ctrl.ts` | Done |
| Routes | `Servers/routes/evidenceAi.route.ts` | Done |
| Route registration | `Servers/index.ts` | Done |
| Advisor tool integration | `Servers/controllers/advisor.ctrl.ts` | Done |
| EvidenceQualityBadge component | `Clients/src/presentation/components/EvidenceQualityBadge/` | Done |
| EvidenceAnalysisPanel component | `Clients/src/presentation/components/EvidenceAnalysisPanel/` | Done |
| EvidenceGapChart component | `Clients/src/presentation/components/EvidenceGapChart/` | Done |
| React Query hooks | `Clients/src/application/hooks/useEvidenceAi.ts` | Done |
| Repository (Axios calls) | `Clients/src/application/repository/evidenceAi.repository.ts` | Done |
| Quality badge in Evidence Hub table | `evidenceHubTable.tsx` + `ModelInventory/index.tsx` | Done |

### Remaining

| Task | Status |
|------|--------|
| Integrate analysis panel into Evidence detail view | Pending |
| Add evidence coverage indicator to control pages | Pending |

### API Endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/evidence-ai/analyze/:fileId` | POST | Trigger AI analysis |
| `/api/evidence-ai/analysis/:fileId` | GET | Get analysis results |
| `/api/evidence-ai/quality-scores` | GET | Dashboard quality scores |
| `/api/evidence-ai/gaps` | GET | Evidence gap analysis |
| `/api/evidence-ai/suggestions/:fileId` | GET | Suggested control links |
| `/api/evidence-ai/suggestions/:fileId/apply` | POST | Apply suggestions |

---

## P0-2: Control Assessment Agent — Readiness Scoring (#3598)

**Status:** IN PROGRESS

AI agent that evaluates audit readiness per control, aggregates to framework/project level.

### Completed

| Task | File | Status |
|------|------|--------|
| Readiness Calculator (weighted formula) | `Servers/advisor/scoring/readinessCalculator.ts` | Done |
| Level classification + aggregation | Included in readinessCalculator.ts | Done |
| Control Assessment Agent definition | `Servers/advisor/agents/controlAssessment.agent.ts` | Done |
| Tool schemas (4 tools) | `Servers/advisor/tools/readinessTools.ts` | Done |
| Tool implementations | `Servers/advisor/functions/readinessFunctions.ts` | Done |
| DB utils (upsert, queries) | `Servers/utils/readiness.utils.ts` | Done |
| Controller (8 endpoints) | `Servers/controllers/readiness.ctrl.ts` | Done |
| Routes | `Servers/routes/readiness.route.ts` | Done |
| Route registration | `Servers/index.ts` | Done |
| Unique constraints migration | `20260325183928-add-readiness-unique-constraints.js` | Done |
| ReadinessScoreCard component | `Clients/src/presentation/components/ReadinessScoreCard/` | Done |
| ReadinessHeatmap component | `Clients/src/presentation/components/ReadinessHeatmap/` | Done |
| ReadinessTrend component | `Clients/src/presentation/components/ReadinessTrend/` | Done |
| WeakControlsList component | `Clients/src/presentation/components/WeakControlsList/` | Done |
| ReadinessDashboard page | `Clients/src/presentation/pages/ReadinessDashboard/` | Done |
| React Query hooks | `Clients/src/application/hooks/useReadiness.ts` | Done |
| Repository (Axios calls) | `Clients/src/application/repository/readiness.repository.ts` | Done |
| Route `/readiness` | `Clients/src/application/config/routes.tsx` | Done |

### Remaining

| Task | Status |
|------|--------|
| Add readiness score badge to framework pages | Pending |
| Add control readiness score to control detail pages | Pending |
| Add overall readiness widget to main dashboard | Pending |

### Scoring Formula
```
overall = evidence_quality * 0.30
        + evidence_count   * 0.20
        + evidence_recency * 0.15
        + task_completion  * 0.20
        + risk_mitigation  * 0.15

Levels: ready (>=80) | needs_work (60-79) | at_risk (30-59) | not_started (<30)
```

### API Endpoints (Implemented)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/readiness/calculate` | POST | Trigger calculation (all) |
| `/api/readiness/calculate/:frameworkType` | POST | Trigger for framework |
| `/api/readiness/scores` | GET | All framework scores |
| `/api/readiness/scores/:frameworkType` | GET | Framework scores |
| `/api/readiness/controls/:frameworkType` | GET | Per-control scores |
| `/api/readiness/weakest` | GET | Weakest controls |
| `/api/readiness/recommendations` | GET | Top recommendations |
| `/api/readiness/history` | GET | Historical trend |

---

## P0-3: AI-Generated Content Badge — Transparency System (#3599)

**Status:** IN PROGRESS

Transparency system marking all AI-generated/AI-assisted content. Required by EU AI Act Article 52.

### Completed

| Task | File | Status |
|------|------|--------|
| AI content tracker middleware | `Servers/middleware/aiContentTracker.middleware.ts` | Done |
| DB utils (badges, review, stats) | `Servers/utils/aiContent.utils.ts` | Done |
| Controller (4 endpoints) | `Servers/controllers/aiContent.ctrl.ts` | Done |
| Routes | `Servers/routes/aiContent.route.ts` | Done |
| Route registration | `Servers/index.ts` | Done |
| AIContentBadge (3 variants) | `Clients/src/presentation/components/AIContentBadge/` | Done |
| AIContentReviewPanel | `Clients/src/presentation/components/AIContentReviewPanel/` | Done |
| AIContentStats widget | `Clients/src/presentation/components/AIContentStats/` | Done |
| React Query hooks | `Clients/src/application/hooks/useAIContent.ts` | Done |
| Repository (Axios calls) | `Clients/src/application/repository/aiContent.repository.ts` | Done |

### Remaining

| Task | Status |
|------|--------|
| Integrate badge into risk detail/list | Pending |
| Integrate badge into policy editor/list | Pending |
| Integrate badge into Evidence Hub | Pending |
| Integrate badge into assessment answers | Pending |
| Integrate badge into task detail | Pending |
| Add unreviewed content list to dashboard | Pending |

### Badge Types
| Badge | Color | Meaning |
|-------|-------|---------|
| AI-Generated | Purple (#7C3AED) | Fully created by AI |
| AI-Assisted | Blue (#2563EB) | Partially modified by AI |
| AI-Reviewed | Green (#059669) | Reviewed and approved by human |
| AI-Suggested | Amber (#D97706) | Suggestion not yet applied |

### API Endpoints (Implemented)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/ai-content/:entityType/:entityId` | GET | Get badges for entity |
| `/api/ai-content/:id/review` | PATCH | Mark as reviewed |
| `/api/ai-content/unreviewed` | GET | List unreviewed content |
| `/api/ai-content/stats` | GET | AI content statistics |

---

## Architecture Overview

```
Browser → EvidenceHub / Control Pages
    ↓
React Query hooks → Axios repository → /api/evidence-ai/* endpoints
    ↓
Express Router → authenticateJWT → Controller → Utils → PostgreSQL
    ↓
Advisor (AI SDK) → Evidence AI Tools → bridgeTools → streamText()
```

### File Structure (Phase 0)

```
Servers/
├── advisor/
│   ├── agents/
│   │   ├── agentRegistry.ts          # Agent registration
│   │   └── evidence.agent.ts         # P0-1 agent definition
│   ├── tools/
│   │   └── evidenceAiTools.ts        # P0-1 tool schemas
│   ├── functions/
│   │   └── evidenceAiFunctions.ts    # P0-1 tool implementations
│   └── parsers/                       # PDF/DOCX parsing
├── controllers/
│   └── evidenceAi.ctrl.ts            # P0-1 request handlers
├── routes/
│   └── evidenceAi.route.ts           # P0-1 endpoints
├── utils/
│   └── evidenceAi.utils.ts           # P0-1 DB queries
├── domain.layer/interfaces/
│   ├── i.evidenceAi.ts               # P0-1 types
│   ├── i.readiness.ts                # P0-2 types
│   └── i.aiContent.ts                # P0-3 types
└── database/migrations/
    └── 20260325161242-create-phase0-ai-tables.js

Clients/src/
├── application/
│   ├── hooks/useEvidenceAi.ts         # P0-1 React Query hooks
│   └── repository/evidenceAi.repository.ts  # P0-1 API calls
├── presentation/components/
│   ├── EvidenceQualityBadge/          # P0-1 quality badge
│   ├── EvidenceAnalysisPanel/         # P0-1 analysis view
│   └── EvidenceGapChart/              # P0-1 gap visualization
└── domain/interfaces/
    ├── i.evidenceAi.ts
    ├── i.readiness.ts
    └── i.aiContent.ts
```
