import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Theme = Awaited<ReturnType<typeof loadChartTheme>>;

async function loadChartTheme(style?: "classic") {
  vi.resetModules();
  if (style) window.localStorage.setItem("vw-ui-style", style);
  else window.localStorage.removeItem("vw-ui-style");
  return (await import("../chartTheme")).chartTheme;
}

/** Named maps that screens read instead of indexing the chart series. */
const MAPS = [
  "entity",
  "action",
  "entityTypes",
  "fileTypes",
  "medal",
  "bars",
  "providers",
  "providerFallback",
  "contestants",
  "tiles",
  "menuIcons",
  "confetti",
  "avatars",
  "lines",
  "workStatus",
  "tipAccents",
  "progress",
  "controls",
  "statusBreakdown",
] as const;

const isColour = (v: unknown) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

/** Read "a.b[2].c" from the theme. */
function read(theme: Theme, path: string): unknown {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], theme);
}

/** Every colour reachable from the named maps, with a readable path. */
function collect(theme: Theme) {
  const out: [string, unknown][] = [];
  const walk = (path: string, v: unknown) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(`${path}[${i}]`, x));
    else if (v && typeof v === "object")
      Object.entries(v).forEach(([k, x]) => walk(`${path}.${k}`, x));
    else out.push([path, v]);
  };
  MAPS.forEach((m) => walk(m, (theme as unknown as Record<string, unknown>)[m]));
  return out;
}

/**
 * The colour each screen rendered in the classic look before the restyle
 * (read from the screens at 06e927eb9). Classic must keep every one of them.
 */
const CLASSIC_ORIGINALS: [string, string][] = [
  ["entity.indigo", "#6366F1"],
  ["entity.pink", "#EC4899"],
  ["entity.blue", "#3B82F6"],
  ["entity.teal", "#0CA5AF"],
  ["entity.heart", "#FF1493"],
  ["action.fill", "#4C7DE7"],
  ["action.hover", "#175CD3"],
  ["action.border", "#175CD3"],
  ["entityTypes.model", "#2196F3"],
  ["entityTypes.risk", "#F44336"],
  ["entityTypes.vendor", "#9C27B0"],
  ["entityTypes.evidence", "#FF9800"],
  ["entityTypes.framework", "#607D8B"],
  ["fileTypes.pdf", "#E53935"],
  ["fileTypes.image", "#1E88E5"],
  ["fileTypes.doc", "#00ACC1"],
  ["fileTypes.sheet", "#43A047"],
  ["medal.gold", "#D4AF37"],
  ["medal.bronze", "#CD7F32"],
  ["bars.primary", "#5C8A7D"],
  ["bars.secondary", "#7986CB"],
  ["providers.openai", "#10A37F"],
  ["providers.anthropic", "#D4A574"],
  ["providers.gemini", "#4285F4"],
  ["providers.google", "#4285F4"],
  ["providers.mistral", "#FF7000"],
  ["providers.xai", "#1DA1F2"],
  ["providers.bedrock", "#FF9900"],
  ["providers.azure", "#0078D4"],
  ["providers.together_ai", "#6366F1"],
  ["providers.deepinfra", "#06B6D4"],
  ["providers.cohere", "#39B89D"],
  ["providerFallback[0]", "#13715B"],
  ["providerFallback[1]", "#3B82F6"],
  ["providerFallback[2]", "#F59E0B"],
  ["providerFallback[3]", "#EF4444"],
  ["providerFallback[4]", "#8B5CF6"],
  ["providerFallback[5]", "#06B6D4"],
  ["providerFallback[6]", "#EC4899"],
  ["providerFallback[7]", "#14B8A6"],
  ["providerFallback[8]", "#F97316"],
  ["providerFallback[9]", "#6366F1"],
  ["contestants[0].main", "#3b82f6"],
  ["contestants[0].light", "#eff6ff"],
  ["contestants[0].text", "#1e40af"],
  ["contestants[1].main", "#ef4444"],
  ["contestants[1].light", "#fef2f2"],
  ["contestants[1].text", "#991b1b"],
  ["contestants[2].main", "#10b981"],
  ["contestants[2].light", "#ecfdf5"],
  ["contestants[2].text", "#065f46"],
  ["contestants[3].main", "#f59e0b"],
  ["contestants[3].light", "#fffbeb"],
  ["contestants[3].text", "#92400e"],
  ["contestants[4].main", "#8b5cf6"],
  ["contestants[4].light", "#f5f3ff"],
  ["contestants[4].text", "#5b21b6"],
  ["contestants[5].main", "#ec4899"],
  ["contestants[5].light", "#fdf2f8"],
  ["contestants[5].text", "#9d174d"],
  ["tiles[0]", "#1E88E5"],
  ["tiles[1]", "#F4511E"],
  ["tiles[2]", "#7B1FA2"],
  ["tiles[3]", "#00796B"],
  ["tiles[4]", "#D84315"],
  ["tiles[5]", "#283593"],
  ["tiles[6]", "#558B2F"],
  ["tiles[7]", "#C2185B"],
  ["tiles[8]", "#1565C0"],
  ["menuIcons[0]", "#81C784"],
  ["menuIcons[1]", "#64B5F6"],
  ["menuIcons[2]", "#BA68C8"],
  ["menuIcons[3]", "#FFB74D"],
  ["menuIcons[4]", "#7986CB"],
  ["menuIcons[5]", "#E57373"],
  ["menuIcons[6]", "#F06292"],
  ["menuIcons[7]", "#4DD0E1"],
  ["menuIcons[8]", "#FF8A65"],
  ["confetti[0]", "#FF1493"],
  ["confetti[1]", "#FF69B4"],
  ["confetti[2]", "#9D4EDD"],
  ["confetti[3]", "#06FFA5"],
  ["confetti[4]", "#FFD60A"],
  ["confetti[5]", "#FF006E"],
  ["confetti[6]", "#FB5607"],
  ["confetti[7]", "#3A86FF"],
  ["confetti[8]", "#8338EC"],
  ["confetti[9]", "#FFBE0B"],
  ["confetti[10]", "#FF006E"],
  ["confetti[11]", "#06FFA5"],
  ["avatars[0]", "#EF4444"],
  ["avatars[1]", "#F59E0B"],
  ["avatars[2]", "#10B981"],
  ["avatars[3]", "#3B82F6"],
  ["avatars[4]", "#8B5CF6"],
  ["avatars[5]", "#EC4899"],
  ["avatars[6]", "#06B6D4"],
  ["avatars[7]", "#F97316"],
  ["avatars[8]", "#14B8A6"],
  ["avatars[9]", "#6366F1"],
  ["avatars[10]", "#A855F7"],
  ["avatars[11]", "#84CC16"],
  ["lines[0]", "#2563EB"],
  ["lines[1]", "#DC2626"],
  ["lines[2]", "#16A34A"],
  ["lines[3]", "#7C3AED"],
  ["lines[4]", "#EA580C"],
  ["lines[5]", "#0891B2"],
  ["lines[6]", "#DB2777"],
  ["lines[7]", "#CA8A04"],
  ["lines[8]", "#0D9488"],
  ["lines[9]", "#4F46E5"],
  ["lines[10]", "#059669"],
  ["lines[11]", "#9333EA"],
  ["lines[12]", "#C026D3"],
  ["lines[13]", "#65A30D"],
  ["lines[14]", "#0284C7"],
  // getStatusColor in pages/ISO/style.ts at ba592b3ec
  ["workStatus.notStarted", "#475467"],
  ["workStatus.draft", "#D97706"],
  ["workStatus.inProgress", "#2563EB"],
  ["workStatus.awaitingReview", "#7C3AED"],
  ["workStatus.awaitingApproval", "#4F46E5"],
  ["workStatus.implemented", "#059669"],
  ["workStatus.done", "#059669"],
  ["workStatus.audited", "#0D9488"],
  ["workStatus.needsRework", "#EA580C"],
  // components/EmptyState/EmptyStateTip.tsx at ba592b3ec
  ["tipAccents[0].bg", "#ECFDF3"],
  ["tipAccents[0].icon", "#039855"],
  ["tipAccents[0].border", "#A6F4C5"],
  ["tipAccents[1].bg", "#EFF8FF"],
  ["tipAccents[1].icon", "#1570EF"],
  ["tipAccents[1].border", "#84CAFF"],
  ["tipAccents[2].bg", "#FFFAEB"],
  ["tipAccents[2].icon", "#DC6803"],
  ["tipAccents[2].border", "#FEDF89"],
  // getProgressColor in ProjectCard/ProgressBar and ControlsTable at ba592b3ec
  ["progress[0]", "#FF4500"],
  ["progress[1]", "#FF4500"],
  ["progress[2]", "#FFA500"],
  ["progress[3]", "#FFD700"],
  ["progress[4]", "#E9F14F"],
  ["progress[5]", "#CDDD24"],
  ["progress[6]", "#64E730"],
  ["progress[7]", "#32CD32"],
  ["progress[8]", "#228B22"],
  ["progress[9]", "#008000"],
  // utils/inputStyles.ts and utils/tabUtils.tsx at ba592b3ec
  ["controls.inputHoverBorder", "#5FA896"],
  ["controls.tabBadge.text", "#047857"],
  ["controls.tabBadge.bg", "#D1FAE5"],
  // components/Modals/Basic/style.ts at ba592b3ec
  ["controls.dangerButton.bg", "#DB504A"],
  ["controls.dangerButton.hover", "#C23C34"],
  // STATUS_COLORS in pages/Framework/Dashboard/StatusBreakdownCard.tsx at ba592b3ec
  // (text.disabled and brand.primary resolved to their classic hex)
  ["statusBreakdown[0]", "#9CA3AF"],
  ["statusBreakdown[1]", "#D1D5DB"],
  ["statusBreakdown[2]", "#F59E0B"],
  ["statusBreakdown[3]", "#3B82F6"],
  ["statusBreakdown[4]", "#13715B"],
  ["statusBreakdown[5]", "#EA580C"],
];

describe("chartTheme named colour maps", () => {
  beforeEach(() => window.localStorage.removeItem("vw-ui-style"));
  afterEach(() => window.localStorage.removeItem("vw-ui-style"));

  it("holds a defined hex colour for every entry in phase 1", async () => {
    const entries = collect(await loadChartTheme());
    expect(entries.length).toBeGreaterThan(100);
    expect(entries.filter(([, v]) => !isColour(v)).map(([k]) => k)).toEqual([]);
  });

  it("holds a defined hex colour for every entry in classic", async () => {
    const entries = collect(await loadChartTheme("classic"));
    expect(entries.filter(([, v]) => !isColour(v)).map(([k]) => k)).toEqual([]);
  });

  it("covers every classic entry in the originals table", async () => {
    const paths = collect(await loadChartTheme("classic")).map(([k]) => k);
    const pinned = new Set(CLASSIC_ORIGINALS.map(([k]) => k));
    expect(paths.filter((k) => !pinned.has(k))).toEqual([]);
  });

  it.each(CLASSIC_ORIGINALS)("classic %s keeps its original colour %s", async (path, hex) => {
    const theme = await loadChartTheme("classic");
    expect(String(read(theme, path)).toLowerCase()).toBe(hex.toLowerCase());
  });

  it("uses series colours in phase 1, never the classic hex", async () => {
    const t = await loadChartTheme();
    expect(t.entityTypes.risk).toBe(t.series[4]);
    expect(t.entityTypes.framework).toBe(t.series[9]);
    expect(t.tiles).toHaveLength(9);
  });

  it("gives the action buttons one set of phase 1 button tokens", async () => {
    const t = await loadChartTheme();
    const { button } = await import("../palette");
    expect(t.action.fill).toBe(button.primary.contained.bg.default);
    expect(t.action.hover).toBe(button.primary.contained.bg.hover);
    expect(t.action.border).toBe(button.primary.contained.bg.default);
  });

  it("takes each phase 1 contestant tint and text from the same hue as its colour", async () => {
    const { accent } = await import("../palette");
    const t = await loadChartTheme();
    const families = [
      accent.indigo,
      accent.pink,
      accent.amber,
      accent.teal,
      accent.orange,
      accent.purple,
    ];
    t.contestants.forEach((c, i) => {
      expect(c.main).toBe(t.series[i]);
      expect(c.light).toBe(families[i].bg);
      expect(c.text).toBe(families[i].text);
    });
  });

  it("keeps distinct work status colours in phase 1, with In progress on the Medium signal", async () => {
    const t = await loadChartTheme();
    const { riskMark, brand, part } = await import("../palette");
    const ws = t.workStatus;
    expect(ws.inProgress).toBe(riskMark.medium);
    expect(ws.needsRework).toBe(riskMark.high);
    const notDone = [
      ws.notStarted,
      ws.draft,
      ws.inProgress,
      ws.awaitingReview,
      ws.awaitingApproval,
      ws.audited,
      ws.needsRework,
    ];
    expect(new Set(notDone).size).toBe(notDone.length);
    expect(notDone).not.toContain(ws.done);
    const risky = Object.values(riskMark);
    expect(risky).not.toContain(ws.draft);
    expect(risky).not.toContain(ws.awaitingReview);
    const forbidden = [
      brand.primary,
      ...Object.values(part).flatMap((family) => Object.values(family)),
    ];
    Object.values(ws).forEach((colour) => expect(forbidden).not.toContain(colour));
  });

  it("colours the phase 1 status donut like the status dots", async () => {
    const t = await loadChartTheme();
    const ws = t.workStatus;
    expect(t.statusBreakdown).toEqual([
      ws.notStarted,
      ws.draft,
      ws.inProgress,
      ws.awaitingReview,
      ws.implemented,
      ws.needsRework,
    ]);
  });

  it("maps a status string to its colour in both looks (getStatusColor)", async () => {
    vi.resetModules();
    window.localStorage.setItem("vw-ui-style", "classic");
    const classicFn = (await import("../../pages/ISO/style")).getStatusColor;
    expect(classicFn("In Progress")).toBe("#2563EB");
    expect(classicFn("draft")).toBe("#D97706");
    expect(classicFn("")).toBe("#475467");
    expect(classicFn("something else")).toBe("#475467");

    const t = await loadChartTheme();
    const phase1Fn = (await import("../../pages/ISO/style")).getStatusColor;
    expect(phase1Fn("In progress")).toBe(t.workStatus.inProgress);
    expect(phase1Fn("Awaiting review")).toBe(t.workStatus.awaitingReview);
  });

  it("gives the phase 1 delete button a darker hover than its fill", async () => {
    const t = await loadChartTheme();
    const { riskMark, primitives } = await import("../palette");
    expect(t.controls.dangerButton.bg).toBe(riskMark.critical);
    expect(t.controls.dangerButton.hover).toBe(primitives.red[700]);
    expect(t.controls.dangerButton.hover).not.toBe(t.controls.dangerButton.bg);
  });

  it("scoreColor keeps the classic 10% bands and the phase 1 score steps", async () => {
    vi.resetModules();
    window.localStorage.setItem("vw-ui-style", "classic");
    const classic = (await import("../chartTheme")).scoreColor;
    expect([0, 10, 11, 25, 50, 70, 71, 90, 91, 100].map(classic)).toEqual([
      "#FF4500",
      "#FF4500",
      "#FF4500",
      "#FFA500",
      "#E9F14F",
      "#64E730",
      "#32CD32",
      "#228B22",
      "#008000",
      "#008000",
    ]);

    vi.resetModules();
    window.localStorage.removeItem("vw-ui-style");
    const { scoreColor } = await import("../chartTheme");
    const { score } = await import("../palette");
    expect(scoreColor(0)).toBe(score[0]);
    expect(scoreColor(46)).toBe(score[5]);
    expect(scoreColor(100)).toBe(score[10]);
  });
});
