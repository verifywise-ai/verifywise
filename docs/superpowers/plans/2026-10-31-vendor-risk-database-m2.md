# Vendor risk database M2 (expansion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the NVD as a read-through source behind a Redis spacer shared by every worker, vendor identifiers that turn name matches strong, a status job that relabels pending findings citing a record that left its list, a maintainer script for unknown hosts, and, ready behind closed gates, the SEC read-through (Q4), the CVE mirror (Q7) and the UN list (Q6), all under `VENDOR_RESEARCH_VRDB`.

**Architecture:** A read-through source stores its answers in the M1 tables: the records in `vrdb_records`, the state of each key in `vrdb_lookups`, refreshed inside the run's 8 seconds when the stored answer has expired. A gate is a constant in code; a source behind a closed gate is never scheduled, downloaded or looked up. The status job is a second job name on the `vendor-risk-database` queue that recomputes M0's label of each pending finding citing a record whose status changed, organization by organization.

**Tech Stack:** Node 22, Express 4, Sequelize 6 (raw SQL), BullMQ, Redis (ioredis), zlib, Jest; React 19, MUI 7, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-vendor-risk-database-design.md` (D2.5–D2.8, D3.3, D4.4–D4.8, D5.3, D5.7 cases 10–12, D7 Q1, Q3, Q4, Q6, Q7, Q16, Q23, Q26, Risks D and G, D8 M2). The M1 plan (`docs/superpowers/plans/2026-10-30-vendor-risk-database-m1.md`) hands M2 its Rulings 11 (the CVE variant of case 28) and 18 (`vrdb_lookups` exists, empty).

## Verified on 2026-10-31

Read on the operators' own pages (browser pane, or a header request) for this plan:

- **NVD.** The API status of a rejected CVE is `Rejected` ([vulnerability status](https://nvd.nist.gov/vuln/vulnerability-status)); "By default, the CVE API includes CVE records with the REJECT or Rejected status", and `noRejected` excludes them; `vulnStatus` is "the CVE's status in the NVD" ([CVE API](https://nvd.nist.gov/developers/vulnerabilities)).
- **cvelistV5.** The README names a daily baseline `<day>_all_CVEs_at_midnight.zip` and hourly deltas "since the baseline" ([README](https://raw.githubusercontent.com/CVEProject/cvelistV5/main/README.md)). The release `cve_2026-10-30_at_end_of_day` (not a pre-release, created 2026-10-31T00:32:39Z) has one zip, `2026-10-30_delta_CVEs_at_end_of_day.zip`, 11,131,890 bytes, `application/zip`, and `release_notes.md` ([GitHub API, release by tag](https://docs.github.com/en/rest/releases/releases), keyless). Observed: the download answers 302 to `release-assets.githubusercontent.com`, then 200 `application/octet-stream` with `ETag`; a 2 KB ranged read of the zip's end showed 5,564 entries, no Zip64, deflate, named `deltaCves/CVE-<year>-<n>.json`. A suffix range (`bytes=-2048`) answers 501.
- **CVE record format.** `cveMetadata`: `cveId`, `state` (`PUBLISHED` or `REJECTED`), `datePublished`, `dateUpdated`, and `dateRejected` for a rejected record; a rejected record has only a `cna` container, without `affected`; `affected[]` items have `vendor` and `product`; `metrics[]` items hold `cvssV4_0`, `cvssV3_1`, `cvssV3_0` or `cvssV2_0`, and the v3.1 and v4.0 objects require `baseScore` and `baseSeverity` (`NONE` to `CRITICAL`) ([schema](https://raw.githubusercontent.com/CVEProject/cve-schema/main/schema/CVE_Record_Format.json), [cvss-v3.1](https://raw.githubusercontent.com/CVEProject/cve-schema/main/schema/imports/cvss/cvss-v3.1.json), [cvss-v4.0](https://raw.githubusercontent.com/CVEProject/cve-schema/main/schema/imports/cvss/cvss-v4.0.json)).
- **GitHub REST API.** 60 unauthenticated requests per hour per IP address ([rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)); `GET /repos/{owner}/{repo}/releases/tags/{tag}`; each asset has `name`, `size`, `content_type`, `browser_download_url`.
- **UN list.** The list page links the XML at `https://scsanctions.un.org/resources/xml/en/consolidated.xml` and describes the fields of an entity (permanent reference number such as `QDe.001`, name, name in original script, a.k.a., f.k.a., address, listed on, other information). No schema or element names are published: `consolidated.xsd` answers 404. **The XML element names below are UNVERIFIED**; a person checks them against the file before Q6's gate opens.

## Rulings

1. **Gates are constants in code** (`vrdb/gates.ts`): `SEC_CONTACT: string | null = null` (Q4: a role address, "a constant in code, not a setting"), `UN_TERMS_READ = false` (Q6), `CVE_TERMS_APPROVED = false` (Q7). A source behind a closed gate is not scheduled, not downloaded, not looked up and not in the coverage. *Cost:* opening a gate is a code change and a review, which is the point.
2. **Read-through answers live in the M1 tables.** Records in `vrdb_records` (source `nvd`, later `sec`), the state of each key in `vrdb_lookups`. An answer is fresh for 6 hours (NVD, today's memo) or 1 hour (SEC, today's filings memo); a failed fetch keeps the stored records in use, says `failed` in the coverage (D4.8 step 3) and is retried after 5 minutes (today's cool-down). *Cost:* none.
3. **The NVD query is today's** (critical CVEs of the CPE vendor in the last 119 days), without the run's cutoff, so the key is the token alone (`cpe:<token>`); the lookback applies when records are offered, and records stay stored after they leave the window. A CVE the NVD marks `Rejected` is stored `rejected`. *Cost:* a vendor's list of stored CVEs grows past 119 days, inside its lookback.
4. **One spacer for every worker**, in Redis, for the NVD (4 requests in 30 s, wait at most 3 s) and the SEC (5 in 1 s, wait at most 2 s), on both paths (flag on or off). A Redis error refuses the turn: the lookup fails as `unreachable`. *Cost:* with one worker, none; Redis down already stops the queues.
5. **Identifier keys** (Q1, Q3). `lei:<LEI>` (valid ISO 17442 check digits) is strong on its own. `regno:<letters and digits>` (6 or more) is strong only when the record also shares a name key with the vendor: a company number is unique only within its registry. `cik:<10 digits>` is strong when the CIK is stored on the vendor and weak when it was found by name (Q3). A number on a list entry that passes the LEI check is a `lei:` key; any other of 6 or more letters and digits is a `regno:` key. *Cost:* an identifier-only match of a renamed entity is not offered.
6. **The stated country decides the market** (`market.ts`), before the domain and the legal form. *Cost:* none for vendors without a country.
7. **A connector has a version, and it is hashed with the download**, so a parser change re-parses a list whose file did not change. *Cost:* one re-parse per connector change.
8. **The CVE mirror is incremental** (`vrdb_sources.cursor` = the last day applied): each sync reads the end-of-day release of every day after the cursor up to yesterday (UTC), at most 7 per sync, through the GitHub API by tag, and applies the day's delta zip. A first sync starts at yesterday; the lookback is filled by `scripts/vrdbCveBaseline.ts` from a baseline file an operator downloaded. It keeps PUBLISHED records published inside 24 months whose highest base score is 9.0 or more, and every REJECTED record. *Cost:* the copy covers less than the lookback until the baseline is loaded.
9. **A CVE the CVE Program or the NVD rejected is rejected on every list**: the lookup offers no vulnerability record whose CVE id has a rejected record, and the status job treats a cited record of that CVE id as rejected. *Cost:* none.
10. **One CVE, one source**: when KEV, the NVD and the CVE mirror have the same CVE, the run is offered KEV's, else the NVD's, else the mirror's. *Cost:* the mirror's affected-product text is not offered for a CVE that KEV or the NVD has.
11. **The UN connector reads entities only** and its element names are UNVERIFIED (see above). Its records cite the HTML list with the reference number as a parameter (`https://scsanctions.un.org/consolidated?ref=<id>`), as M1 Ruling 13 did. *Cost:* the first sync after Q6 fails safely (`wrong_root` or `parse_errors`) if a name is wrong.
12. **The status job** is `vrdb_relabel` on the `vendor-risk-database` queue (job id `vrdb_relabel_<sourceId>`, so one waits per source), added after a sync or a read-through that changed a status. It recomputes only pending findings that have a label, organization by organization; the date in "removed the record on {date}" is the day the status changed (`as_of`). No notification (Q16). *Cost:* none.
13. **The unknown-host script reads the runs' traces** (D3.3: the trace lists the unreviewed hosts findings cite) across organizations and prints hostnames and counts only. *Cost:* hosts of runs before M1 are not counted.
14. **The SEC read-through** sends `User-Agent: VerifyWise <SEC_CONTACT>` (the SEC's example form). While Q4 is closed the per-run SEC lookup stays under the flag, as in M1, and uses a CIK stored on the vendor instead of its name; its records are then strong. *Cost:* none.
15. **Prompt `vr-10`, registry `sr-4`.** (M1's final fix pass took `vr-9` and `sr-3`: "An entity named … is on …", the verified website, EDGAR's viewers and the other Q26 addresses.) The credibility prompt names the UN list and the CVE Program and says an entry without a Lookup note matched the vendor's verified website or an identifier; an EDGAR filing under the vendor's stored CIK is VENDOR (Q26), in whichever of `sr-3`'s viewer addresses it is cited. *Cost:* none; no label was stored under `vr-8` or `vr-9` outside tests and the smoke.
16. **Two migrations**: the vendors' identifiers, and a partial index for rejected vulnerability ids. *Cost:* none.

## Global Constraints

- Branch `feature/vendor-agents-and-risk-page`. No commit, push or PR without the user's explicit permission (D8). Commit steps are tree snapshots in the ledger.
- With `VENDOR_RESEARCH_VRDB` off, research behaves as in M1, except the shared NVD spacer (Ruling 4), the stated country's market (Ruling 6) and a stored CIK in the SEC lookup (Ruling 14); every existing test passes unchanged except where a task names the test it updates.
- No new dependency and no new environment variable. No new route; the vendor endpoints accept four more fields, so run `npm run check:api-drift` in the gate.
- No test reaches the network: fixtures and fake fetches, written from the documented formats and holding no personal data. Hosts are `.example` except where a test is about a real host.
- No list file is downloaded, and no gated source is turned on, without the user's permission. The gates stay closed.
- Migrations: timestamps from `date +%Y%m%d%H%M%S` when written, later than `20261030223852`; `verifywise.` in the DDL; reversible.
- Application SQL uses unqualified table names; every read or write of a tenant table filters on `organization_id`, the status job included.
- A sync or a read-through stores and logs error codes, never messages or addresses. No console output in production code; log fixed phrases and `errorName(error)` through `utils/logger/fileLogger`. Scripts print to their `out`/`err` parameters.
- Third-party text (zip entries, JSON, XML) is parsed in time linear in its size, within byte limits fixed per source.
- `CREDIBILITY_PROMPT_VERSION` changes with the prompt; `REGISTRY_VERSION` changes with the registry.
- UI: sentence case; border `#d0d5dd`; radius 4px; 30px controls; strings through `t()` with de, fr and es entries.
- Integration tests, the audit and the browser smoke run on a throwaway Postgres 16 and Redis, never on the `.env` database.
- The type check of `services/` is the scratch tsconfig (`<scratchpad>/tsconfig.vrdb.json`); new scripts are added to a scratch tsconfig the same way.

## Review Focus

1. **A finding decided while the status job runs.** The job reads pending findings, then writes; a person who accepts or dismisses one in between must keep their decision and the label they saw. Test: Task 10, "a finding decided after the read is not relabeled".
2. **Two workers asking the NVD in one window.** The shared spacer must give 4 turns in 30 s across processes, not 4 each. Test: Task 4, "two spacers on one key share the window" (integration).
3. **A registration number two companies share.** A `regno:` key alone must offer nothing; with the name it is strong. Test: Task 3, "a registration number without the name matches nothing".
4. **A broken or hostile zip.** A cut file, an entry that inflates past its limit, a name with `..`, a zip inside a zip inside a zip: the sync fails and the copy stays as it was. Tests: Task 7, "a cut zip is corrupt", "an entry past its limit is too_large", "a second level of nesting is refused"; Task 8, "a delta that does not parse keeps the cursor".
5. **A closed gate.** No scheduler, download, lookup or coverage line for a gated source, and the SEC stays a per-run lookup. Tests: Task 1, "a source behind a closed gate is neither scheduled nor covered"; Task 6, "the SEC stays a per-run lookup while Q4 is closed".

## File map

Servers (`Servers/services/vendorResearch/` unless stated):

| File | Task | Responsibility |
|---|---|---|
| `vrdb/gates.ts`, `vrdb/sources.ts`, `domain.layer/interfaces/i.vendorResearch.ts`, `records/types.ts`, `sourceRegistry/classify.ts` | 1 | Ids, gates, definitions |
| `Servers/database/migrations/<ts>-vendor-identifiers.js`, vendor model, validation, utils, controller, `config/changeHistory.config.ts` | 2 | Identifiers on vendors |
| `target.ts`, `vrdb/keys.ts`, `vrdb/connectors/{types,uk,eu}.ts`, `vrdb/sync.ts`, `market.ts`, `sourceRegistry/{classify,entries}.ts` | 3 | Identifier keys, versions, market, `sr-4` |
| `records/sharedSpacer.ts`, `records/index.ts` | 4 | Spacer in Redis |
| `vrdb/readThrough.ts`, `vrdb/connectors/nvd.ts`, `vrdb/lookup.ts`, `gather.ts`, `Servers/utils/vrdb.utils.ts`, `<ts>-vrdb-rejected-index.js` | 5 | Read-through, NVD |
| `vrdb/connectors/sec.ts`, `../webResearch/guardedFetch.ts`, `records/index.ts`, `credibility.ts` | 6 | SEC behind Q4 |
| `vrdb/zip.ts` | 7 | Zip reader |
| `vrdb/connectors/cve.ts`, `vrdb/sync.ts`, `Servers/scripts/vrdbCveBaseline.ts` | 8 | CVE mirror behind Q7 |
| `vrdb/connectors/un.ts` | 9 | UN list behind Q6 |
| `vrdb/relabel.ts`, `vrdb/queue.ts`, `vrdb/worker.ts`, `credibility.ts` | 10 | Status job |
| `Servers/scripts/vendorResearchUnknownHosts.ts` | 11 | Unknown hosts |
| `prompts.ts`, `eval/*` | 12 | `vr-10`, cases 35–37 |

Clients: vendor domain, DTO, mapper, model, `NewVendor` modal, validation, field map, translations (Task 13); research types, `vendorResearchText.ts`, `RunSummary.tsx`, `FindingRow.tsx` tests, translations (Task 14). Docs and the user guide: Task 15. Gate: Task 16.

---

### Task 1: Ids, gates and source definitions

**Files:**
- Create: `vrdb/gates.ts`
- Modify: `Servers/domain.layer/interfaces/i.vendorResearch.ts`, `records/types.ts`, `sourceRegistry/classify.ts`, `vrdb/sources.ts`, `vrdb/queue.ts`, `vrdb/lookup.ts`
- Test: `vrdb/__tests__/sources.test.ts`, `vrdb/__tests__/queue.test.ts`, `vrdb/__tests__/lookup.test.ts`

**Interfaces:**
- Produces:
  - `RECORD_SOURCE_IDS` adds `"cve"`, `"un_sanctions"`; `VRDB_SOURCE_IDS` adds `"cve"`, `"un_sanctions"` (Task 5 adds `"nvd"`, Task 6 `"sec"`).
  - `RECORD_CATEGORY`: `cve` → `security_incidents`, `un_sanctions` → `legal_regulatory`. `MAX_RECORDS`: `cve: 3`, `un_sanctions: 2`. `RECORD_CLASSES`: `cve` official strong, `un_sanctions` official weak.
  - `vrdb/gates.ts`: `type VrdbGate = "Q4" | "Q6" | "Q7"`; `SEC_CONTACT: string | null = null`; `UN_TERMS_READ = false`; `CVE_TERMS_APPROVED = false`; `VRDB_GATES: Readonly<Record<VrdbGate, boolean>> = { Q4: SEC_CONTACT !== null, Q6: UN_TERMS_READ, Q7: CVE_TERMS_APPROVED }`.
  - `vrdb/sources.ts`: `VrdbSourceDefinition = MirrorSource | ReadThroughSource`, both with M1's fields minus `mode`/`schedule`/`missingStatus`, plus `gate?: VrdbGate`. `MirrorSource { mode: "mirror"; schedule: string; missingStatus: "withdrawn" | "delisted" | null }` (null: an incremental list, Task 8). `ReadThroughSource { mode: "read_through"; ttlHours: number }`.
  - `activeVrdbSources(gates = VRDB_GATES): VrdbSourceDefinition[]`, `activeMirrors(gates?)`, `activeReadThroughs(gates?)`.
  - New definitions: `cve` (operator "the CVE Program", `listName` "CVE List", schedule `29 2 * * *`, `missingStatus: null`, gate `Q7`, licence "CVE Terms of Use", attribution "CVE® records © The MITRE Corporation, under the CVE Terms of Use (https://www.cve.org/Legal/TermsOfUse)", documentation `https://github.com/CVEProject/cvelistV5`); `un_sanctions` (name "UN Security Council Consolidated List", operator "the UN Security Council", schedule `59 */6 * * *`, `missingStatus: "delisted"`, gate `Q6`, licence "UNVERIFIED (Q6)", attribution "United Nations Security Council Consolidated List", documentation the list page).

- [ ] **Step 1: Write the failing tests:**
  - "a source behind a closed gate is not active" and "opening a gate makes it active" (pass `gates`).
  - "every active mirror has a schedule on a minute of its own" (KEV 23, OFAC 41, UK 47, EU 53; CVE 29 and UN 59 when open).
  - "a source behind a closed gate is neither scheduled nor covered": `scheduleVendorRiskDatabaseSync` upserts four schedulers, removes `vrdb_sync_cve` and `vrdb_sync_un_sanctions`, and queues no first sync (`vrdb_sync_first_<id>`, M1's fix pass) of a gated source, even with no copy; `offerRecords` lists four coverage sources.
- [ ] **Step 2: Run to fail.** `cd Servers && npm run test -- services/vendorResearch/vrdb`
- [ ] **Step 3: Implement.** The scheduler, `offerRecords` and `researchedSources` iterate `activeMirrors()` / `activeVrdbSources()`; a removed scheduler id is `vrdbSchedulerId(id)` for every definition that is not active. The client's ids follow in Task 14.
- [ ] **Step 4: Run.** Expected: PASS, and the scratch tsc is clean.
- [ ] **Step 5: Snapshot.**

### Task 2: Identifiers on vendors (server)

**Files:**
- Create: `Servers/database/migrations/<ts>-vendor-identifiers.js`
- Modify: `Servers/domain.layer/interfaces/i.vendor.ts`, `Servers/domain.layer/models/vendor/vendor.model.ts`, `Servers/utils/validations/vendorValidation.utils.ts`, `Servers/utils/vendor.utils.ts`, `Servers/controllers/vendor.ctrl.ts`, `Servers/config/changeHistory.config.ts`
- Test: `Servers/utils/__tests__/vendorValidation.identifiers.test.ts`, `Servers/tests/integration/vendors.test.ts`

**Interfaces:**
- Produces: `IVendor.country?: string | null` (ISO 3166-1 alpha-2, upper case), `registration_number?: string | null` (at most 64 characters, trimmed, inner whitespace collapsed), `lei?: string | null` (20 characters, upper case), `sec_cik?: string | null` (10 digits, zero-padded). Validators `validateCountry`, `validateRegistrationNumber`, `validateLei`, `validateSecCik`, and normalisers of the same names with `normalize`.
- Migration: `ADD COLUMN IF NOT EXISTS` the four columns (`CHAR(2)`, `VARCHAR(64)`, `CHAR(20)`, `CHAR(10)`) with named checks `vendors_country_check` (`^[A-Z]{2}$`), `vendors_lei_check` (`^[A-Z0-9]{18}[0-9]{2}$`), `vendors_sec_cik_check` (`^[0-9]{10}$`); down drops them.

- [ ] **Step 1: Write the failing tests:**
  - "a country is two letters that name a region" (`de` → `DE`; `XX` and `DEU` refused; check with `Intl.DisplayNames(["en"], { type: "region" }).of(code) !== code`).
  - "an LEI passes its check digits" (ISO 17442: letters A=10 … Z=35, the whole number mod 97 is 1; one changed character is refused; spaces are removed, letters upper-cased). Build the valid example in the test from 18 characters and computed check digits.
  - "a CIK is one to ten digits, stored as ten" (`320193` → `0000320193`; `12a` and eleven digits refused).
  - "a registration number is trimmed and at most 64 characters"; an empty value is null for each field.
  - Integration (`vendors.test.ts`): create a vendor with the four fields and read them back normalised; update one; an invalid LEI answers 400 and stores nothing; the change history labels them "Country", "Registration number", "LEI" and "SEC CIK".
- [ ] **Step 2: Run to fail.** `cd Servers && npm run test -- utils/__tests__/vendorValidation.identifiers.test.ts`
- [ ] **Step 3: Implement**, following `other_names` through the model, the validation map, the insert and update SQL, the selects and the controller.
- [ ] **Step 4: Run.** Unit: PASS. Integration: `bash $W/run-integration.sh 'vendors.test.ts'` → PASS. `npm run build` succeeds and `npx sequelize db:migrate` then `db:migrate:undo` and `db:migrate` run on the throwaway database.
- [ ] **Step 5: Snapshot.**

### Task 3: Identifier keys, connector versions, market and `sr-4`

**Files:**
- Modify: `target.ts`, `vrdb/keys.ts`, `vrdb/types.ts`, `vrdb/connectors/{types,kev,ofac,uk,eu}.ts`, `vrdb/sync.ts`, `vrdb/lookup.ts`, `market.ts`, `sourceRegistry/classify.ts`, `sourceRegistry/entries.ts`, `pipeline.ts` and `eval/runCase.ts` (pass the identifiers to `buildTarget`)
- Test: `vrdb/__tests__/keys.test.ts`, `vrdb/connectors/__tests__/{uk,eu}.test.ts`, `vrdb/__tests__/sync.test.ts`, `vrdb/__tests__/lookup.test.ts`, `__tests__/market.test.ts`, `__tests__/target.test.ts`, `sourceRegistry/__tests__/classify.test.ts`

**Interfaces:**
- Consumes: the vendor fields of Task 2.
- Produces:
  - `ResearchTarget.identifiers?: { country?: string; registrationNumber?: string; lei?: string; secCik?: string }`; `buildTarget` takes the four columns.
  - `keys.ts`: `isLei(text): boolean`, `leiKey(lei) = "lei:" + upper`, `regnoKey(number) = "regno:" + compactName(number)` (null under 6 characters), `cikKey(cik) = "cik:" + cik`, `cpeKey(token) = "cpe:" + token`, `cveVendorKey(vendor) = "cve:" + compactName(vendor)`, `identifierKeysOf(numbers: readonly string[]): string[]`.
  - `vendorKeys(target, verifiedDomains = [])` (M1's fix pass: `domain:` keys only for the verified domains, none for a host where `isSharedHost` holds, and `name:` keys from the names only, never the brand) adds `cve:` beside each `kev:` key, `lei:`, `regno:` and `cik:` from the identifiers, and `cpe:` from `cpeVendorOf` (which already skips the brand of a shared host).
  - `matchOf(recordKeys, vendorKeys, weakKeys: ReadonlySet<string> = new Set())`: kinds in order `lei:` (identifier, strong), `domain:`, `cik:` (`sec_cik`, weak when the key is in `weakKeys`), `cpe:` (`nvd_cpe_vendor`), `kev:`, `cve:` (`cve_affected_vendor`), `regno:` (identifier, strong, only when a `name:` key also matches), `name:` (weak).
  - `Connector.version: number` (KEV 1, OFAC 1, UK 2, EU 2); the sync hashes `v<version>` before the bodies.
  - `REGISTRY_VERSION = "sr-4"`.

- [ ] **Step 1: Write the failing tests:**
  - "a valid LEI on a list entry is a lei key; another number of six or more is a regno key; a shorter one is none".
  - "a registration number without the name matches nothing" and "with the name it is a strong identifier match".
  - "an LEI alone is a strong identifier match".
  - "a stored CIK is strong; one in weakKeys is weak".
  - UK: "business registration numbers become regno keys". EU: "an identification number that is a valid LEI becomes a lei key".
  - Sync: "a new connector version re-parses an unchanged body".
  - Lookup: "an identifier match is strong and carries no name-only note".
  - Market: "the stated country comes before the domain and the legal form" (`FR` with `acme.de` → French); a country without a market changes nothing.
  - Target: "the identifiers come from the vendor".
  - Classify: "an EDGAR filing under the vendor's stored CIK is the vendor's" (`https://www.sec.gov/Archives/edgar/data/320193/…` with `secCik` `0000320193` → VENDOR, and the same filing in a viewer of `sr-3`, `https://www.sec.gov/ix?doc=/Archives/edgar/data/320193/…`) and "under another CIK it stays unverified".
- [ ] **Step 2: Run to fail.** `cd Servers && npm run test -- services/vendorResearch/vrdb services/vendorResearch/__tests__/market.test.ts services/vendorResearch/__tests__/target.test.ts services/vendorResearch/sourceRegistry`
- [ ] **Step 3: Implement.** The EDGAR rule runs before the DOWNGRADE of `sec.gov` `Archives` and of the viewers (§D3.2 step 2 is the vendor's own): the CIK is the segment after `/Archives/edgar/data/` in the path, or in the `doc` parameter of `/ix` and `/ixviewer/ix.html`, compared as a number.
- [ ] **Step 4: Run.** Expected: PASS; the eval ratchet holds (`npm run eval:vendor-research`).
- [ ] **Step 5: Snapshot.**

### Task 4: One spacer for every worker

**Files:**
- Create: `records/sharedSpacer.ts`
- Modify: `records/index.ts`
- Test: `records/__tests__/sharedSpacer.test.ts`, `Servers/tests/integration/vrdb.spacer.test.ts`

**Interfaces:**
- Produces:
  - `SPACER_SCRIPT`: a Lua script run with `EVAL`, keys `[key]`, args `[limit, windowMs, maxWaitMs]`. It reads the time with `TIME`, drops starts older than the window, takes the start the in-process spacer would take (`starts[n - limit] + window` when the window is full), refuses with `-1` when that is more than `maxWaitMs` away, else adds the start (member `start .. ":" .. INCR(key .. ":seq")`), sets `PEXPIRE` of twice the window on both keys and returns the wait in ms.
  - `createSharedSpacer(limits: SpacerLimits, deps: { redis: { eval(...args: unknown[]): Promise<unknown> }; key: string; sleep?: Sleep }): Spacer`; a Redis error resolves `false`.
  - `NVD_SPACER_KEY = "vrdb:spacer:nvd"`, `SEC_SPACER_KEY = "vrdb:spacer:sec"`, `SEC_LIMITS = { limit: 5, windowMs: 1_000, maxWaitMs: 2_000 }`.
  - `createRecordsLookup` takes the shared NVD spacer by default (`database/redis.ts`).

- [ ] **Step 1: Write the failing tests:**
  - Unit (fake `eval`): "waits the time the script answers", "refuses when the script answers -1", "refuses when Redis fails".
  - Integration (throwaway Redis): "four turns start at once and the fifth waits for the window" (with `windowMs` 400); "two spacers on one key share the window"; "a turn further than maxWait is refused and takes no place".
- [ ] **Step 2: Run to fail.** `cd Servers && npm run test -- services/vendorResearch/records/__tests__/sharedSpacer.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Unit PASS; `bash $W/run-integration.sh 'vrdb.spacer.test.ts'` → PASS; `records/__tests__/index.test.ts` still passes with its injected spacer.
- [ ] **Step 5: Snapshot.**

### Task 5: The read-through and the NVD

**Files:**
- Create: `vrdb/readThrough.ts`, `vrdb/connectors/nvd.ts`, `Servers/database/migrations/<ts>-vrdb-rejected-index.js`
- Modify: `domain.layer/interfaces/i.vendorResearch.ts` (`VRDB_SOURCE_IDS` adds `"nvd"`), `vrdb/sources.ts`, `vrdb/types.ts`, `vrdb/lookup.ts`, `records/index.ts`, `records/nvd.ts`, `gather.ts`, `Servers/utils/vrdb.utils.ts`
- Test: `vrdb/__tests__/readThrough.test.ts`, `vrdb/connectors/__tests__/nvd.test.ts`, `vrdb/__tests__/lookup.test.ts`, `__tests__/gather.test.ts`, `records/__tests__/index.test.ts`, `Servers/tests/integration/vrdb.readThrough.test.ts`

**Interfaces:**
- Consumes: `activeReadThroughs` (Task 1), `cpeKey` and `matchOf` (Task 3), `createSharedSpacer` (Task 4).
- Produces:
  - `ParsedRecord.status?: "active" | "rejected"` (absent is active); `ParsedRecord.recordType` adds `"sec_filing"`.
  - Definition `nvd`: name "National Vulnerability Database", operator "NIST", `listName` "NVD", `mode: "read_through"`, `ttlHours: 6`, licence "Public domain", attribution "This product uses data from the NVD API but is not endorsed or certified by the NVD.", documentation `https://nvd.nist.gov/developers/vulnerabilities`.
  - `ReadThroughConnector { id; keyOf(target, ctx: { signal: AbortSignal; fetchJson: FetchJson }): Promise<{ key: string; weak: boolean } | null>; fetch(key, ctx: { now: Date; signal: AbortSignal; fetchJson: FetchJson; readPage?: PageReader }): Promise<ParsedRecord[]> }`; `nvdConnector` (key `cpe:<token>`, never weak; URL `nvdUrl(token, now)` without a cutoff; `vulnStatus` `Rejected` → `status: "rejected"`).
  - `ReadThroughOutcome { key: string | null; weak: boolean; outcome: "fresh" | "fetched" | "failed" | "no_key"; fetchedAt: Date | null }`. The lookup adds every read-through key to the vendor's keys for its query, and a weak one to `matchOf`'s `weakKeys`.
  - `readThrough(input: { sources: ReadThroughSource[]; target; now; signal; readPage? }, deps: { store: ReadThroughStore; connectors; fetchJson; spacers }): Promise<Map<VrdbSourceId, ReadThroughOutcome>>`, inside `READ_THROUGH_TIMEOUT_MS = 8_000`; `RETRY_AFTER_FAILURE_MS = 300_000`.
  - `ReadThroughStore { lookupOf(sourceId, key): Promise<{ fetchedAt: Date | null; expiresAt: Date; outcome: string } | null>; saveAnswer(input: { definition; key; records: ParsedRecord[]; outcome: "ok" | "empty" | "failed"; at: Date; expiresAt: Date }): Promise<{ statusChanged: number }> }`, backed by `getVrdbLookupQuery` and `saveReadThroughAnswerQuery` (one transaction: the source row, each record upserted with its keys added to the stored ones and `status_changed_at` set when the status changes, the lookup row; a failed answer writes only the lookup row's outcome and `expires_at`).
  - `VrdbLookupInput` adds `signal?: AbortSignal` and `readPage?: PageReader`; `offerRecords` input adds `readThrough: ReadonlyMap<VrdbSourceId, ReadThroughOutcome>`. A read-through source's coverage has `mode: "read_through"`, `last_success_at` from its key's `fetchedAt`, outcome `not_researched` without a key and `failed` after a failed refresh (stored records still offered).
  - `findVrdbRecordsByKeysQuery` leaves out a vulnerability row when any vulnerability row of the same `source_record_id` is `rejected`; the migration adds `CREATE INDEX IF NOT EXISTS vrdb_records_rejected_idx ON verifywise.vrdb_records (source_record_id) WHERE status = 'rejected'`.
  - `offerRecords` offers one record per CVE id, in the order KEV, NVD, CVE.
  - `SOURCES_BESIDE_VRDB` becomes `["hibp", "sec", "statuspage"]`.

- [ ] **Step 1: Write the failing tests:**
  - Read-through: "a fresh answer is not fetched again"; "an expired answer is fetched and saved"; "a failed fetch keeps the stored records, says failed and waits five minutes"; "a vendor without a CPE token is not asked"; "a refused turn is a failure"; "a fetch past the time is a failure".
  - NVD connector: "asks the 119 days before today, critical only, whatever the cutoff"; "a Rejected CVE is stored rejected".
  - Lookup: "the NVD is covered as read_through with the day of its answer"; "a CVE that KEV and the NVD both have is offered once, as KEV's"; "a CVE rejected on one list is offered by none".
  - Gather and records: "the run does not ask the NVD itself under the flag".
  - Integration: "an answer adds its key to a stored record and keeps the other keys"; "a status change is counted and dated"; "a failed answer leaves the records".
- [ ] **Step 2: Run to fail.** `cd Servers && npm run test -- services/vendorResearch/vrdb services/vendorResearch/__tests__/gather.test.ts services/vendorResearch/records`
- [ ] **Step 3: Implement.** `parseNvd` keeps its output for the per-run path and gains the status; the connector reuses it and `recordOf`'s text. `sharedVrdbLookup` builds the read-through with the shared spacer and `fetchJson`.
- [ ] **Step 4: Run.** Unit PASS; `bash $W/run-integration.sh 'vrdb.*.test.ts'` → PASS; eval ratchet holds.
- [ ] **Step 5: Snapshot.**

### Task 6: The SEC behind Q4

**Files:**
- Create: `vrdb/connectors/sec.ts`
- Modify: `domain.layer/interfaces/i.vendorResearch.ts` (`VRDB_SOURCE_IDS` adds `"sec"`), `vrdb/sources.ts`, `vrdb/gates.ts`, `../webResearch/guardedFetch.ts`, `records/index.ts`, `sourceRegistry/classify.ts`, `credibility.ts`, `gather.ts`
- Test: `vrdb/connectors/__tests__/sec.test.ts`, `../webResearch/__tests__/guardedFetch.test.ts`, `records/__tests__/index.test.ts`, `__tests__/credibility.test.ts`, `vrdb/__tests__/sources.test.ts`

**Interfaces:**
- Produces:
  - Definition `sec`: name "SEC EDGAR", operator "SEC", `listName` "SEC EDGAR filings", `mode: "read_through"`, `ttlHours: 1`, `gate: "Q4"`, licence "Free to reuse (SEC)", attribution "SEC EDGAR, US Securities and Exchange Commission", documentation `https://www.sec.gov/search-filings/edgar-application-programming-interfaces`.
  - `GuardedFetchOptions.userAgent?: string` (default `BOT_USER_AGENT`), also on the conditional fetch.
  - `secUserAgent(contact: string) = "VerifyWise " + contact`; `secConnector(contact)`: `keyOf` gives `cik:<cik>` from `target.identifiers.secCik` (strong), else the CIK `registrantOf` finds by name in the tickers file (kept in process memory for a day, as today) with `weak: true`; records `sec_filing` from `parseSubmissions` and `incidentFilings` (no cutoff), text as `secRecord` with the Item 1.05 excerpt read through `readPage` when given; requests through the SEC spacer.
  - `sourcesBesideVrdb(gates = VRDB_GATES)`: `["hibp", "sec", "statuspage"]` while Q4 is closed, `["hibp", "statuspage"]` when open; `sharedRecordsLookup` uses it.
  - The per-run SEC lookup asks `secSubmissionsUrl(target.identifiers.secCik)` directly when it is set; `recordMatchOf(id, target?)` is strong for `sec` when the target has a stored CIK.

- [ ] **Step 1: Write the failing tests:**
  - "the SEC stays a per-run lookup while Q4 is closed" (not active, beside the VRDB) and "is a read-through when Q4 is open".
  - "the User-Agent carries the contact"; "a stored CIK is asked directly, with no tickers file"; "a CIK found by name is a weak match"; "only Item 1.05 filings are records".
  - Guard: "a caller's User-Agent replaces the bot's".
  - Per-run: "a stored CIK skips the tickers file"; credibility: "a SEC record of a stored CIK is High with no note".
- [ ] **Step 2: Run to fail.** `cd Servers && npm run test -- services/vendorResearch/vrdb services/vendorResearch/records services/webResearch/__tests__/guardedFetch.test.ts services/vendorResearch/__tests__/credibility.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS; eval ratchet holds.
- [ ] **Step 5: Snapshot.**

### Task 7: A zip reader

**Files:**
- Create: `vrdb/zip.ts`
- Test: `vrdb/__tests__/zip.test.ts`, with a small zip writer in `vrdb/__tests__/zipWriter.ts` (stored and deflate entries, optional Zip64 records)

**Interfaces:**
- Produces:
  - `ZipError extends Error` with `code: "not_zip" | "corrupt" | "unsupported" | "too_large" | "too_deep"`.
  - `ZipLimits { maxEntries: number; maxEntryBytes: number; maxTotalBytes: number }`.
  - `readZip(buffer: Buffer, accept: (name: string) => boolean, limits: ZipLimits): Array<{ name: string; data: Buffer }>`: the end of central directory (Zip64 when its fields say so), each accepted entry's local header, method 0 or 8 (`inflateRawSync` with `maxOutputLength`), the inflated size checked against the directory; an accepted entry ending in `.zip` is read once more with the same `accept` (a deeper one is `too_deep`).
  - `readZipFile(path: string, accept, limits, onEntry: (entry) => Promise<void>): Promise<void>`: the same over a file handle, one entry in memory at a time; a nested zip is inflated to a temporary file (`os.tmpdir()`), read, and deleted.

- [ ] **Step 1: Write the failing tests:**
  - "reads deflate and stored entries"; "reads a Zip64 directory"; "reads a zip inside a zip"; "a second level of nesting is refused".
  - "a cut zip is corrupt"; "a body that is not a zip is not_zip"; "an entry past its limit is too_large"; "more entries than the limit is too_large"; "an unknown method is unsupported".
  - "the file reader gives the same entries as the buffer reader and deletes its temporary file".
- [ ] **Step 2: Run to fail.** `cd Servers && npm run test -- services/vendorResearch/vrdb/__tests__/zip.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Snapshot.**

### Task 8: The CVE mirror behind Q7

**Files:**
- Create: `vrdb/connectors/cve.ts`, `Servers/scripts/vrdbCveBaseline.ts`
- Modify: `vrdb/connectors/types.ts`, `vrdb/sync.ts`, `vrdb/worker.ts`, `Servers/utils/vrdb.utils.ts`
- Test: `vrdb/connectors/__tests__/cve.test.ts` (fixture records written from the schema), `vrdb/__tests__/sync.test.ts`, `Servers/scripts/__tests__/vrdbCveBaseline.test.ts`, `Servers/tests/integration/vrdb.sync.test.ts`

**Interfaces:**
- Consumes: `readZip`, `readZipFile` (Task 7), `cveVendorKey` (Task 3), the `cve` definition (Task 1).
- Produces:
  - `IncrementalConnector { kind: "incremental"; id; version; download(fetch, cursor: { day: string } | null, now: Date): Promise<Array<{ day: string; snapshot: Snapshot }> | "unchanged">; parse(snapshot): ParseResult }`; M1's `Connector` gains `kind?: "snapshot"`.
  - `CVE_RELEASE_API = "https://api.github.com/repos/CVEProject/cvelistV5/releases/tags/"`, tag `cve_<day>_at_end_of_day`, asset name `^<day>_delta_CVEs_at_end_of_day\.zip$`, download host `github.com` only, `CVE_MAX_BYTES = 104_857_600`, types `application/zip` and `application/octet-stream`, `CVE_MAX_DAYS_PER_SYNC = 7`.
  - `parseCveRecord(json: unknown, window: { from: string }): ParsedRecord | null | "error"`: PUBLISHED inside the window with a highest base score of 9.0 or more (any CNA or ADP metric), or REJECTED; `sourceRecordId` the CVE id, url `https://www.cve.org/CVERecord?id=<id>`, keys `cve:` of each affected vendor (not `n/a`), status `rejected` for REJECTED; text "CVE Program (cve.org). CVE: …. Published: …. Highest CVSS base score: … (…). Affected: <vendor> <product> (at most 5). Description: … (at most 1,200 characters)."; entries are accepted only when their base name is `CVE-<year>-<n>.json` and the name has no `..`.
  - `applyVrdbDeltaQuery({ sourceId, records, cursor, rawSnapshotHash, at }): Promise<ApplyCounts>`: upserts without delisting, keeps the stored keys of a record that comes without any (a rejected one), dates status changes, stores the cursor and the success.
  - The sync handles `kind: "incremental"`: each day in order, parse errors fail and keep the cursor at the last day applied; a missing release for yesterday is `unchanged`, for an earlier day `fetch_failed`.
  - `scripts/vrdbCveBaseline.ts <baseline.zip>`: exit 2 while `CVE_TERMS_APPROVED` is false or for a file name that is not `<day>_all_CVEs_at_midnight.zip`; else applies the records in batches of 1,000 and sets the cursor to the day before the file's day.

- [ ] **Step 1: Write the failing tests:**
  - "reads the end-of-day releases after the cursor, oldest first, at most seven"; "a first sync starts at yesterday"; "a release whose asset is missing fails"; "an asset on another host is not followed".
  - "keeps a critical record inside the window and a rejected one; drops the rest"; "a rejected record keeps its stored keys"; "an entry named ../x.json is skipped".
  - Sync: "a delta that does not parse keeps the cursor"; "a delta never delists".
  - Script: "refuses while the gate is closed"; "applies a baseline from a local file" (gate passed in, fake store).
  - Integration: "two days applied in order move the cursor and date a rejection".
- [ ] **Step 2: Run to fail.** `cd Servers && npm run test -- services/vendorResearch/vrdb scripts/__tests__/vrdbCveBaseline.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Unit PASS; `bash $W/run-integration.sh 'vrdb.sync.test.ts'` → PASS.
- [ ] **Step 5: Snapshot.**

### Task 9: The UN list behind Q6

**Files:**
- Create: `vrdb/connectors/un.ts`, `vrdb/connectors/__tests__/fixtures/un-consolidated.xml` (its comment says the element names are UNVERIFIED)
- Modify: `vrdb/worker.ts` (the connector map)
- Test: `vrdb/connectors/__tests__/un.test.ts`

**Interfaces:**
- Produces: `UN_LIST_URL = "https://scsanctions.un.org/resources/xml/en/consolidated.xml"`, `UN_RECORD_MARK = "UN Security Council Consolidated List"`, `UN_MAX_BYTES = 20_971_520`, types `application/xml`, `text/xml`; `unConnector` (version 1) reading root `CONSOLIDATED_LIST` (attribute `dateGenerated` as the version), `ENTITIES/ENTITY` with `DATAID`, `FIRST_NAME`, `REFERENCE_NUMBER`, `UN_LIST_TYPE`, `LISTED_ON`, `ENTITY_ALIAS` (`QUALITY`, `ALIAS_NAME`), `ENTITY_ADDRESS/COUNTRY`, `COMMENTS1` — all UNVERIFIED; `INDIVIDUALS` is skipped unread; `sourceRecordId` is the reference number; keys `nameKeysOf` of the name and its aliases.

- [ ] **Step 1: Write the failing tests:** "reads an entity with its aliases and reference number"; "never reads an individual"; "an entity without a reference number is an error"; "another root is wrong_root"; "a cut file is too_large".
- [ ] **Step 2: Run to fail.** `cd Servers && npm run test -- services/vendorResearch/vrdb/connectors/__tests__/un.test.ts`
- [ ] **Step 3: Implement** with `xmlScan.ts`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Snapshot.**

### Task 10: The status job

**Files:**
- Create: `vrdb/relabel.ts`
- Modify: `credibility.ts`, `vrdb/queue.ts`, `vrdb/worker.ts`, `vrdb/lookup.ts` (enqueue after a read-through change), `Servers/utils/vrdb.utils.ts`
- Test: `vrdb/__tests__/relabel.test.ts`, `vrdb/__tests__/worker.test.ts`, `__tests__/credibility.test.ts`, `Servers/tests/integration/vrdb.relabel.test.ts`

**Interfaces:**
- Produces:
  - `decideCredibility(sources: readonly CredibilitySource[], options: { contradicted: boolean }): { label: CredibilityLabel; rule: CredibilityRule; nameOnly: boolean }`, which `credibilityOf` uses unchanged in effect.
  - `relabelFinding(input: { basis: CredibilityBasis; sources: FindingSource[]; statuses: ReadonlyMap<number, { status: RecordStatus; changedOn: string }> }): { label; basis: CredibilityBasis; sources: FindingSource[] } | null`: null when no cited record's status differs; a `contradicted` basis stays Low.
  - `VRDB_RELABEL_JOB = "vrdb_relabel"`, `enqueueRelabel(sourceId, queue?)` with job id `vrdb_relabel_<sourceId>`; `processVrdbJob` routes it; a sync whose counts have `statusChanged > 0` enqueues one.
  - `findFindingsToRelabelQuery(sourceId)`: pending findings with a label of every organization whose vendor matched a record of the source (`vendor_vrdb_matches`) and that cite it with a stored status other than its effective one (rejected when any vulnerability record of its CVE id is); returns `organization_id`, `id`, `credibility_basis`, `sources` and the statuses.
  - `updateFindingCredibilityQuery(organizationId, findingId, update)`: `WHERE organization_id = :organizationId AND id = :findingId AND status = 'pending'`.

- [ ] **Step 1: Write the failing tests:**
  - "a delisted record makes a finding Low, dated the day it left" (D5.7 case 11); "a rejected CVE does" (case 10); "a record back on its list restores the label"; "two trusted publishers keep it High"; "a contradicted finding stays Low"; "a finding whose records did not change is left alone".
  - Worker: "a sync that changed statuses adds a relabel job"; "the relabel job relabels".
  - Integration: "relabels the pending findings of each organization that cite the record"; "leaves accepted and dismissed findings"; "a finding decided after the read is not relabeled"; "a second run changes nothing".
- [ ] **Step 2: Run to fail.** `cd Servers && npm run test -- services/vendorResearch/vrdb services/vendorResearch/__tests__/credibility.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Unit PASS; `bash $W/run-integration.sh 'vrdb.relabel.test.ts'` → PASS.
- [ ] **Step 5: Snapshot.**

### Task 11: The unknown-host script

**Files:**
- Create: `Servers/scripts/vendorResearchUnknownHosts.ts`
- Test: `Servers/scripts/__tests__/vendorResearchUnknownHosts.test.ts`, `Servers/tests/integration/vendorResearch.unknownHosts.test.ts`

**Interfaces:**
- Produces: `main(argv, out, err, query?)` with `--days N` (default 90, 1 to 3650) and `--limit N` (default 50, 1 to 500); `unknownHostsQuery(days, limit)`: completed runs since `NOW() - days`, `jsonb_array_elements_text(trace->'cited'->'unreviewedHosts')`, grouped by host with `COUNT(*) AS runs` and `COUNT(DISTINCT organization_id) AS organizations`, ordered by runs then host. Output: a header line and one line per host; exit 0, or 2 for an argument or a database error (the error's name only).

- [ ] **Step 1: Write the failing tests:** "prints hosts with run and organization counts"; "refuses a bad --days"; "says so when there is none"; integration "counts a host cited in two organizations' runs once per run".
- [ ] **Step 2: Run to fail.** `cd Servers && npm run test -- scripts/__tests__/vendorResearchUnknownHosts.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Unit PASS; integration PASS.
- [ ] **Step 5: Snapshot.**

### Task 12: Prompt `vr-10` and replay cases 35–37

**Files:**
- Modify: `prompts.ts`, `__tests__/prompts.test.ts`, `eval/types.ts`, `eval/runCase.ts`, `eval/cases/index.ts`
- Create: `eval/cases/35-rejected-cve-mirror.ts`, `eval/cases/36-identifier-match.ts`, `eval/cases/37-nvd-read-through.ts`

**Interfaces:**
- Produces: `CREDIBILITY_PROMPT_VERSION = "vr-10"`. The database sentence names the CVE Program; the sanctions sentence names `UN_RECORD_MARK` and keeps `vr-9`'s words for a match by name only ("An entity named … is on …"); "An entry without a Lookup note matched the vendor's verified website or one of its identifiers (a registration number, an LEI)". A case's vendor may carry `identifiers`.

- [ ] **Step 1: Write the failing tests and cases:** prompt tests for the three sentences and the version; case 35 (a KEV row and a `cve` row of one CVE, the `cve` row rejected: nothing offered, no finding); case 36 (a UK entry with the vendor's name and registration number: strong, High, no note); case 37 (an NVD row with a strong `cpe:` match: High, "as of").
- [ ] **Step 2: Run to fail.** `cd Servers && npm run test -- services/vendorResearch/__tests__/prompts.test.ts && npm run eval:vendor-research`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: "37 cases, 0 regressions".
- [ ] **Step 5: Snapshot.**

### Task 13: Identifiers in the vendor form (client)

**Files:**
- Create: `Clients/src/application/validations/vendorIdentifiersValidation.ts`, its test
- Modify: `Clients/src/domain/interfaces/i.vendor.ts`, `Clients/src/domain/models/Common/vendor/vendor.model.ts`, `Clients/src/application/dtos/vendor.dto.ts`, `Clients/src/application/mappers/vendor.mapper.ts` and its tests and mocks, `Clients/src/presentation/components/Modals/NewVendor/index.tsx`, `Clients/src/presentation/constants/formValidationFieldMaps.ts`, `Clients/src/i18n/translations.ts`
- Test: `Clients/src/presentation/components/Modals/NewVendor/__tests__/identifiers.test.tsx`

**Interfaces:**
- Produces: the four fields on the client types (`country`, `registration_number`, `lei`, `sec_cik`); validators returning `{ accepted: boolean; message: string; value: string | null }` with the server's rules; an "Identifiers" group in the modal: Country (two letters, with the name from `Intl.DisplayNames` in the person's language beside it), Registration number, LEI, SEC CIK, each with helper text ("Turns a match by name into a match by identifier.").

- [ ] **Step 1: Write the failing tests:** "an LEI with wrong check digits is refused"; "a CIK is padded to ten digits"; "the country shows its name"; "the payload carries the normalised identifiers"; "an empty field sends null"; the mapper keeps the fields.
- [ ] **Step 2: Run to fail.** `cd Clients && npx vitest run src/application/validations src/presentation/components/Modals/NewVendor src/application/mappers`
- [ ] **Step 3: Implement**, following `other_names`; de, fr and es strings.
- [ ] **Step 4: Run.** Expected: PASS; `npm run typecheck` clean.
- [ ] **Step 5: Snapshot.**

### Task 14: New sources on the research page (client)

**Files:**
- Modify: `Clients/src/domain/interfaces/i.vendorResearch.ts`, `Clients/src/application/utils/vendorResearchText.ts`, `Clients/src/presentation/pages/Vendors/VendorResearchFindings/RunSummary.tsx`, `Clients/src/i18n/translations.ts`
- Test: `Clients/src/application/utils/__tests__/vendorResearchText.test.ts`, `VendorResearchFindings/__tests__/VendorResearchFindings.test.tsx`, `__tests__/i18n.test.tsx`, `__tests__/fixtures.ts`

**Interfaces:**
- Produces: `RecordSourceId` adds `cve`, `un_sanctions`; `VrdbSourceId` adds `nvd`, `sec`, `cve`, `un_sanctions`; names, list names and attributions for the four; the inactive sentence for `cve` ("Low: the CVE Program rejected the record on {date}."); the coverage block lists a read-through source like a mirror and no longer shows the NVD among the lookups.

- [ ] **Step 1: Write the failing tests:** "the NVD is checked as a database, with its notice in the data sources"; "a rejected CVE reads as rejected by the CVE Program"; "an identifier match has no name-only note"; de, fr and es strings exist.
- [ ] **Step 2: Run to fail.** `cd Clients && npx vitest run src/application/utils src/presentation/pages/Vendors/VendorResearchFindings`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS; `npm run typecheck` clean.
- [ ] **Step 5: Snapshot.**

### Task 15: Docs and the user guide

**Files:** `docs/technical/domains/vendors.md`, `docs/technical/infrastructure/automations.md`, `docs/technical/infrastructure/web-research.md`, `docs/deployment/CONFIGURATION_REFERENCE.md`, `docs/technical/security/tenant-isolation.md`, `shared/user-guide-content/content/risk-management/vendor-risks.ts` and the vendors page of the user guide, the spec's status line, `CLAUDE.md` ("Last Updated").

- [ ] **Step 1:** Write: the identifiers and what each changes; the read-through and its spacer; the gates and what opening each needs (Q4 address, Q6 terms and the element names, Q7 legal review and the baseline file); the status job; the unknown-host script; the outbound hosts (`services.nvd.nist.gov`; when open, `data.sec.gov`, `www.sec.gov`, `api.github.com`, `github.com`, `release-assets.githubusercontent.com`, `scsanctions.un.org`); the relabel job in the queue section; the cross-organization reads of the job and the script in the tenant-isolation runbook.
- [ ] **Step 2:** Check every claim against the code (names, numbers, schedules, job ids).
- [ ] **Step 3: Snapshot.**

### Task 16: The M2 gate

- [ ] **Step 1:** `format-check` in Servers and Clients; Servers `npm run build`, unit suite, `npm run eval:vendor-research`, `npm run check:api-drift`, scratch tsc; Clients `typecheck`, `build`, `npx vitest run`.
- [ ] **Step 2:** Integration in four shards and the audit, on the throwaway Postgres and Redis.
- [ ] **Step 3:** Browser smoke on the throwaway services: the identifiers in the vendor form (saved and shown again), and a seeded run with the NVD as a read-through source and a finding relabeled by the status job ("Low: OFAC removed the record on …").
- [ ] **Step 4:** Ledger what stays the user's: the Q4 address, Q6 (terms and the UN element names), Q7 (legal review, the baseline download), the list downloads, and M1's list.
