# Vendor research agent — web research agent (delta)

**Status:** awaiting review · **Date:** 2026-10-11 · **Branch:** `feature/vendor-agents-and-risk-page`

This document changes [the 2026-10-10 design](2026-10-10-vendor-research-agent-design.md). Where the two disagree, this one wins. Sections that are not mentioned here stay as they were: the findings and runs tables, the triggers, the cooldown and daily cap, accept and dismiss, the notification and the findings section of the UI.

## 1. Why this changes

The first design searched through a third-party search API (Tavily). That needs an extra account, an API key in the environment and a setup step, and an organisation without it sees "Vendor research is not set up". The product owner does not want a third-party provider. The agent has to use the LLM key that the organisation already added (for example a Custom key) and reach the web itself.

So the research stage becomes a real agent: an AI SDK tool loop (`ai` 7, already in `Servers/package.json`) running on the organisation's own model, with two tools that our code implements: a news search and a guarded page reader. Everything after the agent (the structured analysis, quote checking, de-duplication, caps, accept and dismiss) is the pipeline that exists today.

## 2. Decisions

| Decision | Choice |
|---|---|
| Search provider | None. No Tavily, no provider interface, no search API key, no search environment variable. |
| Model | The organisation's newest LLM key, for the agent and for the analysis (as today). Any model that can call tools. Checked on 2026-10-11 with a Custom (OpenAI-compatible) key that points at DeepSeek: a multi-step tool loop and structured output both work. |
| Web access | Two tools written in our code: `search_news` and `read_page`. The agent browses the vendor's own site and reads news articles; it does not use a general web search engine (§4). |
| What can be cited | Only text that a tool returned in this run: search-result snippets and page excerpts. The model's own knowledge is never evidence. The "model knowledge, unverified" lane that was considered earlier is dropped, and with it a `basis` column. |
| "Not set up" | Only when the organisation has no LLM key. |
| Auto-run | Unchanged: on by default, `VENDOR_RESEARCH_AUTO_RUN=false` turns it off. It no longer waits for a search setup, so every new vendor in an organisation with an LLM key costs one run on that key, bounded by the daily cap (§15). |
| Politeness | The agent says who it is (`VerifyWiseResearchBot`), obeys `robots.txt` and does not imitate a browser. |

## 3. Scope of the change

**Removed:** `tavilyProvider.ts`, `searchProvider.ts`, `searchTypes.ts`, `planCategories` (`categories.ts` keeps only the lookback windows), the environment variables `VENDOR_RESEARCH_SEARCH_PROVIDER` and `TAVILY_API_KEY`, `searchConfigured` in the config endpoint and the UI, the 409 `search_not_configured`, the "Search provider not configured" job path, the `search_provider` column, the setup hint with environment variable names in the UI, and every Tavily mention in docs and deployment files.

**Changed:** the research stage (§5 to §9), the analysis prompt (`PROMPT_VERSION` becomes `vr-2`), the evidence pack, the category summary rules (§10), the run columns (§11), the config endpoint and trigger order (§12), the not-set-up state and the run summary copy in the UI (§13).

**Kept as is:** the two tables apart from §11, trigger types, cooldown, daily cap, stale-run sweep, quote validation, confidence ceiling, de-duplication, caps, accept and dismiss, the notification, tenant isolation.

## 4. What the probes showed (2026-10-11, from a developer machine)

| Source | Result | Used? |
|---|---|---|
| Bing News RSS (`/news/search?q=…&format=rss`) | Answers an identified client. Items have title, description, `pubDate`. The link wraps the publisher URL in an `apiclick.aspx?…&url=` parameter. Bing's `robots.txt` has no rule against `/news/search`. | **Yes**, `search_news` |
| Bing web search RSS (`/search?…&format=rss`) | Answers, but Bing's `robots.txt` disallows `/search` for every crawler. | No |
| DuckDuckGo HTML | Answers a browser User-Agent; an identified client gets a challenge page (HTTP 202, no results). Imitating a browser to get past it is bot-detection evasion. | No |
| Brave, Mojeek | 429 and 403. | No |
| Google News RSS | Article links are JavaScript redirect pages that cannot be read or cited. | No |
| GDELT DOC API | 12 to 17 seconds and no articles for two test queries. | No |
| Vendor pages, `security.txt`, Wikipedia | Read fine. | Yes, `read_page` |
| Some publishers (BleepingComputer: Cloudflare 403) | Blocked. | "Blocked" is a normal outcome (§10) |

Consequences: news categories (`security_incidents`, `legal_regulatory`, and news about AI terms) are researched through the news feed; `certifications` and `ai_specific` are researched by reading the vendor's own site (home page, then the security, trust, privacy, terms, DPA, subprocessor and AI pages it links to), which is how an analyst would do it and needs no search engine. A vendor with no valid domain skips those two categories, as in the first design.

## 5. Architecture

```
Vendor created (auto) ─┐
"Research risks" ──────┴─ create run (queued) · enqueue `vendor_research`                  [unchanged]
        ▼
 worker: runVendorResearch
   1. mark running · target (name, domain, provides) · the organisation's model             [unchanged]
   2. RESEARCH AGENT  generateText + tools, at most 20 steps and 5 minutes                  [new]
        search_news ─► Bing News RSS            dated news, snippets
        read_page ───► the public web           one guarded GET, vendor site and articles
        every snippet and excerpt a tool returned goes to a ledger, tagged with a category
   3. evidence pack from the ledger (S1…Sn, at most 100 KB)                                 [changed]
   4. ANALYSIS  one structured call, no tools, over the pack only                           [prompt changed]
   5. validation · confidence ceiling · de-duplication · caps                               [unchanged]
   6. one transaction: findings + run                                                       [unchanged]
   7. auto run with findings: notify the assignee                                           [unchanged]
```

The agent never writes findings. It collects. The analysis step cannot call tools, sees a fixed snapshot of text, and its quotes are checked by code against that text. A hostile page can mislead the browsing step at most into reading more public pages (§7), never into writing to the register.

Code layout:

- `Servers/services/webResearch/` is a small reusable toolkit, so that later vendor agents can browse too: `publicUrl.ts` (URL and address policy), `guardedFetch.ts`, `robots.ts`, `pageText.ts`, `newsSearch.ts`, `tools.ts` (builds the two AI SDK tools, the ledger, the budgets and the provenance rule).
- `Servers/services/vendorResearch/researchAgent.ts` runs the loop for a vendor; `prompts.ts` holds the agent and analysis prompts.
- `pipeline.ts` replaces the search step with the agent; `PipelineDeps` loses `searchProvider` and gains `research` (injectable, so pipeline tests need no model and no network).

## 6. The two tools

Both tools take a required `category` (one of the four) so that every call is tagged. Both return a small JSON object; a failure is a normal result (`ok: false` with a short fixed reason), never an exception, so the loop continues.

**`search_news({ query, category })`**

- `GET https://www.bing.com/news/search?q=<query>&format=rss&setlang=en-US`, with the identified User-Agent, 12 seconds, at most 1 MB.
- The query is 3 to 200 characters. The tool description tells the model to put the vendor name and topic words in it and nothing else.
- Parsed with jsdom in XML mode: `title`, `description` (the snippet), `pubDate` (stored as an ISO date), and the publisher URL taken from the `url` parameter of the `apiclick.aspx` link (http or https, at most 2,048 characters; an item without one is dropped). At most 10 results.
- **Lookback in code.** Results older than the window of the category are dropped and counted (`omittedOld`): 24 months for `security_incidents`, `certifications` and `ai_specific`, 36 for `legal_regulatory`. The tool tells the model how many were omitted. Without this a run would keep resurfacing incidents from three years ago.
- A body that is not RSS, an HTTP status other than 200, a timeout or a network error is a failed search. The user-facing reason is fixed text ("The news search is not available right now").
- Process-wide: one search at a time, at least one second apart.

**`read_page({ url, category, focus? })`**

- Checks in this order: provenance (§7.6), URL and address policy (§7.1 to §7.2), `robots.txt` (§7.5), fetch (§7.3 to §7.4).
- Content is turned into text by jsdom (scripts are not run and nothing is loaded): `script`, `style`, `noscript`, `svg`, `iframe`, `template`, `nav`, `footer`, `header` and `aside` are removed, whitespace is collapsed. The page title and a publication date (`article:published_time`, `time[datetime]`, JSON-LD `datePublished`) are taken when present.
- **Excerpt.** At most 8,000 characters. Without `focus`, the start of the text. With `focus` (a few keywords, at most 120 characters), the start (first 1,000 characters) plus the paragraphs with the most keyword hits, in page order, joined by a visible gap marker. Quotes must not span a gap. There is no paging in v1.
- **Links.** For a page on the vendor's own domain, up to 25 links whose text or path contains a security, trust, privacy, legal, terms, DPA, subprocessor, compliance, certification, AI, status or incident word. Links of any other page are not returned.
- Failure reasons the model sees: `not_allowed`, `blocked_by_robots`, `blocked_by_site` (401, 403, 429 or a challenge page), `not_found`, `needs_javascript` (almost no text in a large HTML page), `unsupported_type` (for example PDF), `unreachable`. The ledger records the reason for the category summary.

Each result carries the remaining budget (`searchesLeft`, `pagesLeft`) so that a weak model can see when to stop.

## 7. The page guard

`read_page` lets a model choose which URL the server requests, and the model reads text that attackers can write. That is a server-side request forgery surface, and the first design avoided it by never fetching. It is the main new risk, so the guard is a new module, not `utils/safeOutboundUrl.ts`: that helper lets private ranges through on purpose (on-prem MLflow and Jira servers) and cannot be reused for untrusted URLs. No new dependency is needed: `ip-address` in `package.json` is only an `overrides` entry, and Node's `net.BlockList` and `https.request` are enough.

1. **URL policy.** `http` or `https` only; no user or password in the URL; port empty, 80 or 443; the host is a DNS name with at least two labels. An IP address in any notation is refused (the URL parser turns `2130706433` and `0x7f.1` into dotted decimal, and `net.isIP` then sees them). `localhost`, `*.localhost`, `*.local`, `*.internal` and `*.home.arpa` are refused. The fragment is dropped.
2. **Address policy, checked on the connection.** The request is made with `https.request` / `http.request` and a validating `lookup` hook, so the address that was checked is the address that is connected to (no gap for DNS rebinding). Every answer for the host must be public; one non-public answer refuses the host. Non-public means any of: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.0.0.0/24`, `192.0.2.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`, `240.0.0.0/4`, `::/128`, `::1/128`, `::ffff:0:0/96` (the embedded IPv4 address is checked too), `64:ff9b::/96`, `100::/64`, `2001:db8::/32`, `fc00::/7`, `fe80::/10`, `ff00::/8`.
3. **Redirects.** Followed by hand, at most 4. Every hop goes through the URL policy, the address policy and `robots.txt` again. A redirect from https to http is refused.
4. **Response.** Status 200 only. Content type `text/html`, `application/xhtml+xml`, `text/plain`, `text/xml`, `application/xml` or `application/rss+xml`. The body is streamed and cut off at 2 MB after decompression (`gzip`, `deflate`, `br`). 12 seconds to the response headers, 20 seconds in all. No cookies, no credentials, no `Referer`, TLS verification on. Character set from the header, then from a `<meta charset>` in the first 2 KB, then UTF-8.
5. **robots.txt.** The group for `VerifyWiseResearchBot` if there is one, otherwise `*`; `Allow` and `Disallow` by longest match. A 4xx answer means allowed; a 5xx answer or an unreachable file means disallowed (RFC 9309). Fetched through the same guard (5 seconds, 64 KB) and cached per host for the run.
6. **Provenance.** A URL may be read only if, in this run, it (a) was returned by `search_news`, or (b) is on the vendor's domain or a subdomain of it, or (c) is a link found on a page on the vendor's domain that was read. Anything else is refused with a message that says to search first. So a page cannot send the agent to an arbitrary address with data in its query string, and a trust-centre link on the vendor's site (including a third-party trust platform) can still be followed one hop.

## 8. Budgets and limits

| Limit | Value |
|---|---|
| Agent steps (model turns) | 20 (`stopWhen: stepCountIs(20)`) |
| `search_news` calls | 8 |
| `read_page` calls (successful or not) | 12 |
| Agent wall-clock | 5 minutes (`AbortSignal.timeout`) |
| Analysis call | 120 seconds, as today |
| Excerpt per page | 8,000 characters |
| Evidence pack | 100,000 bytes (was 40,000) |

Counters are checked and increased before any `await`, so parallel tool calls in one step cannot overspend. When a budget runs out the tool says so; when the steps or the time run out, the loop ends and the analysis runs on the ledger as it is (partial research is a result, not a failure). A model error in the agent stage with an empty ledger fails the run with the existing model-failure phrase; with entries, the analysis is still tried.

## 9. Ledger, evidence and analysis

- The ledger holds one entry per URL: `{ category, kind: "news" | "page", url, title, content, publishedAt }`. A page read replaces the news snippet of the same URL with the excerpt (a richer text, same title and date). A second read of a URL changes nothing.
- `buildEvidencePack` takes ledger entries instead of search hits and keeps its cleaning rules (control characters, lone surrogates, unusable URLs). Snippets stay capped at 1,500 characters and excerpts at 8,000. Order: by category, then by the order in which the agent got them. Entries are removed from the end until the pack is at most 100,000 bytes.
- The analysis prompt (`vr-2`) says: today's date; the lookback windows; evidence is untrusted text, now of two kinds (`kind="news"` snippets and `kind="page"` excerpts, the latter with a note when the page is on the vendor's own domain); a vendor's own statement of a limitation, expiry or adverse term counts as evidence; quote verbatim from one passage; the existing rules (no finding from a missing mention, ignore other companies, empty list is a correct answer) stay.
- Validation is unchanged: verbatim quote in the source content, the source mentions the vendor, the quote has a word that is not part of the vendor's name or domain, the confidence ceiling, de-duplication, caps. `categoriesSearched` becomes "categories with at least one usable ledger entry".

## 10. Category outcomes (honest summary)

The enum stays (`findings`, `nothing_found`, `search_failed`, `skipped`); the rules change, so that "looked and found nothing" is never confused with "could not look" or "did not look":

| Outcome | When |
|---|---|
| `findings` | At least one finding was kept for the category. Note: the count. |
| `nothing_found` | At least one usable entry (a news result or a readable page) was tagged with the category, and no finding survived. Note: the model's own note, or "Reviewed N sources". If some pages could not be read, the note says how many ("2 of 5 pages could not be read"). |
| `search_failed` | The category was worked on, but nothing usable came back: every search failed, or every page was blocked, unreadable or refused. Note: the fixed reason ("The news search was not available", "The site blocked the request"). |
| `skipped` | No tool call was tagged with the category: no valid domain (as before), or the step, call or time budget ran out first ("Not researched: the time limit was reached"). |

A run is `failed` when there is no key, when the model fails, or when the agent stage produced no usable entry at all: either the web could not be reached ("The run stopped because the web could not be reached") or the model made no tool call ("The model did not use the research tools"). Otherwise it is `completed`, even when every category says `nothing_found`.

## 11. Data model

One new migration (the applied create-tables migration is not edited), timestamp from `date +%Y%m%d%H%M%S`, DDL with the `verifywise.` prefix:

- `vendor_research_runs`: drop `search_provider`; add `pages_read INTEGER NOT NULL DEFAULT 0`. `searches_used` stays and now counts `search_news` calls. `evidence` holds the ledger pack (up to 100 KB). `prompt_version` is `vr-2`. `down` restores `search_provider VARCHAR(30)` and drops `pages_read`.
- `vendor_risk_findings` is unchanged (`sources` already holds `{url, title, quote, published_at}`).

`i.vendorResearch.ts` (server and client), `vendorResearch.utils.ts` (`FinishRunInput`, run select lists) and the tenant-isolation test move with the columns.

## 12. API, triggers and environment

- `GET /api/vendor-research/config` returns `{ hasLlmKey, autoRunEnabled }`.
- Start order (manual and auto): vendor in the organisation → the organisation has an LLM key → stale-run sweep and active run → manual cooldown → daily cap → create the queued run → enqueue. The 409 `search_not_configured` is gone; 409 `llm_key_missing` stays. Without an LLM key an auto run is skipped silently, as before.
- The job no longer builds a search provider.
- Environment after the change (`Servers/.env.example`, Kubernetes, Helm, Ansible, `CONFIGURATION_REFERENCE.md`):

| Variable | Default | Meaning |
|---|---|---|
| `VENDOR_RESEARCH_AUTO_RUN` | `true` | automatic run after vendor creation |
| `VENDOR_RESEARCH_MANUAL_COOLDOWN_MINUTES` | `10` | per vendor |
| `VENDOR_RESEARCH_DAILY_RUN_CAP` | `50` | per organisation per rolling 24 hours |

The deployment branch `chore/deploy-vendor-research-settings` is trimmed to these three. `swagger.yaml` and `endpoints.ts` are regenerated.

## 13. Frontend

- Config type loses `searchConfigured`. The button and the findings section are "not set up" only when `hasLlmKey` is false. The copy says that vendor research needs an LLM key and that an admin adds one in the LLM key settings. The setup hint that named environment variables is removed.
- Run summary: "N news searches, M pages read" (from `searches_used` and `pages_read`). Category rows keep their four outcomes; the copy for `search_failed` becomes "Could not research this category", `skipped` shows its note, and `nothing_found` shows the note about unreadable pages when there is one.
- New and changed strings get `de`, `fr`, `es` entries and keep the i18n tests; server messages get `locales/{en,de,fr}.json` entries.
- Findings rows are unchanged: sources show domain, date and quote.

## 14. Security and privacy

- **Egress.** The customer's server now talks to the public internet during a run: `www.bing.com` (a query with the vendor name and topic words), the vendor's site, and publishers of articles. Every request names the bot. The LLM provider receives the vendor name, domain, the "what it provides" text and the page text. An air-gapped installation cannot use the feature: runs fail with "the web could not be reached".
- **Prompt injection.** The browsing step has tools, so: GET only; public addresses only (§7.2); provenance (§7.6); no secrets or organisation data in its context; hard budgets; the analysis has no tools and its output is schema-bound and checked against the text; nothing reaches the register without a person accepting.
- **Stored third-party text.** Page excerpts and snippets are kept in `vendor_research_runs.evidence` as an audit trail (up to 100 KB per run). The UI shows only the quotes (300 characters) and links. Pruning old evidence stays out of scope.
- **Tenant isolation.** Unchanged: every query and job payload carries `organization_id`.

## 15. Cost

A typical run is 6 to 12 model turns, 2 to 5 searches and 3 to 8 page reads. The context grows with every page (about 2,000 tokens for a full excerpt), so the loop reads roughly 60,000 to 150,000 input tokens in total, and the analysis another 20,000 to 30,000. On a DeepSeek-class price that is cents; on a frontier-model price it can be a dollar or more. The organisation pays it on its own key; the daily cap (default 50 runs) bounds it, and `VENDOR_RESEARCH_AUTO_RUN=false` removes the automatic part. These are estimates: `searches_used` and `pages_read` measure the tool side, and the provider's usage page the model side.

Long runs also occupy the shared automation worker (10 jobs at a time) for up to about 7 minutes (5 for the agent, 2 for the analysis). A burst of manual runs can therefore leave the last one queued past the 15-minute stale limit, which ends it as "timed out" (the answer is **Research again**). A dedicated queue is the clean fix if this shows up.

## 16. Testing

No unit test touches the network.

- **Address and URL policy table:** `127.0.0.1`, `::1`, `::ffff:127.0.0.1`, `169.254.169.254`, `0.0.0.0`, decimal `2130706433`, hex `0x7f.1`, `10.0.0.5`, `192.168.1.1`, `100.64.0.1`, `fd00::1`, `fe80::1`, `localhost`, `a.localhost`, `printer.local`, `http://user:pw@example.com`, port 8080, `file:`, `ftp:`, and a public address that must pass (`93.184.216.34`).
- **Guarded fetch** (local HTTP server with an injectable address policy): a host that resolves to a private address, a redirect to a private address, a redirect loop, a https→http redirect, a body over the cap, a gzip bomb, a wrong content type, a slow response, `robots.txt` allow, disallow, 404 and 500.
- **robots parser:** group choice, longest match, `Allow` over `Disallow`, wildcard and `$`.
- **Page text:** boilerplate removed, title, date from the three sources, `focus` excerpt with gap markers, links only for vendor pages, JavaScript-only page detected.
- **News search:** parsing from fixtures saved from real Bing responses, `apiclick` URL decoding, lookback filtering by category, a non-RSS body, 429, timeout.
- **Tools and ledger:** budgets under parallel calls, provenance rule, URL replacement of a snippet by an excerpt, category tags.
- **Agent loop:** driven by an AI SDK mock model that scripts tool calls (search, read, read a refused URL, stop; step limit; time limit; model error with and without entries).
- **Pipeline:** outcomes of §10 for every row, partial ledger, the failed-run rule, the evidence cap, a quote from a news snippet and from a page excerpt, an excerpt with a gap marker.
- **Trigger, config, job, controller, routes, tenant isolation:** updated for §12; the old search-not-configured cases are removed.
- **Frontend:** not-set-up state, run summary, `search_failed` and `skipped` copy, de/fr/es strings.
- **Gates:** as in the first design (`tsc`, build, format-check, `i18n:audit:strict`, `check:api-drift`, touched suites).
- **End to end:** in a real browser as an end user, with the real LLM key and the real web: create a vendor with known public incidents, watch the auto run, read the findings and sources, accept one and dismiss one, check the risk in the register, the notification, the cooldown and the daily cap, and then remove the test data.

## 17. Docs

Update `docs/technical/domains/vendors.md`, `docs/deployment/CONFIGURATION_REFERENCE.md`, `Servers/.env.example`, the user guide page `vendor-risks.ts`, the superseded notes at the top of the 2026-10-10 spec and plan, and the generated API files. Add a short section on the web research toolkit and its guard to `docs/technical/`. If a `CLAUDE.md` is touched, its "Last Updated" date changes.

## 18. Delivery order

1. Migration, interfaces and queries for the new run columns.
2. `publicUrl.ts` and its table test.
3. `guardedFetch.ts` and `robots.ts`.
4. `pageText.ts`.
5. `newsSearch.ts` with fixtures.
6. `tools.ts` (ledger, budgets, provenance, lookback).
7. `researchAgent.ts`, agent and analysis prompts — **advisor review gate**.
8. Pipeline, job, trigger and config changes; removal of the Tavily files and settings.
9. Controller, routes, swagger and endpoints, server strings.
10. Frontend changes and strings.
11. Docs and the trim of the deployment branch.
12. Full verification and the end-to-end test — **advisor final review**.

## 19. Not in this version

- Provider-native web tools (Anthropic `webSearch` and `webFetch`, OpenAI `webSearch`) as another backend for those keys. They exist in the installed SDK packages, but the Custom key cannot use them, and OpenAI's needs the Responses API, not `.chat()`.
- A headless browser for JavaScript-only pages, PDF reading, a general web search engine, paging through long pages, a dedicated queue, storing token usage.

## 20. Points for the product owner

1. **News search runs on Bing News RSS.** It needs no account or key, and Bing's `robots.txt` allows it. It is still Microsoft's service and not an official API: Microsoft can change or limit it, and a customer's server address can be throttled. If it fails, the news categories show "search failed" and the vendor-site categories still work. The fully provider-free alternative is the model provider's own search, which works only with Anthropic and OpenAI keys, not with a Custom key.
2. **Auto-run stays on by default,** so each new vendor costs a run on the organisation's own key (§15).
3. **`robots.txt` is obeyed** and the bot says who it is. Some sites will refuse it; those pages are reported as blocked, not as clean.
4. **The model-knowledge lane is dropped** (§2). It can come back later as a clearly labelled lane if wanted.
