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
  recommendations: string;
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
  onSuccess: () => void;
  onError?: (message: string) => void;
  onLoading?: (message: string) => void;
  users?: User[];
  usersLoading?: boolean;
  compactMode?: boolean;
  /** Entity ID for change history tracking (edit mode only) */
  entityId?: number;
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
 * Risk form values interface
 * Pure domain type with no framework dependencies
 */
export interface IRiskFormValues {
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
