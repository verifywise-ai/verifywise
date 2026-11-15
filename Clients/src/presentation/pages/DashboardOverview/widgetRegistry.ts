import type { DashboardLayoutEntry } from "../../../application/repository/dashboardPreferences.repository";

/**
 * Dashboard widget registry (#5257): what can appear on the dashboard, in what
 * order by default, and how a person's saved layout is applied.
 *
 * WIDGET KEYS ARE STORED IN USER DATA. Never rename one. To retire a widget
 * delete it here: saved entries for it are ignored. A new widget is added here
 * and to DEFAULT_WIDGET_ORDER, and appears for everyone next to its default
 * neighbour even if they saved a layout before it existed. The compiler then
 * asks for its renderer in DashboardWidgets.tsx.
 *
 * Each view has its own layout. Saved keys are `<view>.<widget key>`, for
 * example `operations.task-radar`.
 */

export type DashboardView = "operations" | "executive";

/** How much of a row a widget takes. */
export type WidgetWidth = "third" | "half" | "full";

interface DashboardWidgetDefinition {
  /** Name in the Edit layout list. */
  label: string;
  width: WidgetWidth;
  defaultVisible: boolean;
}

export const DASHBOARD_WIDGETS = {
  "quick-stats": { label: "Quick stats", width: "full", defaultVisible: true },
  "task-radar": { label: "Task radar", width: "third", defaultVisible: true },
  "incident-status": { label: "Incident status", width: "third", defaultVisible: true },
  "evidence-coverage": { label: "Evidence coverage", width: "third", defaultVisible: true },
  "governance-score": { label: "AI governance score", width: "third", defaultVisible: true },
  "use-case-risks": { label: "Use case & framework risks", width: "third", defaultVisible: true },
  "vendor-risks": { label: "Vendor risks", width: "third", defaultVisible: true },
  "model-risks": { label: "Model risks", width: "third", defaultVisible: true },
  "recent-use-cases": { label: "Recent use cases", width: "half", defaultVisible: true },
  "recent-activity": { label: "Recent activity", width: "half", defaultVisible: true },
  "use-case-lifecycle": { label: "Use case lifecycle", width: "full", defaultVisible: true },
  "training-status": { label: "Training status", width: "third", defaultVisible: true },
  "policy-status": { label: "Policy status", width: "third", defaultVisible: true },
  "model-lifecycle": { label: "Model lifecycle", width: "third", defaultVisible: true },
  "organizational-frameworks": {
    label: "Organizational frameworks",
    width: "full",
    defaultVisible: true,
  },
  "quantitative-portfolio": {
    label: "Quantitative risk portfolio",
    width: "full",
    defaultVisible: true,
  },
} as const satisfies Record<string, DashboardWidgetDefinition>;

export type DashboardWidgetKey = keyof typeof DASHBOARD_WIDGETS;

export const DEFAULT_WIDGET_ORDER: Record<DashboardView, readonly DashboardWidgetKey[]> = {
  operations: [
    "quick-stats",
    "task-radar",
    "incident-status",
    "evidence-coverage",
    "governance-score",
    "use-case-risks",
    "vendor-risks",
    "model-risks",
    "recent-use-cases",
    "recent-activity",
    "use-case-lifecycle",
    "training-status",
    "policy-status",
    "model-lifecycle",
    "organizational-frameworks",
  ],
  executive: [
    "quick-stats",
    "organizational-frameworks",
    "governance-score",
    "use-case-risks",
    "vendor-risks",
    "model-risks",
    "quantitative-portfolio",
    "recent-activity",
    "recent-use-cases",
    "use-case-lifecycle",
    "training-status",
    "policy-status",
    "incident-status",
    "task-radar",
    "evidence-coverage",
    "model-lifecycle",
  ],
};

export interface ViewWidget {
  key: DashboardWidgetKey;
  visible: boolean;
}

export interface WidgetAvailabilityContext {
  hasOrganizationalFrameworks: boolean;
  hasQuantitativePortfolio: boolean;
}

/** Some widgets exist only when their data does; they are not offered otherwise. */
export function isWidgetAvailable(
  key: DashboardWidgetKey,
  context: WidgetAvailabilityContext,
): boolean {
  if (key === "organizational-frameworks") return context.hasOrganizationalFrameworks;
  if (key === "quantitative-portfolio") return context.hasQuantitativePortfolio;
  return true;
}

export function defaultViewLayout(view: DashboardView): ViewWidget[] {
  return DEFAULT_WIDGET_ORDER[view].map((key) => ({
    key,
    visible: DASHBOARD_WIDGETS[key].defaultVisible,
  }));
}

const layoutKey = (view: DashboardView, key: DashboardWidgetKey) => `${view}.${key}`;

/**
 * The server only checks the shape it knows; what comes back is still data
 * from an older or newer release, so anything unusable is dropped here.
 */
function validEntries(saved: unknown): DashboardLayoutEntry[] {
  if (!Array.isArray(saved)) return [];
  return saved
    .filter(
      (entry): entry is DashboardLayoutEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.widgetKey === "string" &&
        typeof entry.position === "number",
    )
    .sort((a, b) => a.position - b.position);
}

/**
 * The layout to show for a view. Without a saved layout that is the default.
 * Saved entries the registry does not know are ignored, and a widget missing
 * from the saved layout (it did not exist yet) goes right after its nearest
 * default predecessor that is in the list.
 */
export function resolveViewLayout(
  saved: DashboardLayoutEntry[] | null | undefined,
  view: DashboardView,
): ViewWidget[] {
  const defaults = DEFAULT_WIDGET_ORDER[view];
  const known = new Map<string, DashboardWidgetKey>(
    defaults.map((key) => [layoutKey(view, key), key]),
  );

  const result: ViewWidget[] = [];
  const placed = new Set<DashboardWidgetKey>();
  for (const entry of validEntries(saved)) {
    const key = known.get(entry.widgetKey);
    if (!key || placed.has(key)) continue;
    placed.add(key);
    result.push({ key, visible: entry.visible !== false });
  }

  defaults.forEach((key, defaultIndex) => {
    if (placed.has(key)) return;
    const predecessor = defaults
      .slice(0, defaultIndex)
      .reverse()
      .find((candidate) => placed.has(candidate));
    const insertAt = predecessor ? result.findIndex((w) => w.key === predecessor) + 1 : 0;
    result.splice(insertAt, 0, { key, visible: DASHBOARD_WIDGETS[key].defaultVisible });
    placed.add(key);
  });

  return result;
}

/**
 * The full list to store after editing one view. Only the edited view's known
 * widgets are replaced. The other view's entries and any key this release does
 * not know are kept, so a save never loses them. Positions are unique across
 * the whole list.
 */
export function buildLayoutForSave(
  saved: DashboardLayoutEntry[] | null | undefined,
  view: DashboardView,
  widgets: ViewWidget[],
): DashboardLayoutEntry[] {
  const replaced = new Set<string>(DEFAULT_WIDGET_ORDER[view].map((key) => layoutKey(view, key)));
  const kept = validEntries(saved).filter((entry) => !replaced.has(entry.widgetKey));
  const edited = widgets.map((widget) => ({
    widgetKey: layoutKey(view, widget.key),
    visible: widget.visible,
  }));
  return [...kept, ...edited].map((entry, position) => ({
    widgetKey: entry.widgetKey,
    visible: entry.visible,
    position,
  }));
}

/**
 * Swap a widget with its nearest neighbour the person can see. Widgets that are
 * not available stay in the list, so they keep a place for when their data
 * appears.
 */
export function moveWidget(
  widgets: ViewWidget[],
  key: DashboardWidgetKey,
  direction: "up" | "down",
  isAvailable: (key: DashboardWidgetKey) => boolean,
): ViewWidget[] {
  const from = widgets.findIndex((w) => w.key === key);
  if (from === -1) return widgets;
  const step = direction === "up" ? -1 : 1;
  let to = from + step;
  while (to >= 0 && to < widgets.length && !isAvailable(widgets[to].key)) to += step;
  if (to < 0 || to >= widgets.length) return widgets;

  const next = [...widgets];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export interface WidgetRow {
  width: WidgetWidth;
  keys: DashboardWidgetKey[];
}

/**
 * Consecutive widgets of the same width share a grid, which wraps by itself; a
 * change of width starts a new row. Full-width widgets are each their own row.
 */
export function groupWidgetRows(keys: readonly DashboardWidgetKey[]): WidgetRow[] {
  const rows: WidgetRow[] = [];
  for (const key of keys) {
    const width = DASHBOARD_WIDGETS[key].width;
    const last = rows[rows.length - 1];
    if (last && last.width === width && width !== "full") {
      last.keys.push(key);
    } else {
      rows.push({ width, keys: [key] });
    }
  }
  return rows;
}
