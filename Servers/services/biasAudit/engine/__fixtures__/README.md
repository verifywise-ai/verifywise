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
present it as a result. Its summary also differs: it states why no ratio was computed instead
of reporting an absence of flags, here and wherever a table has no reference group (for
example `selection_rate_none_selected`). See the port's `engine/index.ts`.
