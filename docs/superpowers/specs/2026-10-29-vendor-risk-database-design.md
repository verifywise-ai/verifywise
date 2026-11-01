# Vendor risk database and credibility labels — design

**Status:** Approved on 2026-10-29, with every recommendation of D7 accepted; M0 was done on 2026-10-30 ([the M0 plan](../plans/2026-10-29-vendor-risk-database-m0.md)), and Q25–Q27, raised by its final review, were answered with their recommendations the same day; M1 was done on 2026-10-31 ([the M1 plan](../plans/2026-10-30-vendor-risk-database-m1.md)), and M2 was built the same day ([the M2 plan](../plans/2026-10-31-vendor-risk-database-m2.md)): the identifiers, the read-through of the NVD, the status job and the CVE, SEC and UN sources, the last three behind the gates Q7, Q4 and Q6; M3 was done on this branch ([the M3 plan](../plans/2026-10-31-vendor-risk-database-m3.md)): the backfill of the label and its script, the re-check of the watched sources and Part B1, which removed the old path and the flag, so that the database is always on and `VENDOR_RESEARCH_RECORDS=false` is the only switch, while Part B2, which drops the `confidence` column, is on `feature/vendor-finding-drop-confidence` for release N+1. The open questions of D7 were **decided on 2026-10-31**: Q4 (`tech@verifywise.ai`), Q5 and Q7 (accepted by the product owner on 2026-10-31, without a separate legal review), Q8, Q9, Q21, Q22 and Q28; the gates Q4 and Q7 are open, and **Q6 is the only gate that stays closed** (the UN's terms allow personal, non-commercial use only, and its permission is not sought); nothing is committed · **Date:** 2026-10-29 · **Branch:** `feature/vendor-agents-and-risk-page`

This document is Phase 1 of the vendor risk database (VRDB) brief: research and design only, deliverables D1 to D8. It extends the vendor research agent of [the 2026-10-11 design](2026-10-11-vendor-research-web-agent-design.md) and of the [performance roadmap](../plans/2026-10-27-vendor-research-agent-performance.md); it replaces neither. No code, migration, configuration or dependency was changed in Phase 1, and this file is the only one created. Phase 2 starts only after approval.

**Evidence.** Every statement about an external source was checked on 2026-10-29 on the operator's own pages and is linked; Appendix A lists what each page established. **UNVERIFIED** marks what could not be checked, most often because the page refused automated readers in this environment; such a cell must not be relied on. **Observed** marks a fact seen in a response header or a small probe, which the operator does not state. Probes were header requests or ranged requests of 100 to 200 bytes; two SEC endpoints ignored the range and sent 0.8 MB and 0.16 MB, which were discarded unread. No list was downloaded.

**Fixed decisions.** The decisions of brief §2 are taken as given and not reopened. Where the brief leaves a product choice open, D7 asks it, with a recommendation; nothing below decides one silently. Where this design changes a ruling of the roadmap (R1–R39), §D4.9 names it.

---

## D1. Current state

1. **One run, one job.** `Servers/services/vendorResearch/pipeline.ts` runs a job of the `vendor-research` queue (`queue.ts`; worker `worker.ts:31`, started by `jobs/worker.ts`). It builds the target (`target.ts`, `identity.ts`, `aliases.ts`: name, `other_names`, website domain), does the routine work (`gather.ts:704` `gatherSources`: vendor pages, code-planned news searches and the public-database lookup, started together), runs one research loop per category (`loops.ts`, `researchAgent.ts`), one analysis call (`analysis.ts`, `prompts.ts`, `schema.ts`), the validation (`validation.ts`), the snippet check (`verifySnippets.ts`), the verifier call (`verifier.ts`: same company, quote supports the claim, inside the window) and the de-duplication (`clusters.ts`, `dedupe.ts`).
2. **One model.** Every call uses the organisation's key (`keySelection.ts`, `settings.service.ts`); `PROMPT_VERSION` is `vr-6` (`prompts.ts:56`).
3. **Web.** `Servers/services/webResearch/`: `guardedFetch.ts` (the page guard; `BOT_USER_AGENT` is `VerifyWiseResearchBot/1.0 (+https://verifywise.ai)`, line 23), `webSession.ts` (ledger and budgets; `addRecords` at 958), the search over the Bing RSS feed (the state of Phase 1: Bing was removed on 2026-10-31, Q21, and a run now searches with Claude web search for an Anthropic key and with the GDELT news index for every other key), `pageText.ts` (title, date, links and the canonical URL, 54–57), caches in Redis.
4. **Records, per run.** `records/index.ts` asks, from the memory of the process, CISA KEV (`kev.ts`: one JSON file, 30-minute memo), the NVD CVE API (`nvd.ts`: `virtualMatchString=cpe:2.3:a:<token>`, critical only, 119-day window, 4 requests per 30 s), Have I Been Pwned (`hibp.ts`), the SEC (`sec.ts`: tickers file, CIK by name, submissions, Form 8-K Item 1.05), the vendor's status page (`statuspage.ts`, `history.atom`) and the OFAC SDN list (`ofac.ts`: `SDN.CSV` and `ALT.CSV` from `sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/`, entities only, 6-hour memo, one 45-second download per process). The lookups of a run share 8 s (`RECORDS_TIMEOUT_MS`, `index.ts:77`). The off switch is `VENDOR_RESEARCH_RECORDS` (`config.ts:56`, on by default, documented in `Servers/.env.example`).
5. **Matching.** `records/match.ts`: exact equality of names compacted to letters and digits (`nameKeys`: the name, the other names, their short forms and the brand of the domain; OFAC uses names only, of 4 characters or more), and `cpeVendorOf` for the NVD. There is no fuzzy match and no identifier but names and the domain (R34, R35, R39).
6. **Records are sources.** Each record enters the ledger first, as a source that was read (`gather.ts:741–746`), in its category (`records/types.ts` `RECORD_CATEGORY`: KEV, NVD, HIBP and SEC are `security_incidents`, the status page `availability`, OFAC `legal_regulatory`), capped by `MAX_RECORDS` (KEV 5, NVD 3, HIBP 3, SEC 3, status page 4, OFAC 2). KEV and NVD records both link to the NVD detail page (`kev.ts:64`).
7. **Source tiers.** `sourceTiers.ts` holds hard-coded lists of 16 regulator and court hosts, 43 aggregator hosts and 81 major-publisher hosts, and the `GOVERNMENT_HOST` suffix pattern (line 90); `tierOf` (276), `publisherKey` (66; `bbc.co.uk` and `bbc.com` give one key) and `corroborationOf` (297: an aggregator is no publisher, the vendor's pages are one).
8. **Confidence.** The model returns `confidence` (`schema.ts:65`; the rule is in `prompts.ts:262–275`). `validation.ts:219` `confidenceCeiling` allows `high` for two or more publishers of which one is in a credible tier, `medium` for two page URLs or one page of the vendor, and `low` otherwise; the stored value is the lower of the model's and the ceiling (`lowerOf`, 204). `verifySnippets.ts:141` sets `low` when the page was read and does not hold the quote, and keeps the value when no page could be read (R26).
9. **Data.** `vendor_research_runs` (category summary, evidence, trace, progress, counts, `prompt_version`) and `vendor_risk_findings` (`confidence VARCHAR(10) CHECK (low, medium, high)` from migration `20261010012217`; `sources JSONB` of `{url, title, quote, published_at}`; `rationale`; `snippet_only`; status and decision columns). The SQL is in `utils/vendorResearch.utils.ts`; a register entry exists only after a person accepts a finding (`findings.service.ts`).
10. **Jobs.** `queue.ts`: the jobs `vendor_research` and the hourly `vendor_research_scan` (`upsertJobScheduler`, pattern `17 * * * *`), scheduled from `jobs/producer.ts:69` with `safeSchedule`; the queue is never emptied (R28).
11. **Tenant isolation.** Every research table has `organization_id` and an entry in `tests/integration/tenant-isolation/tenantIsolation.registry.ts` (144–169). `scripts/auditTenantIsolationCoverage.ts` checks the tables that have `organization_id` against that registry and against a justified `sharedTables` list (36–67: organizations, roles, frameworks, subscription_history, subscriptions, tiers, `*_struct_*`). The feature has no shared table yet.
12. **Client.** `Clients/src/presentation/pages/Vendors/VendorResearchFindings/`: `FindingRow.tsx:198–207` shows a neutral "Confidence" chip (`confidenceLabel` in `application/utils/vendorResearchText.ts`) and, from line 225, the sources (host, date, quote); `RunSummary.tsx` shows the category lines, "Searches: {searches}, pages read: {pages}" (190) and "Last run: {date}" (198). Strings: `Clients/src/i18n/translations.ts` (de, fr, es) and `Servers/locales/{en,de,fr}.json`, whose "Confidence is required" strings belong to AI Detection, not to research.
13. **Evaluation.** `services/vendorResearch/eval/`: 21 replay cases, a scorer with an `overconfident` measure (`scorer.ts:128`: `high` with fewer than two publishers) and `maxOverconfident` targets, and a ratchet test. `npm run eval:vendor-research` replays offline: 21 cases, 0 regressions on 2026-10-29; Appendix B lists the 22 findings the replay keeps.
14. **Docs.** `docs/technical/infrastructure/web-research.md`, `docs/technical/domains/vendors.md`, the 2026-10-11 spec, the 2026-10-27 roadmap with rulings R1–R39, and the user guide page `shared/user-guide-content/content/risk-management/vendor-risks.ts`.

---

## D2. VRDB source inventory

The criteria of brief §2.3, as letters used below: **(a)** official operator, **(b)** keyless public access, **(c)** machine-readable, **(d)** licence allows storage, display of derived data and commercial use, **(e)** stability (documented cadence, stable ids), **(f)** linkable to an organisation or its products.

### D2.0 Summary

| # | Source | a | b | c | d | e | f | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | CISA Known Exploited Vulnerabilities | yes | yes | yes | yes (CC0) | yes, by diff | product names | **MVP, mirror** |
| 2 | OFAC SDN list | yes | yes | yes | accepted (Q5, 2026-10-31) | partly, by diff | names only (weak) | **MVP, mirror** |
| 3 | UK Sanctions List (FCDO) | yes | yes | yes | yes (OGL) | partly, by diff | names, website, registration numbers | **MVP, mirror** |
| 4 | EU consolidated financial sanctions (FSF) | yes | fixed public token (Q2) | yes | yes, Decision text unread | partly, by diff | names, identification numbers | **MVP if Q2 is yes**, else later |
| 5 | UN Security Council Consolidated List | yes | yes | yes | no (personal, non-commercial use only; Q6) | yes, by diff | names | **Reject** (Q6); covered by the UK and EU lists |
| 6 | CVE Program records (cvelistV5) | yes | yes | yes | grant with notice; accepted (Q7, 2026-10-31) | yes | vendor and product | **M2, mirror; built, gate open (Q7)** |
| 7 | NVD CVE API 2.0 | yes | yes | yes | yes, with notice | partly (policy changed 2026-04-15) | CPE vendor | **M2, read-through; built** |
| 8 | SEC EDGAR submissions | yes | yes, with a declared User-Agent (`tech@verifywise.ai`, Q4) | yes | yes | yes | CIK by name (weak until a CIK is stored, Q3) | **M2, read-through; built, gate open (Q4)** |
| 9 | World Bank debarred firms | yes | no documented form | no | no (non-commercial terms) | partly | names | **Reject** |
| 10 | ICO, EDPB, CNIL enforcement | yes | yes | no record feed | yes | no | partly | **Reject** (their pages stay OFFICIAL web sources) |
| 11 | FTC cases, HHS OCR breach portal | yes | yes | partly | partly | UNVERIFIED | names | **Later / watch** |
| 12 | EU database of high-risk AI systems (Art. 71) | yes | — | — | — | not live | — | **Watch** |
| 13 | SAM.gov exclusions | yes | no (API key) | yes | — | yes | yes | **Excluded** |

### D2.1 CISA Known Exploited Vulnerabilities (KEV)

| Field | Value |
|---|---|
| Operator | CISA, US Department of Homeland Security, a federal agency that maintains the authoritative list of vulnerabilities exploited in the wild ([catalog page](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)). |
| Category · level | `security_incidents` · product: an exploited vulnerability in a product of the vendor. |
| Endpoint, format | JSON `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`, CSV `https://www.cisa.gov/sites/default/files/csv/known_exploited_vulnerabilities.csv`, schema `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities_schema.json` ([catalog page](https://www.cisa.gov/known-exploited-vulnerabilities-catalog), mirror [cisagov/kev-data](https://github.com/cisagov/kev-data)). Observed: 1.8 MB, `ETag` and `Last-Modified` headers. |
| Auth, limits | None. No rate limit or bulk-download guidance is documented (UNVERIFIED that none applies). |
| Cadence, increments | The mirror is updated whenever the catalog is, on weekdays in US Eastern business hours ([kev-data](https://github.com/cisagov/kev-data)). There is no delta file, no per-entry modification date and no removal marker ([schema](https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities_schema.json)), so changes are found by comparing snapshots. Removals are rare and announced ([2023-10-04](https://www.cisa.gov/news-events/alerts/2023/10/04/cisa-adds-two-known-exploited-vulnerabilities-catalog-removes-five-kevs), [2023-12-01](https://www.cisa.gov/news-events/alerts/2023/12/01/cisa-removes-one-known-exploited-vulnerability-catalog)). |
| Licence | CC0 1.0; commercial use allowed; no attribution required; the CISA logo and the DHS seal are not licensed ([licence](https://www.cisa.gov/sites/default/files/licenses/kev/license.txt)). We name the source anyway. |
| Identifiers | `cveID` (the record id), `vendorProject`, `product` (free text), `vulnerabilityName`, `dateAdded`, `shortDescription`, `requiredAction`, `dueDate`, `knownRansomwareCampaignUse`, `notes`, `cwes`; no CPE or package URL ([schema](https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities_schema.json)). The schema may gain fields, so the parser ignores unknown ones. |
| Match | `vendorProject` equal to a name key of the vendor: strong (brief §2.6). |
| Verdict | **MVP, mirror.** Built in M1; the connector read the real file on 2026-10-31 (1,766 records, 0 errors). It trims the free-text fields, and counts one error when the catalog's own `count` is a number that differs from the length of its list, so that a list cut short with its count intact does not mark live records withdrawn. |

### D2.2 OFAC Specially Designated Nationals (SDN) list

| Field | Value |
|---|---|
| Operator | US Treasury, Office of Foreign Assets Control. The Sanctions List Service is its primary application for list files ([other lists](https://ofac.treasury.gov/other-ofac-sanctions-lists)). |
| Category · level | `legal_regulatory` · vendor; entities only (people, vessels and aircraft are skipped, as today). |
| Endpoint, format | Files under `https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/`. The [SDN page](https://sanctionslist.ofac.treas.gov/Home/static/sdn.html) labels them `SDN.CSV`, `SDN_ALT.CSV`, `SDN_ADD.CSV`, `SDN_COMMENTS.CSV`, `SDN.XML`, `SDN_ADVANCED.XML`, `SDN_ENHANCED.XML`, `SDN_XML.ZIP`, but its own links point at another host. Observed on 2026-10-29: `ALT.CSV`, the path `ofac.ts` uses, answers a ranged GET with 206 `text/csv` after a redirect; `SDN_ALT.CSV` answers 200 with an empty body; HEAD answers are unreliable. The CSV files have no header row and write `-0-` for an empty field ([data spec](https://ofac.treasury.gov/media/29976/download?inline=), [flat-file tutorial](https://ofac.treasury.gov/sdn-list-data-formats-data-schemas/tutorial-on-the-use-of-list-related-legacy-flat-files)). |
| Auth, limits | No key or login for the files. No rate limit is documented. OFAC gives no advice on designing an automated download; it notes that many institutions schedule one and should re-evaluate the schedule now and then, since the lists change ever faster ([FAQ 88](https://ofac.treasury.gov/faqs/88)). It advises using the comprehensive data files and refreshing the list completely ([FAQ 90](https://ofac.treasury.gov/faqs/90)); its search tool is not for automated use ([FAQ 287](https://ofac.treasury.gov/faqs/287)). |
| Cadence, increments | No timetable: names are added or removed as needed ([FAQ 20](https://ofac.treasury.gov/faqs/20)); Recent Actions lists sanctions list updates on 11 days of October 2026, the latest on the 28th ([recent actions](https://ofac.treasury.gov/recent-actions)). A delta file exists ([FAQ 90](https://ofac.treasury.gov/faqs/90); `https://sanctionslistservice.ofac.treas.gov/changes/latest`); its format is UNVERIFIED. The files keep no history ([archive of changes](https://ofac.treasury.gov/specially-designated-nationals-list-sdn-list/archive-of-changes-to-the-sdn-list)), and a Recent Actions notice describes removals in its text (for a clerical update it may give only a list of UIDs: [FAQ 1031](https://ofac.treasury.gov/faqs/1031)), so removals are found by comparing snapshots. |
| Licence | **UNVERIFIED as a licence.** No page of OFAC or the Treasury says anything about copying or reuse; the [privacy policy](https://home.treasury.gov/subfooter/privacy-policy) has only a no-warranty disclaimer, and the [site policies](https://home.treasury.gov/subfooter/site-policies-and-notices) nothing. Under 17 U.S.C. §105, "Copyright protection under this title is not available for any work of the United States Government" ([copyright.gov](https://www.copyright.gov/title17/92chap1.html)); whether the files are such works is a legal reading (Q5). The data spec says the Federal Register governs where the two differ. OFAC does not confirm potential matches or false positives ([FAQ topic](https://ofac.treasury.gov/faqs/topic/1591)). |
| Identifiers | `ent_num` (the unique listing number; the tutorial's general rule is that such numbers are not reused), `SDN_Name`, `SDN_Type`, `Program`, `Title`, `Remarks`; aliases in the ALT file (`ent_num`, `alt_num`, `alt_type`, `alt_name`, `alt_remarks`), addresses in the ADD file. A registration number appears only as free text in `Remarks`. |
| Match | Name only: weak (Low, with the note). |
| Verdict | **MVP, mirror** (the brief puts OFAC in the MVP), with Q5 answered before the flag is on by default. |

### D2.3 UK Sanctions List

| Field | Value |
|---|---|
| Operator | Foreign, Commonwealth and Development Office. **The brief's claim is VERIFIED:** the UK Sanctions List is now the only source of UK sanctions designations, and the OFSI Consolidated List of Asset Freeze Targets closed on Wednesday 28 January 2026 and is no longer updated ([GOV.UK](https://www.gov.uk/government/publications/the-uk-sanctions-list)). |
| Category · level | `legal_regulatory` · vendor; entities only (individuals and ships are skipped). |
| Endpoint, format | `https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml`, also `.csv`, `.ods`, `.odt`, `.html`, `.txt` and `.pdf` ([GOV.UK](https://www.gov.uk/government/publications/the-uk-sanctions-list)); schema [XSD 4.33.3](https://assets.publishing.service.gov.uk/media/6916e72cdb01ecfcf96fc96b/SanctionsListSchema-4.33.3.xsd); [format guide](https://www.gov.uk/guidance/format-guide-for-the-uk-sanctions-list). Observed: XML 22 MB, CSV 50 MB, `ETag` and `Last-Modified` headers. |
| Auth, limits | None documented; anonymous 200 observed. No rate limit is documented (UNVERIFIED). |
| Cadence, increments | Not documented; e-mail alerts are offered, and the files were observed regenerated on the day of a change. The page's log lists delistings per regime; the XSD has no status element, and no page says whether a delisted entry leaves the files (UNVERIFIED), so the mirror compares snapshots. The existing file types (ODT, ODS, XML, HTML) did not change with the move to one list; TXT, CSV and PDF were added, and the URLs of all seven are static, the same however often the list is refreshed ([single list guidance](https://www.gov.uk/guidance/moving-to-a-single-list-for-uk-sanctions-designations-28-january-2026)); the format guide was published on 22 December 2025. |
| Licence | Open Government Licence v3.0 "except where otherwise stated" ([GOV.UK](https://www.gov.uk/government/publications/the-uk-sanctions-list)); the OGL allows commercial use with attribution and does not license personal data ([OGL](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)). |
| Identifiers | `Unique ID` (XML `UniqueID`; one designated person can have one per regime), `OFSI Group ID` (only for entries made before 28 January 2026), the type (Individual, Entity, Ship), `Name 1` to `Name 6` with a name type (primary name, variation, alias), addresses, `Website`, `Email address`, `Business registration number (s)` (free text), `Type of entity`, `Parent Company`, `UN Reference Number`, `Date Designated`, `Last Updated`; no LEI ([format guide](https://www.gov.uk/guidance/format-guide-for-the-uk-sanctions-list)). |
| Match | Name only: weak. The host of `Website` equal to the vendor's verified domain: strong (verified domain, §2.6). A registration number equal to one stored for the vendor (Q1): strong. |
| Verdict | **MVP, mirror.** Built in M1; the connector read the real file of 2026-10-30 on 2026-10-31 (1,667 entities, 0 errors). A designation that the UN made shows its UN reference number (`UNReferenceNumber`) in its text, never as a key; an e-mail address typed into the Website field names a mailbox and gives no domain key; a designation whose kind is missing or unknown counts as one error, so that a renamed kind fails the sync and does not delist entities unseen. |

### D2.4 EU consolidated list of financial sanctions (FSF)

| Field | Value |
|---|---|
| Operator | European Commission, DG FISMA ([overview](https://finance.ec.europa.eu/eu-and-world/sanctions-restrictive-measures/overview-sanctions-and-related-resources_en)). |
| Category · level | `legal_regulatory` · vendor; enterprises only (classification code `E`; persons, `P`, are skipped). |
| Endpoint, format | `https://webgate.ec.europa.eu/fsd/fsf/public/files/<file>/content?token=<value>`, where `<file>` is `xmlFullSanctionsList_1_1`, `xmlFullSanctionsList`, `csvFullSanctionsList_1_1`, `csvFullSanctionsList`, `pdfFullSanctionsList`, `xsdFullSanctionsList_1_1` or `xsdFullSanctionsList`; observed sizes 19 to 26 MB. The URLs are listed in the operator's [RSS feed](https://webgate.ec.europa.eu/fsd/fsf/public/rss) and in the [data.europa.eu record](https://data.europa.eu/api/hub/search/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions). |
| Auth | No account or login, but every file URL carries a fixed `token` parameter (403 without it). The value is printed in those public pages, is the same for everyone, and no page promises that it will not change. Whether that is keyless is Q2. This document does not repeat the value. |
| Cadence, increments | Daily, per the metadata; the files lag the Official Journal; on 29 October the newest were dated 23 October 2026. None of the distributions is a delta (a legacy page describes a `DELTA.XML`; whether it still exists is UNVERIFIED), so the mirror compares snapshots; entries carry a `delistingDate`. |
| Licence | The data.europa.eu record gives the "European Commission reuse notice" (Decision 2011/833/EU) for most files and CC BY 4.0 for CSV 1.0; the Commission's [legal notice](https://commission.europa.eu/legal-notice_en) gives CC BY 4.0 with "© European Union". The Decision's own text could not be read here (UNVERIFIED). Only the Official Journal is authentic. |
| Identifiers | `logicalId` (kept from the previous database, so stable), `euReferenceNumber`, `unitedNationId`, `designationDate`, `delistingDate`, `nameAlias` `wholeName`, `regulation` `programme`, `identification` `number` and `identificationTypeCode` (optional) ([XSD 1.1](https://webgate.ec.europa.eu/fsd/fsf/public/rss)). |
| Match | Name only: weak. An identification number equal to one stored for the vendor (Q1): strong. |
| Verdict | **MVP, mirror** (Q2 was yes). The connector reads the file URLs from the operator's RSS feed at every sync, so that no token is kept in our code or configuration. Checked on 2026-10-31: the XSD 1.1 was read (16,116 bytes) and the file generated on 2026-10-23 (6,269 entries, 1,779 enterprises) holds all 11 attribute paths and 6 element paths that the connector reads. `unitedNationId` is filled on 23 enterprises only; the UN reference number is shown in the text, never as a key. |

### D2.5 UN Security Council Consolidated List

| Field | Value |
|---|---|
| Operator | UN Security Council, through its Secretariat; intergovernmental ([list page](https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list), read in the browser pane because automated readers were refused). |
| Category · level | `legal_regulatory` · vendor; the entities section (274 entities on 2026-10-29). |
| Endpoint, format | XML ordered by reference number `https://scsanctions.un.org/resources/xml/en/consolidated.xml`, alphabetical `https://scsanctions.un.org/resources/xml/en/name/consolidated.xml`; HTML and PDF at `https://scsanctions.un.org/consolidated` and `https://scsanctions.un.org/r` (all linked from the list page). Observed: a ranged GET answers 206 `application/xml` after a redirect; HEAD answers 404. Observed on 2026-10-31: the XML address answers 302 to a time-limited address on `unsolprodfiles.blob.core.windows.net` (blob `consolidatedLegacyByPRN.xml`), then 200 `application/xml`, 2.2 MB, with `ETag`, `Last-Modified` and `Cache-Control: public, max-age=28800`; the HTML list redirects the same way and has no anchor per entry; the schema the file names (`https://www.un.org/sc/resources/sc-sanctions.xsd`) answered 403. |
| Auth, limits | None documented, and none needed for the GET (observed). |
| Cadence, increments | The page gives the date of the last update (29 October 2026) and says a press release follows every change. No delta is documented, so the mirror compares snapshots. |
| Licence | **No: personal, non-commercial use only (Q6, read on 2026-10-31).** The [terms of use](https://www.un.org/en/about-us/terms-of-use) let a user download and copy material for personal, non-commercial use only, without the right to resell, redistribute, compile or create derivative works, subject to more specific restrictions, and a waiver binds the UN only in writing. The [copyright](https://www.un.org/en/about-us/copyright) page reserves all rights: any other use, storage in a retrieval system included, needs the publisher's written permission. UN Publications' [rights and permissions](https://shop.un.org/rights-permissions) page asks for written permission to reuse content from a UN online platform or database (through the Copyright Clearance Center or permissions@un.org; a fee may apply). The list page, the HTML list and the XML state no more specific terms. |
| Identifiers | Permanent reference number (for example `QDe.001`, where `e` marks an entity), name, name in the original script, a.k.a., f.k.a., address, listed on, other information. Checked against the file on 2026-10-31: `DATAID`, `FIRST_NAME` (the name), `UN_LIST_TYPE`, `REFERENCE_NUMBER`, `LISTED_ON`, `COMMENTS1`, `ENTITY_ALIAS` (`QUALITY` a.k.a. or f.k.a., `ALIAS_NAME`), `ENTITY_ADDRESS` (`COUNTRY` and others), and on some entities `NAME_ORIGINAL_SCRIPT`, `LAST_DAY_UPDATED`, `LAST_REVIEWED_ON` and `INTERPOL_LINK`. |
| Overlap | Checked on 2026-10-31 against the files of 2026-10-30 (UN, UK) and 2026-10-23 (EU). The UK Sanctions List holds all 274 UN entities: 269 carry their UN reference number (`UNReferenceNumber`; two write `QDE.`), three have an equal name without it, one a near-identical spelling, and one is a ship designation. The EU list holds 244 by UN reference or equal name and 26 more under a near-identical spelling, but fills `unitedNationId` on 23 enterprises only. By the connectors' own name keys, the UK copy shares a key with 262 UN entities, the EU copy with 245, and either with 269. |
| Verdict | **Reject** (d), answered on 2026-10-31 (Q6): the gate stays closed and opens only with the UN's written permission, which is not sought. The connector, built in M2 and checked against the real file (274 entities, no error), stays behind it. The UN's designations reach a run through the UK and EU lists, whose records show the UN reference number. Should the gate ever open, the citation of an entry is the list page `https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list` with `?referenceNumber=`, since the HTML list has no anchor per entry and the XML is served from a time-limited address. |

### D2.6 CVE Program records (cvelistV5)

| Field | Value |
|---|---|
| Operator | The CVE Program, sponsored by CISA; the records are © The MITRE Corporation ([terms](https://www.cve.org/Legal/TermsOfUse)); a recognised public programme (brief §2.3). |
| Category · level | `security_incidents` · product. |
| Endpoint, format | [CVEProject/cvelistV5](https://github.com/CVEProject/cvelistV5): one JSON file per record under `cves/<year>/<n>xxx/`, plus `cves/delta.json` and `cves/deltaLog.json` (rolling 30 days; observed 35 MB), and hourly delta and daily baseline zip files as release assets (observed baseline 646 MB) ([README](https://raw.githubusercontent.com/CVEProject/cvelistV5/main/README.md)); record format 5.2.0 ([schema](https://raw.githubusercontent.com/CVEProject/cve-schema/main/schema/CVE_Record_Format.json)). Asset names are irregular (a doubled `.zip`, a baseline dated a day before its tag), so a connector reads the release's list of assets instead of building names. |
| Auth, limits | Anonymous download (observed). No rate limit is documented by the programme (UNVERIFIED; GitHub's own limits were not checked). |
| Cadence | Updated about every 7 minutes from CVE Services ([README](https://raw.githubusercontent.com/CVEProject/cvelistV5/main/README.md)). |
| Licence | MITRE grants a perpetual, worldwide, no-charge, royalty-free, irrevocable copyright licence to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense and distribute CVE, and its only condition is that every copy reproduces MITRE's copyright designation and the licence ([terms](https://www.cve.org/Legal/TermsOfUse), read on 2026-10-31 from the page's bundle). There is no commercial-use or field-of-use limit; trademarks are outside the grant. **Accepted by the product owner on 2026-10-31 (Q7), without a separate legal review.** |
| Identifiers | The CVE id; `cveMetadata.state` (`PUBLISHED` or `REJECTED`) and `dateRejected` (a rejected record stays on the list so that users know it is invalid, and should be ignored: [FAQs](https://www.cve.org/ResourcesSupport/FAQs)); `containers.cna.affected[]` `vendor` and `product` (free text; `vendor` may be "N/A"), optional `cpes` and `packageURL`. |
| Verdict | **M2, mirror**: the source of `REJECTED` and of vendor and product matching where the NVD has no CPE data (Risk G). Built; the gate Q7 has been open since 2026-10-31. Observed that day on the real data: the baseline is 648,475,703 bytes with 417,486 records and 0 unreadable, and the copy of our subset is 34,853 rows; the hourly deltas are cumulative, so a day without an end-of-day release is read from its last hourly release. |

### D2.7 NVD CVE API 2.0

| Field | Value |
|---|---|
| Operator | NIST, US Department of Commerce. |
| Category · level | `security_incidents` · product. |
| Endpoint, format | `https://services.nvd.nist.gov/rest/json/cves/2.0` ([API](https://nvd.nist.gov/developers/vulnerabilities)): `virtualMatchString`, `cvssV3Severity` (LOW, MEDIUM, HIGH, CRITICAL), `pubStartDate`/`pubEndDate` and `lastModStartDate`/`lastModEndDate` (both ends required, at most 120 consecutive days), `hasKev`, `resultsPerPage` (at most 2,000); the response has `vulnStatus`, `configurations` and `affected`. |
| Auth, limits | No key needed. Without a key, 5 requests in a rolling 30-second window (50 with a key, which needs a request with an organisation and an e-mail and is not used); a sleep of 6 seconds between requests is advised ([start here](https://nvd.nist.gov/developers/start-here)). |
| Cadence | The NVD processes the CVE List every hour ([FAQ](https://nvd.nist.gov/general/FAQ-Sections/General-FAQs)). **The brief's claim is VERIFIED:** since 15 April 2026 enrichment goes first to CVEs in KEV (goal: one business day), to software used by the federal government and to critical software under EO 14028; other CVEs are "Lowest Priority - not scheduled for immediate enrichment"; unenriched CVEs published before 1 March 2026 are "Not Scheduled" (`vulnStatus` `Deferred`) ([NVD](https://www.nist.gov/itl/nvd), [NIST news](https://www.nist.gov/news-events/news/2026/04/nist-updates-nvd-operations-address-record-cve-growth), [status](https://nvd.nist.gov/vuln/vulnerability-status)). CPE applicability statements come from enrichment ([process](https://nvd.nist.gov/general/cve-process)), so `virtualMatchString` finds only enriched CVEs; how `Deferred` records answer is UNVERIFIED. Since 2026-06-17 records carry the CVE record's `affected` lists, but no parameter filters on them. |
| Licence | Public domain ([NIST](https://www.nist.gov/copyrights-disclaimers)). Services are asked to display: "This product uses data from the NVD API but is not endorsed or certified by the NVD." ([start here](https://nvd.nist.gov/developers/start-here); the [terms](https://nvd.nist.gov/developers/request-an-api-key) word it slightly differently). Modified content must not be attributed to the NVD. |
| Match | A CPE vendor token equal to the vendor's: strong. |
| Verdict | **Later (M2), read-through.** Today's per-run lookup stays until then. |

### D2.8 SEC EDGAR

| Field | Value |
|---|---|
| Operator | US Securities and Exchange Commission. |
| Category · level | `security_incidents` · vendor: Form 8-K Item 1.05 reports a material cybersecurity incident of the registrant, generally four business days after the registrant determines it is material ([SEC](https://www.sec.gov/newsroom/press-releases/2023-139)). |
| Endpoint, format | `https://data.sec.gov/submissions/CIK##########.json` (10-digit CIK) and `https://www.sec.gov/files/company_tickers.json`; the APIs need no authentication or API key ([EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)). |
| Limits, User-Agent | At most 10 requests per second for all of a user's machines together; the SEC asks clients to declare a User-Agent such as `Sample Company Name AdminContact@<sample company domain>.com` ([accessing EDGAR data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data)). Observed: requests without a User-Agent get 403; ours, which had no e-mail, got 200 on 2026-10-29. Since 2026-10-31 the User-Agent is `VerifyWise tech@verifywise.ai` (Q4), the SEC's form exactly, on every request to the SEC, the reading of a filing's text included. |
| Cadence | Submissions update in real time; a bulk zip is built nightly. |
| Licence | Government-created content and EDGAR filings are free to reuse without the SEC's permission; cite the SEC; no seal or logos ([webmaster FAQ](https://www.sec.gov/about/webmaster-frequently-asked-questions)). |
| Identifiers | The CIK; tickers, exchanges and former names, in prose. The SEC's pages do not document the JSON keys (`items`, `website`, `ein`, …), so a CIK found by name cannot be confirmed from the documentation (UNVERIFIED). |
| Match | A CIK found by name alone (R35): weak until Q3. |
| Verdict | **M2, read-through**; built. Q4 was decided on 2026-10-31 and the gate is open. The folder of a filing belongs to every party that files about the company, so the filer is read from the filing's SGML header (Q28). |

### D2.9 World Bank Listing of Ineligible Firms and Individuals

| Field | Value |
|---|---|
| Operator | World Bank Group ([list page](https://www.worldbank.org/en/projects-operations/procurement/debarred-firms)). |
| Category · level | `legal_regulatory` · vendor. |
| Access | A web page whose table a script loads; no documented API, CSV or Excel download and no data catalog entry was found (UNVERIFIED that none exists). A third party reports an internal endpoint called with a key embedded in the page: undocumented, and not keyless by our rule. The page says the list updates every 3 hours. |
| Licence | The site's terms allow non-commercial use only and forbid derivative works and commercial use without written consent, unless specific terms such as the Data Catalog's CC BY 4.0 apply ([terms](https://www.worldbank.org/en/about/legal/terms-and-conditions), [dataset terms](https://www.worldbank.org/ext/en/legal/terms-conditions/datasets)). |
| Verdict | **Reject** (b, c, d). Its pages remain citable web sources. |

### D2.10 Regulators' enforcement

| Operator | What exists | Licence | Verdict |
|---|---|---|---|
| UK ICO | A listing of enforcement notices, reprimands, penalties and prosecutions (the organisation in the title, no reference number); the enforcement RSS feed "is currently unavailable"; no documented dataset; notices, penalties and undertakings stay on the site for two years ([enforcement](https://ico.org.uk/action-weve-taken/enforcement/), [retention](https://ico.org.uk/action-weve-taken/retention-period-for-undertakings-enforcement-notices-and-civil-monetary-penalties/)). | OGL v3.0 for text ([re-use](https://ico.org.uk/global/copyright-and-re-use-of-materials/)). | **Reject** for the VRDB; `ico.org.uk` stays OFFICIAL in the registry. |
| EDPB | The register of Article 60 final decisions: ids such as `EDPBI:LU:OSS:D:2026:4243`, PDF decisions, no controller field, legal persons left out by many authorities ([register](https://www.edpb.europa.eu/our-work-tools/consistency-findings/register-for-article-60-final-decisions_en)); national news, whose titles name companies, with a feed at `https://www.edpb.europa.eu/feed/news_en` (observed) ([national news](https://www.edpb.europa.eu/news/national-news_en)). | Reuse allowed for commercial and non-commercial purposes, with credit ([copyright](https://www.edpb.europa.eu/copyright_en)). | **Reject** (register); the news feed is **watch** (news items, not records). |
| CNIL | The data.gouv.fr dataset of CNIL sanctions holds yearly counts, no organisations ([dataset](https://www.data.gouv.fr/fr/datasets/sanctions-prononcees-par-la-cnil/)); the monthly archive of deliberations may include sanctions (UNVERIFIED); a sanctioned organisation stops being named after a period ([CNIL](https://www.cnil.fr/fr/donnees-de-sante-et-utilisation-des-cookies-doctissimo-sanctionne-par-une-amende-de-380-000-euros)). | Licence Ouverte 2.0 ([Etalab](https://www.data.gouv.fr/pages/legal/licences/etalab-2.0)). | **Reject**. |
| US FTC | The Legal Library lists 6,124 cases with their FTC matter or file numbers and civil action numbers ([cases](https://www.ftc.gov/legal-library/browse/cases-proceedings)); RSS feeds cover press releases ([feeds](https://www.ftc.gov/news-events/stay-connected/ftc-rss-feeds)); the API covers only Do Not Call complaints and HSR notices and needs an api.data.gov key ([developer](https://www.ftc.gov/developer)); CSV datasets exist for some enforcement actions (`MatterName`, `MatterNumber`, `MatterEnforcementDate`, `MatterHyperlink`; no cadence stated) ([data sets](https://www.ftc.gov/policy-notices/open-government/data-sets)). | Most material is a work of the US Government ([website policy](https://www.ftc.gov/policy-notices/website-policy)). | **Watch** (whether the datasets cover privacy and data-security cases is UNVERIFIED). |
| US HHS OCR | The breach portal lists breaches affecting 500 or more individuals reported in the last 24 months (761 on 2026-10-29): name of covered entity, state, entity type, individuals affected, submission date, type of breach and more; the CSV, XML, Excel and PDF exports are driven by the page's script, with no stable URL; no record id ([portal](https://ocrportal.hhs.gov/ocr/breach/breach_report_hip.jsf)). | Terms not found (hhs.gov answered 403; UNVERIFIED). | **Later**, if a stable export and terms appear. |

### D2.11 EU database of high-risk AI systems (Article 71)

The Commission sets up and maintains it; registrations under Article 49 are public apart from a secure section, and the information should be machine-readable ([Art. 71](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-71), [Art. 49](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-49), [Annex VIII](https://ai-act-service-desk.ec.europa.eu/en/ai-act/annex-8)). No page read says it is live or gives a URL, an API or an export. Article 113 as amended by the AI Omnibus (in force since 27 July 2026) applies the high-risk obligations of Annex III from 2 December 2027 and of Annex I from 2 August 2028 ([Art. 113](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-113), [Omnibus](https://digital-strategy.ec.europa.eu/en/news/ai-omnibus-enters-force)). **Watch**; check again after 2 December 2027. It would serve `ai_specific`, at provider level.

### D2.12 Excluded by the keyless rule

- **SAM.gov exclusions**: the Exclusions API needs an API key from a SAM.gov account, and the extracts need an account and a key ([Exclusions API](https://open.gsa.gov/api/exclusions-api/), [extracts](https://open.gsa.gov/api/sam-entity-extracts-api/)).
- **The NVD with a key**: we keep to the public limit.
- **The FTC API**: an api.data.gov key, and no case data anyway.
- **The World Bank's internal endpoint**: undocumented, with a key embedded in its page.

### D2.13 Not VRDB sources by decision

Have I Been Pwned stays a lookup (category UNVERIFIED) and the status page stays a lookup (category VENDOR), as brief §2.8 fixes; aggregators such as OpenSanctions, OpenCorporates and the AI Incident Database are excluded by §2.3 and were not evaluated.

---

## D3. Source category registry v0

### D3.1 Format

The registry is data in the repository, reviewed in pull requests: `Servers/services/vendorResearch/sourceRegistry/entries.ts`, a typed list, and a version `REGISTRY_VERSION` stored with every run so that a label can be reproduced. An entry:

The version at the end of Phase 2 is `sr-5`, with 113 entries. `sr-1` is the registry of this section; `sr-2` adds the user content of G11 and the documents others file with an authority (Q25, Q26); `sr-3` closes the other addresses of those documents; `sr-4` makes an EDGAR filing under the vendor's stored CIK the vendor's own word. **`sr-5` (2026-10-31) answers three questions.** Q8: the pattern that took any `gov`, `govt`, `gouv`, `gob` or `gv` label before a country code for a government's is gone, since 87% of the 1,240 names it matched were ordinary registrations; a government domain is official only when a page of its registry, its regulator or its holder was read, and the entries that were read are explicit hosts (`.mil` at V; `gc.ca`, `gov.br`, `go.id`, `go.th` and `go.tz` at V; `bund.de` at P; twelve exact label pairs, `gov.co` and `gov.fi` among them at P); `govt.nz`, `go.ke`, `go.ug`, `gov.ug` and `gov.ie` have no entry, so their hosts are unknown until a person reads their rule. Q9: a page counts as evidence for a publisher only when its site's `robots.txt` does not bar Anthropic's agents. Q28: an EDGAR filing under the stored CIK is the vendor's own word only when the filing's header names that CIK as a filer, a filer on behalf of another or a reporting owner. `sr-5` also widens rule V (the section of a vendor's page is read after a locale and after `company`, `about`, `about-us` or `corporate`).

```ts
interface RegistryEntry {
  id: string; // "reuters"
  hosts: string[]; // registrable domains; a host matches itself and its subdomains
  suffix?: true; // the hosts are reviewed public suffixes such as "gov.uk"
  category: "official" | "trusted_press" | "vendor" | "unverified";
  flags?: Array<"syndicated" | "downgrade" | "blocked">;
  downgrade?: Array<{ host?: string; pathSegment?: string; slugPrefix?: string; slugSuffix?: string }>;
  publisher?: string; // display name, and the key of independence: "BBC" for bbc.com and bbc.co.uk
  syndicatedFrom?: "canonical" | "issuer"; // how a copy is credited (D5.2)
  reason: string; // one line
  evidence: Array<{ url: string; status: "verified" | "partial" | "snippet" | "unverified" }>;
  reviewed: string; // "2026-10-29"
}
```

Evidence status: **V** verified (the page that supports the reason was read), **P** partial (the operator's own pages were read, but they do not state one of the criteria), **S** snippet (only a search engine's summary of the page), **U** unverified (no page of the operator could be read here).

### D3.2 Classification order

Deterministic, without a model, first match wins:

1. **User content** → UNVERIFIED, on any host and before the vendor's own domains (Q25): rule G11 (community and forum hosts and sections), and the platforms of G6–G9, except the vendor's own subdomain of a platform (a blog at `acme.substack.com`), which stays VENDOR.
2. The **vendor's own domains**: the registrable domain of `vendors.website`, its subdomains, the domain its home page moved to (R38), and the status page hosts that `statuspage.ts` confirmed → VENDOR.
3. **BLOCKED** entries → the source never enters the pack; the trace counts it.
4. A **DOWNGRADE** rule of the matching entry, or the generic rule G1 on a TRUSTED_PRESS host → UNVERIFIED, with the reason kept.
5. The **most specific host entry** (the longest matching host).
6. A **suffix rule**.
7. Otherwise **UNVERIFIED**, marked unreviewed.

Step 1's known limit: a vendor that runs one of the platforms of G6–G9 (LinkedIn, Medium, Reddit) has no VENDOR source on it, so its own pages there are Low. Code hosts such as `github.com` are not in the registry and keep today's behaviour until the review of unknown hosts (D3.3) decides them.

A VRDB record is classified by its source (`vrdb_sources.id` → OFFICIAL, with the operator as publisher), never by the host of its link: KEV records link to `nvd.nist.gov`.

### D3.3 Unknown hosts

- An unknown host is UNVERIFIED and marked `unreviewed` on the source.
- The run's trace lists the unreviewed hosts that findings cite; the coverage block counts them under "unverified".
- A maintainer script (M2) lists the most cited unreviewed hosts across runs, hostnames and counts only, as input to the registry review.
- An entry is added only by a pull request with a reason, an evidence link and a review date, and every change bumps `REGISTRY_VERSION`. A model never proposes or decides an entry (brief §2.1).
- Every entry is reviewed again within 12 months of its date; the hygiene test (D6.3) prints entries older than 12 months and fails on entries older than 18 (Q18).

### D3.4 Entries

112 entries: 22 OFFICIAL, 79 TRUSTED_PRESS, and 11 rules and groups. That is more than the 60 to 100 the brief suggests because today's lists alone hold 140 hosts and leaving any out would change behaviour; entries are grouped where the reason is the same. All entries have the review date 2026-10-29, except O21, O22 and G11 and the DOWNGRADE of O20, added on 2026-10-30 for Q25 and Q26.

**OFFICIAL**

| # | Hosts | Reason | Evidence | St. |
|---|---|---|---|---|
| O1 | `.gov` (suffix) | Only verified US government organisations: federal, state, territory, tribal and local | [get.gov](https://get.gov/domains/eligibility/) | V |
| O2 | `.mil` (suffix) | US military; only the IANA record could be read | [IANA](https://www.iana.org/domains/root/db/mil.html) | U |
| O3 | `.int` (suffix) | Intergovernmental organisations established by treaty | [IANA policy](https://www.iana.org/domains/int/policy) | V |
| O4 | `gov.uk`, `gov.scot`, `gov.wales` (suffix) | UK, Scottish and Welsh public sector only | [gov.uk](https://www.gov.uk/guidance/check-if-your-organisation-can-get-a-govuk-domain-name), [gov.scot](https://www.gov.scot/publications/govscot-domains/), [gov.wales](https://www.gov.wales/policy-registering-and-running-llywcymru-and-govwales-domains-html) | V |
| O5 | `gouv.fr` (suffix) | Reserved for the French government (Afnic naming charter, art. 2.5) | [Afnic](https://www.afnic.fr/wp-media/uploads/2026/07/afnic-charte-de-nommage-06-07-2026.pdf) | V |
| O6 | `europa.eu` (suffix) | Mainly EU institutions, bodies and agencies; exceptions need approval | [Commission](https://commission.europa.eu/resources/europa-web-guide/governance-europa-domain/europa-domain-and-subdomains/europa-domain-and-subdomains-overview_en) | V (not absolute) |
| O7 | `gov.au`, `gov.in`, `gob.es`, `gob.mx`, `go.jp`, `go.kr` (suffix) | Government second-level domains restricted by their registries | [auDA](https://www.auda.org.au/au-domain-names/the-different-au-domain-names/gov-au-domain-names/), [MeitY](https://registry.gov.in/pdfdocs/Gov.In_Guidelines.pdf), [BOE](https://www.boe.es/eli/es/o/2005/05/19/itc1542), [NIC México](https://www.dominios.mx/dominios-gob-mx/), [JPRS](https://jprs.jp/about/jp-dom/spec/), [KRNIC](https://krnic.or.kr/jsp/resources/domainInfo/krDomainInfo.jsp) | V |
| O8 | `admin.ch`, `canada.ca`, `gv.at` (suffix) | Government domains by directive or design standard; `gv.at` may delegate subdomains to bodies acting in the public interest | [Federal Chancellery](https://www.bk.admin.ch/dam/de/sd-web/4fzFM2z1Gl9F/i003_2_1_d.pdf), [Canada.ca](https://design.canada.ca/specifications/mandatory-elements/domains-urls.html), [gv.at policy](https://ref.gv.at/ag-resi-internetdomainverwaltung-gv.at-naming-und-domainregistrierungs-policy) | V (de facto) |
| O9 | `bund.de`, `gc.ca`, `govt.nz`, `gov.br` and the rest of today's `GOVERNMENT_HOST` (`gov`, `govt`, `gouv`, `gob`, `gv` before any other country code; `go.id`, `go.th`, `go.ke`, `go.tz`, `go.ug`) | Carried over; the restriction could not be checked | — | U (Q8) |
| O10 | `ico.org.uk` | UK Information Commissioner's Office, the data protection regulator | [ICO](https://ico.org.uk/action-weve-taken/enforcement/) | V |
| O11 | `cnil.fr` | CNIL, the French data protection authority | [CNIL](https://www.cnil.fr/fr/les-sanctions-prononcees-par-la-cnil) | V |
| O12 | `fca.org.uk` | Financial Conduct Authority (carried over) | — | U |
| O13 | `bafin.de` | BaFin (carried over) | — | U |
| O14 | `garanteprivacy.it`, `aepd.es`, `dataprotection.ie`, `autoriteitpersoonsgegevens.nl`, `cnpd.pt`, `datatilsynet.no`, `datatilsynet.dk`, `imy.se` | National data protection authorities (carried over) | — | U |
| O15 | `supremecourt.uk`, `judiciary.uk` | UK courts (carried over) | — | U |
| O16 | `un.org` (with `main.un.org`, `scsanctions.un.org`) | United Nations; *proposed addition* | [list page](https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list) | V |
| O17 | `cve.org` | The CVE Program, sponsored by CISA; *proposed addition* | [terms](https://www.cve.org/Legal/TermsOfUse) | V |
| O18 | `worldbank.org` | World Bank Group, which publishes its debarments; *proposed addition* | [list page](https://www.worldbank.org/en/projects-operations/procurement/debarred-firms) | P (its intergovernmental status was not checked) |
| O19 | `bailii.org` · flag SYNDICATED (`issuer`) | A registered charity that republishes judgments supplied by courts; the court is the publisher | [About BAILII](https://www.bailii.org/bailii/) | V |
| O20 | `courtlistener.com` · flag SYNDICATED (`issuer`) · DOWNGRADE `storage.courtlistener.com` under `/recap/` (Q26) | Free Law Project, a non-profit that republishes court opinions and dockets; a party's filing on it is an allegation, not a finding, and the documents its RECAP archive gathers from PACER are such filings | [Free Law Project](https://free.law/about/), [help](https://www.courtlistener.com/help/), [RECAP links](https://free.law/recap/hacking-recap-links) | V (the path P) |
| O21 | `sec.gov` · DOWNGRADE `/Archives/` (Q26) | The Securities and Exchange Commission; its own releases and orders are its word, while a filing in EDGAR (under `/Archives/edgar/data/`) is the filer's document | [accessing EDGAR data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data) | V (the path P) |
| O22 | `regulations.gov` · DOWNGRADE `/comment/` (Q26) | The federal rulemaking portal; the documents agencies post there are theirs, a public comment is its author's | [API](https://open.gsa.gov/api/regulationsgov/) | P (the path U) |

**TRUSTED_PRESS.** Reasons are what the publisher's own page shows. "Carried over" means the host is in today's `MAJOR_PUBLISHER_DOMAINS` and no page of the publisher could be read here (these entries stay TRUSTED_PRESS provisionally, Q9). DOWNGRADE lists the path rules seen on the publisher's own pages, on top of the generic rule G1.

| # | Hosts (publisher) | Reason | Evidence | St. | DOWNGRADE |
|---|---|---|---|---|---|
| P1 | `reuters.com` (Reuters) | News agency under the Thomson Reuters Trust Principles (independence, integrity, freedom from bias); no corrections policy on that page | [Trust Principles](https://www.thomsonreuters.com/en/about-us/trust-principles) | P | — |
| P2 | `apnews.com` (AP) | Carried over | — | U | — |
| P3 | `bbc.com`, `bbc.co.uk` (BBC) | Carried over | — | U | — |
| P4 | `nytimes.com` | Carried over | — | U | — |
| P5 | `wsj.com` | Carried over | — | U | — |
| P6 | `ft.com` | Carried over | — | U | — |
| P7 | `bloomberg.com` | A standards inbox for corrections; The Bloomberg Way guide for reporters and editors | [feedback](https://www.bloomberg.com/help/question/submit-feedback-news-coverage/) | S | — |
| P8 | `economist.com` | Carried over | — | U | — |
| P9 | `theguardian.com` | Carried over | — | U | — |
| P10 | `washingtonpost.com` | Policies and standards: every error is corrected and the correction says what was wrong | [policies](https://www.washingtonpost.com/policies-and-standards/) | S | — |
| P11 | `cnn.com` | About page; corrections policy not seen | [about](https://www.cnn.com/about) | S | — |
| P12 | `nbcnews.com` | About and contact pages: an address for error reports, no corrections policy stated | [about](https://www.nbcnews.com/information/nbc-news-info/about-nbc-news-digital-n1232178) | P | — |
| P13 | `cbsnews.com` | Publishing principles with a corrections policy; brand studio content is labelled and made without the newsroom | [principles](https://www.cbsnews.com/news/cbs-news-publishing-principles/), [brand studio](https://www.cbsnews.com/brandstudio/) | V | `brandstudio`; slugs containing `-paid-content` |
| P14 | `abcnews.go.com`, `abcnews.com` (ABC News) | Contact page and footer only; `abcnews.go.com` redirects to `abcnews.com` (*added host*) | [contact](https://abcnews.com/Contact) | P | — |
| P15 | `npr.org` | Ethics handbook: errors of fact are corrected, with no silent fixes | [ethics](https://www.npr.org/ethics) | S | — |
| P16 | `pbs.org` | Standards memo on issuing corrections | [memo](https://www.pbs.org/standards/blogs/standards-memos/issuing-corrections/) | V | — |
| P17 | `usatoday.com` | Carried over | — | U | — |
| P18 | `latimes.com` | Carried over | — | U | — |
| P19 | `time.com` | A corrections section on its about page; branded and sponsored content is made apart from the newsroom | [about](https://time.com/6268426/about-time/) | V | `partner-content` |
| P20 | `theatlantic.com` | Carried over | — | U | — |
| P21 | `newyorker.com` | Carried over | — | U | — |
| P22 | `axios.com` | Ethics page | [ethics](https://www.axios.com/about/ethics) | S | — |
| P23 | `cnbc.com` | Carried over (403 here; per-story correction notices seen) | — | U | — |
| P24 | `marketwatch.com` | Carried over | — | U | — |
| P25 | `barrons.com` | Carried over | — | U | — |
| P26 | `forbes.com` | Editorial values and standards cover corrections and the contributor network; its terms say non-staff contributors publish on the site; Forbes Councils articles are written by members | [standards](https://www.forbes.com/sites/forbesstaff/article/forbes-editorial-values-and-standards/) (S), [terms](https://www.forbes.com/terms/), [Councils](https://councils.forbes.com/blog/how-to-get-your-next-article-published-a-guide) | S | `sites` except `sites/forbesstaff`; host `councils.forbes.com` |
| P27 | `fortune.com` | About page; no standards or corrections page found | [about](https://fortune.com/about-us/) | P | — |
| P28 | `politico.com`, `politico.eu` (Politico) | Carried over; today's publisher key already counts the two hosts as one | — | U | — |
| P29 | `euronews.com` | Editorial charter (2012): important errors are corrected clearly and quickly; partner content is labelled | [charter](https://static.euronews.com/media/download/press-conference/Editorial-Charter-EN-27-04-12.pdf) | V | — |
| P30 | `euractiv.com` | Carried over | — | U | — |
| P31 | `aljazeera.com` | Code of ethics: mistakes are acknowledged and corrected promptly | [code](https://www.aljazeera.com/code-of-ethics) | V | `opinion`, `sponsored`, `paid-content` |
| P32 | `dw.com` | Carried over | — | U | — |
| P33 | `france24.com` | France Médias Monde's corrections policy | [policy](https://www.francemediasmonde.com/fr/wp-content/uploads/2024/05/Charte-de-rectification-FMM.pdf) | V | `sponsored-content` |
| P34 | `independent.co.uk` | Carried over | — | U | — |
| P35 | `telegraph.co.uk` | Carried over | — | U | — |
| P36 | `thetimes.co.uk` | Carried over | — | U | — |
| P37 | `news.sky.com` (Sky News) | Sky's page says editorial guidelines exist (the guidelines could not be read); corrections not stated | [Sky](https://www.skygroup.sky/what-we-do/unmissable-tv/news) | P | — |
| P38 | `cbc.ca` | CBC/Radio-Canada journalistic standards on corrections | [corrections](https://cbc.radio-canada.ca/en/vision/governance/journalistic-standards-and-practices/corrections) | S | — |
| P39 | `theglobeandmail.com` | Editorial code: corrections are published | [code](https://www.theglobeandmail.com/about/editorial-code/) | V | `opinion`, `adv` |
| P40 | `abc.net.au` (ABC Australia) | Editorial policy on corrections and clarifications | [policy](https://www.abc.net.au/edpols/corrections-and-clarifications/13644514) | V | — |
| P41 | `smh.com.au` | Carried over | — | U | — |
| P42 | `straitstimes.com` | Carried over | — | U | — |
| P43 | `scmp.com` | Policies and standards: errors are corrected quickly, clearly and openly; advertising and branded content are labelled | [policies](https://www.scmp.com/policies-and-standards) | V | — |
| P44 | `nikkei.com` | Nikkei's editorial principles (accuracy, fairness); no corrections clause | [principles](https://www.nikkei.co.jp/nikkeiinfo/r-c/) | P | — |
| P45 | `thehindu.com` | Carried over | — | U | — |
| P46 | `lemonde.fr` | Carried over | — | U | — |
| P47 | `lefigaro.fr` | Carried over | — | U | — |
| P48 | `spiegel.de` | Spiegel group's standards page; corrections not seen | [standards](https://www.spiegelgruppe.de/journalismus/standards-im-journalismus) | S | — |
| P49 | `zeit.de` | Carried over | — | U | — |
| P50 | `faz.net` | Carried over | — | U | — |
| P51 | `sueddeutsche.de` | Carried over | — | U | — |
| P52 | `handelsblatt.com` | Guidelines: errors are corrected as fast as possible; advertising is labelled | [guidelines](https://www.handelsblatt.com/richtlinien/) | V | `adv`, `meinung` |
| P53 | `heise.de` | Imprint and contact pages; no standards page found | — | P | — |
| P54 | `golem.de` | Mission statement: a four-eyes check before publication; no corrections clause | [Leitbild](https://www.golem.de/sonstiges/leitbild.html) | P | — |
| P55 | `elpais.com` | Carried over | — | U | — |
| P56 | `corriere.it` | Carried over | — | U | — |
| P57 | `repubblica.it` | Carried over | — | U | — |
| P58 | `nrc.nl` | Carried over | — | U | — |
| P59 | `techcrunch.com` | About page names its editors and reporters; corrections not stated; sponsored partner content is labelled | [about](https://techcrunch.com/about-techcrunch/), [sponsored](https://techcrunch.com/sponsored/) | P | `sponsored`, `sponsor`, `brand-studio` |
| P60 | `theverge.com` | Carried over | — | U | — |
| P61 | `wired.com` | Carried over | — | U | — |
| P62 | `arstechnica.com` | Carried over | — | U | — |
| P63 | `zdnet.com` | Carried over | — | U | — |
| P64 | `cnet.com` | Carried over | — | U | — |
| P65 | `venturebeat.com` | Ethics statement: mistakes are admitted and corrected promptly; sponsored posts are labelled | [ethics](https://venturebeat.com/ethics-statement) | V | `category/DataDecisionMakers` (guest articles) |
| P66 | `theinformation.com` | About page: no outside owners, sponsorships disclosed; corrections not stated; partner content sits under the same path as news | [about](https://www.theinformation.com/about) | P | — |
| P67 | `theregister.com` | Contact page: errors go to the editor on duty | [contact](https://www.theregister.com/Profile/contact/) | V | host `vendorvoice.theregister.com`; slugs starting `sponsored-`, `partner-content-` |
| P68 | `bleepingcomputer.com` | Ethics statement with a corrections section; sponsored posts are labelled | [ethics](https://www.bleepingcomputer.com/ethics-statement/) | V | `offer/deals`; host `deals.bleepingcomputer.com` |
| P69 | `therecord.media` | About page: inaccurate stories are updated with a disclosure; owned by Recorded Future and states its editorial independence | [about](https://therecord.media/about) | V | — |
| P70 | `securityweek.com` | Content by industry professionals and a news team; contributor articles carry no marker; corrections not stated | [info](https://advertise.securityweek.com/info), [contributors](https://www.securityweek.com/industry-contributors/) | P | — |
| P71 | `darkreading.com` | Sponsored content is labelled; commentary is contributed | [about](https://www.darkreading.com/about-us) | S | — |
| P72 | `krebsonsecurity.com` | A single author's blog; no editorial oversight or corrections policy shown — *proposed: UNVERIFIED* (Q10) | [about](https://krebsonsecurity.com/about/) | P | — |
| P73 | `scworld.com` | Outside contributors publish Perspectives | [contribute](https://www.scworld.com/contribute) | S | `perspective` |
| P74 | `cyberscoop.com` | Sponsored content is made by a studio apart from the editorial department | [about](https://cyberscoop.com/about-us/) | P | `news/sponsored-content`; slugs ending `-op-ed` |
| P75 | `helpnetsecurity.com` | Independent since 1998; many contributors are industry leaders; corrections not stated | [about](https://www.helpnetsecurity.com/about-us/) | P | slugs starting `product-showcase-` |
| P76 | `thehackernews.com` | Partner-contributed Expert Insights and sponsored articles | [about](https://thehackernews.com/p/about-us.html) | S | `expert-insights` |
| P77 | `infosecurity-magazine.com` | Guest articles from industry professionals; corrections not stated | [magazine](https://www.infosecurity-magazine.com/the-magazine/), [op-ed](https://www.infosecurity-magazine.com/op-ed/) | P | `opinions`, `op-ed` |
| P78 | `bankinfosecurity.com` | Published by ISMG, which sells sponsored editorial; no corrections policy stated | [about](https://www.bankinfosecurity.com/about-us), [ISMG](https://ismg.io/content/) | P | — |
| P79 | `iapp.org` | A policy-neutral association; contributed opinion shares the paths of staff news; corrections not stated | [write for us](https://iapp.org/news/write-for-us) | P | — (Q10) |

Evidence status of the 79 publishers: 14 V, 17 P, 11 S, 37 U. The 37 U and 11 S could not be read because the environment refused those hosts to automated readers; it says nothing about their standards.

**Rules and groups**

| # | Rule | Category · flags | Reason | Evidence | St. |
|---|---|---|---|---|---|
| G1 | Path segments `opinion`, `opinions`, `sponsored`, `sponsored-content`, `partner-content`, `paid-content`, `brandstudio`, `brand-studio`, `adv` on any TRUSTED_PRESS host | UNVERIFIED · DOWNGRADE | Opinion and paid content; each segment is used by at least one publisher above for content that is not its own reporting (Q11) | P13, P19, P31, P33, P39, P52, P59, P77 | V |
| G2 | The vendor's own domains (§D3.2 step 2) | VENDOR | The vendor speaking for itself; statement or self-claim by rule V (§D5.4) | — | — |
| G3 | `prnewswire.com`, `einpresswire.com`, `prweb.com`, `24-7pressrelease.com`, `openpr.com`, `businesswire.com`, `globenewswire.com`, `accesswire.com` | VENDOR when the release carries an e-mail address on the vendor's own domain, else UNVERIFIED (Q14, narrowed by Q27) | Paid distribution of releases written by the issuer; PRWeb says it does not verify what customers submit | [PR Newswire](https://www.prnewswire.com/pr-distribution-and-placement/), [EIN Presswire](https://www.einpresswire.com/editorial-guidelines), [PRWeb](https://www.prweb.com/legal/), [24-7](https://www.24-7pressrelease.com/content_guidelines), [openPR](https://www.openpr.com/news/about.html) | V for 4, P for openPR, U for the last 3 |
| G4 | `msn.com`, `yahoo.com`, `newsbreak.com` | UNVERIFIED · SYNDICATED (`canonical`) | Show partner publishers' articles: MSN shows the publisher's logo and usually leaves the work unchanged; Yahoo displays content it did not create; publishers license NewsBreak to publish | [MSN](https://support.microsoft.com/en-us/msn), [Yahoo terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html), [NewsBreak](https://publishers.newsbreak.com/legal) | V |
| G5 | `news.google.com`, `flipboard.com`, `smartnews.com`, `apple.news`, `ground.news`, `techmeme.com`, `newsnow.co.uk`, `dailyhunt.in`, `inshorts.com`, `feedly.com` | UNVERIFIED · SYNDICATED (`canonical`) | Aggregate, curate or summarise other publishers' stories and link to them | [Google News](https://support.google.com/googlenews/answer/9005601), [Ground News](https://ground.news/about), [Techmeme](https://www.techmeme.com/about), [Inshorts](https://inshorts.com/tnc), and the others' own pages (Appendix A) | V (dailyhunt P) |
| G6 | `substack.com`, `wordpress.com`, `blogspot.com`, `tumblr.com`, `medium.com` | UNVERIFIED | Platforms where anyone publishes | [Substack](https://substack.com/tos), [WordPress.com](https://wordpress.com/tos/), [Blogger](https://www.blogger.com/about/), [Tumblr](https://www.tumblr.com/policy/en/terms-of-service) | V (medium U) |
| G7 | `facebook.com`, `linkedin.com`, `instagram.com`, `youtube.com`, `tiktok.com`, `x.com`, `twitter.com`, `t.co` | UNVERIFIED | Social networks where users post | [Facebook](https://www.facebook.com/terms), [LinkedIn](https://www.linkedin.com/legal/user-agreement), [YouTube](https://www.youtube.com/t/terms), [TikTok](https://www.tiktok.com/legal/page/row/terms-of-service/en) | V (x, twitter, t.co U) |
| G8 | `news.ycombinator.com`, `reddit.com`, `quora.com` | UNVERIFIED | Forums where users submit and discuss | [HN guidelines](https://news.ycombinator.com/newsguidelines.html) | V (reddit, quora U) |
| G9 | `wikipedia.org`, `wikimedia.org`, `archive.org`, `archive.ph` | UNVERIFIED | An encyclopedia anyone can edit; archives of copies of pages | [Wikipedia](https://en.wikipedia.org/wiki/Wikipedia:About), [Wayback Machine](https://help.archive.org/help/wayback-machine-general-information/) | V (wikimedia, archive.ph U) |
| G10 | `pastebin.com` | BLOCKED (Q15) | Anyone can store text there, guests included; a paste has no publisher to hold to account, and citing a dump of data can spread personal data | [FAQ](https://pastebin.com/faq) | V |
| G11 | Hosts whose first label is `community`, `forum`, `forums`, `discuss`, `discussions` or `answers`, and paths with one of those segments, on any host, the vendor's own included | UNVERIFIED (§D3.2 step 1, Q25) | Community forums, question boards and discussion threads, where users post | — | — |

### D3.5 Differences from `sourceTiers.ts`

- **Vendor pages** were the `official` tier; they become VENDOR, with rule V.
- **Aggregators** split four ways: paid wires become VENDOR when they carry an e-mail address on the vendor's domain (G3); republishers and aggregators get SYNDICATED (G4, G5); platforms where users publish stay UNVERIFIED (G6–G9); `pastebin.com` becomes BLOCKED (G10).
- **Regulators and courts** become OFFICIAL; `bailii.org` and `courtlistener.com` become OFFICIAL with SYNDICATED, with no change in effect.
- **Documents others file with an authority** become UNVERIFIED: EDGAR filings, public comments on `regulations.gov` and the filings of CourtListener's RECAP archive (O20–O22, Q26). Today they share the credit of the official host.
- **User content on the vendor's own domain** becomes UNVERIFIED: community and forum hosts and sections (G11) and posts on a platform that is the vendor's website (§D3.2 step 1, Q25). Today it counts as the vendor's own page.
- **Major publishers** become TRUSTED_PRESS, with DOWNGRADE path rules (for example Forbes contributors, which `sourceTiers.ts` today trusts as the whole site); `krebsonsecurity.com` is proposed UNVERIFIED (Q10).
- **`GOVERNMENT_HOST`** becomes explicit suffix entries; its pattern was removed in `sr-5` (Q8, decided on 2026-10-31), and only the suffixes whose rule or holder was read stay.
- **Additions:** `un.org`, `cve.org`, `worldbank.org`, `abcnews.com`, and the DOWNGRADE hosts `councils.forbes.com`, `vendorvoice.theregister.com` and `deals.bleepingcomputer.com`.

---

## D4. Architecture and data model

### D4.1 Pipeline order (brief §2.2)

| Step | Where | What changes |
|---|---|---|
| 1. Resolve identity | `target.ts`, `identity.ts`, `aliases.ts` | Nothing: name, `other_names`, website domain. The VRDB match keys are derived from them (`vrdb/keys.ts`). |
| 2. VRDB lookup | `vrdb/lookup.ts`, called where `gather.ts:711` calls the records lookup today | One indexed query over the mirrored records, plus the read-through sources whose stored answer has expired; writes `vendor_vrdb_matches`; returns records and the coverage of each source. Records enter the ledger first, as today (`gather.ts:741–746`). HIBP and the status page stay lookups in `records/` (§2.8). |
| 3. Web search, always | `gather.ts`, loops, `webResearch/search/` | It runs even when the VRDB found records, with the engine of the research key (Q21, decided on 2026-10-31): Claude web search when the key is an Anthropic one, else the GDELT news index (news of the last 3 months). The run stores the engine as `search_engine`. |
| 4. Classify every source | `sourceRegistry/classify.ts`, called when a source enters the ledger (`webSession.ts`) | Each ledger entry carries its category, flags, publisher, registry entry and whether it was reviewed; the trace counts sources per category. |
| 5. Analysis | `analysis.ts`, `prompts.ts`, `schema.ts` | The model no longer returns `confidence` (prompt and schema change; `PROMPT_VERSION` `vr-7`). |
| 6. Credibility | `credibility.ts`, called from `pipeline.ts` | Computed right after the analysis for the trace, and again from the final sources after every step that changes them, since it is a pure function of them; the stored label is the final one. |
| 7. Validation, verifier, de-duplication | `validation.ts`, `verifySnippets.ts`, `verifier.ts`, `clusters.ts` | `confidenceCeiling` and `lowerOf` go; the snippet check records `contradicted` or `unconfirmed` on the source instead of lowering a confidence; the best source is chosen by registry category. |
| 8. Report with coverage | `pipeline.ts` → `vendor_research_runs.coverage` | A new JSONB column; `RunSummary.tsx` shows it. |

### D4.2 New modules

Servers (`Servers/services/vendorResearch/` unless stated):

- `sourceRegistry/entries.ts` (D3), `sourceRegistry/classify.ts`: `classifySource({ url, canonicalUrl, text }, target)` → `{ category, flags, publisher, entryId, reviewed }`, and `classifyRecord(sourceId)`.
- `credibility.ts`: `credibilityOf(finding, citedSources)` → `{ label, basis }`, pure.
- `vrdb/sources.ts`: the list of sources (id, name, operator, mode `mirror` or `read_through`, schedule, hours after which the data is stale, licence and attribution text, documentation URL).
- `vrdb/connectors/<id>.ts`, one per source: fetch through `guardedFetch`, parse, normalise to records with match keys. The parsers of `records/kev.ts` and `records/ofac.ts` move here.
- `vrdb/keys.ts`: the match keys of a vendor and of a record.
- `vrdb/sync.ts`: the mirror job (download, hash, parse, upsert, status changes, the sync run row).
- `vrdb/lookup.ts`: the run-time lookup (D4.8).
- `vrdb/queue.ts`, `vrdb/worker.ts`: the queue `vendor-risk-database`, one job name `vrdb_sync` with `{ sourceId }`, one scheduler per mirrored source.
- `Servers/utils/vrdb.utils.ts`: the SQL, with unqualified table names; every query of the match table filters on `organization_id`.
- Migrations, named with a timestamp from `date +%Y%m%d%H%M%S` when written and with `verifywise.` in the DDL: `<ts>-vendor-risk-database.js` and `<ts>-vendor-finding-credibility.js` (M1), `<ts>-vendor-finding-drop-confidence.js` (M3).

### D4.3 Changed files

- **Servers:** `gather.ts` (the VRDB lookup instead of the KEV and OFAC lookups in M1, NVD and SEC in M2, `planNewsReads` ordered by registry category, R22); `records/index.ts` (keeps HIBP and the status page, and the rest while the flag is off); `services/webResearch/webSession.ts` (ledger entries carry the classification and, for a record, its id, source, match strength and status); `pipeline.ts`; `validation.ts`; `verifySnippets.ts`; `schema.ts`; `prompts.ts`; `sourceTiers.ts` (replaced by `sourceRegistry/`; `publisherKey` stays); `config.ts`; `domain.layer/interfaces/i.vendorResearch.ts`; `utils/vendorResearch.utils.ts`; `eval/types.ts`, `eval/scorer.ts`, `eval/runCase.ts`, `eval/cli.ts`, `eval/cases/*`; `jobs/producer.ts`, `jobs/worker.ts`; `scripts/auditTenantIsolationCoverage.ts`; `tests/integration/tenant-isolation/tenantIsolation.registry.ts`; `.env.example`; `locales/{en,de,fr}.json` only if a new server message is added.
- **Clients:** `domain/interfaces/i.vendorResearch.ts`, `application/utils/vendorResearchText.ts`, `presentation/pages/Vendors/VendorResearchFindings/FindingRow.tsx` and `RunSummary.tsx`, `i18n/translations.ts`, and the tests and fixtures under `__tests__`.
- **Docs:** `docs/technical/infrastructure/web-research.md`, `docs/technical/domains/vendors.md`, a pointer from the 2026-10-11 spec, the user guide page `vendor-risks.ts`, and a reference row in `CLAUDE.md` with its "Last Updated" date.

### D4.4 Shared tables (no `organization_id`)

`verifywise.vrdb_sources`, one row per source, upserted from `vrdb/sources.ts` at every sync, so that code review owns the metadata and the row holds the sync state:

- `id VARCHAR(40) PRIMARY KEY` (`cisa_kev`, `ofac_sdn`, `uk_sanctions`, `eu_fsf`, …), `name`, `operator`, `access_mode` (`mirror`, `read_through`), `documentation_url`, `licence`, `attribution`, `stale_after_hours INTEGER NOT NULL`
- `last_attempt_at`, `last_success_at TIMESTAMPTZ`, `last_outcome VARCHAR(20)` (`ok`, `unchanged`, `failed`, `never`), `last_error VARCHAR(60)` (a fixed code, never a message)
- `source_version TEXT` (the version or publication date the source gives), `etag TEXT`, `last_modified TEXT`, `cursor JSONB` (an incremental position, for a source that publishes deltas)
- `active_records INTEGER`, `created_at`, `updated_at`

`verifywise.vrdb_records`:

- `id BIGSERIAL PRIMARY KEY`, `source_id VARCHAR(40) NOT NULL REFERENCES verifywise.vrdb_sources(id)`
- `source_record_id VARCHAR(200) NOT NULL` (the source's own id: `cveID`, `ent_num`, `Unique ID`, `logicalId`, the permanent reference number, the accession number) with `UNIQUE (source_id, source_record_id)`
- `record_type VARCHAR(30) NOT NULL` (`vulnerability`, `sanctions_entity`, `sec_filing`, …)
- `status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'withdrawn', 'rejected', 'delisted'))`, `status_changed_at TIMESTAMPTZ`
- `title TEXT NOT NULL`, `summary TEXT NOT NULL` (the text that enters the ledger), `url TEXT NOT NULL` (the human page of the record)
- `identifiers JSONB NOT NULL` (names, aliases, vendor and product, CPE vendor, CIK, country, registration numbers, website: what the source gives) and `match_keys TEXT[] NOT NULL` (typed keys such as `name:acmeanalytics`, `kev:brisenetworks`, `cpe:brise_networks`, `domain:acme-analytics.com`, `cik:0001999001`), with a GIN index
- `published_at TIMESTAMPTZ` (the source's own date: added, listed, filed), `source_updated_at TIMESTAMPTZ`, `retrieved_at TIMESTAMPTZ NOT NULL`
- `content_hash CHAR(64) NOT NULL` (SHA-256 of the normalised record), `raw_snapshot_hash CHAR(64) NOT NULL` (SHA-256 of the file or response it came from; the file is not kept)
- `created_at`, `updated_at`; indexes on `(source_id, status)` and GIN on `match_keys`

`verifywise.vrdb_sync_runs`, one row per sync attempt, kept 90 days: `id`, `source_id`, `started_at`, `finished_at`, `outcome`, `error_code`, `bytes`, `records_seen`, `inserted`, `updated`, `status_changed`, `raw_snapshot_hash`, `duration_ms`.

`verifywise.vrdb_lookups`, the state of the read-through sources (M2): `source_id`, `lookup_key`, `fetched_at`, `expires_at`, `outcome`, `record_count`, `PRIMARY KEY (source_id, lookup_key)`. A key is public (a CPE vendor token, a CIK) and names no organisation; it still shows which vendors someone looked up, so no API ever serves it (Risk J).

**Isolation.** None of these tables has `organization_id`, and the audit checks only tables that do, so it would not flag them. As the brief asks, `sharedTables` in `scripts/auditTenantIsolationCoverage.ts` still gets an entry `vrdb_*`, justified as "Public records mirrored from official sources (vendor risk database); no tenant data; written only by the sync job and the run-time lookup", so that a later `organization_id` on one of them is a reviewed decision. These are the feature's first shared Postgres tables; the precedent is `*_struct_*`.

**Personal data.** Only entities of sanctions lists are stored, as R39 does today: individuals, ships, vessels and aircraft are dropped while parsing, because a vendor is an organisation and a person's record is personal data we have no use for (the OGL does not even license it). Raw files are hashed, not kept.

### D4.5 Tenant-scoped table

`verifywise.vendor_vrdb_matches`: `id SERIAL PRIMARY KEY`, `organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE`, `vendor_id INTEGER NOT NULL REFERENCES verifywise.vendors(id) ON DELETE CASCADE`, `record_id BIGINT NOT NULL REFERENCES verifywise.vrdb_records(id) ON DELETE CASCADE`, `match_method VARCHAR(30) NOT NULL CHECK (match_method IN ('kev_vendor', 'cve_affected_vendor', 'nvd_cpe_vendor', 'sec_cik', 'domain', 'identifier', 'name_exact'))`, `match_strength VARCHAR(10) NOT NULL CHECK (match_strength IN ('strong', 'weak'))`, `matched_key TEXT NOT NULL`, `first_matched_at`, `last_matched_at`, `UNIQUE (organization_id, vendor_id, record_id)`, indexes on `(organization_id, vendor_id)` and on `record_id` (for the status job).

Strong is an exact identifier, an exact vendor or product field (KEV, CVE, NVD), the vendor's own SEC CIK, or a verified domain; weak is a name alone; there is no fuzzy method (§2.6). The table gets an entry in `tenantIsolation.registry.ts` (`baseRoute: "/api/vendors/:id/research"`, commented "No route of its own: the research pipeline writes it", as `vendor_research_sources` is), an isolation test `vendor-vrdb-matches.isolation.test.ts` (organisation B's vendor never gets a row of organisation A; deleting a vendor removes its rows), and the audit passes.

### D4.6 Findings and runs

`vendor_risk_findings`:

- New `credibility VARCHAR(10) CHECK (credibility IN ('low', 'medium', 'high'))`, nullable during the rollout.
- New `credibility_basis JSONB`: the rule that applied, the counts per category, the publishers, each record's match method and strength, each source's reading and the date of the data. It holds the rationale and the name-only note as codes and parameters, so the client renders them in the person's language (§D5.5); the API adds the English line for clients that do not translate.
- Each item of `sources` gains `category`, `flags`, `publisher` and, for a VRDB record, `record: { source_id, record_id, status, match_strength }`.
- `confidence` becomes nullable now and is dropped in M3.

**A new column, not a rename.** A rename would keep old values under a new name although another rule made them, and a reused column would mix the two rules. The M1 migration adds the columns and drops `NOT NULL` from `confidence`; its down sets `confidence = COALESCE(confidence, credibility, 'low')`, restores `NOT NULL` and drops the new columns. It is reversible.

**Backfill (M3, before the contract migration).** Pending findings are recomputed with `credibilityOf` from their stored sources: host → registry category; KEV, NVD and SEC record URLs → OFFICIAL; the OFAC record URL → weak; `snippet_only` with a stored `low` → contradicted, `snippet_only` otherwise → unconfirmed; `basis.rule` starts with `backfill`. Accepted and dismissed findings keep what the person saw: `credibility = confidence` and `basis = { rule: "legacy_confidence" }`, and the client says "Rated with the earlier confidence rule". The contract migration keeps the old value in `credibility_basis.legacy_confidence`, so its down can restore the column.

`vendor_research_runs` gains `coverage JSONB` and `registry_version VARCHAR(10)`. Coverage:

```json
{
  "registry_version": "sr-1",
  "sources": [
    { "id": "cisa_kev", "name": "CISA Known Exploited Vulnerabilities", "mode": "mirror", "checked": true,
      "outcome": "found", "strong": 1, "weak": 0, "last_success_at": "2026-10-29T19:12:00Z", "stale": false }
  ],
  "lookups": [{ "id": "hibp", "outcome": "none" }, { "id": "statuspage", "outcome": "failed" }],
  "cited": { "official": 1, "trusted_press": 2, "vendor": 0, "unverified": 3 }
}
```

`outcome` is one of `found`, `none`, `failed`, `off`, `not_researched`.

### D4.7 Sync jobs

- Queue `vendor-risk-database`, of its own as R28 gave research one, with one worker of concurrency 1 started by `jobs/worker.ts`. `jobs/producer.ts` adds `safeSchedule("vendor-risk-database-sync", scheduleVendorRiskDatabaseSync)`, which upserts one scheduler per mirrored source, keyed `vrdb_sync:<sourceId>`, at the cadence of D2: KEV hourly, OFAC, UK and EU every 6 hours. The queue is never emptied.
- Job options: `attempts: 3`, `backoff: { type: "exponential", delay: 60_000 }`, `removeOnComplete: true`, `removeOnFail: true`.
- A sync makes a conditional GET where the source sends `ETag` or `Last-Modified` (KEV and UK observed), goes through `guardedFetch` with the source's content types and size cap and `BOT_USER_AGENT`, and keeps to `robots.txt` where it applies. It hashes the body; the hash of the last success means `unchanged`, fresh, nothing parsed. Otherwise it parses and upserts in one transaction. Records of a full list that are no longer in it become `delisted` (sanctions) or `withdrawn` (KEV). A guard keeps a truncated download from emptying the mirror: a list that shrank by more than 20 % since the last success, or that parsed with errors, fails the sync instead.
- A failure sets `last_outcome = failed`. Staleness is computed, not stored: `now - last_success_at > stale_after_hours`. A run uses the data anyway and says so (coverage `stale: true`, rationale "as of …").
- One request per source and sync. The read-through sources keep their spacing: the NVD at 4 requests per 30 s, in Redis so that all workers share it (M2), the SEC well under 10 per second.
- The off switch `VENDOR_RESEARCH_RECORDS=false` stops the schedulers, so nothing is downloaded, and the lookups; the coverage then says "turned off".

### D4.8 Run-time lookup

1. The keys of the vendor, from the target: `name:` keys (`nameKeys`; 4 characters or more for sanctions lists), `kev:` and `cve:` vendor keys, `cpe:` (`cpeVendorOf`), `domain:`, and identifiers once vendors have them (Q1).
2. One query: `SELECT … FROM vrdb_records WHERE match_keys && :keys AND source_id = ANY(:sources) AND status = 'active'`, where `:sources` are the sources of the categories the run researches (`RECORD_CATEGORY`, as today).
3. For a read-through source (M2), each key whose `vrdb_lookups` row is missing or expired is fetched inside the run's 8 s; records and the lookup row are stored; a fetch that fails leaves the old data in use, and the coverage says `failed`.
4. Each record gets its match method and strength from the key that matched, a row in `vendor_vrdb_matches`, and a text for the ledger, as today, with "as of {date}" and, for a name-only match, the sentence the prompt already knows from vr-6. It enters the ledger with `{ recordId, sourceId, strength, status }`.
5. The caps per source (`MAX_RECORDS`) and the counting of `old` and `more` stay.

### D4.9 Rulings this changes

- **R15:** the vendor's pages as one publisher and an aggregator as no publisher stay, and the scorer keeps its own publisher key; its `overconfident` measure is replaced (D6.1).
- **R22, R26:** "the tier of the source" becomes the registry category. R26's "keeps its confidence" when no page can be read becomes "at most Medium" (§D5.3), and "lowers it to low" becomes `contradicted`, which is Low.
- **R34:** the KEV lookup per run, in process memory, becomes a mirror (M1), and the NVD lookup a read-through (M2); exact matching stays; HIBP stays as R34 built it.
- **R35:** the SEC filings become a read-through (M2); the registrant is still found by name alone, which brief §2.6 makes a weak match until Q3 is answered.
- **R39:** the OFAC list stops belonging to the process (the 6-hour memo, the shared 45-second download) and is mirrored by a scheduled job into shared tables; entities only and exact name matching stay.
- **R36:** the status page stays a lookup, read as before, but its confidence paragraph changes: a finding that cites one status page record was capped at `low` on purpose, and the record now counts as a VENDOR statement, so High (brief §2.8, rule V).
- **R7 stays** (sanctions matches under `legal_regulatory`), and **R2 stands** (no account, key or setting of a third party).

### D4.10 How the results reach the UI

- **API:** the findings endpoints (`routes/vendorRiskFindings.route.ts`, `routes/vendorResearch.route.ts`) return `credibility`, `credibility_basis` and the new source fields; the run returns `coverage`. M1 adds no route, so `swagger.yaml` and `endpoints.ts` need no regeneration; a route added later would be followed by `generate:swagger`, `generate:endpoints` and `check:api-drift`.
- **Client:** the types (`domain/interfaces/i.vendorResearch.ts`); labels, badge names and the renderer of the rationale (`application/utils/vendorResearchText.ts`); `FindingRow.tsx` puts the credibility chip where the confidence chip is, with the rationale under it, the name-only note when it applies, a category badge before each source's host and the record's status when it is not active; `RunSummary.tsx` adds the coverage block; `i18n/translations.ts` gets the de, fr and es strings.
- **Copy** (sentence case): "Credibility", "High", "Medium", "Low"; "Official", "Trusted press", "Vendor", "Unverified"; "Matched by name only: this may be another company."; "Checked: {sources}"; "No records in {sources} as of {dates}"; "{source}: last updated {date}, not up to date"; "Sources cited: {official} official, {press} trusted press, {vendor} vendor, {unverified} unverified"; "Public databases turned off". The word "clean" is never used.
- **House UI:** the chip stays neutral (credibility is not a risk colour); badges are small outlined chips of the existing `Chip` component; border `#d0d5dd`, radius 4px.

### D4.11 Flag, off switch, rollout

This section describes the plan of Phase 1. **As built:** M3 Part B1 removed the flag, so `VENDOR_RESEARCH_VRDB` no longer exists and the database is always on. `VENDOR_RESEARCH_RECORDS=false` is the only switch, and it stops every public database, the status page and the downloads of the lists. A finding written before the change keeps its `confidence`, which the client shows until the backfill gives it a label; Part B2 drops the column in release N+1.

- `VENDOR_RESEARCH_VRDB` (Phase 1 plan): only `true` turns on the new pipeline (the VRDB lookup and sync jobs, the registry, credibility, vr-7, the coverage). It was to stay off until the golden set passes (brief §8).
- `VENDOR_RESEARCH_RECORDS` stays the off switch for every public database.
- With the flag off nothing changes: today's lookups, `confidenceCeiling` and vr-6, and `confidence` is written.
- The client shows `credibility` when a finding has it, and today's confidence chip otherwise.

---

## D5. Credibility rules

### D5.1 What the label says

How well the cited sources establish the facts a finding rests on. It does not say how likely or how serious the risk is (likelihood and severity do), and it is not a risk colour. Code computes it from the categories of the cited sources, the number of independent publishers and, for a database record, how the record was matched and whether it is still active. The model never sees or writes it.

### D5.2 Inputs

For each source a finding cites, after the validation and the snippet check:

- **Category** from the registry (D3), after its flags: DOWNGRADE makes it UNVERIFIED. SYNDICATED with `canonical` gives the copy the category and publisher of the page its canonical URL names, when that is another registry host, and UNVERIFIED otherwise; with `issuer` (BAILII, CourtListener) the issuing court is the publisher. BLOCKED never reaches a finding.
- **Publisher:** the entry's `publisher` when it has one, else `publisherKey(url)` as today; all the vendor's pages are one publisher; a record's publisher is its operator.
- **Kind**, for a VENDOR source: statement or self-claim (§D5.4).
- For a VRDB record: **match strength** (strong or weak), **status** (active, withdrawn, rejected, delisted), **freshness** (fresh or stale) and the **date of the data**.
- **Reading:** read (a page the research read, or a record), unconfirmed (a search result whose page could not be read), contradicted (the page was read and does not hold the quote).

### D5.3 The rule

0. A contradicted source, and a record that is withdrawn, rejected or delisted, gives no support. A weak record gives only Low support.
1. **High** when at least one supporting source is
   - **H1** OFFICIAL: a page on an OFFICIAL host, or a VRDB record with a strong match; or
   - **H2** a VENDOR statement (§D5.4); or
   - **H3** TRUSTED_PRESS from at least two different publishers.
2. **Medium** when the supporting sources include TRUSTED_PRESS from exactly one publisher, however many of its pages and with or without other sources.
3. **Low** otherwise: only UNVERIFIED sources (unknown hosts, aggregators, users' posts, downgraded pages, copies that cannot be credited), only the vendor's self-claims, only weak records, or nothing left after step 0.
4. **Unconfirmed cap:** when every source that earned High is an unconfirmed search result, the label is Medium.
5. **Name-only note:** whenever a cited record matched by name only, the chip carries "Matched by name only: this may be another company." Brief §2.6 says a weak match "caps at Low"; this design reads it as a cap on what the record contributes (step 0), so that other sources can still earn Medium or High (case 9b) while the note stays. The strict reading caps the whole finding at Low; Q24 asks which one the brief means.
6. **Stale data** does not change the label; the rationale gives the date of the data, and the coverage block says the source is not up to date.

Match strength applies to VRDB records. A web page counts for the vendor through `identity.ts` (the name, an other name or the domain as a whole word) and the verifier's `same_company` question, as today; making web pages "name only" would make nearly every press finding Low (Q17).

### D5.4 Vendor sources (rule V)

The brief makes the vendor asymmetric: an admission of an incident is strong, a positive self-claim is never independent. Code tells the two apart without a model:

- A VENDOR source is a **statement** when the finding is in an event category (`security_incidents`, `availability`, `legal_regulatory`, `financial_health`), where a vendor page cited for a risk reports an incident, an outage, a legal matter or a financial event of the vendor itself; or when the page is one of the vendor's status, trust, security or policy pages (the pages `classifySitePage` in `gather.ts` already serves to `certifications` and `ai_specific`, and the status page hosts), which a finding cites for what they bind the vendor to or report about it.
- Every other VENDOR source is a **self-claim**: a marketing, newsroom or blog page of the vendor, or a wire release, cited in a `certifications` or `ai_specific` finding. A self-claim never counts as independent support and never raises a label.
- A wire release is VENDOR only when its text carries an e-mail address on the vendor's own domain, such as its media contact. A link to the domain or a mention of it is not enough, so a security firm's release that links the vendor's advisory and a law firm's investor alert about the vendor are UNVERIFIED (Q14, narrowed by Q27).
- User content is never VENDOR, even on the vendor's own domain: a community thread or a post on a platform is UNVERIFIED (§D3.2 step 1, Q25).

The limit (Q12): a positive claim on a trust page, cited by a finding about something missing, gets High. The verifier's `quote_supports_claim` and the person who accepts the finding are the remaining checks.

### D5.5 Rationale and note

One line, generated by code from `credibility_basis`, translated on the client:

| Rule | English |
|---|---|
| H1 record | High: {operator} lists it ({record}), as of {date}. |
| H1 page | High: an official source reports it ({host}). |
| H2 | High: the vendor states it on its own pages ({host}). |
| H3 | High: {count} independent trusted publishers report it ({publishers}). |
| Medium | Medium: one trusted publisher reports it ({publisher}); no official source and no second independent publisher. |
| Cap | Medium: only search results show it; the pages could not be read. |
| Low, unverified | Low: only unverified sources report it ({hosts}). |
| Low, self-claim | Low: only the vendor's own claims support it. |
| Low, weak | Low: the {list} entry matches the vendor by name only. |
| Low, contradicted | Low: the pages do not hold what the search results quoted. |
| Low, inactive | Low: {operator} {rejected / withdrew / removed} the record on {date}. |
| Stale (added) | The source has not been updated since {date}. |
| Backfill (added, after the rule's line) | Rated again with the current rule. |
| Legacy (the whole line) | Rated with the earlier confidence rule. |
| Note | Matched by name only: this may be another company. |

### D5.6 Behaviour changes against `confidenceCeiling`

1. **The model's view is gone.** Today the label is the lower of the model's confidence and the ceiling; the new label ignores the model. Replay case `long-policy-part` goes from low to High because the model's "low" no longer counts.
2. **One official source is enough for High.** Today a single official page or record is Low (one URL that is not the vendor's): a KEV record, a regulator's page, an SEC filing.
3. **One vendor page** is Medium today; it becomes High as a statement and Low as a self-claim.
4. **Pages of unknown publishers** make Medium today when there are two URLs (two pages of one unknown site, as the brief notes, or of two sites); they become Low. Six of the 22 replay findings change this way.
5. **One page of one trusted publisher** goes from Low to Medium.
6. **A vendor page plus any second publisher** is High today (the vendor's tier is credible); it stays High only if the vendor page is a statement, otherwise the other source decides (Medium for a trusted publisher, Low for an unknown one).
7. **Aggregators and users' posts** are "no publisher" today but count toward the two URLs of Medium; they become UNVERIFIED and never rise above Low on their own.
8. **A syndicated copy** with a canonical link to a registry publisher counts as that publisher; today it is no publisher.
9. **Paid wires** are aggregators today; they become VENDOR when they carry an e-mail address on the vendor's domain (statement or self-claim by rule V), else UNVERIFIED (Q27).
10. **Unconfirmed snippets** keep any confidence today (R26); they are capped at Medium.
11. **Contradicted snippets** are Low, as today.
12. **Records** are classified by their operator, not by the host of their link.
13. **Name-only matches** are Low with the note; with two trusted publishers they are High with the note, as High today but without one.
14. **Inactive records** no longer support a label; today no status exists.
15. **BAILII and CourtListener** are credible today and OFFICIAL by SYNDICATED: no change in effect.
16. **Forbes contributor pages** and other downgraded paths are major-publisher pages today and UNVERIFIED (if G1 and the path rules are approved, Q11).
17. **Unverified government suffixes** are unchanged if Q8 keeps them, UNVERIFIED if not.
18. **The eval's `overconfident` measure** (High with fewer than two publishers) would flag a correct single-official High, so it is replaced (D6.1).

### D5.7 Worked cases

"Today" is what `confidenceCeiling` allows (the stored value can be lower if the model said less).

| # | Situation | Sources and their support | Today | Proposed | Rationale |
|---|---|---|---|---|---|
| 1 | One KEV entry for the vendor's product | KEV record CVE-2026-31337, OFFICIAL, strong (`vendorProject` is the vendor's name), active, fresh | Low (one URL; replay case 17) | **High** (H1) | High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-31337), as of 28 Oct 2026. |
| 2 | Reuters and BBC report the same breach | `reuters.com` and `bbc.co.uk`, TRUSTED_PRESS, two publishers, read | High | **High** (H3) | High: 2 independent trusted publishers report it (Reuters, BBC). |
| 3 | One BBC story on `bbc.co.uk` and `bbc.com` | TRUSTED_PRESS, one publisher (BBC), two pages | Medium (two URLs) | **Medium** | Medium: one trusted publisher reports it (BBC); no official source and no second independent publisher. |
| 4 | Five syndicated copies of an AP story | copies on `yahoo.com` and `msn.com` whose canonical URL is on `apnews.com` (AP), and three unknown local sites (UNVERIFIED) | Medium (three unknown publishers, none credible; two or more URLs) | **Medium**; **Low** if no copy carries a canonical link to a registry host | Medium: one trusted publisher reports it (AP); … |
| 5 | A single Medium post alleges a breach | `medium.com`, UNVERIFIED | Low | **Low** | Low: only unverified sources report it (medium.com). |
| 6 | A vendor press release claims ISO 27001 | a `certifications` finding citing `vendor.com/press/…` (VENDOR, self-claim), or the copy on a wire (VENDOR if it carries an e-mail on `vendor.com`, then a self-claim; else UNVERIFIED) | Medium (one vendor page); Low for the wire copy | **Low** | Low: only the vendor's own claims support it. |
| 7 | The vendor's own incident notice | a `security_incidents` finding citing `vendor.com/blog/security-update` (VENDOR, statement: event category) | Medium (one vendor page) | **High** (H2) | High: the vendor states it on its own pages (vendor.com). |
| 8 | A news article cites an ICO fine, and the `ico.org.uk` page was read | an unknown news site (UNVERIFIED) and `ico.org.uk` (OFFICIAL, read) | High (two publishers, one credible) | **High** (H1) | High: an official source reports it (ico.org.uk). |
| 9 | A sanctions entity has the vendor's name | OFAC SDN entity record, OFFICIAL, weak (name only) | Low (one URL) | **Low** and the note | Low: the OFAC SDN list entry matches the vendor by name only. |
| 9b | The same, and Reuters and BBC report this vendor's designation | the weak record and two TRUSTED_PRESS publishers | High | **High** and the note (Q24; **Low** and the note under the strict reading) | High: 2 independent trusted publishers report it (Reuters, BBC). |
| 10 | A CVE is later marked REJECTED | the record's status becomes `rejected` (the CVE mirror, M2) | no status; the finding keeps its value | New runs: the record is not offered, so no finding. A pending finding that cites it: **Low** (status job, M2), and the source shows the status | Low: the CVE Program rejected the record on {date}. |
| 11 | A sanctions entry is delisted | the entity is missing from today's full file: `delisted` on the day of the sync | the next run does not find it; an older finding keeps its value | New runs: not offered, no finding. A pending finding: **Low** (status job) | Low: OFAC removed the record on {date}. |
| 12 | A VRDB source is stale | the OFAC sync has failed for three days (stale after 48 h); a stale KEV mirror still holds the record of case 1 | — | The label stays (case 1: **High**); the coverage block lists OFAC as not up to date; where nothing was found: "No records in OFAC SDN list as of 26 Oct 2026" | High: CISA Known Exploited Vulnerabilities lists it (…), as of 26 Oct 2026. The source has not been updated since 26 Oct 2026. |
| 13 | Two trusted publishers seen only in search results | `reuters.com` and `bbc.com` results, neither page readable (unconfirmed) | High (R26 keeps it) | **Medium** (cap) | Medium: only search results show it; the pages could not be read. |
| 14 | A contributor post on `forbes.com/sites/…` | DOWNGRADE, so UNVERIFIED | Low with one URL, Medium with two | **Low** | Low: only unverified sources report it (forbes.com). |
| 15 | One trusted publisher and the vendor's marketing page, in a `certifications` finding | TRUSTED_PRESS (one) and a VENDOR self-claim | High (the vendor page is a credible publisher) | **Medium** | Medium: one trusted publisher reports it (…). |
| 16 | The vendor's status page lists a long outage | the status host, VENDOR statement | Low (one record; replay case 19) | **High** (H2) | High: the vendor states it on its own pages (status.vendor.com). |
| 17 | A Have I Been Pwned breach entry | `haveibeenpwned.com`, UNVERIFIED (a lookup, §2.8) | Low | **Low** | Low: only unverified sources report it (haveibeenpwned.com). |
| 18 | A law firm's investor alert on a paid wire | a release that does not name the vendor's domain, so UNVERIFIED | Low (aggregator) | **Low** | Low: only unverified sources report it (businesswire.com). |

---

## D6. Evaluation plan

### D6.1 The existing replay cases

The reason for every change below is brief §2.5: the model no longer gives a confidence and the label is computed.

- **Remove `confidence`** from the recorded analysis of the 18 cases that have findings (01, 03, 04, 06, 07, 08, 10 to 21).
- **Add the expected label** to each expected finding (`credibility` on `ExpectedFinding` in `eval/types.ts`), with the values of Appendix B.
- **Replace `maxOverconfident` by `maxMislabelled: 0`** in the 21 cases: a kept finding whose label differs from the label of its expected finding. `overconfident` leaves `scorer.ts`; its own publisher key stays for the duplicate measures (R15).
- Case 18 (SEC) expects Low with the note until Q3; case 20 expects the note.
- Every case whose label changes gets one sentence in its comment saying why (Appendix B). The cases use `.example` hosts for publishers on purpose; under the registry these are UNVERIFIED, which is what the six Medium-to-Low changes show.

### D6.2 New replay cases

One for each worked case that no existing case covers. The runner takes the VRDB's answer from the case (`recording.vrdb`: records with their source, status, match strength and data date, and the coverage), the way it takes `recording.records` today; no database, no network.

| Case | Worked case | Expected |
|---|---|---|
| 22 `two-trusted-publishers` | 2 | High |
| 23 `syndicated-copies` | 4 | Medium; a variant without canonical links: Low |
| 24 `user-content-only` | 5 | Low |
| 25 `vendor-self-claim` | 6 | Low |
| 26 `vendor-incident-notice` | 7 | High |
| 27 `regulator-page` | 8 | High |
| 28 `rejected-cve` | 10 | the record is not offered; no finding |
| 29 `delisted-sanctions-entry` | 11 | not offered; no finding |
| 30 `stale-source` | 12 | High with "as of"; coverage `stale` |
| 31 `same-name-on-two-lists` | 9, OFAC and UK entries of one name | one finding, Low, the note |
| 32 `unconfirmed-trusted-snippets` | 13 | Medium |
| 33 `contributor-page` | 14 | Low |

### D6.3 Unit tests, written before the code

- **`sourceRegistry/__tests__/classify.test.ts`:** a host and its subdomains; the longest match wins; suffix rules (`example.gov` yes, `notgov.com` no, `x.gov.uk`, `.int`, `europa.eu`); the vendor's domains first; BLOCKED; DOWNGRADE per host and G1; SYNDICATED with and without a canonical URL on a registry host; a wire with and without an e-mail on the vendor's domain in its text (Q27); user content on the vendor's domain and on a platform that is its website (Q25); an EDGAR filing, a public comment and a RECAP filing against the official pages of the same hosts (Q26); an unknown host is UNVERIFIED and unreviewed; a record is classified by its source, not its host.
- **`sourceRegistry/__tests__/entries.test.ts`**, the registry's hygiene: every entry has a reason, evidence with a status and a review date; hosts are lowercase and unique; no TRUSTED_PRESS entry is without evidence; a review older than 12 months is printed, one older than 18 months fails.
- **`__tests__/credibility.test.ts`:** one test per worked case (18 and 9b), plus an inactive record, a weak record with two trusted publishers (High and the note under the recommended answer to Q24), a vendor statement with an unknown site (High), a self-claim with one trusted publisher (Medium), only contradicted sources (Low), an unconfirmed official page (Medium), and the content of the basis.
- **Connectors**, with fixtures written from the documented formats and not copied from the real lists, so that no personal data enters the repository: KEV (fields, `dateAdded`, removal by diff), OFAC (CSV without a header, `-0-`, entities only, the ALT join), UK (XSD 4.33.3 fields, entities only, website and registration number keys), EU (XSD 1.1, `classificationCode` E and P, `delistingDate`); later UN, CVE (`REJECTED`), NVD and SEC.
- **`vrdb/__tests__/sync.test.ts`:** insert, update on a changed record, an unchanged hash, delisting by diff, the shrink guard, a parse failure that keeps the mirror, the sync run rows, staleness.
- **`vrdb/__tests__/lookup.test.ts`:** keys, one query, strong and weak, the match rows, the caps, the coverage, the off switch.
- **Integration:** `tests/integration/vrdb.sync.test.ts`, `tests/integration/vrdb.lookup.test.ts`, `tests/integration/tenant-isolation/vendor-vrdb-matches.isolation.test.ts`, and the audit script.
- **Client:** `FindingRow` (the chip, the rationale of every rule, the note, the badges, an inactive record), `RunSummary` (the checked sources, "No records in … as of …", stale sources, the counts, "Public databases turned off"), and the i18n test for de, fr and es.

No test reaches the network: fixtures and fake fetches, as today.

### D6.4 Golden set

24 vendors, one per profile below, run live with the flag off and on (keyless sources, the organisation's LLM key) and compared with a person's labels.

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

**What I need from you for each vendor:** (1) confirm the vendor (name, website, other names) and that it fits its profile; I can propose candidates in Phase 2 after checking each against its profile; (2) the risks a careful analyst would raise from public sources inside each category's lookback, each with the sources they would cite; (3) the label they would give each under D5; (4) the traps: findings that must not appear (another company of the same name, a delisted entry, a rejected CVE, an old event). That is about 30 to 45 minutes per vendor.

**Proposed bars** for turning the flag on by default: precision of at least 0.9; recall not below the flag-off run; label agreement of at least 80 %; no finding labelled High that the labeller rates Low; no sanctions finding that states a match as a fact; the coverage block right for every vendor.

---

## D7. Risks and open questions

### Open questions (each with a recommendation)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Should vendors get identifiers (country, company registration number, LEI, SEC CIK)? They would turn name-only matches strong: the UK list carries registration numbers and websites, the EU list identification numbers. | Yes, as optional fields on `vendors` in M2; no parallel identity table. Not in the MVP. |
| Q2 | Is the EU list's fixed public token keyless? | Yes: the operator publishes it to everyone in its own feed; read the file URLs from that feed at every sync, so no token sits in our code or configuration. If no, the EU list moves to later. |
| Q3 | A CIK found by name alone: strong (brief §2.6, "the vendor's own SEC CIK") or weak (a name match)? | Weak until a second identifier confirms it (a CIK stored on the vendor, Q1). SEC is M2. |
| Q4 | The SEC asks for a User-Agent with a company name and a contact e-mail; ours has a URL and no e-mail. Which address may it carry? | A role address VerifyWise controls, chosen by you, as a constant in code (not a setting). **Decided on 2026-10-31:** `tech@verifywise.ai`, the Technical Support address that verifywise.ai/contact publishes (a role address on VerifyWise's own domain, not a person's), held as the constant `SEC_CONTACT` in `vrdb/gates.ts`. The User-Agent is `VerifyWise tech@verifywise.ai`, the form the SEC asks for. The gate is open. |
| Q5 | OFAC publishes no licence. Does 17 U.S.C. §105 cover the SDN files for storing them and showing derived data commercially? | Build the MVP behind the flag; get a legal confirmation before the flag is on by default. **Decided on 2026-10-31:** accepted by the product owner on 2026-10-31, without a separate legal review. |
| Q6 | The UN terms of use could not be read here. | A person reads them in a normal browser; the UN list waits until then. **Decided on 2026-10-31** (the terms were read that day): they allow personal, non-commercial use only, the copyright page reserves every other use (storage in a retrieval system included) for written permission, and UN Publications asks for written permission to reuse content from a UN database. That fails D2's criterion (d), as the World Bank's terms do (D2.9). The gate stays closed (`UN_PERMISSION_GRANTED = false`) and opens only with the UN's written permission, which is not sought: the UK list holds all 274 UN entities, 269 with their UN reference number, which UK and EU records now show (D2.5). The connector was checked against the real file the same day and stays behind the gate. |
| Q7 | The CVE terms require MITRE's copyright notice and the licence with every copy and do not mention commercial use; the full archive is about 650 MB. | A legal review before M2; then mirror only the fields we need for CVEs inside the lookback, and store the notice with them. Before the gate opens (M2 final review): refuse a scheduled sync while no baseline set the cursor (`no_baseline`; done 2026-10-31); let the baseline's batches leave `last_outcome` and `last_success_at` alone until its last apply (done 2026-10-31); decide whether one record that does not parse fails its day; retire the stored copy of a record whose change no longer passes the filter, as the NVD read-through does; date a rejection by the record's `dateRejected` (done 2026-10-31). **Decided on 2026-10-31:** accepted by the product owner on 2026-10-31, without a separate legal review. The remaining items are done: a day applies the records it can read and leaves out, and counts, the entries it cannot, and fails as `parse_errors` only when they number more than max(10, 1% of its record entries); a day without an end-of-day release is read from its last hourly release (the tags of the day, listed through the `git/matching-refs` request) and refused only when it has no release at all; a stored record whose change no longer passes the filter is retired as the NVD read-through does (its keys off, its content hash invalidated, its status kept, except that a rejection the CVE Program has since replaced by a published record becomes active again; no relabel); the baseline is loaded once per deployment by the operator, with `scripts/vrdbCveBaseline.ts`, and nothing downloads it. The gate is open. The notice is stored with the copy: MITRE's copyright designation as the attribution and the CVE Usage paragraph as the licence. |
| Q8 | The unverified government suffixes (`.mil`, `bund.de`, `gc.ca`, `govt.nz`, `gov.br` and the generic country patterns of `GOVERNMENT_HOST`): keep (no change) or limit to the verified ones? | Keep them provisionally; verify them in the review before the flag is on by default; drop what cannot be verified. **Decided on 2026-10-31:** narrowed to explicit hosts, and the regex removed (87% of the 1,240 names it matched were ordinary registrations). Kept: `.mil`, `gc.ca`, `gov.br`, `go.id`, `go.th`, `go.tz` (V), `bund.de` (P) and twelve exact pairs whose rule or holder was read (`gov.sg`, `gov.my`, `gov.pk`, `gob.pk`, `gov.lk`, `gov.za`, `gov.co`, `gov.pl`, `gov.hk`, `gob.gt`, `gov.de`, `gov.fi`). Dropped, so that their hosts are unverified until a person reads their rule: `govt.nz`, `go.ke`, `go.ug`, `gov.ug`, `gov.ie`. Registry `sr-5`. |
| Q9 | 37 TRUSTED_PRESS entries could not be read here and 11 only from snippets: keep them provisionally? | Keep them (no change in behaviour); a person verifies them before the flag is on by default. **Decided on 2026-10-31**, with a rule on evidence: a page counts as evidence for a publisher only when its site's `robots.txt` does not bar Anthropic's agents. `bbc`, `theguardian` (on its editorial code alone, since theguardian.com bars Claude-User), `usatoday`, `cnbc`, `smh`, `bloomberg`, `washingtonpost`, `forbes`, `cbc`, `darkreading` and `scworld` took the reason, the evidence and the paths to downgrade that Q9 gave them; `thehackernews` is unverified; `npr`, `cnn`, `cnet`, `axios`, `spiegel` and the other publishers carried over stay as they were, with their review of 2026-10-29. Registry `sr-5`. |
| Q10 | Entries whose own pages show a gap: `krebsonsecurity.com` (one author, no editorial oversight shown), `iapp.org` (contributed opinion on news paths), unmarked contributed or sponsored content (`securityweek.com`, `theinformation.com`, `thehackernews.com`, `helpnetsecurity.com`, `bankinfosecurity.com`), no corrections policy found on 17 sites, and VentureBeat's press releases under `/business/`. | Make `krebsonsecurity.com` UNVERIFIED; keep the others as TRUSTED_PRESS with the path rules that could be verified, and review them first. |
| Q11 | Apply the generic DOWNGRADE segments (G1) to every TRUSTED_PRESS host? | Yes: deterministic and on the safe side, with the per-host rules on top. |
| Q12 | Rule V for vendor sources (§D5.4), with its known limit. | Accept it for v1. |
| Q13 | Cap unconfirmed snippets at Medium (this changes R26). | Yes. |
| Q14 | A wire release counts as VENDOR only when it names the vendor's own domain, otherwise UNVERIFIED. | Yes. |
| Q15 | Block `pastebin.com`? | Yes. |
| Q16 | Rejected, withdrawn and delisted records: not offered to the model; the status job relabels pending findings that cite them; should an organisation also be notified? | No notification in the MVP; the status job in M2. |
| Q17 | Match strength applies to VRDB records, not to web pages (§D5.3). | Confirm. |
| Q18 | Registry reviews: who owns them, and fail the hygiene test at 18 months? | You or a named owner; yes. **Open on 2026-10-31:** no owner is named yet. |
| Q19 | Where to show the attribution (the NVD notice, the OGL statement, "© European Union", MITRE's notice)? | A "Data sources" line in the coverage block and in the docs. |
| Q20 | The backfill of D4.6 (recompute pending findings, keep decided ones). | Confirm. |
| Q21 | The licence of the Bing RSS feed (roadmap idea 36) is still open, and brief §2.2 makes the web search run always. | It stays your decision and is a launch question for the new pipeline as much as for today's. **Decided on 2026-10-31:** Bing is removed (its feed notice, Services Agreement clauses 14.f.i and 3.a.vi, a `robots.txt` that disallows `/search`, an API retired on 2025-08-11 and no route to a licence). A run searches with the engine of its research key: Claude web search for an Anthropic key (about $10 per 1,000 searches), and for every other key the GDELT news index (news only, the last 3 months, one request per 5 seconds per address, the project credited). See [Web research toolkit](../../technical/infrastructure/web-research.md#search-engines-q21-decided-2026-10-31). |
| Q22 | The FTC datasets and the HHS breach portal: watch them? | Yes; re-check in M3. **Re-checked on 2026-10-31** (Appendix A): none of them, nor the EDPB feed, meets D2's bar yet, so all stay watched and nothing is built. The FTC now lists four enforcement datasets, keyless and in the public domain, but the one of consumer protection covers civil penalty actions only, states no cadence, and whether it holds privacy and data-security cases can be read only in the file, a download that waits for your permission; the HHS exports still have no stable address, no record id and no readable terms. **Decided on 2026-10-31:** keep watching, build nothing. The one file that could have changed the answer, the FTC's consumer protection civil penalty actions, was refused with a 403 when this phase tried to read it, so its columns and whether it holds privacy and data-security cases stay unverified. |
| Q23 | Unknown hosts are reviewed through a maintainer script (hostnames and counts across organisations), not a screen. | Confirm. |
| Q24 | Brief §2.6, "Weak (name only) caps at Low": does the cap hold for the whole finding, or only for what the weak record contributes? Strict: case 9b is Low with the note even when two trusted publishers report this vendor's designation. Contribution only: case 9b is High with the note (§D5.3 step 5). | Contribution only: the verifier and `identity.ts` check the publishers' articles for the vendor's identity independently of the list, and the note still warns the reader. Your reading of the brief decides. |

| Q25 | User content on the vendor's own domain is VENDOR, and so a statement in an event category: a thread on `community.openai.com`, or a member's post on `linkedin.com` when the vendor's website is a LinkedIn page. | Make user content UNVERIFIED before the vendor's own domains (§D3.2 step 1): rule G11 for community and forum hosts and sections, and the platforms of G6–G9 except the vendor's own subdomain of one. |
| Q26 | Documents that others file with an authority share its credit: an 8-K read from `sec.gov` as a page is High with no note, while the same filing as a SEC record is Low with the note (Q3); a public comment on `regulations.gov` is High; a party's filing on CourtListener is an allegation (O20). | DOWNGRADE path rules make them UNVERIFIED: `sec.gov` under `/Archives/` (O21), `regulations.gov` under `/comment/` (O22), `storage.courtlistener.com` under `/recap/` (O20). The authority's own pages stay OFFICIAL. Once a CIK is stored on the vendor (Q1, M2), an EDGAR filing under that CIK can become VENDOR. |
| Q27 | A wire release that only names the vendor's domain is VENDOR, and a statement in an event category: a security firm's release that links the vendor's advisory. | Narrow Q14: VENDOR only when the release carries an e-mail address on the vendor's own domain; otherwise UNVERIFIED. |
| Q28 | Others file about a company under that company's EDGAR folder: investors' Schedules 13D and 13G, a bidder's SC TO-T, a dissident's DFAN14A, insiders' Forms 3, 4 and 5. Under Q26 a filing under the vendor's stored CIK is VENDOR, so such a document reads as the vendor's own word (M2 final review, Minor 8). The address does not tell the filer: the accession number starts with the CIK of whoever submitted it, often a filing agent for the company's own filings. | Open, raised 2026-10-31. Once Q4 opens, read the filer from the filing's index and keep VENDOR only for a filing the vendor filed, UNVERIFIED otherwise; until then the Q26 rule stands. Your decision. **Decided and built on 2026-10-31** (Q4 is open): the filer is read from the filing's SGML header (`https://www.sec.gov/Archives/edgar/data/<cik>/<accession without dashes>/<accession>.hdr.sgml`, which the SEC documents), and a filing under the vendor's stored CIK stays VENDOR only when that CIK holds a FILER, FILED-BY or REPORTING-OWNER role; as the SUBJECT-COMPANY or ISSUER only, absent, or when the header cannot be read, the filing is UNVERIFIED and downgraded (Q26, registry `sr-5`). Checked on 2026-10-31 on three filings under CIK 0000320193: the company's own 10-K has a FILER block, a Schedule 13G has SUBJECT-COMPANY and FILED-BY, and a Form 4 has REPORTING-OWNER and ISSUER. |

**Answered on 2026-10-29:** every recommendation of Q1–Q24 is accepted. **Q25–Q27**, raised by M0's final review, were answered on 2026-10-30 with their recommendations; you asked for them to be taken as given. **Decided on 2026-10-31:** Q4 (named: `tech@verifywise.ai`), Q5, Q6 (the UN gate stays closed), Q7, Q8, Q9, Q21, Q22 and Q28; see their rows. One answer still needs a name: the owner of Q18 (you, until you name another).

### Risks

- **A. Sanctions name matches.** Naming a company as sanctioned when the entry is another company is the largest exposure. Mitigations: entities only; name-only matches are Low with the note; the text says "an entity named … is on …", never "the vendor is sanctioned"; a person must accept a finding before it reaches the register; the list's date is shown; delistings are tracked; no automatic notification. OFAC itself does not confirm potential matches and says many are false positives ([FAQ topic](https://ofac.treasury.gov/faqs/topic/1591)).
- **B. Personal data.** The UK, EU and UN files include individuals (the UK file has birth dates and passport numbers); parsing drops them before anything is stored, and the OGL does not license personal data anyway.
- **C. Registry maintenance.** 109 entries to review yearly, among them 48 of the 79 publishers and 6 of the 20 OFFICIAL entries that still wait for a readable page; every change is a pull request and a new `REGISTRY_VERSION`.
- **D. Rate limits and cost.** Every deployment downloads the lists itself: KEV 1.8 MB on change, OFAC about 7 MB (`SDN.CSV` and `ALT.CSV`, R39), UK 22 MB of XML, EU about 26 MB. With `ETag`, `Last-Modified` and the hash, most syncs end as `unchanged`. The NVD's keyless limit (5 per 30 s) is per client, so several workers must share one spacer (Redis, M2). The SEC allows 10 per second; we use far less.
- **E. Storage.** Row counts were not measured, since no list was downloaded; the UN list has 274 entities, and the file sizes suggest the entities of all four sanctions lists stay small. A CVE mirror is the large one, hence the subset of Q7.
- **F. Format changes.** The UK list gained three file types and a new format guide at the end of 2025; the KEV schema changes a few times a year; OFAC's CSV has no header and its file names differ from its labels; cvelistV5's asset names are irregular, and it has had three days without an end-of-day release since 2025 (2025-01-13, 2026-06-20 and 2026-07-19), which the connector reads from the day's last hourly release. Connectors validate what they parse and fail the sync rather than delist; every format has fixture tests.
- **G. The NVD covers less.** Since 15 April 2026 most new CVEs are not enriched, so they have no CPE data and `virtualMatchString` misses them. This already affects today's lookup (R34). The answer is matching on the CVE records' `affected` vendor and product (M2), since the NVD's own `affected` lists cannot be filtered.
- **H. Excluded by the keyless rule:** SAM.gov, the NVD with a key, the FTC API, the World Bank's internal endpoint (D2.12), and the aggregators of §2.3.
- **I. What the eval cannot see.** Replay cases with `.example` hosts do not test whether the registry is right about real publishers; the golden set does.
- **J. Shared state.** `vrdb_lookups` shows which vendor keys were looked up, without the organisation; it is read only by the server.
- **K. Positive claims on trust pages** get High under rule V (Q12).

---

## D8. Phase 2 milestones

No commit, push or pull request without your explicit permission at any milestone.

- **M0. Rules in code** (no database, no UI). The registry v0 (D3) with the answers to Q8–Q15, the classifier, the credibility function and their unit tests; the eval's types and scorer; the updates of the existing cases; new replay cases 22–27 and 31–33 with a fake VRDB answer; prompt `vr-7` and the schema without `confidence` behind `VENDOR_RESEARCH_VRDB`. Gate: the Servers unit suite, the eval ratchet, `format-check` in Servers and Clients, and a scratch tsconfig typecheck of `services/` (the project's tsc does not check it).
- **M1. MVP, behind the flag.** The migrations (the shared `vrdb_*` tables, `vendor_vrdb_matches`, the findings' `credibility`, `credibility_basis` and source fields, the runs' `coverage` and `registry_version`); the KEV, OFAC and UK connectors, and the EU connector if Q2 is yes, with their sync jobs, schedulers, retries and staleness; the VRDB lookup in place of the per-run KEV and OFAC lookups (NVD, SEC, HIBP and the status page unchanged); credibility end to end (API, chip, rationale, note); the source badges; the coverage block; the strings (server en, de, fr where needed; client de, fr, es); the isolation registry entry, test and audit entry; replay cases 28–30; the docs and the user guide. Gate: both `format-check`s, the Servers build and unit suite, the integration shards, the Clients typecheck, build and vitest, the audit, a browser smoke on throwaway services, the golden-set run with the flag off and on, Q5 and Q9 answered, and your approval to turn the flag on by default.
- **M2. Expansion.** The NVD read-through (a shared Redis spacer) and the SEC read-through (after Q3 and Q4); the CVE mirror (after Q7: `REJECTED`, vendor and product); the status job that relabels pending findings citing a rejected, withdrawn or delisted record; the UN list (built and checked against the real file; Q6 keeps it behind its closed gate, since the UN's terms allow personal, non-commercial use only); the unknown-host script; vendor identifiers (Q1).
- **M3. Contract.** The backfill (D4.6), dropping `confidence`, removing the old path (the per-run KEV, NVD, SEC and OFAC lookups, `sourceTiers.ts`, `confidenceCeiling`) and the flag; re-checking the watched sources (FTC datasets, the HHS export, the EDPB feed, and the EU AI Act database after 2 December 2027). **Done on this branch (2026-10-31 and after):** the backfill, the re-check of the watched sources (Q22: none meets D2's bar, nothing built) and Part B1, which removed the old path and the flag; the database is always on, and the run's own SEC lookup is gone with the others. **B2**, which drops the `confidence` column, is on `feature/vendor-finding-drop-confidence` for release N+1. The gates Q4 and Q7 are open and Q6 alone stays closed.

---

## Appendix A. Verification log (2026-10-29)

Pages read on the operator's own site, grouped by source; "observed" facts come from headers or small probes. Pages that could not be read are listed as such.

- **CISA KEV:** [catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) (operator, formats); [schema](https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities_schema.json) (fields, no status or modification date); [licence](https://www.cisa.gov/sites/default/files/licenses/kev/license.txt) (CC0, commercial use); [kev-data README](https://github.com/cisagov/kev-data) and [LICENSE](https://raw.githubusercontent.com/cisagov/kev-data/develop/LICENSE) (cadence, same licence); [contributing](https://raw.githubusercontent.com/cisagov/kev-data/develop/CONTRIBUTING.md) (no change log); [BOD 26-04 guidance](https://www.cisa.gov/news-events/directives/bod-26-04-implementation-guidance-prioritizing-security-updates-based-risk) (removals are rare); removal alerts of [2023-10-04](https://www.cisa.gov/news-events/alerts/2023/10/04/cisa-adds-two-known-exploited-vulnerabilities-catalog-removes-five-kevs) and [2023-12-01](https://www.cisa.gov/news-events/alerts/2023/12/01/cisa-removes-one-known-exploited-vulnerability-catalog). Observed: JSON 1.8 MB, `ETag`, `Last-Modified`.
- **OFAC:** [other lists](https://ofac.treasury.gov/other-ofac-sanctions-lists) (SLS is primary); [SDN static page](https://sanctionslist.ofac.treas.gov/Home/static/sdn.html) and [consolidated page](https://sanctionslist.ofac.treas.gov/Home/static/consolidated.html) (file labels and hosts); [data spec](https://ofac.treasury.gov/media/29976/download?inline=) and [flat-file tutorial](https://ofac.treasury.gov/sdn-list-data-formats-data-schemas/tutorial-on-the-use-of-list-related-legacy-flat-files) (columns, no header, numbers not reused); [program tags](https://ofac.treasury.gov/specially-designated-nationals-list-sdn-list/program-tag-definitions-for-ofac-sanctions-lists); FAQs [20](https://ofac.treasury.gov/faqs/20) (no timetable), [88](https://ofac.treasury.gov/faqs/88) (no advice on automated downloads; re-evaluate a download schedule), [90](https://ofac.treasury.gov/faqs/90) (delta file, full refresh), [287](https://ofac.treasury.gov/faqs/287) (search tool not for automation), [1031](https://ofac.treasury.gov/faqs/1031) (UIDs; a list of UIDs for a clerical update), [topic 1591](https://ofac.treasury.gov/faqs/topic/1591) (matches not confirmed); [recent actions](https://ofac.treasury.gov/recent-actions) (sanctions list updates on 11 days of October 2026); [archive of changes](https://ofac.treasury.gov/specially-designated-nationals-list-sdn-list/archive-of-changes-to-the-sdn-list) (no history kept); Treasury [site policies](https://home.treasury.gov/subfooter/site-policies-and-notices) and [privacy policy](https://home.treasury.gov/subfooter/privacy-policy) (no reuse statement; no-warranty disclaimer; also read in the browser pane); [17 U.S.C. §105](https://www.copyright.gov/title17/92chap1.html). Observed: `ALT.CSV` ranged GET 206 `text/csv` after a redirect; `SDN_ALT.CSV` 200 empty; `SDN.CSV` 206 `text/csv`. Not readable: the SLS API document (a pre-signed link), the delta archive app.
- **UK Sanctions List:** [publication page](https://www.gov.uk/government/publications/the-uk-sanctions-list) (only source since 28 January 2026, OFSI list closed, seven formats, OGL); [single list guidance](https://www.gov.uk/guidance/moving-to-a-single-list-for-uk-sanctions-designations-28-january-2026) (existing formats unchanged, three added, static URLs); [withdrawn OFSI page](https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets); [format guide](https://www.gov.uk/guidance/format-guide-for-the-uk-sanctions-list) (fields); [XSD 4.33.3](https://assets.publishing.service.gov.uk/media/6916e72cdb01ecfcf96fc96b/SanctionsListSchema-4.33.3.xsd); [search tool guide](https://www.gov.uk/government/publications/the-uk-sanctions-list/uk-sanctions-list-search-tool-user-guide); [OGL v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Observed: XML 22 MB, CSV 50 MB, `ETag`, `Last-Modified` 2026-10-29.
- **EU FSF:** [DG FISMA overview](https://finance.ec.europa.eu/eu-and-world/sanctions-restrictive-measures/overview-sanctions-and-related-resources_en); [data.europa.eu record](https://data.europa.eu/api/hub/search/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions) (distributions, licences, daily); [FSF RSS](https://webgate.ec.europa.eu/fsd/fsf/public/rss) (file URLs with the fixed token); XSD 1.1 (fields; read through its feed URL); [legacy help page](https://ec.europa.eu/external_relations/cfsp/sanctions/list/version4/global/help_online/process_xmlfiles.html) (old `DELTA.XML`); [Commission legal notice](https://commission.europa.eu/legal-notice_en); [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Not readable: the FSF application, the user manual PDF, the text of Decision 2011/833/EU (EUR-Lex bot check).
- **UN:** [list page](https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list), read in the browser pane (XML, HTML and PDF links, 274 entities, last update 29 October 2026, press release after each change, reference numbers, entity fields). Observed: XML ranged GET 206 `application/xml`. Not readable: [terms of use](https://www.un.org/en/about-us/terms-of-use) and [copyright](https://www.un.org/en/about-us/copyright) (403 in the browser pane too). **Read on 2026-10-31 (Q6):** the terms of use and copyright pages (in a browser, and again with a page reader) and UN Publications' [rights and permissions](https://shop.un.org/rights-permissions) page. Downloaded once each with permission, into a scratch directory, for structure and counts only: the UN XML (generated 2026-10-30), the UK XML (2026-10-30) and the EU XML 1.1 (generated 2026-10-23); the M2 connectors read them with no error (274, 1,667 and 1,779 records). Observed: the redirect to `unsolprodfiles.blob.core.windows.net`, `application/xml`, 2,177,571 bytes, `ETag` and `Last-Modified`; the HTML list has no anchor per entry; the schema the file names answered 403.
- **CVE Program:** [cvelistV5](https://github.com/CVEProject/cvelistV5) and its [README](https://raw.githubusercontent.com/CVEProject/cvelistV5/main/README.md) (layout, cadence, baseline and delta files, deltaLog); [releases](https://github.com/CVEProject/cvelistV5/releases) (asset names); [record format schema](https://raw.githubusercontent.com/CVEProject/cve-schema/main/schema/CVE_Record_Format.json) (state, `affected`); [terms of use](https://www.cve.org/Legal/TermsOfUse) (grant and notice); [downloads](https://www.cve.org/Downloads); [FAQs](https://www.cve.org/ResourcesSupport/FAQs) (a rejected record stays on the list and should be ignored; read in the browser pane). Observed: baseline 646 MB, delta 4.7 MB, deltaLog 35 MB.
- **NVD:** [CVE API](https://nvd.nist.gov/developers/vulnerabilities) (parameters, 120 days, fields); [start here](https://nvd.nist.gov/developers/start-here) (limits, sleep, notice, public domain); [API key request](https://nvd.nist.gov/developers/request-an-api-key) (terms; a key needs an organisation name, an e-mail address and an organisation type); [FAQ](https://nvd.nist.gov/general/FAQ-Sections/General-FAQs) (hourly processing); [vulnerability status](https://nvd.nist.gov/vuln/vulnerability-status) (Deferred); [CVE process](https://nvd.nist.gov/general/cve-process) (enrichment adds CPE); [dashboard](https://nvd.nist.gov/general/nvd-dashboard); [data feeds](https://nvd.nist.gov/vuln/data-feeds); [NVD at NIST](https://www.nist.gov/itl/nvd) (15 April 2026 priorities, 17 June 2026 `affected`); [NIST news, April 2026](https://www.nist.gov/news-events/news/2026/04/nist-updates-nvd-operations-address-record-cve-growth); [NIST copyrights](https://www.nist.gov/copyrights-disclaimers).
- **SEC:** [accessing EDGAR data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data) (10 per second, User-Agent); [developer resources](https://www.sec.gov/about/developer-resources); [webmaster FAQ](https://www.sec.gov/about/webmaster-frequently-asked-questions) (reuse); [privacy information](https://www.sec.gov/about/privacy-information); [EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) (no key; submissions); [Item 1.05 press release](https://www.sec.gov/newsroom/press-releases/2023-139) and [statement](https://www.sec.gov/newsroom/speeches-statements/gerding-cybersecurity-incidents-05212024). Observed: 403 without a User-Agent; 200 with ours.
- **World Bank:** [list page](https://www.worldbank.org/en/projects-operations/procurement/debarred-firms) (script-loaded, every 3 hours); [terms](https://www.worldbank.org/en/about/legal/terms-and-conditions) (non-commercial); [dataset terms](https://www.worldbank.org/ext/en/legal/terms-conditions/datasets) (CC BY 4.0); [data catalog search](https://datacatalog.worldbank.org/search?q=debarred) (inconclusive); [sanctions system](https://www.worldbank.org/en/about/unit/sanctions-system/osd).
- **Regulators:** ICO [enforcement](https://ico.org.uk/action-weve-taken/enforcement/), [RSS feeds](https://ico.org.uk/global/rss-feeds/), [retention](https://ico.org.uk/action-weve-taken/retention-period-for-undertakings-enforcement-notices-and-civil-monetary-penalties/), [incident trends](https://ico.org.uk/action-weve-taken/data-security-incident-trends/), [re-use](https://ico.org.uk/global/copyright-and-re-use-of-materials/); EDPB [register](https://www.edpb.europa.eu/our-work-tools/consistency-findings/register-for-article-60-final-decisions_en), [national news](https://www.edpb.europa.eu/news/national-news_en), [copyright](https://www.edpb.europa.eu/copyright_en); CNIL [sanctions dataset](https://www.data.gouv.fr/fr/datasets/sanctions-prononcees-par-la-cnil/), [deliberations](https://www.data.gouv.fr/datasets/les-deliberations-de-la-cnil/), [sanctions page](https://www.cnil.fr/fr/les-sanctions-prononcees-par-la-cnil), [Etalab 2.0](https://www.data.gouv.fr/pages/legal/licences/etalab-2.0); FTC [cases](https://www.ftc.gov/legal-library/browse/cases-proceedings), [RSS feeds](https://www.ftc.gov/news-events/stay-connected/ftc-rss-feeds), [developer](https://www.ftc.gov/developer), [data sets](https://www.ftc.gov/policy-notices/open-government/data-sets), [website policy](https://www.ftc.gov/policy-notices/website-policy); HHS [breach portal](https://ocrportal.hhs.gov/ocr/breach/breach_report_hip.jsf) (hhs.gov pages answered 403).
- **EU AI Act:** [Art. 71](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-71), [Art. 49](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-49), [Annex VIII](https://ai-act-service-desk.ec.europa.eu/en/ai-act/annex-8), [Art. 113](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-113), [navigating the AI Act](https://digital-strategy.ec.europa.eu/en/faqs/navigating-ai-act), [AI Omnibus in force](https://digital-strategy.ec.europa.eu/en/news/ai-omnibus-enters-force).
- **SAM.gov:** [Exclusions API](https://open.gsa.gov/api/exclusions-api/), [entity extracts](https://open.gsa.gov/api/sam-entity-extracts-api/).
- **Suffix rules:** the links of O1–O8; for `.mil` only the [IANA record](https://www.iana.org/domains/root/db/mil.html); `bund.de`, `gc.ca` (a usage rule only, [Canada.ca](https://design.canada.ca/specifications/mandatory-elements/domains-urls.html)), `govt.nz` and `gov.br` (a superseded 2008 text, [CGI.br](https://www.cgi.br/resolucoes/documento/2008/008/)) could not be verified.
- **Publishers:** the links in the TRUSTED_PRESS table. The environment refused these hosts to automated readers, so nothing could be read for them: apnews.com, bbc.com, bbc.co.uk, nytimes.com, wsj.com, ft.com, economist.com, theguardian.com, usatoday.com, latimes.com, theatlantic.com, newyorker.com, marketwatch.com, barrons.com, cnbc.com, politico.com, politico.eu, euractiv.com, dw.com, independent.co.uk, telegraph.co.uk, thetimes.co.uk, smh.com.au, straitstimes.com, thehindu.com, lemonde.fr, lefigaro.fr, zeit.de, faz.net, sueddeutsche.de, elpais.com, corriere.it, repubblica.it, nrc.nl, theverge.com, wired.com, arstechnica.com, zdnet.com, cnet.com.
- **Wires, aggregators, platforms:** the links in rules G3–G10, and [Flipboard](https://flipboard.com/), [SmartNews](https://about.smartnews.com/en/), [Apple News](https://www.apple.com/apple-news/), [NewsNow](https://www.newsnow.co.uk/about/), [Dailyhunt](https://dailyhunt.in/) (title only), [Feedly](https://docs.feedly.com/article/523-getting-started-with-feedly), [Instagram](https://about.instagram.com/about-us). Not readable: businesswire.com, globenewswire.com, accesswire.com, reddit.com, quora.com, medium.com, x.com, archive.ph.
- **Checks after writing (2026-10-29):** every one of the 212 addresses in this document was requested again (a header request, else a 200-byte range). None of the pages answered 404; 15 did not answer 200 to our reader: 403 from 9 (the S entries, openPR and the UN's terms), 429 rate limits from 3 (Article 71 was read again afterwards), 406 from 1 (time.com) and 2 timeouts; the bare OFAC export path answers 404 because it is a prefix, not a page. The claims that rested on one page were read again (OFAC FAQs 88 and 1031 and Recent Actions, the UK guidance and format guide, the SEC's API page, the NVD FAQ and key page, the CVE FAQ, the EDPB register, the FTC library, the HHS portal, CNIL, The Record, CISA's guidance, Article 71), and four sentences were corrected: the October OFAC dates, the UK format change, the EDPB example id and ruling R36. The code facts of D1 (paths, lines, list sizes 16, 43 and 81) and the replay (21 cases, 0 regressions) were checked against the branch.
- **Re-checked on 2026-10-31 (M3):** the watched sources of Q22 and the EDPB feed, read again on the operators' own pages; the list files were probed by header requests only, and none was downloaded.
  - **FTC:** the [data sets](https://www.ftc.gov/policy-notices/open-government/data-sets) page now lists four enforcement datasets, covering fiscal years from 1996 (2000 for the last) into 2026: the nonmerger enforcement actions, the merger enforcement actions and the civil penalty actions of the competition mission, as CSV, and the civil penalty actions of the consumer protection mission, labelled CSV but an Excel workbook. No cadence is stated, and the page as read today names no fields, so the four fields recorded on 2026-10-29 are UNVERIFIED until the data dictionaries are read. Observed: with the bot's User-Agent the four files answer a header request with 200 (with curl's default one, 403), 9 KB to 101 KB, `Last-Modified` 18 September 2026 for the three of competition and 16 October 2026 for the one of consumer protection. The [Legal Library](https://www.ftc.gov/legal-library/browse/cases-proceedings) still lists 6,124 items, Commissioner statements among them, so not all are cases; its titles name companies, and it filters by topic ("Privacy and Security", with "Data Security"), but it offers no feed or export of cases (the foot of the page could not be read, so an export link there is UNVERIFIED). The [RSS feeds](https://www.ftc.gov/news-events/stay-connected/ftc-rss-feeds) carry press releases, blogs and others, none of cases; the [API](https://www.ftc.gov/developer) still covers Do Not Call complaints and HSR early-termination notices only, with an api.data.gov key; the [website policy](https://www.ftc.gov/policy-notices/website-policy) still makes most material a work of the US Government in the public domain, asking for attribution where feasible and no implied endorsement. Change: the four datasets and their coverage; otherwise no change.
  - **HHS OCR:** the [breach portal](https://ocrportal.hhs.gov/ocr/breach/breach_report_hip.jsf) lists 765 breaches under investigation (761 on 2026-10-29) in nine columns, none of them an id; its Excel, PDF, CSV and XML exports are still actions of the page's script, with no stable address, and so is its archive tab; it asks for no key or account; the portal shows no terms, and hhs.gov answered 403 again (UNVERIFIED). It names the covered entities, persons among them. Change: the count; otherwise no change.
  - **EDPB:** the [register](https://www.edpb.europa.eu/our-work-tools/consistency-findings/register-for-article-60-final-decisions_en) still has no controller field and no structured export, one PDF per decision; it filters by authority, legal reference, topic, outcome and date (filters the 2026-10-29 record did not mention); a current id is `EDPBI:EE:OSS:D:2026:4265`. The [feed](https://www.edpb.europa.eu/feed/news_en), the only one the [national news](https://www.edpb.europa.eu/news/national-news_en) page links, is RSS 2.0 titled "EDPB News" and mixes EDPB and national items (nine of its latest ten were national); most titles name a company, and some descriptions add a "Controller:" line in their text, not as a field. Observed: 200, `application/rss+xml`, `ETag`, `Last-Modified`. The page says the national items are not EDPB communications: they are the national authorities' own news, an authority's word all the same, so `edpb.europa.eu` stays OFFICIAL under the `europa.eu` rule. [Reuse](https://www.edpb.europa.eu/copyright_en) is still authorized for commercial and non-commercial purposes, with the source acknowledged. No change.
  - **Result:** none of them meets D2's bar, so all stay watched and nothing is built. The FTC's consumer protection file comes closest (official, keyless, public domain, 33 KB); whether it holds privacy and data-security cases with matter numbers and company names can be settled only by reading it, a list-file download that waits for your permission. The EU AI Act database stays on the human list: check it again, not before 2 December 2027. **Tried again on 2026-10-31 (Phase 2):** the FTC's consumer protection file (`civil_penalty_cases_fy2000-2026.xlsx`), its dictionary and the data sets page answered 403 to header requests with a plain user agent, and nothing was done to get past the refusal, so the file's columns, its row count and whether it holds privacy and data-security cases are still unverified. Q22 was decided on that basis: keep watching, build nothing.

## Appendix B. The replay cases today and under the proposal

From `npm run eval:vendor-research` on 2026-10-29 (21 cases, 22 findings kept). "Today" is the stored confidence.

| Case | Category | Cited sources → registry | Today | Proposed | Why |
|---|---|---|---|---|---|
| breach-two-publishers | security_incidents | `securitywire.com` (UNVERIFIED), the vendor's `/security-notice` (VENDOR statement) | high | **High** | H2 |
| same-story-two-domains | security_incidents | `bbc.co.uk` and `bbc.com` (one trusted publisher), unconfirmed | medium | **Medium** | one trusted publisher |
| identical-pages | legal_regulatory | `lawwire.com` (UNVERIFIED), unconfirmed | low | **Low** | unverified only |
| one-event-three-findings | security_incidents | `financewire.com` (UNVERIFIED), unconfirmed | low | **Low** | unverified only |
| crawl-dated-web-results | security_incidents | `securityarchive.org` (UNVERIFIED), unconfirmed | low | **Low** | unverified only |
| snippet-only-quotes | legal_regulatory | `dailyfinance.example.com`, `hrweekly.com` (UNVERIFIED) | medium | **Low** | two unknown publishers no longer make Medium |
| gathered-sources | security_incidents | `cloudwatchdaily.com`, `securityledger.example` (UNVERIFIED) | medium | **Low** | idem |
| one-loop-per-category | security_incidents | `ledgerwire.example`, `finopsdaily.example` (UNVERIFIED) | medium | **Low** | idem |
| one-loop-per-category | ai_specific | the vendor's `/legal/ai-use` (VENDOR statement: policy page) | medium | **High** | H2 |
| one-loop-per-category | certifications | the vendor's `/trust/soc2-report` (VENDOR statement: trust page) | medium | **High** | H2: the vendor's own page reports an exception |
| quote-not-on-the-page | legal_regulatory | two UNVERIFIED sites, contradicted | low | **Low** | contradicted |
| verifier-drops-findings | legal_regulatory | `dataprotectionnews.example` (UNVERIFIED) | low | **Low** | unverified only |
| long-policy-part | ai_specific | the vendor's `/legal/privacy` (VENDOR statement: policy page) | low | **High** | H2; the model's "low" no longer counts |
| other-names | security_incidents | `securityledger.example`, `cloudwatchdaily.example` (UNVERIFIED) | medium | **Low** | two unknown publishers |
| local-language-news | security_incidents | `journaldunet.example`, `silicon.example` (UNVERIFIED) | medium | **Low** | idem |
| local-language-news | legal_regulatory | `lemonde.example` (UNVERIFIED: not `lemonde.fr`) | low | **Low** | unverified only |
| known-exploited-vulnerability | security_incidents | the KEV record (OFFICIAL, strong) | low | **High** | H1 |
| known-exploited-vulnerability | security_incidents | the HIBP record (UNVERIFIED) | low | **Low** | unverified only |
| sec-cybersecurity-incident-report | security_incidents | the SEC 8-K record (OFFICIAL; CIK by name) | low | **Low** and the note; **High** if Q3 says strong | Q3 |
| status-page-incident-history | availability | the status host (VENDOR statement) | low | **High** | H2 |
| sanctions-list-name-match | legal_regulatory | the OFAC record (OFFICIAL, weak) | low | **Low** and the note | weak match |
| financial-health-layoffs-and-sale | financial_health | `ledgerwire.example`, `fintechbrief.example` (UNVERIFIED) | medium | **Low** | two unknown publishers |

In sum: 10 findings keep their label, 6 go from Medium to Low, and 5 go up to High (6 if Q3 makes the SEC match strong).
