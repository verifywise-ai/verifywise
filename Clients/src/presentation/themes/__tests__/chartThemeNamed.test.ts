import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadChartTheme(style?: "classic") {
  vi.resetModules();
  if (style) window.localStorage.setItem("vw-ui-style", style);
  else window.localStorage.removeItem("vw-ui-style");
  return (await import("../chartTheme")).chartTheme;
}

const isColour = (v: unknown) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

/** Every colour reachable from the named maps, flattened with a readable path. */
function collect(theme: Awaited<ReturnType<typeof loadChartTheme>>) {
  const named = {
    entity: theme.entity,
    actionFill: theme.actionFill,
    entityTypes: theme.entityTypes,
    fileTypes: theme.fileTypes,
    medal: theme.medal,
    bars: theme.bars,
    providers: theme.providers,
    providerFallback: theme.providerFallback,
    contestants: theme.contestants,
    tiles: theme.tiles,
    menuIcons: theme.menuIcons,
    confetti: theme.confetti,
    avatars: theme.avatars,
    lines: theme.lines,
  } as Record<string, unknown>;
  const out: [string, unknown][] = [];
  const walk = (path: string, v: unknown) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(`${path}[${i}]`, x));
    else if (v && typeof v === "object")
      Object.entries(v).forEach(([k, x]) => walk(`${path}.${k}`, x));
    else out.push([path, v]);
  };
  Object.entries(named).forEach(([k, v]) => walk(k, v));
  return out;
}

describe("chartTheme named colour maps", () => {
  beforeEach(() => window.localStorage.removeItem("vw-ui-style"));
  afterEach(() => window.localStorage.removeItem("vw-ui-style"));

  it("holds a defined hex colour for every entry in phase 1", async () => {
    const entries = collect(await loadChartTheme());
    expect(entries.length).toBeGreaterThan(60);
    expect(entries.filter(([, v]) => !isColour(v)).map(([k]) => k)).toEqual([]);
  });

  it("holds a defined hex colour for every entry in classic", async () => {
    const entries = collect(await loadChartTheme("classic"));
    expect(entries.filter(([, v]) => !isColour(v)).map(([k]) => k)).toEqual([]);
  });

  it("keeps the classic look's original colours", async () => {
    const t = await loadChartTheme("classic");
    expect(t.entityTypes.risk).toBe("#F44336");
    expect(t.entityTypes.framework).toBe("#607D8B");
    expect(t.actionFill).toBe("#4C7DE7");
    expect(t.fileTypes.pdf).toBe("#E53935");
  });

  it("uses series colours in phase 1, never the classic hex", async () => {
    const t = await loadChartTheme();
    expect(t.entityTypes.risk).toBe(t.series[4]);
    expect(t.entityTypes.framework).toBe(t.series[9]);
    expect(t.tiles).toHaveLength(9);
  });
});
