import type { EntityType } from "../EntityNode";
import { brand } from "../../../themes/palette";

// Entity type colors following VerifyWise design system
export const entityColors: Record<EntityType, string> = {
  useCase: `${brand.primary}`, // Primary green
  model: "#2196F3", // Blue
  risk: "#f44336", // Red
  vendor: "#9c27b0", // Purple
  evidence: "#ff9800", // Orange
  framework: "#607d8b", // Blue grey
  user: "#795548", // Brown
};

// Risk level priority for coloring
export const riskPriority: Record<string, number> = {
  "Critical": 4,
  "Very high risk": 4,
  "High": 3,
  "High risk": 3,
  "Medium": 2,
  "Medium risk": 2,
  "Low": 1,
  "Low risk": 1,
  "Very low risk": 0,
};

// Layout configuration for node positioning
export const layoutConfig = {
  centerX: 600,
  centerY: 400,
  useCaseRadius: 180,
  modelRadius: 350,
  vendorRadius: 350,
  riskRadius: 500,
  evidenceRadius: 550,
};

// Timing constants (in milliseconds)
export const TIMING = {
  SEARCH_DEBOUNCE: 300,
  FOCUS_DELAY: 300,
  ZOOM_DURATION: 800,
  HIGHLIGHT_DURATION: 2000,
  TOAST_DURATION: 4000,
} as const;

// Zoom and viewport constants
export const VIEWPORT = {
  FOCUS_ZOOM: 1.2,
  MIN_ZOOM: 0.1,
  MAX_ZOOM: 2,
  FIT_VIEW_PADDING: 0.2,
  FOCUS_OFFSET_X: 75,
  FOCUS_OFFSET_Y: 30,
} as const;

// Map singular entity types to plural keys used in visibleEntities
export const ENTITY_TYPE_TO_PLURAL: Record<string, string> = {
  model: "models",
  vendor: "vendors",
  risk: "risks",
  useCase: "useCases",
  evidence: "evidence",
  framework: "frameworks",
};

// Entity type configuration for UI display
export const ENTITY_TYPE_CONFIG = [
  { value: "useCases", colorKey: "useCase", label: "Use cases" },
  { value: "models", colorKey: "model", label: "Models" },
  { value: "vendors", colorKey: "vendor", label: "Vendors" },
  { value: "risks", colorKey: "risk", label: "Risks" },
  { value: "evidence", colorKey: "evidence", label: "Evidence" },
  { value: "frameworks", colorKey: "framework", label: "Frameworks" },
] as const;

// Default visible entity types
export const DEFAULT_VISIBLE_ENTITIES = ["useCases", "models", "vendors", "risks"];
