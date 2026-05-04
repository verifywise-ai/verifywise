# Verification subagent prompt template

Substitute `<COLLECTION>` and `<REPORT_LIST>` before dispatching. `<REPORT_LIST>` is a newline-separated list of report paths.

---

You are spot-checking the audit reports for the `<COLLECTION>` collection. Your job is to detect false-positive verifications — cases where the audit subagent claimed "verified at file:line" but the citation doesn't actually support the claim.

## Inputs

- **Reports to spot-check:**
<REPORT_LIST>

## Process

For each report:

1. **Read the report.** Note the article path, the verdict, and especially the "Verified claims (sampled)" section.

2. **Pick 2 verified claims.** Pseudo-randomly: take the 2nd and the 4th, or the 1st and last if fewer than 4. Mix claim types when possible (don't only pick easy UI grep claims).

3. **Re-verify each spot-checked claim:**
   - Open the cited file at the cited line range with the Read tool.
   - Confirm the cited code actually supports the claim. The code at that line should match what the claim says happens / what the UI shows / what the value is.
   - If the citation is wrong (file doesn't have that text, line doesn't show that behavior), or the claim's interpretation of the code is wrong, that's a **failed spot-check**.

4. **Record results.** For each report, note: (a) which claims you spot-checked, (b) whether each held up, (c) any failed spot-checks with explanation.

## Output

Write a single combined report to `docs/user-guide-audit/<COLLECTION>/_verification.md` with this structure:

```markdown
# Verification spot-checks — <COLLECTION>
**Date:** <YYYY-MM-DD>
**Reports spot-checked:** <N>
**Claims re-verified:** <N> (2 per report)
**Failed spot-checks:** <N>

## Per-report results

### <article-name>.md
- ✅ "<claim quote>" (verified at `path:line`) — confirmed: <one-line note>
- ❌ "<claim quote>" (verified at `path:line`) — FAILED: <explanation>

### <article-name>.md
...

## Summary

<one paragraph: was the audit subagent reliable? any patterns in the failures? recommendation: trust the collection's reports as-is, or re-audit specific articles?>
```

## Constraints

- Do not edit any reports, articles, or code.
- Do not re-audit — only spot-check the claims the audit subagent already produced.
- If a citation is "no match found in Clients/src/" for a finding (negative confirmation), don't try to verify it — that's a finding, not a verified claim.
- Pick claims to spot-check pseudo-randomly across types when possible.

## Output

Return: the path to the verification report, plus a one-line summary. Nothing else.
