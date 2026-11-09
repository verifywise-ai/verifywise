# Bias module: engine port and gates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone TypeScript bias-audit computation module inside `Servers/`, validated against the existing Python engine as a development-time oracle, with the input-validation layer the Python engine does not have.

**Architecture:** Pure functions, no I/O, no database, no HTTP. Expected outputs are generated once from `EvalServer/venv` and committed as JSON fixtures; after Task 1 nothing in the module or its tests touches Python or EvalServer. The module exposes `computeBiasAudit` plus three gate functions that callers run before trusting a result.

**Tech Stack:** TypeScript, Node 22, Jest 30 (`npm run test:unit` in `Servers/`).

**Spec:** `docs/superpowers/specs/2026-10-14-ll144-self-service-module-design.md` (commits 5e2ad8b42, 764a78cb0)

**Plan 1 of 3.** Plan 2 covers intake, scoring and the stance; plan 3 covers generation. All three land before release; nothing ships from this plan alone.

## Global Constraints

- **No runtime dependency on any other VerifyWise module.** No import from `EvalServer/`, `AIGateway/`, `EvaluationModule/`, or another module's services, routes or tables. Shared libraries and platform primitives (Sequelize, auth middleware, the files table, i18n, MUI) are permitted. The Python engine is a development-time oracle only, used in Task 1 and never again.
- **All files in this plan are pure functions.** No database access, no network, no filesystem reads outside test fixtures.
- **Rounding:** impact ratios and rates are rounded to 6 decimal places, matching Python's `round(x, 6)`, which rounds half to EVEN. Neither `Math.round(x * 1e6) / 1e6` nor `Number(x.toFixed(6))` is equivalent: both round half up. Measured over 22,773 values, `toFixed(6)` disagrees with Python on 14 of them, all exact binary fractions such as `1/128 = 0.0078125` (Python 0.007812, toFixed 0.007813). A group of 128 with 1 selected produces that rate exactly, and a real impact ratio reaches `0.00390625`, so this is reachable and not theoretical. Task 2 implements `round6` on the decimal expansion with half-to-even only on a true tie, and pins it on both the binary-half and decimal-half families.
- **Expected-runs formula:** `n + 1 - sum(ni^2) / n`. Never `n * (1 - 1/k)`, which assumes equal group sizes and rejects a correct interleave.
- **Two thresholds, by provenance.** Uploaded data uses `0.5` of expected: real applicant order may legitimately cluster, so the check is there to catch block structure rather than to police ordinary clustering. Generated corpora use `0.9` and treat a failure as a hard gate, because a generator has no excuse. Measured on a seeded permutation: 7 categories over 5,000 records give 4,305 observed against 4,286.7 expected (1.0043), and an unequal 700/300 split gives 411 against 421.0 (0.9762). Both clear 0.9. Plan 3 owns the generated-corpus gate.
- **0.80 is the EEOC four-fifths convention, not adopted by the statute.** It is a parameter with provenance, never a pass mark. § 5-301(d)'s 2% exclusion is the statutory rule.
- **Vocabulary:** no function in this plan returns, logs or embeds the words `compliant`, `certified`, `passed`, `bias-free`, or `audited` as a claim. Task 10 asserts this.
- **Test commands:** `cd Servers && npm run test:unit -- <path>` to run; `npm run build` for typecheck; `npm run lint` for lint.

## Review Focus

Five input classes the spec implies but which no task's happy-path tests would exercise. Each has its pinning test added to the owning task.

1. **A score column whose median equals its modal value** produces every rate 0.0, every impact ratio null, and the summary "No adverse impact flags detected." The Python engine does this silently (verified: 100 records, three levels, 75 at the top level). A customer reads it as a clean result. Owned by Task 3.
2. **A single group in a category** becomes its own reference, so no disparity is computable — and its impact ratio is `0.999999`, not `1.0`, because the engine divides the rounded rate by the unrounded highest rate. Owned by Task 2.
3. **Unequal group sizes in the ID-order check.** The wrong formula passes a blocked corpus or rejects a correct interleave. Owned by Task 7.
4. **All records selected, or none.** Impact ratios are undefined; the Python returns nulls with a reassuring summary. Owned by Task 6.
5. **A demographic column present but mostly empty.** Rates computed on the few populated rows look authoritative. The Python skips blank group names silently (`if not group_name: continue`). Owned by Task 6.

---

### Task 1: Generate and commit the oracle fixtures

The only task that touches Python. It produces the expected outputs every later task asserts against.

**Files:**
- Create: `Servers/services/biasAudit/engine/__fixtures__/generate_oracle.py`
- Create: `Servers/services/biasAudit/engine/__fixtures__/cases.json` (hand-written INPUT to the script)
- Create: `Servers/services/biasAudit/engine/__fixtures__/cases.resolved.json` (written BY the script)
- Create: `Servers/services/biasAudit/engine/__fixtures__/expected.json` (written BY the script)
- Create: `Servers/services/biasAudit/engine/__fixtures__/load.ts`
- Create: `Servers/services/biasAudit/engine/__fixtures__/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `cases.resolved.json` — array of `{name, records, config}`, with records expanded.
  - `expected.json` — map of case name to the Python's `BiasAuditResult` as `model_dump_json()`.
  - `load.ts` — `allCases(): Case[]`, `byName(name): Case`, `exp(name): any`. Every later task imports the fixtures **through this module**, never by a JSON import: `resolveJsonModule` is commented out in `Servers/tsconfig.json:43`, so `import x from "./foo.json"` fails `tsc` with TS2732. Enabling it would change shared compiler config for this feature's benefit; reading the files with `fs` does not.

Three files, not two: `cases.json` is the script's hand-written input and keeps the case list readable; the script expands its `records_generator` keys into `cases.resolved.json`. Commit all three.

- [ ] **Step 1: Write the case definitions**

Create `cases.json` with these 12 cases. Each is an object `{name, records, config}` where `config` mirrors `BiasAuditConfig` fields.

```json
[
  {
    "name": "selection_rate_balanced",
    "config": {
      "preset_id": "nyc_ll144", "metric": "selection_rate",
      "categories": {"sex": {"label": "Sex", "groups": ["Male", "Female"]}},
      "threshold": 0.8, "outcome_column": "selected"
    },
    "records_generator": "balanced_sex_60_40"
  },
  { "name": "selection_rate_intersectional", "config": { "preset_id": "nyc_ll144", "metric": "selection_rate", "categories": {"sex": {"label": "Sex", "groups": ["Male","Female"]}, "race_ethnicity": {"label": "Race/Ethnicity", "groups": ["White","Black or African American","Hispanic or Latino","Asian","Native Hawaiian or Pacific Islander","Native American or Alaska Native","Two or more races"]}}, "intersectional": {"required": true, "cross": ["sex","race_ethnicity"]}, "threshold": 0.8, "small_sample_exclusion": 0.02, "outcome_column": "selected" }, "records_generator": "ll144_full_14_cells" },
  { "name": "selection_rate_single_group", "config": { "preset_id": "t", "metric": "selection_rate", "categories": {"sex": {"label": "Sex", "groups": ["Male"]}}, "threshold": 0.8, "outcome_column": "selected" }, "records_generator": "single_group_male_only" },
  { "name": "selection_rate_all_selected", "config": { "preset_id": "t", "metric": "selection_rate", "categories": {"sex": {"label": "Sex", "groups": ["Male","Female"]}}, "threshold": 0.8, "outcome_column": "selected" }, "records_generator": "all_selected" },
  { "name": "selection_rate_none_selected", "config": { "preset_id": "t", "metric": "selection_rate", "categories": {"sex": {"label": "Sex", "groups": ["Male","Female"]}}, "threshold": 0.8, "outcome_column": "selected" }, "records_generator": "none_selected" },
  { "name": "selection_rate_blank_group_names", "config": { "preset_id": "t", "metric": "selection_rate", "categories": {"sex": {"label": "Sex", "groups": ["Male","Female"]}}, "threshold": 0.8, "outcome_column": "selected" }, "records_generator": "mostly_blank_sex" },
  { "name": "selection_rate_small_sample_excluded", "config": { "preset_id": "t", "metric": "selection_rate", "categories": {"race_ethnicity": {"label": "Race/Ethnicity", "groups": ["White","Asian","Two or more races"]}}, "threshold": 0.8, "small_sample_exclusion": 0.02, "outcome_column": "selected" }, "records_generator": "one_tiny_race_cell" },
  { "name": "scoring_rate_continuous", "config": { "preset_id": "t", "metric": "scoring_rate", "categories": {"sex": {"label": "Sex", "groups": ["Male","Female"]}}, "threshold": 0.8, "score_column": "score" }, "records_generator": "continuous_scores_0_100" },
  { "name": "scoring_rate_median_equals_mode", "config": { "preset_id": "t", "metric": "scoring_rate", "categories": {"sex": {"label": "Sex", "groups": ["Male","Female"]}}, "threshold": 0.8, "score_column": "score" }, "records_generator": "three_levels_75_at_top" },
  { "name": "scoring_rate_rounding_half", "config": { "preset_id": "t", "metric": "scoring_rate", "categories": {"sex": {"label": "Sex", "groups": ["Male","Female"]}}, "threshold": 0.8, "score_column": "score" }, "records_generator": "rates_producing_exact_half_at_7dp" },
  { "name": "fairness_metrics_basic", "config": { "preset_id": "t", "metric": "fairness_metrics", "categories": {"sex": {"label": "Sex", "groups": ["Male","Female"]}}, "prediction_column": "prediction", "ground_truth_column": "ground_truth" }, "records_generator": "prediction_and_truth" },
  { "name": "score_distribution_present", "config": { "preset_id": "t", "metric": "selection_rate", "categories": {"sex": {"label": "Sex", "groups": ["Male","Female"]}}, "threshold": 0.8, "outcome_column": "selected", "score_column": "score" }, "records_generator": "selected_plus_scores" }
]
```

- [ ] **Step 2: Write the generator script**

Create `generate_oracle.py`. It builds records for each named generator, calls the Python engine, and writes both files. Record generators are defined here so `cases.json` stays readable.

```python
#!/usr/bin/env python3
"""Generate oracle fixtures for the TypeScript bias-audit engine port.

DEVELOPMENT ONLY. Run once, commit the output, never ship or import this.
The TypeScript module and its tests depend on cases.json and expected.json,
not on this script or on EvalServer.

    cd Servers/services/biasAudit/engine/__fixtures__
    ~/verifywise/EvalServer/venv/bin/python generate_oracle.py
"""
import json
import pathlib
import sys

EVALSERVER = pathlib.Path.home() / "verifywise/EvalServer"
sys.path.insert(0, str(EVALSERVER / "src"))

from engines.bias_audit.engine import compute_bias_audit       # noqa: E402
from engines.bias_audit.models import BiasAuditConfig          # noqa: E402

RACES = [
    "White", "Black or African American", "Hispanic or Latino", "Asian",
    "Native Hawaiian or Pacific Islander", "Native American or Alaska Native",
    "Two or more races",
]


def balanced_sex_60_40():
    out = []
    for i in range(200):
        sex = "Male" if i % 2 == 0 else "Female"
        # Male 60% selected, Female 40% -> IR 0.666667 for Female
        sel = (i % 10) < (6 if sex == "Male" else 4)
        out.append({"sex": sex, "selected": sel})
    return out


def ll144_full_14_cells():
    out = []
    for i in range(1400):
        sex = "Male" if i % 2 == 0 else "Female"
        race = RACES[(i // 2) % 7]
        sel = (i % 7) < 4
        out.append({"sex": sex, "race_ethnicity": race, "selected": sel})
    return out


def single_group_male_only():
    return [{"sex": "Male", "selected": i % 3 == 0} for i in range(60)]


def all_selected():
    return [{"sex": "Male" if i % 2 == 0 else "Female", "selected": True} for i in range(100)]


def none_selected():
    return [{"sex": "Male" if i % 2 == 0 else "Female", "selected": False} for i in range(100)]


def mostly_blank_sex():
    out = []
    for i in range(100):
        sex = ("Male" if i % 2 == 0 else "Female") if i < 12 else ""
        out.append({"sex": sex, "selected": i % 3 == 0})
    return out


def one_tiny_race_cell():
    out = []
    for i in range(1000):
        if i < 10:
            race = "Two or more races"      # 1% of 1000, below the 2% exclusion
        elif i < 500:
            race = "White"
        else:
            race = "Asian"
        out.append({"race_ethnicity": race, "selected": i % 4 == 0})
    return out


def continuous_scores_0_100():
    out = []
    for i in range(200):
        sex = "Male" if i % 2 == 0 else "Female"
        score = float((i * 7) % 101)
        out.append({"sex": sex, "score": score})
    return out


def three_levels_75_at_top():
    # The Review Focus case: median coincides with the modal value.
    out = []
    for i in range(100):
        sex = "Male" if i % 2 == 0 else "Female"
        score = 3 if i < 75 else (2 if i < 90 else 1)
        out.append({"sex": sex, "score": float(score)})
    return out


def rates_producing_exact_half_at_7dp():
    # 3/8 vs 7/8 -> ratio 0.428571428...; also exercises 6dp truncation.
    out = []
    for i in range(16):
        sex = "Male" if i < 8 else "Female"
        above = (i % 8) < (7 if sex == "Male" else 3)
        out.append({"sex": sex, "score": 90.0 if above else 10.0})
    return out


def prediction_and_truth():
    out = []
    for i in range(200):
        sex = "Male" if i % 2 == 0 else "Female"
        truth = i % 3 == 0
        pred = truth if i % 5 else not truth
        out.append({"sex": sex, "prediction": pred, "ground_truth": truth})
    return out


def selected_plus_scores():
    out = []
    for i in range(200):
        sex = "Male" if i % 2 == 0 else "Female"
        out.append({"sex": sex, "selected": i % 3 == 0, "score": float((i * 13) % 101)})
    return out


GENERATORS = {
    "balanced_sex_60_40": balanced_sex_60_40,
    "ll144_full_14_cells": ll144_full_14_cells,
    "single_group_male_only": single_group_male_only,
    "all_selected": all_selected,
    "none_selected": none_selected,
    "mostly_blank_sex": mostly_blank_sex,
    "one_tiny_race_cell": one_tiny_race_cell,
    "continuous_scores_0_100": continuous_scores_0_100,
    "three_levels_75_at_top": three_levels_75_at_top,
    "rates_producing_exact_half_at_7dp": rates_producing_exact_half_at_7dp,
    "prediction_and_truth": prediction_and_truth,
    "selected_plus_scores": selected_plus_scores,
}


def main() -> int:
    here = pathlib.Path(__file__).parent
    cases = json.loads((here / "cases.json").read_text())

    resolved, expected = [], {}
    for case in cases:
        gen = GENERATORS[case["records_generator"]]
        records = gen()
        cfg = BiasAuditConfig(**case["config"])
        result = compute_bias_audit(records, cfg)
        resolved.append({"name": case["name"], "records": records, "config": case["config"]})
        expected[case["name"]] = json.loads(result.model_dump_json())
        print(f"  {case['name']}: {len(records)} records, {len(result.tables)} tables")

    (here / "cases.resolved.json").write_text(json.dumps(resolved, indent=2) + "\n")
    (here / "expected.json").write_text(json.dumps(expected, indent=2, sort_keys=True) + "\n")
    print(f"\nwrote {len(resolved)} cases")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 3: Run the generator**

```bash
cd ~/verifywise/Servers/services/biasAudit/engine/__fixtures__
~/verifywise/EvalServer/venv/bin/python generate_oracle.py
```

Expected: 12 lines of case output, then `wrote 12 cases`. Both `cases.resolved.json` and `expected.json` exist.

- [ ] **Step 4: Verify the median-equals-mode case captured the defect**

```bash
cd ~/verifywise/Servers/services/biasAudit/engine/__fixtures__
python3 -c "
import json; e=json.load(open('expected.json'))['scoring_rate_median_equals_mode']
print('overall rate:', e['overall_selection_rate'])
print('rates:', [r['selection_rate'] for r in e['tables'][0]['rows']])
print('IRs:', [r['impact_ratio'] for r in e['tables'][0]['rows']])
print('summary:', e['summary'])
"
```

Expected: overall rate `0.0`, all rates `0.0`, all IRs `null`, and a summary containing "No adverse impact flags detected." This is the behaviour Task 3 must detect rather than reproduce blindly.

- [ ] **Step 5: Write the fixture loader**

Create `load.ts`. Every test imports the fixtures through this, because a JSON import
does not compile under the repo's current `tsconfig.json`.

```ts
import fs from "node:fs";
import path from "node:path";

export interface Case {
  name: string;
  records: Record<string, unknown>[];
  config: Record<string, unknown>;
}

function read<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf8")) as T;
}

export function allCases(): Case[] {
  return read<Case[]>("cases.resolved.json");
}

export function byName(name: string): Case {
  const found = allCases().find((c) => c.name === name);
  if (!found) throw new Error(`no oracle case named ${name}`);
  return found;
}

export function exp(name: string): any {
  const expected = read<Record<string, any>>("expected.json");
  if (!(name in expected)) throw new Error(`no oracle expectation for ${name}`);
  return expected[name];
}
```

- [ ] **Step 6: Write the fixtures README**

Create `README.md`:

```markdown
# Oracle fixtures

`expected.json` holds the output of EvalServer's Python bias-audit engine for each case in
`cases.resolved.json`, generated once by `generate_oracle.py` on 2026-10-14.

These files are the oracle for the TypeScript port. The TypeScript module and its tests read
only these two JSON files; nothing at runtime or in CI touches Python or EvalServer.

**Regenerating is a deliberate act.** If a case's expected output changes, that is either a
fixed defect or a regression, and the diff must be explained in the commit message. Do not
regenerate to make a failing test pass.

**Known divergence, by design:** `scoring_rate_median_equals_mode` records the Python's
behaviour where the median equals the modal value — every rate 0.0, every impact ratio null,
and a summary reading "No adverse impact flags detected." The TypeScript port reproduces the
arithmetic and additionally returns a `degenerateMedian` diagnostic so callers can refuse to
present it as a result. See the port's `scoringRate.ts` and Task 3 of the plan.
```

- [ ] **Step 7: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/engine/__fixtures__/
git commit -m "Add oracle fixtures for the bias-audit engine port

Twelve cases covering selection rate, scoring rate, fairness metrics,
intersectional analysis, small-sample exclusion and score distributions,
with expected outputs generated from EvalServer's Python engine.

Development-time only: the TypeScript port and its tests read the two
committed JSON files and never import Python or EvalServer.

Includes scoring_rate_median_equals_mode, which captures the Python
engine returning every rate 0.0 and every impact ratio null while its
summary reads 'No adverse impact flags detected'. Verified on 100
records with three score levels and 75 at the top level."
```

---

### Task 2: Port impact ratio and the category table

**Files:**
- Create: `Servers/services/biasAudit/engine/types.ts`
- Create: `Servers/services/biasAudit/engine/round.ts`
- Create: `Servers/services/biasAudit/engine/categoryTable.ts`
- Test: `Servers/services/biasAudit/engine/categoryTable.test.ts`

**Interfaces:**
- Consumes: `__fixtures__/cases.resolved.json`, `__fixtures__/expected.json` from Task 1.
- Produces:
  - `round6(x: number): number`
  - `interface GroupResult { categoryType: string; categoryName: string; applicantCount: number; selectedCount: number; selectionRate: number; impactRatio: number | null; excluded: boolean; flagged: boolean }`
  - `interface CategoryTable { title: string; categoryKey: string; rows: GroupResult[]; highestGroup: string | null; highestRate: number | null }`
  - `computeCategoryTable(args: { records: Record<string, unknown>[]; categoryKey: string; categoryLabel: string; totalApplicants: number; threshold: number | null; smallSampleExclusion: number | null; rateOf: (r: Record<string, unknown>) => boolean; titlePrefix?: string }): CategoryTable`

- [ ] **Step 1: Write the failing test**

Create `categoryTable.test.ts`:

```ts
import { computeCategoryTable } from "./categoryTable";
import { round6 } from "./round";
import { byName, exp } from "./__fixtures__/load";

describe("round6", () => {
  it("matches Python on an ordinary repeating fraction", () => {
    expect(round6(3 / 7)).toBe(0.428571);
    expect(round6(1 / 3)).toBe(0.333333);
    expect(round6(2 / 3)).toBe(0.666667);
  });

  // The family toFixed(6) gets wrong: exact binary fractions whose 7th
  // decimal is a true 5. Python rounds these half to even.
  it.each([
    [1 / 128, 0.007812],
    [29 / 128, 0.226562],
    [57 / 128, 0.445312],
    [85 / 128, 0.664062],
    [113 / 128, 0.882812],
    [5 / 128, 0.039062],
    [1 / 256, 0.003906],
  ])("rounds the exact binary half %p to %p, half to even", (input, expected) => {
    expect(round6(input)).toBe(expected);
  });

  it("differs from toFixed(6) on those values, which is why it exists", () => {
    expect(Number((1 / 128).toFixed(6))).toBe(0.007813);
    expect(round6(1 / 128)).toBe(0.007812);
  });

  // Decimal halves are NOT exactly representable, so a tie test on the
  // scaled value misfires here. These must still match Python.
  it("rounds decimal near-halves as Python does", () => {
    expect(round6(0.1234565)).toBe(0.123456);
    expect(round6(0.1234575)).toBe(0.123457);
  });

  it("handles exponential notation, zero, one and negatives", () => {
    expect(round6(5e-7)).toBe(0);
    expect(round6(0)).toBe(0);
    expect(round6(1)).toBe(1);
    expect(round6(-1 / 128)).toBe(-0.007812);
  });

  it("is reachable from real group sizes", () => {
    // 1 selected from a group of 128 is an ordinary cell, not a contrived one.
    expect(round6(1 / 128)).toBe(0.007812);
  });
});

describe("computeCategoryTable against the Python oracle", () => {
  it("reproduces selection_rate_balanced", () => {
    const c = byName("selection_rate_balanced");
    const table = computeCategoryTable({
      records: c.records,
      categoryKey: "sex",
      categoryLabel: "Sex",
      totalApplicants: c.records.length,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: (r) => Boolean(r.selected),
    });
    const want = exp("selection_rate_balanced").tables[0];

    expect(table.title).toBe(want.title);
    expect(table.rows.map((r) => r.categoryName)).toEqual(
      want.rows.map((r: any) => r.category_name),
    );
    expect(table.rows.map((r) => r.selectionRate)).toEqual(
      want.rows.map((r: any) => r.selection_rate),
    );
    expect(table.rows.map((r) => r.impactRatio)).toEqual(
      want.rows.map((r: any) => r.impact_ratio),
    );
    expect(table.rows.map((r) => r.flagged)).toEqual(want.rows.map((r: any) => r.flagged));
  });

  it("reproduces small-sample exclusion, including the null impact ratio", () => {
    const c = byName("selection_rate_small_sample_excluded");
    const table = computeCategoryTable({
      records: c.records,
      categoryKey: "race_ethnicity",
      categoryLabel: "Race/Ethnicity",
      totalApplicants: c.records.length,
      threshold: 0.8,
      smallSampleExclusion: 0.02,
      rateOf: (r) => Boolean(r.selected),
    });
    const want = exp("selection_rate_small_sample_excluded").tables[0];

    expect(table.rows.map((r) => r.excluded)).toEqual(want.rows.map((r: any) => r.excluded));
    expect(table.rows.map((r) => r.impactRatio)).toEqual(
      want.rows.map((r: any) => r.impact_ratio),
    );
    // An excluded group keeps its rate for transparency but has no ratio.
    const excluded = table.rows.find((r) => r.excluded)!;
    expect(excluded.selectionRate).toBeGreaterThan(0);
    expect(excluded.impactRatio).toBeNull();
  });

  it("skips records whose group name is blank, as the Python does", () => {
    const c = byName("selection_rate_blank_group_names");
    const table = computeCategoryTable({
      records: c.records,
      categoryKey: "sex",
      categoryLabel: "Sex",
      totalApplicants: c.records.length,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: (r) => Boolean(r.selected),
    });
    const want = exp("selection_rate_blank_group_names").tables[0];
    expect(table.rows.map((r) => r.applicantCount)).toEqual(
      want.rows.map((r: any) => r.applicant_count),
    );
    // Review Focus 5: only 12 of 100 records carry a sex, and nothing here says so.
    const counted = table.rows.reduce((s, r) => s + r.applicantCount, 0);
    expect(counted).toBe(12);
    expect(c.records.length).toBe(100);
  });

  // Review Focus 2
  it("makes a lone group its own reference, but the ratio is not exactly 1", () => {
    const c = byName("selection_rate_single_group");
    const table = computeCategoryTable({
      records: c.records,
      categoryKey: "sex",
      categoryLabel: "Sex",
      totalApplicants: c.records.length,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: (r) => Boolean(r.selected),
    });
    expect(table.rows).toHaveLength(1);

    // 0.999999, NOT 1.0. The engine divides the ROUNDED rate by the
    // UNROUNDED highest rate: with 20 of 60 selected, round(1/3, 6) is
    // 0.333333 while highestRate stays 0.3333333..., so the quotient is
    // 0.999999. Verified against the Python. Preserve this asymmetry; it
    // affects every ratio whose rate is not exactly representable.
    expect(table.rows[0].impactRatio).toBe(0.999999);
    expect(table.rows[0].flagged).toBe(false);
    expect(table.rows.map((r) => r.impactRatio)).toEqual(
      exp("selection_rate_single_group").tables[0].rows.map((r: any) => r.impact_ratio),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/engine/categoryTable.test.ts`
Expected: FAIL, cannot find module `./categoryTable` and `./round`.

- [ ] **Step 3: Write the implementation**

Create `round.ts`:

```ts
/**
 * Round to 6 decimal places, matching Python's `round(x, 6)`.
 *
 * Python rounds half to EVEN. JavaScript has no builtin that does: both
 * `Math.round(x * 1e6) / 1e6` and `Number(x.toFixed(6))` round half UP.
 *
 * Over 22,773 values spanning the ratios impact ratios actually take,
 * `toFixed(6)` disagrees with Python on 14, every one an exact binary
 * fraction:
 *
 *   1/128   = 0.0078125   Python 0.007812   toFixed 0.007813
 *   29/128  = 0.2265625   Python 0.226562   toFixed 0.226563
 *   1/256   = 0.00390625  Python 0.003906   toFixed 0.003906  (agrees)
 *
 * A group of 128 candidates with 1 selected produces the first of those
 * rates exactly, so this is reachable in ordinary data rather than
 * contrived.
 *
 * Scaling by 1e6 and inspecting the remainder does not work either: a
 * decimal half such as 0.1234575 is not exactly representable, so
 * `x * 1e6` carries floating-point error and a tie test on it misfires.
 * The decision therefore reads the decimal expansion, and half-to-even
 * applies only where the discarded tail is exactly "5" with nothing after
 * it.
 */
export function round6(x: number): number {
  if (!Number.isFinite(x)) return x;
  if (x === 0) return 0;

  // Below the rounding grain, only an exact half needs the even rule.
  if (Math.abs(x) < 1e-6) {
    return Math.abs(x) * 1e6 === 0.5 ? 0 : Number(x.toFixed(6));
  }

  // toFixed(20) never yields exponential notation, which a regex on the
  // default string form would mis-parse for values like 5e-7.
  const text = x.toFixed(20);
  const parts = text.match(/^(-?)(\d+)\.(\d+)$/);
  if (!parts) return Number(x.toFixed(6));

  const sign = parts[1] === "-" ? -1 : 1;
  const integerPart = parts[2];
  const fraction = parts[3];
  const keep = fraction.slice(0, 6);
  const discarded = fraction.slice(6);

  let scaled = parseInt(integerPart + keep, 10);
  const firstDiscarded = discarded[0] ?? "0";
  const tail = discarded.slice(1).replace(/0+$/, "");

  if (firstDiscarded > "5" || (firstDiscarded === "5" && tail !== "")) {
    scaled += 1;
  } else if (firstDiscarded === "5" && tail === "") {
    if (scaled % 2 !== 0) scaled += 1;   // exact tie: round to even
  }

  return (sign * scaled) / 1e6;
}
```

Create `types.ts`:

```ts
export type MetricMode = "selection_rate" | "scoring_rate" | "fairness_metrics";

export interface GroupResult {
  categoryType: string;
  categoryName: string;
  applicantCount: number;
  selectedCount: number;
  selectionRate: number;
  impactRatio: number | null;
  excluded: boolean;
  flagged: boolean;
}

export interface CategoryTable {
  title: string;
  categoryKey: string;
  rows: GroupResult[];
  highestGroup: string | null;
  highestRate: number | null;
}

export type AuditRecord = Record<string, unknown>;
```

Create `categoryTable.ts`:

```ts
import { round6 } from "./round";
import type { AuditRecord, CategoryTable, GroupResult } from "./types";

export interface CategoryTableArgs {
  records: AuditRecord[];
  categoryKey: string;
  categoryLabel: string;
  totalApplicants: number;
  threshold: number | null;
  smallSampleExclusion: number | null;
  rateOf: (record: AuditRecord) => boolean;
  titlePrefix?: string;
}

/**
 * Rates and impact ratios for one protected category.
 *
 * Ported from EvalServer's `_compute_category_table`. Behaviour preserved
 * deliberately, including two properties a caller must handle rather than
 * assume away:
 *
 *  - a record whose group name is blank is skipped, so the counted total can
 *    be far below the record count (see dataGates.ts);
 *  - when the highest rate is 0, every impact ratio is null.
 */
export function computeCategoryTable(args: CategoryTableArgs): CategoryTable {
  const {
    records, categoryKey, categoryLabel, totalApplicants,
    threshold, smallSampleExclusion, rateOf, titlePrefix = "Impact ratios",
  } = args;

  const groups = new Map<string, { applicants: number; selected: number }>();
  for (const record of records) {
    const groupName = String(record[categoryKey] ?? "");
    if (!groupName) continue;
    const entry = groups.get(groupName) ?? { applicants: 0, selected: 0 };
    entry.applicants += 1;
    if (rateOf(record)) entry.selected += 1;
    groups.set(groupName, entry);
  }

  const rows: GroupResult[] = [];
  let highestRate = 0;
  let highestGroup = "";

  for (const groupName of [...groups.keys()].sort()) {
    const { applicants, selected } = groups.get(groupName)!;
    const rate = applicants > 0 ? selected / applicants : 0;
    if (rate > highestRate) {
      highestRate = rate;
      highestGroup = groupName;
    }
    rows.push({
      categoryType: categoryKey,
      categoryName: groupName,
      applicantCount: applicants,
      selectedCount: selected,
      selectionRate: round6(rate),
      impactRatio: null,
      excluded: false,
      flagged: false,
    });
  }

  for (const row of rows) {
    if (smallSampleExclusion && totalApplicants > 0) {
      const proportion = row.applicantCount / totalApplicants;
      if (proportion < smallSampleExclusion) {
        row.excluded = true;
        row.impactRatio = null;
        continue;
      }
    }
    if (highestRate > 0) {
      const ratio = row.selectionRate / highestRate;
      row.impactRatio = round6(ratio);
      if (threshold !== null && ratio < threshold) row.flagged = true;
    } else {
      row.impactRatio = null;
    }
  }

  return {
    title: `${titlePrefix} by ${categoryLabel.toLowerCase()}`,
    categoryKey,
    rows,
    highestGroup: highestGroup || null,
    highestRate: highestGroup ? round6(highestRate) : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/engine/categoryTable.test.ts`
Expected: PASS, 7 tests.

If the rounding tests fail, do not change the test. Compare against Python directly:

```bash
~/verifywise/EvalServer/venv/bin/python -c \
  "print(round(1/128,6), round(0.1234575,6), round(3/7,6))"
```

Expected: `0.007812 0.123457 0.428571`. A `round6` that returns 0.007813 for the
first is rounding half up and will diverge from the oracle on any cell whose
size is a power of two.

- [ ] **Step 5: Typecheck and commit**

```bash
cd ~/verifywise/Servers && npm run build && npm run lint
cd ~/verifywise
git add Servers/services/biasAudit/engine/
git commit -m "Port the bias-audit category table and impact ratio

Reproduces EvalServer's _compute_category_table against the committed
oracle fixtures: rates, impact ratios, small-sample exclusion under
5-301(d), flagging against the threshold, and alphabetical group order.

Three preserved behaviours are pinned by test rather than left implicit.
A blank group name is skipped, so the counted total can fall far below
the record count. A lone group becomes its own reference with no
disparity computable. And the impact ratio divides the ROUNDED rate by
the UNROUNDED highest rate, so a lone group scores 0.999999 rather than
1.0 whenever its rate is not exactly representable; that asymmetry is
load-bearing and is asserted directly."
```

---

### Task 3: Port the scoring-rate mode and detect the degenerate median

The Review Focus 1 defect. The port reproduces the arithmetic and adds a diagnostic.

**Files:**
- Create: `Servers/services/biasAudit/engine/scoringRate.ts`
- Test: `Servers/services/biasAudit/engine/scoringRate.test.ts`

**Interfaces:**
- Consumes: `computeCategoryTable`, `round6`, `AuditRecord` from Task 2.
- Produces:
  - `overallMedian(records: AuditRecord[], scoreColumn: string): number | null`
  - `interface DegenerateMedian { median: number; atMedian: number; total: number; distinctValues: number }`
  - `detectDegenerateMedian(records: AuditRecord[], scoreColumn: string): DegenerateMedian | null`
  - `aboveMedian(median: number, scoreColumn: string): (r: AuditRecord) => boolean`

- [ ] **Step 1: Write the failing test**

Create `scoringRate.test.ts`:

```ts
import { computeCategoryTable } from "./categoryTable";
import { aboveMedian, detectDegenerateMedian, overallMedian } from "./scoringRate";
import { byName, exp } from "./__fixtures__/load";

describe("overallMedian", () => {
  it("matches statistics.median on an even-length sample", () => {
    // Python statistics.median averages the two middle values.
    expect(overallMedian([{ s: 1 }, { s: 2 }, { s: 3 }, { s: 4 }], "s")).toBe(2.5);
  });

  it("returns null when no record carries a score", () => {
    expect(overallMedian([{ s: null }, {}], "s")).toBeNull();
  });
});

describe("scoring rate against the Python oracle", () => {
  it("reproduces scoring_rate_continuous, strictly above the median", () => {
    const c = byName("scoring_rate_continuous");
    const median = overallMedian(c.records, "score")!;
    const table = computeCategoryTable({
      records: c.records,
      categoryKey: "sex",
      categoryLabel: "Sex",
      totalApplicants: c.records.length,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: aboveMedian(median, "score"),
      titlePrefix: "Scoring rate impact ratios",
    });
    const want = exp("scoring_rate_continuous").tables[0];

    expect(table.title).toBe(want.title);
    expect(table.rows.map((r) => r.selectionRate)).toEqual(
      want.rows.map((r: any) => r.selection_rate),
    );
    expect(table.rows.map((r) => r.impactRatio)).toEqual(
      want.rows.map((r: any) => r.impact_ratio),
    );
  });
});

// Review Focus 1
describe("detectDegenerateMedian", () => {
  it("flags a three-level score whose median equals the modal value", () => {
    const c = byName("scoring_rate_median_equals_mode");
    const d = detectDegenerateMedian(c.records, "score")!;

    expect(d).not.toBeNull();
    expect(d.median).toBe(3);
    expect(d.atMedian).toBe(75);
    expect(d.total).toBe(100);
    expect(d.distinctValues).toBe(3);
  });

  it("confirms the arithmetic it is warning about: every rate zero, every ratio null", () => {
    const c = byName("scoring_rate_median_equals_mode");
    const median = overallMedian(c.records, "score")!;
    const table = computeCategoryTable({
      records: c.records,
      categoryKey: "sex",
      categoryLabel: "Sex",
      totalApplicants: c.records.length,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: aboveMedian(median, "score"),
      titlePrefix: "Scoring rate impact ratios",
    });
    const want = exp("scoring_rate_median_equals_mode").tables[0];

    // Matches the Python exactly...
    expect(table.rows.map((r) => r.selectionRate)).toEqual(
      want.rows.map((r: any) => r.selection_rate),
    );
    // ...and that output is all zeros with no ratios, which is why the
    // diagnostic above exists. The Python's own summary for this case reads
    // "No adverse impact flags detected", which a caller must not surface.
    expect(table.rows.every((r) => r.selectionRate === 0)).toBe(true);
    expect(table.rows.every((r) => r.impactRatio === null)).toBe(true);
    expect(exp("scoring_rate_median_equals_mode").summary).toContain(
      "No adverse impact flags detected",
    );
  });

  it("returns null for a continuous score, where the median separates the sample", () => {
    const c = byName("scoring_rate_continuous");
    expect(detectDegenerateMedian(c.records, "score")).toBeNull();
  });

  it("flags a two-value score column", () => {
    const records = [...Array(50)].map((_, i) => ({ score: i < 40 ? 1 : 0 }));
    const d = detectDegenerateMedian(records, "score")!;
    expect(d.distinctValues).toBe(2);
    expect(d.median).toBe(1);
    expect(d.kind).toBe("none_above");
  });

  // The near-degenerate case, which is the more dangerous of the two.
  it("flags a column where a handful clear the median, and says so", () => {
    // 97 at level 1, 3 at level 2. Verified against the Python: this yields
    // Female IR 0.50 FLAGGED and Male IR 1.0, from 1 record against 2.
    const records = [...Array(100)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female",
      score: i < 3 ? 2 : 1,
    }));
    const d = detectDegenerateMedian(records, "score")!;
    expect(d).not.toBeNull();
    expect(d.kind).toBe("too_few_above");
    expect(d.above).toBe(3);
    expect(d.total).toBe(100);
    expect(d.aboveFraction).toBeCloseTo(0.03, 6);
    expect(d.floor).toBe(0.05);
  });

  it("confirms the near-degenerate arithmetic it is warning about", () => {
    const records = [...Array(100)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female",
      score: i < 3 ? 2 : 1,
    }));
    const median = overallMedian(records, "score")!;
    const table = computeCategoryTable({
      records, categoryKey: "sex", categoryLabel: "Sex",
      totalApplicants: 100, threshold: 0.8, smallSampleExclusion: null,
      rateOf: aboveMedian(median, "score"),
      titlePrefix: "Scoring rate impact ratios",
    });
    const female = table.rows.find((r) => r.categoryName === "Female")!;
    // An adverse-impact flag decided by one record against two.
    expect(female.impactRatio).toBe(0.5);
    expect(female.flagged).toBe(true);
    expect(female.selectedCount).toBe(1);
  });

  it("does not flag a sample where enough clear the median", () => {
    // 10 of 100 above, at the 0.05 floor.
    const records = [...Array(100)].map((_, i) => ({ score: i < 10 ? 2 : 1 }));
    expect(detectDegenerateMedian(records, "score")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/engine/scoringRate.test.ts`
Expected: FAIL, cannot find module `./scoringRate`.

- [ ] **Step 3: Write the implementation**

Create `scoringRate.ts`:

```ts
import type { AuditRecord } from "./types";

function scores(records: AuditRecord[], scoreColumn: string): number[] {
  const out: number[] = [];
  for (const r of records) {
    const v = r[scoreColumn];
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Median of the full sample, matching Python's `statistics.median`. */
export function overallMedian(records: AuditRecord[], scoreColumn: string): number | null {
  const values = scores(records, scoreColumn).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

/**
 * § 5-301(c) defines the scoring rate as the share of a group scoring above
 * the sample median. Strictly above, matching EvalServer.
 */
export function aboveMedian(median: number, scoreColumn: string) {
  return (record: AuditRecord): boolean => {
    const v = record[scoreColumn];
    if (v === null || v === undefined || v === "") return false;
    const n = Number(v);
    return Number.isFinite(n) && n > median;
  };
}

export interface DegenerateMedian {
  median: number;
  atMedian: number;
  above: number;
  total: number;
  aboveFraction: number;
  distinctValues: number;
  /** "none_above" when nothing clears the median, "too_few_above" otherwise. */
  kind: "none_above" | "too_few_above";
  /** The floor `aboveFraction` fell below, so the stance can print it. */
  floor: number;
}

/**
 * A scoring rate computed from fewer than this fraction of the sample is
 * reported as degenerate. At 5% of 100 records, five candidates decide every
 * ratio in the table.
 */
export const MIN_ABOVE_MEDIAN_FRACTION = 0.05;

/**
 * Detect a score column whose median coincides with a modal value.
 *
 * When it does, "strictly above the median" excludes the whole modal block,
 * every group's rate collapses toward zero, and every impact ratio becomes
 * null — while the engine's own summary still reads "No adverse impact flags
 * detected". A caller must not present that as a clean result.
 *
 * Returns null when the median separates the sample normally.
 *
 * TWO kinds, because the near-degenerate case is the more dangerous one.
 *
 * `none_above`: nothing clears the median. Every rate is 0.0 and every ratio
 * null, while the Python's summary still reads "No adverse impact flags
 * detected". Observed on a real engagement: a three-level stoplight output with
 * 3,739 of 5,000 candidates at the top level.
 *
 * `too_few_above`: a handful clear it. The arithmetic completes and produces
 * ratios that look like findings. Verified against the Python on 100 records
 * with 97 at level 1 and 3 at level 2:
 *
 *   Female  n=50  selected=1  rate=0.02  IR=0.5   flagged=TRUE
 *   Male    n=50  selected=2  rate=0.04  IR=1.0
 *   summary: "1 group(s) flagged with impact ratio below 0.80 threshold."
 *
 * An adverse-impact flag at 0.50, decided by one record against two. This is
 * worse than `none_above`, which at least looks broken on sight.
 *
 * The choice of an at-or-above rule instead changes every impact ratio and
 * belongs to whoever is accountable for the report, not to this function. It
 * reports the condition and the floor it applied.
 */
export function detectDegenerateMedian(
  records: AuditRecord[],
  scoreColumn: string,
  floor: number = MIN_ABOVE_MEDIAN_FRACTION,
): DegenerateMedian | null {
  const values = scores(records, scoreColumn);
  if (values.length === 0) return null;

  const median = overallMedian(records, scoreColumn)!;
  const above = values.filter((v) => v > median).length;
  const aboveFraction = above / values.length;
  if (aboveFraction >= floor) return null;

  return {
    median,
    atMedian: values.filter((v) => v === median).length,
    above,
    total: values.length,
    aboveFraction,
    distinctValues: new Set(values).size,
    kind: above === 0 ? "none_above" : "too_few_above",
    floor,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/engine/scoringRate.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/engine/
git commit -m "Port the scoring-rate mode and detect a degenerate median

Reproduces EvalServer's scoring-rate branch under 5-301(c): the sample
median matching statistics.median, and the strictly-above-median rule.

Adds detectDegenerateMedian, which has no counterpart in the Python. When
the median coincides with a modal value, strictly-above excludes the whole
modal block: every rate collapses to zero and every impact ratio becomes
null, while the engine's summary still reads 'No adverse impact flags
detected'. A caller presenting that as a clean result would be reporting
a computation that did not happen.

Pinned by test on the oracle case with three score levels and 75 of 100
records at the top level. Choosing an at-or-above rule instead changes
every impact ratio, so this function reports the condition and leaves
that choice to the caller."
```

---

### Task 4: Port the intersectional table

**Files:**
- Create: `Servers/services/biasAudit/engine/intersectional.ts`
- Test: `Servers/services/biasAudit/engine/intersectional.test.ts`

**Interfaces:**
- Consumes: `round6`, `CategoryTable`, `GroupResult`, `AuditRecord` from Task 2.
- Produces: `computeIntersectionalTable(args: { records: AuditRecord[]; crossKeys: string[]; totalApplicants: number; threshold: number | null; smallSampleExclusion: number | null; rateOf: (r: AuditRecord) => boolean; title?: string }): CategoryTable`

- [ ] **Step 1: Write the failing test**

Create `intersectional.test.ts`:

```ts
import { computeIntersectionalTable } from "./intersectional";
import { byName, exp } from "./__fixtures__/load";

describe("computeIntersectionalTable against the Python oracle", () => {
  const c = byName("selection_rate_intersectional");
  const want = exp("selection_rate_intersectional").tables.find(
    (t: any) => t.category_key === "intersectional",
  );

  const table = computeIntersectionalTable({
    records: c.records,
    crossKeys: ["sex", "race_ethnicity"],
    totalApplicants: c.records.length,
    threshold: 0.8,
    smallSampleExclusion: 0.02,
    rateOf: (r) => Boolean(r.selected),
  });

  it("produces the mandatory 14 cells required by 5-301(c)(4)(iii)", () => {
    expect(table.rows).toHaveLength(14);
    expect(want.rows).toHaveLength(14);
  });

  it("matches the Python's cell names and order", () => {
    expect(table.rows.map((r) => r.categoryName)).toEqual(
      want.rows.map((r: any) => r.category_name),
    );
  });

  it("matches the Python's rates and impact ratios", () => {
    expect(table.rows.map((r) => r.selectionRate)).toEqual(
      want.rows.map((r: any) => r.selection_rate),
    );
    expect(table.rows.map((r) => r.impactRatio)).toEqual(
      want.rows.map((r: any) => r.impact_ratio),
    );
  });

  it("matches the Python's flags and exclusions", () => {
    expect(table.rows.map((r) => r.flagged)).toEqual(want.rows.map((r: any) => r.flagged));
    expect(table.rows.map((r) => r.excluded)).toEqual(want.rows.map((r: any) => r.excluded));
  });

  it("skips a record missing either half of the cross", () => {
    const partial = [
      { sex: "Male", race_ethnicity: "White", selected: true },
      { sex: "Male", selected: true },
      { race_ethnicity: "White", selected: true },
    ];
    const t = computeIntersectionalTable({
      records: partial,
      crossKeys: ["sex", "race_ethnicity"],
      totalApplicants: 3,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: (r) => Boolean(r.selected),
    });
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].applicantCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/engine/intersectional.test.ts`
Expected: FAIL, cannot find module `./intersectional`.

- [ ] **Step 3: Read the Python, then implement**

Read the reference before writing, to get the cell-name join and sort order exactly right:

```bash
cd ~/verifywise/EvalServer && sed -n '265,340p' src/engines/bias_audit/engine.py
```

Create `intersectional.ts`:

```ts
import { round6 } from "./round";
import type { AuditRecord, CategoryTable, GroupResult } from "./types";

export interface IntersectionalArgs {
  records: AuditRecord[];
  crossKeys: string[];
  totalApplicants: number;
  threshold: number | null;
  smallSampleExclusion: number | null;
  rateOf: (record: AuditRecord) => boolean;
  title?: string;
}

/**
 * Impact ratios for each combination of the crossed categories.
 *
 * § 5-301(c)(4)(iii) makes the sex × race/ethnicity intersection mandatory,
 * and it is the requirement most often skipped by anyone working from the
 * four-fifths rule rather than the rule text. For LL 144 this is 14 cells.
 *
 * A record missing any crossed attribute is skipped, as in EvalServer.
 */
export function computeIntersectionalTable(args: IntersectionalArgs): CategoryTable {
  const {
    records, crossKeys, totalApplicants, threshold,
    smallSampleExclusion, rateOf,
    title = "Impact ratios by intersectional category",
  } = args;

  const groups = new Map<string, { applicants: number; selected: number }>();
  for (const record of records) {
    const parts = crossKeys.map((k) => String(record[k] ?? ""));
    if (parts.some((p) => !p)) continue;
    // Python joins with " - " (engine.py:291), not a bare space. The cell
    // name is also the sort key, so a wrong separator changes ordering and
    // with it which cell becomes the reference.
    const name = parts.join(" - ");
    const entry = groups.get(name) ?? { applicants: 0, selected: 0 };
    entry.applicants += 1;
    if (rateOf(record)) entry.selected += 1;
    groups.set(name, entry);
  }

  const rows: GroupResult[] = [];
  let highestRate = 0;
  let highestGroup = "";

  for (const name of [...groups.keys()].sort()) {
    const { applicants, selected } = groups.get(name)!;
    const rate = applicants > 0 ? selected / applicants : 0;
    if (rate > highestRate) {
      highestRate = rate;
      highestGroup = name;
    }
    rows.push({
      categoryType: "intersectional",
      categoryName: name,
      applicantCount: applicants,
      selectedCount: selected,
      selectionRate: round6(rate),
      impactRatio: null,
      excluded: false,
      flagged: false,
    });
  }

  for (const row of rows) {
    if (smallSampleExclusion && totalApplicants > 0) {
      const proportion = row.applicantCount / totalApplicants;
      if (proportion < smallSampleExclusion) {
        row.excluded = true;
        row.impactRatio = null;
        continue;
      }
    }
    if (highestRate > 0) {
      const ratio = row.selectionRate / highestRate;
      row.impactRatio = round6(ratio);
      if (threshold !== null && ratio < threshold) row.flagged = true;
    } else {
      row.impactRatio = null;
    }
  }

  return {
    title,
    categoryKey: "intersectional",
    rows,
    highestGroup: highestGroup || null,
    highestRate: highestGroup ? round6(highestRate) : null,
  };
}
```

If the cell-name or sort assertions fail, the join separator or ordering differs from the Python. Fix the implementation to match the reference read in step 3; do not change the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/engine/intersectional.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/engine/
git commit -m "Port the intersectional table

Reproduces EvalServer's intersectional analysis against the oracle: cell
names, ordering, rates, impact ratios, flags and small-sample exclusion.

5-301(c)(4)(iii) makes the sex by race/ethnicity intersection mandatory,
which for LL 144 is 14 cells. It is the requirement most often skipped by
anyone working from the four-fifths rule rather than the rule text, so
the cell count is asserted directly."
```

---

### Task 5: Port fairness metrics, score distributions, and assemble computeBiasAudit

**Files:**
- Create: `Servers/services/biasAudit/engine/fairnessMetrics.ts`
- Create: `Servers/services/biasAudit/engine/scoreDistribution.ts`
- Create: `Servers/services/biasAudit/engine/index.ts`
- Test: `Servers/services/biasAudit/engine/index.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces:
  - `computeFairnessMetricsTable(args: {...}): FairnessMetricsTable`
  - `computeScoreDistributionTable(args: {...}): ScoreDistributionTable`
  - The full config and result shapes, added to `types.ts`. Plan 2 constructs a
    `BiasAuditConfig` to call `runAudit`, so the field list is fixed here rather than
    left to be inferred from a test mapper. Only the fields the computation reads are
    ported; the Python's presentation-only fields (`mode`, `preset_name`, `metrics`,
    `required_metadata`, `metadata`, `results_format`, and the audit-metadata block)
    are deliberately omitted.

    ```ts
    export interface CategoryConfig { label: string; groups: string[] }
    export interface IntersectionalConfig { required: boolean; cross: string[] }

    export interface BiasAuditConfig {
      presetId: string;
      metric: MetricMode;
      categories: Record<string, CategoryConfig>;
      intersectional: IntersectionalConfig;
      threshold: number | null;
      smallSampleExclusion: number | null;
      outcomeColumn: string;
      scoreColumn: string | null;
      predictionColumn: string | null;
      groundTruthColumn: string | null;
      columnMapping?: Record<string, string>;
    }

    export interface BiasAuditResult {
      metric: MetricMode;
      tables: CategoryTable[];
      scoreDistributionTables: ScoreDistributionTable[];
      fairnessMetricsTables: FairnessMetricsTable[];
      overallSelectionRate: number;
      overallMedian: number | null;
      totalApplicants: number;
      totalSelected: number;
      unknownCount: number;
      flagsCount: number;
      excludedCount: number;
      summary: string;
      diagnostics: { degenerateMedian: DegenerateMedian | null };
    }
    ```
  - `computeBiasAudit(records: AuditRecord[], config: BiasAuditConfig, unknownCount?: number): BiasAuditResult`
  - `BiasAuditResult.diagnostics: { degenerateMedian: DegenerateMedian | null }`

- [ ] **Step 1: Read the two remaining Python functions**

```bash
cd ~/verifywise/EvalServer
sed -n '340,430p' src/engines/bias_audit/engine.py   # score distribution
sed -n '430,564p' src/engines/bias_audit/engine.py   # fairness metrics
```

- [ ] **Step 2: Write the failing test**

Create `index.test.ts`:

```ts
import { computeBiasAudit } from "./index";
import { allCases, exp } from "./__fixtures__/load";

const all = allCases();

/** Map the committed snake_case config to the module's camelCase shape. */
function toConfig(c: any) {
  return {
    presetId: c.preset_id,
    metric: c.metric ?? "selection_rate",
    categories: Object.fromEntries(
      Object.entries(c.categories ?? {}).map(([k, v]: [string, any]) => [
        k, { label: v.label, groups: v.groups ?? [] },
      ]),
    ),
    intersectional: {
      required: c.intersectional?.required ?? false,
      cross: c.intersectional?.cross ?? [],
    },
    threshold: c.threshold ?? 0.8,
    smallSampleExclusion: c.small_sample_exclusion ?? null,
    outcomeColumn: c.outcome_column ?? "selected",
    scoreColumn: c.score_column ?? null,
    predictionColumn: c.prediction_column ?? null,
    groundTruthColumn: c.ground_truth_column ?? null,
  };
}

describe("computeBiasAudit reproduces the Python oracle on every case", () => {
  for (const c of all) {
    it(`matches ${c.name}`, () => {
      const got = computeBiasAudit(c.records, toConfig(c.config) as any);
      const want = exp(c.name);

      expect(got.totalApplicants).toBe(want.total_applicants);
      expect(got.totalSelected).toBe(want.total_selected);
      expect(got.overallSelectionRate).toBe(want.overall_selection_rate);
      expect(got.flagsCount).toBe(want.flags_count);
      expect(got.excludedCount).toBe(want.excluded_count);

      expect(got.tables).toHaveLength(want.tables.length);
      got.tables.forEach((table, i) => {
        const w = want.tables[i];
        expect(table.title).toBe(w.title);
        expect(table.categoryKey).toBe(w.category_key);
        expect(table.rows.map((r) => r.categoryName)).toEqual(
          w.rows.map((r: any) => r.category_name),
        );
        expect(table.rows.map((r) => r.selectionRate)).toEqual(
          w.rows.map((r: any) => r.selection_rate),
        );
        expect(table.rows.map((r) => r.impactRatio)).toEqual(
          w.rows.map((r: any) => r.impact_ratio),
        );
        expect(table.rows.map((r) => r.flagged)).toEqual(w.rows.map((r: any) => r.flagged));
        expect(table.rows.map((r) => r.excluded)).toEqual(w.rows.map((r: any) => r.excluded));
      });

      expect(got.scoreDistributionTables).toHaveLength(want.score_distribution_tables.length);
      expect(got.fairnessMetricsTables).toHaveLength(want.fairness_metrics_tables.length);
    });
  }
});

describe("diagnostics", () => {
  it("carries the degenerate-median diagnostic on the affected case", () => {
    const c = all.find((x) => x.name === "scoring_rate_median_equals_mode")!;
    const got = computeBiasAudit(c.records, toConfig(c.config) as any);
    expect(got.diagnostics.degenerateMedian).not.toBeNull();
    expect(got.diagnostics.degenerateMedian!.atMedian).toBe(75);
  });

  it("carries no diagnostic on a continuous score", () => {
    const c = all.find((x) => x.name === "scoring_rate_continuous")!;
    const got = computeBiasAudit(c.records, toConfig(c.config) as any);
    expect(got.diagnostics.degenerateMedian).toBeNull();
  });
});

describe("summary text", () => {
  it("never claims a clean result when nothing was computed", () => {
    const c = all.find((x) => x.name === "scoring_rate_median_equals_mode")!;
    const got = computeBiasAudit(c.records, toConfig(c.config) as any);
    // The Python says "No adverse impact flags detected" here. We must not.
    expect(exp(c.name).summary).toContain("No adverse impact flags detected");
    expect(got.summary).not.toContain("No adverse impact");
    expect(got.summary.toLowerCase()).toContain("median");
  });

  it("rejects an unknown metric mode", () => {
    expect(() =>
      computeBiasAudit([{ sex: "Male" }], { ...(toConfig(all[0].config) as any), metric: "nope" }),
    ).toThrow(/unknown metric mode/i);
  });

  it("rejects fairness mode without prediction and ground truth", () => {
    expect(() =>
      computeBiasAudit([{ sex: "Male" }], {
        ...(toConfig(all[0].config) as any), metric: "fairness_metrics",
      }),
    ).toThrow(/prediction and ground_truth/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/engine/index.test.ts`
Expected: FAIL, cannot find module `./index`.

- [ ] **Step 4: Implement the three files**

Write `fairnessMetrics.ts` and `scoreDistribution.ts` as direct ports of the functions read in step 1, following the structure of `categoryTable.ts`: build per-group counts, apply `smallSampleExclusion`, round with `round6`.

Then `index.ts`, which dispatches on `config.metric`, assembles the tables, and composes the summary. The summary differs from the Python in exactly one respect, which the test pins:

```ts
// When nothing was computed because the median coincided with a modal
// value, say that instead of reporting an absence of flags. EvalServer
// emits "No adverse impact flags detected" here, which reads as a clean
// result for a computation that did not happen.
if (diagnostics.degenerateMedian) {
  const d = diagnostics.degenerateMedian;
  summaryParts.push(
    `No scoring rate could be computed: the sample median (${d.median}) is also the ` +
      `highest observed value for ${d.atMedian} of ${d.total} records, across only ` +
      `${d.distinctValues} distinct values, so no record scores above it.`,
  );
} else if (metric === "selection_rate" || metric === "scoring_rate") {
  // ... the Python's flag/no-flag wording
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/engine/`
Expected: PASS, all 12 oracle cases plus the diagnostics and summary tests.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
cd ~/verifywise/Servers && npm run build && npm run lint
cd ~/verifywise
git add Servers/services/biasAudit/engine/
git commit -m "Complete the bias-audit engine port with a standalone entry point

Ports the fairness-metrics and score-distribution modes and assembles
computeBiasAudit, which reproduces EvalServer's output on all twelve
oracle cases: totals, tables, rates, impact ratios, flags, exclusions and
table counts.

One deliberate divergence, pinned by test. Where the median coincides
with a modal value the Python's summary reads 'No adverse impact flags
detected' despite computing nothing; ours states that no scoring rate
could be computed and why. The arithmetic is identical.

The module imports nothing outside itself and the committed fixtures."
```

---

### Task 6: Data gates

The validation layer EvalServer has no equivalent of: `dataset_parser.py` is 166 lines of parsing with no checks.

**Files:**
- Create: `Servers/services/biasAudit/dataGates.ts`
- Test: `Servers/services/biasAudit/dataGates.test.ts`

**Interfaces:**
- Consumes: `AuditRecord`, `BiasAuditConfig` from Task 5.
- Produces:
  - `type GateSeverity = "stop" | "warn"`
  - `interface GateFinding { code: string; severity: GateSeverity; message: string; detail?: Record<string, unknown> }`
  - `interface GateResult { findings: GateFinding[]; mayComputeRatios: boolean; mayExportPdf: boolean }`
  - `runDataGates(records: AuditRecord[], config: BiasAuditConfig): GateResult`
  - Codes: `demographic_column_majority_missing`, `fewer_than_two_groups`, `all_or_none_selected`, `score_granularity_low`, `cell_below_statutory_exclusion`, `degenerate_median`

- [ ] **Step 1: Write the failing test**

Create `dataGates.test.ts`:

```ts
import { runDataGates } from "./dataGates";

const config: any = {
  presetId: "nyc_ll144",
  metric: "selection_rate",
  categories: { sex: { label: "Sex", groups: ["Male", "Female"] } },
  intersectional: { required: false, cross: [] },
  threshold: 0.8,
  smallSampleExclusion: 0.02,
  outcomeColumn: "selected",
  scoreColumn: null,
};

const codes = (r: ReturnType<typeof runDataGates>) => r.findings.map((f) => f.code);

describe("hard stops", () => {
  // Review Focus 5
  it("stops when a demographic column is majority missing", () => {
    const records = [...Array(100)].map((_, i) => ({
      sex: i < 40 ? (i % 2 ? "Male" : "Female") : "",
      selected: i % 3 === 0,
    }));
    const result = runDataGates(records, config);
    expect(codes(result)).toContain("demographic_column_majority_missing");
    expect(result.mayComputeRatios).toBe(false);
    const f = result.findings.find((x) => x.code === "demographic_column_majority_missing")!;
    expect(f.severity).toBe("stop");
    expect(f.detail).toMatchObject({ column: "sex", present: 40, total: 100 });
  });

  it("stops when a required category has fewer than two groups", () => {
    const records = [...Array(50)].map((_, i) => ({ sex: "Male", selected: i % 2 === 0 }));
    const result = runDataGates(records, config);
    expect(codes(result)).toContain("fewer_than_two_groups");
    expect(result.mayComputeRatios).toBe(false);
  });

  // Review Focus 4
  it("stops when every record is selected", () => {
    const records = [...Array(50)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female", selected: true,
    }));
    const result = runDataGates(records, config);
    expect(codes(result)).toContain("all_or_none_selected");
    expect(result.mayComputeRatios).toBe(false);
  });

  it("stops when no record is selected", () => {
    const records = [...Array(50)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female", selected: false,
    }));
    expect(codes(runDataGates(records, config))).toContain("all_or_none_selected");
  });

  it("passes a clean dataset with no findings", () => {
    const records = [...Array(200)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female", selected: i % 5 < 2,
    }));
    const result = runDataGates(records, config);
    expect(result.findings).toEqual([]);
    expect(result.mayComputeRatios).toBe(true);
    expect(result.mayExportPdf).toBe(true);
  });
});

describe("warnings that gate the PDF only", () => {
  // Review Focus 1, surfaced as a gate
  it("warns on a low-granularity score column and on the degenerate median", () => {
    const scoring = { ...config, metric: "scoring_rate", scoreColumn: "score" };
    const records = [...Array(100)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female",
      score: i < 75 ? 3 : i < 90 ? 2 : 1,
    }));
    const result = runDataGates(records, scoring);
    expect(codes(result)).toContain("score_granularity_low");
    expect(codes(result)).toContain("degenerate_median");
    // The degenerate median is a stop: no rate can be computed at all.
    expect(result.mayComputeRatios).toBe(false);
  });

  it("warns when an intersectional cell sits below the 2% statutory exclusion", () => {
    const inter = {
      ...config,
      categories: {
        sex: { label: "Sex", groups: ["Male", "Female"] },
        race_ethnicity: { label: "Race/Ethnicity", groups: ["White", "Asian"] },
      },
      intersectional: { required: true, cross: ["sex", "race_ethnicity"] },
      smallSampleExclusion: null,
    };
    const records = [...Array(1000)].map((_, i) => ({
      sex: i < 5 ? "Female" : "Male",
      race_ethnicity: i < 5 ? "Asian" : "White",
      selected: i % 4 === 0,
    }));
    const result = runDataGates(records, inter);
    expect(codes(result)).toContain("cell_below_statutory_exclusion");
    const f = result.findings.find((x) => x.code === "cell_below_statutory_exclusion")!;
    expect(f.severity).toBe("warn");
    expect(result.mayComputeRatios).toBe(true);
    expect(result.mayExportPdf).toBe(false);
  });

  it("does not warn on granularity for a continuous score", () => {
    const scoring = { ...config, metric: "scoring_rate", scoreColumn: "score" };
    const records = [...Array(200)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female", score: (i * 7) % 101,
    }));
    expect(codes(runDataGates(records, scoring))).not.toContain("score_granularity_low");
  });
});

describe("messages", () => {
  it("never uses forbidden vocabulary", () => {
    const records = [...Array(10)].map(() => ({ sex: "", selected: true }));
    const result = runDataGates(records, config);
    const text = result.findings.map((f) => f.message).join(" ").toLowerCase();
    for (const word of ["compliant", "certified", "passed", "bias-free"]) {
      expect(text).not.toContain(word);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/dataGates.test.ts`
Expected: FAIL, cannot find module `./dataGates`.

- [ ] **Step 3: Write the implementation**

Create `dataGates.ts`. Structure: compute per-category presence counts and group counts, the selected count, score granularity via `new Set`, intersectional cell sizes, and `detectDegenerateMedian` from the engine. Push a `GateFinding` per violated condition. `mayComputeRatios` is false if any `stop`; `mayExportPdf` is false if any finding at all.

Header comment to include:

```ts
/**
 * Input validation for a bias audit dataset.
 *
 * EvalServer has no equivalent: its dataset parser parses and does not check.
 * A clean impact ratio computed from a dataset that cannot support one is
 * more dangerous than a flagged ratio, because nobody looks at it twice.
 *
 * Two severities. A `stop` means no ratios may be shown at all. A `warn`
 * means the in-app view may show them with the finding attached, but the
 * PDF is withheld: an exported document outlives the context that explains
 * its caveats.
 */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/dataGates.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/
git commit -m "Add data gates for bias audit datasets

EvalServer parses its input and does not check it. This refuses to
produce figures a dataset cannot support.

Hard stops: a demographic column that is majority missing, a required
category with fewer than two groups, every record selected or none, and a
median that coincides with a modal value. Warnings that gate the PDF but
not the in-app view: low score granularity, and an intersectional cell
below the 2% exclusion at 5-301(d) with no exclusion applied.

The split exists because an exported document outlives the screen that
explained its caveats."
```

---

### Task 7: The ID-order check

**Files:**
- Create: `Servers/services/biasAudit/idOrderCheck.ts`
- Test: `Servers/services/biasAudit/idOrderCheck.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `countRuns(values: string[]): number`
  - `expectedRuns(values: string[]): number`
  - `interface OrderFinding { attribute: string; observedRuns: number; expectedRuns: number; ratio: number; blocked: boolean }`
  - `checkIdOrder(records: Record<string, unknown>[], attributes: string[]): OrderFinding[]`

- [ ] **Step 1: Write the failing test**

Create `idOrderCheck.test.ts`:

```ts
import { checkIdOrder, countRuns, expectedRuns } from "./idOrderCheck";

describe("countRuns", () => {
  it("counts maximal consecutive stretches", () => {
    expect(countRuns(["A", "A", "B", "B", "A"])).toBe(3);
    expect(countRuns(["A", "B", "A", "B"])).toBe(4);
    expect(countRuns(["A", "A", "A"])).toBe(1);
    expect(countRuns([])).toBe(0);
    expect(countRuns(["A"])).toBe(1);
  });
});

describe("expectedRuns", () => {
  // Review Focus 3: the general formula, not n*(1-1/k).
  it("uses n + 1 - sum(ni^2)/n, which handles unequal group sizes", () => {
    // n=10, A=8, B=2 -> 10 + 1 - (64+4)/10 = 11 - 6.8 = 4.2
    const values = [...Array(8).fill("A"), ...Array(2).fill("B")];
    expect(expectedRuns(values)).toBeCloseTo(4.2, 6);
  });

  it("differs from the equal-group-size formula when groups are unequal", () => {
    const values = [...Array(8).fill("A"), ...Array(2).fill("B")];
    const wrong = values.length * (1 - 1 / 2); // 5.0
    expect(expectedRuns(values)).not.toBeCloseTo(wrong, 2);
  });

  it("agrees with the equal-group-size formula when groups are equal", () => {
    const values = [...Array(50).fill("A"), ...Array(50).fill("B")];
    // 100 + 1 - (2500+2500)/100 = 101 - 50 = 51; n*(1-1/k) = 50
    expect(expectedRuns(values)).toBeCloseTo(51, 6);
  });
});

describe("checkIdOrder", () => {
  it("flags an attribute assigned in contiguous blocks", () => {
    // The real defect: 14 blocks of ~357 across 5,000 records.
    const races = ["W", "B", "H", "A", "NH", "AI", "TM"];
    const records: Record<string, unknown>[] = [];
    for (const sex of ["Male", "Female"]) {
      for (const race of races) {
        for (let i = 0; i < 357; i++) records.push({ sex, race });
      }
    }
    const findings = checkIdOrder(records, ["sex", "race"]);

    const race = findings.find((f) => f.attribute === "race")!;
    expect(race.observedRuns).toBe(14);
    expect(race.expectedRuns).toBeGreaterThan(4000);
    expect(race.blocked).toBe(true);

    const sex = findings.find((f) => f.attribute === "sex")!;
    expect(sex.observedRuns).toBe(2);
    expect(sex.blocked).toBe(true);
  });

  it("passes a correctly interleaved corpus with unequal group sizes", () => {
    // Deterministic interleave, groups of 700/300. The equal-size formula
    // would mis-expect here; the general one must not flag it.
    const records: Record<string, unknown>[] = [];
    for (let i = 0; i < 1000; i++) records.push({ race: i % 10 < 7 ? "W" : "B" });
    for (let i = records.length - 1; i > 0; i--) {
      const j = (i * 7919) % (i + 1); // fixed permutation, no RNG
      [records[i], records[j]] = [records[j], records[i]];
    }
    const findings = checkIdOrder(records, ["race"]);
    expect(findings[0].blocked).toBe(false);
  });

  it("does not flag a clean two-block attribute as safe by its ratio alone", () => {
    // A two-block split averages position effects over half the data each
    // and they cancel, which is why a clean ratio is not reassurance.
    const records = [
      ...Array(500).fill({ sex: "Male" }),
      ...Array(500).fill({ sex: "Female" }),
    ];
    const f = checkIdOrder(records, ["sex"])[0];
    expect(f.observedRuns).toBe(2);
    expect(f.blocked).toBe(true);
  });

  it("returns an empty list for no attributes", () => {
    expect(checkIdOrder([{ a: 1 }], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/idOrderCheck.test.ts`
Expected: FAIL, cannot find module `./idOrderCheck`.

- [ ] **Step 3: Write the implementation**

Create `idOrderCheck.ts`:

```ts
/**
 * Detect protected attributes assigned in contiguous blocks of the input order.
 *
 * Why this exists. A corpus that assigns demographics in contiguous blocks
 * while generation runs in order lets anything that drifted over the run land
 * on one category instead of spreading across all of them. That produced a
 * false race finding on a real engagement: impact ratio 0.8050, p = 0.0010,
 * from a generator defect rather than from the tool under audit.
 *
 * Neither balance checks nor blueprint-independence tests can see it. Balance
 * is perfect while ordering is broken, and blueprints are byte-identical under
 * demographic permutation because the defect is in order, not content.
 *
 * A clean impact ratio on a blocked attribute is not reassurance either. On
 * that corpus, sex was the most perfectly blocked attribute — one split at the
 * midpoint — and returned 0.9770, because a two-block split averages position
 * effects over half the corpus each and they cancel.
 */

/** Number of maximal consecutive stretches of equal values. */
export function countRuns(values: string[]): number {
  if (values.length === 0) return 0;
  let runs = 1;
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== values[i - 1]) runs += 1;
  }
  return runs;
}

/**
 * Expected runs under random ordering: `n + 1 - sum(ni^2) / n`.
 *
 * NOT `n * (1 - 1/k)`, which assumes equal group sizes. That form rejected a
 * correct interleave when it was used here before.
 */
export function expectedRuns(values: string[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let sumSquares = 0;
  for (const c of counts.values()) sumSquares += c * c;
  return n + 1 - sumSquares / n;
}

export interface OrderFinding {
  attribute: string;
  observedRuns: number;
  expectedRuns: number;
  ratio: number;
  blocked: boolean;
}

/**
 * Observed-versus-expected runs per attribute.
 *
 * `blocked` is true below 0.5 of expected. A correct interleave sits near
 * 1.0; the real defect measured 14 observed against about 4,286 expected,
 * a ratio of 0.003.
 */
export function checkIdOrder(
  records: Record<string, unknown>[],
  attributes: string[],
): OrderFinding[] {
  return attributes.map((attribute) => {
    const values = records.map((r) => String(r[attribute] ?? ""));
    const observed = countRuns(values);
    const expected = expectedRuns(values);
    const ratio = expected > 0 ? observed / expected : 1;
    return {
      attribute,
      observedRuns: observed,
      expectedRuns: expected,
      ratio,
      blocked: expected > 0 && ratio < 0.5,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/idOrderCheck.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/
git commit -m "Add the ID-order run-count check

Detects protected attributes assigned in contiguous blocks of the input
order, which is how a generator defect produced a false race finding of
0.8050 at p=0.0010 on a real corpus. Neither balance checks nor blueprint
independence can see it: balance is perfect while ordering is broken.

Uses the general expected-runs formula n + 1 - sum(ni^2)/n rather than
n*(1-1/k), which assumes equal group sizes and rejected a correct
interleave when it was used here before. Both forms are pinned by test on
unequal groups, where they disagree.

Also pins that a two-block attribute is flagged: such a split averages
position effects over half the data each and they cancel, which is why
the clean 0.9770 that corpus returned on sex was not reassurance."
```

---

### Task 8: Wire the gates into a single entry point

**Files:**
- Create: `Servers/services/biasAudit/index.ts`
- Test: `Servers/services/biasAudit/index.test.ts`

**Interfaces:**
- Consumes: `computeBiasAudit` (Task 5), `runDataGates` (Task 6), `checkIdOrder` (Task 7).
- Produces:
  - `interface AuditOutcome { gates: GateResult; order: OrderFinding[]; result: BiasAuditResult | null }`
  - `runAudit(records: AuditRecord[], config: BiasAuditConfig, protectedAttributes: string[]): AuditOutcome`

- [ ] **Step 1: Write the failing test**

Create `index.test.ts`:

```ts
import { runAudit } from "./index";

const config: any = {
  presetId: "nyc_ll144",
  metric: "selection_rate",
  categories: { sex: { label: "Sex", groups: ["Male", "Female"] } },
  intersectional: { required: false, cross: [] },
  threshold: 0.8,
  smallSampleExclusion: 0.02,
  outcomeColumn: "selected",
  scoreColumn: null,
};

function clean(n = 200) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) out.push({ sex: i % 2 ? "Male" : "Female", selected: i % 5 < 2 });
  for (let i = out.length - 1; i > 0; i--) {
    const j = (i * 7919) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("runAudit", () => {
  it("computes a result for a clean dataset", () => {
    const outcome = runAudit(clean(), config, ["sex"]);
    expect(outcome.gates.findings).toEqual([]);
    expect(outcome.order[0].blocked).toBe(false);
    expect(outcome.result).not.toBeNull();
    expect(outcome.result!.tables[0].rows).toHaveLength(2);
  });

  it("returns no result when a hard stop fires", () => {
    const records = [...Array(50)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female", selected: true,
    }));
    const outcome = runAudit(records, config, ["sex"]);
    expect(outcome.gates.mayComputeRatios).toBe(false);
    expect(outcome.result).toBeNull();
  });

  it("reports blocked ordering alongside a computed result", () => {
    // Ordering is a finding about provenance, not a reason to withhold
    // arithmetic: the caller decides what may be shown.
    const records = [
      ...Array(100).fill(null).map(() => ({ sex: "Male", selected: true })),
      ...Array(100).fill(null).map(() => ({ sex: "Female", selected: false })),
    ];
    const outcome = runAudit(records, config, ["sex"]);
    expect(outcome.order[0].blocked).toBe(true);
    expect(outcome.gates.mayComputeRatios).toBe(false); // all-or-none also fires
  });

  it("computes a result but blocks the PDF on a warning", () => {
    const inter = {
      ...config,
      categories: {
        sex: { label: "Sex", groups: ["Male", "Female"] },
        race_ethnicity: { label: "Race/Ethnicity", groups: ["White", "Asian"] },
      },
      intersectional: { required: true, cross: ["sex", "race_ethnicity"] },
      smallSampleExclusion: null,
    };
    const records: Record<string, unknown>[] = [];
    for (let i = 0; i < 1000; i++) {
      records.push({
        sex: i < 5 ? "Female" : "Male",
        race_ethnicity: i < 5 ? "Asian" : "White",
        selected: i % 4 === 0,
      });
    }
    const outcome = runAudit(records, inter, ["sex", "race_ethnicity"]);
    expect(outcome.gates.mayComputeRatios).toBe(true);
    expect(outcome.gates.mayExportPdf).toBe(false);
    expect(outcome.result).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/index.test.ts`
Expected: FAIL, cannot find module `./index`.

- [ ] **Step 3: Write the implementation**

Create `index.ts`:

```ts
import { computeBiasAudit } from "./engine";
import type { AuditRecord, BiasAuditConfig, BiasAuditResult } from "./engine/types";
import { runDataGates, type GateResult } from "./dataGates";
import { checkIdOrder, type OrderFinding } from "./idOrderCheck";

export interface AuditOutcome {
  gates: GateResult;
  order: OrderFinding[];
  result: BiasAuditResult | null;
}

/**
 * Gate first, then compute.
 *
 * `result` is null when a hard stop fired: the arithmetic is not attempted,
 * so there is no figure for a caller to surface by accident.
 *
 * Ordering findings travel beside the result rather than suppressing it.
 * Blocked ordering says the figures may not be attributable to the tool under
 * audit, which is a provenance question for whoever reports them; it is not a
 * reason to withhold the arithmetic from the person who must judge it.
 */
export function runAudit(
  records: AuditRecord[],
  config: BiasAuditConfig,
  protectedAttributes: string[],
): AuditOutcome {
  const gates = runDataGates(records, config);
  const order = checkIdOrder(records, protectedAttributes);
  const result = gates.mayComputeRatios ? computeBiasAudit(records, config) : null;
  return { gates, order, result };
}

export { computeBiasAudit } from "./engine";
export { runDataGates } from "./dataGates";
export { checkIdOrder, countRuns, expectedRuns } from "./idOrderCheck";
export type { AuditRecord, BiasAuditConfig, BiasAuditResult } from "./engine/types";
export type { GateFinding, GateResult, GateSeverity } from "./dataGates";
export type { OrderFinding } from "./idOrderCheck";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/`
Expected: PASS, the whole module.

- [ ] **Step 5: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/
git commit -m "Add the bias audit module entry point

runAudit gates before computing: a hard stop yields a null result, so no
figure exists for a caller to surface by accident.

Ordering findings travel beside the result rather than suppressing it.
Blocked ordering says the figures may not be attributable to the tool
under audit, which is a question for whoever reports them, not a reason
to withhold the arithmetic from the person judging it."
```

---

### Task 9: Independence assertions

Three properties the spec requires of the module as a whole, asserted as tests rather than left to review.

**Files:**
- Create: `Servers/services/biasAudit/__tests__/moduleIndependence.test.ts`

**Interfaces:**
- Consumes: the whole module tree.
- Produces: nothing importable.

- [ ] **Step 1: Write the test**

```ts
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MODULE = path.resolve(__dirname, "..");

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "__fixtures__") walk(p);
      } else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
        out.push(p);
      }
    }
  };
  walk(MODULE);
  return out;
}

describe("module independence", () => {
  const files = sourceFiles();

  it("has source files to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("imports nothing from another VerifyWise module", () => {
    const forbidden = /from\s+["'][^"']*(EvalServer|AIGateway|EvaluationModule|GRSModule|IngestService|EvidentlyService)/;
    const offenders = files.filter((f) => forbidden.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("imports nothing from outside this module except node builtins", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
        const spec = m[1];
        if (spec.startsWith(".")) continue;
        if (spec.startsWith("node:")) continue;
        offenders.push(`${path.relative(MODULE, f)}: ${spec}`);
      }
    }
    // Plan 1 is pure computation: no third-party runtime dependency at all.
    expect(offenders).toEqual([]);
  });

  it("performs no I/O", () => {
    const io = /\b(sequelize|fetch|axios|https?\.request|fs\.(read|write)|process\.env)\b/;
    const offenders = files.filter((f) => io.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("never embeds forbidden vocabulary in source strings", () => {
    const forbidden = ["compliant", "certified", "bias-free"];
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8").toLowerCase();
      for (const word of forbidden) {
        if (src.includes(word)) offenders.push(`${path.relative(MODULE, f)}: ${word}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("runs its own tests without the Python oracle present", () => {
    // The fixtures are committed; nothing invokes Python at test time.
    const files2 = sourceFiles().concat(
      fs.readdirSync(MODULE, { recursive: true } as any) as unknown as string[],
    );
    const anyPythonCall = files2
      .filter((f) => typeof f === "string" && f.endsWith(".ts"))
      .some((f) => {
        const p = path.join(MODULE, f as string);
        return fs.existsSync(p) && /python|venv|EvalServer/i.test(fs.readFileSync(p, "utf8"));
      });
    expect(anyPythonCall).toBe(false);
  });
});

describe("test suite is not vacuous", () => {
  it("runs a non-zero number of assertions across the module", () => {
    // A prior package reported success while verifying nothing, because its
    // test path pointed at an empty directory.
    const out = execSync(
      "npx jest --listTests --testPathIgnorePatterns=/tests/integration/ services/biasAudit 2>/dev/null",
      { cwd: path.resolve(MODULE, "../.."), encoding: "utf8" },
    );
    const count = out.trim().split("\n").filter(Boolean).length;
    expect(count).toBeGreaterThanOrEqual(6);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/__tests__/moduleIndependence.test.ts`
Expected: PASS, 7 tests. If the forbidden-vocabulary test fails, the offending file is naming a word the module may not use; reword the comment or string rather than relaxing the test.

- [ ] **Step 3: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/__tests__/
git commit -m "Assert the bias audit module's independence by test

Pins five properties review would otherwise have to catch: no import from
another VerifyWise module, no import from outside the module except node
builtins, no I/O, no forbidden vocabulary in source, and no reference to
Python or EvalServer anywhere in the shipped tree.

Also asserts the suite is not vacuous. A prior package in this problem
domain reported success while verifying nothing, because its configured
test path pointed at an empty directory."
```

---

### Task 10: Full-module verification and documentation

**Files:**
- Create: `Servers/services/biasAudit/README.md`
- Modify: `Servers/CLAUDE.md` (append to the reference table)

**Interfaces:**
- Consumes: the whole module.
- Produces: nothing importable.

- [ ] **Step 1: Run the full suite, build and lint**

```bash
cd ~/verifywise/Servers
npm run test:unit -- services/biasAudit
npm run build
npm run lint
```

Expected: all tests pass, `tsc` clean, eslint clean. Record the test count; it belongs in the commit message.

- [ ] **Step 2: Confirm the module runs with EvalServer unavailable**

```bash
cd ~/verifywise
mv EvalServer /tmp/EvalServer-moved
cd Servers && npm run test:unit -- services/biasAudit; STATUS=$?
cd ~/verifywise && mv /tmp/EvalServer-moved EvalServer
echo "exit status with EvalServer absent: $STATUS"
```

Expected: exit status 0. This is the plan's central claim and is worth demonstrating once rather than assuming.

- [ ] **Step 3: Write the module README**

Create `README.md`:

```markdown
# Bias audit module

Standalone bias-audit computation for the self-service LL 144 module. Depends on nothing
outside this directory: no EvalServer, no AIGateway, no database, no network.

## Entry point

```ts
import { runAudit } from "./services/biasAudit";

const outcome = runAudit(records, config, ["sex", "race_ethnicity"]);
// outcome.gates   — findings, and whether ratios/PDF are permitted
// outcome.order   — per-attribute run-count findings
// outcome.result  — null when a hard stop fired
```

## Structure

| File | Responsibility |
| --- | --- |
| `engine/categoryTable.ts` | Rates and impact ratios for one category |
| `engine/intersectional.ts` | The mandatory sex × race/ethnicity cells, § 5-301(c)(4)(iii) |
| `engine/scoringRate.ts` | The § 5-301(c) median rule, plus degenerate-median detection |
| `engine/fairnessMetrics.ts` | Confusion-matrix metrics |
| `engine/scoreDistribution.ts` | Per-group distributions |
| `engine/index.ts` | `computeBiasAudit` |
| `dataGates.ts` | Input validation; hard stops and PDF-gating warnings |
| `idOrderCheck.ts` | Run-count test on input ordering |
| `index.ts` | `runAudit`: gate, then compute |

## The oracle

`engine/__fixtures__/expected.json` holds EvalServer's Python output for twelve cases,
generated once on 2026-10-14. Every ported function is asserted against it. Nothing at
runtime or in CI touches Python; see the fixtures README before regenerating.

## Two behaviours worth knowing before you read the code

**0.80 is the EEOC four-fifths convention and LL 144 does not adopt it.** It is a parameter
with provenance. § 5-301(d)'s 2% exclusion is the statutory rule. The module computes both and
labels neither as a pass mark.

**A clean ratio is not reassurance.** Two checks exist because of a real corpus defect: the
degenerate-median detector, because a three-level score output once put the median on the modal
value and gave every group a rate of zero under a summary reading "No adverse impact flags
detected"; and the ID-order check, because demographics assigned in contiguous blocks produced a
false race finding that balance checks and blueprint-independence tests both passed.
```

- [ ] **Step 4: Register the module in the backend guide**

Add one row to the reference table near the end of `Servers/CLAUDE.md`:

```markdown
| Bias audit computation (standalone; no EvalServer/AIGateway dependency) | `Servers/services/biasAudit/README.md` |
```

- [ ] **Step 5: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/README.md Servers/CLAUDE.md
git commit -m "Document the bias audit module

Records the entry point, the file responsibilities, the oracle fixtures
and the two checks that exist because of real corpus defects.

Verified with EvalServer moved out of the tree: the suite passes, which
is the module-independence claim demonstrated rather than asserted."
```

---

## Self-review

**Spec coverage for plan 1's slice.** The spec's engine-port section, data gates, ID-order check and the module-independence constraint are each implemented by a task above. The spec's intake, scoring, education, generation and stance sections are plans 2 and 3 and are deliberately absent here.

**Placeholders:** none. Every code step carries the code; every test step carries the assertions.

**Type consistency:** `GroupResult`/`CategoryTable` defined in Task 2 and consumed unchanged in Tasks 4–5. `GateResult` defined in Task 6, consumed in Task 8. `OrderFinding` defined in Task 7, consumed in Task 8. `AuditRecord` defined in Task 2, used throughout. `round6` defined once in Task 2. `detectDegenerateMedian` defined in Task 3, consumed by Task 6's gate and Task 5's summary.

**Review Focus coverage:**

1. Degenerate median — Task 3 (detector plus the confirming arithmetic test), Task 5 (summary divergence), Task 6 (gate).
2. Single group in a category — Task 2.
3. Unequal group sizes in the ID-order check — Task 7, including an explicit test that the two formulas disagree.
4. All or none selected — Task 6.
5. Demographic column mostly empty — Task 2 (the 12-of-100 counted-total assertion) and Task 6 (the hard stop).

**Known gap, deliberate.** The port covers the modes the 12 oracle cases exercise. If plan 2 needs a mode or option not among them, the fixture set is extended and regenerated via Task 1's script, with the diff explained — not worked around in TypeScript.
