/**
 * Builds the read-only AI Advisor tools-roadmap payload.
 *
 * Inputs: the static catalogue manifest (`manifest.ts`, derived from
 * `tool_list_.md` / `AI Implementation Plan.md`) and the set of tool names
 * currently implemented in the codebase. Output is pure roadmap metadata —
 * it never includes tool definitions, JSON schemas, handler/execute/file
 * references, approval rules, or input parameters, so it is safe to expose
 * to read-only roles.
 */

import { ROADMAP_MANIFEST } from "./manifest";
import type {
  AdvisorToolsRoadmap,
  RoadmapDomainProgress,
  RoadmapExtraTool,
  RoadmapPhaseProgress,
  RoadmapTool,
} from "./types";

/** Explicit response schema version — bump on any breaking payload change. */
export const ROADMAP_API_VERSION = 1;

/** Roles allowed to read the advisor tools roadmap (enforced server-side). */
export const ADVISOR_ROADMAP_READ_ROLES = ["Admin", "Editor", "Reviewer", "Auditor"];

/** Tool total claimed by "AI Implementation Plan.md" (263). */
export const PLAN_CLAIMED_TOOL_TOTAL = 263;

/**
 * Plan tools that shipped under a different name. The disagreement between
 * the plan catalogue and the codebase is surfaced as status "renamed"
 * rather than silently editing the manifest.
 */
export const RENAMED_TOOLS: Record<string, string> = {
  agent_update_finding_governance: "agent_update_finding_governance_status",
};

/**
 * Static phase metadata from the plan's Phase Summary table. Only phase 0
 * (pre-plan baseline) and phase 1 (tool delivery) own catalogued tools;
 * phases 2-7 are platform capabilities and carry no tool counts.
 */
const PLAN_PHASES: Array<Pick<RoadmapPhaseProgress, "id" | "title" | "priority" | "dependencies">> =
  [
    { id: 0, title: "Existing baseline (pre-plan)", priority: "—", dependencies: "—" },
    { id: 1, title: "Write Tools", priority: "High", dependencies: "—" },
    { id: 2, title: "Approval Gateway", priority: "High", dependencies: "Phase 1" },
    {
      id: 3,
      title: "Multi-Agent Orchestration",
      priority: "Medium-High",
      dependencies: "Phase 1, 2",
    },
    { id: 4, title: "Proactive AI", priority: "Medium", dependencies: "Phase 1, 2, 3" },
    {
      id: 5,
      title: "Natural Language Control Plane",
      priority: "Medium",
      dependencies: "Phase 1, 2, 3",
    },
    {
      id: 6,
      title: "Compliance Autopilot",
      priority: "Low-Medium",
      dependencies: "Phase 1, 2, 3, 4, 5",
    },
    {
      id: 7,
      title: "AI Skills + Plugin Auto-Discovery (MCP)",
      priority: "Low",
      dependencies: "Phase 1, 2, 3",
    },
  ];

/** "agent_create_risk" -> "Create risk"; "generate_chart" -> "Generate chart". */
function humanizeToolName(name: string): string {
  const words = name
    .replace(/^agent_/, "")
    .split("_")
    .filter(Boolean);
  if (words.length === 0) return name;
  return [words[0][0].toUpperCase() + words[0].slice(1), ...words.slice(1)].join(" ");
}

function percent(implemented: number, total: number): number {
  return total === 0 ? 0 : Math.round((implemented / total) * 100);
}

/**
 * Compute the full roadmap payload from the manifest and the implemented
 * tool names. Pure function — no I/O — so it is trivially testable.
 */
export function buildToolsRoadmap(implementedNames: ReadonlySet<string>): AdvisorToolsRoadmap {
  const renameTargets = new Set(Object.values(RENAMED_TOOLS));
  const manifestNames = new Set(ROADMAP_MANIFEST.map((e) => e.name));

  const tools: RoadmapTool[] = ROADMAP_MANIFEST.map((entry) => {
    const base: RoadmapTool = {
      ...entry,
      label: humanizeToolName(entry.name),
      status: "planned",
    };
    if (implementedNames.has(entry.name)) {
      base.status = "implemented";
    } else {
      const renamedTo = RENAMED_TOOLS[entry.name];
      if (renamedTo && implementedNames.has(renamedTo)) {
        base.status = "renamed";
        base.implementedAs = renamedTo;
      }
    }
    return base;
  });

  const isDelivered = (t: RoadmapTool) => t.status === "implemented" || t.status === "renamed";

  const implemented = tools.filter((t) => t.status === "implemented").length;
  const renamed = tools.filter((t) => t.status === "renamed").length;

  // Domain rollups, ordered by first appearance in the catalogue.
  const domainMap = new Map<string, RoadmapDomainProgress>();
  for (const tool of tools) {
    let bucket = domainMap.get(tool.domain);
    if (!bucket) {
      bucket = {
        key: tool.domain
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, ""),
        label: tool.domain,
        category: tool.category,
        total: 0,
        implemented: 0,
        percentComplete: 0,
      };
      domainMap.set(tool.domain, bucket);
    }
    bucket.total += 1;
    if (isDelivered(tool)) bucket.implemented += 1;
  }
  const domains = [...domainMap.values()].map((d) => ({
    ...d,
    percentComplete: percent(d.implemented, d.total),
  }));

  // Phase rollups; capability phases (2-7) own no tools.
  const phases: RoadmapPhaseProgress[] = PLAN_PHASES.map((phase) => {
    const phaseTools = tools.filter((t) => t.phase === phase.id);
    const total = phaseTools.length;
    const done = phaseTools.filter(isDelivered).length;
    return {
      ...phase,
      total,
      implemented: done,
      percentComplete: total === 0 ? null : percent(done, total),
    };
  });

  // Implemented tools the plan never catalogued — names only, no details.
  const extraTools: RoadmapExtraTool[] = [...implementedNames]
    .filter((name) => !manifestNames.has(name) && !renameTargets.has(name))
    .sort()
    .map((name) => ({ name, status: "unplanned_implemented" as const }));

  return {
    version: ROADMAP_API_VERSION,
    generatedAt: new Date().toISOString(),
    sources: {
      plan: "AI Implementation Plan.md",
      catalog: "tool_list_.md",
      plannedTotal: PLAN_CLAIMED_TOOL_TOTAL,
      manifestEntries: ROADMAP_MANIFEST.length,
    },
    summary: {
      planned: ROADMAP_MANIFEST.length,
      implemented,
      renamed,
      missing: tools.length - implemented - renamed,
      extraImplemented: extraTools.length,
      percentComplete: percent(implemented + renamed, ROADMAP_MANIFEST.length),
    },
    domains,
    phases,
    tools,
    extraTools,
  };
}
