import { useState, useRef, useCallback } from "react";
import dayjs from "dayjs";
import { MitigationFormValues } from "../interface";
import {
  mitigationStatusItems,
  riskLevelItems,
  approvalStatusItems,
  likelihoodItems,
  RISK_APPROVAL_STATUS,
  riskSeverityItems,
} from "../projectRiskValue";
import { riskCalendarDay } from "../../../tools/isoDateToString";

/** A stored risk date as the local midnight of its calendar day, or "" when unset. */
const parseDateValue = (value: unknown): string => riskCalendarDay(value)?.toISOString() ?? "";

/**
 * The calendar day the user picked, as "YYYY-MM-DD" in their own time zone.
 * The server stores it at noon UTC, so every viewer sees the same day.
 */
const toCalendarDay = (value: string): string | null => {
  if (!value) return null;
  const date = dayjs(value);
  return date.isValid() ? date.format("YYYY-MM-DD") : null;
};

export const mitigationInitialState: MitigationFormValues = {
  mitigationStatus: 0,
  mitigationPlan: "",
  currentRiskLevel: 0,
  implementationStrategy: "",
  // Every mitigation field is optional and starts empty (0 = none picked), so
  // a new risk is saved without a deadline (and its reminders), a status or a
  // residual level nobody chose.
  deadline: "",
  doc: "",
  likelihood: 0,
  riskSeverity: 0,
  approver: 0,
  // A risk always has an approval status; it needs none until an approver is named.
  approvalStatus: RISK_APPROVAL_STATUS.NotRequired,
  // Optional, so a new risk does not look assessed.
  dateOfAssessment: "",
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
      // The server stores residual severity "Catastrophic" as "Critical" (R-H1).
      const residualSeverity =
        inputValues.risk_severity === "Critical" ? "Catastrophic" : inputValues.risk_severity;
      // A value the risk never had stays empty (0), so the form does not show
      // and save a made-up status, level or date (R-M12).
      return {
        ...mitigationInitialState,
        mitigationStatus:
          mitigationStatusItems.find((item) => item.name === inputValues.mitigation_status)?._id ??
          0,
        mitigationPlan: (inputValues.mitigation_plan as string) ?? "",
        currentRiskLevel:
          riskLevelItems.find((item) => item.name === inputValues.current_risk_level)?._id ?? 0,
        implementationStrategy: (inputValues.implementation_strategy as string) ?? "",
        deadline: parseDateValue(inputValues.deadline),
        doc: (inputValues.mitigation_evidence_document as string) ?? "",
        likelihood:
          likelihoodItems.find((item) => item.name === inputValues.likelihood_mitigation)?._id ?? 0,
        riskSeverity: riskSeverityItems.find((item) => item.name === residualSeverity)?._id ?? 0,
        approver: (inputValues.risk_approval as number) ?? 0,
        // A value from before the four statuses (the server maps them) opens as Not required.
        approvalStatus:
          approvalStatusItems.find((item) => item.name === inputValues.approval_status)?._id ??
          RISK_APPROVAL_STATUS.NotRequired,
        dateOfAssessment: parseDateValue(inputValues.date_of_assessment),
      };
    },
    [],
  );

  /**
   * Maps mitigation form values to backend field data.
   */
  const buildBackendData = useCallback((values: MitigationFormValues): Record<string, unknown> => {
    return {
      // Unset values go as null: the server rejects "" for enum and date
      // fields and 0 for a user, and null clears the stored value.
      mitigation_status:
        mitigationStatusItems.find((item) => item._id === values.mitigationStatus)?.name || null,
      current_risk_level:
        riskLevelItems.find((item) => item._id === values.currentRiskLevel)?.name || null,
      deadline: toCalendarDay(values.deadline),
      mitigation_plan: values.mitigationPlan,
      implementation_strategy: values.implementationStrategy,
      mitigation_evidence_document: values.doc,
      likelihood_mitigation:
        likelihoodItems.find((item) => item._id === values.likelihood)?.name || null,
      risk_severity:
        riskSeverityItems.find((item) => item._id === values.riskSeverity)?.name === "Catastrophic"
          ? "Critical"
          : riskSeverityItems.find((item) => item._id === values.riskSeverity)?.name || null,
      risk_approval: values.approver || null,
      approval_status:
        approvalStatusItems.find((item) => item._id === values.approvalStatus)?.name ??
        "Not required",
      date_of_assessment: toCalendarDay(values.dateOfAssessment),
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
