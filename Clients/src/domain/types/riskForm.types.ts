import { User } from "./User";

/**
 * Form values for risk creation/editing
 * Pure domain type with no framework dependencies
 */
export interface RiskFormValues {
  riskName: string;
  actionOwner: number;
  aiLifecyclePhase: number;
  riskDescription: string;
  riskCategory: number[];
  potentialImpact: string;
  assessmentMapping: string;
  controlsMapping: string;
  likelihood: number;
  riskSeverity: number;
  riskLevel: number;
  reviewNotes: string;
  applicableProjects: number[];
  applicableFrameworks: number[];
}

/**
 * Form values for risk mitigation
 * Pure domain type with no framework dependencies
 */
export interface MitigationFormValues {
  mitigationStatus: number;
  mitigationPlan: string;
  currentRiskLevel: number;
  implementationStrategy: string;
  deadline: string;
  doc: string;
  likelihood: number;
  riskSeverity: number;
  approver: number;
  approvalStatus: number;
  dateOfAssessment: string;
}

/**
 * Core props for AddNewRiskForm component - without React refs
 * Pure domain type with no framework dependencies
 */
export interface AddNewRiskFormCorePropsBase {
  closePopup: () => void;
  popupStatus: "new" | "edit";
  initialRiskValues?: RiskFormValues;
  initialMitigationValues?: MitigationFormValues;
  /** Called after a save; on create it receives the new risk's id when the API returned one. */
  onSuccess: (createdRiskId?: number) => void;
  onError?: (message: string) => void;
  onLoading?: (message: string) => void;
  users?: User[];
  usersLoading?: boolean;
  compactMode?: boolean;
  /** Entity ID for change history tracking (edit mode only) */
  entityId?: number;
  /**
   * Creates the risk instead of POST /projectRisks (create mode only), e.g. to
   * create it and link it to its source in one request. Must answer like
   * POST /projectRisks: status 201 with the risk under data.data.
   */
  createRisk?: (body: Record<string, unknown>) => Promise<unknown>;
}

// Note: AddNewRiskFormCoreProps with React MutableRefObject has been moved to:
// presentation/types/riskForm.types.ts

// Note: IRiskSectionProps with React Dispatch/SetStateAction has been moved to:
// presentation/types/riskForm.types.ts

/**
 * Risk section props
 * Pure domain type with no framework dependencies
 */
export interface RiskSectionProps {
  closePopup: () => void;
  onSuccess: () => void;
  popupStatus: "new" | "edit";
}

/**
 * Risk form errors interface
 * Pure domain type with no framework dependencies
 */
export interface IRiskFormErrors {
  riskName?: string;
  actionOwner?: string;
  aiLifecyclePhase?: string;
  riskDescription?: string;
  riskCategory?: string[];
  potentialImpact?: string;
  assessmentMapping?: string;
  controlsMapping?: string;
  reviewNotes?: string;
  applicableProjects?: string;
  applicableFrameworks?: string;
}

/**
 * Audit risk modal props
 * Pure domain type with no framework dependencies
 */
export interface IAuditRiskModalProps {
  onClose: () => void;
  risks: number[];
  _deletedRisks: number[];
  _setDeletedRisks: (deletedRisks: number[]) => void;
  _selectedRisks: number[];
  _setSelectedRisks: (selectedRisks: number[]) => void;
}

/**
 * Risk level form values
 * Pure domain type with no framework dependencies
 */
export interface IRiskLevelFormValues {
  likelihood: number;
  riskSeverity: number;
}

/**
 * Props for IRiskLevel component
 * Pure domain type with no framework dependencies
 * Note: handleOnSelectChange parameter type is defined in presentation adapter
 */
export interface IRiskLevelCoreProps {
  likelihood: number;
  riskSeverity: number;
  disabled?: boolean;
  likelihoodError?: string;
  riskSeverityError?: string;
  onLikelihoodBlur?: () => void;
  onRiskSeverityBlur?: () => void;
}

/**
 * Risk chip props
 * Pure domain type with no framework dependencies
 */
export interface IRiskChipProps {
  label?: string;
  backgroundColor?: string;
}
