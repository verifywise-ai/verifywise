# Eval → Model Inventory Linking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to optionally link LLM experiments and bias audits to a model in their inventory, then view linked evaluations on the model detail page with risk nudges for flagged results.

**Architecture:** Add nullable `model_inventory_id` column to `llm_evals_experiments` and `llm_evals_bias_audits` via Alembic migration. Frontend adds an optional dropdown to creation modals, populated from the existing model inventory API. The model detail page gets a new "Evaluations" tab that reads from `llm_evals_*` tables via a new Servers endpoint. A risk nudge banner surfaces when linked evals have failed metrics.

**Tech Stack:** Python/FastAPI (EvalServer), Node.js/Express (Servers), React/TypeScript/MUI (Clients), PostgreSQL, Alembic migrations

---

### Task 1: Alembic migration — add model_inventory_id columns

**Files:**
- Create: `EvalServer/src/database/migrations/versions/f20260412000000_add_model_inventory_id.py`

- [ ] **Step 1: Create the migration file**

```python
"""add-model-inventory-id

Revision ID: f20260412000000
Revises: e20260319200000
Create Date: 2026-04-12

Adds nullable model_inventory_id column to llm_evals_experiments and
llm_evals_bias_audits for optional linking to the model inventory.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f20260412000000'
down_revision: Union[str, None] = 'e20260319200000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add model_inventory_id to experiments and bias audits."""
    op.execute(sa.text('''
        ALTER TABLE verifywise.llm_evals_experiments
        ADD COLUMN IF NOT EXISTS model_inventory_id INTEGER NULL;
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_experiments_model_inventory_id
        ON verifywise.llm_evals_experiments(model_inventory_id);
    '''))

    op.execute(sa.text('''
        ALTER TABLE verifywise.llm_evals_bias_audits
        ADD COLUMN IF NOT EXISTS model_inventory_id INTEGER NULL;
    '''))
    op.execute(sa.text('''
        CREATE INDEX IF NOT EXISTS idx_llm_evals_bias_audits_model_inventory_id
        ON verifywise.llm_evals_bias_audits(model_inventory_id);
    '''))


def downgrade() -> None:
    """Remove model_inventory_id columns."""
    op.execute(sa.text('''
        DROP INDEX IF EXISTS verifywise.idx_llm_evals_bias_audits_model_inventory_id;
    '''))
    op.execute(sa.text('''
        ALTER TABLE verifywise.llm_evals_bias_audits
        DROP COLUMN IF EXISTS model_inventory_id;
    '''))
    op.execute(sa.text('''
        DROP INDEX IF EXISTS verifywise.idx_llm_evals_experiments_model_inventory_id;
    '''))
    op.execute(sa.text('''
        ALTER TABLE verifywise.llm_evals_experiments
        DROP COLUMN IF EXISTS model_inventory_id;
    '''))
```

- [ ] **Step 2: Run the migration**

Run: `cd EvalServer/src && alembic upgrade head`
Expected: Migration applies successfully, both columns added.

- [ ] **Step 3: Verify columns exist**

Run: `cd EvalServer/src && python -c "import asyncio; from database.db import get_db; asyncio.run((lambda: None)())" && psql -d verifywise_db -c "SELECT column_name FROM information_schema.columns WHERE table_schema='verifywise' AND table_name='llm_evals_experiments' AND column_name='model_inventory_id';"`

Expected: One row returned showing `model_inventory_id`.

- [ ] **Step 4: Commit**

```bash
git add EvalServer/src/database/migrations/versions/f20260412000000_add_model_inventory_id.py
git commit -m "feat(eval): add model_inventory_id column to experiments and bias audits

Alembic migration adds nullable INTEGER column and index to both
llm_evals_experiments and llm_evals_bias_audits tables. No FK constraint
(cross-schema reference) — validated at application level."
```

---

### Task 2: EvalServer CRUD — accept and return model_inventory_id

**Files:**
- Modify: `EvalServer/src/crud/evaluation_logs.py:303-360` (create_experiment function)
- Modify: `EvalServer/src/crud/bias_audits.py:19-57` (create_bias_audit function)
- Modify: `EvalServer/src/crud/bias_audits.py:300-317` (_row_to_dict function)

- [ ] **Step 1: Update experiment CRUD — create_experiment**

In `EvalServer/src/crud/evaluation_logs.py`, update the `create_experiment` function (line 303) to accept `model_inventory_id`:

Add parameter:
```python
async def create_experiment(
    db: AsyncSession,
    project_id: str,
    name: str,
    config: Dict,
    organization_id: int,
    description: Optional[str] = None,
    baseline_experiment_id: Optional[str] = None,
    created_by: Optional[int] = None,
    model_inventory_id: Optional[int] = None,  # NEW
) -> Optional[Dict[str, Any]]:
```

Update the INSERT SQL (line 327) to include the new column:
```sql
INSERT INTO llm_evals_experiments
(id, organization_id, project_id, name, description, config, baseline_experiment_id, status, created_by, model_inventory_id)
VALUES (:id, :organization_id, :project_id, :name, :description, CAST(:config_json AS jsonb), :baseline_experiment_id, :status, :created_by, :model_inventory_id)
RETURNING id, name, status, created_at, model_inventory_id
```

Add to params dict:
```python
"model_inventory_id": model_inventory_id,
```

Update the return dict to include `model_inventory_id`:
```python
return {
    "id": row["id"],
    "name": row["name"],
    "status": row["status"],
    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    "model_inventory_id": row["model_inventory_id"],
}
```

- [ ] **Step 2: Update experiment CRUD — get/list functions**

Find all SELECT queries in `EvalServer/src/crud/evaluation_logs.py` that read from `llm_evals_experiments` and add `model_inventory_id` to the SELECT column list and to the returned dict. Key functions to update:
- `get_experiment` 
- `get_experiments` (list function)

Search for these with: `grep -n "SELECT.*FROM llm_evals_experiments" EvalServer/src/crud/evaluation_logs.py`

For each SELECT, add `model_inventory_id` to the column list. For each result mapping, add `"model_inventory_id": row["model_inventory_id"]` or `"modelInventoryId": row["model_inventory_id"]` (match the existing camelCase/snake_case convention used in that function).

- [ ] **Step 3: Update bias audit CRUD — create_bias_audit**

In `EvalServer/src/crud/bias_audits.py:19`, add `model_inventory_id` parameter:

```python
async def create_bias_audit(
    organization_id: int,
    db: AsyncSession,
    *,
    audit_id: str,
    project_id: Optional[str],
    preset_id: str,
    preset_name: str,
    mode: str,
    config: Dict[str, Any],
    created_by: Optional[str] = None,
    model_inventory_id: Optional[int] = None,  # NEW
) -> Optional[Dict[str, Any]]:
```

Update the INSERT SQL (line 35):
```sql
INSERT INTO llm_evals_bias_audits
(id, organization_id, project_id, preset_id, preset_name, mode, status, config, created_by, model_inventory_id)
VALUES
(:id, :organization_id, :project_id, :preset_id, :preset_name, :mode, 'pending', :config, :created_by, :model_inventory_id)
RETURNING id, organization_id, project_id, preset_id, preset_name, mode, status,
          config, results, error, created_at, updated_at, completed_at, created_by, model_inventory_id
```

Add to params dict:
```python
"model_inventory_id": model_inventory_id,
```

- [ ] **Step 4: Update bias audit CRUD — _row_to_dict**

In `EvalServer/src/crud/bias_audits.py:300`, add `model_inventory_id` to the `_row_to_dict` function:

```python
def _row_to_dict(row) -> Dict[str, Any]:
    """Convert a database row to a camelCase dict for API responses."""
    return {
        "id": row["id"],
        "orgId": str(row["organization_id"]) if row["organization_id"] else None,
        "projectId": row["project_id"],
        "presetId": row["preset_id"],
        "presetName": row["preset_name"],
        "mode": row["mode"],
        "status": row["status"],
        "config": _safe_json_load(row["config"], {}),
        "results": _safe_json_load(row["results"]),
        "error": row["error"],
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        "completedAt": row["completed_at"].isoformat() if row["completed_at"] else None,
        "createdBy": row["created_by"],
        "modelInventoryId": row["model_inventory_id"],  # NEW
    }
```

Also update ALL SELECT queries in `get_bias_audit`, `list_bias_audits`, and `update_bias_audit_status` to include `model_inventory_id` in their column lists and RETURNING clauses.

- [ ] **Step 5: Commit**

```bash
git add EvalServer/src/crud/evaluation_logs.py EvalServer/src/crud/bias_audits.py
git commit -m "feat(eval): accept model_inventory_id in experiment and bias audit CRUD

Both create functions now accept optional model_inventory_id parameter.
All SELECT/RETURNING queries include the new column. Bias audit
_row_to_dict returns it as camelCase modelInventoryId."
```

---

### Task 3: EvalServer API — pass model_inventory_id through routers and controllers

**Files:**
- Modify: `EvalServer/src/routers/evaluation_logs.py:137-142` (CreateExperimentRequest)
- Modify: `EvalServer/src/controllers/evaluation_logs.py` (create_experiment_controller)
- Modify: `EvalServer/src/controllers/bias_audits.py:59-149` (create_bias_audit_controller)

- [ ] **Step 1: Update CreateExperimentRequest Pydantic model**

In `EvalServer/src/routers/evaluation_logs.py:137`:

```python
class CreateExperimentRequest(BaseModel):
    project_id: str
    name: str
    description: Optional[str] = None
    config: Dict[str, Any]
    baseline_experiment_id: Optional[str] = None
    model_inventory_id: Optional[int] = None  # NEW
```

- [ ] **Step 2: Pass model_inventory_id through experiment controller**

Find `create_experiment_controller` in `EvalServer/src/controllers/evaluation_logs.py`. It receives `data` dict from `experiment_data.dict()` (called at `evaluation_logs.py:347`). Ensure it passes `model_inventory_id` to the CRUD `create_experiment` call.

Search for where `create_experiment` is called from the controller:
```bash
grep -n "create_experiment" EvalServer/src/controllers/evaluation_logs.py
```

Add `model_inventory_id=data.get("model_inventory_id")` to the CRUD call.

- [ ] **Step 3: Pass model_inventory_id through bias audit controller**

In `EvalServer/src/controllers/bias_audits.py:116`, the `create_bias_audit` CRUD call:

```python
created = await create_bias_audit(
    organization_id=organization_id,
    db=db,
    audit_id=audit_id,
    project_id=config_data.get("projectId"),
    preset_id=preset_id,
    preset_name=preset_name,
    mode=mode,
    config=config_data,
    created_by=user_id,
    model_inventory_id=config_data.get("modelInventoryId"),  # NEW
)
```

The frontend sends `modelInventoryId` inside `config_json` (the JSON string in the multipart form). The controller already parses `config_json` into `config_data` at line 76, so `config_data.get("modelInventoryId")` will extract it.

- [ ] **Step 4: Commit**

```bash
git add EvalServer/src/routers/evaluation_logs.py EvalServer/src/controllers/evaluation_logs.py EvalServer/src/controllers/bias_audits.py
git commit -m "feat(eval): pass model_inventory_id through API layer

Experiment Pydantic model accepts optional model_inventory_id.
Bias audit controller extracts modelInventoryId from config_json.
Both pass through to CRUD layer."
```

---

### Task 4: Frontend — model inventory dropdown on NewExperimentModal

**Files:**
- Modify: `Clients/src/infrastructure/api/evaluationLogsService.ts:40-56` (Experiment interface)
- Modify: `Clients/src/infrastructure/api/evaluationLogsService.ts:191-199` (createExperiment)
- Modify: `Clients/src/presentation/pages/EvalsDashboard/NewExperimentModal.tsx`

- [ ] **Step 1: Update Experiment interface**

In `Clients/src/infrastructure/api/evaluationLogsService.ts:40`, add:

```typescript
export interface Experiment {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  config: Record<string, any>;
  baseline_experiment_id?: string;
  status: string;
  results?: Record<string, any>;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  tenant: string;
  created_by?: number;
  model_inventory_id?: number;  // NEW
}
```

Also update the `createExperiment` method signature (line 191) to accept `model_inventory_id`:

```typescript
async createExperiment(data: {
  project_id: string;
  name: string;
  description?: string;
  config: Record<string, any>;
  baseline_experiment_id?: string;
  model_inventory_id?: number;  // NEW
}) {
  const response = await CustomAxios.post("/deepeval/experiments", data);
  return response.data;
},
```

- [ ] **Step 2: Add model inventory state and fetch to NewExperimentModal**

In `NewExperimentModal.tsx`, add imports and state near the top (after existing imports around line 60):

```typescript
import { getAllModelInventories } from "../../../application/repository/modelInventory.repository";
```

Find the repository file first to confirm the exact function name:
```bash
grep -n "export.*getAll\|export.*list.*Model" Clients/src/application/repository/modelInventory.repository.ts
```

Add state inside the component (near other useState declarations):

```typescript
const [modelInventories, setModelInventories] = useState<Array<{ id: number; provider: string; model: string; version: string; status: string }>>([]);
const [selectedModelInventoryId, setSelectedModelInventoryId] = useState<number | null>(null);
```

Add a useEffect to fetch model inventories when the modal opens:

```typescript
useEffect(() => {
  if (open) {
    getAllModelInventories().then((data) => {
      setModelInventories(data || []);
    }).catch(() => {
      // Non-critical — dropdown just stays empty
    });
  }
}, [open]);
```

Confirm the exact function and route by checking the repository file.

- [ ] **Step 3: Add dropdown UI to the experiment form**

Find a good placement — ideally in the first step of the StepperModal, near the model selection area. Add after the model name/access method fields:

```tsx
{/* Link to model inventory (optional) */}
<Box sx={{ mt: "16px" }}>
  <Typography variant="body2" sx={{ mb: "4px", fontWeight: 500, fontSize: "13px", color: palette.text.secondary }}>
    Link to model inventory (optional)
  </Typography>
  <FormControl fullWidth size="small">
    <Select
      value={selectedModelInventoryId ?? ""}
      onChange={(e) => setSelectedModelInventoryId(e.target.value === "" ? null : Number(e.target.value))}
      displayEmpty
      sx={{ height: "34px", fontSize: "13px", borderRadius: "4px" }}
    >
      <MenuItem value="">
        <Typography sx={{ fontSize: "13px", color: palette.text.secondary }}>None — don't link to inventory</Typography>
      </MenuItem>
      {modelInventories.map((m) => (
        <MenuItem key={m.id} value={m.id}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography sx={{ fontSize: "13px" }}>{m.provider} — {m.model}</Typography>
            <Typography sx={{ fontSize: "11px", color: palette.text.secondary }}>v{m.version}</Typography>
          </Stack>
        </MenuItem>
      ))}
    </Select>
  </FormControl>
</Box>
```

- [ ] **Step 4: Pass selectedModelInventoryId in the submit handler**

In `NewExperimentModal.tsx` around line 686, where `createExperiment(experimentConfig)` is called, ensure `model_inventory_id` is included in `experimentConfig`:

Find where `experimentConfig` is built (around line 620-681) and add `model_inventory_id`:

```typescript
const experimentConfig = {
  project_id: projectId,
  name: experimentName.trim(),
  config: {
    // ... existing config fields ...
  },
  model_inventory_id: selectedModelInventoryId || undefined,  // NEW
};
```

- [ ] **Step 5: Reset state on close**

Find the modal close/reset handler and add:
```typescript
setSelectedModelInventoryId(null);
```

- [ ] **Step 6: Commit**

```bash
git add Clients/src/infrastructure/api/evaluationLogsService.ts Clients/src/presentation/pages/EvalsDashboard/NewExperimentModal.tsx
git commit -m "feat(eval): add model inventory dropdown to experiment creation modal

Optional Select dropdown populated from model inventory API. Selected
model_inventory_id is sent with the experiment creation payload.
Default is 'None — don't link to inventory'."
```

---

### Task 5: Frontend — model inventory dropdown on NewBiasAuditModal

**Files:**
- Modify: `Clients/src/infrastructure/api/biasAuditService.ts:188-217` (CreateBiasAuditConfig)
- Modify: `Clients/src/presentation/pages/EvalsDashboard/NewBiasAuditModal.tsx`

- [ ] **Step 1: Update CreateBiasAuditConfig interface**

In `Clients/src/infrastructure/api/biasAuditService.ts:188`, add:

```typescript
export interface CreateBiasAuditConfig {
  // ... existing fields ...
  dataDateRangeStart?: string;
  dataDateRangeEnd?: string;
  modelInventoryId?: number;  // NEW
}
```

- [ ] **Step 2: Add model inventory state and dropdown to NewBiasAuditModal**

Same pattern as Task 4. In `NewBiasAuditModal.tsx`:

Add import:
```typescript
import { getAllModelInventories } from "../../../application/repository/modelInventory.repository";
```

Add state:
```typescript
const [modelInventories, setModelInventories] = useState<Array<{ id: number; provider: string; model: string; version: string; status: string }>>([]);
const [selectedModelInventoryId, setSelectedModelInventoryId] = useState<number | null>(null);
```

Add useEffect (same as Task 4 Step 2).

Place the dropdown in step 2 of the StepperModal (the AEDT information step), near the existing `systemName` and `systemVersion` fields. Use `Select` from `../../components/Inputs/Select` (already imported at line 22):

```tsx
{/* Link to model inventory (optional) */}
<Box sx={{ mt: "16px" }}>
  <Select
    id="model-inventory-link"
    label="Link to model inventory (optional)"
    placeholder="None — don't link to inventory"
    value={selectedModelInventoryId !== null ? String(selectedModelInventoryId) : ""}
    onChange={(e: { target: { value: string } }) =>
      setSelectedModelInventoryId(e.target.value === "" ? null : Number(e.target.value))
    }
    items={[
      { _id: "", name: "None — don't link to inventory" },
      ...modelInventories.map((m) => ({
        _id: String(m.id),
        name: `${m.provider} — ${m.model} (v${m.version})`,
      })),
    ]}
    sx={{ width: "100%" }}
  />
</Box>
```

Note: Check the exact `Select` component API — it may use `items` with `{ _id, name }` shape (VerifyWise custom Select pattern). Verify by reading `Clients/src/presentation/components/Inputs/Select/index.tsx`.

- [ ] **Step 3: Pass modelInventoryId in the submit config**

In `NewBiasAuditModal.tsx:319-348`, where `config: CreateBiasAuditConfig` is built, add:

```typescript
const config: CreateBiasAuditConfig = {
  // ... existing fields ...
  dataSource: dataSourceDescription,
  modelInventoryId: selectedModelInventoryId || undefined,  // NEW
  metadata: {
    distribution_date: distributionDate,
  },
};
```

- [ ] **Step 4: Reset state on close, commit**

Add `setSelectedModelInventoryId(null)` to the close handler.

```bash
git add Clients/src/infrastructure/api/biasAuditService.ts Clients/src/presentation/pages/EvalsDashboard/NewBiasAuditModal.tsx
git commit -m "feat(eval): add model inventory dropdown to bias audit creation modal

Optional Select dropdown in AEDT information step. Sends
modelInventoryId in config_json payload for bias audit creation."
```

---

### Task 6: Servers endpoint — fetch evaluations by model inventory ID

**Files:**
- Create: `Servers/utils/modelEvaluations.utils.ts`
- Create: `Servers/controllers/modelEvaluations.ctrl.ts`
- Modify: `Servers/routes/modelInventory.route.ts`

- [ ] **Step 1: Create the utils file with raw SQL query**

Create `Servers/utils/modelEvaluations.utils.ts`:

```typescript
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

/**
 * Fetch all experiments and bias audits linked to a model inventory record.
 * Reads from llm_evals_* tables (same Postgres, verifywise schema).
 */
export async function getEvaluationsByModelInventoryId(
  modelInventoryId: number,
  organizationId: number
) {
  const experiments = await sequelize.query(
    `SELECT id, name, status, config, results, error_message,
            started_at, completed_at, created_at, created_by,
            'experiment' AS eval_type
     FROM llm_evals_experiments
     WHERE model_inventory_id = :modelInventoryId
       AND organization_id = :organizationId
     ORDER BY created_at DESC`,
    {
      replacements: { modelInventoryId, organizationId },
      type: QueryTypes.SELECT,
    }
  );

  const biasAudits = await sequelize.query(
    `SELECT id, preset_name AS name, status, config, results, error,
            completed_at, created_at, created_by,
            'bias_audit' AS eval_type
     FROM llm_evals_bias_audits
     WHERE model_inventory_id = :modelInventoryId
       AND organization_id = :organizationId
     ORDER BY created_at DESC`,
    {
      replacements: { modelInventoryId, organizationId },
      type: QueryTypes.SELECT,
    }
  );

  return { experiments, biasAudits };
}
```

- [ ] **Step 2: Create the controller**

Create `Servers/controllers/modelEvaluations.ctrl.ts`:

```typescript
import { Request, Response } from "express";
import { getEvaluationsByModelInventoryId } from "../utils/modelEvaluations.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";

export async function getModelEvaluations(req: Request, res: Response) {
  const source = "getModelEvaluations";
  logProcessing(source, req);

  try {
    const modelInventoryId = parseInt(req.params.id, 10);
    const organizationId = req.organizationId;

    if (isNaN(modelInventoryId)) {
      return res.status(400).json({ error: "Invalid model inventory ID" });
    }

    const data = await getEvaluationsByModelInventoryId(
      modelInventoryId,
      organizationId
    );

    logSuccess(source, req);
    return res.status(200).json(data);
  } catch (error) {
    logFailure(source, req, error);
    return res.status(500).json({ error: "Failed to fetch evaluations" });
  }
}
```

- [ ] **Step 3: Add route**

In `Servers/routes/modelInventory.route.ts`, add:

Import at top:
```typescript
import { getModelEvaluations } from "../controllers/modelEvaluations.ctrl";
```

Add route (before the POST route, after GET routes):
```typescript
router.get("/:id/evaluations", authenticateJWT, getModelEvaluations);
```

- [ ] **Step 4: Verify Servers build**

Run: `cd Servers && npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/modelEvaluations.utils.ts Servers/controllers/modelEvaluations.ctrl.ts Servers/routes/modelInventory.route.ts
git commit -m "feat(api): add GET /api/modelInventories/:id/evaluations endpoint

Reads experiments and bias audits from llm_evals_* tables filtered by
model_inventory_id. Returns { experiments, biasAudits } arrays."
```

---

### Task 7: Frontend — "Evaluations" tab on Model Inventory detail page

**Files:**
- Create: `Clients/src/presentation/pages/ModelInventory/ModelEvaluationsTab.tsx`
- Modify: `Clients/src/presentation/pages/ModelInventory/index.tsx`
- Create: `Clients/src/application/repository/modelEvaluations.repository.ts`

- [ ] **Step 1: Create the repository**

Create `Clients/src/application/repository/modelEvaluations.repository.ts`:

```typescript
import apiServices from "../../infrastructure/api/customAxios";

export interface ModelEvaluation {
  id: string;
  name: string;
  status: string;
  config: Record<string, any>;
  results?: Record<string, any>;
  error_message?: string;
  error?: string;
  completed_at?: string;
  created_at: string;
  created_by?: string;
  eval_type: "experiment" | "bias_audit";
}

export interface ModelEvaluationsResponse {
  experiments: ModelEvaluation[];
  biasAudits: ModelEvaluation[];
}

export async function getModelEvaluations(
  modelInventoryId: number
): Promise<ModelEvaluationsResponse> {
  const response = await apiServices.get(
    `/modelInventories/${modelInventoryId}/evaluations`
  );
  return response.data;
}
```

- [ ] **Step 2: Create the Evaluations tab component**

Create `Clients/src/presentation/pages/ModelInventory/ModelEvaluationsTab.tsx`:

```tsx
import { useState, useEffect, useMemo } from "react";
import { Box, Stack, Typography, Alert } from "@mui/material";
import { FlaskConical, AlertTriangle } from "lucide-react";
import Chip from "../../components/Chip";
import CustomizableBasicTable from "../../components/Table/CustomizableBasicTable";
import { palette } from "../../themes/palette";
import {
  getModelEvaluations,
  type ModelEvaluation,
  type ModelEvaluationsResponse,
} from "../../../application/repository/modelEvaluations.repository";

interface ModelEvaluationsTabProps {
  modelInventoryId: number;
}

const statusColorMap: Record<string, string> = {
  completed: "#4caf50",
  running: "#ff9800",
  pending: "#9e9e9e",
  failed: "#f44336",
};

/**
 * Check if an experiment has any failed metrics (score < threshold).
 */
function hasFailedMetrics(eval_: ModelEvaluation): boolean {
  if (eval_.eval_type === "experiment") {
    const results = eval_.results;
    if (!results?.metric_results) return false;
    const thresholds = eval_.config?.thresholds || eval_.config?.metric_thresholds || {};
    for (const [metric, data] of Object.entries(results.metric_results)) {
      const score = (data as any)?.average ?? (data as any)?.score;
      const threshold = thresholds[metric];
      if (score !== undefined && threshold !== undefined && score < threshold) {
        return true;
      }
    }
    return false;
  }

  if (eval_.eval_type === "bias_audit") {
    const results = eval_.results;
    if (!results?.categories) return false;
    for (const cat of Object.values(results.categories) as any[]) {
      if (cat?.groups) {
        for (const group of cat.groups) {
          if (group.flagged) return true;
        }
      }
    }
    return false;
  }

  return false;
}

function getKeyResult(eval_: ModelEvaluation): string {
  if (eval_.eval_type === "experiment") {
    const results = eval_.results?.metric_results;
    if (!results) return "—";
    const entries = Object.entries(results);
    if (entries.length === 0) return "—";
    const [metric, data] = entries[0];
    const score = (data as any)?.average ?? (data as any)?.score;
    return score !== undefined ? `${metric}: ${(score as number).toFixed(2)}` : "—";
  }

  if (eval_.eval_type === "bias_audit") {
    const results = eval_.results;
    if (!results?.categories) return "—";
    const cats = Object.values(results.categories) as any[];
    const totalGroups = cats.reduce((sum, c) => sum + (c?.groups?.length || 0), 0);
    const flagged = cats.reduce(
      (sum, c) => sum + (c?.groups?.filter((g: any) => g.flagged)?.length || 0),
      0
    );
    return flagged > 0 ? `${flagged}/${totalGroups} flagged` : `${totalGroups} groups passed`;
  }

  return "—";
}

export default function ModelEvaluationsTab({ modelInventoryId }: ModelEvaluationsTabProps) {
  const [data, setData] = useState<ModelEvaluationsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getModelEvaluations(modelInventoryId)
      .then(setData)
      .catch(() => setData({ experiments: [], biasAudits: [] }))
      .finally(() => setLoading(false));
  }, [modelInventoryId]);

  const allEvals = useMemo(() => {
    if (!data) return [];
    return [...data.experiments, ...data.biasAudits].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [data]);

  const flaggedCount = useMemo(
    () => allEvals.filter(hasFailedMetrics).length,
    [allEvals]
  );

  const columns = ["NAME", "TYPE", "STATUS", "KEY RESULT", "DATE"];

  const rows = allEvals.map((e) => ({
    id: e.id,
    data: [
      { text: e.name || e.id },
      {
        text: e.eval_type === "experiment" ? "Experiment" : "Bias audit",
      },
      {
        text: (
          <Chip
            label={e.status}
            sx={{
              backgroundColor: `${statusColorMap[e.status] || "#9e9e9e"}20`,
              color: statusColorMap[e.status] || "#9e9e9e",
              fontSize: "11px",
              height: "22px",
            }}
          />
        ),
      },
      {
        text: (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography sx={{ fontSize: "13px" }}>{getKeyResult(e)}</Typography>
            {hasFailedMetrics(e) && (
              <AlertTriangle size={14} color="#f44336" strokeWidth={1.5} />
            )}
          </Stack>
        ),
      },
      {
        text: e.created_at
          ? new Date(e.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "—",
      },
    ],
  }));

  if (loading) {
    return (
      <Box sx={{ p: "24px", textAlign: "center" }}>
        <Typography sx={{ fontSize: "13px", color: palette.text.secondary }}>
          Loading evaluations...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: "16px" }}>
      {/* Risk nudge banner */}
      {flaggedCount > 0 && (
        <Alert
          severity="warning"
          icon={<AlertTriangle size={16} strokeWidth={1.5} />}
          sx={{ mb: "16px", fontSize: "13px", borderRadius: "4px" }}
        >
          {flaggedCount} evaluation{flaggedCount !== 1 ? "s" : ""} flagged a potential risk.
          Consider adding {flaggedCount !== 1 ? "these" : "this"} to the risk register.
        </Alert>
      )}

      {allEvals.length === 0 ? (
        <Box sx={{ textAlign: "center", py: "48px" }}>
          <FlaskConical size={32} color={palette.text.secondary} strokeWidth={1.5} />
          <Typography sx={{ mt: "8px", fontSize: "13px", color: palette.text.secondary }}>
            No evaluations linked to this model yet
          </Typography>
        </Box>
      ) : (
        <CustomizableBasicTable
          columns={columns}
          rows={rows}
          page={1}
          setCurrentPagingation={() => {}}
        />
      )}
    </Box>
  );
}
```

- [ ] **Step 3: Add the tab to ModelInventory/index.tsx**

In `Clients/src/presentation/pages/ModelInventory/index.tsx`:

Add import near top:
```typescript
import ModelEvaluationsTab from "./ModelEvaluationsTab";
```

Add the tab definition in the TabBar `tabs` array (around line 2136, after the "model-risks" tab and before the pluginTabs spread):
```typescript
{
  label: "Evaluations",
  value: "evaluations",
  icon: "Database" as const,
  tooltip: "LLM evaluations and bias audits linked to models in your inventory",
},
```

Update the `isBuiltInTab` check (line 720) to include "evaluations":
```typescript
const isBuiltInTab = ["models", "model-risks", "evidence-hub", "evaluations"].includes(newTab);
```

Update `getTabFromPath` (line 700) to detect the evaluations tab:
```typescript
if (pathname.includes("evaluations")) return "evaluations";
```

Add conditional rendering for the tab content (find where `activeTab === "models"` and `activeTab === "model-risks"` are rendered, and add after the model-risks block):

```tsx
{activeTab === "evaluations" && (
  <Box sx={{ mt: "16px" }}>
    <ModelEvaluationsTab
      modelInventoryId={/* pass the current model ID if on a single-model view, or 0 for list view */}
    />
  </Box>
)}
```

**Important**: The ModelInventory page appears to be a list view with tabs, not a single-model detail view. The evaluations tab needs to show evaluations across ALL models in the inventory. Adjust the component to accept an array of model IDs or fetch all linked evals for the org. Check how the page works — if it's a list page, the "Evaluations" tab should show all evals that are linked to any model, grouped by model.

Alternatively, if the page does show individual model details (via selecting a row), pass the selected model's ID.

Read the page more carefully to determine the correct approach. The key question: is there a "selected model" state, or is this purely a list view?

- [ ] **Step 4: Verify Clients build**

Run: `cd Clients && npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add Clients/src/application/repository/modelEvaluations.repository.ts Clients/src/presentation/pages/ModelInventory/ModelEvaluationsTab.tsx Clients/src/presentation/pages/ModelInventory/index.tsx
git commit -m "feat(ui): add Evaluations tab to model inventory page

Shows linked experiments and bias audits in a table with status, key
result, and date. Warning banner when evaluations have flagged results
suggesting risk register consideration."
```

---

### Task 8: Frontend — "Unlinked" indicator on experiment and bias audit lists

**Files:**
- Modify: `Clients/src/presentation/pages/EvalsDashboard/ProjectExperiments.tsx`
- Modify: `Clients/src/presentation/pages/EvalsDashboard/BiasAuditsList.tsx`

- [ ] **Step 1: Add "Linked model" column to experiments table**

In `ProjectExperiments.tsx:484`, add "LINKED MODEL" to tableColumns:

```typescript
const tableColumns = ["EXPERIMENT NAME", "MODEL", "JUDGE/SCORER", "# PROMPTS", "DATASET", "LINKED MODEL", "DATE", "ACTION"];
```

In the `tableRows` mapping (line 486), add a cell for the linked model. The experiment data should now include `model_inventory_id` from the API. Add the cell:

```typescript
{
  text: exp.model_inventory_id ? (
    <Chip label="Linked" sx={{ backgroundColor: "#e8f5e9", color: "#2e7d32", fontSize: "11px", height: "22px" }} />
  ) : (
    <Typography sx={{ fontSize: "11px", color: palette.text.secondary }}>Unlinked</Typography>
  ),
},
```

Place this cell at the correct position in the row data array (after DATASET, before DATE).

- [ ] **Step 2: Add "Linked model" column to bias audits list**

In `BiasAuditsList.tsx`, follow the same pattern. Find the table columns definition and add "LINKED MODEL". In the row mapping, add a cell checking for `modelInventoryId` (camelCase, matching the _row_to_dict output).

- [ ] **Step 3: Verify Clients build**

Run: `cd Clients && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add Clients/src/presentation/pages/EvalsDashboard/ProjectExperiments.tsx Clients/src/presentation/pages/EvalsDashboard/BiasAuditsList.tsx
git commit -m "feat(ui): show linked/unlinked model indicator on eval lists

Experiments and bias audits tables show a 'Linked' chip or 'Unlinked'
text based on whether model_inventory_id is set."
```

---

### Task 9: Build verification and manual testing

**Files:**
- No new files

- [ ] **Step 1: Run Servers build**

Run: `cd Servers && npm run build`
Expected: No TypeScript errors.

- [ ] **Step 2: Run Clients build**

Run: `cd Clients && npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Start dev servers and test the flow**

Start all services:
```bash
# Terminal 1
cd Servers && npm run watch
# Terminal 2
cd Clients && npm run dev
# Terminal 3
cd EvalServer/src && alembic upgrade head && uvicorn app:app --port 8000 --workers 1
```

Test:
1. Navigate to LLM Evals → create a new experiment
2. Verify the "Link to model inventory" dropdown appears and is populated
3. Select a model and create the experiment
4. Navigate to Model Inventory → Evaluations tab
5. Verify the linked experiment appears in the table
6. Create an experiment WITHOUT selecting a model — verify it works (dropdown is optional)
7. Check the experiment list — verify "Linked" / "Unlinked" indicators

- [ ] **Step 4: Test bias audit flow**

1. Navigate to LLM Evals → Bias Audits → create a new audit
2. Verify the "Link to model inventory" dropdown appears in step 2
3. Select a model and run the audit
4. After completion, check Model Inventory → Evaluations tab
5. Verify the bias audit appears with correct status and result summary

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(eval): address issues found during manual testing"
```
