# API Documentation Audit Report

**Date:** 2026-04-20  
**Scope:** All 3 API documentation sources — `swagger.yaml`, `swagger.generated.yaml`, `endpoints.ts`  
**Method:** Systematic comparison of every documented endpoint against actual route implementations

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total actual endpoints in codebase** | 560 |
| **Documented in swagger.yaml** | ~280 |
| **Documented in endpoints.ts** | 187 |
| **Documentation coverage** | ~50% |
| **Accuracy of documented endpoints** | ~92% |
| **Critical issues found** | 7 |

---

## Issue #1: Low Documentation Coverage (CRITICAL)

**560 endpoints exist** in the codebase, but swagger.yaml only documents ~280 of them (~50% coverage). The `endpoints.ts` frontend docs app covers only 187.

**Major undocumented areas include:**
- 18 AI Detection endpoints (scans, risk scoring, scheduling)
- 4 Approval Request endpoints (pending-approvals, approve, reject, withdraw)
- Many File Manager sub-routes
- FRIA public endpoints
- Shadow AI endpoints
- Super Admin endpoints
- Internal endpoints
- Plugin system endpoints
- Webhook endpoints
- Various newer features (Policy Radar, Quantitative Risks, etc.)

---

## Issue #2: Missing Security/Auth Specifications (CRITICAL)

**26 endpoints** in swagger.yaml (lines 1000-1500) are documented WITHOUT `bearerAuth` security specification, but the actual code enforces `authenticateJWT` on all of them:

- `/ai-detection/scans/{scanId}/status`
- All `/ai-incident-managements/*` endpoints (6)
- All `/aiTrustCentre/*` endpoints (12+)
- All `/approval-requests/*` endpoints (4+)

**Impact:** API consumers may attempt unauthenticated requests and receive confusing 401 errors.

---

## Issue #3: Documented Endpoints That Don't Work (CRITICAL)

**4 assessment endpoints** are documented in swagger.yaml but are **commented out** in the actual route file (`assessment.route.ts`):

| Endpoint | Method | Status |
|----------|--------|--------|
| `/assessments` | POST | Commented out |
| `/assessments/{id}` | PUT | Commented out |
| `/assessments/{id}` | DELETE | Commented out |
| `/assessments/saveAnswers` | POST | Commented out |

Only the 3 GET endpoints for assessments are active.

---

## Issue #4: Misleading Endpoint Description

**`POST /file-manager`** is documented with:
- Summary: "Handle Multer Error"  
- OperationId: `file_manager_handleMulterError`

**Actual behavior:** This endpoint **uploads a file**. The summary completely misrepresents its purpose.

---

## Issue #5: swagger.generated.yaml Out of Sync

The auto-generated file (`swagger.generated.yaml`) is **14 days stale** (Apr 6 vs Apr 20) with 6 operationId issues:

| Endpoint | Generated (wrong) | Manual (correct) |
|----------|-------------------|-----------------|
| Upload company logo | `Unknown` | `uploadCompanyLogo` |
| Withdraw approval request | `approval_requests_unknown` | `withdrawApprovalRequest` |
| AI Gateway notification | `internal_unknown` | `aiGatewayNotify` |
| Serve plugin UI assets | `plugins_unknown` | `servePluginUI` |
| Upload user profile photo | `users_unknown` | `uploadUserProfilePhoto` |
| Get application version | `version_unknown` | `getAppVersion` |

**Root cause:** The `generateSwagger.ts` script fails to extract operationIds from handlers using multer middleware or non-standard patterns.

---

## Issue #6: endpoints.ts Divergence from swagger.yaml

The `docs/api-docs/src/config/endpoints.ts` (187 endpoints) documents a **different subset** than swagger.yaml (~280 endpoints). Neither is a subset of the other:

- **endpoints.ts has but swagger.yaml lacks:** Bias and Fairness, Logger, Tiers, User Preferences
- **swagger.yaml has but endpoints.ts lacks:** Agent Discovery, Entity Graph, AI Detection (full), FRIA, Feature Settings, many newer modules

These two documentation sources are maintained independently with no synchronization mechanism.

---

## Issue #7: Missing Query Parameters and Request/Response Schemas

Most endpoints in swagger.yaml are documented with minimal schemas:
- Request bodies often just say `type: object` with no properties defined
- Response schemas rarely specify the actual data structure
- Query parameters (pagination, filters, search) are largely undocumented
- Path parameters are correctly documented

---

## Verified Accurate Sections

The following sections were verified as **100% accurate** (routes exist, methods match, auth correct):

| Section | Endpoints | Status |
|---------|-----------|--------|
| AI Advisor | 5 | ✓ Accurate |
| Agent Discovery | 13 | ✓ Accurate |
| AI Detection Repositories | 5 | ✓ Accurate |
| AI Detection (documented subset) | 26 | ✓ Accurate |
| Automations | 8 | ✓ Accurate |
| CE Marking | 2 | ✓ Accurate |
| Compliance | 3 | ✓ Accurate |
| Dashboard | 1 | ✓ Accurate |
| Datasets | 7 | ✓ Accurate |
| Dataset Bulk Upload | 1 | ✓ Accurate |
| Dataset Change History | 1 | ✓ Accurate |
| Entity Graph | 14 | ✓ Accurate |
| EU AI Act | 14 | ✓ Accurate |
| Evidence Hub | 4 | ✓ Accurate |
| Feature Settings | 2 | ✓ Accurate |
| File Change History | 1 | ✓ Accurate |
| File Manager (most) | 8 | ✓ Accurate |
| FRIA | 10+ | ✓ Accurate |
| Approval Workflows | 5 | ✓ Accurate |
| Audit Ledger | 2 | ✓ Accurate |
| AutoDrivers | 2 | ✓ Accurate |
| Assessments (GET only) | 3 | ✓ Accurate |

---

## Recommendations

### Immediate Fixes (Low Effort)

1. **Add `security: [bearerAuth: []]`** to the 26 endpoints missing it
2. **Remove or mark as deprecated** the 4 commented-out assessment endpoints
3. **Fix `POST /file-manager` summary** from "Handle Multer Error" to "Upload File"
4. **Regenerate swagger.generated.yaml** and fix the script's operationId extraction

### Medium-Term (High Value)

5. **Document the remaining ~280 undocumented endpoints** — focus on user-facing ones first (Projects, Vendors, Users, Policies, Risks, Model Inventory)
6. **Add request/response schemas** with actual property definitions
7. **Synchronize endpoints.ts with swagger.yaml** or generate one from the other

### Long-Term

8. **Add JSDoc/swagger annotations to route files** and generate swagger.yaml from code (single source of truth)
9. **Set up CI validation** — fail builds when routes exist without swagger documentation
10. **Deprecate endpoints.ts** in favor of serving swagger.yaml directly via Swagger UI (already partially set up at `/api/docs`)

---

## Files Audited

| File | Role |
|------|------|
| `Servers/swagger.yaml` | Primary API documentation (manual, 11,072 lines) |
| `Servers/swagger.generated.yaml` | Auto-generated copy (14 days stale) |
| `docs/api-docs/src/config/endpoints.ts` | Frontend docs app config (187 endpoints) |
| `Servers/index.ts` | Route registration (85 route files) |
| `Servers/routes/*.ts` | All 85 route files |
| `Servers/scripts/generateSwagger.ts` | Swagger generation script |
