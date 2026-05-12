import { Likelihood, Severity } from "../RiskLevel/constants";

/**
 * Raw risk data structure from JSON databases
 */
export interface RiskData {
  "Id": number;
  "Summary": string;
  "Description": string;
  "Risk Severity": string;
  "Likelihood": string;
  "Risk Category": string;
}

/**
 * Mapped risk data structure for form consumption
 */
export interface SelectedRiskData {
  riskName: string;
  actionOwner: number;
  aiLifecyclePhase: number;
  riskDescription: string;
  riskCategory: number[];
  potentialImpact: string;
  assessmentMapping: number;
  controlsMapping: number;
  likelihood: number;
  riskSeverity: number;
  riskLevel: number;
  reviewNotes: string;
  applicableProjects: number[];
  applicableFrameworks: number[];
}

/**
 * Function type for mapping severity strings to Severity enum
 */
export type SeverityMapper = (severity: string) => Severity;

/**
 * Function type for mapping likelihood strings to Likelihood enum
 */
export type LikelihoodMapper = (likelihood: string) => Likelihood;

/**
 * Props for the RiskDatabaseModal component
 */
export interface RiskDatabaseModalProps {
  /** Whether the modal is currently open */
  isOpen: boolean;
  /** Callback to set the modal open state */
  setIsOpen: (open: boolean) => void;
  /** Callback when a risk is selected */
  onRiskSelected?: (riskData: SelectedRiskData) => void;
  /** The risk data array to display */
  riskData: RiskData[];
  /** Function to map severity strings to Severity enum */
  mapSeverity: SeverityMapper;
  /** Function to map likelihood strings to Likelihood enum */
  mapLikelihood: LikelihoodMapper;
  /** Modal title */
  title: string;
  /** Modal description */
  description: string;
  /** Database name for review notes (e.g., "MIT AI Risk Database") */
  databaseName: string;
}

/**
 * Default values for risk form fields
 */
export const DEFAULT_VALUES = {
  ACTION_OWNER: 0,
  AI_LIFECYCLE_PHASE: 0,
  POTENTIAL_IMPACT: "",
  ASSESSMENT_MAPPING: 0,
  CONTROLS_MAPPING: 0,
  RISK_LEVEL: 0,
  DEFAULT_CATEGORY_ID: 1,
} as const;

/**
 * Modal configuration constants
 */
export const MODAL_CONFIG = {
  MAX_WIDTH: 1000,
  MAX_HEIGHT: "50vh",
  SEARCH_FIELD_WIDTH: 350,
} as const;

/**
 * Table column headers
 */
export const TITLE_OF_COLUMNS = [
  "SELECT",
  "ID",
  "RISK NAME",
  "DESCRIPTION",
  "SEVERITY",
  "LIKELIHOOD",
  "CATEGORY",
] as const;
