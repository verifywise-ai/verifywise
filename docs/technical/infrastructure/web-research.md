# Web research toolkit

> **Last Updated:** 2026-10-13

The web research toolkit lets an agent search the public web and read public pages, under a guard that decides what the server may request. The vendor research agent is its first user (see [Vendors](../domains/vendors.md#vendor-research-agent)), and the toolkit is written so that other agents can browse with it later. The design is in `docs/superpowers/specs/2026-10-11-vendor-research-web-agent-design.md`.

The agent runs on the organization's own LLM key: whichever key the organization has, the model decides what to search for and which pages to read, and code runs those two actions. There is no search account, no search key and no setup beyond the LLM key.

> ## Release gate: the search feed has to be licensed or replaced before this ships to customers
>
> The search action reads the public RSS results feed of Bing (`www.bing.com/search?...&format=rss` and `/news/search?...&format=rss`). That feed is not an official API. Bing's `robots.txt` disallows `/search`, and the copyright notice that every feed carries, as seen in the probes of 2026-10-11, limits its results to personal, non-commercial display in an RSS reader and asks for Microsoft's written permission for any other use. Querying it from a commercial product, and handing what comes back to an LLM provider, goes beyond that notice.
>
> That is acceptable for development and evaluation, and it is the reason the engine is one replaceable module behind the `SearchEngine` interface. **Before the feature is shipped to customers, the product owner decides between two things: ask Microsoft for permission, or put another engine behind the interface** (a self-hosted SearXNG, an API provider, or the model provider's own search for the keys that have one). Until then, treat the feed as a legal and business risk and not as a guarantee. Microsoft can change the feed, throttle the address of a server, or object, and a search that fails makes the run say so (see [category outcomes](../domains/vendors.md#category-outcomes)); it never invents findings.
>
> Pages are different: the page reader obeys each site's `robots.txt`. The search feed is the one declared exception, because it is a published feed and not a page that is read.

## What it is and where it lives

`Servers/services/webResearch/` holds the toolkit. It knows nothing about vendors; the vendor-specific parts are in `Servers/services/vendorResearch/`.

| Module (`services/webResearch/`) | What it does |
|----------------------------------|--------------|
| `publicUrl.ts` | The URL policy (`parsePublicUrl`), the address policy (`isPublicAddress`) and `isOnDomain`, which compares whole labels |
| `guardedFetch.ts` | The only code that requests a URL a model chose: bot identity, address check on the connection, redirects, response limits |
| `robots.ts` | A `robots.txt` parser (RFC 9309) and a checker that fetches and caches the file per origin |
| `pageText.ts` | Turns HTML into text, title, publication date, links and a focused excerpt |
| `readPage.ts` | The page reader: `robots.txt` check, guarded fetch and page text in one function |
| `webSearch.ts` | The `SearchEngine` interface, the Bing implementation and the queue that spaces searches |
| `webSession.ts` | The state of one run: budgets, provenance, lookback window of each category, ledger and call records |
| `promptText.ts` | Escaping for text that goes into a prompt |
| `researchLoop.ts` | The generic loop: the model names a step as JSON, code runs it, the result goes back to the model |

| Module (`services/vendorResearch/`) | Its part in web research |
|-------------------------------------|--------------------------|
| `researchAgent.ts` | `createVendorResearcher`: one web session, one page reader and one loop per run, with the categories the vendor allows |
| `prompts.ts` | The vendor-specific prompts of the loop and of the analysis (`PROMPT_VERSION`) |
| `evidence.ts` | Turns the ledger into the evidence pack that the analysis reads and the run stores |
| `summary.ts` | The outcome and the fixed note of each category, made from the calls of the loop |
| `pipeline.ts` | Runs the loop, then the analysis, validation and storage |

The toolkit logs ids only (organization, vendor and run) through `utils/logger/fileLogger`. It never logs page text, URLs, queries, model output or keys, and its error messages are fixed phrases that repeat nothing of a URL or a page, because both are written by third parties.

## The page guard

`read` lets a model choose which URL the server requests, and the model reads text that attackers can write. That is a server-side request forgery surface, so the guard is its own module and not `utils/safeOutboundUrl.ts`: that helper lets private ranges through on purpose (on-premises MLflow and Jira servers) and must not be reused for untrusted URLs. No dependency is added; Node's `net.BlockList` and `https.request` are enough. The search feed is requested through the same guarded fetch.

The agent has no tools of its own. The model can only name a search or a URL, and code decides whether and how it happens. Requests are GET only, to public addresses only, for URLs with a provenance; no secret and no organization data is in the model's context; every budget is hard; the analysis has no actions and its output is bound to a schema and checked against the text; and nothing reaches the risk register until a person accepts it.

### URL policy

Checked first, on every URL, whether the model named it or a redirect did (`publicUrl.ts`).

- `http` or `https` only. No user name or password in the URL. Port empty, 80 or 443. At most 2,048 characters, as written and once the parser has percent-encoded the characters a URL cannot carry.
- The host is a DNS name with at least two labels, each made of letters, digits and inner hyphens (63 characters at most). A trailing dot is removed.
- An IP address in any notation is refused. The URL parser turns `2130706433` and `0x7f.1` into dotted decimal, and `net.isIP` then sees them.
- `localhost`, `*.localhost`, `*.local`, `*.internal` and `*.home.arpa` are refused.
- The fragment is dropped.

### Address policy, checked on the connection

The request is made with `https.request` or `http.request` and a validating `lookup` hook, so the address that was checked is the address that is connected to. There is no gap in which DNS can answer differently (DNS rebinding). Every address the host resolves to must be public, and one non-public address refuses the whole host. An empty answer is refused too.

Not public means any of these ranges. There is one list per IP family, and an address is only checked against its own family's list.

| Family | Ranges |
|--------|--------|
| IPv4 | `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.0.0.0/24`, `192.0.2.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`, `240.0.0.0/4` |
| IPv6 | `::/128`, `::1/128`, `::/96`, `::ffff:0:0/96` (blocked as a whole), `64:ff9b::/96`, `64:ff9b:1::/48`, `100::/64`, `2001:db8::/32`, `2002::/16`, `fc00::/7`, `fe80::/10`, `fec0::/10`, `ff00::/8` |

`::/96` (the deprecated IPv4-compatible form), `64:ff9b:1::/48` (local-use NAT64, RFC 8215) and `2002::/16` (6to4) carry an IPv4 address inside them, so an AAAA record under one of them could reach an internal IPv4 address through a translator or a tunnel. `fec0::/10` is the site-local range that RFC 3879 deprecated, still routed inside some networks. An address with a zone id (`fe80::1%eth0`) is not public either.

### Redirects

Followed by hand, at most 4. Every hop goes through the URL policy, the address policy and `robots.txt` again, so a redirect cannot lead to a place the first URL could not. A redirect from https to http is refused. More than 4 redirects make the page unreachable.

### Response limits

| Limit | Value |
|-------|-------|
| Status | 200 only |
| Content types | `text/html`, `application/xhtml+xml`, `text/plain`, `text/xml`, `application/xml`, `application/rss+xml` |
| Body, after decompression (`gzip`, `br`, and `deflate` in its zlib form when a server sends it unasked) | 2,097,152 bytes; a longer body is cut there and the stream is closed, so a compressed bomb is not read to its end |
| Time to the response headers of one hop | 12,000 ms |
| The whole fetch, redirects and body included | 20,000 ms |
| Redirects | 4 |

A request carries the bot's User-Agent, `Accept`, `Accept-Encoding: gzip, br` and `Accept-Language: en`, and nothing else: no cookies, no credentials, no `Referer`. Each request has a fresh socket, and TLS certificates are verified. The character set comes from the `Content-Type` header, then from a `<meta charset>` in the first 2 KB of the body, then it is UTF-8.

Why a fetch fails, as the model is told:

| Reason | When |
|--------|------|
| `not_allowed` | The URL or the address policy refused it |
| `blocked_by_robots` | `robots.txt` disallows the page |
| `blocked_by_site` | The site answered 401, 403 or 429 |
| `not_found` | 404 or 410 |
| `unsupported_type` | A content type that is not in the list above, for example a PDF |
| `needs_javascript` | An HTML page of at least 20,000 characters with fewer than 500 characters of text: the text is built by a script |
| `unreachable` | Any other status, a network error, a time limit, too many redirects, an encoding that cannot be decoded |

The page reader does not look for challenge pages. A site that shows one with a 200 answer is read as a page with little text.

### Bot identity and `robots.txt`

The bot says who it is and does not imitate a browser: User-Agent `VerifyWiseResearchBot/1.0 (+https://verifywise.ai)`, product token `VerifyWiseResearchBot`.

Before a page is fetched, and before every redirect hop, the reader asks the `robots.txt` of the origin.

- **Which group.** A group applies when one of its `User-agent` values names exactly `VerifyWiseResearchBot`. The comparison ignores case and a `/version` suffix, so `VerifyWiseResearchBot/1.0` matches and `bot` or `wise` do not. A file may name the bot in several groups, and their rules are combined. Without a group of ours, the `*` groups apply.
- **Which rule.** `Allow` and `Disallow` by the longest match, `Allow` wins a tie, `*` and a trailing `$` work, and a path that no rule matches is allowed. A pattern is never compiled into a regular expression, because the file is written by the site's owner and a pattern with many wildcards would make a backtracking engine run for as long as the site likes.
- **The file.** Fetched through the same guard, with 5,000 ms and 65,536 bytes, under any content type (static hosting often serves it as `application/octet-stream`). The answer is cached per origin for one run.
- **When the file cannot be had.** A missing file (404, 410) and a site that refuses to show it (401, 403, 429) mean the site has no rules, and everything is allowed. When the URL or the address policy refuses the request for the file (most often because the host resolves to an address that is not public), every page of that origin is refused as `not_allowed` for the run, as the page itself would be. Any other outcome disallows everything on that origin for the run: a 5xx answer, another 4xx status, a time-out, a network error or too many redirects.

### Provenance

A URL may be read only if, in this run, a search returned it, or it is on the vendor's domain or a subdomain of it (whole labels are compared, so `acme.com.evil.example` and `notacme.com` are not on `acme.com`). Anything else is refused, and the model is told to search first. So a page cannot send the agent to an arbitrary address with data in its query string.

### Reading the page

`pageText.ts` turns the HTML into text with `sanitize-html`, which is already a dependency and reads malformed pages safely. `jsdom` is not used: Jest replaces it with a stub, and it is heavy. `script`, `style`, `textarea`, `option`, `noscript`, `svg`, `iframe`, `template`, `head`, `nav`, `footer`, `header` and `aside` are dropped with their content, block elements become line breaks and whitespace is collapsed. A page that nests tags too deeply is given up on while the parser is still cheap, and at most the first 2 MB of HTML is read.

- **Title and date** come from the raw HTML: `article:published_time` and similar meta tags, JSON-LD `datePublished` and `time[datetime]`.
- **Excerpt.** At most 8,000 characters. Without `focus`, the start of the text. With `focus` (a few keywords), the first 1,000 characters plus the paragraphs with the most keyword hits, in page order, with a visible gap marker (`[…]` on a line of its own) where text is left out. A quote must not span a gap. There is no paging.
- **Links.** For a page on the vendor's own domain, at most 25 links to that domain whose text or path contains a security, trust, privacy, legal, terms, subprocessor, compliance, certification, GDPR, cookie, status, incident, vulnerability or disclosure word, or the word AI, DPA, SOC or ISO, so that the model can move from the home page to the right pages. A link whose URL is longer than 2,048 characters is left out: the model could not read it.

## The search engine

`search({ query, category, kind })` goes through the `SearchEngine` interface (`webSearch.ts`):

```typescript
interface SearchEngine {
  search(query: string, kind: "web" | "news", signal?: AbortSignal): Promise<SearchResult[]>;
}
```

The Bing implementation (`createBingEngine`) requests `https://www.bing.com/search?q=<query>&format=rss&setlang=en-US` for `web` and `https://www.bing.com/news/search?q=<query>&format=rss&setlang=en-US` for `news`, through the guarded fetch, with the bot's User-Agent, 12,000 ms and at most 1,048,576 bytes. See the [release gate](#release-gate-the-search-feed-has-to-be-licensed-or-replaced-before-this-ships-to-customers) at the top before relying on it.

- **Parsing.** `parseBingRss` is a scanner, not an XML parser: it walks the document with `indexOf` and nothing that can backtrack, so a body of any shape is read in time proportional to its length. It reads the `title`, `link`, `description`, `pubDate` and `News:Source` children of each `item`, handles CDATA and character references, and removes markup from every field. At most 10 results come back, and a snippet is cut to 1,500 characters. A news link wraps the publisher's address in the `url` parameter of an `apiclick.aspx` link, and that address is the result; `pubDate` becomes an ISO date.
- **Dropped results.** A result whose address does not pass the URL policy, one on `bing.com`, and a repeat of an earlier address in the same feed. The session also drops an address that is already in the ledger.
- **Lookback, in code.** A result with a known date older than the window of its category is dropped and counted, and the model is told how many were left out. A result without a date is kept. See [Vendors](../domains/vendors.md#categories) for the windows.
- **A failed search.** A body that is not RSS (for example a consent or challenge page that arrives with a 200), a status other than 200, a time-out and a network error are all a failed search. The model is told "The search is not available right now". An RSS document with no items is an answer: an empty list.
- **The queue.** All searches of a process go through one queue: one at a time, and each starts at least 1,000 ms after the previous one started. A search that is aborted while it waits never runs.
- **The query.** The prompt tells the model that a query holds the vendor's name and topic words only. That is a rule of the prompt, not something the code enforces.

## The research loop

`runResearchLoop` (`researchLoop.ts`) asks the model for one step per turn as a flat JSON object: `thought`, `action` (`search`, `read` or `finish`), and, as the action needs them, `category`, `query`, `kind`, `url` and `focus`. It uses the self-correcting structured call and not native tool calling, so it runs on every model that can answer the app's other structured calls (OpenAI, Anthropic, DeepSeek, custom endpoints, local models). A model that cannot answer in JSON fails the run with a clear message.

Each prompt carries the task (the vendor, today's date, the categories and their lookback windows), the history of the steps and the budget that is left. The two latest results are shown in full and older ones are cut to 500 characters, because the ledger keeps the full text for the analysis. Everything in the history, results and the model's own words alike, is escaped with `escapeForPrompt`, so none of it can close a tag of the prompt or open a new one.

A model that answers badly cannot crash the loop or keep it going. A step that breaks its rule (a `search` without a query, a `read` without a URL, an unknown or unavailable category) costs one step and the model is told why. A step that the rules refuse (a budget that is spent, an address that is not allowed, a page that no search returned) never reaches the web. Three answers in a row that hold no step end the loop as a model error. A `finish` before any source is in the ledger, or before every category has a call, is answered once with a reminder; the second `finish` is final.

The loop ends when the model finishes, when both budgets are spent, when the steps or the time run out, or when the model fails. The loop only collects: it never writes findings. What it leaves is the ledger, and a loop that ran out of time or failed with entries still hands its partial ledger to the analysis. A search or a read that the loop's clock cuts off keeps its unit of budget but is not recorded as a failed call: the time ran out, not the web, so the summary says that its category was not reached.

| Limit | Value |
|-------|-------|
| Steps (model turns, invalid ones included) | 24 |
| `search` actions | 8 |
| `read` actions, successful or not | 12 |
| Results per search | 10 |
| One model turn | 60,000 ms |
| The whole loop | 300,000 ms |
| Gap between two searches, per process | 1,000 ms |
| Search feed: body, time | 1,048,576 bytes, 12,000 ms |
| Redirects | 4 |
| Response headers, whole fetch | 12,000 ms, 20,000 ms |
| Fetched body, after decompression | 2,097,152 bytes |
| `robots.txt` | 5,000 ms and 65,536 bytes |
| Snippet, page excerpt, links per page | 1,500 characters, 8,000 characters, 25 |
| Evidence pack | 100,000 bytes |
| Analysis call | 120,000 ms |

**The ledger.** Every snippet and every excerpt goes to a ledger with one entry per URL: `{ category, kind: "result" | "page", onVendorSite, url, title, content, publishedAt }`. Reading a page replaces the snippet of the same URL with the excerpt, keeping the title; the date is the page's own when it has one, and the snippet's otherwise. `onVendorSite` is decided on the URL that answered, so a page that redirected off the vendor's domain is not the vendor's own, and one asked for elsewhere that answered from the vendor's site is. The analysis prompt marks `site="vendor"` from that flag alone, and so does the validation of the findings (the vendor's own page counts as mentioning the vendor and lifts the confidence ceiling to `medium`); neither reads the host of the URL that was asked for. A page that proves older than the lookback window of its category is refused and kept out of the ledger under that category. Pages on the vendor's own domain are exempt from the lookback. A second read of a URL changes nothing.

**The JSON-object fallback.** If a provider rejects `json_schema` (DeepSeek does), the call falls back to JSON-object mode. The loop then keeps that mode for the rest of the run, so that each step does not cost a rejected request; a call that fell back and then failed counts too, because the call says so as it falls back (`onJsonObjectFallback`). The run reports what it learned (`jsonObjectFallback`), and the analysis call then starts in JSON-object mode as well.

**From the ledger to the analysis.** `buildEvidencePack` cleans the entries (control characters, lone surrogates, unusable URLs), drops a repeated URL, and numbers the sources `S1`, `S2`, ... after trimming. Until the pack is at most 100,000 bytes, the last source of the category that holds the most bytes among those with two or more sources is removed (a tie goes to the later category). A category with one source keeps it; when every category is down to one, the content of the largest source is cut instead. So a category the loop researched always has a source in the pack, and the summary cannot read it as "nothing found". The analysis, its validation and the run summary are described in [Vendors](../domains/vendors.md#vendor-research-agent).

## What leaves the server

During a run the customer's server talks to the public internet. Every request names the bot.

| To | What it receives |
|----|------------------|
| `www.bing.com` | The queries the model writes: by the prompt, the vendor's name and topic words |
| The vendor's website | GET requests for its pages and `robots.txt`; the bot's User-Agent and nothing else |
| Any other site that a search returned (articles, for example), and a host that a redirect leads to | The same: GET requests for the page and for `robots.txt` |
| The organization's LLM provider | The vendor's name and domain, the text of "what it provides", the queries, the snippets and the page text the loop read, and the evidence of the analysis |

No other organization data leaves. The server needs outbound HTTPS to `www.bing.com` and to public websites (and HTTP on port 80 for the sites that only offer that). An air-gapped installation cannot use the feature: its runs fail with "The run stopped because the web could not be reached".

## Adding another engine

An engine is a replacement for `createBingEngine`, and nothing else changes: the loop, the session and the guard see only the `SearchEngine` interface.

1. Write an object with `search(query, kind, signal)`. It resolves with at most 10 `SearchResult`s (`title`, `url`, `snippet` of at most 1,500 characters, `publishedAt` as an ISO date or `null`, `source` or `null`), and with an empty list when there is no result. For any failure, an abort included, it rejects with a `SearchEngineError`; any other error the session treats as a bug and passes on.
2. Make its requests through `guardedFetch`, so that the URL policy, the address policy and the limits apply to it as well. If the provider limits the rate, reuse `createSearchQueue`.
3. Return result addresses that a page can be read from: not a redirect or tracking wrapper of the engine itself. The session still checks every address with `parsePublicUrl` and drops one that fails.
4. Use it in `createVendorResearcher` (`researchAgent.ts`), where `deps.engine ?? createBingEngine()` is the one place that picks the engine.
5. If the engine needs a key, keep it in the environment only, and never read it into a log line or an error message. This changes the product promise that research needs no account beyond the LLM key, so it is a decision for the product owner, like the release gate.
6. Test it without the network (below), with a fixture of the engine's real answer format.

## Cost and how long a run takes a worker

A typical run is 8 to 16 steps. Each step sends the prompt, the history and the budget, about 6,000 to 8,000 input tokens, so the loop reads roughly 60,000 to 130,000 input tokens, and the analysis another 20,000 to 30,000. On a DeepSeek-class price that is cents; on a frontier-model price it can be a dollar or more. These are estimates. The organization pays on its own key. The daily cap (default 50 runs per organization) bounds the cost, and `VENDOR_RESEARCH_AUTO_RUN=false` removes the automatic part. A run records `searches_used` and `pages_read` for the tool side; the provider's usage page measures the model side.

A run can occupy a worker for about 7 minutes (up to 5 for the loop and 2 for the analysis). The shared automation worker runs 10 jobs at a time, so a burst of runs can leave the last one queued past the 15-minute stale limit, which ends it as `timed out`; the answer is **Research again**. A dedicated queue is the clean fix if this shows up.

## Testing without the network

No unit test touches the network or a real model. Everything that would is injected:

| What | How |
|------|-----|
| The HTTP request | `guardedFetch(url, options, { transport, dnsLookup })`: a fake transport answers from memory, a fake lookup returns the addresses the test wants |
| The fetch of a reader or an engine | `createPageReader({ fetch })` and `createBingEngine({ fetch, queue })` take a fake `guardedFetch` and a queue with no wait |
| The page and the search of a session | `createWebSession({ engine, readPage, ... })` takes a fake engine and a fake `PageReader` |
| The model | `runResearchLoop` and `createVendorResearcher` take a scripted `generate`, a function that returns the steps the test wants |
| The whole research of a run | `PipelineDeps.research` takes a fake `VendorResearcher`, so pipeline tests need neither a model nor the web |

The feed fixtures are in `Servers/services/webResearch/__tests__/__fixtures__/` (`bing-web.xml` and `bing-news.xml`): synthetic feeds shaped like Bing's. The guarded fetch is tested with a scripted transport and a fake address lookup, so it needs no local server either. Run the suites from `Servers`:

```bash
npx jest services/webResearch services/vendorResearch
```

`ts-jest` runs with diagnostics off and `tsc` does not check the tests under `services/`, so type-check them with a scratch `tsconfig` that includes `services/webResearch` and `services/vendorResearch`.
