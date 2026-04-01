# AI Detection System

## Overview

The AI Detection domain provides repository scanning capabilities to identify AI/ML libraries, dependencies, API calls, secrets, model references, RAG components, AI agents, and LLM vulnerabilities within codebases. It combines pattern matching against 100+ known AI technologies with a 2-phase LLM vulnerability detection pipeline covering the full OWASP Top 10 for LLM Applications. The system includes governance workflows, risk scoring across 7 dimensions, scheduled/recurring scans, and repository management.

## Key Features

- GitHub repository scanning (public and private)
- 100+ AI/ML library pattern detection
- LLM vulnerability detection (OWASP LLM Top 10, LLM01–LLM10)
- 2-phase vulnerability pipeline: regex pre-filter + LLM deep analysis
- AI Governance Risk Score (AGRS) across 7 dimensions with grade A–F
- Model security scanning for serialized model files
- Real-time scan progress tracking
- Governance status workflows (review, approve, flag)
- Cross-referencing between vulnerability and non-vulnerability findings
- Scheduled/recurring scans with repository management
- Per-organization vulnerability type toggles
- AI Bill of Materials (AI-BOM) export
- EU AI Act compliance mapping
- Dependency graph visualization

## Database Schema

All tables use the shared `verifywise` schema with `organization_id` for tenant isolation. Queries use unqualified table names resolved via `search_path`.

### Scans Table

```
ai_detection_scans
├── id (PK, SERIAL)
├── organization_id (INTEGER NOT NULL)
├── repository_url (VARCHAR(500) NOT NULL)
├── repository_owner (VARCHAR(255) NOT NULL)
├── repository_name (VARCHAR(255) NOT NULL)
├── default_branch (VARCHAR(100), default: 'main')
├── status (VARCHAR(50), default: 'pending')
├── findings_count (INTEGER, default: 0)
├── files_scanned (INTEGER, default: 0)
├── total_files (INTEGER)
├── risk_score (NUMERIC)
├── risk_score_grade (VARCHAR(2))
├── risk_score_details (JSONB)
├── risk_score_calculated_at (TIMESTAMPTZ)
├── started_at (TIMESTAMPTZ)
├── completed_at (TIMESTAMPTZ)
├── duration_ms (INTEGER)
├── error_message (TEXT)
├── triggered_by (INTEGER NOT NULL, FK → users)
├── cache_path (VARCHAR(255))
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

### Findings Table

```
ai_detection_findings
├── id (PK, SERIAL)
├── organization_id (INTEGER NOT NULL)
├── scan_id (FK → ai_detection_scans, CASCADE DELETE)
├── finding_type (VARCHAR(100) NOT NULL)
├── category (VARCHAR(100) NOT NULL)
├── name (VARCHAR(255) NOT NULL)
├── provider (VARCHAR(100))
├── confidence (VARCHAR(20) NOT NULL)
├── risk_level (VARCHAR(20), default: 'medium')
├── description (TEXT)
├── documentation_url (VARCHAR(500))
├── file_count (INTEGER, default: 1)
├── file_paths (JSONB)
├── license_id, license_name, license_risk, license_source
├── governance_status (VARCHAR(20))
├── governance_updated_at, governance_updated_by
├── severity, cwe_id, cwe_name (security fields)
├── owasp_ml_id, owasp_ml_name (ML security)
├── threat_type, operator_name, module_name
└── created_at (TIMESTAMPTZ)

Constraints:
└── UNIQUE(scan_id, name, provider)
```

### Vulnerability Details Table

```
ai_detection_vulnerability_details
├── id (PK, SERIAL)
├── organization_id (INTEGER NOT NULL)
├── finding_id (FK → ai_detection_findings, UNIQUE)
├── mitigation (TEXT)
├── data_flow_summary (TEXT)
├── vulnerability_details (JSONB)
└── created_at (TIMESTAMPTZ)

Constraints:
└── UNIQUE(finding_id)
```

### Vulnerability Config Table

```
ai_detection_vulnerability_config
├── id (PK, SERIAL)
├── organization_id (INTEGER NOT NULL, UNIQUE)
├── vulnerability_scan_enabled (BOOLEAN, default: false)
├── vulnerability_types_enabled (JSONB)
├── updated_by (INTEGER)
└── updated_at (TIMESTAMPTZ)

Constraints:
└── UNIQUE(organization_id)
```

### Risk Scoring Config Table

```
ai_detection_risk_scoring_config
├── id (PK, SERIAL)
├── organization_id (INTEGER NOT NULL)
├── llm_enabled (BOOLEAN, default: false)
├── llm_key_id (INTEGER, FK → llm_keys)
├── dimension_weights (JSONB)
├── updated_by (INTEGER)
└── updated_at (TIMESTAMPTZ)
```

### Repositories Table

```
ai_detection_repositories
├── id (PK, SERIAL)
├── organization_id (INTEGER NOT NULL)
├── repository_url (VARCHAR(500) NOT NULL)
├── repository_owner (VARCHAR(255))
├── repository_name (VARCHAR(255))
├── schedule_frequency (VARCHAR(20))
├── schedule_day_of_week (INTEGER)
├── schedule_day_of_month (INTEGER)
├── schedule_hour (INTEGER)
├── schedule_minute (INTEGER)
├── next_scan_at (TIMESTAMPTZ)
├── last_scan_at (TIMESTAMPTZ)
├── last_scan_id (INTEGER)
├── github_token_id (INTEGER)
├── created_by (INTEGER NOT NULL)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

### GitHub Tokens Table

```
github_tokens
├── id (PK, SERIAL)
├── organization_id (INTEGER NOT NULL)
├── encrypted_token (TEXT NOT NULL)
├── token_name (VARCHAR(100))
├── created_by (INTEGER NOT NULL)
├── created_at, updated_at (TIMESTAMPTZ)
└── last_used_at (TIMESTAMPTZ)
```

## Enums

### Scan Status

```typescript
type ScanStatus =
  | 'pending'    // Queued for processing
  | 'cloning'    // Cloning repository
  | 'scanning'   // Analyzing files
  | 'completed'  // Successfully finished
  | 'failed'     // Error occurred
  | 'cancelled'; // User cancelled
```

### Finding Types

```typescript
type FindingType =
  // Inventory findings (detected via pattern matching)
  | 'library'              // Import statements
  | 'dependency'           // Dependency file entries
  | 'api_call'             // SDK method invocations
  | 'secret'               // Hardcoded credentials
  | 'model_ref'            // Model references (Hugging Face)
  | 'rag_component'        // Vector DBs, embeddings
  | 'agent'                // AI agent frameworks
  | 'model_security'       // Threats in model files
  // Vulnerability findings (detected via 2-phase LLM pipeline)
  | 'prompt_injection'     // LLM01: Prompt injection
  | 'pii_exposure'         // LLM06: Sensitive information disclosure
  | 'excessive_agency'     // LLM08: Excessive agency
  | 'jailbreak_risk'       // LLM02: Insecure output handling
  | 'training_data_poisoning' // LLM03: Training data poisoning
  | 'model_dos'            // LLM04: Model denial of service
  | 'supply_chain'         // LLM05: Supply chain vulnerabilities
  | 'insecure_plugin'      // LLM07: Insecure plugin design
  | 'overreliance'         // LLM09: Overreliance
  | 'model_theft';         // LLM10: Model theft
```

### Confidence Levels

| Level | Description |
|-------|-------------|
| `high` | Definitive AI/ML library, no false positive risk |
| `medium` | Likely AI/ML but could have other uses |
| `low` | Possibly AI/ML, requires context |

### Risk Levels

| Level | Criteria |
|-------|----------|
| `high` | Data leakage threat (cloud APIs, exposed secrets, agents) |
| `medium` | Configurable risk (frameworks, RAG components) |
| `low` | Local processing (local ML libraries) |

### Governance Status

```typescript
type GovernanceStatus = 'reviewed' | 'approved' | 'flagged' | null;
```

## API Endpoints

### Scan Operations

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| POST | `/ai-detection/scans` | Start scan | Admin, Editor |
| GET | `/ai-detection/scans` | List scan history | All |
| GET | `/ai-detection/scans/:scanId` | Get scan details | All |
| GET | `/ai-detection/scans/:scanId/status` | Poll status | All |
| GET | `/ai-detection/scans/active` | Get active scan | All |
| POST | `/ai-detection/scans/:scanId/cancel` | Cancel scan | Admin, Editor |
| DELETE | `/ai-detection/scans/:scanId` | Delete scan | Admin |

### Findings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ai-detection/scans/:scanId/findings` | Get findings (paginated) |
| GET | `/ai-detection/scans/:scanId/security-findings` | Security threats |
| GET | `/ai-detection/scans/:scanId/security-summary` | Security summary |
| PATCH | `/ai-detection/scans/:scanId/findings/:findingId/governance` | Update governance |
| GET | `/ai-detection/scans/:scanId/governance-summary` | Governance stats |

### Analysis & Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ai-detection/scans/:scanId/export/ai-bom` | Export AI-BOM JSON |
| GET | `/ai-detection/scans/:scanId/dependency-graph` | Dependency graph |
| GET | `/ai-detection/scans/:scanId/compliance` | EU AI Act mapping |
| GET | `/ai-detection/stats` | Overall statistics |

### Risk Scoring

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/ai-detection/scans/:scanId/risk-score` | Get risk score details | All |
| POST | `/ai-detection/scans/:scanId/risk-score/recalculate` | Recalculate score | Admin, Editor |
| GET | `/ai-detection/risk-scoring/config` | Get scoring config | All |
| PATCH | `/ai-detection/risk-scoring/config` | Update scoring config | Admin |

### Repository Management

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/ai-detection/repositories` | List repositories | All |
| GET | `/ai-detection/repositories/:id` | Get single repository | All |
| POST | `/ai-detection/repositories` | Create repository | Admin, Editor |
| PATCH | `/ai-detection/repositories/:id` | Update repository | Admin, Editor |
| DELETE | `/ai-detection/repositories/:id` | Delete repository | Admin |
| POST | `/ai-detection/repositories/:id/scan` | Trigger scan for repo | Admin, Editor |
| GET | `/ai-detection/repositories/:id/scans` | Get repo scan history | All |

### Start Scan Request

```json
{
  "repository_url": "https://github.com/owner/repo"
}
```

### Scan Status Response

```json
{
  "status": "scanning",
  "progress": 45,
  "files_scanned": 234,
  "total_files": 520,
  "findings_count": 12
}
```

### Finding Response

```json
{
  "id": 1,
  "finding_type": "library",
  "category": "Cloud AI Provider",
  "name": "openai",
  "provider": "OpenAI",
  "confidence": "high",
  "risk_level": "high",
  "description": "OpenAI Python SDK for GPT models",
  "file_count": 3,
  "file_paths": [
    {"path": "src/ai/chat.py", "line_number": 5, "matched_text": "import openai"}
  ],
  "governance_status": null
}
```

## LLM Vulnerability Detection

### Overview

A 2-phase pipeline that detects all 10 OWASP Top 10 for LLM Applications vulnerability types through static code analysis.

### Phase 1: Regex Pre-filter (`vulnerabilityPreFilter.ts`)

Fast pattern scanning identifies vulnerability candidates without LLM cost:

1. Scans all code files against regex indicator patterns per vulnerability type
2. Each type has 4–7 regex patterns targeting known risky code constructs
3. Returns `VulnerabilityCandidate` objects with file path, line, matched text, and surrounding context (5 lines before/after)
4. Applies deduplication (file+line key) and caps at 50 candidate files, ~100K token context

### Phase 2: LLM Deep Analysis (`vulnerabilityAnalyzer.ts`)

Candidates from phase 1 are sent to an LLM with type-specific rubric prompts:

1. Groups candidates by vulnerability type with code snippets
2. Makes up to 10 LLM calls (one per vulnerability type with candidates)
3. LLM evaluates each candidate against a detailed rubric and returns severity, confidence, and mitigation
4. Converts confirmed findings to `ICreateFindingInput[]` for batch insert
5. Caps findings at 20 per vulnerability type

### OWASP LLM Top 10 Coverage

| ID | Type Key | Name | Detection Method |
|----|----------|------|-----------------|
| LLM01 | `prompt_injection` | Prompt injection | Untrusted input concatenated into prompts |
| LLM02 | `jailbreak_risk` | Insecure output handling | LLM output → code exec, SQL, HTML, shell |
| LLM03 | `training_data_poisoning` | Training data poisoning | Insecure deserialization, untrusted model sources |
| LLM04 | `model_dos` | Model denial of service | No token limits, no timeouts, no rate limits |
| LLM05 | `supply_chain` | Supply chain vulnerabilities | Unpinned versions, untrusted model URLs |
| LLM06 | `pii_exposure` | Sensitive information disclosure | Direct PII fields, session leaks |
| LLM07 | `insecure_plugin` | Insecure plugin design | Raw input without validation, no schemas |
| LLM08 | `excessive_agency` | Excessive agency | Overly broad tool access, no human-in-loop |
| LLM09 | `overreliance` | Overreliance | No human review, no confidence thresholds |
| LLM10 | `model_theft` | Model theft | Model files in public dirs, unauthenticated endpoints |

### Vulnerability Settings

Per-organization configuration in `ai_detection_vulnerability_config`:
- Toggle vulnerability scanning on/off
- Enable/disable individual vulnerability types via `vulnerability_types_enabled` JSONB field
- Managed through the settings page and `PATCH /ai-detection/risk-scoring/config`

### Cross-referencing

After scan completes, `crossReferenceFindings()` links vulnerability findings to non-vulnerability findings that share file paths:
- Queries all findings for the scan
- For each vulnerability finding, checks if any library/agent/security findings reference the same files
- Updates `vulnerability_details` JSONB with `related_finding_ids` and `related_finding_types`
- Displayed as a teal "Cross-ref" badge in the vulnerability findings UI

## AI Governance Risk Score (AGRS)

### Overview

Calculates a 0–100 risk score across 7 governance dimensions, with an A–F letter grade. Optionally enhanced by LLM for contextual analysis.

### Dimensions

| Dimension | Default Weight | What it measures |
|-----------|---------------|-----------------|
| Data sovereignty | 15% | Cloud API calls to high-risk providers, RAG components |
| Transparency | 15% | Undocumented model references, libraries |
| Security | 25% | Secrets, API calls, vulnerability findings |
| Autonomy | 15% | Agents, excessive agency, insecure plugins |
| Supply chain | 15% | Dependencies, libraries, API calls |
| License | 10% | License risk of dependencies |
| Accuracy | 10% | Model quality and reliability indicators |

Weights are configurable per organization via `PATCH /ai-detection/risk-scoring/config`.

### Scoring Algorithm

1. Each dimension starts at 100
2. For each finding, calculate: `penalty = base_penalty × confidence_multiplier × risk_level_multiplier`
3. **Inventory items** (library, dependency, api_call, model_ref, rag_component, agent) only penalize dimensions when `risk_level` is medium or high — low-risk inventory items are informational only
4. **Vulnerability findings** always penalize regardless of risk level
5. Apply diminishing returns: findings sorted by penalty descending, each subsequent finding damped by `1/(1 + 0.25 × index)`
6. Cap maximum penalty at 85 per dimension
7. Overall score = weighted average of dimension scores

### Base Penalties

| Finding Type | Base Penalty | Category |
|-------------|-------------|----------|
| secret | 20 | Risk indicator |
| prompt_injection | 18 | Risk indicator |
| pii_exposure | 16 | Risk indicator |
| training_data_poisoning | 16 | Risk indicator |
| excessive_agency | 14 | Risk indicator |
| supply_chain (vuln) | 14 | Risk indicator |
| model_theft | 14 | Risk indicator |
| jailbreak_risk | 12 | Risk indicator |
| insecure_plugin | 12 | Risk indicator |
| model_dos | 10 | Risk indicator |
| overreliance | 10 | Risk indicator |
| agent | 5 | Inventory |
| api_call | 3 | Inventory |
| rag_component | 2 | Inventory |
| model_ref | 1 | Inventory |
| library | 0.5 | Inventory |
| dependency | 0.2 | Inventory |

### Multipliers

| Confidence | Multiplier | Risk Level | Multiplier |
|-----------|-----------|-----------|-----------|
| high | 1.0 | high | 1.0 |
| medium | 0.6 | medium | 0.6 |
| low | 0.3 | low | 0.3 |

### Grade Thresholds

| Grade | Score Range | Label |
|-------|------------|-------|
| A | >= 90 | Excellent |
| B | >= 80 | Good |
| C | >= 70 | Acceptable |
| D | >= 60 | Needs improvement |
| F | < 60 | Critical |

### LLM Enhancement (Optional)

When enabled with an LLM key:
- Sends findings summary and dimension scores to LLM
- LLM returns adjustments (capped at ±10 per dimension), narrative, recommendations, and suggested risks
- Suggested risks include category, lifecycle phase, likelihood, severity, and mitigation plan

## Scheduled Scans

### Repository Management

The repositories page allows registering repos for recurring scans:
- Add repository URL with optional GitHub token
- Configure schedule: frequency (once, hourly, daily, weekly, monthly), day of week/month, hour, minute
- View scan history per repository
- Trigger manual scans

### Scheduled Scan Processor (`scheduledScanProcessor.ts`)

- BullMQ worker runs every 5 minutes via `ai_detection_scheduled_scan_check` job
- Queries repositories where `next_scan_at <= NOW()` and no active scan is running
- Uses Redis distributed lock per tenant to prevent concurrent workers on same repos
- Calculates `next_scan_at` before triggering scan to prevent reprocessing
- Handles stale scan recovery (marks scans stuck >30 minutes as failed)

## Detection Patterns

### Supported Technologies (100+)

**Cloud AI Providers (High Risk):**
- OpenAI, Anthropic, Google AI, Microsoft Azure AI
- AWS Bedrock, Cohere, Mistral AI, Replicate
- HuggingFace Inference, Together AI, Groq, Perplexity

**ML Frameworks (Medium/Low Risk):**
- PyTorch, TensorFlow, Keras, JAX
- scikit-learn, MXNet, ONNX
- LangChain, LlamaIndex, Haystack, CrewAI

**File Extensions Scanned:**
```
Python: .py
JavaScript: .js, .mjs, .cjs
TypeScript: .ts, .tsx, .jsx
Java, Go, Ruby, Rust, C/C++, C#
Scala, Kotlin, Swift, R, Julia
```

**Dependency Files:**
```
requirements.txt, setup.py, pyproject.toml
package.json, Cargo.toml, go.mod
pom.xml, build.gradle, Gemfile
```

**Directories Skipped:**
```
node_modules, .git, venv, .venv
__pycache__, dist, build, target
```

### Risk Classification

**High Risk (data transmission):**
- All `secret` findings
- All `api_call` findings
- All `agent` findings
- Cloud provider libraries
- Cloud vector databases (Pinecone, Weaviate)

**Medium Risk (configurable):**
- Framework libraries (LangChain, LlamaIndex)
- RAG components

**Low Risk (local processing):**
- Local ML frameworks (PyTorch, TensorFlow)
- Ollama, NVIDIA local inference
- Data processing libraries

## Scanning Process

### Flow

```
1. URL Parsing & Validation
   ├── GitHub URL formats: https, SSH, shorthand
   └── Repository existence check

2. Size Validation
   └── Max repository size: 2.5 GB

3. Git Clone
   ├── Shallow clone: --depth 1
   └── Temp directory: /tmp/verifywise-scan-{timestamp}-{random}

4. File Enumeration
   ├── Walk directory tree
   ├── Skip excluded directories
   └── Filter by supported extensions

5. Pattern Matching
   ├── Code file analysis (100+ patterns)
   ├── Dependency file parsing
   └── Model file security scan

6. LLM Vulnerability Detection (if enabled)
   ├── Phase 1: Regex pre-filter on all code files
   ├── Phase 2: LLM deep analysis of candidates
   └── Store confirmed findings with vulnerability details

7. Finding Aggregation
   ├── Deduplicate by name + provider
   └── Aggregate file paths per finding

8. Cross-referencing
   └── Link vulnerability findings to overlapping non-vulnerability findings

9. Risk Score Calculation
   ├── Calculate dimension scores from all findings
   ├── Optional LLM enhancement
   └── Store score, grade, and details on scan record

10. Database Insert
    └── Batch insert findings

11. Cleanup
    └── Remove temp clone directory
```

### Progress Tracking

- In-memory Map for real-time updates
- Database updates every 50 files
- Progress calculation: 5% cloning + 95% scanning
- Stale progress cleanup: every 60 seconds

## Frontend Components

### Page Structure

```
AIDetection/
├── index.tsx              # Main container with routing
├── ScanPage.tsx           # Scan initiation
├── HistoryPage.tsx        # Scan history list with risk scores
├── ScanDetailsPage.tsx    # Finding details (multi-tab)
├── SettingsPage.tsx       # GitHub tokens, risk scoring, vulnerability settings
├── RepositoriesPage.tsx   # Repository registry and scheduling
├── AddRepositoryModal.tsx # Repository registration modal
├── AIDetectionSidebar.tsx # Left sidebar navigation
└── components/
    └── RiskScoreCard.tsx  # Risk score visualization with 7 dimensions
```

### Scan Details Tabs

| Tab | Content |
|-----|---------|
| Libraries | AI/ML library findings with license info |
| Vulnerabilities | OWASP LLM Top 10 findings with StatCard summaries |
| Security | Security threats with CWE/OWASP references |
| API Calls | REST API invocations |
| Secrets | Exposed credentials |
| Models | Model references |
| RAG | Vector DBs, embeddings |
| Agents | AI agent frameworks |
| Compliance | EU AI Act requirement mapping with checklist |

### Settings Page Sections

| Section | Content |
|---------|---------|
| GitHub tokens | Add, test, delete encrypted tokens |
| Risk scoring | Dimension weight sliders (0–100) |
| LLM enhancement | Toggle + LLM key selection for enhanced scoring |
| Vulnerability types | Per-type toggles for all 10 OWASP LLM types |

### Status Polling

```typescript
// Poll every 2-3 seconds during active scan
useEffect(() => {
  const interval = setInterval(async () => {
    const status = await getScanStatus(scanId);
    setProgress(status);
    if (status.status === 'completed' || status.status === 'failed') {
      clearInterval(interval);
    }
  }, 2500);
  return () => clearInterval(interval);
}, [scanId]);
```

## GitHub Integration

### Token Management

- Encrypted storage with AES-256-CBC
- Token formats supported:
  - Classic: `ghp_...` (40+ chars)
  - Fine-grained: `github_pat_...` (30+ chars)
  - OAuth legacy: 40 hex characters
- Last used timestamp tracking
- Admin-only configuration

### Private Repository Access

```typescript
// Token validation
const response = await fetch('https://api.github.com/user', {
  headers: { Authorization: `Bearer ${token}` }
});

// Rate limit headers
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 4999
X-RateLimit-Reset: 1642089600
```

## Model Security Scanning

### File Types

```
.pt, .pth       # PyTorch
.onnx           # ONNX
.h5, .hdf5      # HDF5/Keras
.safetensors    # Safe Tensors
Serialized Python objects
```

### Threat Detection

| Threat Type | CWE | OWASP ML |
|-------------|-----|----------|
| Unsafe deserialization | CWE-502 | ML-A04 |
| Code injection | CWE-94 | ML-A06 |
| Arbitrary code execution | CWE-913 | ML-A04 |

## Compliance Mapping

### EU AI Act Requirements

The system maps findings to EU AI Act articles:

| Requirement | Article | Detection |
|-------------|---------|-----------|
| Risk Management | Art. 9 | High-risk libraries |
| Data Governance | Art. 10 | Data processing libs |
| Transparency | Art. 13 | API call findings |
| Human Oversight | Art. 14 | Agent findings |
| Cybersecurity | Art. 15 | Security findings |

## Rate Limiting

| Operation | Limit |
|-----------|-------|
| Start scan | 30 per 15 minutes |
| Status polling | Unlimited |
| Finding queries | 100 per minute |

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `services/aiDetection.service.ts` | Core scanning logic |
| `services/aiDetection/riskScoring.ts` | AGRS risk score engine |
| `services/aiDetection/vulnerabilityPreFilter.ts` | Regex pre-filter for vulnerability candidates |
| `services/aiDetection/vulnerabilityAnalyzer.ts` | LLM deep analysis of vulnerability candidates |
| `services/aiDetection/scheduledScanProcessor.ts` | BullMQ worker for recurring scans |
| `config/llmVulnerabilityPatterns.ts` | OWASP LLM Top 10 regex patterns and LLM rubrics |
| `config/riskScoringConfig.ts` | Risk scoring dimensions, penalties, grades |
| `config/aiDetectionPatterns.ts` | 100+ AI/ML detection patterns |
| `routes/aiDetection.route.ts` | Scan, finding, and risk scoring routes |
| `routes/aiDetectionRepository.route.ts` | Repository management routes |
| `utils/aiDetection.utils.ts` | Scan and finding database queries |
| `utils/aiDetectionRiskScoring.utils.ts` | Risk scoring database queries |
| `domain.layer/interfaces/i.aiDetection.ts` | Type definitions |

### Frontend

| File | Purpose |
|------|---------|
| `pages/AIDetection/index.tsx` | Main container with routing |
| `pages/AIDetection/ScanPage.tsx` | Scan initiation |
| `pages/AIDetection/ScanDetailsPage.tsx` | Finding details (9 tabs) |
| `pages/AIDetection/HistoryPage.tsx` | Scan history with risk scores |
| `pages/AIDetection/SettingsPage.tsx` | Tokens, risk scoring, vulnerability settings |
| `pages/AIDetection/RepositoriesPage.tsx` | Repository registry and scheduling |
| `pages/AIDetection/AddRepositoryModal.tsx` | Repository registration modal |
| `pages/AIDetection/components/RiskScoreCard.tsx` | Risk score visualization |
| `repository/aiDetection.repository.ts` | API client |

## Related Documentation

- [Integrations](../infrastructure/integrations.md) - GitHub token setup
- [Model Inventory](./models.md) - Model management
- [Risk Management](./risk-management.md) - Risk tracking
