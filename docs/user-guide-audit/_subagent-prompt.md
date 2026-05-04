# Audit subagent prompt template

Substitute `<COLLECTION>`, `<ARTICLE>`, and `<REPORT_PATH>` before dispatching. The full prompt is everything below the `---` line.

---

You are auditing one VerifyWise user guide article for truthfulness against the codebase. You will write exactly one markdown findings report and return its path. Do not edit the article. Do not edit any code.

## Inputs

- **Article to audit:** `shared/user-guide-content/content/<COLLECTION>/<ARTICLE>.ts`
- **Report to write:** `<REPORT_PATH>`
- **Spec for context (read first, do not re-read after):** `docs/superpowers/specs/2026-04-29-user-guide-truthfulness-audit-design.md`

## Process (do these in order, do not skip)

1. **Read the article.** Open it with the Read tool. Note that articles are TypeScript files exporting an `ArticleContent` object with a `blocks` array. Each block has an index (0-based) — you'll cite block indexes in findings.

2. **Read the spec's "Audit method" and "Claim taxonomy" sections** to refresh the rules. After this, do not re-read the spec — the rules below are sufficient.

3. **Extract every verifiable claim.** A claim is anything specific: button label, field name, menu path, expected outcome, default value, permission requirement, API behavior, regulatory mapping, cross-doc reference, example value in a table. Skip pure opinion/motivation framing.

4. **Classify each claim** using the taxonomy:
   - **UI claim** — labels, buttons, fields, menus, modals, layouts
   - **Behavior claim** — what happens (state change, side effect, navigation, validation)
   - **Quantitative claim** — HTTP codes, defaults, retention windows, regex coverage, exact counts
   - **Reference claim** — file path, API endpoint, env var, external link
   - **Cross-doc claim** — references to other articles in this user guide
   - **Compliance claim** — regulatory or framework mappings (EU AI Act, ISO 42001, NIST)
   - **Negative claim** — claims that something *doesn't* happen
   - **Example claim** — concrete examples in tables/code blocks
   - **Non-verifiable** — opinion, motivation; log in Skipped section, do not verify

5. **Verify each claim** using the method for its type:
   - **UI:** grep `Clients/src/` for the *exact quoted string*. Cite `path:line`.
   - **Behavior:** trace controller / util / hook / service. Cite the file:line where the behavior is implemented.
   - **Quantitative:** find the constant / enum / regex / config in code. Cite it.
   - **Reference:** confirm file/endpoint/link exists. For external links, do not fetch — note "external link, not fetched".
   - **Cross-doc:** confirm the referenced `shared/user-guide-content/content/<otherCollection>/<otherSlug>.ts` exists AND its content matches the description in the link block.
   - **Compliance:** mark **low-confidence by default**. Only mark ✅ if there's an explicit code linkage (e.g., a constant tagged `EU_AI_ACT_ART_9` or a comment in the implementing file). Otherwise flag as a finding with status ⚠️ and note "aspirational mapping — no code linkage found".
   - **Negative:** require a code-path trace. Do not mark ✅ on a negative claim with weak evidence. If you cannot trace the absence, mark ❓ unverifiable, not ✅.
   - **Example:** verify the example actually works (e.g., does the regex match it; does the recognizer accept this format).

6. **Cluster check.** When you find a discrepancy, scan adjacent claims in the same article — drift clusters. If feature X was renamed, multiple blocks may reference the old name.

7. **Browser escalation.** Only if a claim involves rendered output that cannot be inferred from code (chart shape, toast position, conditional UI gated on data state, multi-step wizard rendering). Do not run the browser unless escalation is genuinely needed; the parent thread is tracking time and tokens. If you escalate, save screenshots to `docs/user-guide-audit/<COLLECTION>/_screenshots/<ARTICLE>-<n>.png` and cite them in evidence. Local dev creds: email `gorkem.cetin@verifywise.ai`, password `Verifywise#1`.

8. **Write the findings report** to `<REPORT_PATH>` using exactly the template below. Do not deviate from the template — the parent thread aggregates these reports by parsing them.

## Findings report template (copy this structure exactly)

```markdown
# Audit: <COLLECTION>/<ARTICLE>
**Article path:** shared/user-guide-content/content/<COLLECTION>/<ARTICLE>.ts
**Audited:** <YYYY-MM-DD>
**Auditor:** Explore subagent
**Verdict:** ✅ clean | ⚠️ minor issues (N) | ❌ significant issues (N)

## Summary
<2-3 sentences describing the article's overall state>

## Findings
### Finding 1 — <one-line title>
- **Type:** UI | Behavior | Quantitative | Reference | Cross-doc | Compliance | Negative | Example
- **Status:** ❌ wrong | ⚠️ partial | ❓ unverifiable
- **Doc says:** "<exact quote>" (block index N)
- **Reality:** <what the code/UI actually shows>
- **Evidence:** `path/to/file.tsx:123` (or screenshot path, or "no match found in Clients/src/")
- **Suggested fix:** <one sentence>
- **Confidence:** high | medium | low

### Finding 2 — ...

## Verified claims (sampled)
- Claim: "<quote>" (block N) — verified at `path:line`
- Claim: "<quote>" (block N) — verified at `path:line`
- Claim: "<quote>" (block N) — verified at `path:line`
(3-5 entries minimum — required as proof-of-work)

## Skipped / non-verifiable
- "<quote>" (block N) — reason: <opinion/motivation/external link/etc>
```

## Constraints (hard rules)

- **Do not edit the article or any source code.** This is an audit, not a fix pass.
- **Do not mark ✅ on negative claims with weak evidence.** Use ❓ if you can't trace the absence.
- **Do not mark ✅ on compliance claims without explicit code linkage.** Default is ⚠️ "aspirational mapping".
- **Verified claims section is mandatory.** 3-5 entries minimum, even if there are zero findings — this is proof you actually verified, not just skimmed.
- **Cite block indexes** in "Doc says" so the fix pass can target the exact block.
- **Stay within the article.** Don't audit other articles even if they look related — that's a separate task.

## Output

Return: the path to the report you wrote, plus a one-line summary like "Wrote `<REPORT_PATH>` — verdict: ❌ significant issues (5)". Nothing else. The parent thread reads the report directly.
