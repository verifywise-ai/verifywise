/**
 * @fileoverview Risk Inheritance Graph type definitions.
 *
 * Local colors and labels for the inheritance explorer. Entity-type labels are
 * reused from the domain; risk levels are rendered as raw strings (as in
 * LinkedRisksPanel) because the three tables use different level vocabularies.
 */

import type { RiskLinkEntityType } from "../../../domain/interfaces/i.riskLink";
import { palette } from "../../themes/palette";

// ReactFlow node data with index signature for compatibility
export interface RiskInheritanceNodeData {
  name: string;
  entityType: RiskLinkEntityType;
  riskLevel: string | null;
  /** ISO timestamp when the node's parent last moved level, if any. */
  staleSince: string | null;
  // Index signature for ReactFlow compatibility
  [key: string]: unknown;
}

// Node border colors per entity type
export const ENTITY_TYPE_COLORS: Record<RiskLinkEntityType, string> = {
  risk: palette.status.info.text, // Blue
  model_risk: palette.accent.purple.text, // Purple
  vendor_risk: palette.riskMark.medium, // Amber
};

// Edge labels shown on the canvas
export const EDGE_LABELS = {
  inherits: "Inherits",
  suggested: "Suggested",
  competing: "Competing",
  related: "Related",
} as const;
