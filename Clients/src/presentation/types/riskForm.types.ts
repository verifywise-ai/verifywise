import { MutableRefObject } from "react";
import { SelectChangeEvent } from "@mui/material";
import {
  AddNewRiskFormCorePropsBase,
  IRiskLevelCoreProps,
  IRiskLevelFormValues,
} from "../../domain/types/riskForm.types";

// Re-export domain types for convenience
export type {
  RiskFormValues,
  MitigationFormValues,
  AddNewRiskFormCorePropsBase,
  RiskSectionProps,
  IRiskFormValues,
  IRiskFormErrors,
  IAuditRiskModalProps,
  IRiskLevelFormValues,
  IRiskLevelCoreProps,
  IRiskChipProps,
} from "../../domain/types/riskForm.types";

/**
 * Props for AddNewRiskForm component - with React MutableRefObject
 * Extends domain base props with React-specific onSubmitRef
 */
export interface AddNewRiskFormCoreProps extends AddNewRiskFormCorePropsBase {
  onSubmitRef?: MutableRefObject<(() => void) | null>;
}

/**
 * Presentation adapter for AddNewRiskForm component
 * Extends domain props (no additional MUI-specific props needed)
 */
export type AddNewRiskFormProps = AddNewRiskFormCoreProps;

/**
 * Presentation adapter for IRiskLevel component
 * Extends domain props with MUI SelectChangeEvent handler
 */
export interface IRiskLevelProps extends IRiskLevelCoreProps {
  handleOnSelectChange: (
    field: keyof IRiskLevelFormValues,
  ) => (event: SelectChangeEvent<string | number>) => void;
}
