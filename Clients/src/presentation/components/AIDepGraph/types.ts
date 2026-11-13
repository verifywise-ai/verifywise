/**
 * @fileoverview AI Dependency Graph Type Definitions
 *
 * Types for the AI Dependency Graph visualization component.
 */

import type {
  DependencyNodeType as DomainDependencyNodeType,
  EdgeRelationship,
  ConfidenceLevel,
  RiskLevel,
  FilePath,
  GovernanceStatus,
} from "../../../domain/ai-detection/types";
import { palette } from "../../themes/palette";

// Re-export for convenience
export type DependencyNodeType = DomainDependencyNodeType;

// ReactFlow node data with index signature for compatibility
export interface AIDepNodeData {
  label: string;
  sublabel?: string;
  nodeType: DependencyNodeType;
  color: string;
  provider: string;
  confidence: ConfidenceLevel;
  riskLevel: RiskLevel;
  fileCount: number;
  filePaths: FilePath[];
  governanceStatus?: GovernanceStatus | null;
  connectionCount?: number;
  isHighlighted?: boolean;
  findingId: number;
  // Index signature for ReactFlow compatibility
  [key: string]: unknown;
}

// ReactFlow edge data
export interface AIDepEdgeData {
  relationship: EdgeRelationship;
  confidence: ConfidenceLevel;
}

// Node type colors
export const NODE_TYPE_COLORS: Record<DependencyNodeType, string> = {
  library: palette.status.info.text, // Blue
  model: palette.accent.purple.text, // Purple
  api: palette.riskMark.medium, // Amber
  secret: palette.riskMark.critical, // Red
  rag: palette.status.success.strong, // Emerald
  agent: "#6366f1", // Indigo
  repository: palette.text.icon, // Slate
};

// Node type labels
export const NODE_TYPE_LABELS: Record<DependencyNodeType, string> = {
  library: "Library",
  model: "Model",
  api: "API call",
  secret: "Secret",
  rag: "RAG",
  agent: "Agent",
  repository: "Repository",
};

// Edge relationship labels
export const EDGE_RELATIONSHIP_LABELS: Record<EdgeRelationship, string> = {
  uses: "Uses",
  calls: "Calls",
  requires: "Requires",
  exposes: "Exposes",
  orchestrates: "Orchestrates",
  contains: "Contains",
};

// Risk level colors
export const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  high: palette.riskMark.critical,
  medium: palette.riskMark.medium,
  low: palette.status.success.strong,
};

// Confidence level colors
export const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  high: palette.status.success.strong,
  medium: palette.riskMark.medium,
  low: palette.text.disabled,
};
