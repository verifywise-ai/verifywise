# Vendor risk database M3 (contract) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the contract of the vendor risk database: give every finding made before the credibility rule a label (the backfill of D4.6), show those labels to people, and re-check the watched sources. Part A does this now, all of it reversible. Part B removes `confidence`, the old path and the flag. It is written here and runs only after the user approves the flag.

**Architecture:** The backfill is a maintainer script. It works one organization at a time, and every statement filters on `organization_id`.
- **Pending finding:** decided again by the credibility rule's own parts (`describeSources` and `decideCredibility`). The inputs are what the run stored: the evidence pack the analysis read, the trace of the snippet check, and the addresses of the per-run records.
- **Accepted or dismissed finding:** keeps the label the person saw.
- **Undo:** one command clears exactly what the backfill wrote.

Nothing runs at startup or in a migration.

**Tech Stack:** Node 22, Express 4, Sequelize 6 (raw SQL), Jest; React 19, MUI 7, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-vendor-risk-database-design.md`: D4.6 (backfill and contract), D5.5 (rationale codes), D7 Q22, D8 M3, Appendix A. Read with the M1 plan (`docs/superpowers/plans/2026-10-30-vendor-risk-database-m1.md`, Ruling 7: `confidence` is still written under the flag) and the M2 plan (`docs/superpowers/plans/2026-10-31-vendor-risk-database-m2.md`).

## Rulings

1. **Two parts.**
   - **Part A runs now.** Everything in it is reversible, and none of it changes research or the database schema: the stored basis types and their wording, the backfill's decision, its queries and script, the docs, the watched sources re-check, and the gate.
   - **Part B is held.** It needs three things first: the user's approval to turn the flag on by default (D8 M1 gate), the backfill applied on each deployment, and one release that ran Part B Task 1 on every worker.
   - **The loop input keeps the irreversible steps out of reach without that approval:** dropping `confidence`, and removing the old path and the flag.
   - *Cost:* none.
2. **The backfill is a maintainer script, never run by startup or a migration.**
   - Its default is a dry run.
   - `--apply` refuses while `VENDOR_RESEARCH_VRDB` is off, before it reads anything. Labels of the new rule beside the old chips would mix the two rules.
   - `--undo` is always allowed, and clears only the bases the backfill wrote: rule `legacy_confidence`, or a rule that starts with `backfill_`.
   - *Cost:* an operator runs it once per deployment (Part B, preconditions).
3. **What is stored** (spec D4.6):
   - **Pending finding:** gets `credibility` and a basis whose rule is `backfill_<rule>` (the spec's "starts with backfill"). The person reads that rule's sentence and then "Rated again with the current rule."
   - **Accepted or dismissed finding:** gets `credibility = confidence` and the basis `{ "rule": "legacy_confidence" }`. The person reads "Rated with the earlier confidence rule."
   - **Types:** the pipeline's `CredibilityBasis` does not change. `StoredCredibilityBasis` (it, the backfilled basis, or the legacy basis) types the column on the server and in the client.
   - *Cost:* copy.
4. **A pending finding is decided by the rule's own parts.**
   - `credibility.ts` exports `describeSources(input)`, which is what `credibilityOf` now does inline. The backfill calls it with these inputs:
     - **Pack:** the run's stored `evidence`, which is the pack the analysis read (≤ `MAX_EVIDENCE_BYTES`).
     - **Provenance:** inferred from the addresses (Ruling 5).
     - **Verdict:** from Ruling 6.
     - **Target:** `buildTarget` of the vendor as it is now.
   - It then patches the inferred records (Ruling 5) and calls `decideCredibility`.
   - A cited address that the stored pack lacks reads as unconfirmed.
   - *Cost:* a run without stored evidence gives no High; the most it gives is Medium (`capped_unconfirmed`).
5. **Records by address.** The per-run lookups did not keep their provenance, so their addresses stand in for it:

   | Address | Record source | Match strength |
   |---|---|---|
   | `https://nvd.nist.gov/vuln/detail/<CVE>` | `nvd` | strong |
   | `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=<n>` | `ofac` | weak |
   | `https://www.sec.gov/Archives/edgar/data/<cik>/…` | `sec` | strong only when the vendor's stored CIK equals `<cik>` as a number, else weak |
   | `https://haveibeenpwned.com/api/v3/breach/<name>` | `hibp` | none |
   | `https://<host>/history`, `https://<host>/incidents/<id>` (added by the final review: the status page lookup is a per-run lookup too) | `statuspage` | none; `<host>` must be one `statusHostsOf` gives for the vendor's domain, and the brand's hosts count only when the stored pack holds the address under availability as a page |

   - The NVD address also stands for KEV's per-run records: KEV used the same page (`cvePageOf`), and saying the NVD lists the CVE is true for both.
   - Each inferred record is `active`. Its `source_record_id` is the CVE, the OFAC id, the accession folder or the breach name. Its `as_of` is the finding's day (UTC), the day the per-run lookup read it.
   - Check the HIBP form against `records/hibp.ts` (about line 101) before writing the pattern.
   - *Cost:* a web-found NVD page counts as a record. It would be an official page anyway, so the label is the same.
6. **The verdict, from the run's trace first.**
   - **Matching steps:** the steps with `by: "verification"` and `tool: "read"`, whose `url` is one of the finding's cited addresses, and whose `category` is absent or the finding's.
   - **A snippet-only finding:**
     - a matching step with outcome `not_on_page` gives `{ outcome: "not_on_page", url }`;
     - otherwise, if there is any matching step, it gives `{ outcome: "unread" }`;
     - otherwise the spec's rule applies: a stored `low` gives `not_on_page` at the first cited address, anything else gives `unread`.
   - **Any other finding:** a matching step with outcome `confirmed` gives `{ outcome: "confirmed", url }`, otherwise `null`.
   - **Why:** the spec's rule alone calls an unread low finding contradicted. Its label stays Low, but its sentence would say the page lacks the quote. Runs since `20261027133032` have the trace that tells the two apart.
   - *Cost:* a trace cut at its step limit before the check falls back to the spec's rule.
7. **Queries per organization.**
   - The script walks `organizations` in id order, and every read or write of a tenant table filters on `organization_id`.
   - The write is guarded by `status = :status AND credibility IS NULL`, so a finding decided, or labelled by a live run, between the read and the write is skipped and counted.
   - The runbook names the script as a maintainer tool that walks every organization one at a time.
   - *Cost:* none.
8. **A backfilled or legacy finding is never relabeled by the status job** (`vrdb/relabel.ts` skips a rule that is not a `CredibilityRule`). Its sources have no record of the vendor risk database to follow. *Cost:* a per-run OFAC entry that leaves the list later does not change a backfilled finding.
9. **The watched sources are re-checked on the operators' own pages:** the FTC data sets and case library, the HHS OCR breach portal export, and the EDPB register and news.
   - The results go into the spec (Appendix A and Q22), dated. Nothing is built.
   - The EU AI Act database stays on the human list until 2 December 2027.
   - *Cost:* none.

## Global Constraints

- **Branch and git.** Branch `feature/vendor-agents-and-risk-page`. No commit, push or PR without the user's explicit permission. Commit steps are tree snapshots in the ledger.
- **Part A changes nothing on the research path.** With the flag on or off, a run behaves as in M2. Every existing test passes unchanged, except where a task names the test it updates.
- **No new things.** No new dependency, no new environment variable, no new route, no migration (Part A), no prompt or registry change. `PROMPT_VERSION` stays `vr-6`, `CREDIBILITY_PROMPT_VERSION` stays `vr-10`, `REGISTRY_VERSION` stays `sr-4`.
- **No test reaches the network.** Hosts are `.example` except where a test is about a real address.
- **SQL and data.**
  - Application SQL uses unqualified table names.
  - Every read or write of a tenant table filters on `organization_id`.
  - The backfill never writes a finding of an organization it was not asked about.
- **Logs and output.**
  - No console output in production code; log fixed phrases and `errorName(error)` through `utils/logger/fileLogger`.
  - Scripts print to their `out`/`err` parameters: error names only, never messages, addresses or finding text.
- **UI.** Sentence case; border `#d0d5dd`; radius 4px; 30px controls. Strings go through the DOM translator with de, fr and es entries in `Clients/src/i18n/translations.ts`.
- **Test environment.** Integration tests and the browser smoke run on the throwaway Postgres 16 (127.0.0.1:55432) and Redis (56379), never on the `.env` database.
- **Type checks.** `services/` and new scripts are type-checked by the scratch tsconfig (`<scratchpad>/tsconfig.vrdb.json`; add the new files to it). The build's tsc and `npm run build` also stay clean.

## Review Focus

1. **A finding decided while the backfill runs.** The write must skip it and count it; the next run writes it as legacy. Test: Task 4, "a finding decided after the read is skipped" (integration).
2. **A run that kept no evidence, or an address its pack lacks.** The source is unconfirmed, and the finding is never High. Test: Task 3, "a finding whose run kept no evidence is at most medium".
3. **An SEC filing of another company.** Weak with the name-only note, even when the vendor has a CIK. Test: Task 3, "an SEC filing under another CIK is weak".
4. **Undo after apply.** Only what the backfill wrote is cleared; a label a live run wrote stays. Test: Task 5, "undo clears what apply wrote and nothing else" (integration).
5. **`--apply` with the flag off, and another organization.** The first is refused before any read. The second is never read or written when one organization is named. Tests: Task 5, "apply refuses while the flag is off"; Task 4, "a finding of another organization is never written" (isolation).

## File map

| File | Task | Responsibility |
|---|---|---|
| `Servers/domain.layer/interfaces/i.vendorResearch.ts`, `Servers/services/vendorResearch/credibilityText.ts`, `Servers/services/vendorResearch/vrdb/relabel.ts` | 1 | Stored bases, their English line, the status job's skip |
| `Clients/src/domain/interfaces/i.vendorResearch.ts`, `Clients/src/application/utils/vendorResearchText.ts`, `FindingRow.tsx`, `translations.ts` | 2 | The two notes on screen |
| `Servers/services/vendorResearch/credibility.ts`, `Servers/services/vendorResearch/backfill.ts` | 3 | The backfill's decision (pure) |
| `Servers/utils/vendorResearchBackfill.utils.ts` | 4 | Its queries, per organization |
| `Servers/scripts/vendorResearchBackfillCredibility.ts` | 5 | Dry run, apply, undo |
| `docs/technical/domains/vendors.md`, `docs/technical/security/tenant-isolation.md`, `shared/user-guide-content/content/risk-management/vendor-risks.ts`, the spec | 6 | Docs |
| the spec (Appendix A, Q22) | 7 | Watched sources |

---

## Part A

### Task 1: Stored bases on the server

**Files:**
- Modify: `Servers/domain.layer/interfaces/i.vendorResearch.ts`, `Servers/services/vendorResearch/credibilityText.ts`, `Servers/services/vendorResearch/vrdb/relabel.ts`, `Servers/controllers/vendorResearch.ctrl.ts` (types only)
- Test: `Servers/services/vendorResearch/__tests__/credibilityText.test.ts`, `Servers/services/vendorResearch/vrdb/__tests__/relabel.test.ts`

**Interfaces:**
- Produces:
  - `type BackfillRule = \`backfill_${CredibilityRule}\``
  - `const LEGACY_CONFIDENCE_RULE = "legacy_confidence"`
  - `interface BackfilledCredibilityBasis extends Omit<CredibilityBasis, "rule"> { rule: BackfillRule }`
  - `interface LegacyCredibilityBasis { rule: typeof LEGACY_CONFIDENCE_RULE }`
  - `type StoredCredibilityBasis = CredibilityBasis | BackfilledCredibilityBasis | LegacyCredibilityBasis`
  - `isCredibilityRule(rule: string): rule is CredibilityRule`
  - `backfillRuleOf(rule: CredibilityRule): BackfillRule`
  - `IVendorRiskFinding.credibility_basis: StoredCredibilityBasis | null`
  - `credibilityRationale(basis: StoredCredibilityBasis): string`

- [ ] **Step 1: Write the failing tests.**
  - In `credibilityText.test.ts`:
    - `"a legacy basis reads the earlier confidence rule"`: `credibilityRationale({ rule: "legacy_confidence" })` is `"Rated with the earlier confidence rule."`
    - `"a backfilled basis reads its rule and the current rule"`: an `official_record` basis of an NVD record `CVE-2026-1001`, strong and as of `2026-10-12`, given rule `backfill_official_record`, reads the sentence of `official_record` followed by `" Rated again with the current rule."`
    - `"a backfilled basis of a rule without a sentence reads only the note"`.
  - In `relabel.test.ts`, `"a backfilled or legacy finding is never relabeled"`: `relabelFinding` gives no change for a `backfill_name_only` basis and for a legacy basis, whatever the record statuses.
- [ ] **Step 2: Run them.**
  - Run: `cd Servers && npm run test -- services/vendorResearch/__tests__/credibilityText.test.ts services/vendorResearch/vrdb/__tests__/relabel.test.ts`
  - Expected: FAIL (empty sentence; type errors are not reported by ts-jest, so the failure is the assertion).
- [ ] **Step 3: Implement the types and the two cases.**
  - In `credibilityRationale`, a legacy basis returns the note alone. A backfilled basis returns the sentence of its rule, then the note, joined by one space; the note alone when the sentence is empty.
  - `relabelFinding` returns no change unless `isCredibilityRule(basis.rule)`.
  - Widen the types where the stored column is read: `IVendorRiskFinding`, `withRationale`.
- [ ] **Step 4: Run the tests and the type checks.**
  - Run: the Step 2 command, `./node_modules/.bin/tsc -p <scratchpad>/tsconfig.vrdb.json` and `npx tsc --noEmit -p tsconfig.json` (from Servers).
  - Expected: PASS; both clean.
- [ ] **Step 5: Snapshot** (ledger `Task 1: tree <sha> (no commit)`).

### Task 2: The two notes on screen

**Files:**
- Modify: `Clients/src/domain/interfaces/i.vendorResearch.ts`, `Clients/src/application/utils/vendorResearchText.ts`, `Clients/src/presentation/pages/Vendors/VendorResearchFindings/FindingRow.tsx` (only if the tests need it), `Clients/src/i18n/translations.ts`
- Test: `Clients/src/application/utils/__tests__/vendorResearchText.test.ts`, `Clients/src/presentation/pages/Vendors/VendorResearchFindings/__tests__/VendorResearchFindings.test.tsx`, `Clients/src/presentation/pages/Vendors/VendorResearchFindings/__tests__/i18n.test.tsx`

**Interfaces:**
- Consumes: Task 1's shapes (the client mirrors them).
- Produces: `credibilityRationale(basis: StoredCredibilityBasis | null, t, lang)` and `nameOnlyNote(basis: StoredCredibilityBasis | null, t)`.

- [ ] **Step 1: Write the failing tests.**
  - `vendorResearchText.test.ts`:
    - `credibilityRationale({ rule: "legacy_confidence" }, …)` is `"Rated with the earlier confidence rule."`
    - A `backfill_unverified` basis gives the `unverified` sentence, then `" Rated again with the current rule."`
    - `nameOnlyNote` of a `backfill_name_only` basis with `name_only: true` is the name-only note; of a legacy basis it is `null`.
  - `VendorResearchFindings.test.tsx`, `"a finding rated with the earlier confidence rule shows its label and the note, and no source badge"`: an accepted finding with `credibility: "medium"` and a legacy basis shows the Medium chip and the note, and renders without error.
  - `i18n.test.tsx`: the two notes in de, fr and es, with `expectNoUntranslatedText` on the legacy row.
- [ ] **Step 2: Run them.**
  - Run: `cd Clients && npx vitest run src/application/utils src/presentation/pages/Vendors/VendorResearchFindings`
  - Expected: FAIL on the new tests only.
- [ ] **Step 3: Implement.**
  - Mirror the types.
  - Handle the two rules in `credibilityRationale` as Task 1 does.
  - Read `basis.sources` only from a basis that has it.
  - Add the two strings to the de, fr and es dictionaries beside the credibility block.
- [ ] **Step 4: Run the tests and `npm run typecheck`.** Expected: PASS; clean.
- [ ] **Step 5: Snapshot.**

### Task 3: The backfill's decision

**Files:**
- Modify: `Servers/services/vendorResearch/credibility.ts` (export `describeSources`)
- Create: `Servers/services/vendorResearch/backfill.ts`
- Test: `Servers/services/vendorResearch/__tests__/backfill.test.ts`, `Servers/services/vendorResearch/__tests__/credibility.test.ts`

**Interfaces:**
- Consumes: `describeSources(input: CredibilityInput): CredibilitySource[]`, `decideCredibility`, `buildTarget`, `cvePageOf`, `ofacEntryUrl` and `filingUrl` (for test addresses), `TraceStep`; Task 1's types.
- Produces:
  - `interface LegacyFinding { id: number; status: "pending" | "accepted" | "dismissed"; category: ResearchCategory; sources: FindingSource[]; snippet_only: boolean; confidence: FindingConfidence | null; created_at: string }`
  - `interface BackfillInput { finding: LegacyFinding; evidence: readonly EvidenceSource[] | null; trace: { steps?: readonly TraceStep[] } | null; target: ResearchTarget }`
  - `backfillCredibilityOf(input: BackfillInput): { credibility: CredibilityLabel; basis: BackfilledCredibilityBasis | LegacyCredibilityBasis } | null`. It returns `null` only for a decided finding without a `confidence`, which has no label to keep.
  - `provenanceByAddress(url: string, target: ResearchTarget, day: string): CredibilitySource["record"] | null` (Ruling 5).
  - `verdictOf(finding: LegacyFinding, trace: BackfillInput["trace"]): SnippetVerdict | null` (Ruling 6).

- [ ] **Step 1: Write the failing tests** in `backfill.test.ts` (fixtures build a stored pack, a trace and a vendor):
  - `"an accepted or dismissed finding keeps its confidence as a legacy label"`: `{ credibility: "medium", basis: { rule: "legacy_confidence" } }`.
  - `"a decided finding without a confidence is left alone"`: `null`.
  - `"a pending finding citing an official page the run read is high"`: rule `backfill_official_page`; `registry_version` `sr-4`.
  - `"the NVD page of a CVE is a strong NVD record as of the finding's day"`: rule `backfill_official_record`; the record is `{ source: "nvd", match: "strong", status: "active", source_record_id: "CVE-2026-1001", as_of: "2026-10-12" }`.
  - `"an OFAC entry is weak, with the name-only note"`: rule `backfill_name_only`, `name_only: true`.
  - `"an SEC filing under the vendor's stored CIK is strong"`, and `"an SEC filing under another CIK is weak"` (the vendor has CIK `0000320193`; the filing is under `789019`).
  - `"a finding whose run kept no evidence is at most medium"`: evidence `null`, citing the official page, gives `medium` / `backfill_capped_unconfirmed`.
  - `"a snippet-only finding the check found off the page is contradicted"`: a trace step `{ by: "verification", tool: "read", url, outcome: "not_on_page" }` gives `backfill_contradicted`.
  - `"a snippet-only low finding whose pages could not be read is not called contradicted"`: steps with outcome `failed` only, so the source is unconfirmed and the rule is not `backfill_contradicted`.
  - `"without a trace, a snippet-only low finding is contradicted, as the spec says"`, and `"… a snippet-only medium finding is unconfirmed"`.
  - `"a finding the check confirmed reads the confirming page as read"`: an outcome `confirmed` step on a result source gives High.
  - In `credibility.test.ts`, `"describeSources gives what credibilityOf's basis holds"` (same input, equal `sources`).
- [ ] **Step 2: Run them.**
  - Run: `cd Servers && npm run test -- services/vendorResearch/__tests__/backfill.test.ts services/vendorResearch/__tests__/credibility.test.ts`
  - Expected: FAIL ("Cannot find module '../backfill'"; `describeSources` is not a function).
- [ ] **Step 3: Implement `describeSources` and `backfill.ts`.**
  - For every cited address that `provenanceByAddress` recognises, the provenance is `{ record: <its source> }`.
  - Call `describeSources`.
  - Replace the `record` of those sources with the one `provenanceByAddress` gave: its `match` (the SEC strength by CIK), `source_record_id` and `as_of`.
  - Call `decideCredibility(sources, { contradicted: verdict?.outcome === "not_on_page" })`.
  - Prefix the rule.
  - The address patterns are anchored, bounded, and run in linear time.
- [ ] **Step 4: Run the tests, the scratch tsc and `credibility`'s neighbours.**
  - Run: `cd Servers && npm run test -- services/vendorResearch`
  - Expected: PASS, with no other test changed.
- [ ] **Step 5: Snapshot.**

### Task 4: The backfill's queries, per organization

**Files:**
- Create: `Servers/utils/vendorResearchBackfill.utils.ts`
- Test: `Servers/tests/integration/vendorResearch.backfill.test.ts`, `Servers/tests/integration/tenant-isolation/vendor-risk-findings-backfill.isolation.test.ts`

**Interfaces:**
- Consumes: Task 3's `LegacyFinding`; Task 1's types.
- Produces (all `organizationId: number` first, every statement filtered on it except the first):
  - `listOrganizationIdsQuery(): Promise<number[]>`: `SELECT id FROM organizations ORDER BY id`.
  - `findFindingsToBackfillQuery(organizationId, afterId: number, limit: number): Promise<Array<LegacyFinding & { vendor_id: number; run_id: number }>>`: `credibility IS NULL`, `id > :afterId`, `ORDER BY id`, `LIMIT :limit`.
  - `getRunForBackfillQuery(organizationId, runId): Promise<{ evidence: EvidenceSource[] | null; trace: { steps?: TraceStep[] } | null } | null>`.
  - `getVendorForBackfillQuery(organizationId, vendorId): Promise<Parameters<typeof buildTarget>[0] | null>`.
  - `writeBackfillQuery({ organizationId, id, status, credibility, basis }): Promise<boolean>`: guarded by `status = :status AND credibility IS NULL`; true when it wrote.
  - `undoBackfillQuery(organizationId): Promise<number>`: clears `credibility` and `credibility_basis` where the rule is `legacy_confidence` or `LIKE 'backfill\_%'`; returns the count.

- [ ] **Step 1: Write the failing tests** (integration, throwaway DB, `./setup` first, `cleanupDatabase` after each).
  - In `vendorResearch.backfill.test.ts`:
    - `"lists the findings without a label, in id order, after the cursor"`.
    - `"a finding decided after the read is skipped"`: read pending, accept it, then write with `status: "pending"`, which gives `false` and leaves the row unchanged.
    - `"a finding a live run labelled is never written"`.
    - `"undo clears only the bases the backfill wrote"`: a row with a live `official_record` basis stays.
  - In the isolation test:
    - `"a finding of another organization is never written"`: writing organization A's id with organization B's `organizationId` gives `false`, and undo for A leaves B's backfilled row.
    - `"every query of the backfill filters on organization_id, but the list of organizations"`: a static check of the file's statements, as `vendor-vrdb-matches.isolation.test.ts` does.
- [ ] **Step 2: Run them.**
  - Run: `bash <workspace>/run-integration.sh '{vendorResearch.backfill,tenant-isolation/vendor-risk-findings-backfill.isolation}.test.ts'`
  - Expected: FAIL ("Cannot find module").
- [ ] **Step 3: Implement the queries.**
  - The basis is written as `CAST(:basis AS jsonb)`.
  - Rows map `confidence` as stored, and `created_at` to an ISO string.
- [ ] **Step 4: Run them, plus the integration scratch tsc.** Expected: PASS.
- [ ] **Step 5: Snapshot.**

### Task 5: The backfill script

**Files:**
- Create: `Servers/scripts/vendorResearchBackfillCredibility.ts`
- Test: `Servers/scripts/__tests__/vendorResearchBackfillCredibility.test.ts`, and an end-to-end case in `Servers/tests/integration/vendorResearch.backfill.test.ts`

**Interfaces:**
- Consumes: Task 3's `backfillCredibilityOf`; Task 4's queries (injected); `getVendorResearchConfig().vrdb` for the flag.
- Produces: `main(argv: string[], out = console.log, err = console.error, deps: BackfillDeps = defaultDeps): Promise<number>`. `BackfillDeps` holds the queries and `flagOn(): boolean`.

- [ ] **Step 1: Write the failing tests.**
  - **Unit, with fake deps:**
    - `"a dry run prints what it would write and writes nothing"`. The lines are exact:
      - `organization 1: 3 pending (high 1, medium 0, low 2), 2 decided (legacy 2)`
      - `organization 2: nothing to backfill`
      - `total: 3 pending, 2 decided; dry run, nothing written`
    - `"apply refuses while the flag is off"`: exit 2, `err` says `VENDOR_RESEARCH_VRDB is off: --apply needs the flag`, and no query is called.
    - `"apply writes, and counts what it skipped"`: `written 4, skipped 1 (decided or labelled meanwhile)`.
    - `"undo clears and counts per organization"`.
    - `"--organization limits the work to one organization"`: unknown id gives exit 2.
    - `"usage errors exit 2"`: unknown option, `--apply --undo`, `--organization` without a number.
    - `"a database error exits 1 with its name only"`.
  - **Integration, end to end**, `"undo clears what apply wrote and nothing else"`:
    - Seed two organizations: a pending NVD finding, an accepted one, a dismissed one, and a live-labelled one.
    - Apply with the flag on, then compare the rows; undo, then compare with the seed.
- [ ] **Step 2: Run them.**
  - Run: `cd Servers && npm run test -- scripts/__tests__/vendorResearchBackfillCredibility.test.ts`, then the Task 4 integration command.
  - Expected: FAIL ("Cannot find module").
- [ ] **Step 3: Implement the script.** Follow the pattern of `scripts/vendorResearchUnknownHosts.ts`:
  - A header with usage and exit codes (0 done, 1 a step failed, 2 usage or refusal).
  - The strict option parser.
  - Memos per run and per vendor inside one organization.
  - Batches of 500.
  - The footer that closes Sequelize.
  - Add the file to the scratch tsconfig.
- [ ] **Step 4: Run both, the scratch tsc, and `npm run build`.** Expected: PASS; clean.
- [ ] **Step 5: Snapshot.**

### Task 6: Docs and the user guide

**Files:**
- Modify: `docs/technical/domains/vendors.md`, `docs/technical/security/tenant-isolation.md`, `shared/user-guide-content/content/risk-management/vendor-risks.ts`, the spec's status line.

- [ ] **Step 1: Document the backfill.**
  - **`vendors.md`:**
    - A "Backfill (M3)" part: what is written for pending and decided findings, the two notes, the inferred records (Ruling 5), the verdict (Ruling 6), the script's modes and its refusal, and that it never runs by itself.
    - Add `credibility` and `credibility_basis` to the findings table there; the inventory found them missing.
  - **`tenant-isolation.md` §4.3:** one line on the script. It walks every organization, one at a time, and filters each statement on `organization_id`; it is not a cross-organization reader.
  - **User guide (`vendor-risks.ts`):** what "Rated with the earlier confidence rule" and "Rated again with the current rule" mean.
  - **Spec status line:** M3 Part A done on its date, Part B held.
- [ ] **Step 2: Check every claim against the code as written, then run the type check.**
  - Run: `cd Clients && npm run typecheck`
  - Expected: clean (the guide is typed).
- [ ] **Step 3: Snapshot.**

### Task 7: Re-check the watched sources

**Files:**
- Modify: the spec (Appendix A, a dated "Re-checked on <date>" entry; Q22's answer gains the result).

- [ ] **Step 1: Read the operators' own pages** in the browser pane or with a header request, never through a search engine's `site:`:
  - **FTC:** [data sets](https://www.ftc.gov/policy-notices/open-government/data-sets), [cases and proceedings](https://www.ftc.gov/legal-library/browse/cases-proceedings), [RSS feeds](https://www.ftc.gov/news-events/stay-connected/ftc-rss-feeds), [developer](https://www.ftc.gov/developer).
  - **HHS:** [breach portal](https://ocrportal.hhs.gov/ocr/breach/breach_report_hip.jsf), checking whether its export has a stable address.
  - **EDPB:** [Art. 60 register](https://www.edpb.europa.eu/our-work-tools/consistency-findings/register-for-article-60-final-decisions_en), [national news](https://www.edpb.europa.eu/news/national-news_en), and any feed they link.
  - **Questions for each:**
    - Is there a machine-readable feed?
    - Does it need a key?
    - Under what terms?
    - Does it name companies?
  - Label what could not be read UNVERIFIED. Download no list file.
- [ ] **Step 2: Write the results into the spec.**
  - What changed since 2026-10-29, or "no change", with links.
  - Whether any of them now meets D2's bar. If one does, it is a candidate for a later milestone; nothing is built.
  - The EU AI Act database stays on the human list (not before 2 December 2027).
- [ ] **Step 3: Snapshot.**

### Task 8: The M3 Part A gate

- [ ] **Step 1: Build and unit checks.**
  - Both: `format-check` in Servers and Clients.
  - Servers: `npm run build`, the build's tsc, the scratch tsc, the unit suite, `npm run eval:vendor-research` (38 cases, 0 regressions), `npm run check:api-drift`.
  - Clients: `typecheck`, `build`, `npx vitest run`.
- [ ] **Step 2: Integration and audit.** The integration suite in four shards, and the audit, on the throwaway services.
- [ ] **Step 3: Browser smoke on the throwaway services.**
  - Seed through the application's queries: a pending finding citing an NVD page, an accepted one with `confidence: medium`, and a pending snippet-only OFAC one.
  - Run the script with `--apply` (the flag on in its environment).
  - See on the Risks tab:
    - the backfilled High with "Rated again with the current rule.";
    - the OFAC Low with the name-only note;
    - the accepted Medium with "Rated with the earlier confidence rule.".
  - Run `--undo`, and see the Confidence chips again.
  - Clean up as M2's gate did.
- [ ] **Step 4: Ledger what stays the user's.**
  - Approval of the flag by default.
  - Running the backfill on each deployment.
  - Part B.
  - The EU AI Act database re-check.
  - M2's and M1's lists.

---

## Part B (held: do not execute without the user's approval of the flag)

**Preconditions, all of them:**
1. The user approved turning `VENDOR_RESEARCH_VRDB` on by default (the D8 M1 gate: the golden set run with the flag off and on, Q5 and Q9 answered).
2. The backfill has been applied with `--apply` on every deployment, and its dry run there reports nothing left.
3. For Task B2: one release that contains Task B1 has run on every server and worker. The workers do not migrate, and an old worker's INSERT names `confidence`.

Re-verify every file and line named below against the code at that time. They were taken from the tree of 2026-10-31.

### Task B1: One rule, no flag (release N)

- **Keep:**
  - The per-run SEC lookup, while Q4 is closed (`vrdb/gates.ts`), and HIBP and the status page.
  - The shared spacers, `NVD_LIMITS`, `fetchJson` and the NVD parts the connector imports.
  - `storedCikOf`, `mergeSameAddress`, `NAME_ONLY_LOOKUP_NOTE` and `cvePageOf`.
  - `publisherKey`, moved to `sourceRegistry/publisher.ts`.
- **Remove:**
  - The `vrdb` field of `config.ts` and the flag in `.env.example`, `CONFIGURATION_REFERENCE.md`, `vendors.md`, `web-research.md`, `automations.md` and the user guide.
  - Every flag-off branch: `job.ts` `underFlag`, `rules ?? "confidence"` in `schema.ts`, `prompts.ts`, `pipeline.ts`, `verifySnippets.ts`, `gather.ts`, `analysis.ts` and `researchAgent.ts`, `sharedRecordsLookup`'s flag-off list, and the `vrdbSyncsOn` and worker checks.
  - The vr-6 prompt and its fixture. `PROMPT_VERSION` is retired, and runs keep the version they stored.
  - `sourceTiers.ts` and its tests.
  - `confidenceCeiling`, `lowerOf` and `CONFIDENCE_RANK`.
  - The per-run KEV, NVD and OFAC lookups and their tests: `kevRecords`, `ofacRecords`, `nvdRecords` and `csvFetch.ts`.
  - The writes of `confidence`: `validation.ts`, `verifySnippets.ts`, the INSERT and `FINDING_COLUMN_NAMES`.
  - The `confidence` types (server and client).
  - The Confidence chip in `FindingRow.tsx`: every row has a label after the backfill.
  - The golden set's off and on rows: one run per vendor, scored on `credibility`.
  - The eval's `overconfident` on `confidence`: it becomes a High whose basis is not `official_record`, `official_page` or `vendor_statement`, or is dropped. Rule on that with the eval cases in front of you.
- **Tests:**
  - Update every test the inventory lists for `confidence` and the flag.
  - Add `"research never writes confidence"`: an integration run, then the row's `confidence` is NULL.
  - Add `"the vendor risk database is always on"`: no flag is read.
- **Gate:** as Task 8, plus the golden set run once.

### Task B2: The contract migration (release N+1)

- **Create** `Servers/database/migrations/<ts>-vendor-finding-drop-confidence.js` (timestamp from `date +%Y%m%d%H%M%S` when written; `verifywise.` in the DDL).
- **up:**
  1. Rows with `credibility IS NULL` get `credibility = confidence` and the legacy basis. This is a backstop if a backfill was missed: nothing is lost and nothing throws.
  2. Every row with a `confidence` gets `credibility_basis = jsonb_set(credibility_basis, '{legacy_confidence}', to_jsonb(confidence))`.
  3. `ALTER TABLE verifywise.vendor_risk_findings DROP COLUMN confidence`. Its inline check goes with it.
- **down:**
  1. Add `confidence VARCHAR(10) CHECK (confidence IN ('low','medium','high'))`.
  2. Set it to `COALESCE(credibility_basis->>'legacy_confidence', credibility)`.
  3. Remove the `legacy_confidence` key. Leave it nullable: M1's down restores `NOT NULL`.
- **Tests (integration):**
  - `"the contract keeps every old value and its down restores it"`.
  - `"a row the backfill missed gets the legacy label"`.
- **Gate:** as Task 8. The migration runs on the throwaway database up, down and up again.

### Task B3: Review

- Final review on the most capable model, one fix pass, and the human list (the EU AI Act database after 2 December 2027; Q4 for the per-run SEC lookup's removal).
