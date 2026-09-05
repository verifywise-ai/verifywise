/**
 * Shared types for the AI Advisor tool-registry roadmap.
 *
 * The roadmap is read-only metadata: it describes which tools the AI
 * Implementation Plan promised and which ones exist in the codebase. It
 * deliberately contains NO tool definitions, JSON schemas, handler
 * references, or any other write-action implementation detail.
 */

export type RoadmapToolKind = "read" | "write";

export type RoadmapToolStatus = "implemented" | "planned" | "renamed";

/**
 * One row of the static manifest — a single planned tool as catalogued in
 * `tool_list_.md` / `AI Implementation Plan.md`.
 */
export interface RoadmapManifestEntry {
  /** Sequential number from the catalogue (1-265). */
  id: number;
  /** Exact tool name as implemented in code (snake_case). */
  name: string;
  /** Catalogue description (empty for the 47 pre-existing tools). */
  description: string;
  /** Functional domain, e.g. "Risk", "EU AI Act", "Approval Workflow". */
  domain: string;
  /** Plan category: "existing" for the pre-plan baseline, otherwise A-F. */
  category: string;
  /** 0 = pre-plan baseline (47 existing tools), 1 = new tools from Phase 1. */
  phase: number;
  /** Write tools carry the `agent_` prefix per the catalogue legend. */
  kind: RoadmapToolKind;
}

/** A manifest entry enriched with its implementation status. */
export interface RoadmapTool extends RoadmapManifestEntry {
  /** Human-friendly label derived from the tool name. */
  label: string;
  status: RoadmapToolStatus;
  /** Set only when status is "renamed": the name the tool shipped under. */
  implementedAs?: string;
}

export interface RoadmapDomainProgress {
  /** Slugified domain key, stable for filtering. */
  key: string;
  label: string;
  category: string;
  total: number;
  implemented: number;
  percentComplete: number;
}

export interface RoadmapPhaseProgress {
  id: number;
  title: string;
  priority: string;
  dependencies: string;
  total: number;
  implemented: number;
  /** Null for capability phases (2-7) that own no catalogued tools. */
  percentComplete: number | null;
}

export interface RoadmapExtraTool {
  name: string;
  status: "unplanned_implemented";
}

export interface AdvisorToolsRoadmapSummary {
  /** Manifest entries (265 rows in the catalogue). */
  planned: number;
  /** Manifest entries implemented under their catalogued name. */
  implemented: number;
  /** Manifest entries implemented under a renamed tool name. */
  renamed: number;
  /** Manifest entries with no implementation. */
  missing: number;
  /** Implemented tools that do not appear in the plan catalogue. */
  extraImplemented: number;
  /** (implemented + renamed) / planned, rounded to a whole percent. */
  percentComplete: number;
}

export interface AdvisorToolsRoadmap {
  version: number;
  generatedAt: string;
  sources: {
    plan: string;
    catalog: string;
    /** Tool total claimed by the plan document. */
    plannedTotal: number;
    /** Actual parsed catalogue rows; differs from plannedTotal (265 vs 263). */
    manifestEntries: number;
  };
  summary: AdvisorToolsRoadmapSummary;
  domains: RoadmapDomainProgress[];
  phases: RoadmapPhaseProgress[];
  tools: RoadmapTool[];
  /** Names only — never definitions, schemas, or handler details. */
  extraTools: RoadmapExtraTool[];
}
