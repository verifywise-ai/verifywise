/**
 * Re-export domain types from domain types file
 * Domain layer has zero external dependencies
 */
export type {
  RiskFormValues,
  MitigationFormValues,
  AddNewRiskFormCorePropsBase,
  RiskSectionProps,
  IRiskFormErrors,
  IAuditRiskModalProps,
  IRiskLevelFormValues,
  IRiskLevelCoreProps,
  IRiskChipProps,
} from "../types/riskForm.types";

// Note: AddNewRiskFormCoreProps and IRiskSectionProps (with React deps)
// are defined in: presentation/types/riskForm.types.ts
