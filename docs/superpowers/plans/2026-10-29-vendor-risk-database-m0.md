# Vendor risk database M0: rules in code — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the source registry v0, the classifier, the credibility rule and the vr-7 prompt into code, and measure the credibility label in the eval. Nothing a run stores or shows changes.

**Architecture:**
- A registry of reviewed hosts (`sourceRegistry/entries.ts`) and a pure classifier (`sourceRegistry/classify.ts`) give every cited source a category.
- `credibility.ts` turns a finding's cited sources into a label and its basis. It uses the evidence pack, each source's provenance (its record id, and a canonical URL it claims on another site) and the verdict of the snippet check.
- `analyse()` computes a label for every kept finding and returns it beside the findings. These are "shadow labels": the pipeline keeps storing vr-6's `confidence`, and M1 stores the label.
- vr-7 is the prompt and schema without `confidence`. `AnalysisInput.rules` selects it, and in M0 only tests and the eval set that option.

**Tech stack:** TypeScript (Node 22), Zod, Jest with ts-jest (diagnostics off), the vendor research eval (`npm run eval:vendor-research`).

**Spec:** `docs/superpowers/specs/2026-10-29-vendor-risk-database-design.md`. This plan implements D3 (registry), D5 (credibility rules), D6.1–D6.3 (evaluation) and D8 M0.

The spec was approved on 2026-10-29 with every D7 recommendation accepted:

| Question | Accepted answer |
|---|---|
| Q3 | A CIK found by name is weak. |
| Q8 | Keep the unverified government suffixes. |
| Q9 | Keep the carried-over press. |
| Q10 | `krebsonsecurity.com` is UNVERIFIED. |
| Q11 | G1 applies on every TRUSTED_PRESS host. |
| Q12 | Rule V. |
| Q13 | The unconfirmed cap. |
| Q14 | Wires are VENDOR only when they name the vendor's domain. |
| Q15 | Block `pastebin.com`. |
| Q17 | Match strength applies to records only. |
| Q24 | The weak cap limits the record's contribution only. |

**Before Task 1:** the branch holds 223 uncommitted files of the roadmap work. The user commits them first, or says how to baseline them, so that each task's diff holds this plan's work only. Nothing is committed, pushed or opened as a pull request without the user's explicit permission (spec D8). Each task's "Checkpoint" step says what to commit once that is allowed.

## Rulings

These settle what the spec leaves open, or depart from it. Each gives the reason and the cost if it is wrong.

1. **Shadow labels.** `analyse()` labels every kept finding under both rule sets and returns the labels beside the findings, as `Analysed.credibility`, one per kept finding in its order. `NewFinding` gains no field, so every assertion on findings and on stored rows still holds. M1 zips the labels into the insert (D4.6).
   - *Why:* vr-6 stays the production path, and the eval can measure labels now.
   - *Cost if wrong:* M1 attaches the labels instead of zipping them.
2. **No flag in M0.** D8 puts vr-7 "behind `VENDOR_RESEARCH_VRDB`". M0 switches rules with `AnalysisInput.rules` (default `"confidence"`), which only tests and the eval set. M1 adds the flag together with the columns.
   - *Why:* D4.11 has the flag turn on the whole pipeline at once. In M0 it could turn on only half of it: vr-7, with the old `confidence` still stored.
   - *Cost if wrong:* none in production; M1 wires one more line.
3. **Recordings keep `confidence` until M3.** D6.1 removes it. Keeping it lets one recording serve both rule sets, because the vr-7 schema drops the property (the schemas are not strict, see `schema.ts`). `maxOverconfident` stays while vr-6 runs, and `maxMislabelled: 0` joins every case. D6.1 describes the M3 end state.
   - *Cost if wrong:* a later pass deletes 31 lines of recorded `confidence`.
4. **Read order stays on `sourceTiers.ts`.** D4.1 step 7 has `planNewsReads` (R22) and the snippet check (R26) choose the best source by registry category. In M0 both keep using `tierOf`.
   - *Why:* moving them changes which pages a run reads, and M0 changes no read.
   - *Cost if wrong:* M1 moves them, with the rest of the pipeline.
5. **BLOCKED sources stay in the pack in M0.** D3.2 says they never enter it. In M0 a cited blocked source is UNVERIFIED, so it supports Low at most. M1 filters the pack.
6. **Replay cases.** New cases 22–27, 32 and 33 are in M0. Case 31 moves to M1 with 28–30; D8 lists 31 in M0 "with a fake VRDB answer".
   - *Why case 31 moves:* its second list is the UK list, which M1 adds. A fake answer now would fix the shape of `recording.vrdb` before M1 designs the lookup. The credibility unit test covers two name-only records (Low, with the note).
   - *Case 23:* it covers the Medium variant. The Low variant, copies with no canonical link, is a unit test (Task 4, case 4b).
7. **Contradiction.** A contradiction makes the whole finding Low and is checked before anything else (D5.6 #11: "Contradicted snippets are Low, as today").
8. **Independence key.** For a TRUSTED_PRESS source the independence key is its registry entry id, because one entry is one publisher (P3 BBC, P14 ABC News and P28 Politico hold two hosts each). `publisher` on an entry is only a display name.
9. **Two additions to D3.4.** Both can only lower a label.
   - (a) `abc.net.au` gets the downgrade path prefix `news/analysis-and-opinion`. Phase 1 read the path and ABC's policy on analysis and opinion (<https://www.abc.net.au/edpols/differentiating-between-factual-reporting-analysis-and-opinion/13644726>), but the D3.4 row says "—".
   - (b) `bing.com` is in today's aggregator list but in no D3.4 row. It gets an entry of its own, `bing`: UNVERIFIED, no flag, status U, reason "Carried over from today's aggregator list; no page of Bing's was read".
   - *Totals:* 108 entries. 20 are OFFICIAL and 78 are TRUSTED_PRESS. The other 10 are UNVERIFIED: P72 under Q10, the eight groups G3–G10, and `bing`.
10. **Evidence status per entry.** D3.1 puts a status on each evidence link, while D3.4 gives one per row. The code keeps one `status` per entry: the first letter of the St. column. An entry with no evidence link must be in the frozen list `NO_EVIDENCE` (Task 1). D6.3's "no TRUSTED_PRESS entry is without evidence" applies to new entries, since Q9 kept the 37 carried-over ones.
11. **Entry shape.** D3.1's shape gains what the D3.4 rows need:
    - `pattern`, for O9's generic shapes;
    - `wire`, for G3;
    - the downgrade rules `pathPrefix` (with `unless`), `slugContains` and `host`, which P13, P26, P40, P65, P67, P68 and P74 use.
    `flags` drops `downgrade`, because the `downgrade` list already says it.
12. **Rule V.** A page is a statement when `classifySitePage(url, title) !== null` on the vendor's own site only; the title stands in for the link text that gather.ts had. A wire release outside an event category is a self-claim even when its path would pass `classifySitePage` (D5.4).
13. **Rule order.** D5.3 and D5.5 give the rules but not their order:
    - High: `official_record`, `official_page`, `vendor_statement`, `trusted_press_two`. The first that holds with a read source decides.
    - Low: `contradicted`, `name_only`, `unverified`, `self_claim`, `inactive`.
14. **Syndicated copies.** A copy credited through its canonical URL takes that page's class, one level deep. A copy whose canonical URL is on another syndicating entry, on the vendor's own site, on an unknown host or cannot be parsed is not credited (D5.2: "when that is another registry host"). It stays UNVERIFIED.
15. **Deferred to M1.** These need the columns, the VRDB or the client, which M1 brings:
    - the trace's counts per category and its list of unreviewed hosts (D3.3, D4.1 step 4);
    - the wording of the rationale, which the client renders from the basis (D5.5);
    - the freshness and date of a record's data (D5.2, D5.3 step 6).
    M0 writes nothing new to the trace.

## Global constraints

- Branch `feature/vendor-agents-and-risk-page`. No commit, push or PR without the user's explicit permission (D8).
- No migration, dependency, configuration, environment variable, route or client change (D8 M0: "no database, no UI").
- With the default rules (`"confidence"`) behaviour is unchanged:
  - the same findings, `confidence`, evidence pack, prompt text, reads and stored rows;
  - every existing test passes unchanged, except where a task names the test it updates.
- Prompt versions:
  - `PROMPT_VERSION` stays `"vr-6"`; the new prompt's version is `CREDIBILITY_PROMPT_VERSION = "vr-7"`.
  - A prompt's text changes only together with its version.
- Registry and label values:
  - `REGISTRY_VERSION = "sr-1"`; every entry has `reviewed: "2026-10-29"`.
  - Labels are lowercase `"low" | "medium" | "high"` (D4.6 `CHECK`).
  - A model never sees, writes or decides a label or a registry entry (brief §2.1, D5.1).
- Tests:
  - No test reaches the network.
  - Fixtures use fictional vendors and publishers on `.example` hosts. Real registry hosts appear only where the test is about that host (D6.3).
- Code and comments follow the surrounding code: plain English sentences in comments, the same naming, no console output in production code.
- Commands run from `Servers/` unless stated:
  - `npx jest <path>`
  - `npm run test`
  - `npm run eval:vendor-research`
  - `npm run build`
  - `npm run format-check`, here and in `Clients/`
- The scratch typecheck must report 0 errors. The project's `tsc` does not check `services/`. Write this file outside the repository and run `./node_modules/.bin/tsc -p <that file>`:

  ```json
  {"extends":"/Users/halit/Desktop/verifywise/Servers/tsconfig.json","compilerOptions":{"noEmit":true,"incremental":false,"rootDir":"/Users/halit/Desktop/verifywise/Servers","typeRoots":["/Users/halit/Desktop/verifywise/Servers/node_modules/@types"],"types":["node","jest"]},"include":["/Users/halit/Desktop/verifywise/Servers/services/vendorResearch/**/*.ts","/Users/halit/Desktop/verifywise/Servers/services/webResearch/**/*.ts","/Users/halit/Desktop/verifywise/Servers/types/**/*.d.ts"],"exclude":[]}
  ```

## Review focus

These are the inputs most likely to break the rules for a real vendor. Each has its test in the task named.

1. **A vendor whose own domain is a registry host** (LinkedIn on `linkedin.com`, Bloomberg L.P. on `bloomberg.com`, a contractor on `.gov`). Its own pages must be VENDOR under rule V, never TRUSTED_PRESS or OFFICIAL. A marketing page cited for its certifications is Low. Tests in Task 1 and Task 4.
2. **Host spellings.** These all match the same entry: upper case, `www.`, a trailing dot, an explicit port, an `m.` edition and `http:`. An IDN host is classified without throwing, and so is a URL that cannot be parsed. Test in Task 1.
3. **A vendor with no domain.** `onVendorSite` is ignored, and a wire release is never VENDOR. Tests in Task 1 and Task 4.
4. **Canonical links that do not credit a copy.** A link that loops back to its own site, points to another aggregator, points to the vendor's own site, or cannot be parsed leaves the copy UNVERIFIED. Tests in Task 1 and Task 2.
5. **A weak and a strong record on one finding** (an SEC filing found by name and a KEV entry). The label is High, from the strong record, and the name-only note is still shown. Test in Task 4.

## File structure

**Created** (all under `Servers/services/vendorResearch/`):

| File | Responsibility |
|---|---|
| `sourceRegistry/entries.ts` | The registry v0 (D3.4 plus Ruling 9), its types, `REGISTRY_VERSION`, `GENERIC_DOWNGRADE_SEGMENTS`. Data only. |
| `sourceRegistry/classify.ts` | `createSourceClassifier`, `classifySource`, `classifyRecord`, `recordMatchOf`, `namesDomain`. Pure. |
| `sourceRegistry/__tests__/entries.test.ts` | The registry's hygiene. |
| `sourceRegistry/__tests__/classify.test.ts` | The classifier, and parity with `sourceTiers.ts`. |
| `credibility.ts` | `credibilityOf`. Pure, total. |
| `__tests__/credibility.test.ts` | The worked cases of D5.7 and the extras of D6.3. |
| `eval/__tests__/rules.test.ts` | Every case gives the same findings and labels under both rule sets. |
| `eval/cases/22-…`–`27-…`, `32-…`, `33-…` | The new replay cases (Task 8). |

**Modified:**

| File | Change |
|---|---|
| `Servers/domain.layer/interfaces/i.vendorResearch.ts` | `RECORD_SOURCE_IDS`, `SOURCE_CATEGORIES`, `RECORD_STATUSES`, `CREDIBILITY_LABELS`, `CREDIBILITY_RULES`, `CredibilitySource`, `CredibilityBasis`. |
| `records/types.ts` | Re-exports `RecordSourceId` from the domain instead of declaring it. |
| `sourceTiers.ts` | Exports `GOVERNMENT_HOST` and its three lists, for the parity test. Nothing else changes. |
| `services/webResearch/urlCanon.ts` | `crossSiteCanonical`. |
| `services/webResearch/webSession.ts` | Ledger entries gain `record` and `canonicalUrl`; `addRecords` takes the record id. |
| `gather.ts` | Passes `outcome.source` to `addRecords`. |
| `evidence.ts` | `SourceProvenance`, `provenanceOf`. |
| `verifySnippets.ts` | `SnippetVerdict`, `checkSnippetFindings`. |
| `analysis.ts` | `rules`, `provenance`, `Analysed.credibility`. |
| `pipeline.ts` | Passes `provenance`. |
| `schema.ts` | `ResearchRules`, `credibilityOutputSchema`, `AnyResearchOutput`, `outputSchemaFor`. |
| `prompts.ts` | `CREDIBILITY_PROMPT_VERSION`, `promptVersionOf`, the `rules` parameter. |
| `validation.ts` | An absent `confidence` gets the ceiling. |
| Eval | `eval/types.ts`, `scorer.ts`, `report.ts`, `runCase.ts`, `replay.ts`, `cli.ts`, `cases/*`, `cases/index.ts` and their tests. |
| Docs | `docs/technical/domains/vendors.md`, `docs/technical/infrastructure/web-research.md`. |

---

### Task 1: Source registry v0 and the classifier

**Files:**
- Create: `Servers/services/vendorResearch/sourceRegistry/entries.ts`, `…/sourceRegistry/classify.ts`
- Test: `…/sourceRegistry/__tests__/entries.test.ts`, `…/sourceRegistry/__tests__/classify.test.ts`
- Modify: `Servers/domain.layer/interfaces/i.vendorResearch.ts` (after `RESEARCH_CATEGORIES`), `…/records/types.ts:13`, `…/sourceTiers.ts:90` (`GOVERNMENT_HOST`), `:97`, `:122`, `:174`. The last three are the three lists.

**Interfaces**

*Consumes:* `ResearchTarget` (`target.ts`) and `publisherKey(url): string | null` (`sourceTiers.ts`).

*Produces, in the domain interface:*

```ts
export const RECORD_SOURCE_IDS = ["kev", "nvd", "hibp", "sec", "statuspage", "ofac"] as const;
export type RecordSourceId = (typeof RECORD_SOURCE_IDS)[number];
export const SOURCE_CATEGORIES = ["official", "trusted_press", "vendor", "unverified"] as const;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];
export const RECORD_STATUSES = ["active", "withdrawn", "rejected", "delisted"] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];
```

*Produces, in `entries.ts`:*

```ts
export const REGISTRY_VERSION = "sr-1";
export const GENERIC_DOWNGRADE_SEGMENTS: readonly string[]; // G1, in this order:
// opinion, opinions, sponsored, sponsored-content, partner-content, paid-content, brandstudio, brand-studio, adv
export type DowngradeRule =
  | { pathSegment: string }
  | { pathPrefix: string; unless?: string }
  | { slugPrefix: string }
  | { slugSuffix: string }
  | { slugContains: string }
  | { host: string };
export interface RegistryEntry {
  id: string;
  hosts: readonly string[]; // a host matches itself and its subdomains
  suffix?: true; // reviewed public suffixes; checked after every host entry
  pattern?: RegExp; // O9 only; checked after every suffix
  category: Exclude<SourceCategory, "vendor">;
  flags?: ReadonlyArray<"syndicated" | "blocked">;
  syndicatedFrom?: "canonical" | "issuer";
  wire?: true; // G3
  downgrade?: readonly DowngradeRule[];
  publisher?: string; // display name only (Ruling 8)
  reason: string;
  status: "V" | "P" | "S" | "U";
  evidence: readonly string[];
  reviewed: string;
}
export const REGISTRY: readonly RegistryEntry[];
```

*Produces, in `classify.ts`:*

```ts
export interface ClassifiableSource {
  url: string;
  onVendorSite: boolean;
  text?: string;
  canonicalUrl?: string;
}
export interface SourceClass {
  category: SourceCategory;
  publisher: string;
  entry: string | null;
  reviewed: boolean;
  downgraded?: true;
  syndicated?: true;
  blocked?: true;
}
export type SourceClassifier = (source: ClassifiableSource, target: ResearchTarget) => SourceClass;
export function createSourceClassifier(registry: readonly RegistryEntry[]): SourceClassifier;
export const classifySource: SourceClassifier; // over REGISTRY
export function classifyRecord(id: RecordSourceId): SourceClass;
export function recordMatchOf(id: RecordSourceId): "strong" | "weak" | null;
export function namesDomain(text: string, domain: string): boolean;
```

**The entries.** Copy each D3.4 row's hosts, reason (verbatim), evidence URLs and status (the first letter of St.). These rules fill in the rest:

- **O-row ids:**

  | Rows | Ids |
  |---|---|
  | O1–O5 | `us-gov`, `us-mil`, `int`, `uk-gov`, `fr-gouv` |
  | O6–O10 | `europa`, `gov-sld`, `gov-de-facto`, `gov-unverified`, `ico` |
  | O11–O15 | `cnil`, `fca`, `bafin`, `dpas`, `uk-courts` |
  | O16–O20 | `un`, `cve`, `worldbank`, `bailii`, `courtlistener` |

  - O1–O9 are `suffix: true`; their hosts are written without the leading dot.
  - O9's hosts are `bund.de`, `gc.ca`, `govt.nz`, `gov.br`, `go.id`, `go.th`, `go.ke`, `go.tz`, `go.ug`. Its pattern is `/(?:^|\.)(?:gov|govt|gouv|gob|gv)\.[a-z]{2}$/`.
  - O19 and O20 have `flags: ["syndicated"]` and `syndicatedFrom: "issuer"`.
- **P-row ids:** the first label of the row's first host, except P37 `news.sky.com`, which is `sky-news`.
  - `publisher` is set only where D3.4 gives a name in parentheses: P1 Reuters, P2 AP, P3 BBC, P14 ABC News, P28 Politico, P37 Sky News, P40 ABC Australia.
  - P72 `krebsonsecurity` has `category: "unverified"` (Q10).
  - P40's evidence gains the policy URL of Ruling 9(a).
  - The downgrade rules:

    | Entry | Downgrade rules |
    |---|---|
    | P13 `cbsnews` | segment `brandstudio`; `slugContains` `-paid-content` |
    | P19 `time` | segment `partner-content` |
    | P26 `forbes` | `pathPrefix` `sites`, unless `sites/forbesstaff`; host `councils.forbes.com` |
    | P31 `aljazeera` | segments `opinion`, `sponsored`, `paid-content` |
    | P33 `france24` | segment `sponsored-content` |
    | P39 `theglobeandmail` | segments `opinion`, `adv` |
    | P40 `abc` | `pathPrefix` `news/analysis-and-opinion` (Ruling 9) |
    | P52 `handelsblatt` | segments `adv`, `meinung` |
    | P59 `techcrunch` | segments `sponsored`, `sponsor`, `brand-studio` |
    | P65 `venturebeat` | `pathPrefix` `category/DataDecisionMakers` |
    | P67 `theregister` | host `vendorvoice.theregister.com`; `slugPrefix` `sponsored-`, `partner-content-` |
    | P68 `bleepingcomputer` | `pathPrefix` `offer/deals`; host `deals.bleepingcomputer.com` |
    | P73 `scworld` | segment `perspective` |
    | P74 `cyberscoop` | `pathPrefix` `news/sponsored-content`; `slugSuffix` `-op-ed` |
    | P75 `helpnetsecurity` | `slugPrefix` `product-showcase-` |
    | P76 `thehackernews` | segment `expert-insights` |
    | P77 `infosecurity-magazine` | segments `opinions`, `op-ed` |

- **G rows and `bing`:**

  | Row | Id | Settings |
  |---|---|---|
  | G3 | `wires` | `unverified`, `wire: true` |
  | G4 | `republishers` | `flags: ["syndicated"]`, `syndicatedFrom: "canonical"` |
  | G5 | `aggregators` | as G4 |
  | G6 | `blogs` | |
  | G7 | `social` | |
  | G8 | `forums` | |
  | G9 | `wikis-archives` | |
  | G10 | `pastebin` | `flags: ["blocked"]` |
  | Ruling 9(b) | `bing` | |

  G1 is `GENERIC_DOWNGRADE_SEGMENTS`, and G2 is the classifier's first step.

**The classifier, in order.** The first step that applies decides.

1. If `target.domain !== null && source.onVendorSite`, the class is `{ category: "vendor", publisher: "vendor", entry: null, reviewed: true }`.
2. Normalise the host: lower case; strip a leading `www.` and a trailing dot (the URL's `hostname` never holds a port). A URL that cannot be parsed is `unverified` with `reviewed: false`, `entry: null` and `publisher: url`.
3. Find the entry. The longest host of a non-suffix entry wins. Failing that, the longest suffix wins, then the pattern. With no entry the class is `{ category: "unverified", reviewed: false, entry: null, publisher: publisherKey(url) ?? host }`.
4. `blocked`: `unverified`, `blocked: true`.
5. A `trusted_press` entry whose own rule or a G1 segment matches is `unverified`, `downgraded: true`. Path comparison is case-insensitive: segments split on `/` with empty segments dropped, and the slug is the last segment.
6. `syndicatedFrom: "canonical"`: when `canonicalUrl` names an entry that is neither syndicated nor the copy's own entry, the copy takes that canonical's class (without its `canonicalUrl`, so only one level) and `syndicated: true`. Otherwise it is `unverified`, `syndicated: true`, with its own entry (Ruling 14). `syndicatedFrom: "issuer"` keeps the entry's category and adds `syndicated: true`.
7. `wire`: `vendor`, publisher `"vendor"`, when `target.domain !== null && namesDomain(text, target.domain)`. Otherwise `unverified`.
8. Otherwise the entry's category. The publisher is the entry id for a host entry, and `publisherKey(url) ?? host` for a suffix or pattern entry.

`namesDomain(text, domain)` is true when the text holds the domain:
- as a whole word, or at the end of a longer host (`www.acme.example`, `press@acme.example`, `https://acme.example/news`);
- but not as the start of another host (`acme.example.evil.example`) or inside a word (`notacme.example`).

The record classes. Every record class has `entry: null` and `reviewed: true`.

| Record | Category | Publisher | `recordMatchOf` |
|---|---|---|---|
| `kev` | `official` | `kev` | `"strong"` |
| `nvd` | `official` | `nvd` | `"strong"` |
| `sec` | `official` | `sec` | `"weak"` (Q3) |
| `ofac` | `official` | `ofac` | `"weak"` |
| `hibp` | `unverified` | `hibp` | `null` |
| `statuspage` | `vendor` | `"vendor"` | `null` |

- [ ] **Step 1: Write the failing hygiene test**, `entries.test.ts`:

```ts
const NO_EVIDENCE = [ // carried over, or read without a link (Ruling 10)
  "apnews","bbc","nytimes","wsj","ft","economist","theguardian","usatoday","latimes","theatlantic",
  "newyorker","cnbc","marketwatch","barrons","politico","euractiv","dw","independent","telegraph",
  "thetimes","smh","straitstimes","thehindu","lemonde","lefigaro","zeit","faz","sueddeutsche","elpais",
  "corriere","repubblica","nrc","theverge","wired","arstechnica","zdnet","cnet", // the 37 U publishers
  "heise","gov-unverified","fca","bafin","dpas","uk-courts","bing",
];
it("holds 108 entries: 20 official, 78 trusted press and 10 unverified", ...);
it("has unique kebab-case ids, and lower-case hosts without a scheme, www. or a leading dot, each in one entry only", ...);
it("gives every entry a reason, a status of V, P, S or U, and a review date YYYY-MM-DD", ...);
it("has an https evidence link on every entry except those of NO_EVIDENCE, which have none", ...);
it("keeps the trusted press of status U to the 37 carried-over publishers", ...);
it("names the entries reviewed more than 12 months ago and fails on one reviewed more than 18 months ago", ...);
// Use the real clock. Name the >12-month entries in one console.warn of the test;
// expect the >18-month list toEqual([]). Also check the month arithmetic on
// fixed dates: "2026-10-29" is 18 months old on 2028-04-29 and not on 2028-04-28.
it("is version sr-1", () => expect(REGISTRY_VERSION).toBe("sr-1"));
```

- [ ] **Step 2: Write the failing classifier test**, `classify.test.ts`. Use fixed targets and one helper:
  - `ACME = { name: "Acme Analytics", domain: "acme-analytics.example", provides: "Analytics software" }`
  - `NO_DOMAIN = { ...ACME, domain: null }`
  - `at(url, extra?, target = ACME) = classifySource({ url, onVendorSite: false, ...extra }, target)`

  Write one `it` per group below. The expected values are `toMatchObject` subsets.

  **Hosts and subdomains:**

  | Input | Expected |
  |---|---|
  | `https://www.reuters.com/x` | `{category:"trusted_press", entry:"reuters", publisher:"reuters", reviewed:true}` |
  | `https://uk.reuters.com/x` | entry `reuters` |
  | `https://news.sky.com/story/x` | entry `sky-news` |
  | `https://www.sky.com/x` | `{category:"unverified", entry:null, reviewed:false}` |
  | `https://news.google.com/articles/x` | entry `aggregators` |
  | `https://www.google.com/x` | entry `null` |
  | `https://www.bbc.co.uk/news/x` and `https://www.bbc.com/news/x` | the same `publisher` (`bbc`) |

  **Suffixes:**

  | Input | Expected |
  |---|---|
  | `https://example.gov/x` and `https://www.cisa.gov/x` | `official`, entry `us-gov` |
  | `https://notgov.com/x` | `unverified` |
  | `https://www.gov.uk/x` and `https://x.gov.uk/x` | `uk-gov` |
  | `https://who.int/x` | `int` |
  | `https://ec.europa.eu/x` | `europa` |
  | `https://x.gob.ar/x` | `gov-unverified`, by the pattern |
  | `https://shop.go.it/x` | `unverified` |
  | `https://ico.org.uk/x` | `ico`, a host entry before any suffix |

  **The vendor's own site first** (Review focus 1):

  | Input | Expected |
  |---|---|
  | `https://www.bloomberg.com/company/x`, with `onVendorSite: true` and target domain `bloomberg.com` | `{category:"vendor", publisher:"vendor", entry:null}` |
  | the same URL with `onVendorSite: false` | `trusted_press` |
  | `https://www.linkedin.com/company/x`, own site, target domain `linkedin.com` | `vendor` |

  **No domain** (Review focus 3):

  | Input | Expected |
  |---|---|
  | `https://acme-analytics.example/trust`, `onVendorSite: true`, `NO_DOMAIN` | `unverified`, `reviewed: false` |
  | a `prnewswire.com` page whose text names `acme-analytics.example`, `NO_DOMAIN` | `unverified` |

  **Blocked:** `https://pastebin.com/abc` gives `{category:"unverified", blocked:true, entry:"pastebin"}`.

  **Downgraded:** every URL below gives `{category:"unverified", downgraded:true}`.
  - `https://www.forbes.com/sites/janedoe/2026/09/01/x`
  - `https://councils.forbes.com/blog/x`
  - `https://www.cbsnews.com/news/acme-paid-content`
  - `https://www.theregister.com/2026/10/01/sponsored-acme`
  - `https://vendorvoice.theregister.com/x`
  - `https://cyberscoop.com/news/sponsored-content/x`
  - `https://cyberscoop.com/acme-op-ed`
  - `https://venturebeat.com/category/datadecisionmakers/x` (lower case)
  - `https://www.abc.net.au/news/analysis-and-opinion/x`
  - `https://www.reuters.com/opinion/x` (G1)

  **Not downgraded:**

  | Input | Expected |
  |---|---|
  | `https://www.forbes.com/sites/forbesstaff/article/x` | `trusted_press` |
  | `https://www.reuters.com/opinionated-story` | `trusted_press`: a word, not a segment |
  | `https://ico.org.uk/opinion/x` | `official`: G1 applies to TRUSTED_PRESS only |

  **Syndicated** (Review focus 4):

  | Input | Expected |
  |---|---|
  | `https://www.msn.com/en-us/news/x` with `canonicalUrl` `https://apnews.com/article/x` | `{category:"trusted_press", entry:"apnews", publisher:"apnews", syndicated:true}` |
  | the same with no canonical | `{category:"unverified", entry:"republishers", syndicated:true}` |
  | canonical `https://news.yahoo.com/x`, another syndicator | `unverified` |
  | canonical `https://localnews.example/x` | `unverified` |
  | canonical `not a url` | `unverified` |
  | canonical on `acme-analytics.example` | `unverified` |
  | canonical `https://www.forbes.com/sites/janedoe/x` | `unverified`, `downgraded` |
  | `https://www.bailii.org/ew/cases/x` | `official`, `syndicated: true` |

  **Wires:**

  | Input | Expected |
  |---|---|
  | `https://www.prnewswire.com/news-releases/x` with text `"Contact: press@acme-analytics.example"` | `{category:"vendor", publisher:"vendor", entry:"wires"}` |
  | text `"Acme Analytics announced"` | `unverified` |

  `namesDomain` must hold for each of these:

  | Text | `namesDomain` |
  |---|---|
  | `"see www.acme-analytics.example"` | true |
  | `"https://acme-analytics.example/news"` | true |
  | `"acme-analytics.example.evil.example"` | false |
  | `"notacme-analytics.example"` | false |

  **Host spellings** (Review focus 2): each of these gives entry `reuters`.
  - `https://WWW.REUTERS.COM./x`
  - `https://reuters.com:8443/x`
  - `https://m.reuters.com/x`
  - `http://reuters.com/x`

  `https://bücher.example/` and `"not a url"` classify as `unverified` without throwing.

  **Records:** a record is classified by its database, never by the host of its link.
  - `classifyRecord("kev")` is `official` and `recordMatchOf("kev")` is `"strong"`; `nvd` is the same.
  - `sec` and `ofac` are `"weak"`.
  - `hibp` is `unverified` with `null` match.
  - `statuspage` is `{category:"vendor", publisher:"vendor"}`, although `at("https://status.acme-analytics.example/history")` is `unverified`.

  **Parity with `sourceTiers.ts`:**
  - Every host of `REGULATOR_AND_COURT_DOMAINS` is `official`.
  - Every host of `MAJOR_PUBLISHER_DOMAINS` is `trusted_press`, except `krebsonsecurity.com`, which is `unverified`.
  - Every host of `AGGREGATOR_DOMAINS` is `unverified` when there is no text and no canonical.
  - Each of these hosts is a host of exactly one registry entry.
  - Every one of these sample hosts that `GOVERNMENT_HOST` matches is `official`: `www.x.gov`, `x.mil`, `who.int`, `www.gov.uk`, `x.gov.scot`, `x.gov.wales`, `x.gouv.fr`, `x.gov.au`, `x.gov.in`, `x.gob.es`, `x.gob.mx`, `x.go.jp`, `x.go.kr`, `x.go.id`, `x.go.th`, `x.go.ke`, `x.go.tz`, `x.go.ug`, `x.govt.nz`, `x.gov.br`, `x.gv.at`, `x.gob.ar`, `ec.europa.eu`, `x.admin.ch`, `x.bund.de`, `x.gc.ca`, `x.canada.ca`.

- [ ] **Step 3: Run both tests and see them fail.**
  - Run: `npx jest services/vendorResearch/sourceRegistry`
  - Expected: FAIL with "Cannot find module '../entries'".

- [ ] **Step 4: Implement.**
  - Add the domain constants.
  - Replace the type in `records/types.ts:13` with `export type { RecordSourceId } from "../../../domain.layer/interfaces/i.vendorResearch";`, keeping its import for `RECORD_CATEGORY` and `MAX_RECORDS`.
  - Add `export` to `GOVERNMENT_HOST` and the three lists in `sourceTiers.ts`.
  - Write `entries.ts`, with a header comment that points to spec D3 and Ruling 9.
  - Write `classify.ts`. `createSourceClassifier` builds its host index once.

- [ ] **Step 5: Run the tests.**
  - Run: `npx jest services/vendorResearch/sourceRegistry services/vendorResearch/__tests__/sourceTiers.test.ts services/vendorResearch/records`
  - Expected: PASS.

- [ ] **Step 6: Checkpoint.** Commit only if the user allows it: `feat(vendors): add the source registry v0 and its classifier`.

### Task 2: The provenance of a source

**Files:**
- Modify: `Servers/services/webResearch/urlCanon.ts` (after `acceptCanonical`), `…/webResearch/webSession.ts:92-105` (`LedgerEntry`), `:247` (the `addRecords` type), `:804-884` (the page entry), `:958` (`addRecords`), `:1021` (the view)
- Modify: `…/vendorResearch/gather.ts:745`, `…/vendorResearch/evidence.ts` (after `buildEvidencePack`)
- Test: `…/webResearch/__tests__/urlCanon.test.ts`, `…/webResearch/__tests__/webSession.test.ts` (in "the address a page claims for itself", and a new describe for the records), `…/vendorResearch/__tests__/gather.test.ts` (in "the records of public databases", line 1146), `…/vendorResearch/__tests__/evidence.test.ts`

**Interfaces**

*Consumes:* `RecordSourceId`, `RECORD_SOURCE_IDS` and `RecordStatus` (Task 1).

*Produces:*

```ts
// urlCanon.ts
export function crossSiteCanonical(input: { answered: string; claimed: string | null }): string | null;
// LedgerEntry gains:
record?: string;       // the database of a record (addRecords); absent otherwise
canonicalUrl?: string; // the address on another site the page claims as its own; absent when none
// WebSession:
addRecords(records: readonly SessionRecord[], category: C, record?: string): { added: number; omitted: Partial<Record<OmittedReason, number>> };
// evidence.ts
export interface SourceProvenance { record?: RecordSourceId; canonicalUrl?: string; status?: RecordStatus }
export function provenanceOf(entries: readonly LedgerEntry<ResearchCategory>[]): ReadonlyMap<string, SourceProvenance>;
```

- `crossSiteCanonical` returns the claimed address, after `resolveAddress`, when it is usable and on another site (`siteOf`) than the page that answered. It returns null for no claim, a blank or unusable claim, or one on the same site.
- The page entry gets `canonicalUrl` only when `acceptCanonical` took no claim and `crossSiteCanonical` returns one. The page stays under the address it was asked for, as today.
- `provenanceOf` is keyed by `entry.url`. It keeps `record` only when it is one of `RECORD_SOURCE_IDS`. An entry with neither field adds nothing. When two entries share a URL, the first wins. `status` is never set in M0; absent means active, and M1 sets it.

- [ ] **Step 1: Write the failing tests.**
  - `urlCanon.test.ts`, `describe("crossSiteCanonical")`:

    | Answered | Claimed | Expected |
    |---|---|---|
    | `https://www.msn.com/en-us/news/x` | `https://apnews.com/article/x?utm_source=msn` | `"https://apnews.com/article/x"` |
    | `https://www.msn.com/a` | `https://msn.com/b` | `null`: same site |
    | `https://m.msn.com/a` | `https://www.msn.com/b` | `null`: same site |
    | (any) | `null`, `"  "`, `"javascript:alert(1)"`, `"not a url"` | `null` |

  - `webSession.test.ts`:
    - "keeps the address of another site that a page claims as its canonical address, and the page under the asked address": the ledger entry has `url` set to the asked address and `canonicalUrl: "https://apnews.com/article/x"`.
    - "adds no canonical address for a claim on the same site": the entry has no `canonicalUrl` key.
    - "puts the database of a record on its entry": `addRecords(records, "security_incidents", "kev")` gives entries with `record: "kev"`; without the argument the entries have no `record` key.
    - "passes the database through a pool's view": the same through `session.pool(...)`.
  - `gather.test.ts`: "puts each record into the ledger with the id of its database". With a KEV outcome, the session's ledger entries for those records carry `record: "kev"`.
  - `evidence.test.ts`, `describe("provenanceOf")`:
    - "maps a record's address to its database and a page's to the canonical address it claims";
    - "ignores entries with neither, and a record id that is not a database's";
    - "keeps the first entry of an address";
    - "leaves the evidence pack as it was": `buildEvidencePack` of entries with `record` and `canonicalUrl` equals `buildEvidencePack` of the same entries without them.

- [ ] **Step 2: Run and see them fail.**
  - Run: `npx jest services/webResearch/__tests__/urlCanon.test.ts services/webResearch/__tests__/webSession.test.ts services/vendorResearch/__tests__/evidence.test.ts services/vendorResearch/__tests__/gather.test.ts`
  - Expected: FAIL. `crossSiteCanonical` and `provenanceOf` are not functions, and the new expectations on the ledger fail.

- [ ] **Step 3: Implement as the interfaces say.**
  - `gather.ts:745` becomes `session.addRecords(outcome.records, RECORD_CATEGORY[outcome.source], outcome.source)`.
  - The webResearch comments say what the two fields are for: provenance only. `buildEvidencePack` does not copy them.

- [ ] **Step 4: Run the same command, then `npx jest services/webResearch services/vendorResearch`.**
  - Expected: PASS, with no existing test changed.

- [ ] **Step 5: Checkpoint.** `feat(vendors): keep a record's database and a page's cross-site canonical address on the ledger`.

### Task 3: The verdict of the snippet check

**Files:**
- Modify: `Servers/services/vendorResearch/verifySnippets.ts:83-147`
- Test: `…/__tests__/verifySnippets.test.ts`

**Interfaces**

*Produces:*

```ts
export type SnippetVerdict =
  | { outcome: "confirmed"; url: string }
  | { outcome: "not_on_page"; url: string }
  | { outcome: "unread" };
export interface SnippetCheck { finding: NewFinding; verdict: SnippetVerdict | null }
export async function checkSnippetFindings(input: VerifyInput): Promise<SnippetCheck[]>;
```

- `verdict` is null for a finding that cites a page, which is not checked.
- `verifySnippetFindings(input)` becomes `(await checkSnippetFindings(input)).map((check) => check.finding)`. Its output and its trace do not change.

- [ ] **Step 1: Write the failing tests** in `describe("checkSnippetFindings")`:
  - "gives no verdict for a finding that cites a page that was read": `verdict` is `null`.
  - "confirms with the address of the page that holds the quote": `{ outcome: "confirmed", url }`.
  - "says not_on_page with the address of the page that was read": `{ outcome: "not_on_page", url }`, and the finding is the lowered copy, as today.
  - "says unread when no page can be read": `{ outcome: "unread" }`.
  - "says unread once its signal is aborted": `{ outcome: "unread" }`.
  - "returns one check for each finding, in their order".

- [ ] **Step 2: Run and see them fail.**
  - Run: `npx jest services/vendorResearch/__tests__/verifySnippets.test.ts`
  - Expected: FAIL with "checkSnippetFindings is not a function".

- [ ] **Step 3: Implement.** The inner `check` returns a `SnippetCheck`.

- [ ] **Step 4: Run the same command.**
  - Expected: PASS, including every existing `verifySnippetFindings` test, unchanged.

- [ ] **Step 5: Checkpoint.** `feat(vendors): report what the snippet check found for each finding`.

### Task 4: The credibility rule

**Files:**
- Create: `Servers/services/vendorResearch/credibility.ts`
- Test: `…/__tests__/credibility.test.ts`
- Modify: `Servers/domain.layer/interfaces/i.vendorResearch.ts`

**Interfaces**

*Consumes:*
- `classifySource`, `classifyRecord`, `recordMatchOf` and `REGISTRY_VERSION` (Task 1);
- `SourceProvenance` (Task 2);
- `SnippetVerdict` (Task 3);
- `classifySitePage(address, linkText): {category, score} | null` (`gather.ts:171`).

*Produces, in the domain interface:*

```ts
export const CREDIBILITY_LABELS = ["low", "medium", "high"] as const;
export type CredibilityLabel = (typeof CREDIBILITY_LABELS)[number];
export const CREDIBILITY_RULES = ["official_record", "official_page", "vendor_statement",
  "trusted_press_two", "capped_unconfirmed", "trusted_press_one", "contradicted", "name_only",
  "unverified", "self_claim", "inactive"] as const;
export type CredibilityRule = (typeof CREDIBILITY_RULES)[number];
export interface CredibilitySource {
  url: string; category: SourceCategory; publisher: string; entry: string | null; reviewed: boolean;
  reading: "read" | "unconfirmed" | "contradicted";
  vendor_kind?: "statement" | "self_claim";
  record?: { source: RecordSourceId; match: "strong" | "weak" | null; status: RecordStatus };
  downgraded?: true; syndicated?: true; blocked?: true;
}
export interface CredibilityBasis {
  rule: CredibilityRule;
  registry_version: string;
  name_only: boolean; // the chip carries "Matched by name only: this may be another company."
  sources: CredibilitySource[]; // in the order the finding cites them
}
```

*Produces, in `credibility.ts`:*

```ts
export const EVENT_CATEGORIES: ReadonlySet<ResearchCategory>;
// security_incidents, availability, legal_regulatory, financial_health
export interface CredibilityInput {
  finding: Pick<NewFinding, "category" | "sources">;
  pack: readonly EvidenceSource[];
  provenance: ReadonlyMap<string, SourceProvenance>;
  verdict: SnippetVerdict | null;
  target: ResearchTarget;
}
export interface Credibility { label: CredibilityLabel; basis: CredibilityBasis }
export function credibilityOf(input: CredibilityInput): Credibility; // pure, never throws
```

**The rule (D5.3 with Rulings 7, 12 and 13).** First, each cited source is described:

- **Its class.** A source whose provenance has a `record` takes `classifyRecord(record)`. Any other source takes `classifySource({ url, onVendorSite, text: title + " " + content, canonicalUrl })`.
  - The source's own fields come from the pack entry of its URL.
  - A cited URL that is not in the pack is classified by its URL with `onVendorSite: false`, and its reading is `unconfirmed`.
- **Its reading:**
  - a pack `page` is `read`;
  - a `result` is `read` when the verdict confirmed its URL, `contradicted` when the verdict is `not_on_page` for its URL, and `unconfirmed` otherwise.
- **Its vendor kind** (VENDOR sources only):
  - `statement` when the finding's category is in `EVENT_CATEGORIES`, or the record is `statuspage`, or the source is on the vendor's own site (`onVendorSite && target.domain !== null`) and `classifySitePage(url, title) !== null`;
  - otherwise `self_claim`.
- **Its record:** `{ source, match: recordMatchOf(source), status: provenance.status ?? "active" }`.

Then the label:

```
0. verdict is not_on_page                         → low, contradicted
   S = the sources that are not contradicted and are not an inactive record
   weak = a record with match "weak"; it supports Low only (step 0 of D5.3)
1. over S without weak records, a High rule holds with a read source, the first in this order:
     official_record    an official record with match "strong"
     official_page      an official source that is not a record, read
     vendor_statement   a vendor statement, read
     trusted_press_two  trusted press from two or more publishers (entry ids), at least one read
                                                  → high, that rule
2. a High rule holds, but only with unconfirmed sources → medium, capped_unconfirmed
3. S has trusted press from exactly one publisher → medium, trusted_press_one
4. S has a weak record                             → low, name_only
   S has an unverified source                      → low, unverified
   S has a vendor self-claim                       → low, self_claim
   a cited record is inactive                      → low, inactive
   otherwise                                       → low, unverified
name_only = some cited source is a record with match "weak", whatever the label (Q24)
```

- [ ] **Step 1: Write the failing tests.** The helper builds a finding from pack sources:

```ts
const ACME: ResearchTarget = { name: "Acme Analytics", domain: "acme-analytics.example", provides: "Analytics software" };
const NO_DOMAIN: ResearchTarget = { ...ACME, domain: null };
const SITE = "https://acme-analytics.example";
const source = (url: string, over: Partial<EvidenceSource> = {}): EvidenceSource => ({
  id: "S1", category: "security_incidents", kind: "page", onVendorSite: false, url,
  title: "Acme Analytics", content: "Acme Analytics reported an incident.", publishedAt: null, ...over });
const rate = (category: ResearchCategory, pack: EvidenceSource[],
  opts: { provenance?: Record<string, SourceProvenance>; verdict?: SnippetVerdict | null; target?: ResearchTarget; cited?: string[] } = {}) =>
  credibilityOf({ finding: { category, sources: (opts.cited ?? pack.map((s) => s.url)).map((url) =>
    ({ url, title: "", quote: "q", published_at: null })) }, pack,
    provenance: new Map(Object.entries(opts.provenance ?? {})), verdict: opts.verdict ?? null, target: opts.target ?? ACME });
```

  Write one `it` per row, asserting `toMatchObject({ label, basis: { rule, name_only } })`. Each test is named after its worked case. "page" and "result" are pack kinds; "rec X" means the provenance is `{ record: "X" }`, and "canonical U" means it is `{ canonicalUrl: U }`. "Own page" is a pack page with `onVendorSite: true`.

  **The worked cases of D5.7:**

  | # | Category | Sources | Verdict | Label, rule, note |
  |---|---|---|---|---|
  | 1 | security_incidents | page `https://nvd.nist.gov/vuln/detail/CVE-2026-31337`, rec kev | – | high, official_record, false |
  | 2 | security_incidents | pages on `reuters.com`, `bbc.co.uk` | – | high, trusted_press_two, false |
  | 3 | security_incidents | results on `bbc.co.uk`, `bbc.com` | unread | medium, trusted_press_one, false |
  | 4 | security_incidents | pages on `news.yahoo.com` and `www.msn.com`, each with canonical `https://apnews.com/article/x`; three pages on unknown `.example` sites | – | medium, trusted_press_one, false |
  | 4b | security_incidents | the same, with no canonical | – | low, unverified, false |
  | 5 | security_incidents | page `https://medium.com/@x/acme-breach` | – | low, unverified, false |
  | 6 | certifications | own page `${SITE}/press/acme-achieves-iso-27001` | – | low, self_claim, false |
  | 6b | certifications | page `https://www.prnewswire.com/news-releases/acme-iso-27001` whose content names `acme-analytics.example` | – | low, self_claim, false |
  | 6c | certifications | the same page, its content naming no domain | – | low, unverified, false |
  | 7 | security_incidents | own page `${SITE}/blog/security-update` | – | high, vendor_statement, false |
  | 8 | legal_regulatory | page on `localnews.example`; page `https://ico.org.uk/action-weve-taken/enforcement/acme` | – | high, official_page, false |
  | 9 | legal_regulatory | page `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=1`, rec ofac | – | low, name_only, true |
  | 9b | legal_regulatory | that record, plus pages on `reuters.com` and `bbc.co.uk` | – | high, trusted_press_two, true |
  | 10 | security_incidents | page `https://nvd.nist.gov/vuln/detail/CVE-2026-31337`, rec nvd with status `rejected` | – | low, inactive, false |
  | 11 | legal_regulatory | case 9's record with status `delisted` | – | low, inactive, true |
  | 13 | security_incidents | results on `reuters.com`, `bbc.com` | unread | medium, capped_unconfirmed, false |
  | 14 | security_incidents | page `https://www.forbes.com/sites/janedoe/2026/09/01/acme` | – | low, unverified, false |
  | 15 | certifications | page on `reuters.com`; own page `${SITE}/product/overview` | – | medium, trusted_press_one, false |
  | 16 | availability | page `https://status.acme-analytics.example/history`, rec statuspage | – | high, vendor_statement, false |
  | 17 | security_incidents | page `https://haveibeenpwned.com/PwnedWebsites#Acme`, rec hibp | – | low, unverified, false |
  | 18 | legal_regulatory | page `https://www.businesswire.com/news/home/x` that does not name the domain | – | low, unverified, false |

  Case 12 (stale data) leaves the label unchanged, and freshness is an M1 input (Ruling 15). It has no test of its own in M0: case 1 already gives its label.

  **The extras of D6.3:**

  | Test | Sources | Verdict | Label, rule, note |
  |---|---|---|---|
  | An inactive record | case 1's record, status `withdrawn` | – | low, inactive, false |
  | A vendor statement with an unknown site | case 7's page plus a page on `localnews.example` | – | high, vendor_statement, false |
  | Only contradicted sources | results on `reuters.com`, `bbc.com` | `not_on_page`, the reuters URL | low, contradicted, false |
  | An unconfirmed official page | result `https://ico.org.uk/x` | unread | medium, capped_unconfirmed, false |
  | A read source names the rule before an unconfirmed one | result `https://ico.org.uk/x`, plus case 7's page | unread | high, vendor_statement, false |
  | One confirmed trusted result is enough with a second publisher | results on `reuters.com`, `bbc.com` | confirmed, the reuters URL | high, trusted_press_two, false |

  **Review focus:**

  | Test | Sources | Label, rule, note |
  |---|---|---|
  | A weak and a strong record (focus 5) | case 1's record, plus page `https://www.sec.gov/Archives/edgar/data/1/x.htm`, rec sec | high, official_record, true |
  | A vendor on a registry host (focus 1) | own page `https://www.bloomberg.com/company/about`, target domain `bloomberg.com`, in `ai_specific`, title "About Bloomberg" | low, self_claim, false |
  | No domain (focus 3) | case 7's page with `NO_DOMAIN`, then classified by host | low, unverified, false |

  The focus 1 row is a self-claim because neither its path nor its title has a topic word of `SITE_TOPICS` (`gather.ts:125`). A path such as `/company/certifications` would be a statement.

  **Totality:**
  - A cited URL `https://ico.org.uk/x` that is not in the pack gives medium, capped_unconfirmed.
  - A finding with no sources gives low, unverified, with `sources: []`.
  - Neither throws.

  **The basis:** for case 8 the basis is exactly:

  ```ts
  {
    rule: "official_page",
    registry_version: "sr-1",
    name_only: false,
    sources: [
      { url: "https://localnews.example/x", category: "unverified", publisher: "localnews",
        entry: null, reviewed: false, reading: "read" },
      { url: "https://ico.org.uk/action-weve-taken/enforcement/acme", category: "official",
        publisher: "ico", entry: "ico", reviewed: true, reading: "read" },
    ],
  }
  ```

- [ ] **Step 2: Run and see it fail.**
  - Run: `npx jest services/vendorResearch/__tests__/credibility.test.ts`
  - Expected: FAIL with "Cannot find module '../credibility'".

- [ ] **Step 3: Implement.**
  - Add the domain types.
  - Write `credibility.ts`. Its header comment states the rule above and points to spec D5.

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Checkpoint.** `feat(vendors): compute the credibility of a finding from its cited sources`.

### Task 5: The analysis labels every finding it keeps

**Files:**
- Modify: `Servers/services/vendorResearch/analysis.ts:51-100` (`AnalysisInput`, `Analysed`), `:180-216` (both `ok: true` returns), `…/pipeline.ts:574-577` and `:636`, `…/eval/runCase.ts`
- Test: `…/__tests__/analysis.test.ts`, `…/__tests__/pipeline.test.ts`, `…/eval/__tests__/runCase.test.ts`

**Interfaces**

*Consumes:* `credibilityOf`, `Credibility` (Task 4); `checkSnippetFindings`, `SnippetCheck` (Task 3); `provenanceOf`, `SourceProvenance` (Task 2).

*Produces:*

```ts
// AnalysisInput gains
provenance?: ReadonlyMap<string, SourceProvenance>; // empty when absent
// Analysed, ok: true, gains
credibility: Credibility[]; // one for each kept finding, in the order of `kept`
// CaseRun gains
credibility: Credibility[]; // `analysed.ok ? analysed.credibility : []`
```

- With no reader, or no finding after the caps, every verdict is `null`.
- Otherwise the checks come from `checkSnippetFindings`, and the verifier's `passes` filter the checks, so that each label stays with its finding.
- `pipeline.ts` names the array it passes to `buildEvidencePack` `entries`, and passes `provenance: provenanceOf(entries)`.
- `runCase.ts` passes `provenance: provenanceOf(found.entries)`.

- [ ] **Step 1: Write the failing tests.**
  - `analysis.test.ts`, `describe("the credibility of the findings")`:
    - "gives every kept finding a label, in the order of the findings": for `FINDING` on `PACK`, `analysed.credibility` equals `[{ label: "low", basis: { rule: "unverified", registry_version: "sr-1", name_only: false, sources: [{ url: PACK[0].url, category: "unverified", publisher: "example", entry: null, reviewed: false, reading: "unconfirmed" }] } }]`.
    - "labels a record by the provenance it is given": a pack page at `https://nvd.nist.gov/vuln/detail/CVE-2026-31337` with `provenance` `{ record: "kev" }` gives `label: "high"` and rule `official_record`.
    - "labels a finding whose page does not hold the quote as contradicted": reuse the reader of "marks the finding as snippet only and lowers its confidence…" and expect rule `contradicted`.
    - "keeps each label with its finding when the verifier drops one": two findings, the verifier fails the first, and `credibility` has one entry, the second finding's.
    - "returns no labels when no finding stays".
  - `pipeline.test.ts`: "gives the analysis the provenance of the sources it shows".
    - The run's injected `research` returns `entries` that hold one record entry with `record: "kev"`.
    - Spy with `jest.spyOn(analysisModule, "analyse")`.
    - Expect the spy's `provenance.get(<that entry's URL>)` to equal `{ record: "kev" }`.
  - `runCase.test.ts`: "returns a label for every finding it keeps": `run.credibility` has the length of `run.kept`.

- [ ] **Step 2: Run and see them fail.**
  - Run: `npx jest services/vendorResearch/__tests__/analysis.test.ts services/vendorResearch/__tests__/pipeline.test.ts services/vendorResearch/eval/__tests__/runCase.test.ts`
  - Expected: FAIL, because `credibility` is undefined.

- [ ] **Step 3: Implement as the interfaces say.**

- [ ] **Step 4: Run, then `npm run eval:vendor-research`.**
  - Expected: PASS.
  - The eval reads "21 cases, 0 regressions, 0 fixed gaps". It does not measure labels yet.

- [ ] **Step 5: Checkpoint.** `feat(vendors): label every finding the analysis keeps, without storing the label`.

### Task 6: The vr-7 prompt and schema behind `rules`

**Files:**
- Modify: `Servers/services/vendorResearch/schema.ts`, `…/prompts.ts:44-56` and `:100` and `:262-275`, `…/validation.ts:61` and `:368-401`, `…/analysis.ts`, `…/eval/replay.ts:94`, `…/eval/runCase.ts` (`CaseDeps`)
- Test: `…/__tests__/schema.test.ts`, `…/__tests__/prompts.test.ts`, `…/__tests__/validation.test.ts`, `…/__tests__/analysis.test.ts`, `…/eval/__tests__/replay.test.ts`
- Create: `…/eval/__tests__/rules.test.ts`

**Interfaces**

*Consumes:* `CaseRun.credibility` (Task 5).

*Produces:*

```ts
// schema.ts
export type ResearchRules = "confidence" | "credibility";
export const credibilityOutputSchema; // researchOutputSchema whose finding has no `confidence`
export type CredibilityOutput = z.infer<typeof credibilityOutputSchema>;
export type AnyResearchOutput = ResearchOutput | CredibilityOutput;
export function outputSchemaFor(rules: ResearchRules): typeof researchOutputSchema | typeof credibilityOutputSchema;
// prompts.ts
export const CREDIBILITY_PROMPT_VERSION = "vr-7";
export function promptVersionOf(rules: ResearchRules): string; // "vr-6" | "vr-7"
export function buildSystemPrompt(now: Date, rules: ResearchRules = "confidence"): string;
// AnalysisInput gains
rules?: ResearchRules; // "confidence" when absent
// Analysed.output becomes AnyResearchOutput; validateFindings takes AnyResearchOutput
// CaseDeps gains
rules?: ResearchRules;
```

- In `validation.ts`, `Candidate` becomes `Omit<ResearchOutput["findings"][number], "confidence"> & Partial<Pick<ResearchOutput["findings"][number], "confidence">>`.
  - A candidate with no `confidence` stores `confidenceCeiling(...)`.
  - A present value must be one of the values (else `invalid_value`, as today) and is lowered as today.
  - Under vr-6 the schema requires the field, so nothing changes there.
- The `PROMPT_VERSION` comment gains one sentence: `vr-7` (the vendor risk database) drops the confidence from the analysis; the credibility label is computed by code.
- `createScriptedGenerate` answers `credibilityOutputSchema` with `recording.analysis`, like `researchOutputSchema`. The parse drops `confidence`.

- [ ] **Step 1: Write the failing tests.**
  - `prompts.test.ts`:

    ```ts
    it("leaves the confidence field, its values and its rule out of the credibility prompt, and nothing else", () => {
      const vr6 = buildSystemPrompt(NOW).split("\n");
      const vr7 = buildSystemPrompt(NOW, "credibility").split("\n");
      const removed = vr6.filter((line) => !vr7.includes(line));
      expect(removed).toEqual([
        "  - confidence: how strongly the evidence supports the risk.",
        "  confidence is one of: low, medium, high.",
        "- Give confidence high when at least two independent publishers back the risk and one of them",
        "  is the vendor's own website, a regulator or a court, or a major news or trade publisher;",
        "  medium when it rests on two different pages or on the vendor's own statement; low",
        "  otherwise. One story on several sites of one publisher, a copy of a story on an aggregator",
        "  or a social site, and several pages of the vendor's own website count as one publisher. A",
        "  confidence that the sources do not support is lowered after you answer.",
      ]);
      expect(vr7).toEqual(vr6.filter((line) => !removed.includes(line)));
      expect(vr7.join("\n")).not.toMatch(/confidence/i);
    });
    it("builds the confidence prompt when it is given no rules", () =>
      expect(buildSystemPrompt(NOW)).toBe(buildSystemPrompt(NOW, "confidence")));
    it("names the version of each prompt", () => {
      expect(PROMPT_VERSION).toBe("vr-6");
      expect(promptVersionOf("confidence")).toBe("vr-6");
      expect(promptVersionOf("credibility")).toBe("vr-7");
    });
    ```

  - `schema.test.ts`:
    - "accepts a finding without confidence under the credibility schema, and drops one the model still gives": the parse of a valid finding equals that finding without `confidence`, and the analysis schema still refuses a finding without it.
    - "still requires every other field": one row per required field.
    - "is picked by the rules": `outputSchemaFor("confidence")` is `researchOutputSchema`; `outputSchemaFor("credibility")` is `credibilityOutputSchema`.
  - `validation.test.ts`: "gives a candidate without a confidence the ceiling of its sources". For a candidate on two pages of unknown sites, the finding's confidence is `"medium"`. The existing "an unknown confidence" test keeps refusing `"certain"`.
  - `analysis.test.ts`:
    - "asks with the schema and the prompt of the credibility rules when it is given them": `params.schema` is `credibilityOutputSchema` and `params.system` is `buildSystemPrompt(NOW, "credibility")`.
    - "asks as before when it is given no rules": `researchOutputSchema` and `buildSystemPrompt(NOW)`.
  - `replay.test.ts`: "answers the credibility schema with the recorded analysis, without its confidence".
  - `rules.test.ts`:

    ```ts
    it.each(EVAL_CASES.map((evalCase) => [evalCase.id, evalCase] as const))(
      "%s: keeps the same findings and labels under the credibility rules",
      async (_id, evalCase) => {
        const before = await runEvalCase(evalCase);
        const after = await runEvalCase(evalCase, { rules: "credibility" });
        const withoutConfidence = (run: CaseRun) => run.kept.map(({ confidence: _c, ...rest }) => rest);
        expect(withoutConfidence(after)).toEqual(withoutConfidence(before));
        expect(after.credibility).toEqual(before.credibility);
      },
    );
    ```

- [ ] **Step 2: Run and see them fail.**
  - Run: `npx jest services/vendorResearch/__tests__/schema.test.ts services/vendorResearch/__tests__/prompts.test.ts services/vendorResearch/__tests__/validation.test.ts services/vendorResearch/__tests__/analysis.test.ts services/vendorResearch/eval/__tests__`
  - Expected: FAIL, because the new exports are missing.

- [ ] **Step 3: Implement as the interfaces say.**

- [ ] **Step 4: Run the same command, then the scratch typecheck.**
  - Expected: PASS, and 0 type errors.

- [ ] **Step 5: Checkpoint.** `feat(vendors): add the vr-7 analysis without a model confidence, behind the rules of the analysis`.

### Task 7: The eval measures the label

**Files:**
- Modify: `Servers/services/vendorResearch/eval/types.ts:77-114`, `…/eval/scorer.ts`, `…/eval/report.ts:51-55`, `…/eval/cli.ts:157-162`, `…/eval/cases/01…21`
- Test: `…/eval/__tests__/scorer.test.ts`, `…/report.test.ts`, `…/cases.test.ts`. `cli.test.ts` pins no line of a finding, so it needs no change.

**Interfaces**

*Consumes:* `CaseRun.credibility` (Task 5) and `CredibilityLabel` (Task 4).

*Produces:*

```ts
// ExpectedFinding gains
credibility?: CredibilityLabel;
nameOnly?: boolean; // checked when `credibility` is given; absent means false
// Targets gains
/** Kept findings whose credibility label, or name-only note, is not their expected finding's. */
maxMislabelled?: number;
// CaseScore gains
mislabelled: number;
// TARGET_MEASURES gains
maxMislabelled: { measure: "mislabelled", kind: "ceiling" }
```

- A kept finding is compared with the first expected finding that it matches and that has a `credibility`.
- It is mislabelled when its label differs from that `credibility`, or when its `basis.name_only` differs from `nameOnly ?? false`.
- The report line reads `snippet-only N, overconfident N, mislabelled N, cluster repeats …`.
- The CLI prints `confidence X, credibility Y` for each finding.

**The expected labels.** These come from spec Appendix B. The words in parentheses identify each expected finding of a case with several.

| Case | Label |
|---|---|
| 01 | high |
| 03 | medium |
| 04 | low |
| 06 | low |
| 08 | low |
| 10 | low |
| 11 | security ("ransomware") low; certifications ("exception") high; ai_specific ("model provider") high |
| 12 | low |
| 13 | low |
| 14 | high |
| 15 | low |
| 16 | low for both |
| 17 | security ("authentication bypass") high; security ("customer portal") low |
| 18 | low, `nameOnly: true` |
| 19 | high |
| 20 | low, `nameOnly: true` |
| 21 | low |

- Every one of the 21 cases gets `maxMislabelled: 0`. `maxOverconfident` stays where it is (Ruling 3).
- Each case whose label differs from today's stored confidence gets one sentence in its header comment saying why, from Appendix B's "Why": 08, 10, 11 (all three findings), 14, 15, 16 (security), 17 (the KEV finding), 19 and 21. Cases 18 and 20 get one sentence on the note. For example, case 21: "Under the credibility rule both publishers are unknown to the registry, so the label is Low (spec D5.6 #4)."

- [ ] **Step 1: Write the failing tests.**
  - `scorer.test.ts`:
    - "counts a kept finding whose label is not the expected one";
    - "counts a finding whose name-only note is not the expected one, absent meaning none";
    - "ignores expected findings that give no label";
    - "counts nothing when nothing is kept".
  - Add `mislabelled: 0` to the full `CaseScore` literals in `scorer.test.ts` (line 424) and `report.test.ts` (line 18).
  - `report.test.ts`: "writes the mislabelled count after overconfident".
  - `cases.test.ts`: "declare maxMislabelled 0 in every case".

- [ ] **Step 2: Run and see them fail.**
  - Run: `npx jest services/vendorResearch/eval`
  - Expected: FAIL.

- [ ] **Step 3: Implement.** Make the type, scorer, report and CLI changes, then add the case labels and comments.

- [ ] **Step 4: Run `npx jest services/vendorResearch/eval`, then `npm run eval:vendor-research`.**
  - Expected: PASS, and "21 cases, 0 regressions, 0 fixed gaps".
  - A regression on `maxMislabelled` means a label differs from Appendix B. Fix the code, not the expectation, unless the Appendix B row is wrong against D5.3. Record any such case in the checkpoint note.

- [ ] **Step 5: Checkpoint.** `test(vendors): measure the credibility label in the evaluation cases`.

### Task 8: The new replay cases

**Files:**
- Create in `Servers/services/vendorResearch/eval/cases/`:
  - `22-two-trusted-publishers.ts`
  - `23-syndicated-copies.ts`
  - `24-user-content-only.ts`
  - `25-vendor-self-claim.ts`
  - `26-vendor-incident-notice.ts`
  - `27-regulator-page.ts`
  - `32-unconfirmed-trusted-snippets.ts`
  - `33-contributor-page.ts`

  Numbers 28–31 are kept for M1 (Ruling 6).
- Modify: `…/eval/cases/index.ts` (append in this order, and extend the header comment), `…/eval/__tests__/cases.test.ts:27-29` (twenty-nine)

**Interfaces**

*Consumes:*
- the builders (`NOW`, `search`, `read`, `finish`, `page`, `result`);
- `ExpectedFinding.credibility` and `maxMislabelled` (Task 7);
- the page's `canonicalUrl`, kept by Task 2. Write a copy as `{ ...page(url, title, text), canonicalUrl }`.

**Each case:**
- Follow case 01's shape, written by hand, with no `gather`: search, read, finish.
- Use a fictional vendor on a `.example` domain, real registry hosts only for the publishers the case is about, and one recorded finding citing every source below.
- Cite the pack ids the run gives; run the case once and read `run.pack`.
- Its header comment says what it reproduces and what a failure means, as case 21's does.
- Targets: `minPrecision: 1, minRecall: 1, maxKept: 1, maxIrrelevantSources: 0, maxDuplicateSources: 0, maxBadUrls: 0, maxSnippetOnlyFindings: 0, maxMislabelled: 0, maxCitationsRejected: 0`, and `gaps: {}`.

| Case id | Worked case | Category | Sources the finding cites | Expected |
|---|---|---|---|---|
| `two-trusted-publishers` | 2 | security_incidents | Pages read on `www.reuters.com` and `www.bbc.co.uk` | high |
| `syndicated-copies` | 4 | security_incidents | Pages read on `news.yahoo.com` and `www.msn.com`, each with `canonicalUrl` on `apnews.com`, and one page on an unknown `.example` local site. The texts differ (each copy adds its own lines), or the session keeps only the first copy. `apnews.com` is not read. | medium |
| `user-content-only` | 5 | security_incidents | One page read on `medium.com` | low |
| `vendor-self-claim` | 6 | certifications | The vendor's own `/press/…-iso-27001` page, read | low |
| `vendor-incident-notice` | 7 | security_incidents | The vendor's own `/blog/security-update` page, read | high |
| `regulator-page` | 8 | legal_regulatory | A page on an unknown `.example` news site and an `ico.org.uk/action-weve-taken/enforcement/…` page, both read | high |
| `unconfirmed-trusted-snippets` | 13 | security_incidents | News results on `www.reuters.com` and `www.bbc.com`. Both pages fail with `blocked_by_site` in `recording.pages`. | medium; set `maxSnippetOnlyFindings: 1` |
| `contributor-page` | 14 | security_incidents | One page read on `www.forbes.com/sites/<author>/…` | low |

- [ ] **Step 1: Write the eight cases and update `index.ts` and the count in `cases.test.ts`.** Here the cases are the test.

- [ ] **Step 2: Run the eval tests.**
  - Run: `npx jest services/vendorResearch/eval`
  - Expected: PASS, including `rules.test.ts` for the 29 cases.
  - A case that misses a target other than its label is a mistake in the recording. Fix the recording.

- [ ] **Step 3: Run `npm run eval:vendor-research`.** Expected: "29 cases, 0 regressions, 0 fixed gaps".

- [ ] **Step 4: Checkpoint.** `test(vendors): add the replay cases of the credibility rule`.

### Task 9: Docs and the M0 gate

**Files:**
- Modify: `docs/technical/domains/vendors.md`
  - A new `### Credibility (computed, not yet stored)` after `### The verifier` (line 936).
  - The new files in `## Key Files` › `### Backend` (line 1176).
- Modify: `docs/technical/infrastructure/web-research.md`
  - `### Provenance` (line 142): the ledger's `canonicalUrl`, a claim on another site that is kept, not followed.
  - `## Records of public databases` (line 362): the `record` id on the entry.
  - `## Evaluating the agent` (line 435): the `mislabelled` measure and `rules.test.ts`.

**The vendors.md section, in about 25 lines, says:**
- `REGISTRY_VERSION` is `sr-1`, with 108 entries and four categories. Every change is a pull request with a reason, evidence, a review date and a new version.
- The classifier's order.
- Rule V.
- The D5.3 rule, with the unconfirmed cap and the name-only note.
- `analyse()` returns the labels beside the findings and nothing stores them until M1.
- vr-7 exists behind `AnalysisInput.rules`.
- A pointer to spec D3 and D5.

- [ ] **Step 1: Write the docs.**

- [ ] **Step 2: Run the gate, from `Servers/` unless stated.**

  | Command | Expected |
  |---|---|
  | `npm run test` | every suite passes; give the count |
  | `npm run eval:vendor-research` | "29 cases, 0 regressions, 0 fixed gaps" |
  | the scratch typecheck (Global constraints) | 0 errors |
  | `npm run build` | succeeds |
  | `npm run format-check`, here and in `Clients/` | clean |

  If `format-check` is not clean, run `npx prettier --write` on the files this plan touched, then run it again.

- [ ] **Step 3: Checkpoint.** `docs(vendors): describe the source registry and the credibility label`.
  - Report to the user: the test count, the eval line, and any ruling the executor made during the work.
  - Do not open a pull request.
