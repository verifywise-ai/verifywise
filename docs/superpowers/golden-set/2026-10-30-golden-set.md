# Golden set of the vendor risk database

**Spec:** [the vendor risk database design](../specs/2026-10-29-vendor-risk-database-design.md), D6.4 · **Scorer:** `Servers/services/vendorResearch/golden/` and `Servers/scripts/vendorResearchGoldenSet.ts` · **Labels:** [labels.template.json](labels.template.json) · **Candidates checked:** 2026-10-31

The vendor risk database is always on (the `VENDOR_RESEARCH_VRDB` flag was removed with M3 Part B1), and this golden set is the check that its rules rate findings the way a careful analyst would. The golden set is 24 real vendors, one per profile below. Each is researched **once** by an ordinary research run, on a vendor row of its own, and a person writes down what a careful analyst would find. The scorer compares the run with those labels and checks the bars of D6.4. (The first version of this document asked for two runs of each vendor, one with the flag off and one with it on; with one rule there is one run.)

Nothing here runs by itself. A person confirms the vendors, writes the labels, starts the 24 runs and runs the scorer. The runs use the organization's LLM key, like any other research run.

## The profiles

| # | Profile | # | Profile |
|---|---|---|---|
| 1–4 | Products in the KEV catalog (network appliance, file transfer, IT management, VPN) | 13 | Certifications only in its own claims |
| 5–6 | A breach reported by several trusted publishers | 14–15 | Its name, or nearly, on a sanctions list (a trap) |
| 7 | Its own published incident notice | 16 | A rejected CVE in its products (a trap) |
| 8 | A data protection fine on a regulator's site | 17 | Coverage by unknown blogs only |
| 9 | A US registrant with an 8-K Item 1.05 filing | 18 | A small vendor with nothing to find |
| 10 | A long outage on its status page | 19 | No website domain |
| 11 | Layoffs, insolvency or a sale in the press | 20 | Press in German or French |
| 12 | AI terms that allow training on customer data | 21 | A wire story copied on aggregators |
| | | 22 | Contributor or opinion pieces only |
| | | 23 | Law firms' investor alerts on wires (a trap) |
| | | 24 | A delisted sanctions entry (optional) |

A run only sees what is inside each category's lookback (`LOOKBACK_MONTHS` in `Servers/services/vendorResearch/categories.ts`): 24 months for security incidents, certifications and AI-specific risks, 36 for legal and regulatory matters, and 12 for availability and financial health. A KEV entry older than 24 months is left out as well. Check every candidate against the day you run it, not the day it was proposed.

## The candidates

Proposed on 2026-10-31, at most one company per profile, each with one or two public sources found by web search. A profile stays open when two searches did not settle it, or when a search cannot settle it at all (an absence of coverage, or a record that only the synced lists can show). **Every candidate needs your confirmation:** that it is the vendor you mean (name, website, other names) and that it still fits its profile.

The facts below come from the titles and summaries of search results, not from reading every page. A source marked UNVERIFIED was not found.

| # | Candidate | Why it fits | Sources |
|---|---|---|---|
| 1 | Citrix (NetScaler ADC and Gateway) | CVE-2025-5777 ("CitrixBleed 2") was added to the KEV catalog on 10 July 2025. In the window until July 2027. | [CISA alert, 10 July 2025](https://www.cisa.gov/news-events/alerts/2025/07/10/cisa-adds-one-known-exploited-vulnerability-catalog); [The Register](https://www.theregister.com/2025/07/10/cisa_citrixbleed_kev/) |
| 2 | Fortra (GoAnywhere MFT) | CVE-2025-10035, a deserialization flaw of the file transfer product, added on 29 September 2025. | [NVD](https://nvd.nist.gov/vuln/detail/CVE-2025-10035); [The Record](https://therecord.media/cisa-orders-federal-gov-patch-fortra-bug) |
| 3 | ConnectWise (ScreenConnect) | CVE-2025-3935 added on 2 June 2025; a further ConnectWise flaw was added in April 2026 (its CVE id was not checked). | [Qualys ThreatPROTECT](https://threatprotect.qualys.com/?p=4343); [The Hacker News, April 2026](https://thehackernews.com/2026/04/cisa-adds-actively-exploited.html) |
| 4 | Ivanti (Connect Secure) | CVE-2025-22457, a VPN gateway flaw, added on 4 April 2025. Leaves the 24-month window in April 2027. | [NVD](https://nvd.nist.gov/vuln/detail/CVE-2025-22457); [ThaiCERT](https://www.thaicert.or.th/en/2025/04/09/cisa-adds-ivanti-vulnerability-to-kev-catalog-following-state-backed-exploitation/) |
| 5 | Salesloft | Stolen OAuth tokens of its Drift integration were used to take data from the Salesforce instances of its customers in August 2025. | [Help Net Security](https://www.helpnetsecurity.com/2025/09/08/salesloft-drift-data-breach-investigation-results/); [IT Brew](https://www.itbrew.com/stories/2025/09/04/salesloft-drift-data-breach-salesforce-customer-data) |
| 6 | Ingram Micro | A ransomware attack in July 2025 took its ordering systems down for days; it later said the data of more than 42,000 people was affected. | [The Register](https://www.theregister.com/2025/07/06/ingram_micro_confirms_ransomware_behind/); [Security Affairs](https://securityaffairs.com/187083/data-breach/ransomware-attack-on-ingram-micro-impacts-42000-individuals.html) |
| 7 | Cloudflare | Its own blog post of 2 September 2025 on what the Salesloft Drift breach exposed of its Salesforce support data. | [Cloudflare's notice](https://blog.cloudflare.com/response-to-salesloft-drift-incident); [The Record](https://therecord.media/salesloft-drift-breach-cloudflare-zscaler-palo-alto-networks) |
| 8 | Advanced Computer Software Group (now OneAdvanced; its website was not checked) | The ICO fined the NHS software supplier £3.07 million on 26 March 2025 over its 2022 ransomware attack, on the ICO's own enforcement page. | [ICO enforcement notice](https://ico.org.uk/action-weve-taken/enforcement/2025/03/advanced-computer-software-group-limited); [BleepingComputer](https://www.bleepingcomputer.com/news/security/uk-fines-software-provider-307-million-for-2022-ransomware-breach/) |
| 9 | Coinbase | Its Form 8-K under Item 1.05, accepted on 15 May 2025, reports that support contractors were paid to take customer data. Under Q26 the filing read as a page on sec.gov is unverified, and the SEC record matches by name only, so expect Low with the name-only note unless the SEC CIK of the vendor is entered (Q28: a filing under the stored CIK is the vendor's own only when its header names that CIK as a filer). | [SEC EDGAR, the 8-K](https://www.sec.gov/Archives/edgar/data/1679788/000167978825000094/coin-20250514.htm); [CyberInsider](https://cyberinsider.com/coinbase-hit-by-insider-breach-and-extortion-user-data-compromised/) |
| 10 | Open | Leads: GitHub, a multi-service incident of about 78 minutes on 23 April 2026 ([GitHub's April 2026 availability report](https://github.blog/news-insights/company-news/github-availability-report-april-2026)); Kaseya's Datto SaaS Protection, a pod outage of about two days on 11–13 May 2026 ([IsDown, a third-party tracker](https://isdown.app/status/kaseya/outage-history)). Not settled: the run reads only the Atom feed of a Statuspage or incident.io page at `status.<domain>`, `<brand>.statuspage.io` or `<brand>status.com`, and a feed holds the newest entries only, so the outage must still be in the vendor's feed on the day of the run. | |
| 11 | Wiser Solutions (retail data software; its website was not checked) | Filed for Chapter 11 on 26 April 2026 with about $563 million of debt; the court approved the sale of its assets to an affiliate of its lender on 23 June 2026. | [Law360](https://www.law360.co.uk/articles/2470307); [Chapter11Cases](https://chapter11cases.com/blogs/news/in-re-wiser-solutions-a-credit-bid-section-363-sale-on-a-65-day-timeline) |
| 12 | Slack | Its privacy principles say that customer data trains its non-generative machine learning models unless an owner of the workspace opts out. | [Slack's privacy principles](https://slack.com/trust/data-management/privacy-principles); [Computerworld](https://www.computerworld.com/article/2114741/slack-updates-ai-privacy-principles-after-user-backlash.html/amp/) |
| 13 | Open | Not settled by two searches. Pick a vendor whose certification appears only on its own product or news pages, not on a trust, security or compliance page of its site (those count as its statement) and not in an auditor's or certification body's list. | |
| 14–15 | Open | A search cannot show which entity names are on the lists today. Once the list downloads are allowed and the copies have synced, look in `vrdb_records` for an entity whose name is the name of a vendor you use, or nearly, and confirm that it is another company. | |
| 16 | Open | Lead: CVE-2025-15446 was rejected after the vendor said the issue was in another product ([GCVE](https://db.gcve.eu/vuln/CVE-2025-15446)); the vendor was not identified. A rejected record shows as such only from the CVE Program's records, so the baseline must be loaded first (step 2 of the run). | |
| 17 | Open | A search cannot show that trusted coverage is absent. Pick a vendor of your own whose news coverage is only blogs you do not know. | |
| 18 | Open | Pick a small vendor of your own with nothing to find; the expected risks stay empty. | |
| 19 | Conduent, entered without a website | Its breach of October 2024 to January 2025 reached at least 10.5 million people, with notification letters going out in 2026. Without a domain, the run researches the news categories only. | [TechCrunch, February 2026](https://techcrunch.com/2026/02/05/data-breach-at-govtech-giant-conduent-balloons-affecting-millions-more-americans); [BleepingComputer](https://www.bleepingcomputer.com/news/security/bpo-giant-conduent-confirms-data-breach-impacts-105-million-people/) |
| 20 | Open | Leads: Atos, French press on job cuts ([Le Monde Informatique](https://www.lemondeinformatique.fr/actualites/lire-atos-supprime-135-emplois-en-france-97828.html), date not checked) and a plan to cut up to 14,000 positions worldwide by the end of 2026 ([Eurofound](https://apps.eurofound.europa.eu/restructuring-events/detail/203349)). Not settled: the dates are unchecked, and a run searches in German or French only for a `.de` or `.fr` domain or a legal form at the end of the name (GmbH, AG, UG, KG, SAS, SASU, SARL; `SE` does not count, see `market.ts`), which `atos.net` and "Atos SE" are not. | |
| 21 | TikTok | One wire story of the Irish DPC's €530 million fine of 2 May 2025 is copied on Irish local news sites; the copies should count as one publisher. The DPC's own page was not found by two searches (UNVERIFIED). | [Kildare Nationalist](https://www.kildare-nationalist.ie/news/tiktok-fined-530-million-by-irelands-watchdog_arid-56681.html); [WLR FM](https://wlrfm.com/news/tiktok-fined-e530-million-by-irelands-watchdog-646296/) |
| 22 | Open | A search cannot show that other coverage is absent. Pick a vendor whose coverage is contributed or opinion pieces only. | |
| 23 | monday.com | Law firms announced a securities class action in 2026 (Potter v. monday.com Ltd., S.D.N.Y., class period 17 September 2025 to 6 February 2026) in releases on the wires. A trap: a finding that states the allegations as facts, or rests on the alerts alone. | [Rosen Law Firm](https://rosenlegal.com/case/monday-com-ltd/); [Glancy Prongay](https://www.glancylaw.com/cases/mondaycom-ltd/) |
| 24 | Open (optional) | A record is delisted only when it leaves its list after the copy began, so no candidate can be named before the copies run. | |

**Names.** A KEV record matches strongly when the catalog's `vendorProject` is the vendor's name or one of its other names ("Citrix", "Fortra", "ConnectWise", "Ivanti"). Enter the vendor so, or add the catalog's name under **Other names**.

## How to label

Label before you look at the runs, from public sources, as a careful analyst would. Copy [labels.template.json](labels.template.json) to a private place (it will hold the ids of your organization's vendors) and fill it in:

- `organizationId`: the organization whose vendors are researched. `labelledBy`: your name. `labelledOn`: the day, `YYYY-MM-DD`.
- For each vendor: `profile` (1 to 24), `vendorIds` and `name`. [labels.template.json](labels.template.json) gives `vendorIds` as `{ "off": 0, "on": 0 }`, and the scorer reads its `on` value, the id of the vendor's row in that organization that is researched (the row that is scored); `off` is unused, because the VRDB flag is gone, and may stay 0. A plain `vendorId` is read too, and wins when a vendor has both. `about` is for you; the scorer ignores it.
- `expected`: each risk a careful analyst would raise inside the category's lookback, with its `category` (`security_incidents`, `certifications`, `legal_regulatory`, `ai_specific`, `availability`, `financial_health`), a few words of which any one identifies it in a finding's risk description (`anyOf`, case ignored), and the `label` you would give it under the credibility rules (`low`, `medium`, `high`; the rules are in D5 of the spec and in the user guide's "Credibility labels and the vendor risk database").
- `traps`: findings that must not appear (another company of the same name, a delisted entry, a rejected CVE, an old event), each with `anyOf` words and, if you like, a `category`. A finding that matches a trap counts as a false positive, even if it matches an expected risk too.

For example:

```json
{
  "profile": 5,
  "about": "A breach reported by several trusted publishers",
  "vendorIds": { "off": 0, "on": 42 },
  "name": "Salesloft",
  "expected": [
    { "category": "security_incidents", "anyOf": ["Drift", "OAuth"], "label": "high" }
  ],
  "traps": [{ "anyOf": ["Salesforce was breached"] }]
}
```

Choose words a correct finding cannot avoid and a wrong one would not use. A word that is too common ("breach") also matches findings about other events.

## How to run

1. On a deployment with internet access, with automatic research off (`VENDOR_RESEARCH_AUTO_RUN=false`), create each of the 24 vendors once in one organization, with its name, website (none for profile 19) and other names. A run drops every candidate that repeats a finding or an active risk its vendor row already has, so a second run on the same row would measure that. Add no risk to these rows before their runs, and research each row once: to run a vendor again, create a fresh row.
2. Before any run, fill the copies. The lists sync by themselves on the schedules of `vrdb_sync` (the restart queues the first sync of a list taken whole that has none), and wait until `last_success_at` is set in `vrdb_sources` for `kev`, `ofac`, `uk_sanctions` and `eu_fsf`. This downloads the list files, which needs your permission first. The CVE Program's records need the baseline, which an operator loads once with `Servers/scripts/vrdbCveBaseline.ts` (see [Vendors](../../technical/domains/vendors.md#vendor-risk-database), about 650 MB to download and 720 MB of temporary disk): until then the CVE list is "not checked" in every run, and the scorer counts a run whose list failed as a miss. Load it into every database a golden-set run uses.
3. Start a run for each vendor's row (**Research again**, or the microscope icon) and wait until it has completed.
4. Score:

   ```bash
   cd Servers && npx ts-node scripts/vendorResearchGoldenSet.ts /path/to/labels.json
   ```

   The script only reads. For each vendor it takes the first completed run of the vendor row made with the credibility prompt (`CREDIBILITY_PROMPT_VERSION`, `vr-12`), with its findings, whatever their status, and the coverage of the run. A run that started after findings of another run or active risks of its row is listed, and misses the bars: its deduplication hid what it found. It names every field of the labels file that is missing or wrong, and every vendor id that is not a vendor of the organization; a vendor whose stored name differs from the labelled one gets a note. Exit code 0 means every bar is met, 1 that one is missed, and 2 that the labels file or the database could not be read.

## The bars (D6.4)

| Bar | How the scorer measures it |
|---|---|
| Precision of at least 0.9 | The findings that match an expected risk and no trap, over all findings. |
| Recall (reported, no bar) | The expected risks that a matched finding matches, over all expected risks. There is no run to compare it with, so it is printed for the record. |
| Label agreement of at least 80 % | Of the findings that match an expected risk, those whose credibility is the labeller's label. Unmatched findings are not compared. |
| No finding labelled High that the labeller rates Low | Any matched finding labelled `high` whose expected label is `low`. |
| No sanctions finding that states a match as a fact | Any finding that cites the entry of a sanctions list (OFAC, UK, EU) matched by name only and does not say "An entity named … is on …", the words the prompt asks for. An entry matched by the vendor's verified website is about the vendor and is not checked. |
| The coverage block right for every vendor | Every run has a coverage, and none of its lists failed (a failed lookup, or a copy that never synced). The words of the block are checked by eye in the browser. |

Every labelled vendor also needs a completed run on its row, not after findings or risks of its row. The scorer sums over vendors, so one vendor with many findings weighs more than one with few.

## Results

**PENDING.** No result is recorded yet.

- The first pass, on 2026-11-01, is void: GDELT refused the requests of the machine it ran on (so the runs had no news), and the verifier rejected claims that rest on records of the CISA catalog of known exploited vulnerabilities, which it had not been told were a database of the code. Both were addressed afterwards (the engine, its pause after a 429 and its three asks per run are described in [Web research toolkit](../../technical/infrastructure/web-research.md#search-engines-q21-decided-2026-10-31); the verifier's `database` attribute, prompt `vr-12`).
- The second pass, from 2026-11-01T23:05:15Z (first start) to 2026-11-02T07:08:03Z (last start), is blocked by the environment and scored nothing. Details are in the next section. Nothing in this repository says the bars are met.
- The third pass, on 2026-11-02, was stopped by its own clean-up after 6 of 21 vendors had an accepted run. Details are in its section.
- The fourth pass, from 2026-11-02 to 2026-11-03, ended BLOCKED-ENV with 14 of 21 vendors accepted, and the verdict is held (precision 0.83, and 7 vendors without a run). Details are in its section.
- The fifth pass, on 2026-11-03, ran the 7 vendors without a run, ended BLOCKED-ENV with 19 of 21 vendors accepted, and the verdict is held (precision 0.85, label agreement 64 %, 2 vendors without a run). Details are in its section.
- The sixth pass, on 2026-11-03, ran monday.com and Anyscale on the fixed code, ended DONE with 21 of 21 vendors accepted, and the verdict is held (precision 0.83, label agreement 68 %). Details are in its section.

### Pass 2 (2026-11-01 to 2026-11-02): BLOCKED-ENV, nothing scored

- **Setup:** 21 fresh vendor rows in a new database; the lists (`kev`, `ofac`, `uk_sanctions`, `eu_fsf`, `cve`) synced; prompt version `vr-12`; engine GDELT.
- **Result:** only Citrix was run, 4 runs (one row each). 0 of 94 news searches were answered (24 + 23 + 22 + 25), and every run was void for lack of news. The driver stopped by its own rule after four unclean attempts in a row. The other 20 vendors were never started, so the scorer had nothing to score.
- **Gate finding:** before each start the gate made one data request to GDELT, and it passed 30 seconds before each of the four starts. The run's own request was refused right after, and the next gate check, two minutes later, was refused every time. GDELT seems to answer one data request from this address and refuse the next ones for several minutes, so the gate's own data probe seemed to use up the allowance the run needed. The gate does not predict the run.
- **Product finding FR2:** when the first ask got a 429, every search of the run failed at once during the 60 s pause, and none asked again, because all of a run's news searches happen in its first seconds. The fix is in `e0d1d21ff` (the run waits out the pause, asks again, and the gather's clock moves to allow it) and `2c5889479` (a fixed-text step in the run trace for each 429 of GDELT, from the review).
- **Void runs and the engine:** a run in which no search was answered stores no search engine, so a void run cannot show "GDELT" as its engine.
- **What pass 3 changes:** the run is its own probe and no data probe is made; the runs are spaced apart; and the driver backs off after a void run. Only Citrix needs a fresh row; rows 2 to 21 have no run yet.

### Pass 3 (2026-11-02): stopped at 6 of 21 vendors, not passed

- **Code:** `0b3effcf69f6b20e7751f772660601606a3ca6c0`, built and run from a snapshot worktree; a new database with 217 migrations; the lists `cve`, `eu_fsf`, `kev`, `ofac` and `uk_sanctions` synced; prompt version `vr-12`; engine GDELT. Written up on 2026-11-02, while the driver was still running (first start 08:33:48Z).
- **Stopped early:** at about 15:00Z, while the driver waited for the fourth Cloudflare start, the clean-up step of the orchestration ran. It stopped the driver, the backend and the worker, and dropped the database. The orchestration script took a driver that was still running for a finished one; neither the product nor GDELT caused the stop. The runs below stand as recorded, but their database is gone, so pass 4 runs all 21 vendors again on fresh rows.
- **Driver:** no probes (the run is its own probe); one run at a time; about 15 minutes between a clean run and the next start; after a void run the same vendor is tried again after a longer wait (the Cloudflare starts were 13:19, 13:49 and 14:49Z). It stops at a streak of 6 void runs, and the last start allowed is 2026-11-03T14:33:48Z.
- **Accepted runs (6 of 21 vendors, all clean):** Citrix (run 5), Fortra (7), ConnectWise (11), Ivanti (12), Salesloft (13), Ingram Micro (14). Ingram Micro had 23 of 25 news searches answered, which is clean (at least 90 %).
- **Void runs:**
  - GDELT: runs 6 (Fortra), 8 (ConnectWise), and 15, 16 and 17 (Cloudflare, three in a row). Each of these had 2 refused asks and 1 final refusal, and no news answered.
  - Sleep of the Mac: runs 9 and 10 (ConnectWise) ran during a clamshell sleep on battery (09:44:16Z to 11:55:43Z) and failed with timeouts. No void since the wake has been of this kind.
- **GDELT asks:** 30 asks in the traces of pass 3: 22 refused (5 final), 6 answered, 2 with no answer while the Mac slept. News searches answered: pass 3 134 of 264, pass 2 0 of 94, pass 1 0 of 76. The engine writes no log line of its own, so these counts come from the run traces only.
- **Scored, not passed.** The scorer takes the first completed `vr-12` run of each vendor row, so it counted void run 17 for Cloudflare (raw output: precision 0.88, 14 of 16; 7 of 21 vendors with a run). Counting only the accepted runs (a read-only script that uses the scorer's own loader and bars):

  | Bar | Value | Met |
  |---|---|---|
  | Prompt version `vr-12` only | all runs of passes 2 and 3 | yes |
  | Precision at least 0.90 | 0.83 (10 of 12, 0 traps) | no |
  | Label agreement at least 80 % | 100 % (10 of 10) | yes |
  | No High finding rated Low | none | yes |
  | No sanctions match stated as a fact | none | yes |
  | Coverage | no failed list, no run without coverage | yes |
  | No run after earlier findings or risks of its row | none | yes |
  | Every labelled vendor has a completed run | 6 of 21 | no |
  | Recall (no bar) | 0.20 | n/a |

- **The two unmatched findings:** Ivanti (run 12) cites the NVD records of the three CVEs of its first expectation, but its description leaves the CVE ids out, and the scorer matches description words only. Salesloft (run 13) reports a subprocessor change that no label or trap covers.
- **Left for a human:**
  - Decide whether the scorer (or the prompt) should account for the CVE ids a finding cites, and whether the Salesloft finding is a false positive. The labels cannot change.
  - Pass 4 runs all 21 vendors again. Until every vendor has an accepted run, the golden set cannot pass, unless a partial golden set is accepted.
  - Keep the Mac on AC power with the lid open while the driver runs.
  - Nothing in this repository says the bars are met.

### Pass 4 (2026-11-02 to 2026-11-03): BLOCKED-ENV at 14 of 21 vendors, held

- **Code and dates:** `98c707adb2ce8c702f386ba21964506915164c17` (the same code as `0b3effcf6`; only docs commits lie between), built and run from a snapshot worktree; a new database with 217 migrations; the lists `cve`, `eu_fsf`, `kev`, `ofac` and `uk_sanctions` synced; prompt version `vr-12`, registry `sr-5`; engine GDELT. First start 2026-11-02T15:18:36Z; the driver ended at 2026-11-03T11:23:09Z. A dump of the database (without the `llm_keys` rows) is kept outside the repository.
- **Driver:** pass 3's (no probes, one run at a time, a longer wait after a void run), plus two changes. The 21 vendor rows are made up front, in one second and in the order of the labels, and each is checked by name before its run. Void runs now have two kinds: a GDELT void (the trace holds a final refusal; gap 30 minutes after the first, 60 after each further one; 6 in a row stop the driver with exit 5) and an env void (any other void run; gap 15 minutes; 6 in a row stop it with exit 6). A clean or partial run resets both streaks.
- **Accepted runs (14 of 21 vendors, 13 clean):** Citrix (run 3), Fortra (5), ConnectWise (7), Ivanti (11), Salesloft (13), Ingram Micro (18), Cloudflare (19), Advanced Computer Software Group Limited (21), Coinbase (25), Typeform (26), Wiser Solutions (29, partial), Slack (30), Arthur AI (31), Mercury (32). Wiser Solutions answered 19 of 23 news searches, below the 0.90 clean share, and has no findings.
- **Not run:** Anyscale never had an accepted run (7 void runs). Invoicely, GoatCounter, Conduent, Extia, TikTok and monday.com were never started. The driver stopped itself after the sixth GDELT void in a row (Anyscale, run 39, exit 5).
- **Runs:** 39 in all: 13 clean, 2 partial (both Wiser Solutions) and 24 void (62 %).
  - GDELT voids, 21: runs 1 and 2 (Citrix), 4 (Fortra), 6 (ConnectWise), 8 to 10 (Ivanti), 14, 16 and 17 (Ingram Micro), 20 (label 8), 22 to 24 (Coinbase), 27 (Wiser Solutions), 34 to 39 (Anyscale).
  - Env voids, 3: runs 12 (Salesloft), 15 (Ingram Micro) and 33 (Anyscale), none of them with a final GDELT refusal.
- **GDELT asks:** the run traces count about 96 asks, 78 refused (21 final). News searches answered: 327 of 885 (pass 3: 134 of 264). `worker.log` holds no GDELT 429 line, so these counts come from the traces only.
- **Scored:** the raw `score.txt` counts Anyscale's void run 39 as a run (15 of 21 vendors with a run, precision 0.83). The verdict comes from a read-only script that scores each label's latest non-void run (`scoreAccepted.ts`; labels are matched to the state by profile).

  | Bar | Value | Met |
  |---|---|---|
  | Prompt version `vr-12` only | all 39 runs | yes |
  | Precision at least 0.90 | 0.83 (15 of 18, 0 traps) | no |
  | Label agreement at least 80 % | 93 % (14 of 15); Coinbase finding 32 is Low against the label Medium | yes |
  | No High finding rated Low | none | yes |
  | No sanctions match stated as a fact | none | yes |
  | Coverage | no failed list, nothing stale, on all 14 accepted runs | yes |
  | No run after earlier findings or risks of its row | none | yes |
  | Every labelled vendor has a completed run | 14 of 21 | no |
  | Recall (no bar) | 0.15 (raw 0.14) | n/a |

- **Verdict: held.** Two bars are missed, and the merge waits until the golden set is finished.
- **The three unmatched findings:**
  - Salesloft, run 13, finding 24: (a) no label or trap covers it. It reports subprocessors added to the trust centre as an `ai_specific` finding, and Salesloft has no `ai_specific` expectation or trap.
  - Salesloft, run 13, finding 25: (a) no label or trap covers it. It is an availability finding from the incident history of the status page, and the only availability trap of Salesloft does not match.
  - Typeform, run 26, finding 33: (b) it cites the record of an expected risk but lacks the matching words. It cites the status page history, dated 2026-08-07, the day of the expected outage, but only counts the incidents and maintenance windows since 2025-11-03. The cited record is the whole history page, not the incident's own page. Pass 3 had the same case with Ivanti.
- **Against pass 3, for its six labels:** 10 findings with 8 matched (precision 0.80), against 12 with 10 matched (0.83); recall 8 of 49 against 10 of 49; 18 attempts against 9.
- **Left for a human:**
  - Precision is 0.83, below 0.90. Decide between extending the labels, letting the scorer credit a finding that cites an expected risk's record without its words, or letting the miss stand. The labels cannot change otherwise.
  - Run the 7 vendors without a run: pass 5 did. 62 % of the runs of this pass were void (54 % refused by GDELT, 8 % for other causes).
  - Decide whether a partial run (Wiser Solutions, run 29) counts for the golden set.
  - Nothing in this repository says the bars are met.

### Pass 5 (2026-11-03): BLOCKED-ENV at 19 of 21 vendors, held

- **What it is:** pass 4's database restored from its dump (the dump has no `llm_keys` rows, so one stale `research_llm_key_id` was cleared and its foreign key added again), the same code (`98c707adb2ce8c702f386ba21964506915164c17`, 217 migrations, prompt `vr-12`, registry `sr-5`, engine GDELT), and only the 7 labels pass 4 did not accept, with Anyscale last. Pass 4's 14 accepted runs stand and are not run again.
- **Dates:** first start 2026-11-03T11:52:54Z; the driver ended at 2026-11-03T20:26:42Z.
- **Driver:** pass 4's, with growing GDELT gaps (30, 60, 60, 90, 120, 120 and 180 minutes after the first to the seventh GDELT void in a row) and a stop at 8 GDELT voids in a row (exit 5). Env voids keep the 15 minute gap and the stop at 6 in a row (exit 6). It ended with exit 6 on monday.com.
- **Accepted runs of pass 5 (5, all clean):** Invoicely (run 42), GoatCounter (45), Conduent (46), Extia (47), TikTok (49).
- **Void runs:** 19 attempts, 14 void (74 %): 8 GDELT voids and 6 env voids; none partial, 5 clean. 9 of the voids are monday.com's (6 env, 3 GDELT): it had 0 news searches answered in all 9 attempts (runs 50 to 58). Anyscale never ran in pass 5 (it was last in the order; its row 46 holds no run).
- **GDELT asks:** 46 asks in the traces, 35 refused (27 non-final, 8 final), 5 answered: 0.76 refusals per ask (pass 4: 0.81). News searches answered: 109 of 421. `worker.log` holds no 429 line. In monday.com's env voids the shared GDELT ask ended in `search_unavailable` without a final 429; no other vendor ran after 16:25Z, so the trace cannot tell a monday.com-specific failure from a GDELT outage. The audit after pass 5 found the cause, a product defect, fixed in `2d8d9e249` (see pass 6).
- **Scored:** the raw `score.txt` counts monday.com's void run 58 and finds no run for Anyscale (precision 0.85, 23 of 27; agreement 65 %). The verdict comes from the read-only `scoreAccepted.ts`: pass 4's 14 runs plus the latest non-void pass-5 run of each other label.

  | Bar | Value | Met |
  |---|---|---|
  | Prompt version `vr-12` only | all 19 scored runs (all 58 runs in the database) | yes |
  | Precision at least 0.90 | 0.85 (22 of 26, 1 trap) | no |
  | Label agreement at least 80 % | 64 % (14 of 22); pass-5 labels 0 of 7 (TikTok 0/6, Conduent 0/1) | no |
  | No High finding rated Low | none | yes |
  | No sanctions match stated as a fact | none | yes |
  | Coverage | no failed list, none missing, on all 19 accepted runs | yes |
  | No run after earlier findings or risks of its row | none | yes |
  | Every labelled vendor has a completed run | 19 of 21 (Anyscale, monday.com missing) | no |
  | Recall (no bar) | 0.17 (22 of 129) | n/a |

- **Verdict: held.** Three bars are missed. Against pass 4, precision went from 0.83 to 0.85, agreement from 93 % to 64 %, and the vendors without a run from 7 to 2.
- **The four unmatched findings:**
  - Salesloft, run 13, finding 24: (a) no label or trap covers it (subprocessors added to the trust centre, as `ai_specific`).
  - Salesloft, run 13, finding 25: (a) no label or trap covers it (availability, from the status page incident history).
  - Typeform, run 26, finding 33: (b) it cites the status page history record of 2026-08-07, the day of the expected outage, but has none of the expectation's words.
  - Invoicely, run 42, finding 48: (c) it matches Invoicely trap 3 (`ai_specific`, "non-personally identifiable"), so it counts as a false positive.
- **What-if numbers (not the scorer's; the verdict does not use them):** with the (b) finding counted as matched, precision is 0.88 (23 of 26); with the (a) findings left out, 0.92 (22 of 24); with both, 0.96 (23 of 24). None changes the agreement or the 2 vendors without a run.
- **Left for a human:**
  - Agreement is 64 %. The cause is TikTok findings 50 to 55 (four Low against High, two Low against Medium) and Conduent finding 49 (Medium against High). sr-5 classes every TikTok source as `unverified`, its own privacy policy page included (publisher `social`, flag `user_content`). No finding is High rated Low. Decide whether the classification or rating rules change, whether the labels were too high, or whether the miss stands.
  - Precision is 0.85. Pass 4's question stays open: should the labels cover the (a) findings, or should the scorer count a (b) finding?
  - 19 of 21 vendors have a run. Run monday.com and Anyscale in another pass, or accept 19 of 21.
  - Decide whether a partial run (Wiser Solutions, run 29: 19 of 23 news searches answered, no findings) counts for the golden set.
  - Nothing in this repository says the bars are met.

### Pass 6 (2026-11-03): DONE at 21 of 21 vendors, held

- **The audit after pass 5:** monday.com's other name, MNDY, made GDELT refuse every request ("The specified phrase is too short."), because every name was quoted and GDELT refuses a quoted phrase under 5 characters. The fix is `2d8d9e249289bfa20e82caef485c12ddddb8a43a`, in `gdeltSearch.ts` only: a name under 5 characters goes in bare when it is one word of 3 or more letters and digits, and any other short name is left out. The other audit findings were ruled not defects and are left for the owner.
- **What it is:** pass 5's database restored from its dump (the same one expected foreign-key error on the research key), the fixed code (`2d8d9e249`, prompt `vr-12`, registry `sr-5`, engine GDELT), and only monday.com and Anyscale. The 19 accepted runs of passes 4 and 5 stand, because the fixed code sends their byte-identical GDELT requests: the review rebuilt the address of all 58 runs of the pass-5 snapshot with both codes, and only monday.com's 9 changed.
- **Dates:** first start 2026-11-03T22:02:08Z; the driver ended at 2026-11-03T23:03:47Z (exit 0).
- **Driver:** pass 5's, with the BLOCKED-QUERY rule for monday.com (a stop if its GDELT address is refused again as too short).
- **Accepted runs of pass 6 (2):** Anyscale (run 62, clean, 21 of 21 news searches answered) and monday.com (run 60, partial, 17 of 21).
- **Runs:** 4 attempts (runs 59 to 62): monday.com twice (both partial), Anyscale twice (run 61 a GDELT void with 2 refused asks and 1 final refusal, then run 62 clean). No env void.
- **monday.com's news on the fixed code:** answered. Run 59 had 8 of 23 news searches answered (its first load of the address ended after 29 s with no 429; a later load was answered), run 60 had 17 of 21 (most likely from the one-hour cache), and neither showed pass 5's "too short" refusal. Both stay partial: 4 of the 15 code news searches repeat a query and are refused as `repeated_query`, so no monday.com run can reach the 0.90 clean share.
- **GDELT asks:** 7 asks (1 estimated): 3 refused (2 non-final, 1 final), 3 answered, 1 failed without a 429. News searches answered: 46 of 89. `worker.log` holds no GDELT 429 line.
- **Scored:** the raw `score.txt` and the read-only `scoreAccepted.ts` score the same 21 runs, one accepted run per label.

  | Bar | Value | Met |
  |---|---|---|
  | Prompt version `vr-12` only | 21 scored runs (all 62 runs in the database) | yes |
  | Precision at least 0.90 | 0.83 (25 of 30, 1 trap); pass 5 was 0.85 | no |
  | Label agreement at least 80 % | 68 % (17 of 25); pass 5 was 64 % | no |
  | No High finding rated Low | none | yes |
  | No sanctions match stated as a fact | none | yes |
  | Coverage | no failed list, none missing, on all 21 accepted runs | yes |
  | No run after earlier findings or risks of its row | none | yes |
  | Every labelled vendor has a completed run | 21 of 21 (monday.com 60 and Wiser Solutions 29 are partial runs) | yes |
  | Recall (no bar) | 0.18 (25 of 138) | n/a |

- **Verdict: held.** Two bars are missed. The missing-run bar is now met.
- **The five unmatched findings:**
  - Salesloft, run 13, finding 24: (a) no label or trap covers it (`ai_specific` subprocessor addition).
  - Salesloft, run 13, finding 25: (a) no label or trap covers it (availability, from the status page history).
  - Typeform, run 26, finding 33: (b) it cites the status page history record of 2026-08-07, the day of the expected outage, but has none of the expectation's words.
  - Anyscale, run 62, finding 71: (a) availability from the status page history; Anyscale has no availability expectation and its one trap does not match.
  - Invoicely, run 42, finding 48: (c) it matches Invoicely trap 3 ("non-personally identifiable"), so it counts as a false positive.
- **What-if numbers (not the scorer's; the verdict does not use them):** with (b) counted as matched, precision is 0.87 (26 of 30); with the (a) findings left out, 0.93 (25 of 27); with both, 0.96 (26 of 27). None changes the agreement (68 %), so the set would still be held.
- **Left for a human:**
  - Precision is 0.83. Decide whether to accept it as measured or let the miss stand; the key is frozen (audit issue 8).
  - Agreement is 68 %. The causes are TikTok 50 to 55 (Low), Conduent 49 (Medium) and Coinbase 32 (Low), each rated below its label, and the audit found each rating follows the spec. Decide whether to change the classification or rating rules, accept that the labels were too high, or let the miss stand (audit issues 3 to 5).
  - Decide whether a partial run counts (monday.com 60, Wiser Solutions 29), and whether monday.com's repeated queries are a defect. If a partial run does not count, the run bar is 19 of 21 (audit issue 9). The repeats were a product defect (the extra news search was led by the first other name without checking that it was the vendor's own name again, "monday.com Ltd.", so the web session refused it as a repeat), fixed in `85bf162`; the accepted runs stand, because a pass 7 cannot change the held verdict (agreement 68 % is below the 80 % bar). It would also prove nothing the offline proof does not already show. On GDELT the fixed code sends the same request; the only new searches (monday.com's 4 MNDY queries) have the topic words of the name-led queries, so they return the same results and the ledger stays the same. Wiser and Ingram send identical searches.
  - Other open audit question: whether a news engine that answers about half the runs of every non-Anthropic key is acceptable for launch (issue 7). Issue 6 is done: a GDELT failure that is not a 429 now writes its own fixed-word trace step (`6135f52e6`). It changes no request, answer or finding, so the verdict stands.
  - A later fix that changes no result: an other name written with a comma before its legal form ("Acme Analytics, Inc.") no longer splits off the legal form as a name of its own (`a3a654470`). For none of the 21 vendors does the target, a lookup key or a search of the code change.
  - Nothing in this repository says the bars are met.
