# Vendor risk database M1 (the MVP behind the flag) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror the CISA KEV, OFAC SDN, UK and EU sanctions lists, look every researched vendor up in them, store a computed credibility label with its basis on every finding, and show the label, its rationale, the source badges and the run's coverage, all behind `VENDOR_RESEARCH_VRDB` (off by default).

**Architecture:** Shared `vrdb_*` tables hold the mirrored records; a BullMQ queue of its own syncs each list on a schedule through the page guard, and a pure `offerRecords` turns the matching rows into ledger records and a coverage block. With the flag on, a run asks the VRDB in place of the per-run KEV and OFAC lookups, analyses with the credibility prompt, and stores M0's labels beside the findings. With the flag off nothing changes.

**Tech Stack:** Node 22, Express 4, Sequelize 6 (raw SQL), BullMQ, Redis, Jest; React 19, MUI 7, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-vendor-risk-database-design.md` (D4, D5, D6, D8 M1, Q25–Q27). The M0 plan, `docs/superpowers/plans/2026-10-29-vendor-risk-database-m0.md`, hands work to M1 in its Rulings 1–6 and 15; its ledger lists 8 deferred minors, all fixed here.

## Rulings

These settle what the spec leaves open or depart from it, each with the cost if wrong.

1. **One id per database.** The VRDB source ids reuse the record ids `kev` and `ofac` and add `uk_sanctions` and `eu_fsf`, where D4.4 shows `cisa_kev` and `ofac_sdn`. One id then names a database in the ledger, the basis, the coverage and the stored sources, and M0's `classifyRecord` keeps working. *Cost:* a rename of four seed ids.
2. **Scheduler ids** are `vrdb_sync_<sourceId>`, not D4.7's `vrdb_sync:<sourceId>`: no scheduler id in the code base has a colon and BullMQ's handling of one is unverified. *Cost:* none.
3. **Both processes read the flag.** The backend registers the schedulers (`jobs/producer.ts` runs at start-up), the worker runs the research and the syncs. Schedulers are upserted only when `VENDOR_RESEARCH_VRDB=true` and `VENDOR_RESEARCH_RECORDS` is not `false`, and removed otherwise; the sync job checks both again. *Cost:* a deployment that sets the flag on one process only gets no mirror (worker) or no schedule (backend); `.env.example` says so.
4. **Requests per sync.** OFAC needs two files (`SDN.CSV`, `ALT.CSV`) and the EU two requests (the feed, then the file), where D4.7 says one request per source and sync. *Cost:* one extra request per 6 hours for two sources.
5. **Staleness.** Every source is stale after 48 hours, the value D5.7 case 12 gives for OFAC. *Cost:* one number per source to change.
6. **Coverage gains `attribution`** (Q19's "Data sources" line) on each source, and `lookups` lists `nvd`, `hibp`, `sec` and `statuspage` with the same outcome words. *Cost:* none.
7. **`confidence` stays written under the flag**, from `confidenceCeiling`, which M0's validation already computes: `NewFinding` keeps its type and nothing shows the value while `credibility` is set. D4.6 makes the column nullable, which M1's migration does. *Cost:* M3 drops a column that holds values nobody reads.
8. **`REGISTRY_VERSION` becomes `sr-2`** for Q25–Q27; no label was ever stored under `sr-1`. *Cost:* none.
9. **No XML dependency.** The UK and EU lists are read by a linear-time scanner (`vrdb/xmlScan.ts`), as `statuspage.ts` and `parseBingRss` read their XML today. *Cost:* a scanner to maintain.
10. **Conditional GET** is a new function of the page guard, `guardedConditionalFetch`, so `guardedFetch` and its callers do not change. *Cost:* none.
11. **Case 28** uses a KEV entry that CISA withdrew after its CVE was rejected (`withdrawn` in the mirror). The CVE mirror, which marks the CVE itself `rejected`, is M2. *Cost:* M2 adds the CVE variant.
12. **The credibility prompt becomes `vr-8`.** Its sanctions paragraph names the UK and EU marks and reads the lookup note for a name-only match, since a UK entry can match by website. The confidence prompt (`vr-6`) does not change. D4.1 and D4.11 say `vr-7`; read them as "the credibility prompt". *Cost:* none; `vr-7` was never stored.
13. **Record addresses.** A list with no page per record cites its public page with the record id as a query parameter (`?uid=` for the UK list, `?logicalId=` for the EU list), so each record is a source of its own. The ledger keeps one entry per address, and `canonicalUrl` keeps parameters that are not tracking ones. *Cost:* a citation opens the whole list.
14. **The API's English line** is `credibility_rationale` on every finding the findings endpoints return (D4.6: "the API adds the English line"). *Cost:* none.
15. **Golden set.** M1 builds a scorer that reads the stored runs of a labelled organisation and a candidate list. It does not build a live runner: the runs are ordinary research runs, made once with the flag off and once with it on. *Cost:* the person who labels also starts two runs per vendor.
16. **The 8 deferred minors of M0 are fixed in M1**, because the user asked for everything to be finished; each is named in the task that fixes it. *Cost:* none.
17. **The read order (R22, R26) and the blocked filter follow the rules**, not the flag directly: under the credibility rules, news reads and the snippet check pick by registry category, and a BLOCKED source never enters the pack (M0 Rulings 4 and 5). The flag selects the rules. *Cost:* none.
18. **`vrdb_lookups` is created by M1's migration**, for M2's read-through sources, so that the spec's three migrations stay three. *Cost:* an empty table until M2.

## Global Constraints

- Branch `feature/vendor-agents-and-risk-page`. No commit, push or PR without the user's explicit permission (D8). Commit steps are recorded as tree snapshots in the ledger instead.
- With the flag off (the default), behaviour is unchanged: today's lookups, `confidenceCeiling`, `vr-6`, `confidence` written, no coverage. Every existing test passes unchanged except where a task names the test it updates.
- No new dependency. No new route, so `swagger.yaml` and `endpoints.ts` are not regenerated (D4.10).
- No test reaches the network: fixtures and fake fetches. Fixtures are written from the documented formats, never copied from a real list, and hold no personal data. Hosts are `.example` except where a test is about a real host.
- Migrations: timestamps from `date +%Y%m%d%H%M%S` when the file is written, later than `20261028232304`; `verifywise.` in the DDL; reversible.
- Application SQL uses unqualified table names; every query of `vendor_vrdb_matches` filters on `organization_id`.
- The EU file token is never written to code, configuration, a fixture, a log line or a stored row (Q2). A sync stores and logs error codes, never messages or addresses.
- No real list file is downloaded without the user's permission (each request names the file, the source and the size).
- No console output in production code; log fixed phrases and `errorName(error)` through `utils/logger/fileLogger`.
- UI: sentence case; border `#d0d5dd`; radius 4px; the credibility chip is neutral; the word "clean" is never shown; strings go through `t()` with de, fr and es entries.
- Integration tests, the audit and the browser smoke run on a throwaway Postgres 16 and Redis, never on the `.env` database.
- The type check of `services/` is the scratch tsconfig of M0 (`<scratchpad>/tsconfig.vrdb.json`, which includes `services/vendorResearch/**` and `services/webResearch/**`): the project's `tsc` and ts-jest do not check those files.

## Review Focus

1. **A cut or wrong download.** A body cut at the size limit, an HTML error page served with 200, or a list that parsed with errors must fail the sync and leave the mirror as it was. Tests: Task 9, "a body cut at the size limit fails as too_large and keeps the mirror" and "an HTML page where the XML should be fails as parse_errors"; Task 11, "a failed apply leaves the old records" (integration).
2. **One vendor name in two organisations.** Match rows are per organisation, and neither sees the other's. Test: Task 11, `vendor-vrdb-matches.isolation.test.ts`.
3. **Short or common vendor names.** A name under 4 characters gets no sanctions key, while a KEV `vendorProject` such as "SAP" still matches strongly. Test: Task 2, "a three-letter name gets a KEV key and no sanctions key".
4. **The flag flipped between runs.** A finding without `credibility` shows today's confidence chip, and a run without `coverage` shows no coverage block. Tests: Task 15, "a finding without credibility keeps the confidence chip" and "a run without coverage shows no coverage block".
5. **The EU feed changes.** A feed without the expected file address, or with an address on another host, fails as `feed_without_file`, and the token appears in no stored row or log line. Tests: Task 7, "an address on another host is not followed" and "the snapshot keeps no address"; Task 9, "a failure stores a code, not a message".

## File map

Servers (`Servers/services/vendorResearch/` unless stated):

| File | Task | Responsibility |
|---|---|---|
| `sourceRegistry/entries.ts`, `sourceRegistry/classify.ts` | 1, 3 | Q25–Q27, `sr-2`, user content, e-mail rule, publisher names |
| `vrdb/types.ts`, `vrdb/sources.ts`, `vrdb/keys.ts` | 2 | Ids, definitions, match keys |
| `credibility.ts`, `evidence.ts` | 3 | Stored basis: record match from the lookup, data date, staleness |
| `../webResearch/guardedFetch.ts` | 4 | `guardedConditionalFetch` |
| `vrdb/xmlScan.ts` | 5 | Linear-time XML scanner |
| `vrdb/connectors/{types,kev,ofac,uk,eu}.ts` | 6, 7 | Download and parse each list |
| `Servers/database/migrations/<ts>-vendor-risk-database.js`, `<ts>-vendor-finding-credibility.js`, `Servers/utils/vrdb.utils.ts` | 8 | Tables and SQL |
| `vrdb/sync.ts` | 9 | The mirror job |
| `vrdb/queue.ts`, `vrdb/worker.ts`, `config.ts`, `Servers/jobs/{producer,worker}.ts` | 10 | Queue, schedulers, flag |
| `vrdb/lookup.ts` | 11 | `offerRecords`, the run-time lookup |
| `credibilityText.ts`, `Servers/utils/vendorResearch.utils.ts`, `Servers/controllers/vendorResearch.ctrl.ts` | 12 | Storage and API |
| `job.ts`, `pipeline.ts`, `researchAgent.ts`, `gather.ts`, `records/index.ts`, `verifySnippets.ts`, `prompts.ts`, `../webResearch/webSession.ts` | 13 | The run under the flag |
| `eval/*` | 14 | Cases 28–31 |
| `golden/*`, `Servers/scripts/vendorResearchGoldenSet.ts` | 17 | Golden-set scorer |

Clients: `domain/interfaces/i.vendorResearch.ts`, `application/utils/vendorResearchText.ts`, `presentation/components/StatusBadge/index.tsx` and `presentation/types/interfaces/i.chip.ts`, `presentation/pages/Vendors/VendorResearchFindings/{FindingRow,RunSummary}.tsx`, `i18n/translations.ts` (Task 15). Docs and the user guide: Task 16.

---

### Task 1: The registry answers Q25–Q27

**Files:**
- Modify: `Servers/services/vendorResearch/sourceRegistry/entries.ts`, `Servers/services/vendorResearch/sourceRegistry/classify.ts`, `Servers/services/webResearch/urlCanon.ts` (minor 3)
- Test: `sourceRegistry/__tests__/classify.test.ts`, `sourceRegistry/__tests__/entries.test.ts`, `__tests__/credibility.test.ts`, `Servers/services/webResearch/__tests__/urlCanon.test.ts`

**Interfaces:**
- Consumes: M0's `createSourceClassifier`, `RegistryEntry`, `DowngradeRule`, `SourceClass`.
- Produces:
  - `REGISTRY_VERSION = "sr-2"`.
  - `USER_CONTENT_HOST_LABELS` and `USER_CONTENT_SECTIONS`, both `["community", "forum", "forums", "discuss", "discussions", "answers"]` (G11).
  - `RegistryEntry.userContent?: true`, set on `blogs`, `social`, `forums` and `wikis-archives` (G6–G9).
  - `DowngradeRule`'s host variant becomes `{ host: string; pathPrefix?: string }`.
  - `SourceClass.userContent?: true`.
  - `emailOnDomain(text: string, domain: string): boolean`, exported from `classify.ts` in place of `namesDomain` for wires.

- [ ] **Step 1: Write the failing tests** in `classify.test.ts`, with target `{ name: "Acme", domain: "acme.example", provides: "" }` unless stated:
  - "a thread on the vendor's community host is user content": `https://community.acme.example/t/data-leak/123`, `onVendorSite: true` gives `category: "unverified"`, `userContent: true`, `entry: null`.
  - "a forum section of the vendor's own site is user content": `https://acme.example/en/forums/topic/1`, `onVendorSite: true`, gives `unverified`.
  - "a post on a platform that is the vendor's website is user content": target domain `linkedin.com`, `https://www.linkedin.com/posts/someone_activity-1`, `onVendorSite: true`, gives `unverified` and `entry: "social"`.
  - "the vendor's own subdomain of a platform stays the vendor's": target domain `acme.substack.com`, `https://acme.substack.com/p/security-update`, `onVendorSite: true`, gives `vendor`.
  - "another blog on the same platform is not the vendor's": the same target, `https://other.substack.com/p/x`, `onVendorSite: false`, gives `unverified` and `entry: "blogs"`.
  - "a forum on a trusted press host is user content": `https://forums.theregister.com/forum/all/2026/01/01/x/` gives `unverified`.
  - "an EDGAR filing is unverified and a SEC release official": `https://www.sec.gov/Archives/edgar/data/1234567/000123456726000001/form8-k.htm` gives `unverified`, `downgraded: true`, `entry: "sec"`; `https://www.sec.gov/newsroom/press-releases/2026-1` gives `official`, `entry: "sec"`.
  - "a public comment is unverified and an agency's document official": `https://www.regulations.gov/comment/ABC-2026-0001-0002` and `https://www.regulations.gov/document/ABC-2026-0001-0001`, with `entry: "regulations-gov"`.
  - "a RECAP filing is unverified and an opinion official": `https://storage.courtlistener.com/recap/gov.uscourts.cand.1/gov.uscourts.cand.1.1.0.pdf` gives `unverified`, `downgraded: true`; `https://www.courtlistener.com/opinion/1/acme-v-doe/` gives `official`, `syndicated: true`.
  - "a wire release with an e-mail on the vendor's domain is the vendor's": `https://www.prnewswire.com/news-releases/x.html` with text "Media contact: press@acme.example" gives `vendor`.
  - "a wire release that links the vendor's advisory is unverified": the text "See https://acme.example/security/advisory-1" gives `unverified`.
  - "an e-mail on a look-alike domain is not the vendor's": "press@acme.example.evil.example" and "press@notacme.example" both give `unverified`.
  - "a vendor on a .gov domain is the vendor" (minor 4): target domain `acme.gov`, `https://acme.gov/security/notice`, `onVendorSite: true`, gives `vendor`.

  Also add `describe("emailOnDomain")`:
  - It is true for `a.b@acme.example`, `x@mail.acme.example` and `Press@ACME.example.`.
  - It is false for `acme.example`, `@acme.example`, `x@acme.examples`, `x@acme.example-shop.example` and `x@notacme.example`.
  - "it reads 200,000 @ signs in under 50 ms".

  In `entries.test.ts`, the new and changed entries carry reason, evidence, status and the review date `2026-10-30`, and the hygiene test is renamed "fails on a review 18 months old or more" (minor 7).

  In `credibility.test.ts`:
  - "a community thread on the vendor's domain gives Low in an event category": `security_incidents`, a read page, rule `unverified`.
  - "a release with the vendor's e-mail is a statement in an event category": rule `vendor_statement`.

  In `urlCanon.test.ts`: "a copy that names another site's home page as its canonical address is not credited" (minor 3). `crossSiteCanonical({ answered: "https://www.msn.com/en-us/news/x", claimed: "https://www.reuters.com/" })` gives `null`.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd Servers && npm run test -- services/vendorResearch/sourceRegistry services/vendorResearch/__tests__/credibility.test.ts services/webResearch/__tests__/urlCanon.test.ts`
  Expected: the new tests fail. Every old test passes, except those that pin `sr-1`, which Step 3 updates.

- [ ] **Step 3: Implement**
  - `entries.ts`:
    - Add entries `sec` (hosts `["sec.gov"]`, `official`, downgrade `[{ pathPrefix: "Archives" }]`, status `V`, evidence the SEC's accessing-EDGAR-data page) and `regulations-gov` (hosts `["regulations.gov"]`, `official`, downgrade `[{ pathPrefix: "comment" }]`, status `P`, evidence `https://open.gsa.gov/api/regulationsgov/`), as O21 and O22 of the spec.
    - Add `downgrade: [{ host: "storage.courtlistener.com", pathPrefix: "recap" }]` to `courtlistener`.
    - Give the new entries `reviewed: "2026-10-30"`.
  - `classify.ts`:
    - Parse the address before the vendor step.
    - **Step 1, user content:** G11, either the host's first label or any path segment equal to one of the six words, gives `{ category: "unverified", publisher: publisherKey(url) ?? host, entry: null, reviewed: true, userContent: true }`. So does a host on an entry with `userContent`, unless the target's domain is a strict subdomain of that entry's host and the source is on it; that case gives the same class with `entry: <id>`.
    - Then the vendor step.
    - Apply per-entry downgrade rules to every category. Apply G1's generic segments and host labels to `trusted_press` only (Q11).
    - The wire branch calls `emailOnDomain`.
  - `emailOnDomain`:
    - Scan each `@` with `indexOf`. Require one or more of `[a-z0-9._%+-]` before it.
    - Read the host after it while the characters are `[a-z0-9.-]`, with a trailing dot dropped and case ignored.
    - It is true when that host equals the domain or ends with `.` + domain.
    - No regular expression runs over the text.
  - `urlCanon.ts` (minor 3): `crossSiteCanonical` returns `null` when the claimed address's path is `/` or empty.
  - Change every `sr-1` assertion to `sr-2`.

- [ ] **Step 4: Run the tests and the eval**

  Run: `cd Servers && npm run test -- services/vendorResearch services/webResearch && npm run eval:vendor-research`
  Expected: PASS, and the eval prints "29 cases, 0 regressions, 0 fixed gaps".

- [ ] **Step 5: Snapshot** the tree in the ledger (no commit).

### Task 2: VRDB ids, sources and match keys

**Files:**
- Modify: `Servers/domain.layer/interfaces/i.vendorResearch.ts`, `records/types.ts`, `sourceRegistry/classify.ts`.
- Modify (Clients): wherever `RecordSourceId` labels live. Find them with `grep -rn "statuspage" Clients/src`.
- Create: `vrdb/types.ts`, `vrdb/sources.ts`, `vrdb/keys.ts`.
- Test: `vrdb/__tests__/sources.test.ts`, `vrdb/__tests__/keys.test.ts`.

**Interfaces:**
- Produces, in `i.vendorResearch.ts`:
  - `RECORD_SOURCE_IDS` gains `"uk_sanctions"` and `"eu_fsf"`.
  - `VRDB_SOURCE_IDS = ["kev", "ofac", "uk_sanctions", "eu_fsf"] as const`, `VrdbSourceId`.
  - `MATCH_METHODS = ["kev_vendor", "cve_affected_vendor", "nvd_cpe_vendor", "sec_cik", "domain", "identifier", "name_exact"] as const`, `MatchMethod`.
  - `COVERAGE_OUTCOMES = ["found", "none", "failed", "off", "not_researched"] as const`, `CoverageOutcome`.
  - `CoverageSource { id: VrdbSourceId; name: string; attribution: string; mode: "mirror" | "read_through"; checked: boolean; outcome: CoverageOutcome; strong: number; weak: number; last_success_at: string | null; stale: boolean }`.
  - `CoverageLookup { id: RecordSourceId; outcome: CoverageOutcome }`.
  - `RunCoverage { registry_version: string; sources: CoverageSource[]; lookups: CoverageLookup[]; cited: Record<SourceCategory, number> }`.
- Produces, elsewhere:
  - `RECORD_CATEGORY`: `uk_sanctions` and `eu_fsf` are `legal_regulatory`.
  - `MAX_RECORDS`: both are 2.
  - `RECORD_CLASSES`: both are `{ category: "official", match: "weak" }`.
- Produces, in `vrdb/types.ts`:
  - `ParsedRecord { sourceRecordId: string; recordType: "vulnerability" | "sanctions_entity"; title: string; summary: string; url: string; identifiers: Record<string, unknown>; matchKeys: string[]; publishedAt: string | null; sourceUpdatedAt: string | null }`.
  - `VrdbRow { id: number; sourceId: VrdbSourceId; sourceRecordId: string; recordType: string; status: RecordStatus; title: string; summary: string; url: string; matchKeys: string[]; publishedAt: string | null }`.
  - `VrdbSourceState { id: VrdbSourceId; lastSuccessAt: Date | null; lastOutcome: "ok" | "unchanged" | "failed" | "never"; sourceVersion: string | null; etag: string | null; lastModified: string | null; activeRecords: number }`.
  - `VrdbRecordMeta { recordId: number; sourceId: VrdbSourceId; sourceRecordId: string; strength: "strong" | "weak"; method: MatchMethod; matchedKey: string; status: RecordStatus; asOf: string; stale: boolean }`, where `asOf` is YYYY-MM-DD.
  - `OfferedRecord = SourceRecord & { vrdb: VrdbRecordMeta }`.
  - `VrdbOutcome { records: Array<{ source: VrdbSourceId; records: OfferedRecord[]; omitted: { old?: number; more?: number } }>; coverage: CoverageSource[] }`.
  - `VrdbLookupInput { target: ResearchTarget; researchable: readonly ResearchCategory[]; cutoffs?: Partial<Record<ResearchCategory, string>>; now: Date }`.
  - `VrdbLookup = (input: VrdbLookupInput) => Promise<VrdbOutcome>`.
- Produces, in `vrdb/sources.ts`:
  - `VrdbSourceDefinition { id; name; operator; listName; category: ResearchCategory; mode: "mirror"; schedule: string; staleAfterHours: number; licence: string; attribution: string; documentationUrl: string; missingStatus: "withdrawn" | "delisted" }`.
  - `VRDB_SOURCES`, `vrdbSourceOf(id)`, `isStale(definition, lastSuccessAt: Date | null, now: Date): boolean`.
- Produces, in `vrdb/keys.ts`:
  - `nameKey(name)` gives `name:<compactName>`; `kevKey(vendorProject)` gives `kev:<compactName>`; `domainKey(host)` gives `domain:<lower-case host without www.>`.
  - `vendorKeys(target): string[]`.
  - `matchOf(recordKeys, vendorKeys): { method: MatchMethod; strength: "strong" | "weak"; matchedKey: string } | null`.

- [ ] **Step 1: Write the failing tests**
  - `sources.test.ts`:
    - "has one definition per VRDB id, in order".
    - "every schedule is a five-field cron and no two share a minute".
    - "every source is stale after 48 hours".
    - "every source names its attribution and documentation".
    - `isStale` is false at 47 h 59 min, true at 48 h 1 min, and true for `null`.
  - `keys.test.ts`, with target "Acme Analytics", domain `acme-analytics.example`:
    - `vendorKeys` holds `kev:acmeanalytics`, `name:acmeanalytics` and `domain:acme-analytics.example`.
    - "a three-letter name gets a KEV key and no sanctions key": "SAP" gives `kev:sap` and no `name:sap`.
    - `matchOf` prefers `domain` (strong) over `kev_vendor` (strong) over `name_exact` (weak), returns the key that matched, and returns `null` without a common key.
- [ ] **Step 2: Run them to see them fail.** Run: `cd Servers && npm run test -- services/vendorResearch/vrdb`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the types and the four definitions:

  | id | name | operator | listName | category | schedule | licence | attribution | documentationUrl | missingStatus |
  |---|---|---|---|---|---|---|---|---|---|
  | `kev` | CISA Known Exploited Vulnerabilities | CISA | CISA KEV catalog | security_incidents | `23 * * * *` | CC0 1.0 | CISA Known Exploited Vulnerabilities catalog (CC0 1.0) | https://www.cisa.gov/known-exploited-vulnerabilities-catalog | withdrawn |
  | `ofac` | OFAC Specially Designated Nationals list | OFAC | OFAC SDN list | legal_regulatory | `41 */6 * * *` | None published (Q5) | OFAC Specially Designated Nationals list, US Department of the Treasury | https://sanctionslist.ofac.treas.gov/Home/static/sdn.html | delisted |
  | `uk_sanctions` | UK Sanctions List | FCDO | UK Sanctions List | legal_regulatory | `47 */6 * * *` | Open Government Licence v3.0 | UK Sanctions List, FCDO. Contains public sector information licensed under the Open Government Licence v3.0. | https://www.gov.uk/government/publications/the-uk-sanctions-list | delisted |
  | `eu_fsf` | EU consolidated list of financial sanctions | European Commission | EU financial sanctions list | legal_regulatory | `53 */6 * * *` | Commission reuse notice (Decision 2011/833/EU); CC BY 4.0 | EU consolidated list of financial sanctions, © European Union | https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions | delisted |

  `staleAfterHours: 48` everywhere. `vendorKeys` builds on `nameKeys` (`records/match.ts`): every key as `kev:`, the keys of 4 characters or more as `name:`, and the domain as `domain:`.
- [ ] **Step 4: Run the tests.** Run: `cd Servers && npm run test -- services/vendorResearch && ./node_modules/.bin/tsc -p <scratchpad>/tsconfig.vrdb.json`. Expected: PASS; tsc prints nothing.
- [ ] **Step 5: Snapshot.**

### Task 3: The stored basis (M0 Ruling 15)

**Files:**
- Modify: `Servers/domain.layer/interfaces/i.vendorResearch.ts`, `evidence.ts`, `credibility.ts`, `sourceRegistry/classify.ts`
- Test: `__tests__/credibility.test.ts`, `__tests__/evidence.test.ts`, `eval/__tests__/rules.test.ts` (minor 4)

**Interfaces:**
- Consumes: `VrdbRecordMeta` (Task 2).
- Produces:
  - `CredibilitySource` gains `publisher_name?: string` and `user_content?: true`.
  - `CredibilitySource.record` gains `source_record_id?: string`, `as_of?: string` and `stale?: true`.
  - `SourceClass.publisherName?: string`: the entry's `publisher`, for TRUSTED_PRESS.
  - `SourceProvenance.vrdb?: VrdbRecordMeta` and `SourceProvenance.answeredUrl?: string`, both copied from the ledger entry by `provenanceOf`.

- [ ] **Step 1: Write the failing tests** in `credibility.test.ts`:
  - "a VRDB record takes its match from the lookup": a `uk_sanctions` record with `vrdb.strength: "strong"` gives `official_record`, High; a weak one gives `name_only`, Low with the note.
  - "the basis keeps the record's id, the date of its data and its staleness": `source_record_id`, `as_of: "2026-10-26"` and `stale: true` on `basis.sources[0].record`.
  - "a trusted press source carries its publisher's name": `publisher_name: "Reuters"`.
  - "a read trusted page and an unconfirmed official result give Medium by trusted_press_one" (minor 1): a read `reuters.com` page and an unconfirmed `ico.org.uk` result.
  - "a page is classified by the address that answered" (minor 2): provenance `answeredUrl: "https://www.reuters.com/world/x"` for a cited `https://t.co/abc` gives `trusted_press`.
  - "user content is marked in the basis".

  In `evidence.test.ts`: "`provenanceOf` copies the VRDB meta and the answered address".

  In `rules.test.ts`: the guard on `guardedFetch` that `cases.test.ts` has (minor 4).
- [ ] **Step 2: Run to fail.** Run: `cd Servers && npm run test -- services/vendorResearch/__tests__/credibility.test.ts services/vendorResearch/__tests__/evidence.test.ts`. Expected: the new tests fail.
- [ ] **Step 3: Implement**
  - In `describeSource`, a record with `origin.vrdb` takes `match`, `status`, `source_record_id`, `as_of` and `stale` from it. Without it, the record keeps `recordMatchOf`.
  - A page is classified by `origin.answeredUrl ?? url`.
  - The rule order puts `trusted_press_one` before `capped_unconfirmed` when a read TRUSTED_PRESS source supports the finding.
  - Correct the comment of `provenanceOf` (minor 8): it keys by the address the ledger kept, which is the address the pack shows.
- [ ] **Step 4: Run** `cd Servers && npm run test -- services/vendorResearch && npm run eval:vendor-research`. Expected: PASS, and the eval prints "29 cases, 0 regressions, 0 fixed gaps".
- [ ] **Step 5: Snapshot.**

### Task 4: Conditional GET in the page guard

**Files:**
- Modify: `Servers/services/webResearch/guardedFetch.ts`
- Test: `Servers/services/webResearch/__tests__/guardedFetch.test.ts`

**Interfaces:**
- Produces:
  - `Validators { etag?: string | null; lastModified?: string | null }`.
  - `ConditionalResponse = { notModified: true; url: string } | (GuardedResponse & { notModified: false; etag: string | null; lastModified: string | null })`.
  - `guardedConditionalFetch(url: string, validators: Validators, options?: GuardedFetchOptions, deps?: GuardedFetchDeps): Promise<ConditionalResponse>`.

- [ ] **Step 1: Write the failing tests** with the fake transport the file already uses:
  - "sends If-None-Match and If-Modified-Since when given".
  - "a 304 answer resolves notModified".
  - "a 304 after a redirect resolves notModified".
  - "a 200 answer carries the ETag and Last-Modified headers".
  - "a validator with a line break or over 512 characters is not sent".
  - "guardedFetch still refuses a 304".
- [ ] **Step 2: Run to fail.** Run: `cd Servers && npm run test -- services/webResearch/__tests__/guardedFetch.test.ts`
- [ ] **Step 3: Implement.** Move the hop loop into an internal function that takes extra request headers and the statuses it accepts on the last hop. `guardedFetch` calls it with none and `[200]`; `guardedConditionalFetch` with the validators and `[200, 304]`. Every check of the URL policy, DNS, redirects, size and content type stays.
- [ ] **Step 4: Run** the file and the whole `services/webResearch` folder. Expected: PASS.
- [ ] **Step 5: Snapshot.**

### Task 5: A linear-time XML scanner

**Files:**
- Create: `vrdb/xmlScan.ts`
- Test: `vrdb/__tests__/xmlScan.test.ts`

**Interfaces:**
- Produces:
  - `XmlElement { name: string; attributes: Readonly<Record<string, string>>; children: XmlElement[]; text: string }`. Names have no namespace prefix, and `text` is the decoded text of the element itself.
  - `scanElements(xml: string, name: string, onElement: (element: XmlElement) => void): { errors: number; root: string | null }`.
  - `childText(element, path: readonly string[]): string | null`, `childTexts(element, path): string[]`, `decodeEntities(text: string): string`.

- [ ] **Step 1: Write the failing tests:**
  - "yields every element of the name with its subtree, in order".
  - "decodes the five entities and numeric references, and leaves an unknown one as written".
  - "reads CDATA as text".
  - "drops namespace prefixes".
  - "reads self-closing elements and both quotes of attributes".
  - "skips comments and processing instructions".
  - "refuses a DOCTYPE with an internal subset (no entity expansion)": `errors: 1`, nothing yielded.
  - "reports the root element's name".
  - "counts an unclosed element as an error".
  - "200,000 '<' characters scan in under 200 ms".
  - "50,000 elements scan in under a second".
- [ ] **Step 2: Run to fail.** Run: `cd Servers && npm run test -- services/vendorResearch/vrdb/__tests__/xmlScan.test.ts`
- [ ] **Step 3: Implement** with an index-based tokenizer (`indexOf`, `charCodeAt`). Keep a stack only inside a wanted element, and run no regular expression over the document. Follow `records/statuspage.ts` for the prolog, comments and CDATA.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Snapshot.**

### Task 6: The KEV and OFAC connectors

**Files:**
- Create: `vrdb/connectors/types.ts`, `vrdb/connectors/kev.ts`, `vrdb/connectors/ofac.ts`, and fixtures `vrdb/connectors/__tests__/fixtures/{kev.json,ofac-sdn.csv,ofac-alt.csv}`, written from the schema and the data specification, with fictional names.
- Modify: `records/kev.ts` and `records/ofac.ts`. They re-export the moved parsers, so the old path and every importer (`prompts.ts`, `records/nvd.ts`, eval cases 17–20, tests) keep working.
- Test: `vrdb/connectors/__tests__/kev.test.ts`, `vrdb/connectors/__tests__/ofac.test.ts`

**Interfaces:**
- Consumes: `guardedConditionalFetch` (Task 4), `ParsedRecord` (Task 2).
- Produces, in `connectors/types.ts`:
  - `ConnectorFetch = (url: string, validators: Validators, limits: { maxBytes: number; allowedContentTypes: readonly string[]; totalTimeoutMs: number }) => Promise<ConditionalResponse>`.
  - `Snapshot { bodies: string[]; etag: string | null; lastModified: string | null; bytes: number }`. It holds no address.
  - `ParseResult { records: ParsedRecord[]; errors: number; sourceVersion: string | null; root: string | null }`.
  - `Connector { id: VrdbSourceId; download(fetch: ConnectorFetch, validators: Validators): Promise<Snapshot | "unchanged">; parse(snapshot: Snapshot): ParseResult }`.
  - `kevConnector`, `ofacConnector`.

- [ ] **Step 1: Write the failing tests**
  - `kev.test.ts`:
    - "parses an entry into a record". Check `cveID` as the id, `recordType: "vulnerability"`, the NVD page as the URL, `publishedAt` = `dateAdded`, and `matchKeys: ["kev:<vendor>"]`. The summary must equal today's `kevRecords` text.
    - "ignores fields it does not know".
    - "counts an entry without cveID as an error".
    - "reads catalogVersion as the source version".
    - "download sends the validators and answers unchanged on 304".
  - `ofac.test.ts`:
    - "reads the CSV without a header and -0- as empty".
    - "keeps entities and drops individuals, vessels and aircraft".
    - "adds the aliases of ALT.CSV as name keys".
    - "caps remarks at 600 characters".
    - "download asks SDN.CSV and ALT.CSV, once each".
- [ ] **Step 2: Run to fail.** Run: `cd Servers && npm run test -- services/vendorResearch/vrdb/connectors`
- [ ] **Step 3: Implement.**
  - Limits:
    - KEV: 8 MB, `application/json`, 60 s.
    - OFAC: 16 MB for `SDN.CSV`, 8 MB for `ALT.CSV`, types `text/csv`, `text/plain` and `application/octet-stream`, 120 s.
  - The summary of a record never holds "as of" or the lookup note: the lookup adds both (Task 11).
- [ ] **Step 4: Run** the connectors and `services/vendorResearch/records`. Expected: PASS, with every old record test unchanged.
- [ ] **Step 5: Snapshot.**

### Task 7: The UK and EU connectors

**Files:**
- Create: `vrdb/connectors/uk.ts`, `vrdb/connectors/eu.ts`, and fixtures `vrdb/connectors/__tests__/fixtures/{uk-sanctions.xml,eu-fsf.xml,eu-rss.xml}`.
  - The UK fixture holds two entities, one with a website and one with a business registration number, plus an individual and a ship.
  - The EU fixture holds two enterprises, one person, and one enterprise with a `delistingDate`.
  - The RSS fixture holds the file addresses with the placeholder `token=fixture-token`.
- Test: `vrdb/connectors/__tests__/uk.test.ts`, `vrdb/connectors/__tests__/eu.test.ts`

**Interfaces:**
- Consumes: `scanElements` (Task 5), the connector types (Task 6).
- Produces: `ukConnector`, `euConnector`, `UK_RECORD_MARK = "UK Sanctions List"`, `EU_RECORD_MARK = "EU consolidated list of financial sanctions"`.

- [ ] **Step 1: Pin the formats.**
  - Read the UK XSD 4.33.3 and its format guide (links in spec D2.3), and the EU XSD 1.1 named in the operator's feed (D2.4), with the web-fetch agent. These are documents, not list files.
  - Write the element and attribute paths each parser reads into the header comment of its fixture.
  - A path that cannot be read is marked UNVERIFIED there and is taken from the format guide's field names. The parser checks the root element, so a wrong guess fails the sync instead of mirroring nothing.
  - Search the web once for a UK page per designation. Use it if the UK government publishes one; otherwise use Ruling 13's address.
- [ ] **Step 2: Write the failing tests**
  - `uk.test.ts`:
    - "keeps entities and drops individuals and ships".
    - "reads every name as a name key".
    - "reads the website's host as a domain key".
    - "keeps business registration numbers as identifiers, not keys (Q1 is M2)".
    - "the record's address is the list page with ?uid=".
    - "a document whose root is not the list's fails with errors".
    - "download sends the validators and answers unchanged on 304".
  - `eu.test.ts`:
    - "keeps classification code E and drops P".
    - "reads every wholeName as a name key".
    - "skips an entry with a delistingDate in the past".
    - "the record's address is the dataset page with ?logicalId=".
  - `eu.test.ts`, the feed:
    - "download reads the file's address from the feed".
    - "an address on another host is not followed": it fails as `feed_without_file`.
    - "a feed without the XML 1.1 file fails as feed_without_file".
    - "the snapshot keeps no address".
- [ ] **Step 3: Run to fail.** Run: `cd Servers && npm run test -- services/vendorResearch/vrdb/connectors`
- [ ] **Step 4: Implement.**
  - Limits:
    - UK: 64 MB, `application/xml`, `text/xml`, `application/octet-stream`, 300 s.
    - EU: the feed at 1 MB with `application/rss+xml`, `application/xml`, `text/xml`; the file as the UK, 300 s.
  - The EU file must be on `webgate.ec.europa.eu` with a path that contains `/files/xmlFullSanctionsList_1_1/`. Its address lives only in a local variable.
  - Summaries start with the record mark, then name, regime or programme, type of entity, designation date and website, joined with `records/sentence.ts`.
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Snapshot.**

### Task 8: Migrations and SQL

**Files:**
- Create: `Servers/database/migrations/<ts1>-vendor-risk-database.js`, `Servers/database/migrations/<ts2>-vendor-finding-credibility.js` (`ts1` and `ts2` from `date +%Y%m%d%H%M%S`, `ts2` later), `Servers/utils/vrdb.utils.ts`.
- Create in the workspace: `run-integration.sh`. It exports `DB_HOST=127.0.0.1 DB_PORT=55432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=verifywise_integration_test NODE_ENV=test REDIS_URL=redis://127.0.0.1:56379/0 LC_ALL=en_US.UTF-8`, then runs `node --max-old-space-size=4096 node_modules/jest/bin/jest.js --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --testMatch="**/tests/integration/$1" --runInBand "${@:2}"` from `Servers`.

**Interfaces:**
- Produces the tables of D4.4–D4.6:
  - `vrdb_sources`: `last_outcome` defaults to `never` and is checked against `ok`, `unchanged`, `failed` and `never`; `active_records INTEGER NOT NULL DEFAULT 0`.
  - `vrdb_records`.
  - `vrdb_sync_runs`: `outcome` is NULL while a sync runs; index on `(source_id, started_at DESC)`.
  - `vrdb_lookups`.
  - `vendor_vrdb_matches`: indexes on `(organization_id, vendor_id)`, on `vendor_id` and on `record_id`.
  - `vendor_risk_findings`: `credibility` and `credibility_basis` are added, and `confidence` drops `NOT NULL`.
  - `vendor_research_runs`: `coverage JSONB` and `registry_version VARCHAR(10)`.
  - The second migration's down follows D4.6.
- Produces, in `vrdb.utils.ts` (each with an optional `transaction`):
  - `upsertVrdbSourceQuery(definition, now)`, `getVrdbSourceStatesQuery(ids)`, `lastSuccessfulHashQuery(id)`.
  - `startVrdbSyncRunQuery(id, at): Promise<number>`, `finishVrdbSyncRunQuery(runId, result, at)`.
  - `applyVrdbSnapshotQuery(input): Promise<ApplyCounts>`, which opens its own transaction.
  - `markVrdbSourceQuery(id, update)`, `pruneVrdbSyncRunsQuery(before)`.
  - `findVrdbRecordsByKeysQuery(keys, sources): Promise<VrdbRow[]>`, with `match_keys && :keys AND source_id = ANY(:sources) AND status = 'active'`.
  - `recordVendorVrdbMatchesQuery(organizationId, vendorId, matches, at)`, an upsert on `(organization_id, vendor_id, record_id)` that keeps `first_matched_at`.

- [ ] **Step 1: Start the throwaway services.**
  - Postgres 16: run `initdb` in the scratchpad, start it on port 55432 with `-o "-k /tmp/vwpg"`, and create the database `verifywise_integration_test`.
  - Redis: `redis-server --port 56379`.
  - Write `run-integration.sh` in the workspace.
- [ ] **Step 2: Write the migrations and run them up, down and up** against that database:

  Run: `cd Servers && npm run build && DB_HOST=127.0.0.1 DB_PORT=55432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=verifywise_integration_test NODE_ENV=test npx sequelize db:migrate && … db:migrate:undo && … db:migrate:undo && … db:migrate`

  Expected: every step exits 0. `\d verifywise.vrdb_records` shows the GIN index, and `vendor_risk_findings.confidence` is nullable after the last up.
- [ ] **Step 3: Write `vrdb.utils.ts`.** Its tests are the integration tests of Task 11.
- [ ] **Step 4: Run** `cd Servers && npm run build`. Expected: exit 0.
- [ ] **Step 5: Snapshot.**

### Task 9: The sync

**Files:**
- Create: `vrdb/sync.ts`
- Test: `vrdb/__tests__/sync.test.ts`, with a store in memory and a fake connector.

**Interfaces:**
- Consumes: `Connector` (Tasks 6, 7), `VRDB_SOURCES`, `isStale` (Task 2).
- Produces:
  - `SyncStore`: the functions of `vrdb.utils.ts` that a sync uses, as an interface.
  - `SyncErrorCode = "fetch_failed" | "too_large" | "parse_errors" | "wrong_root" | "empty" | "shrank" | "feed_without_file" | "unexpected"`.
  - `SyncResult { outcome: "ok" | "unchanged" | "failed"; errorCode?: SyncErrorCode; counts?: { seen: number; inserted: number; updated: number; statusChanged: number } }`.
  - `syncSource(id: VrdbSourceId, deps: { store: SyncStore; connector: Connector; fetch: ConnectorFetch; now: () => Date }): Promise<SyncResult>`.
  - `SHRINK_LIMIT = 0.2`, `SYNC_RUNS_KEPT_DAYS = 90`.

- [ ] **Step 1: Write the failing tests:**
  - "inserts the records of a first sync".
  - "updates a record whose content changed".
  - "answers unchanged on 304, and on the hash of the last success".
  - "marks records missing from a sanctions list delisted, and from KEV withdrawn".
  - "makes a delisted record that returns active again".
  - "the shrink guard: 100 to 79 fails as shrank, 100 to 80 passes".
  - "a body cut at the size limit fails as too_large and keeps the mirror".
  - "an HTML page where the XML should be fails as parse_errors" (UK connector).
  - "a list that parsed with errors fails and keeps the mirror".
  - "writes a sync run row for every attempt".
  - "a failure stores a code, not a message".
  - "an unchanged sync counts as a success".
  - "prunes runs older than 90 days".
- [ ] **Step 2: Run to fail.** Run: `cd Servers && npm run test -- services/vendorResearch/vrdb/__tests__/sync.test.ts`
- [ ] **Step 3: Implement the flow:**
  1. Upsert the source, then start a run.
  2. Download with the state's validators. A 304 is `unchanged`.
  3. Take the SHA-256 of the joined bodies. The hash of the last success is `unchanged`.
  4. Parse. A wrong root is `wrong_root`, errors are `parse_errors`, and none is `empty`. Fewer than 80 % of the active records is `shrank`.
  5. Apply in one transaction, then finish the run and prune.
  6. Turn a `FetchError` into `fetch_failed` (`too_large` when the body was cut). Turn anything else into `unexpected`. Log only the source id and the code.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Snapshot.**

### Task 10: The queue, the worker, the schedulers and the flag

**Files:**
- Modify: `config.ts`, `__tests__/config.test.ts`, `Servers/jobs/producer.ts`, `Servers/jobs/worker.ts`, `Servers/jobs/__tests__/worker.test.ts`, `Servers/.env.example`
- Create: `vrdb/queue.ts`, `vrdb/worker.ts`
- Test: `vrdb/__tests__/queue.test.ts`, `vrdb/__tests__/worker.test.ts`

**Interfaces:**
- Produces:
  - `VendorResearchConfig.vrdb: boolean`: true only for `VENDOR_RESEARCH_VRDB` trimmed and lower-cased equal to `true`.
  - `VRDB_QUEUE = "vendor-risk-database"`, `VRDB_SYNC_JOB = "vrdb_sync"`.
  - `VRDB_SYNC_JOB_OPTIONS = { attempts: 3, backoff: { type: "exponential", delay: 60_000 }, removeOnComplete: true, removeOnFail: true }`.
  - `vrdbSchedulerId(id) = "vrdb_sync_" + id`.
  - `scheduleVendorRiskDatabaseSync(config?, queue?)`: it upserts with `{ pattern: definition.schedule, tz: "UTC" }`, or removes.
  - `processVrdbJob(job, deps)`, `createVrdbWorker(concurrency = 1)`.

- [ ] **Step 1: Write the failing tests:**
  - "only true turns the VRDB on" (config). Update `DEFAULTS` with `vrdb: false`.
  - "upserts one scheduler per mirrored source when both flags are on".
  - "removes the schedulers when the VRDB flag is off".
  - "removes the schedulers when the records are off".
  - "the job does nothing while a flag is off".
  - "the job syncs its source".
  - "a failed sync throws, so that BullMQ retries".
  - "an unknown job name throws".
  - "a source id that is not a VRDB id throws".
  - In `jobs/__tests__/worker.test.ts`, add the new worker to the `it.each` lists.
- [ ] **Step 2: Run to fail.** Run: `cd Servers && npm run test -- services/vendorResearch/__tests__/config.test.ts services/vendorResearch/vrdb jobs`
- [ ] **Step 3: Implement.**
  - `jobs/producer.ts` adds `safeSchedule("vendor-risk-database-sync", scheduleVendorRiskDatabaseSync)`.
  - `jobs/worker.ts` starts `createVrdbWorker(1)` with an `error` handler and closes it on SIGINT.
  - `.env.example` gets a block for `VENDOR_RESEARCH_VRDB`. It says that only `true` turns it on, that both the backend and the worker read it, that it stays off until the golden set passes, and that `VENDOR_RESEARCH_RECORDS=false` stops the downloads.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Snapshot.**

### Task 11: The lookup, its integration tests and tenant isolation

**Files:**
- Create: `vrdb/lookup.ts`, `vrdb/__tests__/lookup.test.ts`, `Servers/tests/integration/vrdb.sync.test.ts`, `Servers/tests/integration/vrdb.lookup.test.ts`, `Servers/tests/integration/tenant-isolation/vendor-vrdb-matches.isolation.test.ts`
- Modify:
  - `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts`: the entry `vendor_vrdb_matches`, `baseRoute: "/api/vendors/:id/research"`, comment "No route of its own: the research pipeline writes it".
  - `Servers/scripts/auditTenantIsolationCoverage.ts`: `sharedTables` gains `vrdb_*` with D4.4's justification.
  - `Servers/tests/integration/helpers.ts`: `cleanupDatabase` truncates the `vrdb_*` tables and `vendor_vrdb_matches`.
  - `Servers/tests/integration/vendorResearch.indexes.test.ts`: the indexes of the new foreign keys.

**Interfaces:**
- Consumes: Tasks 2, 8 and 9.
- Produces:
  - `LookupStore { sourceStates(ids); findRecords(keys, sources); recordMatches(organizationId, vendorId, matches, at) }`.
  - `offerRecords(input: { rows: VrdbRow[]; states: VrdbSourceState[]; target: ResearchTarget; researchable: readonly ResearchCategory[]; cutoffs?: Partial<Record<ResearchCategory, string>>; now: Date; enabled: boolean }): { outcome: VrdbOutcome; matches: MatchWrite[] }`. It is pure.
  - `createVrdbLookup(deps: { store: LookupStore; organizationId: number; vendorId: number; enabled: boolean }): VrdbLookup`.
  - `sharedVrdbLookup(ids: { organizationId: number; vendorId: number }, config?): VrdbLookup | undefined`. It returns `undefined` unless `vrdb` is on.

- [ ] **Step 1: Write the failing unit tests** in `lookup.test.ts`:
  - "offers active records that match, strong before weak, newest first".
  - "a sanctions name match carries the lookup note, a KEV match does not".
  - "every record's text ends with 'As of <date>.'", where the date is the source's last success.
  - "caps each source at MAX_RECORDS and counts the rest as more".
  - "leaves out KEV records before the category's cutoff and counts them as old".
  - "coverage: found, none, not_researched, and failed for a source that never synced".
  - "coverage marks a source stale after 48 hours".
  - "the off switch gives off for every source and no records".
  - "a vendor without a domain is looked up by its names".
  - "writes one match row per offered record, with its method, strength and key".
  - "a store that throws gives failed coverage and no records".
- [ ] **Step 2: Run to fail**, then implement `lookup.ts`. The lookup:
  1. builds `vendorKeys`;
  2. reads the states and rows of the researchable sources in two queries;
  3. calls `offerRecords`;
  4. writes the matches.

  It never throws.
- [ ] **Step 3: Write the integration tests:**
  - `vrdb.sync.test.ts`:
    - A real store and a fake connector: insert, update, delist, the sync run rows and `unchanged`.
    - "a failed apply leaves the old records": throw inside the transaction.
  - `vrdb.lookup.test.ts`:
    - Records seeded through `applyVrdbSnapshotQuery`. Organisation A's vendor gets its offers and its match rows with its `organization_id`.
    - A second lookup moves `last_matched_at` only.
  - `vendor-vrdb-matches.isolation.test.ts` (with `seedTwoTenantContexts`):
    - "organisation B's vendor never gets a row of organisation A".
    - "deleting a vendor removes its rows".
    - "every query of the table filters on organization_id": read `vrdb.utils.ts` and assert the predicate.
- [ ] **Step 4: Run them** on the throwaway services:

  Run: `<workspace>/run-integration.sh '{vrdb.*,tenant-isolation/vendor-vrdb-matches.isolation,vendorResearch.indexes,tenant-isolation/tenantIsolation.coverage}.test.ts'`, then `cd Servers && DB_HOST=127.0.0.1 DB_PORT=55432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=verifywise_integration_test NODE_ENV=test npx ts-node scripts/auditTenantIsolationCoverage.ts`.

  Expected: PASS, and the audit reports `status: ok`.
- [ ] **Step 5: Run the unit suite.** Run: `cd Servers && npm run test`. Expected: PASS.
- [ ] **Step 6: Snapshot.**

### Task 12: Storage and the API

**Files:**
- Create: `credibilityText.ts`, `__tests__/credibilityText.test.ts`, `Servers/tests/integration/vendorResearch.credibility.test.ts`
- Modify:
  - `Servers/domain.layer/interfaces/i.vendorResearch.ts`.
  - `Servers/utils/vendorResearch.utils.ts`: `FINDING_COLUMN_NAMES`, `RUN_COLUMNS`, `insertFindingsQuery`, `FinishRunInput`, `finishRunQuery`.
  - `Servers/controllers/vendorResearch.ctrl.ts`: `toRunResponse`, plus every handler that returns findings.
  - `Servers/tests/integration/vendor-research.routes.test.ts`: `RUN_RESPONSE_FIELDS` gains `coverage`.

**Interfaces:**
- Produces:
  - `IVendorRiskFinding.credibility: CredibilityLabel | null` and `credibility_basis: CredibilityBasis | null`.
  - `NewFinding` gains `Partial<Pick<IVendorRiskFinding, "credibility" | "credibility_basis">>`.
  - `IVendorResearchRun.coverage: RunCoverage | null` and `registry_version: string | null`.
  - `FindingSource` gains `category?: SourceCategory`, `publisher?: string` and `flags?: Array<"downgraded" | "syndicated" | "user_content">`. It also gains `record?: { source_id: RecordSourceId; record_id: number | null; status: RecordStatus; match_strength: "strong" | "weak" | null }`, with `record_id` null for a record that is not from the VRDB.
  - `FinishRunInput` gains `coverage: RunCoverage | null` and `registryVersion: string | null`.
  - `credibilityRationale(basis: CredibilityBasis): string` renders D5.5 in English, plus the stale sentence. `NAME_ONLY_NOTE = "Matched by name only: this may be another company."`.
  - Each finding response gains `credibility_rationale: string | null`.

- [ ] **Step 1: Write the failing tests.**

  `credibilityText.test.ts` checks one sentence per rule, with the spec's English. Names come from `VRDB_SOURCES`, and from a table of the other record sources: `nvd` "the National Vulnerability Database", `sec` "SEC EDGAR", `hibp` "Have I Been Pwned", `statuspage` "the vendor's status page". Dates are written as `28 Oct 2026`, UTC. The publishers are `publisher_name` or the host. Cases:
  - "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-31337), as of 28 Oct 2026."
  - "High: 2 independent trusted publishers report it (Reuters, BBC)."
  - "Low: the OFAC SDN list entry matches the vendor by name only."
  - The stale sentence is appended.
  - An unknown rule gives "".

  The integration test checks:
  - "stores the label, its basis and the sources' fields, and lists them with the English line".
  - "finishes a run with its coverage and registry version, and serves the coverage".
  - "a finding without a label lists null".
- [ ] **Step 2: Run to fail.** Unit: `cd Servers && npm run test -- services/vendorResearch/__tests__/credibilityText.test.ts`. Integration: `<workspace>/run-integration.sh '{vendorResearch.credibility,vendor-research.routes}.test.ts'`.
- [ ] **Step 3: Implement.** `insertFindingsQuery` writes `credibility` and `credibility_basis` (NULL when absent) and the sources as given; `finishRunQuery` writes `coverage` and `registry_version`.
- [ ] **Step 4: Run** both commands, plus `npm run test` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Snapshot.**

### Task 13: The run under the flag

**Files:**
- Modify: `job.ts`, `pipeline.ts`, `researchAgent.ts`, `gather.ts`, `records/index.ts`, `evidence.ts`, `verifySnippets.ts`, `prompts.ts`, `Servers/services/webResearch/webSession.ts`.
- Test:
  - `__tests__/pipeline.test.ts`; also move the displaced "// Review Focus 1." comment at about line 820 to its block (minor 5).
  - `__tests__/job.test.ts`, `__tests__/gather.test.ts`, `__tests__/verifySnippets.test.ts`, `__tests__/prompts.test.ts`, `records/__tests__/index.test.ts`, `Servers/services/webResearch/__tests__/webSession.test.ts`.

**Interfaces:**
- Consumes: `VrdbLookup` and `sharedVrdbLookup` (Task 11), `NewFinding` credibility fields and `FinishRunInput` coverage (Task 12), `credibilityOf` (Task 3).
- Produces:
  - `webSession.addRecords(records: Array<SourceRecord & { vrdb?: VrdbRecordMeta }>, category, record?)`.
  - `LedgerEntry.vrdb?: VrdbRecordMeta` and `LedgerEntry.answeredUrl?: string`. The latter is set when a page answered from another address.
  - `createRecordsLookup(deps)` gains `sources?: readonly RecordSourceId[]`.
  - `sharedRecordsLookup(config)` asks `nvd`, `hibp`, `sec` and `statuspage` when `vrdb` is on.
  - `GatherDeps.vrdb?: VrdbLookup`, `GatherResult.vrdb: VrdbOutcome | null`.
  - `createVendorResearcher` deps gain `vrdb?: VrdbLookup` and `rules?: ResearchRules`.
  - `ResearchResult.coverage?: Omit<RunCoverage, "cited" | "registry_version">`.
  - `PipelineDeps.rules?: ResearchRules`: `job.ts` sets `"credibility"` when `vrdb` is on.
  - `buildEvidencePack(entries, options?: { dropBlocked?: boolean })`.
  - `CREDIBILITY_PROMPT_VERSION = "vr-8"`.

- [ ] **Step 1: Write the failing tests.**

  Pipeline tests:
  - "with the flag off a run stores confidence and no label, asks KEV and OFAC itself, writes no coverage and keeps vr-6". This pins today's behaviour.
  - "with the flag on each finding is stored with its label and basis, in order".
  - "with the flag on the stored sources carry their category, publisher, flags and record".
  - "with the flag on a run records its coverage, with the cited counts and the registry version, also when it fails".
  - "with the flag on the prompt version is vr-8".
  - "with the flag on a blocked source never reaches the pack".

  Other tests:
  - Records lookup: "with the VRDB on the records lookup leaves KEV and OFAC to it".
  - Gather: "a VRDB record enters the ledger with its meta". Gather: "news reads are ordered by registry category under the credibility rules".
  - Snippet check: "under the credibility rules the best source is the highest registry category".
  - Web session: "a page that answered from another address keeps it".
  - Prompts: "the credibility prompt names the UK and EU marks and the lookup note, and the confidence prompt is unchanged". The vr-6 text is compared with a copy taken before the change.
  - Trace: "the trace counts the cited sources per category and lists the unreviewed hosts".
- [ ] **Step 2: Run to fail.** Run: `cd Servers && npm run test -- services/vendorResearch services/webResearch`
- [ ] **Step 3: Implement.**
  - The pipeline passes `rules` to `analyse` and computes the prompt version with `promptVersionOf(rules)`.
  - It zips `analysed.credibility[i]` onto `analysed.kept[i]` at once (`credibility`, `credibility_basis`), so a later filter keeps them together.
  - It copies each `basis.sources[j]` onto `finding.sources[j]` (`category`, `publisher`, `flags`, `record`).
  - It sums `cited` over the stored findings' distinct source addresses.
  - It writes `coverage` and `registryVersion` in `finishInput` on every path. They stay null when the rules are `"confidence"`.
  - `gather.ts` starts the VRDB lookup beside the records lookup. Its records enter the ledger before the others, with their meta.
- [ ] **Step 4: Run** `cd Servers && npm run test && npm run eval:vendor-research && ./node_modules/.bin/tsc -p <scratchpad>/tsconfig.vrdb.json && npm run build`. Expected: PASS; the eval prints "29 cases, 0 regressions, 0 fixed gaps"; tsc prints nothing.
- [ ] **Step 5: Snapshot.**

### Task 14: Replay cases 28–31

**Files:**
- Modify: `eval/types.ts` (`Recording.vrdb?: { rows: VrdbRow[]; states: VrdbSourceState[] }`, `Expected.coverage?: { stale?: VrdbSourceId[] }`), `eval/runCase.ts` (a lookup over the recording through `offerRecords`, whatever the rules), `eval/cases/index.ts`, `eval/__tests__/cases.test.ts`, `eval/__tests__/cli.test.ts`
- Create: `eval/cases/28-rejected-cve.ts`, `29-delisted-sanctions-entry.ts`, `30-stale-source.ts`, `31-same-name-on-two-lists.ts`. Their vendors are fictional `.example` companies, and each file's header says which worked case it is.

**Interfaces:**
- Consumes: `offerRecords` (Task 11), and `CREDIBILITY_PROMPT_VERSION` through the runner.

- [ ] **Step 1: Write the failing tests** in `cases.test.ts`:
  - "are thirty-three".
  - Case 28, "a withdrawn KEV entry is not offered": nothing in the pack cites its address, and nothing is kept.
  - Case 29, "a delisted sanctions entry is not offered".
  - Case 30, "a stale source keeps the label and says so": the finding is High by `official_record` with `as_of` and `stale: true`, and the coverage lists `kev` and `ofac` as stale.
  - Case 31, "the same name on two lists gives one finding, Low, with the note".

  In `cli.test.ts`, the summary reads "33 cases, 0 regressions, 0 fixed gaps".
- [ ] **Step 2: Run to fail.** Run: `cd Servers && npm run test -- services/vendorResearch/eval`
- [ ] **Step 3: Write the four cases.** Each case sets `maxMislabelled: 0` and states the targets the others use.
- [ ] **Step 4: Run** the eval tests and `npm run eval:vendor-research`. Expected: PASS and "33 cases, 0 regressions, 0 fixed gaps".
- [ ] **Step 5: Snapshot.**

### Task 15: The client

**Files:**
- Modify:
  - `Clients/src/domain/interfaces/i.vendorResearch.ts`: types mirroring Task 12, every new field optional.
  - `Clients/src/application/utils/vendorResearchText.ts`.
  - `Clients/src/presentation/types/interfaces/i.chip.ts` and `Clients/src/presentation/components/StatusBadge/index.tsx`: `borderColor?: string`, which overrides the computed border.
  - `FindingRow.tsx`, `RunSummary.tsx`.
  - `Clients/src/i18n/translations.ts`: de, fr and es for every new key.
  - `__tests__/fixtures.ts` and the tests that pin "Confidence".
- Test: `Clients/src/application/utils/__tests__/vendorResearchText.test.ts`, `VendorResearchFindings/__tests__/VendorResearchFindings.test.tsx`, `VendorResearchFindings/__tests__/i18n.test.tsx`, the StatusBadge test (or a new one next to it).

**Interfaces:**
- Produces, in `vendorResearchText.ts`:
  - `credibilityLabel(label, t)`, `sourceCategoryLabel(category, t)`, `recordStatusLabel(status, t)`.
  - `credibilityRationale(basis, t, lang): { sentence: string; stale: string | null }`.
  - `coverageLines(coverage, t, lang): { checked: string | null; none: string | null; stale: string[]; cited: string; off: boolean; attributions: string[] }`.
  - The names and dates match Task 12, through `formatResearchDate`. An unknown rule, category or status shows nothing, as the file's rule says.
- The new English keys:
  - Labels and badges: "Credibility", "Official", "Trusted press", "Unverified", "Withdrawn", "Rejected", "Delisted".
  - "Matched by name only: this may be another company."
  - The eleven D5.5 sentences, with "{operator} rejected / withdrew / removed the record on {date}." as three keys.
  - "The source has not been updated since {date}."
  - Coverage: "Checked: {sources}", "No records in {sources} as of {dates}", "{source}: last updated {date}, not up to date", "Sources cited: {official} official, {press} trusted press, {vendor} vendor, {unverified} unverified", "Public databases turned off", "Data sources: {attributions}".
  - Already in the dictionary: "High", "Medium", "Low", "Vendor".

- [ ] **Step 1: Write the failing tests.**
  - Text helpers: every rule's sentence, the stale sentence, the note, and the coverage lines for found, none, stale and off. "Every key a helper asks for exists in de, fr and es."
  - FindingRow:
    - "shows the credibility chip, its rationale and no confidence chip".
    - "shows the name-only note when the basis says so".
    - "puts a badge before each source's host".
    - "shows an inactive record's status".
    - "a finding without credibility keeps the confidence chip".
  - RunSummary:
    - "lists the checked sources and their counts".
    - "says No records in … as of …".
    - "names a stale source".
    - "says Public databases turned off".
    - "shows the data sources line".
    - "a run without coverage shows no coverage block".
  - i18n test: each new string is rendered in de, fr and es, with `tr` registrations, and the audit stays clean.
  - StatusBadge: "a border colour overrides the computed border".
- [ ] **Step 2: Run to fail.** Run: `cd Clients && npx vitest run src/application/utils/__tests__/vendorResearchText.test.ts src/presentation/pages/Vendors/VendorResearchFindings`
- [ ] **Step 3: Implement.**
  - The credibility chip takes the place of the confidence chip under the caption "Credibility", and stays neutral (`variant="default"`).
  - The rationale is a `bodySmall` line under it. The note is an info line.
  - Badges are `Chip`s: `size="small"`, `uppercase={false}`, `backgroundColor="#FFFFFF"`, `borderColor="#d0d5dd"`.
  - The coverage block sits after the category list of `RunSummary`. The attribution line is inside `data-vw-no-translate`.
  - Update the old assertions on "Medium" and "Confidence" where a fixture now has a label.
- [ ] **Step 4: Run** `cd Clients && npx vitest run && npm run typecheck && npm run build`. Expected: PASS.
- [ ] **Step 5: Snapshot.**

### Task 16: Docs and the user guide

**Files:**
- Modify:
  - `docs/technical/domains/vendors.md`: credibility is now stored and shown; the flag; coverage; the VRDB tables and jobs; Key Files.
  - `docs/technical/infrastructure/web-research.md`: conditional GET, the XML scanner, the records path under the flag. Also fix the broken sentence near line 378, "…the feed names. and, for the sanctions list…" (minor 6), and update Last Updated.
  - `docs/technical/infrastructure/automations.md`: the queue `vendor-risk-database`.
  - `docs/deployment/CONFIGURATION_REFERENCE.md`: `VENDOR_RESEARCH_VRDB`, read by both processes.
  - `docs/technical/security/tenant-isolation.md`: `vrdb_*` in `sharedTables`, `vendor_vrdb_matches` in the registry.
  - `docs/superpowers/specs/2026-10-11-vendor-research-web-agent-design.md`: a pointer to the VRDB spec.
  - `shared/user-guide-content/content/risk-management/vendor-risks.ts`: a table of the labels and the badges, the note, the coverage block and "Data sources".
  - `CLAUDE.md`: a reference row "Vendor risk database (VRDB): mirrored official lists, credibility labels" pointing at `docs/technical/domains/vendors.md`, and "Last Updated".

- [ ] **Step 1: Write the pages.** Every claim must match the code of Tasks 1–15, by file and function name.
- [ ] **Step 2: Run** `cd Clients && npm run typecheck`, since the guide is TypeScript. Then grep the docs for "not yet stored" and "vr-7". Expected: typecheck passes, and the grep finds no stale claim (the spec itself is not changed here).
- [ ] **Step 3: Snapshot.**

### Task 17: The golden-set kit

**Files:**
- Create:
  - `golden/types.ts`, `golden/score.ts`, `golden/__tests__/score.test.ts`.
  - `Servers/scripts/vendorResearchGoldenSet.ts`: read-only SQL; reads the latest completed `vr-6` and `vr-8` run of each labelled vendor of one organisation.
  - `docs/superpowers/golden-set/2026-10-30-golden-set.md`: the profiles of D6.4, how to label, how to run, the bars, and the candidates.
  - `docs/superpowers/golden-set/labels.template.json`.

**Interfaces:**
- Produces:
  - `GoldenVendor { profile: number; vendorId: number; name: string; expected: Array<{ category: ResearchCategory; anyOf: string[]; label: CredibilityLabel }>; traps: Array<{ category?: ResearchCategory; anyOf: string[] }> }`.
  - `GoldenRun { vendorId: number; promptVersion: string; findings: Array<Pick<IVendorRiskFinding, "category" | "risk_description" | "credibility" | "confidence" | "sources">>; coverage: RunCoverage | null }`.
  - `scoreGoldenSet(labels, off: GoldenRun[], on: GoldenRun[]): GoldenReport`, which gives precision, recall, label agreement, `highRatedLow`, `sanctionsAsFact`, `coverageMissing` and per-vendor lines.
  - `meetsBars(report): { ok: boolean; reasons: string[] }`, with D6.4's bars: precision ≥ 0.9, recall not below the flag-off run, agreement ≥ 80 %, no High rated Low, no sanctions finding stated as a fact, and coverage right for every vendor.

- [ ] **Step 1: Write the failing tests:**
  - "precision and recall count matches by category and words".
  - "label agreement counts only matched findings".
  - "a High that the labeller rates Low fails the bars".
  - "a sanctions finding without 'named' wording is listed".
  - "a trap that appears counts as a false positive".
  - "a vendor without coverage under the flag fails the coverage bar".
- [ ] **Step 2: Run to fail, implement, run to pass.** Run: `cd Servers && npm run test -- services/vendorResearch/golden`
- [ ] **Step 3: Propose candidates.** Propose at most one public company per profile, with one or two public sources each. Leave a profile open when two searches do not settle it. The labeller confirms every candidate (D6.4). Never use `site:` in a query.
- [ ] **Step 4: Snapshot.**

### Task 18: The M1 gate

- [ ] **Step 1: Run the format check.** Run: `cd Servers && npm run format-check` and `cd Clients && npm run format-check`. Expected: clean. If either is not, run `npm run format` and rerun the checks.
- [ ] **Step 2: Run the Servers checks.** Run: `cd Servers && npm run build && npm run test && npm run eval:vendor-research && ./node_modules/.bin/tsc -p <scratchpad>/tsconfig.vrdb.json`. Expected: all pass; "33 cases, 0 regressions, 0 fixed gaps".
- [ ] **Step 3: Run the Clients checks.** Run: `cd Clients && npm run typecheck && npm run build && npx vitest run`. Expected: all pass.
- [ ] **Step 4: Run the integration suite and the audit** on the throwaway services. Run four shards, `<workspace>/run-integration.sh '**/*.test.ts' --shard=i/4` for i = 1..4, then the audit as in Task 11. Expected: PASS, except the two known environment-only failures (`reporting-rls-policies` without `DB_APP_PASSWORD`, and the `riskLinks` pair of 2026-10-11). Each must be shown to fail on the base branch too, or it is a finding.
- [ ] **Step 5: Run a browser smoke** on throwaway services, following the UI smoke recipe of the project's memory: a launch entry with the bootstrap admin, and a SQL seed of a vendor, a completed run with `coverage`, and three findings (High with a record, Medium, and Low with the note). Check in the browser pane:
  - the chips, rationales, badges and note;
  - the coverage block, with a stale source and the data sources line;
  - a finding without a label, which shows the confidence chip.

  Then clean up: stop both servers, restore `launch.json`, drop the database and flush Redis.
- [ ] **Step 6: Write the gate's result to the ledger.** List what stays the user's:
  - the golden-set labels and the two runs per vendor;
  - Q5 (OFAC licence);
  - Q9 (48 publishers);
  - the approval to turn the flag on by default;
  - the permission to download a real list file to check a parser.

  Stop the throwaway services.
