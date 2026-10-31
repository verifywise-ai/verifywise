# Golden set of the vendor risk database

**Spec:** [the vendor risk database design](../specs/2026-10-29-vendor-risk-database-design.md), D6.4 · **Scorer:** `Servers/services/vendorResearch/golden/` and `Servers/scripts/vendorResearchGoldenSet.ts` · **Labels:** [labels.template.json](labels.template.json) · **Candidates checked:** 2026-10-31

The `VENDOR_RESEARCH_VRDB` flag stays off by default until the golden set passes. The golden set is 24 real vendors, one per profile below. Each is researched twice by an ordinary research run, once with the flag off and once with it on, each on a vendor row of its own, and a person writes down what a careful analyst would find. The scorer compares the two runs with those labels and checks the bars of D6.4.

Nothing here runs by itself. A person confirms the vendors, writes the labels, starts the 48 runs and runs the scorer. The runs use the organization's LLM key, like any other research run.

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
| 9 | Coinbase | Its Form 8-K under Item 1.05, accepted on 15 May 2025, reports that support contractors were paid to take customer data. Under Q26 the filing read as a page on sec.gov is unverified, and the SEC record matches by name only, so expect Low with the name-only note. | [SEC EDGAR, the 8-K](https://www.sec.gov/Archives/edgar/data/1679788/000167978825000094/coin-20250514.htm); [CyberInsider](https://cyberinsider.com/coinbase-hit-by-insider-breach-and-extortion-user-data-compromised/) |
| 10 | Open | Leads: GitHub, a multi-service incident of about 78 minutes on 23 April 2026 ([GitHub's April 2026 availability report](https://github.blog/news-insights/company-news/github-availability-report-april-2026)); Kaseya's Datto SaaS Protection, a pod outage of about two days on 11–13 May 2026 ([IsDown, a third-party tracker](https://isdown.app/status/kaseya/outage-history)). Not settled: the run reads only the Atom feed of a Statuspage or incident.io page at `status.<domain>`, `<brand>.statuspage.io` or `<brand>status.com`, and a feed holds the newest entries only, so the outage must still be in the vendor's feed on the day of the run. | |
| 11 | Wiser Solutions (retail data software; its website was not checked) | Filed for Chapter 11 on 26 April 2026 with about $563 million of debt; the court approved the sale of its assets to an affiliate of its lender on 23 June 2026. | [Law360](https://www.law360.co.uk/articles/2470307); [Chapter11Cases](https://chapter11cases.com/blogs/news/in-re-wiser-solutions-a-credit-bid-section-363-sale-on-a-65-day-timeline) |
| 12 | Slack | Its privacy principles say that customer data trains its non-generative machine learning models unless an owner of the workspace opts out. | [Slack's privacy principles](https://slack.com/trust/data-management/privacy-principles); [Computerworld](https://www.computerworld.com/article/2114741/slack-updates-ai-privacy-principles-after-user-backlash.html/amp/) |
| 13 | Open | Not settled by two searches. Pick a vendor whose certification appears only on its own product or news pages, not on a trust, security or compliance page of its site (those count as its statement) and not in an auditor's or certification body's list. | |
| 14–15 | Open | A search cannot show which entity names are on the lists today. Once the list downloads are allowed and the copies have synced, look in `vrdb_records` for an entity whose name is the name of a vendor you use, or nearly, and confirm that it is another company. | |
| 16 | Open | Lead: CVE-2025-15446 was rejected after the vendor said the issue was in another product ([GCVE](https://db.gcve.eu/vuln/CVE-2025-15446)); the vendor was not identified. In M1 the NVD is still asked on the web for each run, and a rejected record only shows as such for a record of the vendor risk database. | |
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
- For each vendor: `profile` (1 to 24), `vendorIds` (the ids of the vendor's two rows in that organization: `off`, the row researched with the flag off, and `on`, the row researched with it on) and `name`. `about` is for you; the scorer ignores it.
- `expected`: each risk a careful analyst would raise inside the category's lookback, with its `category` (`security_incidents`, `certifications`, `legal_regulatory`, `ai_specific`, `availability`, `financial_health`), a few words of which any one identifies it in a finding's risk description (`anyOf`, case ignored), and the `label` you would give it under the credibility rules (`low`, `medium`, `high`; the rules are in D5 of the spec and in the user guide's "Credibility labels and the vendor risk database").
- `traps`: findings that must not appear (another company of the same name, a delisted entry, a rejected CVE, an old event), each with `anyOf` words and, if you like, a `category`. A finding that matches a trap counts as a false positive, even if it matches an expected risk too.

For example:

```json
{
  "profile": 5,
  "about": "A breach reported by several trusted publishers",
  "vendorIds": { "off": 42, "on": 43 },
  "name": "Salesloft",
  "expected": [
    { "category": "security_incidents", "anyOf": ["Drift", "OAuth"], "label": "high" }
  ],
  "traps": [{ "anyOf": ["Salesforce was breached"] }]
}
```

Choose words a correct finding cannot avoid and a wrong one would not use. A word that is too common ("breach") also matches findings about other events.

## How to run

1. On a deployment with internet access, with automatic research off (`VENDOR_RESEARCH_AUTO_RUN=false`), create each of the 24 vendors twice in one organization, with the same name, website (none for profile 19) and other names: one row is researched with the flag off and the other with it on. A run drops every candidate that repeats a finding or an active risk its vendor row already has, so two runs on one row would measure that, not the flag. Add no risk to these rows before their runs.
2. With `VENDOR_RESEARCH_VRDB` unset or `false` on the backend and the worker, start a run for each vendor's `off` row (**Research again**, or the microscope icon) and wait until it has completed.
3. Set `VENDOR_RESEARCH_VRDB=true` on the backend and on the worker, restart both, and wait until each of the four lists has synced: `last_success_at` is set in `vrdb_sources` for `kev`, `ofac`, `uk_sanctions` and `eu_fsf` (the restart queues the first sync of a list that has none). This downloads the four list files, which needs your permission first. Then start a run for each vendor's `on` row. Research each row once: to run a flag again, create a fresh row.
4. Score:

   ```bash
   cd Servers && npx ts-node scripts/vendorResearchGoldenSet.ts /path/to/labels.json
   ```

   The script only reads. For each vendor it takes the first completed run of its `off` row with the prompt version of the flag off (`PROMPT_VERSION`, `vr-6`) and of its `on` row with that of the flag on (`CREDIBILITY_PROMPT_VERSION`, `vr-9`), with their findings, whatever their status, and the coverage of the run with the flag on. A run that started after findings of another run or active risks of its row is listed, and misses the bars: its deduplication hid what it found. It names every field of the labels file that is missing or wrong, and every vendor id that is not a vendor of the organization; a vendor whose stored name differs from the labelled one gets a note. Exit code 0 means every bar is met, 1 that one is missed, and 2 that the labels file or the database could not be read.

## The bars (D6.4)

| Bar | How the scorer measures it |
|---|---|
| Precision of at least 0.9 | With the flag on: the findings that match an expected risk and no trap, over all findings. |
| Recall not below the flag-off run | The expected risks that a matched finding matches, over all expected risks, with the flag on and with it off. |
| Label agreement of at least 80 % | Of the findings with the flag on that match an expected risk, those whose credibility is the labeller's label. Unmatched findings are not compared. The confidence of the flag-off run is compared the same way and printed for the record only. |
| No finding labelled High that the labeller rates Low | Any matched finding labelled `high` whose expected label is `low`. |
| No sanctions finding that states a match as a fact | Any finding with the flag on that cites the entry of a sanctions list (OFAC, UK, EU) matched by name only and does not say "An entity named … is on …", the words `vr-9` asks for. An entry matched by the vendor's verified website is about the vendor and is not checked. |
| The coverage block right for every vendor | Every run with the flag on has a coverage, and none of its lists failed (a failed lookup, or a copy that never synced). The words of the block are checked by eye in the browser. |

Every labelled vendor also needs a completed run with the flag off on its `off` row and one with it on on its `on` row, neither after findings or risks of its row. The scorer sums over vendors, so one vendor with many findings weighs more than one with few.
