import { useState, useRef, useCallback } from "react";
import dayjs from "dayjs";
import { MitigationFormValues } from "../interface";
import {
  mitigationStatusItems,
  riskLevelItems,
  approvalStatusItems,
  likelihoodItems,
  riskSeverityItems,
} from "../projectRiskValue";
import { Likelihood, Severity } from "../../RiskLevel/constants";

/**
 * Safely parses a date value to ISO string format.
 * Handles string, Date objects, and falsy values.
 */
const parseDateValue = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string" || value instanceof Date) {
    return dayjs(value).toISOString();
  }
  return "";
};

export const mitigationInitialState: MitigationFormValues = {
  mitigationStatus: 0,
  mitigationPlan: "",
  currentRiskLevel: 0,
  implementationStrategy: "",
  deadline: new Date().toISOString(),
  doc: "",
  likelihood: 1 as Likelihood,
  riskSeverity: 1 as Severity,
  approver: 0,
  approvalStatus: 0,
  dateOfAssessment: new Date().toISOString(),
  recommendations: "",
};

export interface UseMitigationSectionReturn {
  mitigationValues: MitigationFormValues;
  setMitigationValues: React.Dispatch<React.SetStateAction<MitigationFormValues>>;
  originalMitigationValues: MitigationFormValues;
  setOriginalMitigationValues: React.Dispatch<React.SetStateAction<MitigationFormValues>>;
  validateRef: React.MutableRefObject<((values: MitigationFormValues) => boolean) | null>;
  mapFromInputValues: (inputValues: Record<string, unknown>) => MitigationFormValues;
  buildBackendData: (values: MitigationFormValues) => Record<string, unknown>;
}

/**
 * Hook for managing mitigation section form state and data mapping.
 * Encapsulates mitigation-specific logic extracted from AddNewRiskForm
 * to reduce parent component coupling.
 */
export function useMitigationSection(
  initialValues: MitigationFormValues = mitigationInitialState,
): UseMitigationSectionReturn {
  const [mitigationValues, setMitigationValues] = useState<MitigationFormValues>(initialValues);
  const [originalMitigationValues, setOriginalMitigationValues] =
    useState<MitigationFormValues>(initialValues);
  const validateRef = useRef<((values: MitigationFormValues) => boolean) | null>(null);

  /**
   * Maps backend input values to mitigation form values for edit mode.
   */
  const mapFromInputValues = useCallback(
    (inputValues: Record<string, unknown>): MitigationFormValues => {
      return {
        ...mitigationInitialState,
        mitigationStatus:
          mitigationStatusItems.find((item) => item.name === inputValues.mitigation_status)?._id ??
          1,
        mitigationPlan: (inputValues.mitigation_plan as string) ?? "",
        currentRiskLevel:
          riskLevelItems.find((item) => item.name === inputValues.current_risk_level)?._id ?? 1,
        implementationStrategy: (inputValues.implementation_strategy as string) ?? "",
        deadline: parseDateValue(inputValues.deadline),
        doc: (inputValues.mitigation_evidence_document as string) ?? "",
        likelihood:
          likelihoodItems.find((item) => item.name === inputValues.likelihood_mitigation)?._id ?? 1,
        riskSeverity:
          riskSeverityItems.find((item) => item.name === inputValues.risk_severity)?._id ?? 1,
        approver: (inputValues.risk_approval as number) ?? 0,
        approvalStatus:
          approvalStatusItems.find((item) => item.name === inputValues.approval_status)?._id ?? 1,
        dateOfAssessment: parseDateValue(inputValues.date_of_assessment),
        recommendations: (inputValues.recommendations as string) ?? "",
      };
    },
    [],
  );

  /**
   * Maps mitigation form values to backend field data.
   */
  const buildBackendData = useCallback((values: MitigationFormValues): Record<string, unknown> => {
    return {
      mitigation_status:
        mitigationStatusItems.find((item) => item._id === values.mitigationStatus)?.name || "",
      current_risk_level:
        riskLevelItems.find((item) => item._id === values.currentRiskLevel)?.name || "",
      deadline: values.deadline,
      mitigation_plan: values.mitigationPlan,
      implementation_strategy: values.implementationStrategy,
      mitigation_evidence_document: values.doc,
      likelihood_mitigation:
        likelihoodItems.find((item) => item._id === values.likelihood)?.name || "",
      risk_severity:
        riskSeverityItems.find((item) => item._id === values.riskSeverity)?.name === "Catastrophic"
          ? "Critical"
          : riskSeverityItems.find((item) => item._id === values.riskSeverity)?.name || "",
      risk_approval: values.approver,
      approval_status:
        approvalStatusItems.find((item) => item._id === values.approvalStatus)?.name || "",
      date_of_assessment: values.dateOfAssessment,
    };
  }, []);

  return {
    mitigationValues,
    setMitigationValues,
    originalMitigationValues,
    setOriginalMitigationValues,
    validateRef,
    mapFromInputValues,
    buildBackendData,
  };
}
