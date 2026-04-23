# GRS Dataset Explorer Notebook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write `pre_sampling_analysis.ipynb` — an interactive Jupyter notebook for exploring GRS v3.0 dataset pool statistics across three source datasets before running the sampling operation.

**Architecture:** Single notebook, one `pd.DataFrame` built at load time, all 8 sections read from it. No file writes, no sampling code — read-only exploration. Each section is a self-contained block of markdown + code cells.

**Tech Stack:** Python 3.12, pandas, matplotlib, seaborn, pyyaml, jupyter/ipykernel — all managed via `uv`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `pre_sampling_analysis.ipynb` | **Create** | The entire notebook — all 8 sections |
| `configs/obligations.yaml` | Read-only | Source of truth for seeded obligation IDs |
| `datasets/grs_scenarios_v0.{1,2,3}/final/scenarios.jsonl` | Read-only | The three source datasets |

No new files are created.

---

## Task 1: Reset Notebook and Write Scaffold

**Files:**
- Replace: `pre_sampling_analysis.ipynb`

The existing notebook has two broken cells pointing at a non-existent parquet file. Replace it entirely with a clean scaffold: title markdown cell + imports cell + config cell.

- [ ] **Step 1: Write the fresh notebook JSON**

Write the following to `pre_sampling_analysis.ipynb` (valid `.ipynb` v4 format):

```json
{
 "nbformat": 4,
 "nbformat_minor": 5,
 "metadata": {
  "kernelspec": {
   "display_name": "Python 3",
   "language": "python",
   "name": "python3"
  },
  "language_info": {
   "name": "python",
   "version": "3.12.0"
  }
 },
 "cells": [
  {
   "cell_type": "markdown",
   "id": "title",
   "metadata": {},
   "source": [
    "# GRS Dataset Explorer\n",
    "\n",
    "Interactive exploration of the GRS v3.0 dataset pool before sampling.\n",
    "\n",
    "**Run order:** Execute cells top-to-bottom. Edit the config cell (Section 1) before running."
   ]
  },
  {
   "cell_type": "markdown",
   "id": "s1-header",
   "metadata": {},
   "source": ["## Section 1 — Config & Data Loading"]
  },
  {
   "cell_type": "code",
   "id": "config",
   "metadata": {},
   "source": [
    "# ── USER CONFIG ─────────────────────────────────────────────\n",
    "# Edit this cell before running the notebook.\n",
    "\n",
    "DATASET_ROOT = \"datasets\"\n",
    "\n",
    "SOURCE_MAP = {\n",
    "    \"grs_scenarios_v0.1\": \"GPT-5.2\",\n",
    "    \"grs_scenarios_v0.2\": \"Gemini 2.5\",\n",
    "    \"grs_scenarios_v0.3\": \"Claude Sonnet 4.6\",\n",
    "}\n",
    "\n",
    "OBLIGATIONS_CONFIG = \"configs/obligations.yaml\"\n",
    "# ─────────────────────────────────────────────────────────────"
   ],
   "outputs": [],
   "execution_count": null
  },
  {
   "cell_type": "code",
   "id": "imports",
   "metadata": {},
   "source": [
    "import json\n",
    "import warnings\n",
    "from pathlib import Path\n",
    "\n",
    "import matplotlib.pyplot as plt\n",
    "import numpy as np\n",
    "import pandas as pd\n",
    "import seaborn as sns\n",
    "import yaml\n",
    "\n",
    "warnings.filterwarnings(\"ignore\")\n",
    "sns.set_theme(style=\"whitegrid\", palette=\"tab10\")\n",
    "SOURCE_ORDER = list(SOURCE_MAP.values())\n",
    "COLORS = sns.color_palette(\"tab10\", len(SOURCE_ORDER))"
   ],
   "outputs": [],
   "execution_count": null
  }
 ]
}
```

- [ ] **Step 2: Verify the notebook opens without errors**

```bash
uv run jupyter nbconvert --to script pre_sampling_analysis.ipynb --stdout 2>/dev/null | head -20
```

Expected: prints the config and import lines without error.

- [ ] **Step 3: Commit**

```bash
git add pre_sampling_analysis.ipynb
git commit -m "feat(notebook): scaffold GRS dataset explorer with config and imports"
```

---

## Task 2: Data Loading Cell

**Files:**
- Modify: `pre_sampling_analysis.ipynb` — append 1 code cell after imports

- [ ] **Step 1: Append the data loading cell**

Add this cell to `pre_sampling_analysis.ipynb` after the imports cell:

```python
# ── DATA LOADING ─────────────────────────────────────────────
records = []
for version, source_name in SOURCE_MAP.items():
    path = Path(DATASET_ROOT) / version / "final" / "scenarios.jsonl"
    with open(path) as f:
        for line in f:
            if line.strip():
                row = json.loads(line)
                row["source"] = source_name
                records.append(row)

df = pd.DataFrame(records)

# Derived columns used throughout all sections
df["is_base"] = df["mutation_trace"].apply(
    lambda x: len(x.get("mutations", [])) == 0
)
df["mutation_families"] = df["mutation_trace"].apply(
    lambda x: [m["family"] for m in x.get("mutations", [])]
)
df["obligation_ids"] = df["seed_trace"].apply(
    lambda x: x.get("obligation_ids", [])
)

# Sanity check
total = len(df)
print(f"Loaded {total} scenarios total")
for source_name in SOURCE_ORDER:
    count = len(df[df["source"] == source_name])
    print(f"  {source_name}: {count} scenarios ({count / total * 100:.1f}%)")
```

- [ ] **Step 2: Execute the notebook and verify output**

```bash
uv run jupyter nbconvert --to notebook --execute --inplace pre_sampling_analysis.ipynb 2>&1 | tail -5
```

Expected: exits 0. Then check the output:

```bash
uv run jupyter nbconvert --to script pre_sampling_analysis.ipynb --stdout 2>/dev/null | grep -A2 "Loaded"
```

Expected output in the executed notebook:
```
Loaded 2004 scenarios total
  GPT-5.2: 570 scenarios (28.4%)
  Gemini 2.5: 641 scenarios (32.0%)
  Claude Sonnet 4.6: 793 scenarios (39.6%)
```
(Exact numbers depend on actual dataset sizes — what matters is no FileNotFoundError and all 3 sources present.)

- [ ] **Step 3: Commit**

```bash
git add pre_sampling_analysis.ipynb
git commit -m "feat(notebook): add data loading cell with derived columns"
```

---

## Task 3: Section 2 — Dataset Inventory

**Files:**
- Modify: `pre_sampling_analysis.ipynb` — append 1 markdown cell + 1 code cell

- [ ] **Step 1: Append the section 2 markdown header cell**

```markdown
## Section 2 — Dataset Inventory

Pre-Sampling Checklist 2.1: counts per source required before drawing samples.
```

- [ ] **Step 2: Append the inventory code cell**

```python
# ── DATASET INVENTORY ────────────────────────────────────────
rows = []
for source_name in SOURCE_ORDER:
    grp = df[df["source"] == source_name]
    total_s = len(grp)
    base_s = int(grp["is_base"].sum())
    mutated_s = total_s - base_s
    unique_obs = len({oid for ids in grp["obligation_ids"] for oid in ids})
    families = sorted({f for fams in grp["mutation_families"] for f in fams})
    rows.append({
        "Source": source_name,
        "Total Scenarios": total_s,
        "Unique Obligations": unique_obs,
        "Base Scenarios": base_s,
        "Mutated Scenarios": mutated_s,
        "Mutation Families": ", ".join(families),
    })

# Combined row
combined_obs = len({oid for ids in df["obligation_ids"] for oid in ids})
combined_fam = sorted({f for fams in df["mutation_families"] for f in fams})
rows.append({
    "Source": "COMBINED",
    "Total Scenarios": len(df),
    "Unique Obligations": combined_obs,
    "Base Scenarios": int(df["is_base"].sum()),
    "Mutated Scenarios": int((~df["is_base"]).sum()),
    "Mutation Families": ", ".join(combined_fam),
})

inventory_df = pd.DataFrame(rows).set_index("Source")
inventory_df.style.set_caption("Dataset Inventory — Pre-Sampling Checklist 2.1")
```

- [ ] **Step 3: Execute and verify**

```bash
uv run jupyter nbconvert --to notebook --execute --inplace pre_sampling_analysis.ipynb 2>&1 | tail -3
```

Expected: exits 0, no KeyError. The styled table renders in Jupyter with one row per source plus COMBINED.

- [ ] **Step 4: Commit**

```bash
git add pre_sampling_analysis.ipynb
git commit -m "feat(notebook): add dataset inventory table (section 2)"
```

---

## Task 4: Section 3 — Source Balance

**Files:**
- Modify: `pre_sampling_analysis.ipynb` — append 1 markdown cell + 1 code cell

- [ ] **Step 1: Append the section 3 markdown header**

```markdown
## Section 3 — Source Balance

Scenario count per source. Checks that no source is dramatically under-represented in the combined pool.
```

- [ ] **Step 2: Append the source balance code cell**

```python
# ── SOURCE BALANCE ───────────────────────────────────────────
source_counts = df.groupby("source").size().reindex(SOURCE_ORDER)
total = len(df)

fig, ax = plt.subplots(figsize=(8, 3))
bars = ax.barh(
    source_counts.index,
    source_counts.values,
    color=COLORS[:len(SOURCE_ORDER)],
)
ax.bar_label(bars, fmt="%d", padding=5)
ax.set_xlabel("Scenario Count")
ax.set_title("Source Balance — Scenario Count per Dataset")
ax.set_xlim(0, source_counts.max() * 1.18)
plt.tight_layout()
plt.show()

print()
for source_name, count in source_counts.items():
    print(f"  {source_name}: {count} scenarios ({count / total * 100:.1f}% of combined pool)")
```

- [ ] **Step 3: Execute and verify**

```bash
uv run jupyter nbconvert --to notebook --execute --inplace pre_sampling_analysis.ipynb 2>&1 | tail -3
```

Expected: exits 0. Chart renders, printout shows 3 lines with count + percentage.

- [ ] **Step 4: Commit**

```bash
git add pre_sampling_analysis.ipynb
git commit -m "feat(notebook): add source balance bar chart (section 3)"
```

---

## Task 5: Section 4 — Scenario Type Distribution

**Files:**
- Modify: `pre_sampling_analysis.ipynb` — append 1 markdown cell + 1 code cell

- [ ] **Step 1: Append the section 4 markdown header**

```markdown
## Section 4 — Scenario Type Distribution

Base vs mutated scenario counts per source. Base = `mutation_trace.mutations` is empty.
```

- [ ] **Step 2: Append the scenario type code cell**

```python
# ── SCENARIO TYPE DISTRIBUTION ───────────────────────────────
table_rows = []
for source_name in SOURCE_ORDER:
    grp = df[df["source"] == source_name]
    total_s = len(grp)
    base_s = int(grp["is_base"].sum())
    mutated_s = total_s - base_s
    table_rows.append({
        "Source": source_name,
        "Base": base_s,
        "Mutated": mutated_s,
        "Base %": base_s / total_s * 100,
        "Mutated %": mutated_s / total_s * 100,
    })

type_df = pd.DataFrame(table_rows)

# Grouped bar chart
x = np.arange(len(SOURCE_ORDER))
width = 0.35
fig, ax = plt.subplots(figsize=(8, 4))
bars1 = ax.bar(x - width / 2, type_df["Base"], width, label="Base", color=COLORS[0])
bars2 = ax.bar(x + width / 2, type_df["Mutated"], width, label="Mutated", color=COLORS[1])
ax.bar_label(bars1, fmt="%d", padding=2)
ax.bar_label(bars2, fmt="%d", padding=2)
ax.set_xticks(x)
ax.set_xticklabels(SOURCE_ORDER)
ax.set_ylabel("Count")
ax.set_title("Scenario Type Distribution — Base vs Mutated per Source")
ax.legend()
plt.tight_layout()
plt.show()

# Summary table
display_df = type_df.copy()
display_df["Base %"] = display_df["Base %"].map("{:.1f}%".format)
display_df["Mutated %"] = display_df["Mutated %"].map("{:.1f}%".format)
display_df.set_index("Source")[["Base", "Base %", "Mutated", "Mutated %"]]
```

- [ ] **Step 3: Execute and verify**

```bash
uv run jupyter nbconvert --to notebook --execute --inplace pre_sampling_analysis.ipynb 2>&1 | tail -3
```

Expected: exits 0. Grouped bar chart renders with 2 bars per source, table shows count + percentage.

- [ ] **Step 4: Commit**

```bash
git add pre_sampling_analysis.ipynb
git commit -m "feat(notebook): add scenario type distribution chart (section 4)"
```

---

## Task 6: Section 5 — Mutation Family Distribution

**Files:**
- Modify: `pre_sampling_analysis.ipynb` — append 1 markdown cell + 1 code cell

- [ ] **Step 1: Append the section 5 markdown header**

```markdown
## Section 5 — Mutation Family Distribution

Mutation family counts per source, within mutated scenarios only. Families are discovered dynamically from the data.
```

- [ ] **Step 2: Append the mutation family code cell**

```python
# ── MUTATION FAMILY DISTRIBUTION ─────────────────────────────
mutated_df = df[~df["is_base"]].copy()
exploded = (
    mutated_df.explode("mutation_families")
    .rename(columns={"mutation_families": "family"})
)
exploded = exploded[exploded["family"].notna() & (exploded["family"] != "")]

all_families = sorted(exploded["family"].unique())
fam_counts = (
    exploded.groupby(["family", "source"])
    .size()
    .reset_index(name="count")
)

# Grouped bar chart
x = np.arange(len(all_families))
width = 0.25
fig, ax = plt.subplots(figsize=(10, 5))

for i, source_name in enumerate(SOURCE_ORDER):
    vals = [
        fam_counts[
            (fam_counts["family"] == fam) & (fam_counts["source"] == source_name)
        ]["count"].sum()
        for fam in all_families
    ]
    offset = (i - len(SOURCE_ORDER) / 2 + 0.5) * width
    bars = ax.bar(x + offset, vals, width, label=source_name, color=COLORS[i])
    ax.bar_label(bars, fmt="%d", padding=2, fontsize=8)

ax.set_xticks(x)
ax.set_xticklabels(all_families, rotation=15, ha="right")
ax.set_ylabel("Count (within mutated scenarios)")
ax.set_title("Mutation Family Distribution per Source")
ax.legend()
plt.tight_layout()
plt.show()

# Percentage table (% within mutated per source)
table_rows = []
for source_name in SOURCE_ORDER:
    source_mutated_total = len(mutated_df[mutated_df["source"] == source_name])
    row = {"Source": source_name}
    for fam in all_families:
        count = int(
            fam_counts[
                (fam_counts["family"] == fam) & (fam_counts["source"] == source_name)
            ]["count"].sum()
        )
        pct = count / source_mutated_total * 100 if source_mutated_total > 0 else 0
        row[fam] = f"{count} ({pct:.1f}%)"
    table_rows.append(row)

pd.DataFrame(table_rows).set_index("Source")
```

- [ ] **Step 3: Execute and verify**

```bash
uv run jupyter nbconvert --to notebook --execute --inplace pre_sampling_analysis.ipynb 2>&1 | tail -3
```

Expected: exits 0. Grouped bar chart renders with one group per mutation family. Table shows counts and percentages within mutated scenarios only.

- [ ] **Step 4: Commit**

```bash
git add pre_sampling_analysis.ipynb
git commit -m "feat(notebook): add mutation family distribution chart (section 5)"
```

---

## Task 7: Section 6 — Obligation Coverage

**Files:**
- Modify: `pre_sampling_analysis.ipynb` — append 1 markdown cell + 1 code cell

- [ ] **Step 1: Append the section 6 markdown header**

```markdown
## Section 6 — Obligation Coverage

Obligations are intentionally partitioned across sources — each obligation is expected to appear in exactly one source. This section checks that every obligation seeded in `configs/obligations.yaml` appears in the combined pool.
```

- [ ] **Step 2: Append the obligation coverage code cell**

```python
# ── OBLIGATION COVERAGE ──────────────────────────────────────
# Load seeded obligations from config
with open(OBLIGATIONS_CONFIG) as f:
    obligations_config = yaml.safe_load(f)
seeded_ids = {o["obligation_id"] for o in obligations_config.get("obligations", [])}

# Explode obligation_ids
obs_exploded = (
    df.explode("obligation_ids")
    .rename(columns={"obligation_ids": "obligation_id"})
)
obs_exploded = obs_exploded[obs_exploded["obligation_id"].notna()]

# Part 1: obligation × source count matrix
obs_matrix = (
    obs_exploded.groupby(["obligation_id", "source"])
    .size()
    .unstack(fill_value=0)
    .reindex(columns=SOURCE_ORDER, fill_value=0)
)
print("Obligation-to-Source Scenario Counts:")
display(obs_matrix)

# Part 2: combined pool coverage check
covered_ids = set(obs_exploded["obligation_id"].unique())
missing = seeded_ids - covered_ids

print()
covered_count = len(seeded_ids & covered_ids)
symbol = "✓" if not missing else "✗"
print(f"{symbol} {covered_count}/{len(seeded_ids)} seeded obligations covered across combined pool")

# Check partitioned design: each obligation should appear in exactly 1 source
sources_per_obs = obs_exploded.groupby("obligation_id")["source"].nunique()
multi_source = sources_per_obs[sources_per_obs > 1]
if multi_source.empty:
    print("✓ Each obligation appears in exactly 1 source (partitioned design confirmed)")
else:
    print(f"✗ {len(multi_source)} obligation(s) appear in multiple sources: {list(multi_source.index)}")

if missing:
    for m in sorted(missing):
        print(f"  ✗ BLOCKER: {m} missing from combined pool")
```

- [ ] **Step 3: Execute and verify**

```bash
uv run jupyter nbconvert --to notebook --execute --inplace pre_sampling_analysis.ipynb 2>&1 | tail -3
```

Expected: exits 0. Matrix shows obligation IDs as rows, source names as columns. Coverage check prints `✓ 10/10 seeded obligations covered` and `✓ Each obligation appears in exactly 1 source`.

- [ ] **Step 4: Commit**

```bash
git add pre_sampling_analysis.ipynb
git commit -m "feat(notebook): add obligation coverage matrix and check (section 6)"
```

---

## Task 8: Section 7 — Governance Triggers Distribution

**Files:**
- Modify: `pre_sampling_analysis.ipynb` — append 1 markdown cell + 1 code cell

- [ ] **Step 1: Append the section 7 markdown header**

```markdown
## Section 7 — Governance Triggers Distribution

Percentage of scenarios where each governance trigger is `True`, per source. These triggers are assigned by the SemanticValidator (LLM judge) during the validate stage — they are the structural proxy for GRS dimension coverage in the current schema.
```

- [ ] **Step 2: Append the governance triggers code cell**

```python
# ── GOVERNANCE TRIGGERS DISTRIBUTION ─────────────────────────
TRIGGER_COLS = [
    "authority_oversight",
    "escalation",
    "traceability_constraints",
    "transparency_uncertainty",
    "prohibited_practices",
    "synthetic_disclosure",
]

# Expand governance_triggers dict into columns
triggers_expanded = df["governance_triggers"].apply(pd.Series)
df_triggers = pd.concat([df[["source"]], triggers_expanded[TRIGGER_COLS]], axis=1)

# Percentage True per source per trigger
pct_matrix = df_triggers.groupby("source")[TRIGGER_COLS].mean() * 100
pct_matrix = pct_matrix.reindex(SOURCE_ORDER)

# Heatmap
fig, ax = plt.subplots(figsize=(10, 4))
sns.heatmap(
    pct_matrix.T,
    annot=True,
    fmt=".1f",
    cmap="YlOrRd",
    linewidths=0.5,
    ax=ax,
    vmin=0,
    vmax=100,
    cbar_kws={"label": "% scenarios where trigger is True"},
)
ax.set_title("Governance Triggers Distribution (% True per Source)")
ax.set_xlabel("Source")
ax.set_ylabel("Trigger")
plt.tight_layout()
plt.show()

# Absolute count table
count_matrix = df_triggers.groupby("source")[TRIGGER_COLS].sum().astype(int)
count_matrix = count_matrix.reindex(SOURCE_ORDER)
totals = df_triggers.groupby("source").size().reindex(SOURCE_ORDER)

table_rows = []
for source_name in SOURCE_ORDER:
    total_s = totals[source_name]
    row = {"Source": source_name}
    for t in TRIGGER_COLS:
        count = int(count_matrix.loc[source_name, t])
        pct = count / total_s * 100
        row[t] = f"{count} ({pct:.1f}%)"
    table_rows.append(row)

pd.DataFrame(table_rows).set_index("Source").style.set_caption(
    "Governance Triggers — Absolute Counts (n, %)"
)
```

- [ ] **Step 3: Execute and verify**

```bash
uv run jupyter nbconvert --to notebook --execute --inplace pre_sampling_analysis.ipynb 2>&1 | tail -3
```

Expected: exits 0. Heatmap renders with triggers as rows, sources as columns, annotated with percentages. Table shows `n (pct%)` format for each cell.

- [ ] **Step 4: Commit**

```bash
git add pre_sampling_analysis.ipynb
git commit -m "feat(notebook): add governance triggers heatmap and count table (section 7)"
```

---

## Task 9: Section 8 — Pre-Sampling Readiness Summary

**Files:**
- Modify: `pre_sampling_analysis.ipynb` — append 1 markdown cell + 1 code cell

- [ ] **Step 1: Append the section 8 markdown header**

```markdown
## Section 8 — Pre-Sampling Readiness Summary

Automated checklist. Warnings are non-blocking — review and decide whether to proceed with sampling.
```

- [ ] **Step 2: Append the readiness summary code cell**

```python
# ── PRE-SAMPLING READINESS SUMMARY ───────────────────────────
print("=" * 52)
print("  PRE-SAMPLING READINESS SUMMARY")
print("=" * 52)

issues = []

# Check 1: All sources loaded and non-empty
print("\n[Source Loading]")
for source_name in SOURCE_ORDER:
    count = len(df[df["source"] == source_name])
    if count == 0:
        issues.append(f"SOURCE EMPTY: {source_name}")
        print(f"  ✗ {source_name}: 0 scenarios — source is empty")
    else:
        print(f"  ✓ {source_name}: {count} scenarios loaded")

# Check 2: All seeded obligations covered in combined pool
print("\n[Obligation Coverage]")
with open(OBLIGATIONS_CONFIG) as f:
    obs_cfg = yaml.safe_load(f)
seeded = {o["obligation_id"] for o in obs_cfg.get("obligations", [])}
obs_flat = df.explode("obligation_ids").rename(columns={"obligation_ids": "obligation_id"})
obs_flat = obs_flat[obs_flat["obligation_id"].notna()]
covered = set(obs_flat["obligation_id"].unique())
missing_obs = seeded - covered

covered_count = len(seeded & covered)
if missing_obs:
    for m in sorted(missing_obs):
        issues.append(f"OBLIGATION MISSING: {m}")
        print(f"  ✗ BLOCKER — obligation not in combined pool: {m}")
else:
    print(f"  ✓ {covered_count}/{len(seeded)} seeded obligations covered in combined pool")

# Check 3: Partitioned design — each obligation in exactly 1 source
sources_per_obs = obs_flat.groupby("obligation_id")["source"].nunique()
multi = sources_per_obs[sources_per_obs > 1]
if multi.empty:
    print("  ✓ Each obligation appears in exactly 1 source (partitioned design confirmed)")
else:
    issues.append(f"PARTITION VIOLATION: {len(multi)} obligation(s) in multiple sources")
    print(f"  ✗ WARNING — {len(multi)} obligation(s) in multiple sources: {list(multi.index)}")

# Check 4: Expected mutation families present in each source
print("\n[Mutation Families]")
EXPECTED_FAMILIES = {"authority_pressure", "urgency_pressure", "ambiguity_pressure"}
mutated_only = df[~df["is_base"]]
for source_name in SOURCE_ORDER:
    grp = mutated_only[mutated_only["source"] == source_name]
    present = {f for fams in grp["mutation_families"] for f in fams}
    missing_fam = EXPECTED_FAMILIES - present
    if missing_fam:
        issues.append(f"MISSING FAMILIES in {source_name}: {missing_fam}")
        print(f"  ✗ WARNING — {source_name} missing families: {sorted(missing_fam)}")
    else:
        print(f"  ✓ {source_name}: expected mutation families present ({sorted(present)})")

# Check 5: Source size imbalance (>20% deviation from mean)
print("\n[Source Size Balance]")
counts = df.groupby("source").size().reindex(SOURCE_ORDER)
mean_count = counts.mean()
any_imbalance = False
for source_name, count in counts.items():
    deviation = abs(count - mean_count) / mean_count * 100
    if deviation > 20:
        issues.append(f"SIZE IMBALANCE: {source_name} ({deviation:.1f}% from mean)")
        print(f"  ✗ WARNING — {source_name}: {count} ({deviation:.1f}% from mean {mean_count:.0f})")
        any_imbalance = True
if not any_imbalance:
    print(f"  ✓ All sources within 20% of mean ({mean_count:.0f} scenarios)")

# Pool totals
total = len(df)
base = int(df["is_base"].sum())
mutated = total - base
print("\n" + "─" * 52)
print("POOL TOTALS")
print("─" * 52)
print(f"  Combined scenarios : {total:,}")
print(f"  Base               : {base:,}  ({base / total * 100:.1f}%)")
print(f"  Mutated            : {mutated:,}  ({mutated / total * 100:.1f}%)")
print()
if issues:
    print(f"⚠  {len(issues)} issue(s) found — review before sampling:")
    for issue in issues:
        print(f"     • {issue}")
else:
    print("✓  All checks passed — pool ready for sampling.")
```

- [ ] **Step 3: Execute and verify**

```bash
uv run jupyter nbconvert --to notebook --execute --inplace pre_sampling_analysis.ipynb 2>&1 | tail -3
```

Expected: exits 0. Summary prints all 5 check groups, pool totals, and a final verdict line.

- [ ] **Step 4: Commit**

```bash
git add pre_sampling_analysis.ipynb
git commit -m "feat(notebook): add pre-sampling readiness summary (section 8)"
```

---

## Task 10: Full Execution Verification and Final Commit

**Files:**
- Read: `pre_sampling_analysis.ipynb` (verify all cells executed cleanly)

- [ ] **Step 1: Clear all outputs and re-execute from scratch**

```bash
uv run jupyter nbconvert --to notebook --execute --inplace \
  --ExecutePreprocessor.timeout=120 pre_sampling_analysis.ipynb 2>&1
```

Expected: exits 0 with no tracebacks. All 8 sections produce output.

- [ ] **Step 2: Confirm all sections present**

```bash
uv run python -c "
import json
nb = json.load(open('pre_sampling_analysis.ipynb'))
headers = [c['source'][0] for c in nb['cells'] if c['cell_type'] == 'markdown' and c['source'] and c['source'][0].startswith('## Section')]
for h in headers:
    print(h)
"
```

Expected output:
```
## Section 1 — Config & Data Loading
## Section 2 — Dataset Inventory
## Section 3 — Source Balance
## Section 4 — Scenario Type Distribution
## Section 5 — Mutation Family Distribution
## Section 6 — Obligation Coverage
## Section 7 — Governance Triggers Distribution
## Section 8 — Pre-Sampling Readiness Summary
```

- [ ] **Step 3: Final commit**

```bash
git add pre_sampling_analysis.ipynb
git commit -m "feat(notebook): complete GRS dataset explorer — all 8 sections verified"
```
