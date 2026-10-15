# Bias audit module

Standalone bias-audit computation for the self-service LL 144 module. Depends on nothing
outside this directory: no EvalServer, no AIGateway, no database, no network.

## Entry point

```ts
import { runAudit } from "./services/biasAudit";

const outcome = runAudit(records, config);
// order-checks every category in config.categories; pass a list to narrow it
// outcome.gates   — findings, and whether ratios/PDF are permitted
// outcome.order   — per-attribute run-count findings
// outcome.result  — null when a hard stop fired
```

Records arrive with canonical keys (`RECORD_KEYS`: `selected`, `score`, `prediction`,
`ground_truth`, plus one key per protected category). The dataset parser maps uploaded columns
onto them before anything here runs; the engine and the gates read the same keys.

Gate findings carry one of three severities. A `stop` means no figures are produced. A `warn`
allows the in-app view but withholds the PDF. A `note` withholds nothing: it reports a fact the
result must carry, such as the § 5-301(c) count of records in an unknown category, which
`runAudit` also passes to the engine.

## Structure

| File                          | Responsibility                                                       |
| ----------------------------- | -------------------------------------------------------------------- |
| `engine/categoryTable.ts`     | Rates and impact ratios for one category                             |
| `engine/intersectional.ts`    | The mandatory sex × race/ethnicity cells, § 5-301(c)                 |
| `engine/impactRatios.ts`      | Exclusion, ratio and flag pass shared by both tables                 |
| `engine/scoringRate.ts`       | The § 5-301(c) median rule, plus degenerate-median detection         |
| `engine/fairnessMetrics.ts`   | Confusion-matrix metrics                                             |
| `engine/scoreDistribution.ts` | Per-group distributions                                              |
| `engine/round.ts`             | Python-compatible round half to even                                 |
| `engine/recordKeys.ts`        | The canonical record keys                                            |
| `engine/groupValue.ts`        | The one definition of a blank demographic value                      |
| `engine/index.ts`             | `computeBiasAudit`                                                   |
| `dataGates.ts`                | Input validation: stops, PDF-gating warnings, and notes              |
| `idOrderCheck.ts`             | Run-count test on input ordering                                     |
| `index.ts`                    | `runAudit`: gate, then compute; clustered ordering withholds the PDF |

## The oracle

`engine/__fixtures__/expected.json` holds EvalServer's Python output for twelve cases,
generated once on 2026-10-14. Every ported function is asserted against it. Nothing at
runtime or in CI touches Python; see the fixtures README before regenerating. The suite was
run once in a checkout with no EvalServer directory and passed.

## Two behaviours worth knowing before you read the code

**0.80 is the EEOC four-fifths convention and LL 144 does not adopt it.** It is a parameter
with provenance. § 5-301(d)'s 2% exclusion is the statutory rule. The module computes both and
labels neither as a pass mark.

**A clean ratio is not reassurance.** Two checks exist because of a real corpus defect: the
degenerate-median detector, because a three-level score output once put the median on the modal
value and gave every group a rate of zero under a summary reading "No adverse impact flags
detected"; and the ID-order check, because demographics assigned in contiguous blocks produced a
false race finding that balance checks and blueprint-independence tests both passed.
