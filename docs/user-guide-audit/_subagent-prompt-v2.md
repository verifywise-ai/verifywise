# Audit subagent prompt template — v2

Substitute `<COLLECTION>`, `<ARTICLE>`, and `<REPORT_PATH>` before dispatching. The full prompt is everything below the `---` line.

**Changes from v1 (per Phase 1 calibration memo):**
1. Stronger negative-claim rule
2. No rationalized quantitative claims
3. Explicit ❌ vs ⚠️ examples
4. Example-value verification rule
5. Skip vs ❓ rule

---

You are auditing one VerifyWise user guide article for truthfulness against the codebase. You will write exactly one markdown findings report and return its path. Do not edit the article. Do not edit any code.

## Inputs

- **Article to audit:** `shared/user-guide-content/content/<COLLECTION>/<ARTICLE>.ts`
- **Report to write:** `<REPORT_PATH>`
- **Spec for context (read first, do not re-read after):** `docs/superpowers/specs/2026-04-29-user-guide-truthfulness-audit-design.md`

## Process (do these in order, do not skip)

1. **Read the article.** Articles are TypeScript files exporting an `ArticleContent` object with a `blocks` array. Each block has an index (0-based) — cite block indexes in findings.

2. **Read the spec's "Audit method" and "Claim taxonomy" sections** to refresh the rules. After this, do not re-read the spec.

3. **Extract every verifiable claim.** A claim is anything specific: button label, field name, menu path, expected outcome, default value, permission requirement, API behavior, regulatory mapping, cross-doc reference, example value in a table.

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
   - **Quantitative:** find the constant / enum / regex / config in code. Cite the actual line. **Rationalization is not verification — phrases like "standard REST convention", "common pattern", "typical default" are NOT acceptable evidence. If you cannot find the actual line, mark ❓.**
   - **Reference:** confirm file/endpoint/link exists. For external links, do not fetch — note "external link, not fetched".
   - **Cross-doc:** confirm the referenced `shared/user-guide-content/content/<otherCollection>/<otherSlug>.ts` exists AND its content matches the description in the link block.
   - **Compliance:** mark **low-confidence by default**. Only mark ✅ if there's an explicit code linkage (e.g., a constant tagged `EU_AI_ACT_ART_9` or a comment in the implementing file). Otherwise flag as a finding with status ⚠️ and note "aspirational mapping — no code linkage found".
   - **Negative:** **Presence of a local package, or absence of one specific external call, is NOT sufficient.** You must trace the actual request-handling code path that would have produced the negated behavior. If the trace is too long or you cannot complete it, mark ❓ unverifiable, NOT ✅.
   - **Example:** **Verify the example value actually works against the recognizer/parser/regex.** The existence of the entity type, format name, or feature in the catalog is NOT sufficient. For instance, if the doc shows "12345678901" as a Turkish TCKN example, check whether Presidio's TR_TCKN recognizer actually accepts that string (it has a checksum). If you cannot test the example, mark ❓.

6. **Cluster check.** When you find a discrepancy, scan adjacent claims in the same article — drift clusters.

7. **Browser escalation.** Only if a claim involves rendered output that cannot be inferred from code (chart shape, toast position, conditional UI gated on data state, multi-step wizard rendering). Save screenshots to `docs/user-guide-audit/<COLLECTION>/_screenshots/<ARTICLE>-<n>.png`. Local dev creds: email `gorkem.cetin@verifywise.ai`, password `Verifywise#1`.

8. **Write the findings report** to `<REPORT_PATH>` using exactly the template below.

## Status classification — explicit examples

Use **❌ wrong** when the doc says one specific thing and the code says a different specific thing:
- Doc: "Click 'Save'" — Code: button is labeled "Submit" → ❌
- Doc: "100+ patterns" — Code: 83 patterns → ❌
- Doc: "Status options are Waiting, In progress, Done" — Code: "Not started, In progress, Done" → ❌

Use **⚠️ partial** only when the doc is mostly right but missing detail or has a minor mismatch:
- Doc: "Lists 5 fields" — Code: lists 5 of 6 fields, one missing → ⚠️
- Doc: "Returns 4xx error" — Code: returns 422 specifically → ⚠️ (right shape, missing precision)

Do NOT downgrade clear contradictions to ⚠️.

## Skip vs ❓ unverifiable

- **Skip** is reserved for: opinion ("this helps you do X"), motivation, external regulatory definitions, time estimates depending on user proficiency.
- **❓ unverifiable** is for: a verifiable-type claim (UI/Behavior/Quantitative/Reference/Cross-doc/Negative/Example) where you couldn't complete the verification with available tools or in reasonable time.

If you find an OWASP-style behavior claim and cannot trace the implementation, that is a ❓ finding, NOT a Skip.

## Findings report template (copy this structure exactly)

```markdown
# Audit: <COLLECTION>/<ARTICLE>
**Article path:** shared/user-guide-content/content/<COLLECTION>/<ARTICLE>.ts
**Audited:** <YYYY-MM-DD>
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean | ⚠️ minor issues (N) | ❌ significant issues (N)

## Summary
<2-3 sentences>

## Findings
### Finding 1 — <one-line title>
- **Type:** UI | Behavior | Quantitative | Reference | Cross-doc | Compliance | Negative | Example
- **Status:** ❌ wrong | ⚠️ partial | ❓ unverifiable
- **Doc says:** "<exact quote>" (block index N)
- **Reality:** <what the code/UI actually shows>
- **Evidence:** `path/to/file.tsx:123`
- **Suggested fix:** <one sentence>
- **Confidence:** high | medium | low

## Verified claims (sampled)
- Claim: "<quote>" (block N) — verified at `path:line`
(3-5 entries minimum)

## Skipped / non-verifiable
- "<quote>" (block N) — reason: <opinion/motivation/external link/etc>
```

## Constraints (hard rules)

- Do not edit the article or any source code.
- Do not mark ✅ on negative claims with weak evidence. Use ❓ if you can't trace the absence via the actual request-handling code path.
- Do not mark ✅ on compliance claims without explicit code linkage. Default is ⚠️ "aspirational mapping".
- Do not rationalize quantitative claims. Cite the actual code line.
- Verify example values actually work against the recognizer/parser, not just that the entity type exists.
- Use ❓ (not Skip) for verifiable-type claims you couldn't verify.
- Verified claims section is mandatory. 3-5 entries minimum.
- Cite block indexes in "Doc says".

## Output

Return: the path to the report you wrote, plus a one-line summary. Nothing else.
