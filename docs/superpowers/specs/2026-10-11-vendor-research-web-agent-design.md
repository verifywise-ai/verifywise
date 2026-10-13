# Vendor research agent — web research agent (delta)

**Status:** awaiting review (revision 2) · **Date:** 2026-10-11 · **Branch:** `feature/vendor-agents-and-risk-page`

This document changes [the 2026-10-10 design](2026-10-10-vendor-research-agent-design.md). Where the two disagree, this one wins. Sections that are not mentioned here stay as they were: the findings and runs tables (apart from §11), the triggers, the cooldown and daily cap, accept and dismiss, the notification and the findings section of the UI.

## 1. Why this changes

The first design searched through a third-party search API (Tavily). That needs an extra account, an API key in the environment and a setup step, and an organisation without it sees "Vendor research is not set up".

The product owner's requirement, in one sentence: **whichever LLM key the organisation puts in, the agent searches the internet on its own and brings back information.** No third-party provider, no search key, no setup beyond the LLM key.

So the research stage becomes a real agent: a loop in which the organisation's own model decides what to search for and which pages to read, using two actions that our code implements, `search` and `read`, until it has enough or runs out of budget. Everything after the agent (the structured analysis, quote checking, de-duplication, caps, accept and dismiss) is the pipeline that exists today.

## 2. Decisions

| Decision | Choice |
|---|---|
| Search provider | None. No Tavily, no provider API, no search key, no search environment variable. |
| Which models | Any model the app can already call for structured output (`generateObjectWithSelfCorrection`: OpenAI, Anthropic, DeepSeek, Custom endpoints, local models). The loop asks the model for its next step as JSON, so it does **not** need function calling. A model that cannot answer in JSON fails the run with a clear message. Checked on 2026-10-11 with a Custom key that points at DeepSeek. |
| Web access | Two actions written in our code: `search` (general web and news, through a search engine's public results feed) and `read` (any public page). §6. |
| What can be cited | Only text that an action returned in this run: result snippets and page excerpts. The model's own knowledge is never evidence. The "model knowledge, unverified" lane considered earlier is dropped, and with it a `basis` column. |
| "Not set up" | Only when the organisation has no LLM key. |
| Auto-run | Unchanged: on by default, `VENDOR_RESEARCH_AUTO_RUN=false` turns it off. It no longer waits for a search setup, so every new vendor in an organisation with an LLM key costs one run on that key, bounded by the daily cap (§15). |
| Politeness | The agent says who it is (`VerifyWiseResearchBot`), obeys `robots.txt` when it reads a page, and does not imitate a browser. |

## 3. Scope of the change

**Removed:** `tavilyProvider.ts`, `searchProvider.ts`, `searchTypes.ts`, `planCategories` (`categories.ts` keeps only the lookback windows), the environment variables `VENDOR_RESEARCH_SEARCH_PROVIDER` and `TAVILY_API_KEY`, `searchConfigured` in the config endpoint and the UI, the 409 `search_not_configured`, the "Search provider not configured" job path, the `search_provider` column, the setup hint with environment variable names in the UI, and every Tavily mention in docs and deployment files.

**Changed:** the research stage (§5 to §9), the analysis prompt (`PROMPT_VERSION` becomes `vr-2`), the evidence pack, the category summary rules (§10), the run columns (§11), the config endpoint and trigger order (§12), the not-set-up state and the run summary copy in the UI (§13).

**Kept as is:** trigger types, cooldown, daily cap, stale-run sweep, quote validation, confidence ceiling, de-duplication, caps, accept and dismiss, the notification, tenant isolation.

## 4. What the probes showed (2026-10-11, from a developer machine)

There is no web search without a search engine, so the question is which engine answers a client that says who it is, without a key and without imitating a browser.

| Source | Result | Used? |
|---|---|---|
| Bing web search RSS (`/search?q=…&format=rss`) | 200 for an identified client. About 10 results with title, direct URL and snippet. | **Yes**, `search` (web) |
| Bing News RSS (`/news/search?…&format=rss`) | 200. Items also carry `pubDate`; the link wraps the publisher URL in an `apiclick.aspx?…&url=` parameter. | **Yes**, `search` (news) |
| DuckDuckGo (HTML and lite) | Challenge page (HTTP 202, no results) for an identified client and for a "compatible" bot User-Agent. It answers only browser-like clients; imitating one is bot-detection evasion. | No |
| Brave | One 200, then 429 on the next request. Too unreliable. | No |
| Yahoo, Ecosia, Startpage, Mojeek, Marginalia | 500, 403, no results, 403, time-out. | No |
| Google News RSS | Article links are JavaScript redirect pages that cannot be read or cited. | No |
| GDELT DOC API | 12 to 17 seconds and no articles for two test queries. | No |
| Vendor pages, `security.txt`, Wikipedia, publisher articles | Read fine. | Yes, `read` |
| Some publishers (BleepingComputer: Cloudflare 403) | Blocked. | "Blocked" is a normal outcome (§10) |

Facts to be honest about: Bing's `robots.txt` disallows `/search` (it does not mention `/news/search`), and Bing's terms do not give automated access to result pages. Worse, every feed carries a copyright notice that limits its results to personal, non-commercial display in an RSS reader and asks for Microsoft's written permission for any other use. Using the feed inside a commercial product and passing the results to an LLM provider is outside that notice. That is why the engine sits behind `SearchEngine`, and why §14 has a release gate. See §14 and §20.

## 5. Architecture

```
Vendor created (auto) ─┐
"Research risks" ──────┴─ create run (queued) · enqueue `vendor_research`                  [unchanged]
        ▼
 worker: runVendorResearch
   1. mark running · target (name, domain, provides) · the organisation's model             [unchanged]
   2. RESEARCH LOOP, at most 24 steps and 5 minutes                                         [new]
        ask the model for the next step as JSON ── search | read | finish
        run it in code ── search: Bing public RSS feed · read: guarded GET of a public page
        show the result back, repeat
        every snippet and excerpt goes to a ledger, tagged with a category
   3. evidence pack from the ledger (S1…Sn, at most 100 KB)                                 [changed]
   4. ANALYSIS  one structured call over the pack only, as today                            [prompt changed]
   5. validation · confidence ceiling · de-duplication · caps                               [unchanged]
   6. one transaction: findings + run                                                       [unchanged]
   7. auto run with findings: notify the assignee                                           [unchanged]
```

The loop only collects. It never writes findings. The analysis step sees a fixed snapshot of text, and its quotes are checked by code against that text. A hostile page can mislead the browsing step at most into reading more public pages (§7); it cannot write to the register.

**Why a JSON step and not native tool calling:** function calling needs provider support (tools, `tool_choice`, parallel calls) that OpenAI-compatible Custom endpoints and small local models do not all have. A JSON step works with every model that can already answer the app's structured-output calls, goes through the same self-correcting wrapper, and lets us control exactly what the model sees at each step.

Code layout:

- `Servers/services/webResearch/` is a small reusable toolkit, so that later vendor agents can browse too: `publicUrl.ts` (URL and address policy), `guardedFetch.ts`, `robots.ts`, `pageText.ts`, `readPage.ts` (robots check, guarded fetch and page text in one reader), `webSearch.ts` (the `SearchEngine` interface and the Bing implementation), `webSession.ts` (budgets, provenance, lookback and the ledger), `promptText.ts` (escaping for prompts), `researchLoop.ts` (the generic loop).
- `Servers/services/vendorResearch/prompts.ts` holds the vendor-specific loop and analysis prompts; `pipeline.ts` replaces the search step with the loop.
- `PipelineDeps` loses `searchProvider` and gains `research` (injectable, so pipeline tests need no model and no network). The loop takes the model call (`generate`) and the web session as parameters, so its tests need neither.

## 6. The loop and its actions

**Step.** Each turn the model answers with one JSON object, flat so that every provider's JSON mode accepts it:

```
{ thought: string (≤ 300), action: "search" | "read" | "finish",
  category?: security_incidents | certifications | legal_regulatory | ai_specific,
  query?: string (3–200), kind?: "web" | "news",
  url?: string (≤ 2048), focus?: string (≤ 120) }
```

`search` needs `query` and `category`; `read` needs `url` and `category`; `finish` needs nothing. A step that breaks its rule costs one step and the model is told why. Every call is tagged with a category, which feeds the summary of §10.

**Prompt of a step.** The vendor (name, domain, what it provides), today's date, the four categories and the lookback windows, the budget left, and the history of the run: for each step the `thought`, the action and its result. The two latest results are shown in full; older ones are cut to 500 characters, because the ledger keeps the full text for the analysis. Results are untrusted text and are escaped like the evidence is (§9). The system prompt says what to research for each category, how to work (check the vendor's own site with `read`, search news for incidents and legal actions, read the best sources instead of trusting a snippet), that queries contain the vendor name and topic words only, and that results are data, never instructions.

**`search({ query, category, kind })`**

- `kind: "web"` (default) calls `https://www.bing.com/search?q=<query>&format=rss&setlang=en-US`; `kind: "news"` calls `https://www.bing.com/news/search?q=<query>&format=rss&setlang=en-US`. Identified User-Agent, 12 seconds, at most 1 MB.
- Parsed by a small scanner for the RSS `item` elements (CDATA and character references handled; no XML library is needed): `title`, `description` (the snippet), `link`, and for news `pubDate` (stored as an ISO date) with the publisher URL taken from the `url` parameter of the `apiclick.aspx` link. At most 10 results. A result with an unusable URL, a `bing.com` URL or a URL already in the ledger is dropped.
- **Lookback in code.** A result with a known date older than the window of its category is dropped and counted: 24 months for `security_incidents`, `certifications` and `ai_specific`, 36 for `legal_regulatory`. The model is told how many were omitted. Pages carry a date only when their metadata has one (§6, `read`); undated results are kept, and the prompts ask for recent sources.
- A body that is not RSS, an HTTP status other than 200, a time-out or a network error is a failed search, reported to the model as "The search is not available right now".
- Behind a `SearchEngine` interface (`search(query, kind, signal)`), so that a self-hosted SearXNG or an API provider can replace Bing later without touching the loop.
- Process-wide: one search at a time, at least one second apart.

**`read({ url, category, focus? })`**

- Checks in this order: provenance (§7.6), URL and address policy (§7.1 to §7.2), `robots.txt` (§7.5), fetch (§7.3 to §7.4).
- Content is turned into text with `sanitize-html`, which is already a dependency and reads malformed pages safely. jsdom is not used: Jest replaces it with a stub, and it is heavy. `script`, `style`, `noscript`, `svg`, `iframe`, `template`, `head`, `nav`, `footer`, `header` and `aside` are dropped with their content, block elements become line breaks and whitespace is collapsed. The page title and a publication date (`article:published_time` and similar meta tags, JSON-LD `datePublished`, `time[datetime]`) are read from the raw HTML when present.
- **Excerpt.** At most 8,000 characters. Without `focus`, the start of the text. With `focus` (a few keywords), the start (first 1,000 characters) plus the paragraphs with the most keyword hits, in page order, joined by a visible gap marker. Quotes must not span a gap. There is no paging.
- **Links.** For a page on the vendor's own domain, up to 25 links on that domain whose text or path contains a security, trust, privacy, legal, terms, DPA, subprocessor, compliance, certification, AI, status or incident word, so the model can move from the home page to the right pages.
- Failure reasons the model sees: `not_allowed`, `blocked_by_robots`, `blocked_by_site` (401, 403 or 429; a challenge page that a site answers with 200 is not detected on a read, it reads as a page with little text), `not_found`, `needs_javascript` (almost no text in a large HTML page), `unsupported_type` (for example PDF), `unreachable`. The ledger records the reason for the summary of §10.

**`finish`** ends the loop. If the ledger is empty, or a category that can be researched has no call, the first `finish` is answered once with a reminder of what is missing; the second `finish` is final.

## 7. The page guard

`read` lets a model choose which URL the server requests, and the model reads text that attackers can write. That is a server-side request forgery surface, and the first design avoided it by never fetching. It is the main new risk, so the guard is a new module, not `utils/safeOutboundUrl.ts`: that helper lets private ranges through on purpose (on-prem MLflow and Jira servers) and cannot be reused for untrusted URLs. No new dependency is needed: `ip-address` in `package.json` is only an `overrides` entry, and Node's `net.BlockList` and `https.request` are enough. The Bing feed is requested through the same guarded fetch.

1. **URL policy.** `http` or `https` only; no user or password in the URL; port empty, 80 or 443; the host is a DNS name with at least two labels. An IP address in any notation is refused (the URL parser turns `2130706433` and `0x7f.1` into dotted decimal, and `net.isIP` then sees them). `localhost`, `*.localhost`, `*.local`, `*.internal` and `*.home.arpa` are refused. The fragment is dropped.
2. **Address policy, checked on the connection.** The request is made with `https.request` / `http.request` and a validating `lookup` hook, so the address that was checked is the address that is connected to (no gap for DNS rebinding). Every answer for the host must be public; one non-public answer refuses the host. Non-public means any of: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.0.0.0/24`, `192.0.2.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`, `240.0.0.0/4`, `::/128`, `::1/128`, `::/96`, `::ffff:0:0/96` (blocked as a whole), `64:ff9b::/96`, `64:ff9b:1::/48`, `100::/64`, `2001:db8::/32`, `2002::/16`, `fc00::/7`, `fe80::/10`, `ff00::/8`. `::/96` (the deprecated IPv4-compatible form), `64:ff9b:1::/48` (local-use NAT64, RFC 8215; `64:ff9b::/96` does not cover it) and `2002::/16` (6to4) carry an IPv4 address inside them, so an AAAA record under one of them could reach an internal IPv4 address through a translator or a tunnel.
3. **Redirects.** Followed by hand, at most 4. Every hop goes through the URL policy, the address policy and `robots.txt` again. A redirect from https to http is refused.
4. **Response.** Status 200 only. Content type `text/html`, `application/xhtml+xml`, `text/plain`, `text/xml`, `application/xml` or `application/rss+xml`. The body is streamed and cut off at 2 MB after decompression (`gzip`, `deflate`, `br`). 12 seconds to the response headers, 20 seconds in all. No cookies, no credentials, no `Referer`, TLS verification on. Character set from the header, then from a `<meta charset>` in the first 2 KB, then UTF-8.
5. **robots.txt (pages).** The group for `VerifyWiseResearchBot` if there is one, otherwise `*`; `Allow` and `Disallow` by longest match. A missing or refused file (404, 410, 401, 403 or 429) means allowed; any other answer (another 4xx, a 5xx, a network failure or a timeout) disallows the whole origin for the run. That is stricter than RFC 9309, which allows on any 4xx; it fails closed on purpose. Fetched through the same guard (5 seconds, 64 KB) and cached per host for the run. The search feed is the one declared exception (§14).
6. **Provenance.** A URL may be read only if, in this run, it was returned by `search`, or it is on the vendor's domain or a subdomain of it. Anything else is refused with a message that says to search first. So a page cannot send the agent to an arbitrary address with data in its query string.

## 8. Budgets and limits

| Limit | Value |
|---|---|
| Steps (model turns, including invalid ones) | 24 |
| `search` actions | 8 |
| `read` actions (successful or not) | 12 |
| One model turn | 60 seconds |
| Whole loop | 5 minutes (`AbortSignal.timeout`) |
| Analysis call | 120 seconds, as today |
| Excerpt per page | 8,000 characters |
| Evidence pack | 100,000 bytes (was 40,000) |

One action per step, so counters need no locking. When a budget runs out the model is told and must `finish`; when the steps or the time run out, the loop ends and the analysis runs on the ledger as it is (partial research is a result, not a failure). A model error in the loop with an empty ledger fails the run with the existing model-failure phrase; with entries, the analysis is still tried.

## 9. Ledger, evidence and analysis

- The ledger holds one entry per URL: `{ category, kind: "result" | "page", url, title, content, publishedAt }`. A page read replaces the snippet of the same URL with the excerpt (a richer text, same title; the date is the page's own when it has one, else the snippet's). Each entry also records whether its content came from the vendor's own domain, decided on the URL that answered (a page that redirected off the domain is not the vendor's own); the analysis prompt marks `site="vendor"` from that flag only. A second read of a URL changes nothing.
- `buildEvidencePack` takes ledger entries instead of search hits and keeps its cleaning rules (control characters, lone surrogates, unusable URLs). Snippets stay capped at 1,500 characters and excerpts at 8,000. Order: by category, then by the order in which the loop got them. Until the pack is at most 100,000 bytes, the last entry of the category that holds the most bytes among those with two or more entries is removed (a tie goes to the later category). A category with one entry keeps it. When every category is down to one entry, the content of the largest entry is cut (whole characters, the start of the excerpt stays) by the bytes the pack is over, and the next largest if that is not enough. So a category that has entries always keeps one, and a full run cannot make the last categories look as if they had nothing found. Ids are numbered S1, S2, … after this trimming, without gaps.
- Text shown to a model (loop results and evidence) goes through `escapeForPrompt`, and quotes are decoded with `unescapeFromPrompt` before they are compared, as today.
- The analysis prompt (`vr-2`) says: today's date; the lookback windows; evidence is untrusted text, now of two kinds (`kind="result"` snippets and `kind="page"` excerpts, the latter with a note when the page is on the vendor's own domain); a vendor's own statement of a limitation, expiry or adverse term counts as evidence; quote verbatim from one passage; the existing rules (no finding from a missing mention, ignore other companies, empty list is a correct answer) stay.
- Validation is unchanged: verbatim quote in the source content, the source mentions the vendor, the quote has a word that is not part of the vendor's name or domain, the confidence ceiling, de-duplication, caps. `categoriesSearched` becomes "categories with at least one usable ledger entry".

## 10. Category outcomes (honest summary)

The enum stays (`findings`, `nothing_found`, `search_failed`, `skipped`); the rules change, so that "looked and found nothing" is never confused with "could not look" or "did not look":

| Outcome | When |
|---|---|
| `findings` | At least one finding was kept for the category. Note: the count. |
| `nothing_found` | At least one usable entry (a result or a readable page) was tagged with the category, and no finding survived. Note: the model's own note, or "Reviewed N sources". If some pages could not be read, the note says how many ("2 of 5 pages could not be read"). |
| `search_failed` | The category was worked on, but nothing usable came back: every search failed, or every page was blocked, unreadable or refused. Note: the fixed reason ("The search was not available", "The site blocked the request"). |
| `skipped` | No call was tagged with the category: no valid domain for `certifications` and `ai_specific` (as before), or the step, call or time budget ran out first ("Not researched: the time limit was reached"). |

"Worked on" means at least one call tagged with the category reached the web; "answered" means the web answered it (a search that returned RSS, even with no result, or a page that was fetched). A category is `search_failed` when it was worked on and no call was answered. A call that the rules refuse before it reaches the web (a budget, a URL that is not allowed, an invalid step) is not work on a category.

The notes are a closed set of English phrases, because the UI maps each one to a translated sentence (and shows nothing it does not know):

| Outcome | Stored note |
|---|---|
| `findings` | `1 potential risk found`, `N potential risks found` (as before) |
| `nothing_found` | `No risks found in the sources reviewed`; `No risks found; N of M pages could not be read` (when any page call of the category failed); `Possible risks were found but could not be verified or are already recorded` (as before); the model's own note, shown as unverified, only when no page failed and the model proposed nothing |
| `search_failed` | `The search was not available` (every call of the category was a failed search); `The pages could not be read` (otherwise) |
| `skipped` | `Vendor website is missing or not a valid domain` (as before); `Not researched: the time limit was reached`; `Not researched: the research ended before this category was covered` |

A run is `failed` when there is no key, when the model fails, or when the web never answered the loop: either every call failed (`The run stopped because the web could not be reached`) or the model never searched or read (`The model did not use the research actions`). A run whose calls were answered but returned nothing is `completed` with no findings, and the analysis call is skipped because there is nothing to read. Otherwise a run is `completed`, even when every category says `nothing_found`.

## 11. Data model

One new migration (the applied create-tables migration is not edited), timestamp from `date +%Y%m%d%H%M%S`, DDL with the `verifywise.` prefix:

- `vendor_research_runs`: drop `search_provider`; add `pages_read INTEGER NOT NULL DEFAULT 0`. `searches_used` stays and now counts `search` actions. `evidence` holds the ledger pack (up to 100 KB). `prompt_version` is `vr-2`. `down` restores `search_provider VARCHAR(255)` and drops `pages_read`.
- `vendor_risk_findings` is unchanged (`sources` already holds `{url, title, quote, published_at}`).

`i.vendorResearch.ts` (server and client), `vendorResearch.utils.ts` (`FinishRunInput`, run select lists) and the tenant-isolation test move with the columns.

## 12. API, triggers and environment

- `GET /api/vendor-research/config` returns `{ hasLlmKey, autoRunEnabled }`.
- Start order (manual and auto): vendor in the organisation → the organisation has an LLM key → stale-run sweep and active run → manual cooldown → daily cap → create the queued run → enqueue. The 409 `search_not_configured` is gone; 409 `llm_key_missing` stays. Without an LLM key an auto run is skipped with a log line and nothing is stored, as before.
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
- Run summary: "N searches, M pages read" (from `searches_used` and `pages_read`). Category rows keep their four outcomes; the label for `search_failed` becomes "could not be researched", and every note is one of the phrases of §10, mapped to a translated sentence.
- New and changed strings get `de`, `fr`, `es` entries and keep the i18n tests. No server message is added, so `Servers/locales` stays unchanged: the stored phrases are English and the client maps them.
- Findings rows are unchanged: sources show domain, date and quote.

## 14. Security and privacy

- **Egress.** The customer's server now talks to the public internet during a run: `www.bing.com` (queries with the vendor name and topic words), the vendor's site, and the sites of articles. Every request names the bot. The LLM provider receives the vendor name, domain, the "what it provides" text and the page text. An air-gapped installation cannot use the feature: runs fail with "the web could not be reached".
- **The search feed: `robots.txt`, the feed's own notice, and a release gate.** Bing's `robots.txt` disallows `/search`, and each feed's copyright notice limits its results to personal, non-commercial display in an RSS reader and asks for Microsoft's written permission for any other use. Querying it from a commercial product and passing the results to an LLM provider is outside that notice. The feature queries the public feed the way a feed reader would (one identified request at a time, at least a second apart, at most 8 a run). That is enough for development and evaluation, but it is a legal and business risk, not a guarantee: Microsoft can change the feed, throttle a server's address or object. **Release gate:** before this ships to customers, the product owner decides whether to ask Microsoft for permission or to put another engine behind `SearchEngine` (a self-hosted SearXNG, an API provider, or the model provider's own search for the keys that have one). If a search fails, the run says so (§10) and invents nothing. Pages are different: `robots.txt` is obeyed (§7.5).
- **Prompt injection.** The loop has no tools of its own: the model can only name a search or a URL, and code decides. GET only; public addresses only (§7.2); provenance (§7.6); no secrets or organisation data in its context; hard budgets; the analysis has no actions and its output is schema-bound and checked against the text; nothing reaches the register without a person accepting.
- **Stored third-party text.** Page excerpts and snippets are kept in `vendor_research_runs.evidence` as an audit trail (up to 100 KB per run). The UI shows only the quotes (300 characters) and links. Pruning old evidence stays out of scope.
- **Tenant isolation.** Unchanged: every query and job payload carries `organization_id`.

## 15. Cost

A typical run is 8 to 16 steps. Each step sends the prompt, the history (two results in full, the rest cut) and the budget, about 6,000 to 8,000 input tokens, so the loop reads roughly 60,000 to 130,000 input tokens in total, and the analysis another 20,000 to 30,000. On a DeepSeek-class price that is cents; on a frontier-model price it can be a dollar or more. The organisation pays it on its own key; the daily cap (default 50 runs) bounds it, and `VENDOR_RESEARCH_AUTO_RUN=false` removes the automatic part. These are estimates: `searches_used` and `pages_read` measure the tool side, and the provider's usage page the model side.

Long runs also occupy the shared automation worker (10 jobs at a time) for up to about 7 minutes (5 for the loop, 2 for the analysis). A burst of manual runs can therefore leave the last one queued past the 15-minute stale limit, which ends it as "timed out" (the answer is **Research again**). A dedicated queue is the clean fix if this shows up.

## 16. Testing

No unit test touches the network or a model.

- **Address and URL policy table:** `127.0.0.1`, `::1`, `::ffff:127.0.0.1`, `169.254.169.254`, `0.0.0.0`, decimal `2130706433`, hex `0x7f.1`, `10.0.0.5`, `192.168.1.1`, `100.64.0.1`, `fd00::1`, `fe80::1`, `localhost`, `a.localhost`, `printer.local`, `http://user:pw@example.com`, port 8080, `file:`, `ftp:`, and a public address that must pass (`93.184.216.34`).
- **Guarded fetch** (local HTTP server with an injectable address policy): a host that resolves to a private address, a redirect to a private address, a redirect loop, a https→http redirect, a body over the cap, a gzip bomb, a wrong content type, a slow response.
- **robots parser:** group choice, longest match, `Allow` over `Disallow`, wildcard and `$`, 404 and 500.
- **Page text:** boilerplate removed, title, date from the three sources, `focus` excerpt with gap markers, links only for vendor pages, JavaScript-only page detected.
- **Search:** parsing from fixtures saved from real Bing responses (web and news), `apiclick` URL decoding, lookback filtering by category, a non-RSS body, 429, time-out, de-duplication.
- **Web session:** budgets, provenance rule, snippet replaced by excerpt, category tags, unusable URLs.
- **Research loop:** driven by a scripted `generate` (search, read, read a refused URL, an invalid step, finish with an empty ledger and the reminder, step limit, time limit, model error with and without entries, observation cutting). A test that runs the real `generateObjectWithSelfCorrection` against an AI SDK mock model checks the step schema.
- **Pipeline:** outcomes of §10 for every row, partial ledger, the failed-run rule, the evidence cap, a quote from a snippet and from a page excerpt, an excerpt with a gap marker.
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
5. `webSearch.ts` with fixtures.
6. `webSession.ts` (ledger, budgets, provenance, lookback).
7. `researchLoop.ts` and the vendor prompts — **advisor review gate**.
8. Pipeline, job, trigger and config changes; removal of the Tavily files and settings.
9. Controller, routes, swagger and endpoints, server strings.
10. Frontend changes and strings.
11. Docs and the trim of the deployment branch.
12. Full verification and the end-to-end test — **advisor final review**.

## 19. Not in this version

- Native tool calling or provider-native web tools (Anthropic `webSearch` and `webFetch`, OpenAI `webSearch`) as another backend for those keys.
- A self-hosted SearXNG container or an API provider behind `SearchEngine`. SearXNG is a separate service to deploy in Compose, Kubernetes, Helm and Ansible, and Docker is not installed on the development machine, so it could not be tried here.
- A headless browser for JavaScript-only pages, PDF reading, paging through long pages, several actions per step, a dedicated queue, storing token usage, caching identical queries.

## 20. Things to know

1. **How search works, and a release gate.** The agent uses Bing's public RSS results feed from the customer's server: no account, no key, nothing to configure, and it works with any LLM key. It is not an official API, and the feed's own notice limits it to personal, non-commercial use (§14). That is fine for development and evaluation. Before the feature ships to customers the product owner has to decide how to license it; the engine is one replaceable module for that reason. If Bing throttles or changes the feed, searches fail and runs say so; they never invent findings.
2. **Auto-run stays on by default,** so each new vendor costs a run on the organisation's own key (§15).
3. **Pages obey `robots.txt`** and the bot says who it is. Some sites will refuse it; those pages are reported as blocked, not as clean.
4. **The model-knowledge lane is dropped** (§2). It can come back later as a clearly labelled lane if wanted.
