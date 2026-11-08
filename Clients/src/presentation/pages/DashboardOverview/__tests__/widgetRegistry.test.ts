import { describe, expect, it } from "vitest";
import {
  DASHBOARD_WIDGETS,
  DEFAULT_WIDGET_ORDER,
  buildLayoutForSave,
  groupWidgetRows,
  isWidgetAvailable,
  moveWidget,
  resolveViewLayout,
  type DashboardView,
  type DashboardWidgetKey,
} from "../widgetRegistry";

const VIEWS: DashboardView[] = ["operations", "executive"];
const SERVER_KEY_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

const keysOf = (view: DashboardView, saved?: unknown) =>
  resolveViewLayout(saved as never, view).map((w) => w.key);
const entry = (widgetKey: string, position: number, visible = true) => ({
  widgetKey,
  visible,
  position,
});

describe("widget registry", () => {
  it("lists each registered widget once per view it belongs to", () => {
    for (const view of VIEWS) {
      const keys = DEFAULT_WIDGET_ORDER[view];
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) expect(DASHBOARD_WIDGETS[key]).toBeDefined();
    }
    const placed = new Set(VIEWS.flatMap((view) => [...DEFAULT_WIDGET_ORDER[view]]));
    expect([...placed].sort()).toEqual(Object.keys(DASHBOARD_WIDGETS).sort());
  });

  it("uses keys the server accepts", () => {
    for (const view of VIEWS) {
      for (const key of DEFAULT_WIDGET_ORDER[view]) {
        expect(`${view}.${key}`).toMatch(SERVER_KEY_PATTERN);
      }
    }
  });
});

describe("resolveViewLayout", () => {
  it.each([[null], [undefined], [[]], ["not a list"], [{ layout: [] }], [5]])(
    "falls back to the default layout for %j",
    (saved) => {
      for (const view of VIEWS) {
        const layout = resolveViewLayout(saved as never, view);
        expect(layout.map((w) => w.key)).toEqual([...DEFAULT_WIDGET_ORDER[view]]);
        expect(layout.every((w) => w.visible)).toBe(true);
      }
    },
  );

  it("applies a saved order and visibility", () => {
    const layout = resolveViewLayout(
      [
        entry("operations.model-risks", 0),
        entry("operations.quick-stats", 1, false),
        ...DEFAULT_WIDGET_ORDER.operations
          .filter((key) => key !== "model-risks" && key !== "quick-stats")
          .map((key, i) => entry(`operations.${key}`, i + 2)),
      ],
      "operations",
    );
    expect(layout[0]).toEqual({ key: "model-risks", visible: true });
    expect(layout[1]).toEqual({ key: "quick-stats", visible: false });
    expect(layout).toHaveLength(DEFAULT_WIDGET_ORDER.operations.length);
  });

  it("sorts by position, not by the order of the list", () => {
    const keys = keysOf("operations", [
      entry("operations.quick-stats", 5),
      entry("operations.model-risks", 1),
    ]);
    expect(keys.indexOf("model-risks")).toBeLessThan(keys.indexOf("quick-stats"));
  });

  it("does not let one view's layout affect the other", () => {
    const saved = [entry("executive.task-radar", 0, false)];
    expect(resolveViewLayout(saved, "operations")).toContainEqual({
      key: "task-radar",
      visible: true,
    });
    expect(resolveViewLayout(saved, "executive")).toContainEqual({
      key: "task-radar",
      visible: false,
    });
  });

  it("ignores unknown keys, widgets of another view and malformed entries", () => {
    const keys = keysOf("operations", [
      entry("operations.widget-removed-last-year", 0),
      entry("operations.quantitative-portfolio", 1), // executive only
      entry("nonsense", 2),
      { widgetKey: 7, visible: true, position: 3 },
      { visible: true, position: 4 },
      null,
      "text",
      entry("operations.model-risks", 5),
    ]);
    expect(keys).not.toContain("widget-removed-last-year");
    expect(keys).not.toContain("quantitative-portfolio");
    expect([...keys].sort()).toEqual([...DEFAULT_WIDGET_ORDER.operations].sort());
  });

  it("keeps the first entry when a key is repeated", () => {
    const layout = resolveViewLayout(
      [entry("operations.model-risks", 0, false), entry("operations.model-risks", 1, true)],
      "operations",
    );
    expect(layout.filter((w) => w.key === "model-risks")).toEqual([
      { key: "model-risks", visible: false },
    ]);
  });

  it("treats a non-boolean visible as shown", () => {
    const layout = resolveViewLayout(
      [{ widgetKey: "operations.model-risks", visible: "no", position: 0 }] as never,
      "operations",
    );
    expect(layout.find((w) => w.key === "model-risks")?.visible).toBe(true);
  });

  it("shows widgets missing from an older saved layout, next to their default neighbour", () => {
    // Saved before "task-radar" existed; every other operations widget is reversed.
    const others = DEFAULT_WIDGET_ORDER.operations.filter((key) => key !== "task-radar");
    const saved = [...others].reverse().map((key, i) => entry(`operations.${key}`, i, false));
    const layout = resolveViewLayout(saved, "operations");

    expect(layout).toHaveLength(DEFAULT_WIDGET_ORDER.operations.length);
    const radarIndex = layout.findIndex((w) => w.key === "task-radar");
    expect(layout[radarIndex]).toEqual({ key: "task-radar", visible: true });
    // Its default predecessor is quick-stats.
    expect(layout[radarIndex - 1].key).toBe("quick-stats");
  });

  it("starts the list with a missing widget that has no default predecessor", () => {
    const others = DEFAULT_WIDGET_ORDER.operations.filter((key) => key !== "quick-stats");
    const saved = others.map((key, i) => entry(`operations.${key}`, i));
    expect(keysOf("operations", saved)[0]).toBe("quick-stats");
  });
});

describe("buildLayoutForSave", () => {
  const widgets = [
    { key: "model-risks" as DashboardWidgetKey, visible: false },
    { key: "quick-stats" as DashboardWidgetKey, visible: true },
  ];

  it("replaces only the edited view and numbers positions uniquely", () => {
    const saved = [entry("executive.model-risks", 4, false), entry("operations.task-radar", 2)];
    const layout = buildLayoutForSave(saved, "operations", widgets);
    expect(layout).toEqual([
      entry("executive.model-risks", 0, false),
      entry("operations.model-risks", 1, false),
      entry("operations.quick-stats", 2, true),
    ]);
  });

  it("keeps saved keys this version does not know", () => {
    const saved = [entry("executive.from-a-newer-release", 0)];
    expect(buildLayoutForSave(saved, "operations", widgets)[0].widgetKey).toBe(
      "executive.from-a-newer-release",
    );
  });

  it("drops malformed entries and handles no saved layout", () => {
    expect(buildLayoutForSave(null, "operations", widgets)).toHaveLength(2);
    expect(buildLayoutForSave(["bad", null] as never, "operations", widgets)).toHaveLength(2);
  });
});

describe("moveWidget", () => {
  const list = (...keys: DashboardWidgetKey[]) => keys.map((key) => ({ key, visible: true }));
  const always = () => true;

  it("moves a widget up and down", () => {
    const start = list("quick-stats", "task-radar", "model-risks");
    expect(moveWidget(start, "task-radar", "up", always).map((w) => w.key)).toEqual([
      "task-radar",
      "quick-stats",
      "model-risks",
    ]);
    expect(moveWidget(start, "task-radar", "down", always).map((w) => w.key)).toEqual([
      "quick-stats",
      "model-risks",
      "task-radar",
    ]);
  });

  it("leaves the list alone at either end", () => {
    const start = list("quick-stats", "task-radar");
    expect(moveWidget(start, "quick-stats", "up", always)).toEqual(start);
    expect(moveWidget(start, "task-radar", "down", always)).toEqual(start);
  });

  it("steps over widgets the person cannot see", () => {
    const start = list("quick-stats", "organizational-frameworks", "task-radar");
    const moved = moveWidget(start, "task-radar", "up", (k) => k !== "organizational-frameworks");
    expect(moved.map((w) => w.key)).toEqual([
      "task-radar",
      "organizational-frameworks",
      "quick-stats",
    ]);
  });
});

describe("isWidgetAvailable", () => {
  const none = { hasOrganizationalFrameworks: false, hasQuantitativePortfolio: false };

  it("gates the two widgets that depend on data", () => {
    expect(isWidgetAvailable("organizational-frameworks", none)).toBe(false);
    expect(isWidgetAvailable("quantitative-portfolio", none)).toBe(false);
    expect(
      isWidgetAvailable("organizational-frameworks", {
        ...none,
        hasOrganizationalFrameworks: true,
      }),
    ).toBe(true);
    expect(
      isWidgetAvailable("quantitative-portfolio", { ...none, hasQuantitativePortfolio: true }),
    ).toBe(true);
  });

  it("always offers the others", () => {
    expect(isWidgetAvailable("task-radar", none)).toBe(true);
  });
});

describe("groupWidgetRows", () => {
  it("keeps the long-standing operations rows", () => {
    expect(groupWidgetRows(DEFAULT_WIDGET_ORDER.operations)).toEqual([
      { width: "full", keys: ["quick-stats"] },
      {
        width: "third",
        keys: [
          "task-radar",
          "incident-status",
          "evidence-coverage",
          "governance-score",
          "use-case-risks",
          "vendor-risks",
          "model-risks",
        ],
      },
      { width: "half", keys: ["recent-use-cases", "recent-activity"] },
      { width: "full", keys: ["use-case-lifecycle"] },
      { width: "third", keys: ["training-status", "policy-status", "model-lifecycle"] },
      { width: "full", keys: ["organizational-frameworks"] },
    ]);
  });

  it("keeps the long-standing executive rows", () => {
    expect(groupWidgetRows(DEFAULT_WIDGET_ORDER.executive)).toEqual([
      { width: "full", keys: ["quick-stats"] },
      { width: "full", keys: ["organizational-frameworks"] },
      {
        width: "third",
        keys: ["governance-score", "use-case-risks", "vendor-risks", "model-risks"],
      },
      { width: "full", keys: ["quantitative-portfolio"] },
      { width: "half", keys: ["recent-activity", "recent-use-cases"] },
      { width: "full", keys: ["use-case-lifecycle"] },
      {
        width: "third",
        keys: [
          "training-status",
          "policy-status",
          "incident-status",
          "task-radar",
          "evidence-coverage",
          "model-lifecycle",
        ],
      },
    ]);
  });

  it("answers an empty list with no rows", () => {
    expect(groupWidgetRows([])).toEqual([]);
  });
});
