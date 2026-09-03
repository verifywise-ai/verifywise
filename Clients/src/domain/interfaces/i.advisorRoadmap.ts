/**
 * Types mirroring the versioned payload of GET /api/advisor/tools/roadmap.
 * Roadmap metadata only — the endpoint never exposes tool definitions,
 * schemas, or write-action implementation details.
 */

export type RoadmapToolKind = "read" | "write";

export type RoadmapToolStatus = "implemented" | "planned" | "renamed";

export interface IRoadmapTool {
  id: number;
  name: string;
  label: string;
  description: string;
  domain: string;
  category: string;
  phase: number;
  kind: RoadmapToolKind;
  status: RoadmapToolStatus;
  implementedAs?: string;
}

export interface IRoadmapDomainProgress {
  key: string;
  label: string;
  category: string;
  total: number;
  implemented: number;
  percentComplete: number;
}

export interface IRoadmapPhaseProgress {
  id: number;
  title: string;
  priority: string;
  dependencies: string;
  total: number;
  implemented: number;
  /** Null for capability phases (2-7) that own no catalogued tools. */
  percentComplete: number | null;
}

export interface IRoadmapExtraTool {
  name: string;
  status: "unplanned_implemented";
}

export interface IRoadmapSummary {
  planned: number;
  implemented: number;
  renamed: number;
  missing: number;
  extraImplemented: number;
  percentComplete: number;
}

export interface IAdvisorToolsRoadmap {
  version: number;
  generatedAt: string;
  sources: {
    plan: string;
    catalog: string;
    plannedTotal: number;
    manifestEntries: number;
  };
  summary: IRoadmapSummary;
  domains: IRoadmapDomainProgress[];
  phases: IRoadmapPhaseProgress[];
  tools: IRoadmapTool[];
  extraTools: IRoadmapExtraTool[];
}
