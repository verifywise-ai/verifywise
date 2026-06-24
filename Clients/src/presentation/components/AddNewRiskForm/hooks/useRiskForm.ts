import { useState, useCallback, useRef, useContext, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Likelihood, Severity } from "../../RiskLevel/constants";
import { RiskLikelihood, RiskSeverity } from "../../RiskLevel/riskValues";
import { RiskFormValues, MitigationFormValues } from "../interface";
import {
  aiLifecyclePhase,
  riskCategoryItems,
  likelihoodItems,
  riskSeverityItems,
} from "../projectRiskValue";
import { AddNewRiskFormProps } from "../../../types/riskForm.types";
import { ApiResponse } from "../../../../domain/interfaces/i.response";
import {
  createProjectRisk,
  updateProjectRisk,
} from "../../../../application/repository/projectRisk.repository";
import useUsers from "../../../../application/hooks/useUsers";
import { useAuth } from "../../../../application/hooks/useAuth";
import { VerifyWiseContext } from "../../../../application/contexts/VerifyWise.context";
import allowedRoles from "../../../../application/constants/permissions";
import { RiskCalculator } from "../../../tools/riskCalculator";
import { CustomFieldsSectionHandle } from "../../CustomFieldsSection";
import { useRequiredCustomFieldsGate } from "../../CustomFieldsSection/RequiredCustomFieldsGate";
import { QuantitativeRiskFormValues, quantitativeInitialState } from "../../QuantitativeRiskForm";
import { useRiskAssessmentMode } from "../../../../application/hooks/useRiskAssessmentMode";
import { useMitigationSection, mitigationInitialState } from "./useMitigationSection";

const riskInitialState: RiskFormValues = {
  riskName: "",
  actionOwner: 0,
  aiLifecyclePhase: 0,
  riskDescription: "",
  riskCategory: [1],
  potentialImpact: "",
  assessmentMapping: 0,
  controlsMapping: 0,
  likelihood: 1 as Likelihood,
  riskSeverity: 1 as Severity,
  riskLevel: 0,
  reviewNotes: "",
  applicableProjects: [],
  applicableFrameworks: [],
};

export interface UseRiskFormReturn {
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  riskValues: RiskFormValues;
  setRiskValues: React.Dispatch<React.SetStateAction<RiskFormValues>>;
  mitigationValues: MitigationFormValues;
  setMitigationValues: React.Dispatch<React.SetStateAction<MitigationFormValues>>;
  quantitativeValues: QuantitativeRiskFormValues;
  setQuantitativeValues: React.Dispatch<React.SetStateAction<QuantitativeRiskFormValues>>;
  originalRiskValues: RiskFormValues;
  originalMitigationValues: MitigationFormValues;
  originalQuantitativeValues: QuantitativeRiskFormValues;
  riskValidateRef: React.MutableRefObject<((values: RiskFormValues) => boolean) | null>;
  mitigateValidateRef: React.MutableRefObject<((values: MitigationFormValues) => boolean) | null>;
  customFieldsRef: React.MutableRefObject<CustomFieldsSectionHandle | null>;
  customFieldsGate: {
    blocked: boolean;
    onPendingChange: (ids: ReadonlySet<number>) => void;
  };
  riskFormSubmitHandler: () => Promise<void>;
  users: import("../../../../domain/types/User").User[] | undefined;
  usersLoading: boolean;
  userRoleName: string;
  isEditingDisabled: boolean;
  isCreatingDisabled: boolean;
  isQuantitative: boolean;
  projectId: string | null;
  handleTabChange: (_: React.SyntheticEvent, newValue: string) => void;
}

/**
 * Hook that encapsulates all form state, validation, and submission logic
 * for the AddNewRiskForm component. Extracted to reduce component coupling
 * and betweenness centrality in the dependency graph.
 */
export function useRiskForm(props: AddNewRiskFormProps): UseRiskFormReturn {
  const {
    closePopup,
    onSuccess,
    onError = () => {},
    onLoading = () => {},
    popupStatus,
    initialRiskValues = riskInitialState,
    initialMitigationValues = mitigationInitialState,
    users: usersProp,
    usersLoading: usersLoadingProp,
    onSubmitRef,
    entityId,
  } = props;

  const riskValidateRef = useRef<((values: RiskFormValues) => boolean) | null>(null);
  const [riskValues, setRiskValues] = useState<RiskFormValues>(initialRiskValues);
  const [originalRiskValues, setOriginalRiskValues] = useState<RiskFormValues>(initialRiskValues);
  const [quantitativeValues, setQuantitativeValues] =
    useState<QuantitativeRiskFormValues>(quantitativeInitialState);
  const [originalQuantitativeValues, setOriginalQuantitativeValues] =
    useState<QuantitativeRiskFormValues>(quantitativeInitialState);
  const [value, setValue] = useState("risks");
  const customFieldsRef = useRef<CustomFieldsSectionHandle | null>(null);
  const customFieldsGate = useRequiredCustomFieldsGate(
    "project_risk",
    popupStatus === "edit" ? (entityId ?? null) : null,
  );

  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");

  const { userRoleName } = useAuth();
  const { isQuantitative } = useRiskAssessmentMode();

  const hookData = useUsers();
  const users = usersProp || hookData.users;
  const usersLoading = usersLoadingProp !== undefined ? usersLoadingProp : hookData.loading;

  const { inputValues } = useContext(VerifyWiseContext);

  const isEditingDisabled = !allowedRoles.projectRisks.edit.includes(userRoleName);
  const isCreatingDisabled = !allowedRoles.projectRisks.create.includes(userRoleName);

  const mitigation = useMitigationSection(initialMitigationValues);

  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: string) => {
    setValue(newValue);
  }, []);

  // Expose submit function via ref for StandardModal pattern
  useEffect(() => {
    if (onSubmitRef) {
      onSubmitRef.current = riskFormSubmitHandler;
    }
    return () => {
      if (onSubmitRef) {
        onSubmitRef.current = null;
      }
    };
  });

  useEffect(() => {
    if (popupStatus === "edit" && !usersLoading && users?.length) {
      const currentRiskData: RiskFormValues = {
        ...riskInitialState,
        riskName: (inputValues.risk_name as string) ?? "",
        actionOwner:
          typeof inputValues.risk_owner === "number"
            ? inputValues.risk_owner
            : parseInt(String(inputValues.risk_owner)) || 0,
        riskDescription: (inputValues.risk_description as string) ?? "",
        aiLifecyclePhase:
          aiLifecyclePhase.find((item) => item.name === inputValues.ai_lifecycle_phase)?._id ?? 1,
        riskCategory: Array.isArray(inputValues.risk_category)
          ? (inputValues.risk_category as string[]).map(
              (category: string) =>
                riskCategoryItems.find((item) => item.name === category)?._id ?? 1,
            )
          : [1],
        potentialImpact: (inputValues.impact as string) ?? "",
        assessmentMapping: (inputValues.assessment_mapping as number) ?? 0,
        controlsMapping: (inputValues.controlsMapping as number) ?? 0,
        likelihood: likelihoodItems.find((item) => item.name === inputValues.likelihood)?._id ?? 1,
        riskSeverity:
          riskSeverityItems.find((item) => item.name === inputValues.severity)?._id ?? 1,
        riskLevel: typeof inputValues.riskLevel === "number" ? inputValues.riskLevel : 0,
        reviewNotes: (inputValues.review_notes as string) ?? "",
        applicableProjects: Array.isArray(inputValues.projects)
          ? (inputValues.projects as number[])
          : [],
        applicableFrameworks: Array.isArray(inputValues.frameworks)
          ? (inputValues.frameworks as number[])
          : [],
      };

      const currentMitigationData = mitigation.mapFromInputValues(
        inputValues as Record<string, unknown>,
      );

      setRiskValues(currentRiskData);
      mitigation.setMitigationValues(currentMitigationData);
      setOriginalRiskValues(currentRiskData);
      mitigation.setOriginalMitigationValues(currentMitigationData);

      const toNum = (v: unknown): number | null => {
        if (v == null) return null;
        const n = Number(v);
        return isNaN(n) ? null : n;
      };
      const currentQuantitativeData: QuantitativeRiskFormValues = {
        event_frequency_min: toNum(inputValues.event_frequency_min),
        event_frequency_likely: toNum(inputValues.event_frequency_likely),
        event_frequency_max: toNum(inputValues.event_frequency_max),
        loss_regulatory_min: toNum(inputValues.loss_regulatory_min),
        loss_regulatory_likely: toNum(inputValues.loss_regulatory_likely),
        loss_regulatory_max: toNum(inputValues.loss_regulatory_max),
        loss_operational_min: toNum(inputValues.loss_operational_min),
        loss_operational_likely: toNum(inputValues.loss_operational_likely),
        loss_operational_max: toNum(inputValues.loss_operational_max),
        loss_litigation_min: toNum(inputValues.loss_litigation_min),
        loss_litigation_likely: toNum(inputValues.loss_litigation_likely),
        loss_litigation_max: toNum(inputValues.loss_litigation_max),
        loss_reputational_min: toNum(inputValues.loss_reputational_min),
        loss_reputational_likely: toNum(inputValues.loss_reputational_likely),
        loss_reputational_max: toNum(inputValues.loss_reputational_max),
        control_effectiveness: toNum(inputValues.control_effectiveness),
        mitigation_cost_annual: toNum(inputValues.mitigation_cost_annual),
        benchmark_id: toNum(inputValues.benchmark_id),
        currency: (typeof inputValues.currency === "string" ? inputValues.currency : null) ?? "USD",
      };
      setQuantitativeValues(currentQuantitativeData);
      setOriginalQuantitativeValues(currentQuantitativeData);
    }
  }, [popupStatus, inputValues, users, usersLoading]);

  const validateForm = useCallback((): { isValid: boolean; riskValid: boolean } => {
    const riskValid = riskValidateRef.current ? riskValidateRef.current(riskValues) : false;
    const mitigationValid = mitigation.validateRef.current
      ? mitigation.validateRef.current(mitigation.mitigationValues)
      : false;
    return {
      isValid: riskValid && mitigationValid,
      riskValid,
    };
  }, [riskValues, mitigation.mitigationValues, mitigation.validateRef]);

  const getChangedFields = useCallback(
    <T extends object>(original: T, current: T): Record<string, unknown> => {
      const changedFields: Record<string, unknown> = {};

      (Object.keys(current) as Array<keyof T>).forEach((key) => {
        const originalValue = original[key];
        const currentValue = current[key];

        if (Array.isArray(originalValue) && Array.isArray(currentValue)) {
          const originalArr = [...originalValue].sort();
          const currentArr = [...currentValue].sort();
          if (JSON.stringify(originalArr) !== JSON.stringify(currentArr)) {
            changedFields[key as string] = currentValue;
          }
        } else if (originalValue !== currentValue) {
          changedFields[key as string] = currentValue;
        }
      });

      return changedFields;
    },
    [],
  );

  const buildFormData = useCallback(
    (riskLevel: string, mitigationRiskLevel: string, changedFields?: Record<string, unknown>) => {
      const mitigationData = mitigation.buildBackendData(mitigation.mitigationValues);

      const fullData: Record<string, unknown> = {
        project_id: projectId,
        risk_name: riskValues.riskName,
        risk_owner: riskValues.actionOwner,
        ai_lifecycle_phase:
          aiLifecyclePhase.find((item) => item._id === riskValues.aiLifecyclePhase)?.name || "",
        risk_description: riskValues.riskDescription,
        risk_category: riskValues.riskCategory.map(
          (category) => riskCategoryItems.find((item) => item._id === category)?.name,
        ),
        impact: riskValues.potentialImpact,
        assessment_mapping: riskValues.assessmentMapping,
        controls_mapping: riskValues.controlsMapping,
        likelihood: likelihoodItems.find((item) => item._id === riskValues.likelihood)?.name || "",
        severity:
          riskSeverityItems.find((item) => item._id === riskValues.riskSeverity)?.name || "",
        risk_level_autocalculated: riskLevel,
        review_notes: riskValues.reviewNotes,
        ...mitigationData,
        projects: riskValues.applicableProjects,
        frameworks: riskValues.applicableFrameworks,
        ...(isQuantitative
          ? {
              event_frequency_min: quantitativeValues.event_frequency_min,
              event_frequency_likely: quantitativeValues.event_frequency_likely,
              event_frequency_max: quantitativeValues.event_frequency_max,
              loss_regulatory_min: quantitativeValues.loss_regulatory_min,
              loss_regulatory_likely: quantitativeValues.loss_regulatory_likely,
              loss_regulatory_max: quantitativeValues.loss_regulatory_max,
              loss_operational_min: quantitativeValues.loss_operational_min,
              loss_operational_likely: quantitativeValues.loss_operational_likely,
              loss_operational_max: quantitativeValues.loss_operational_max,
              loss_litigation_min: quantitativeValues.loss_litigation_min,
              loss_litigation_likely: quantitativeValues.loss_litigation_likely,
              loss_litigation_max: quantitativeValues.loss_litigation_max,
              loss_reputational_min: quantitativeValues.loss_reputational_min,
              loss_reputational_likely: quantitativeValues.loss_reputational_likely,
              loss_reputational_max: quantitativeValues.loss_reputational_max,
              control_effectiveness: quantitativeValues.control_effectiveness,
              mitigation_cost_annual: quantitativeValues.mitigation_cost_annual,
              benchmark_id: quantitativeValues.benchmark_id,
              currency: quantitativeValues.currency,
            }
          : {}),
      };

      if (changedFields) {
        const updateData: Record<string, unknown> = {};

        const fieldMapping: Record<string, string> = {
          risk_riskName: "risk_name",
          risk_actionOwner: "risk_owner",
          risk_aiLifecyclePhase: "ai_lifecycle_phase",
          risk_riskDescription: "risk_description",
          risk_riskCategory: "risk_category",
          risk_potentialImpact: "impact",
          risk_assessmentMapping: "assessment_mapping",
          risk_controlsMapping: "controls_mapping",
          risk_likelihood: "likelihood",
          risk_riskSeverity: "severity",
          risk_riskLevel: "risk_level_autocalculated",
          risk_reviewNotes: "review_notes",
          risk_applicableProjects: "projects",
          risk_applicableFrameworks: "frameworks",
          mitigation_mitigationStatus: "mitigation_status",
          mitigation_currentRiskLevel: "current_risk_level",
          mitigation_deadline: "deadline",
          mitigation_mitigationPlan: "mitigation_plan",
          mitigation_implementationStrategy: "implementation_strategy",
          mitigation_doc: "mitigation_evidence_document",
          mitigation_likelihood: "likelihood_mitigation",
          mitigation_riskSeverity: "risk_severity",
          mitigation_approver: "risk_approval",
          mitigation_approvalStatus: "approval_status",
          mitigation_dateOfAssessment: "date_of_assessment",
        };

        Object.keys(changedFields).forEach((frontendField) => {
          const backendField = fieldMapping[frontendField];
          if (backendField && Object.prototype.hasOwnProperty.call(fullData, backendField)) {
            updateData[backendField] = fullData[backendField];
          }
        });

        if (
          Object.keys(changedFields).some((field) =>
            [
              "risk_likelihood",
              "risk_riskSeverity",
              "risk_riskName",
              "risk_riskDescription",
              "risk_potentialImpact",
            ].includes(field),
          )
        ) {
          updateData.risk_level_autocalculated = riskLevel;
        }

        if (
          Object.keys(changedFields).some((field) =>
            [
              "mitigation_likelihood",
              "mitigation_riskSeverity",
              "mitigation_mitigationStatus",
              "mitigation_currentRiskLevel",
              "mitigation_mitigationPlan",
              "mitigation_implementationStrategy",
            ].includes(field),
          )
        ) {
          updateData.final_risk_level = mitigationRiskLevel;
        }

        return updateData;
      }

      return fullData;
    },
    [
      projectId,
      riskValues,
      mitigation.mitigationValues,
      isQuantitative,
      quantitativeValues,
      mitigation.buildBackendData,
    ],
  );

  async function riskFormSubmitHandler() {
    if (customFieldsGate.blocked) return;
    const { isValid, riskValid } = validateForm();
    const selectedRiskLikelihood = likelihoodItems.find((r) => r._id === riskValues.likelihood);
    const selectedRiskSeverity = riskSeverityItems.find((r) => r._id === riskValues.riskSeverity);
    if (!selectedRiskLikelihood || !selectedRiskSeverity) {
      console.error("Could not find selected likelihood or severity");
      return;
    }

    const risk_risklevel = RiskCalculator.getRiskLevel(
      selectedRiskLikelihood.name as RiskLikelihood,
      selectedRiskSeverity.name as RiskSeverity,
    );

    const selectedMitigationLikelihood = likelihoodItems.find(
      (r) => r._id === mitigation.mitigationValues.likelihood,
    );
    const selectedMitigationSeverity = riskSeverityItems.find(
      (r) => r._id === mitigation.mitigationValues.riskSeverity,
    );
    if (!selectedMitigationLikelihood || !selectedMitigationSeverity) {
      console.error("Could not find selected likelihood or severity");
      return;
    }

    const mitigation_risklevel = RiskCalculator.getRiskLevel(
      selectedMitigationLikelihood.name as RiskLikelihood,
      selectedMitigationSeverity.name as RiskSeverity,
    );

    if (isValid) {
      onLoading(
        popupStatus !== "new"
          ? "Updating the risk. Please wait..."
          : "Creating the risk. Please wait...",
      );

      let formData: Record<string, unknown>;

      if (popupStatus !== "new") {
        const changedRiskFields = getChangedFields(originalRiskValues, riskValues);
        const changedMitigationFields = getChangedFields(
          mitigation.originalMitigationValues,
          mitigation.mitigationValues,
        );

        const changedFields: Record<string, unknown> = {};
        Object.keys(changedRiskFields).forEach((key) => {
          changedFields[`risk_${key}`] = changedRiskFields[key];
        });
        Object.keys(changedMitigationFields).forEach((key) => {
          changedFields[`mitigation_${key}`] = changedMitigationFields[key];
        });

        if (isQuantitative) {
          const changedQuantitativeFields = getChangedFields(
            originalQuantitativeValues,
            quantitativeValues,
          );
          Object.keys(changedQuantitativeFields).forEach((key) => {
            changedFields[`quantitative_${key}`] = changedQuantitativeFields[key];
          });
        }

        formData = buildFormData(
          risk_risklevel.level,
          mitigation_risklevel.level,
          changedFields,
        ) as Record<string, unknown>;

        if (isQuantitative) {
          const changedQuantitativeFields = getChangedFields(
            originalQuantitativeValues,
            quantitativeValues,
          );
          Object.keys(changedQuantitativeFields).forEach((key) => {
            formData[key] = changedQuantitativeFields[key];
          });
        }

        if (Object.prototype.hasOwnProperty.call(changedFields, "risk_applicableProjects")) {
          const originalProjects = originalRiskValues?.applicableProjects || [];
          const currentProjects = riskValues.applicableProjects || [];
          formData.deletedLinkedProject =
            originalProjects.length > 0 && currentProjects.length === 0;
        }

        if (Object.prototype.hasOwnProperty.call(changedFields, "risk_applicableFrameworks")) {
          const originalFrameworks = originalRiskValues?.applicableFrameworks || [];
          const currentFrameworks = riskValues.applicableFrameworks || [];
          formData.deletedLinkedFrameworks =
            originalFrameworks.length > 0 && currentFrameworks.length === 0;
        }
      } else {
        formData = buildFormData(risk_risklevel.level, mitigation_risklevel.level) as Record<
          string,
          unknown
        >;
      }

      try {
        const response =
          popupStatus !== "new"
            ? await updateProjectRisk({ id: Number(inputValues.id), body: formData })
            : await createProjectRisk({ body: formData });

        if (response && response.status === 201) {
          const newRiskId = response.data?.data?.id as number | undefined;
          let cfFlushFailed = false;
          if (newRiskId && customFieldsRef.current?.hasPendingValues()) {
            try {
              await customFieldsRef.current.flush(newRiskId);
            } catch (cfError) {
              cfFlushFailed = true;
              console.error(
                "Project risk created, but custom field values failed to save:",
                cfError,
              );
            }
          }
          onSuccess();
          if (cfFlushFailed) {
            return;
          }
          closePopup();
        } else if (response && response.status === 200) {
          let cfFlushFailed = false;
          const existingId = Number(inputValues.id);
          if (
            Number.isFinite(existingId) &&
            existingId > 0 &&
            customFieldsRef.current?.hasPendingValues()
          ) {
            try {
              await customFieldsRef.current.flush(existingId);
            } catch (cfError) {
              cfFlushFailed = true;
              console.error(
                "Project risk updated, but custom field values failed to save:",
                cfError,
              );
            }
          }
          onSuccess();
          if (cfFlushFailed) {
            return;
          }
          closePopup();
        } else {
          const responseData = response?.data as ApiResponse;
          let errorMessage = responseData?.message || "Unknown error occurred";

          if (responseData?.errors && Array.isArray(responseData.errors)) {
            const fieldErrors = responseData.errors
              .map((err: { message?: string }) => `• ${err.message ?? "Unknown error"}`)
              .join("\n");
            errorMessage = `${errorMessage}:\n${fieldErrors}`;
          }

          console.error(responseData?.error);
          onError(errorMessage);
        }
      } catch (error: unknown) {
        console.error("Error sending request", error);

        if (error instanceof Error && error.name === "CustomException") {
          const customError = error as Error & {
            response?: { errors?: Array<{ message?: string }> };
          };

          let errorMessage = error.message || "Unknown error occurred";

          if (customError.response?.errors && Array.isArray(customError.response.errors)) {
            const fieldErrors = customError.response.errors
              .map((err: { message?: string }) => `• ${err.message ?? "Unknown error"}`)
              .join("\n");
            errorMessage = `${errorMessage}:\n${fieldErrors}`;
          }

          onError(errorMessage);
        } else if (error instanceof Error) {
          onError(error.message || "Network error occurred");
        } else {
          onError("Network error occurred");
        }
      }
    } else {
      if (!riskValid) {
        setValue("risks");
      } else {
        setValue("mitigation");
      }
    }
  }

  return {
    value,
    setValue,
    riskValues,
    setRiskValues,
    mitigationValues: mitigation.mitigationValues,
    setMitigationValues: mitigation.setMitigationValues,
    quantitativeValues,
    setQuantitativeValues,
    originalRiskValues,
    originalMitigationValues: mitigation.originalMitigationValues,
    originalQuantitativeValues,
    riskValidateRef,
    mitigateValidateRef: mitigation.validateRef,
    customFieldsRef,
    customFieldsGate,
    riskFormSubmitHandler,
    users,
    usersLoading,
    userRoleName,
    isEditingDisabled,
    isCreatingDisabled,
    isQuantitative,
    projectId,
    handleTabChange,
  };
}
