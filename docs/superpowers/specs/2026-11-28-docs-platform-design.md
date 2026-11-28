# Docs platform overhaul: design

Date: 2026-11-28
Status: draft for approval

## Intent and why

The VerifyWise user guide works, but it doesn't help people as much as it should. The content is uneven, screenshots are old and sparse, there are no diagrams, and the website copy of the guide drifts from the app's copy. We want a docs experience that is clearly the best in our category: easy to read, accurate, visual and interactive, both on the website and in the app.

There are two readers, in this order of importance:

1. **A prospect evaluating VerifyWise on the website.** They land from search or from verifywise.ai and should understand what VerifyWise does and how it fits together within a minute, then see real screens.
2. **A daily user stuck on a screen.** They open help from the page they are on and need the answer for that screen: where things are, whether their role can do it, the steps, and what to watch out for.

Success looks like: a prospect can explain the product after the docs home page; a user gets from "stuck" to "done" without leaving the help panel; every article has the same shape and current screenshots; and future articles keep that shape without anyone policing it by hand.

## Where we are (2026-11-28, develop 12bb3b2084)

- 122 articles in 15 collections, about 132,600 words, as typed TS block arrays in `shared/user-guide-content/` (15 block types).
- Three renderers: in-app (`Clients/src/presentation/components/UserGuide/`, ContentRenderer 904 lines), website (`~/website/verifywise/components/user-guide/`, separate repo, content copied by hand) and a stale Vite app (`docs/api-docs/`, also kept in sync by a backend CI check for API endpoints).
- 49 images in 22 articles (18%), all captured before the 2026-11-13 restyle, 18.6 MB of PNG. No diagrams.
- Only 41% of articles have a roles section, 20% a "where to find it" section, 18% troubleshooting. 31 articles have no incoming links.
- Contextual help is a strength: about 80 app routes open the right article (`guideRouteMap.ts`, `helpArticlePath`, `HelperIcon` with `#section`). PR #5574 adds a CI test that every such path resolves.
- Website search covers titles, descriptions and keywords only; no left nav tree; no last-updated date.

## Goals

1. One renderer for the website and the in-app panel, so a block looks and behaves the same in both, and nothing is copied between repositories by hand.
2. Public docs that always match the released product.
3. A standard article shape, checked in CI, used by every existing and future feature article.
4. New blocks: annotated screenshot with zoom, stacked flow diagram, steps with "you're done when", where-in-VerifyWise path, role table, related pages list, titled callouts.
5. Current screenshots across the guide, captured by a script so they can be refreshed after any UI change.
6. A docs home page and a panel home that serve both readers (as mocked; see "Decided design").
7. Website features: left nav, full-text search with ⌘K, heading anchors, breadcrumbs, last updated, previous/next, "was this page helpful", copy page as Markdown, `.md` per page, `llms.txt`, sitemap and per-page social metadata.
8. A custom SVG icon set, one icon per sidebar item, used in the docs only.

## Non-goals

- Translating docs content. Content stays English; the app shell around the panel keeps its existing i18n.
- Replacing the app's sidebar icons (the new icons are docs only, user decision).
- Grounding the AI advisor in the guide. Worth doing later; the `.md` output makes it easier.
- Versioned docs per release on the website. The website shows the latest release; self-hosted users get their version's docs in the panel.
- Moving to MDX or a hosted docs product.

## Anti-goals (would make this a failure even if it works)

- Docs that state something the product doesn't do. Every claim is checked against the code. (This happened in the first mockup: the scorecard was wrongly described as built from risks; the code says it comes from four questions.)
- Screenshots showing a real person's name, including the user's own; all names are realistic fictional people.
- Breaking contextual help: article ids and heading ids that app pages link to must stay stable, or get redirects.
- A docs site that publishes unreleased features.
- Wording that needs effort to decode. Plain full sentences over terse labels (user feedback on the first diagram).
- The stock "AI look": no centred hero over a gradient, no emoji icons, no numbered section labels, no monospace labels outside code, no cream backgrounds.

## Constraints

- Self-hosted installs bundle the guide and its images into the app and must work offline; image weight matters.
- The panel is 400 to 800px wide; the website content column is about 760px. Blocks must lay out by their container's width, not the viewport.
- House UI rules: sentence case, colours and corners from tokens, brand `#14715B`, 34px controls in the app.
- No competitor names in the repo, commits or docs.
- The website repo (`bluewave-labs/verifywise-web`) deploys with `vercel --prod` from a clean checkout; it is not git-connected.
- `docs/api-docs/src/config/endpoints.ts` is kept in sync with `swagger.yaml` by `backend-checks.yml`; the API reference move must keep an equivalent check.

## Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | Keep two renderers, share a written spec | Cheapest now; every new block built twice (MUI and Tailwind); drift continues | Rejected |
| B | One shared renderer copied to the website by script | One implementation; still cross-repo copying and hand releases; website can still show unreleased text | Rejected, half a fix |
| **C** | **Docs app in this monorepo, one renderer shared with the in-app panel, served at verifywise.ai/user-guide by a website rewrite, deployed from `master`** | One source for content, renderer, images and checks; PR previews; public docs match releases. Costs a new Vercel project, a rewrite rule and removing the website's copy | **Chosen** |
| D | Off-the-shelf docs framework | Search and nav free, but the in-app panel can't use it, hosted options break offline self-hosting, two content formats | Rejected |

## Decided design

These were decided with the user (2026-11-28) unless marked "my call".

### 1. Architecture

- **Content** stays in `shared/user-guide-content/` as typed TS blocks. Article and heading ids are stable.
- **Renderer** moves to a new package `shared/user-guide-renderer/`: React components with plain CSS (CSS custom properties for tokens, container queries for width). No MUI and no Tailwind inside it. Each host passes a small adapter: link component, image base URL, "open in app" URL builder, and token values. (my call)
- **In-app panel** (`Clients/.../UserGuide/`) keeps its shell (drawer, tabs, history, route map, AI advisor and What's new tabs) and renders articles and the panel home with the shared renderer.
- **Docs app** is a new top-level `Docs/` Next.js app (my call: Next because the website is Next and the rewrite is a standard Next multi-zone set-up). It replaces `docs/api-docs/` and hosts both the user guide and the API reference.
- **URLs:** `verifywise.ai/user-guide/...` stays (user decision). The website adds rewrites for `/user-guide/:path*` (and `/api-docs/:path*`) to the docs app. The docs app sets an `assetPrefix` so its assets don't clash with the website's.
- **Deploys:** a new Vercel project for `Docs/`, git-connected to this repo, production branch `master` (user decision: public docs match released code), previews for PRs. Builds are skipped when neither `Docs/` nor `shared/user-guide-*` changed.
- **Cutover:** when the docs app is live behind the rewrite and checked (every old URL resolves, sitemap, metadata), delete the website's `app/user-guide`, `content/user-guide`, `public/images/user-guide` and `app/api-docs` (user agreed). The website-only `regulations-tracker` section moves into the docs app.

### 2. Content model

New block types (names are my call):

- `where`: path segments as shown in the app (`["Vendors", "Vendors tab"]`) and an optional app route for "Open in app".
- `roles`: rows of action × role (Admin, Editor, Reviewer, Auditor, and custom-role note), each Yes/No, plus a "don't see it?" sentence. Values must come from the permission keys the routes check, not guesses.
- `flow`: the chosen stacked diagram. Nodes have a title, a one-line meaning (shown in brand green), a body, optional chips and an accent flag; links between nodes carry a plain sentence ("You answer four questions about the vendor"). Same vertical shape at every width.
- `steps`: ordered items with text and an optional "You're done when" line. The step text is vertically centred on its number.
- `screenshot`: src, width, height, alt, caption and marks (`x`, `y`, optional box `l,t,w,h` in percent, title, body). Renders the framed, annotated, zoomable figure from the mockup: hover a note to highlight its area, click a note or the image to zoom, "Show all" or Escape to reset, notes focusable with Enter/Space, zoom announced to screen readers, respects reduced motion.
- `related`: the related-pages list (replaces `article-links` at the end of articles).
- `callout` gets a required `title`.

Article metadata adds: `summary` (one or two sentences), `type` (feature, task, concept, troubleshooting, guided-path, reference), and computed `lastUpdated` (from git at build) and reading time.

### 3. Article template

For `type: feature` articles, in this order:

1. Summary (one or two sentences)
2. Where in VerifyWise (`where`)
3. Who can do what (`roles`)
4. How it works (text, usually a `flow`)
5. How to … (one section per task: `steps` and a `screenshot`)
6. Important considerations (titled callouts)
7. Troubleshooting (optional: symptom, cause, what to do)
8. Related pages (`related`)

Other types have lighter templates: task (where, steps, related), concept (how it works, related), troubleshooting (symptom/cause/fix entries), guided path (outcome, time, steps with "you're done when", next path).

**Enforcement:** a CI test fails when a feature article misses a required section, has them out of order, has an untitled callout, an image without alt text, a screenshot with more than 8 marks, or a dead link. The `document-writer-for-verifywise` skill is rewritten to produce TS blocks in this template, and `CLAUDE.md` plus `docs/technical/guides/adding-new-feature.md` require it for every user-visible feature.

### 4. Pages, as mocked and approved

The approved mockups are committed next to this document in `2026-11-28-docs-platform-mockups/`: `article-page.html` (article, with a toggle for the 400px panel), `docs-home.html` (docs home, panel home and the icon first pass) and `diagram-options.html` (the diagram study; option B there is the left-to-right layout the user later rejected as packed: the chosen style is its vertical panel form, used at every width, as in `article-page.html`). Open them in a browser; they are self-contained apart from Google Fonts and one existing screenshot.

- **Article page (website):** top bar with ⌘K search, left nav grouped like the app sidebar, breadcrumbs, title, summary, last updated and reading time, the template sections, "Was this page helpful?", previous/next, and a right rail with "On this page" and page actions (copy as Markdown, open in an AI assistant, last updated).
- **Article in the panel:** the same content and renderer at 400px; fonts and padding step down by container query.
- **Docs home (website):**
  - left-aligned title, large search and popular topics
  - "How VerifyWise fits together" as a stacked flow: Record (know what AI you have), then Track (know how risky it is), then Enforce (make the rules stick)
  - two entry points: "New to VerifyWise?" and "Stuck on a screen?"
  - browse by area, grouped exactly like the app sidebar (Everyday, Record, Track, Enforce, Workspace), each item with its icon, a plain one-line description and an article count
  - guided paths by role with time estimates
  - frameworks by type (laws, standards, guidance)
  - recently updated
- **Panel home:** search; a "Help for this page" card for the current route with its key articles; "Stuck?" links; browse by area.

### 5. Icons

A custom two-tone SVG set, one per sidebar item (18): Home, Dashboard, Workflows, Incidents, Tasks, Inventory, AI Trust Index, AI Detection, Evidence & reports, Intake, AI risks, Vendors, Frameworks, Policy, LLM Evals, AI Gateway, Agent controls, Settings. 24px grid, 1.5 stroke, brand green with a light tint. Used at 40px on docs pages and 16 to 18px in lists. Docs only (user decision). The first pass in the mockup needs a stronger tint, because the tint vanishes on the light green tile.

### 6. Screenshots

- A Playwright capture script in the repo signs in to a running local stack and visits each screen listed in a manifest.
- It reads mark positions from `data-testid` element rectangles and writes 2x WebP at a fixed CSS width, with width and height recorded.
- Source data: the local Meridian demo org (org 2) for now (user approved). All visible names are realistic fictional people, never the user's.
- Before each capture the script checks the page text against a deny list of real names and fails if one appears.
- Images live in one place in this repo and are used by both hosts.
- Budget: aim for under 25 MB of images in total for the app bundle.

### 7. Content program

- Rewrite all 122 articles to the template, most-read first.
- Add the "What VerifyWise does in five minutes" overview, five guided paths by role, a troubleshooting section, a glossary and a frameworks-by-type page.
- Every claim is checked against the code; permission tables come from the route permission keys.
- Plain, full sentences throughout.

## Phases

| Phase | What | Notes |
|---|---|---|
| 0 | Live bugs (done) | PR #5574; website fixes deployed 2026-11-28 |
| 1 | Renderer package, new blocks, docs app with home/article/search/nav, panel adopts renderer, icon set, API reference ported as is | Large. Existing content renders at parity; no article uses a new block yet |
| 2 | **Cutover**: rewrite live, every old URL checked, website copy deleted, mirroring to the website ends | Small. Must happen before any article uses a new block, because the website's old renderer can't show them |
| 3 | Capture pipeline; rewrite about 25 most-used articles with new screenshots | Large |
| 4 | Remaining articles, guided paths, troubleshooting, glossary, frameworks page; CI template check made required; skill and CLAUDE.md updated | Large, parallel by collection |

## Calls made after the builder check

These questions came up when the design was read as a builder. Each was settled from the conversation or as a low-risk call (marked "my call").

- **Interim website (my call):** cutover moves to right after phase 1, so no block is ever built twice. Until cutover, guide changes keep being mirrored to the website as today, and no article uses a new block.
- **Collections and URLs (my call):** collections, article ids and URLs stay as they are. The sidebar grouping (Everyday, Record, Track, Enforce, Workspace) is a navigation map laid over them. Collections that match no sidebar item (getting started, developers and API, integrations, regulations tracker) get their own groups after the sidebar ones. Contextual help links therefore don't change.
- **API reference (my call):** ported as is into the docs app in phase 1, with the `backend-checks.yml` sync check moved in the same PR that deletes `docs/api-docs/`. A redesign with the new blocks is a later, separate piece of work.
- **Header and footer (decided by the approved mockup):** a docs-only top bar with links to the user guide, API reference, release notes and verifywise.ai. The marketing site's header and footer are not reused. Cookie consent follows whatever analytics the docs app ends up sending.
- **Dark mode (my call):** not shipped now. Every colour in the renderer is a token, so it can be added later without touching blocks.
- **Which articles first (my call):** the articles that app pages link to most (`guideRouteMap.ts`, `helpArticlePath`), then the website's most-visited guide pages if analytics show them.
- **Urgent docs fixes (user decision):** a PR that touches only guide content or the docs app may go straight into `master` as a docs hotfix, and is then merged back into `develop`. Feature docs still ship with their release.
- **Content review (user decision):** agents write each article to the template and check every claim against the code; one PR per collection (about 15), each reviewed by the user before merge.
- **Screenshots (my call):** captured by hand on the local Meridian demo org for now, as approved. A reproducible seed (the repo's `insertMockData` demo seeder) so anyone or CI can recapture is a follow-up. Screenshots are taken from the branch that ships the feature, so they reach `master` with it.

## Left to the builder

- Exact package layout and build tooling for the renderer, and how both hosts compile it.
- Search index format (client-side, built at build time over block text per heading).
- Analytics destination for "Was this page helpful" on the website (the in-app panel doesn't send it; self-hosted installs don't phone home).
- The capture manifest format and the per-screen test ids to add to the app.
- Redirects for any article id that has to change.
