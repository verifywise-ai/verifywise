# AI Trust Index — App Detail Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the VerifyWise app's AI Trust Index detail page to visual + informational parity with the public website detail page.

**Architecture:** The website is upstream. It already grades each app on a 30-indicator rubric whose award map lives in `ai-safety-index/history/*.json`. We thread that map into the published feed, let it flow through the app's existing `data` jsonb (no query/migration change), seed a day-one snapshot so fresh installs show data immediately, and rebuild `AppDetail/index.tsx` into the website's section set using VerifyWise components/tokens — degrading gracefully when the indicator map is absent.

**Tech Stack:** React 19 + Vite + MUI 7 + React Query (frontend), Node + Express + Sequelize + Jest (backend), Vitest + @testing-library/react (frontend tests).

## Global Constraints

- VerifyWise components over raw MUI where one exists (`CustomizableButton`, `Chip`, `EmptyState`, `PageBreadcrumbs`). Raw MUI `Box`/`Stack`/`Typography` are fine for layout.
- Pixel-string spacing only (`gap: "8px"`, `p: "16px"`), never MUI numeric multipliers.
- Design tokens, never hardcoded hex, where a token exists: border `palette.border.dark` (#d0d5dd), brand `palette.brand.primary` (#13715B), text `palette.text.tertiary` / `theme.palette.text.secondary`. Grade colors come from the feed `design.gradeStyles` block (passed through `data`) or the app's `gradeVariant` Chip variants.
- Sentence case for all UI copy.
- Standard control height 30–34px for buttons.
- New user-facing strings need `de/fr/es` in `Clients/src/.../i18n/translations.ts` so `npm run i18n:audit:strict` passes.
- Border radius 4px on cards/containers (8px acceptable on the grade-hero tile and icon container, matching existing convention).
- Backend: thin controllers → utils; unqualified table names; `verifywise.` prefix only in migration DDL.
- Frontend gates run from `Clients/`: `npm run typecheck && npm run i18n:audit:strict && npm run build`. Backend gate from `Servers/`: `npm run build` + targeted Jest.
- Do NOT push or open a PR without explicit user approval.

**Source-of-truth references (read before porting):**
- Website rubric: `/Users/gorkemcetin/website/verifywise/lib/ai-trust-index-rubric.ts`
- Website insights: `/Users/gorkemcetin/website/verifywise/components/ai-trust-index/app-insights.tsx`
- Website breakdown: `/Users/gorkemcetin/website/verifywise/components/ai-trust-index/score-breakdown.tsx`
- Website detail page: `/Users/gorkemcetin/website/verifywise/app/ai-trust-index/[slug]/page.tsx`
- Website feed route: `/Users/gorkemcetin/website/verifywise/app/ai-trust-index.json/route.ts`

> **Note on the website-repo change:** Task 0 below describes the one upstream change (add `indicators` to the feed). It lives in a separate repo the user commits. It is documented here for completeness and to generate the seed snapshot, but the app build (Tasks 1–8) does not depend on it being deployed — the seed snapshot (Task 2) carries indicators from day one.

---

## File Structure

**Backend (`Servers/`):**
- Modify: `domain.layer/interfaces/i.aiTrustIndex.ts` — add optional `indicators` field + types.
- Create: `database/seeds/ai-trust-index-snapshot.json` — committed feed snapshot (~99 apps, with indicators).
- Create: `database/migrations/<ts>-seed-ai-trust-index-snapshot.js` — idempotent day-one seed.
- Test: `utils/__tests__/aiTrustIndexFeed.test.ts` (extend) — indicators pass-through.

**Frontend (`Clients/src/presentation/pages/AITrustIndex/`):**
- Create: `rubric.ts` — port of website rubric (domains, labels, gap-labels, award/subflag, summarizeDomains).
- Modify: `shared.ts` — extend `TrustIndexAppData` with `indicators` + `confidence`; add `GradeStyle`/`gradeStyleFor` + comparison/related helpers if shared.
- Create: `AppDetail/insights.tsx` — `VerdictLine`, `WatchOuts`, `ComparisonStrip`, `RelatedApps`.
- Create: `AppDetail/ScoreBreakdown.tsx` — per-domain bars + indicator checklist.
- Modify: `AppDetail/index.tsx` — compose all sections.
- Test: `AppDetail/__tests__/insights.test.tsx`, `AppDetail/__tests__/ScoreBreakdown.test.tsx`, `__tests__/rubric.test.ts`.

---

## Task 0: (Upstream, user-committed) Add `indicators` to the website feed

> This task is performed in `/Users/gorkemcetin/website/verifywise` and committed by the user. It is the source of the seed snapshot in Task 2. Listed for completeness; the agent does NOT commit the website repo.

**Files:**
- Modify: `app/ai-trust-index.json/route.ts`

**Interfaces:**
- Produces (in the feed JSON, per app): `indicators: Record<string, { award: "full"|"half"|"zero"; subFlag?: "OK"|"SILENT"|"ADVERSE"|"NA" }> | null`

- [ ] **Step 1:** Add a `feedIndicators(slug)` helper mirroring the existing `feedHistory(slug)` — read `HISTORY_DIR/{slug}.json`, return `assessments[last].indicators` if a non-empty object, else `null`.

```ts
function feedIndicators(slug: string) {
  const p = join(HISTORY_DIR, `${slug}.json`);
  if (!existsSync(p)) return null;
  try {
    const hist = JSON.parse(readFileSync(p, "utf8"));
    const assessments = hist.assessments ?? [];
    const ind = assessments[assessments.length - 1]?.indicators;
    return ind && typeof ind === "object" && Object.keys(ind).length > 0 ? ind : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2:** In `GET`, add `indicators: feedIndicators(app.slug)` to the per-app map alongside `history`. Keep `feedVersion: 2`.

- [ ] **Step 3:** Verify locally: `curl -s localhost:3001/ai-trust-index.json | node -e "const f=JSON.parse(require('fs').readFileSync(0));console.log('with indicators:', f.apps.filter(a=>a.indicators).length, '/', f.apps.length)"` → most apps have a non-null `indicators`.

- [ ] **Step 4:** User commits the website repo.

---

## Task 1: Backend — type-safe `indicators` pass-through

**Files:**
- Modify: `Servers/domain.layer/interfaces/i.aiTrustIndex.ts`
- Test: `Servers/utils/__tests__/aiTrustIndexFeed.test.ts`

**Interfaces:**
- Produces: `ITrustIndexAppData.indicators?: IndicatorMap | null` where `IndicatorMap = Record<string, IndicatorAward>`, `IndicatorAward = { award: "full"|"half"|"zero"; subFlag?: "OK"|"SILENT"|"ADVERSE"|"NA" }`.

- [ ] **Step 1: Write the failing test** (append to `aiTrustIndexFeed.test.ts`, inside the `validateFeed` describe):

```ts
it("preserves an app's indicators map through validation", () => {
  const f = feed(12);
  (f.apps[0] as any).indicators = { "D1.1": { award: "full" }, "D2.2": { award: "zero", subFlag: "SILENT" } };
  const r = validateFeed(f, null);
  expect(r.ok).toBe(true);
  if (r.ok) {
    const a0 = r.apps.find((a) => a.slug === "a0") as any;
    expect(a0.indicators["D1.1"].award).toBe("full");
    expect(a0.indicators["D2.2"].subFlag).toBe("SILENT");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Servers && npx jest utils/__tests__/aiTrustIndexFeed.test.ts -t "preserves an app's indicators"`
Expected: FAIL — TypeScript error on `.indicators` not on type, OR (if `as any` masks it) it actually passes since validateFeed already passes objects through. If it PASSES already, that confirms pass-through; keep the test as a regression guard and proceed to Step 3 for the type.

- [ ] **Step 3: Add the optional field + types** to `i.aiTrustIndex.ts`. Add above or below the interface:

```ts
export type IndicatorAward = {
  award: "full" | "half" | "zero";
  subFlag?: "OK" | "SILENT" | "ADVERSE" | "NA";
};
export type IndicatorMap = Record<string, IndicatorAward>;
```

Inside `interface ITrustIndexAppData`, after `processesBiometrics`:

```ts
  indicators?: IndicatorMap | null;
```

- [ ] **Step 4: Run test + build**

Run: `cd Servers && npx jest utils/__tests__/aiTrustIndexFeed.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add Servers/domain.layer/interfaces/i.aiTrustIndex.ts Servers/utils/__tests__/aiTrustIndexFeed.test.ts
git commit -m "feat(ai-trust-index): add optional indicators map to app data type"
```

---

## Task 2: Backend — day-one seed snapshot + migration

**Files:**
- Create: `Servers/database/seeds/ai-trust-index-snapshot.json`
- Create: `Servers/database/migrations/<ts>-seed-ai-trust-index-snapshot.js`

**Interfaces:**
- Consumes: the live feed (or Task 0's local feed) to produce the snapshot file.
- Produces: rows in `ai_trust_index_apps` on a fresh DB; sets `ai_trust_index_meta.seeded_at`.

- [ ] **Step 1: Generate the snapshot file** from the live feed (includes indicators once Task 0 is deployed; if not yet deployed, indicators are null and the rich sections degrade until the first sync — acceptable):

```bash
cd Servers && node -e "
const https = require('https');
https.get('https://verifywise.ai/ai-trust-index.json', res => {
  let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
    const f = JSON.parse(d);
    require('fs').writeFileSync('database/seeds/ai-trust-index-snapshot.json', JSON.stringify(f, null, 2));
    console.log('wrote', f.apps.length, 'apps; with indicators:', f.apps.filter(a=>a.indicators).length);
  });
});
"
```

Expected: writes the file, prints app count.

- [ ] **Step 2: Generate migration timestamp + file**

Run: `cd Servers && date +%Y%m%d%H%M%S` → use as `<ts>`. Create `database/migrations/<ts>-seed-ai-trust-index-snapshot.js`:

```javascript
"use strict";
// Day-one seed: populate ai_trust_index_apps from a committed feed snapshot so a
// fresh install shows Trust Index data immediately (offline/airgap-safe). Only
// seeds when the table is empty; the weekly cron refreshes it thereafter.
const path = require("path");
const fs = require("fs");

module.exports = {
  async up(queryInterface) {
    const existing = await queryInterface.sequelize.query(
      "SELECT 1 FROM verifywise.ai_trust_index_apps LIMIT 1;",
      { type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    if (existing.length) {
      console.log("[seed] ai_trust_index_apps not empty — skipping snapshot seed");
      return;
    }
    const snapshotPath = path.join(__dirname, "..", "seeds", "ai-trust-index-snapshot.json");
    const feed = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    const apps = feed.apps || [];
    for (const app of apps) {
      await queryInterface.sequelize.query(
        `INSERT INTO verifywise.ai_trust_index_apps
           (slug, name, vendor, category, letter_grade, score_out_of_100, data,
            material_hash, full_hash, is_active, last_changed_at, last_fetched_at)
         VALUES (:slug, :name, :vendor, :category, :grade, :score, :data::jsonb,
            :slug, :slug, TRUE, NOW(), NOW())
         ON CONFLICT (slug) DO NOTHING;`,
        {
          replacements: {
            slug: app.slug,
            name: app.name,
            vendor: app.vendor ?? null,
            category: app.category ?? null,
            grade: app.letterGrade ?? null,
            score: app.scoreOutOf100 ?? null,
            data: JSON.stringify(app),
          },
        },
      );
    }
    await queryInterface.sequelize.query(
      "UPDATE verifywise.ai_trust_index_meta SET seeded_at = NOW(), last_good_count = :n WHERE id = 1;",
      { replacements: { n: apps.length } },
    );
    console.log(`[seed] inserted ${apps.length} AI Trust Index apps`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DELETE FROM verifywise.ai_trust_index_apps;");
    await queryInterface.sequelize.query(
      "UPDATE verifywise.ai_trust_index_meta SET seeded_at = NULL, last_good_count = NULL WHERE id = 1;",
    );
  },
};
```

> **Note on hashes:** the seed sets `material_hash`/`full_hash` to the slug as a placeholder. On the next weekly sync, `upsertFeedTx` recomputes real hashes; the first sync will mark every app `materialChanged` once. Because `seeded_at` is set, that run is NOT treated as a first seed, so it would email recipients. To avoid a spurious "everything changed" digest on the first post-seed sync, compute the real hashes in the seed instead: require the compiled hash util.

- [ ] **Step 3: Use real hashes in the seed** (replace the placeholder). At the top of the migration add:

```javascript
const { computeHashes } = require("../../dist/utils/aiTrustIndexHash");
```

In the loop, before the INSERT:

```javascript
      const { materialHash, fullHash } = computeHashes(app);
```

and change the INSERT replacements `material_hash`/`full_hash` from `:slug` to `:mh` / `:fh`, adding `mh: materialHash, fh: fullHash` to replacements. (Requires `npm run build` first so `dist/` exists — migrations already run against `dist/`.)

- [ ] **Step 4: Build + run the migration on a local DB**

Run: `cd Servers && npm run build && npx sequelize db:migrate`
Expected: `[seed] inserted N AI Trust Index apps`. Re-running migrate (or undo+redo on a non-empty DB) logs the skip.

- [ ] **Step 5: Verify idempotency** — run `npx sequelize db:migrate:undo` then `npx sequelize db:migrate` again; confirm it re-seeds cleanly on the emptied table.

- [ ] **Step 6: Commit**

```bash
git add Servers/database/seeds/ai-trust-index-snapshot.json Servers/database/migrations/*-seed-ai-trust-index-snapshot.js
git commit -m "feat(ai-trust-index): seed day-one app snapshot on fresh installs"
```

---

## Task 3: Frontend — rubric module port

**Files:**
- Create: `Clients/src/presentation/pages/AITrustIndex/rubric.ts`
- Test: `Clients/src/presentation/pages/AITrustIndex/__tests__/rubric.test.ts`

**Interfaces:**
- Produces: `RUBRIC_DOMAINS: { id: string; name: string; weight: number }[]` (D1–D7), `INDICATOR_LABELS: Record<string,string>` (30), `INDICATOR_GAP_LABELS: Record<string,string>` (30), `AWARD_LABELS: { full; half; zero }`, `SUBFLAG_LABELS: { OK; SILENT; ADVERSE; NA }`, types `Award`/`SubFlag`/`IndicatorAward`/`IndicatorMap`, and `summarizeDomains(indicators: IndicatorMap): { id; name; weight; applicable; full; half; zero; na; ratio: number | null }[]`.

- [ ] **Step 1: Copy the rubric verbatim.** Copy `/Users/gorkemcetin/website/verifywise/lib/ai-trust-index-rubric.ts` to `Clients/src/presentation/pages/AITrustIndex/rubric.ts`. It is a pure-data + pure-function module (no React, no Next imports) so it transfers as-is. Add a header comment:

```ts
// Ported from the public website (website/verifywise/lib/ai-trust-index-rubric.ts),
// the source of truth for the AI Trust Index rubric. Keep labels in sync if the
// website rubric changes. AWARD_LABELS.half is "Partial" (not "Disclosed") — do
// not regress the fix made upstream.
```

Verify it includes the corrected `AWARD_LABELS.half = "Partial"` and the `INDICATOR_GAP_LABELS` (30 keys). Remove any `Grade` import if unused; this file should have zero external imports.

- [ ] **Step 2: Write the failing test** (`__tests__/rubric.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { summarizeDomains, INDICATOR_LABELS, INDICATOR_GAP_LABELS, AWARD_LABELS } from "../rubric";

describe("rubric", () => {
  it("AWARD_LABELS.half is Partial (upstream fix not regressed)", () => {
    expect(AWARD_LABELS.half).toBe("Partial");
  });
  it("LABELS and GAP_LABELS cover the same indicator ids", () => {
    const a = Object.keys(INDICATOR_LABELS).sort();
    const b = Object.keys(INDICATOR_GAP_LABELS).sort();
    expect(a).toEqual(b);
  });
  it("summarizeDomains computes credit over applicable indicators", () => {
    const ind = {
      "D1.1": { award: "full" as const },
      "D1.2": { award: "half" as const },
      "D1.3": { award: "zero" as const, subFlag: "SILENT" as const },
      "D1.4": { award: "zero" as const, subFlag: "NA" as const },
    };
    const d1 = summarizeDomains(ind).find((d) => d.id === "D1")!;
    expect(d1.applicable).toBe(3); // NA excluded
    expect(d1.full).toBe(1);
    expect(d1.half).toBe(1);
    expect(d1.zero).toBe(1);
    expect(d1.ratio).toBeCloseTo((1 + 0.5) / 3, 5);
  });
});
```

- [ ] **Step 3: Run test to verify it fails (then passes after the copy is correct)**

Run: `cd Clients && npx vitest run src/presentation/pages/AITrustIndex/__tests__/rubric.test.ts`
Expected: PASS (the copy already implements this). If `AWARD_LABELS.half` fails, the wrong (pre-fix) rubric was copied — recopy from the current website file.

- [ ] **Step 4: Commit**

```bash
git add Clients/src/presentation/pages/AITrustIndex/rubric.ts Clients/src/presentation/pages/AITrustIndex/__tests__/rubric.test.ts
git commit -m "feat(ai-trust-index): port scoring rubric module to the app"
```

---

## Task 4: Frontend — extend shared types

**Files:**
- Modify: `Clients/src/presentation/pages/AITrustIndex/shared.ts`

**Interfaces:**
- Consumes: `IndicatorMap` from `./rubric`.
- Produces: `TrustIndexAppData.indicators?: IndicatorMap | null`; re-exports nothing new beyond the field. `confidence: string` is already on the type.

- [ ] **Step 1: Add the import + field.** In `shared.ts`, add at top:

```ts
import type { IndicatorMap } from "./rubric";
```

In `interface TrustIndexAppData`, after `processesBiometrics: boolean;`:

```ts
  indicators?: IndicatorMap | null;
```

- [ ] **Step 2: Typecheck**

Run: `cd Clients && npm run typecheck`
Expected: no new errors in `AITrustIndex/shared.ts` (pre-existing test-mock errors documented elsewhere are unrelated).

- [ ] **Step 3: Commit**

```bash
git add Clients/src/presentation/pages/AITrustIndex/shared.ts
git commit -m "feat(ai-trust-index): thread indicators into app data type"
```

---

## Task 5: Frontend — insights components (verdict, watch-outs, comparison, related)

**Files:**
- Create: `Clients/src/presentation/pages/AITrustIndex/AppDetail/insights.tsx`
- Test: `Clients/src/presentation/pages/AITrustIndex/AppDetail/__tests__/insights.test.tsx`

**Interfaces:**
- Consumes: `TrustIndexAppData` (`../shared`), `IndicatorMap`/`INDICATOR_GAP_LABELS` (`../rubric`), the full app list passed in as a prop (do NOT fetch inside).
- Produces:
  - `VerdictLine({ app }: { app: TrustIndexAppData })`
  - `WatchOuts({ indicators }: { indicators?: IndicatorMap | null })`
  - `ComparisonStrip({ app, allApps }: { app: TrustIndexAppData; allApps: TrustIndexAppData[] })`
  - `RelatedApps({ app, allApps }: { app: TrustIndexAppData; allApps: TrustIndexAppData[] })`

> Port logic from the website `app-insights.tsx` (already reviewed). Carry the two upstream fixes: `phraseGap` uses `INDICATOR_GAP_LABELS` ("Not stated:"/"Only partial:"); `ComparisonStrip` peer average EXCLUDES the current app and requires `>= 2` peers. Replace Next `<Link>` with react-router `useNavigate`/`<Link>` and website hex with VW tokens.

- [ ] **Step 1: Write the failing test** (`__tests__/insights.test.tsx`):

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VerdictLine, WatchOuts, ComparisonStrip } from "../insights";
import type { TrustIndexAppData } from "../../shared";

const app = (over: Partial<TrustIndexAppData> = {}): TrustIndexAppData => ({
  slug: "x", name: "X", vendor: "V", domain: "x.com", category: "Assistant",
  scoreOutOf100: 82, letterGrade: "B", displayedGrade: "B", confidence: "High",
  dealbreakerFlags: [], summary: "s", highlights: [], policyUrl: "https://x.com",
  policyLastUpdated: null, modalities: ["text"], processesBiometrics: false, ...over,
});

describe("VerdictLine", () => {
  it("states the grade and a band-consistent reason", () => {
    render(<VerdictLine app={app({ displayedGrade: "B", scoreOutOf100: 82 })} />);
    expect(screen.getByText(/earns/i)).toBeInTheDocument();
    expect(screen.getByText(/B \(82\/100\)/)).toBeInTheDocument();
  });
});

describe("WatchOuts", () => {
  it("renders nothing without indicators", () => {
    const { container } = render(<WatchOuts indicators={null} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("lists gap phrases for zero/half indicators", () => {
    render(<WatchOuts indicators={{ "D7.2": { award: "zero", subFlag: "SILENT" } }} />);
    expect(screen.getByText(/Not stated: breach notification/i)).toBeInTheDocument();
  });
});

describe("ComparisonStrip", () => {
  it("excludes the app itself from the peer average", () => {
    const a = app({ slug: "a", category: "Assistant", scoreOutOf100: 90 });
    const peers = [a, app({ slug: "b", category: "Assistant", scoreOutOf100: 70 }), app({ slug: "c", category: "Assistant", scoreOutOf100: 80 })];
    render(<MemoryRouter><ComparisonStrip app={a} allApps={peers} /></MemoryRouter>);
    // peer avg of b,c = 75; vs = +15
    expect(screen.getByText(/\+15/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Clients && npx vitest run src/presentation/pages/AITrustIndex/AppDetail/__tests__/insights.test.tsx`
Expected: FAIL — module `../insights` not found.

- [ ] **Step 3: Implement `insights.tsx`.** Full implementation:

```tsx
// Derived insight blocks for the AI Trust Index app detail page. Ported from the
// public website (components/ai-trust-index/app-insights.tsx). All blocks derive
// from data the record already holds (+ the full app list passed in); no fetching.
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import type { TrustIndexAppData } from "../shared";
import { faviconUrl } from "../shared";
import { INDICATOR_GAP_LABELS, type IndicatorMap } from "../rubric";
import { palette } from "../../../themes/palette";

const VERDICT_QUALITY: Record<string, string> = {
  A: "discloses its data practices clearly",
  B: "discloses most of its data practices",
  C: "discloses its data practices only in part",
  D: "leaves much about its data practices unstated",
  F: "discloses little about its data practices",
};

function gradeArticle(g: string): string {
  return g === "A" || g === "F" ? "an" : "a";
}

export function VerdictLine({ app }: { app: TrustIndexAppData }) {
  const theme = useTheme();
  const g = app.displayedGrade;
  return (
    <Typography sx={{ fontSize: "15px", lineHeight: 1.6, color: theme.palette.text.secondary, mt: "16px" }}>
      {app.name} earns{" "}
      <Box component="span" sx={{ fontWeight: 600, color: palette.brand.primary }}>
        {gradeArticle(g)} {g} ({app.scoreOutOf100}/100)
      </Box>{" "}
      because it {VERDICT_QUALITY[g] ?? "discloses its data practices"}.
    </Typography>
  );
}

function deriveWatchOuts(indicators: IndicatorMap): string[] {
  const order = (a: string) => (a === "zero" ? 0 : a === "half" ? 1 : 2);
  return Object.entries(indicators)
    .filter(([, a]) => (a.award === "zero" || a.award === "half") && a.subFlag !== "NA")
    .sort(([, a], [, b]) => order(a.award) - order(b.award))
    .slice(0, 4)
    .map(([id, a]) => {
      const topic = INDICATOR_GAP_LABELS[id] ?? id;
      return a.award === "half" ? `Only partial: ${topic}` : `Not stated: ${topic}`;
    });
}

export function WatchOuts({ indicators }: { indicators?: IndicatorMap | null }) {
  const items = indicators ? deriveWatchOuts(indicators) : [];
  if (items.length === 0) return null;
  return (
    <Box sx={{ border: `1px solid ${palette.border.dark}`, borderRadius: "4px", p: "16px", backgroundColor: palette.background.accent }}>
      <Typography sx={{ fontSize: "13px", fontWeight: 600, mb: "12px" }}>
        What the policy is silent or vague on
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: "8px" }}>
        {items.map((w, i) => (
          <Typography key={i} sx={{ fontSize: "13px", color: palette.text.tertiary, lineHeight: 1.5 }}>
            • {w}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

export function ComparisonStrip({ app, allApps }: { app: TrustIndexAppData; allApps: TrustIndexAppData[] }) {
  const theme = useTheme();
  const ranked = [...allApps].sort((a, b) => b.scoreOutOf100 - a.scoreOutOf100);
  const rank = ranked.findIndex((a) => a.slug === app.slug) + 1;
  const total = ranked.length;
  const peers = allApps.filter((a) => a.category === app.category && a.slug !== app.slug);
  const peerAvg = peers.length >= 2 ? Math.round(peers.reduce((s, a) => s + a.scoreOutOf100, 0) / peers.length) : null;
  const vsAvg = peerAvg !== null ? app.scoreOutOf100 - peerAvg : null;

  const Cell = ({ value, label, accent }: { value: string; label: string; accent?: string }) => (
    <Box sx={{ flex: 1, textAlign: "center", p: "12px" }}>
      <Typography sx={{ fontSize: "20px", fontWeight: 700, color: accent ?? theme.palette.text.primary }}>{value}</Typography>
      <Typography sx={{ fontSize: "12px", color: palette.text.tertiary, mt: "2px" }}>{label}</Typography>
    </Box>
  );

  return (
    <Stack direction="row" sx={{ border: `1px solid ${palette.border.dark}`, borderRadius: "4px", divide: 1, overflow: "hidden" }}>
      <Cell value={`#${rank}`} label={`of ${total} apps ranked`} />
      <Box sx={{ width: "1px", backgroundColor: palette.border.dark }} />
      <Cell value={`${app.scoreOutOf100}`} label={`score · ${app.category} avg ${peerAvg ?? "—"}`} />
      <Box sx={{ width: "1px", backgroundColor: palette.border.dark }} />
      <Cell value={vsAvg === null ? "—" : `${vsAvg >= 0 ? "+" : ""}${vsAvg}`} label="vs category average" accent={vsAvg !== null ? (vsAvg >= 0 ? palette.brand.primary : "#C2683B") : undefined} />
    </Stack>
  );
}

export function RelatedApps({ app, allApps }: { app: TrustIndexAppData; allApps: TrustIndexAppData[] }) {
  const related = allApps
    .filter((a) => a.category === app.category && a.slug !== app.slug)
    .sort((a, b) => b.scoreOutOf100 - a.scoreOutOf100)
    .slice(0, 4);
  if (related.length === 0) return null;
  return (
    <Box>
      <Typography sx={{ fontSize: "13px", fontWeight: 600, mb: "12px", color: palette.text.tertiary }}>
        Other {app.category.toLowerCase()} apps
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: "8px" }}>
        {related.map((a) => (
          <RouterLink key={a.slug} to={`/ai-trust-index/${a.slug}`} style={{ textDecoration: "none" }}>
            <Stack direction="row" alignItems="center" gap="8px" sx={{ border: `1px solid ${palette.border.dark}`, borderRadius: "4px", p: "8px", backgroundColor: palette.background.main, "&:hover": { backgroundColor: palette.background.accent } }}>
              <img src={faviconUrl(a.domain)} alt={a.name} width={20} height={20} style={{ display: "block" }} />
              <Typography sx={{ flex: 1, fontSize: "13px", fontWeight: 500, color: palette.text.tertiary }}>{a.name}</Typography>
              <Typography sx={{ fontSize: "12px", fontWeight: 700, color: palette.text.tertiary }}>{a.displayedGrade}</Typography>
            </Stack>
          </RouterLink>
        ))}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Clients && npx vitest run src/presentation/pages/AITrustIndex/AppDetail/__tests__/insights.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Clients/src/presentation/pages/AITrustIndex/AppDetail/insights.tsx Clients/src/presentation/pages/AITrustIndex/AppDetail/__tests__/insights.test.tsx
git commit -m "feat(ai-trust-index): add verdict, watch-outs, comparison, related-apps blocks"
```

---

## Task 6: Frontend — ScoreBreakdown component

**Files:**
- Create: `Clients/src/presentation/pages/AITrustIndex/AppDetail/ScoreBreakdown.tsx`
- Test: `Clients/src/presentation/pages/AITrustIndex/AppDetail/__tests__/ScoreBreakdown.test.tsx`

**Interfaces:**
- Consumes: `RUBRIC_DOMAINS`, `INDICATOR_LABELS`, `SUBFLAG_LABELS`, `AWARD_LABELS`, `summarizeDomains`, `IndicatorMap` (`../rubric`).
- Produces: `ScoreBreakdown({ indicators, appName }: { indicators: IndicatorMap; appName?: string })`.

> Port from website `score-breakdown.tsx` (already reviewed, post-fix). The `half` row label MUST be `AWARD_LABELS.half` ("Partial"), not `SUBFLAG_LABELS.OK`.

- [ ] **Step 1: Write the failing test** (`__tests__/ScoreBreakdown.test.tsx`):

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreBreakdown } from "../ScoreBreakdown";

describe("ScoreBreakdown", () => {
  it("renders a domain header and labels a half award 'Partial' (not 'Disclosed')", () => {
    render(<ScoreBreakdown appName="X" indicators={{ "D1.1": { award: "half" } }} />);
    expect(screen.getByText(/Training-data use/i)).toBeInTheDocument();
    expect(screen.getByText("Partial")).toBeInTheDocument();
    expect(screen.queryByText("Disclosed")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Clients && npx vitest run src/presentation/pages/AITrustIndex/AppDetail/__tests__/ScoreBreakdown.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ScoreBreakdown.tsx`:**

```tsx
// Per-domain bars + the full indicator checklist. Ported from the public website
// (components/ai-trust-index/score-breakdown.tsx). Half awards label as "Partial".
import { Box, Stack, Typography } from "@mui/material";
import { RUBRIC_DOMAINS, INDICATOR_LABELS, SUBFLAG_LABELS, AWARD_LABELS, summarizeDomains, type IndicatorMap } from "../rubric";
import { palette } from "../../../themes/palette";

function ratioColor(r: number): string {
  if (r >= 0.75) return "#13715B";
  if (r >= 0.5) return "#2E8B6F";
  if (r >= 0.3) return "#C8941E";
  if (r > 0) return "#C2683B";
  return "#B23B3B";
}

function dot(award: string, subFlag?: string): { color: string; label: string } {
  if (award === "full") return { color: "#13715B", label: AWARD_LABELS.full };
  if (award === "half") return { color: "#C8941E", label: AWARD_LABELS.half };
  if (subFlag === "ADVERSE") return { color: "#B23B3B", label: SUBFLAG_LABELS.ADVERSE };
  if (subFlag === "NA") return { color: "#98A2B3", label: SUBFLAG_LABELS.NA };
  return { color: palette.border.dark, label: SUBFLAG_LABELS.SILENT };
}

export function ScoreBreakdown({ indicators, appName }: { indicators: IndicatorMap; appName?: string }) {
  const domains = summarizeDomains(indicators);
  return (
    <Box>
      <Typography sx={{ fontSize: "13px", fontWeight: 600, mb: "12px" }}>
        {appName ? `${appName} privacy rating` : "Privacy rating"}
      </Typography>
      <Box sx={{ border: `1px solid ${palette.border.dark}`, borderRadius: "4px", overflow: "hidden" }}>
        {RUBRIC_DOMAINS.map((domain, di) => {
          const d = domains.find((x) => x.id === domain.id);
          const ids = Object.keys(indicators).filter((k) => k.startsWith(domain.id + ".")).sort();
          if (!d || ids.length === 0) return null;
          const ratio = d.ratio ?? 0;
          const allNa = d.applicable === 0;
          return (
            <Box key={domain.id}>
              <Box sx={{ backgroundColor: palette.background.accent, px: "16px", py: "12px", borderTop: di === 0 ? "none" : `1px solid ${palette.border.dark}` }}>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap="8px" sx={{ mb: "8px" }}>
                  <Typography sx={{ fontSize: "13px", fontWeight: 600 }}>{domain.name}</Typography>
                  <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                    {allNa ? "Not scored" : `${d.full} of ${d.applicable} disclosed`}
                  </Typography>
                </Stack>
                <Box sx={{ height: "8px", borderRadius: "999px", backgroundColor: "#E5E7EB", overflow: "hidden" }}>
                  <Box sx={{ height: "100%", width: `${Math.round(ratio * 100)}%`, backgroundColor: ratioColor(ratio), borderRadius: "999px" }} />
                </Box>
              </Box>
              {ids.map((id) => {
                const a = indicators[id];
                const dd = dot(a.award, a.subFlag);
                return (
                  <Stack key={id} direction="row" alignItems="flex-start" gap="12px" sx={{ backgroundColor: palette.background.main, px: "16px", py: "8px", borderTop: `1px solid ${palette.border.dark}` }}>
                    <Box sx={{ mt: "6px", width: "10px", height: "10px", borderRadius: "999px", backgroundColor: dd.color, flexShrink: 0 }} />
                    <Typography sx={{ flex: 1, fontSize: "13px", color: palette.text.tertiary }}>{INDICATOR_LABELS[id] ?? id}</Typography>
                    <Typography sx={{ fontSize: "12px", fontWeight: 500, color: palette.text.tertiary, flexShrink: 0 }}>{dd.label}</Typography>
                  </Stack>
                );
              })}
            </Box>
          );
        })}
      </Box>
      <Stack direction="row" flexWrap="wrap" gap="16px" sx={{ mt: "12px" }}>
        {[["#13715B", "Disclosed"], ["#C8941E", "Partial"], [palette.border.dark, "Silent"], ["#B23B3B", "Adverse"], ["#98A2B3", "Not applicable"]].map(([c, l]) => (
          <Stack key={l} direction="row" alignItems="center" gap="6px">
            <Box sx={{ width: "10px", height: "10px", borderRadius: "999px", backgroundColor: c }} />
            <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>{l}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Clients && npx vitest run src/presentation/pages/AITrustIndex/AppDetail/__tests__/ScoreBreakdown.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Clients/src/presentation/pages/AITrustIndex/AppDetail/ScoreBreakdown.tsx Clients/src/presentation/pages/AITrustIndex/AppDetail/__tests__/ScoreBreakdown.test.tsx
git commit -m "feat(ai-trust-index): add per-domain score breakdown component"
```

---

## Task 7: Frontend — compose AppDetail (hero, meter, grade scale, wiring)

**Files:**
- Modify: `Clients/src/presentation/pages/AITrustIndex/AppDetail/index.tsx`
- Test: `Clients/src/presentation/pages/AITrustIndex/AppDetail/__tests__/AppDetail.test.tsx`

**Interfaces:**
- Consumes: `VerdictLine`, `WatchOuts`, `ComparisonStrip`, `RelatedApps` (`./insights`), `ScoreBreakdown` (`./ScoreBreakdown`), `useApp`/`useApps`/`useTrackApp`/`useUntrackApp`, `gradeVariant`/`faviconUrl` (`../shared`).
- The full app list for comparison/related comes from `useApps({})` (the Browse query already returns all active apps with `data`). Map its rows to `TrustIndexAppData[]` via `row.data`.

- [ ] **Step 1: Write the failing test** (`__tests__/AppDetail.test.tsx`) — render the base sections without indicators (degradation path). Mock the hooks:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../../../application/hooks/useAiTrustIndex", () => ({
  useApp: () => ({ data: { data: { slug: "x", name: "X", vendor: "V", category: "Assistant", letter_grade: "B", score_out_of_100: 82, is_tracked: false, data: { slug: "x", name: "X", vendor: "V", domain: "x.com", category: "Assistant", scoreOutOf100: 82, letterGrade: "B", displayedGrade: "B", confidence: "High", dealbreakerFlags: [], summary: "A summary.", highlights: [], policyUrl: "https://x.com", policyLastUpdated: null, modalities: ["text"], processesBiometrics: false } } }, isLoading: false, isError: false }),
  useApps: () => ({ data: { apps: [] } }),
  useTrackApp: () => ({ mutate: vi.fn(), isPending: false }),
  useUntrackApp: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../../../application/contexts/AITrustIndexSidebar.context", () => ({ useAITrustIndexSidebarContextSafe: () => null }));

import AppDetail from "../index";

describe("AppDetail", () => {
  it("renders the verdict and summary without an indicator map", () => {
    render(<MemoryRouter initialEntries={["/ai-trust-index/x"]}>
      <AppDetail />
    </MemoryRouter>);
    expect(screen.getByText(/earns/i)).toBeInTheDocument();
    expect(screen.getByText(/A summary\./)).toBeInTheDocument();
    // breakdown fallback note appears when no indicators
    expect(screen.getByText(/being prepared/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Clients && npx vitest run src/presentation/pages/AITrustIndex/AppDetail/__tests__/AppDetail.test.tsx`
Expected: FAIL — current AppDetail has no verdict, no fallback note.

- [ ] **Step 3: Rewrite `AppDetail/index.tsx`.** Keep the existing header/breadcrumb/track/loading/error scaffolding (lines 1–200 of the current file) and the `SectionCard` helper. Add:
  - `import` the new components + `useApps`.
  - Compute `allApps`: `const { data: appsData } = useApps({}); const allApps = useMemo(() => (appsData?.apps ?? []).map((r: any) => r.data as TrustIndexAppData).filter(Boolean), [appsData]);`
  - After the header `<Stack>`, insert in order: grade hero with score meter (replace the current text-only score line with a meter bar), `<VerdictLine app={detail} />`, capped note, dealbreaker flags (existing), `<ComparisonStrip app={detail} allApps={allApps} />`, grade-scale chips, Summary (existing), Highlights (existing), `<WatchOuts indicators={detail.indicators} />`, then the breakdown:

```tsx
{detail.indicators && Object.keys(detail.indicators).length > 0 ? (
  <ScoreBreakdown indicators={detail.indicators} appName={app.name} />
) : (
  <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mt: "8px" }}>
    The area-by-area breakdown for {app.name} is being prepared and will appear after its next scoring pass. The summary and highlights above reflect the latest assessment.
  </Typography>
)}
```

  - Policy details (existing) → `<RelatedApps app={detail} allApps={allApps} />`.

  Score meter bar (insert in the hero, using grade-variant color via the feed `design.gradeStyles` if present on `detail`, else a brand fallback):

```tsx
<Box sx={{ mt: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
  <Box sx={{ flex: 1, height: "8px", borderRadius: "999px", backgroundColor: "#E5E7EB", overflow: "hidden" }}>
    <Box sx={{ height: "100%", width: `${detail.scoreOutOf100}%`, backgroundColor: palette.brand.primary, borderRadius: "999px" }} />
  </Box>
  <Typography sx={{ fontSize: "13px", fontWeight: 600, color: theme.palette.text.secondary }}>
    {detail.scoreOutOf100}<Box component="span" sx={{ color: palette.text.tertiary }}>/100</Box>
  </Typography>
</Box>
```

  Grade-scale chips:

```tsx
<Stack direction="row" flexWrap="wrap" gap="8px" alignItems="center" sx={{ mt: "16px" }}>
  <Typography sx={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: palette.text.tertiary }}>Grade scale</Typography>
  {(["A","B","C","D","F"] as const).map((g) => (
    <Chip key={g} label={`${g} · ${{A:"85–100",B:"70–84",C:"55–69",D:"40–54",F:"0–39"}[g]}`} variant={gradeVariant(g)} uppercase={false} sx={{ opacity: g === detail.displayedGrade ? 1 : 0.5 }} />
  ))}
</Stack>
```

- [ ] **Step 4: Run test + typecheck**

Run: `cd Clients && npx vitest run src/presentation/pages/AITrustIndex/AppDetail/__tests__/AppDetail.test.tsx && npm run typecheck`
Expected: PASS; no new type errors in AITrustIndex.

- [ ] **Step 5: Commit**

```bash
git add Clients/src/presentation/pages/AITrustIndex/AppDetail/index.tsx Clients/src/presentation/pages/AITrustIndex/AppDetail/__tests__/AppDetail.test.tsx
git commit -m "feat(ai-trust-index): rebuild app detail with grade hero, meter, verdict, breakdown, related"
```

---

## Task 8: i18n + final gates

**Files:**
- Modify: `Clients/src/.../i18n/translations.ts` (locate via `grep -rl "i18n/translations" Clients/src` or the existing audit config)

**Interfaces:** none.

- [ ] **Step 1: Run the i18n audit to list new gaps**

Run: `cd Clients && npm run i18n:audit:strict`
Expected: lists any new untranslated strings introduced (e.g. "What the policy is silent or vague on", "Grade scale", "vs category average", "Other {category} apps", "privacy rating", legend labels, the fallback note, "of {n} apps ranked").

- [ ] **Step 2: Add de/fr/es entries** for every new key the audit reports, matching the existing translation structure.

- [ ] **Step 3: Re-run all frontend gates**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run build`
Expected: typecheck clean (apart from documented pre-existing test-mock errors), i18n 100%/0 gaps, build succeeds.

- [ ] **Step 4: Run all AITrustIndex tests (frontend + backend)**

Run:
```bash
cd Clients && npx vitest run src/presentation/pages/AITrustIndex
cd ../Servers && npx jest utils/__tests__/aiTrustIndexFeed.test.ts
```
Expected: all PASS.

- [ ] **Step 5: prettier**

Run: `cd Clients && npx prettier --write src/presentation/pages/AITrustIndex && cd ../Servers && npx prettier --write database/migrations/*-seed-ai-trust-index-snapshot.js domain.layer/interfaces/i.aiTrustIndex.ts`

- [ ] **Step 6: Commit**

```bash
git add Clients/src Servers/domain.layer Servers/database
git commit -m "feat(ai-trust-index): i18n + formatting for detail parity"
```

---

## Self-Review

**Spec coverage:**
- Website feed `indicators` → Task 0. ✓
- Backend optional interface field → Task 1. ✓
- Day-one seed snapshot + migration → Task 2. ✓
- Rubric port (with upstream fixes) → Task 3. ✓
- Type threading → Task 4. ✓
- Verdict / watch-outs / comparison / related → Task 5. ✓
- Score breakdown → Task 6. ✓
- AppDetail compose (hero, meter, grade scale, degradation) → Task 7. ✓
- Graceful degradation (no indicators) → Task 7 Step 3 fallback + Task 5 WatchOuts null + Task 6 only rendered when indicators present. ✓
- i18n → Task 8. ✓
- Testing across units → Tasks 1,3,5,6,7,8. ✓
- Keep Track toggle → Task 7 (existing header retained). ✓

**Type consistency:** `IndicatorMap`/`IndicatorAward` defined in Task 1 (backend) and Task 3 (frontend rubric, independent copy — intentional, the two repos don't share types). `ComparisonStrip`/`RelatedApps` take `{ app, allApps }` consistently in Task 5 (defs) and Task 7 (call sites). `ScoreBreakdown({ indicators, appName })` consistent Task 6 ↔ Task 7. `summarizeDomains` return shape (`full/half/zero/na/applicable/ratio`) consistent Task 3 ↔ Task 6.

**Placeholder scan:** no TBD/TODO; all code steps show full code; all commands have expected output.

**Out-of-scope confirmed absent:** no manual sync endpoint, no hash change, no cadence change.
