import React, {
  FC,
  useState,
  useCallback,
  lazy,
  Suspense,
  useContext,
  useEffect,
} from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Stack, Tab, Typography, useTheme } from "@mui/material";
import { TabContext, TabList, TabPanel } from "@mui/lab";
import { Save as SaveIcon, RotateCcw as UpdateIconSVGWhite } from "lucide-react";
import dayjs from "dayjs";

import { Likelihood, Severity } from "../RiskLevel/constants";
import { RiskLikelihood, RiskSeverity } from "../RiskLevel/riskValues";
import {
  RiskFormValues,
  RiskFormErrors,
  MitigationFormValues,
  MitigationFormErrors,
} from "./interface";
import {
  aiLifecyclePhase,
  riskCategoryItems,
  mitigationStatusItems,
  approvalStatusItems,
  riskLevelItems,
  likelihoodItems,
  riskSeverityItems,
} from "./projectRiskValue";
import { AddNewRiskFormProps } from "../../types/riskForm.types";
import { ApiResponse } from "../../../domain/interfaces/i.response";
import { checkStringValidation } from "../../../application/validations/stringValidation";
import selectValidation from "../../../application/validations/selectValidation";
import { createProjectRisk, updateProjectRisk } from "../../../application/repository/projectRisk.repository";
import useUsers from "../../../application/hooks/useUsers";
import { useAuth } from "../../../application/hooks/useAuth";
import { VerifyWiseContext } from "../../../application/contexts/VerifyWise.context";
import allowedRoles from "../../../application/constants/permissions";
import { CustomizableButton } from "../button/customizable-button";
import { RiskCalculator } from "../../tools/riskCalculator";
import { HistorySidebar } from "../Common/HistorySidebar";
import { getTabStyle } from "./style";
import "./styles.module.css";
import QuantitativeRiskForm, {
  QuantitativeRiskFormValues,
  quantitativeInitialState,
} from "../QuantitativeRiskForm";
import { useRiskAssessmentMode } from "../../../application/hooks/useRiskAssessmentMode";

const RiskSection = lazy(() => import("./RisksSection"));
const MitigationSection = lazy(() => import("./MitigationSection"));

// Constants
const COMPONENT_CONSTANTS = {
  MAX_HEIGHT: 550,
  BUTTON_HEIGHT: 34,
  TAB_MARGIN_TOP: "30px",
  TAB_PADDING: "12px 0 0",
  TAB_GAP: "34px",
  MIN_TAB_HEIGHT: "20px",
  BORDER_RADIUS: 2,
  // Match the form content widths from RisksSection/MitigationSection
  CONTENT_WIDTH: 985, // 323 * 3 + 8 * 2
  COMPACT_CONTENT_WIDTH: 970, // Account for scrollbar (~17px)
} as const;

const VALIDATION_LIMITS = {
  RISK_NAME: { MIN: 3, MAX: 255 },
  RISK_DESCRIPTION: { MIN: 1, MAX: 256 },
  POTENTIAL_IMPACT: { MIN: 1, MAX: 256 },
  REVIEW_NOTES: { MIN: 0, MAX: 1024 },
  MITIGATION_PLAN: { MIN: 1, MAX: 1024 },
  IMPLEMENTATION_STRATEGY: { MIN: 1, MAX: 1024 },
  RECOMMENDATIONS: { MIN: 1, MAX: 1024 },
  REQUIRED_FIELD: { MIN: 1 },
} as const;

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

const mitigationInitialState: MitigationFormValues = {
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

/**
 * Safely parses a date value to ISO string format.
 * Handles string, Date objects, and falsy values.
 *
 * @param value - The value to parse (string, Date, or falsy)
 * @returns ISO string representation or empty string if invalid
 */
const parseDateValue = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === 'string' || value instanceof Date) {
    return dayjs(value).toISOString();
  }
  return "";
};

/**
 * AddNewRiskForm component allows users to add new risks and mitigations through a tabbed interface.
 * It manages form state, validation, and submission for both risk and mitigation data.
 *
 * @component
 * @param {AddNewRiskFormProps} props - The component props
 * @param {Function} props.closePopup - Function to close the popup
 * @param {Function} props.onSuccess - Callback function called on successful form submission
 * @param {Function} props.onError - Callback function called on form submission error
 * @param {Function} props.onLoading - Callback function called during form submission
 * @param {string} props.popupStatus - Status of the popup ("new" or "edit")
 * @param {RiskFormValues} props.initialRiskValues - Initial values for risk form
 * @param {MitigationFormValues} props.initialMitigationValues - Initial values for mitigation form
 * @returns {JSX.Element} The rendered AddNewRiskForm component
 */
const AddNewRiskForm: FC<AddNewRiskFormProps> = ({
  closePopup,
  onSuccess,
  onError = () => {},
  onLoading = () => {},
  popupStatus,
  initialRiskValues = riskInitialState, // Default to initial state if not provided
  initialMitigationValues = mitigationInitialState,
  users: usersProp,
  usersLoading: usersLoadingProp,
  onSubmitRef,
  compactMode = false,
  entityId,
}) => {
  const theme = useTheme();
  const disableRipple =
    theme.components?.MuiButton?.defaultProps?.disableRipple ?? false;

  const [riskErrors, setRiskErrors] = useState<RiskFormErrors>({});
  const [mitigationErrors, setMitigationErrors] =
    useState<MitigationFormErrors>({});
  const [riskValues, setRiskValues] =
    useState<RiskFormValues>(initialRiskValues); // Use initialValues
  const [mitigationValues, setMitigationValues] =
    useState<MitigationFormValues>(initialMitigationValues);
  const [originalRiskValues, setOriginalRiskValues] =
    useState<RiskFormValues>(initialRiskValues); // Track original values for diff
  const [originalMitigationValues, setOriginalMitigationValues] =
    useState<MitigationFormValues>(initialMitigationValues); // Track original values for diff
  const [quantitativeValues, setQuantitativeValues] =
    useState<QuantitativeRiskFormValues>(quantitativeInitialState);
  const [originalQuantitativeValues, setOriginalQuantitativeValues] =
    useState<QuantitativeRiskFormValues>(quantitativeInitialState);
  const [value, setValue] = useState("risks");
  const handleChange = useCallback(
    (_: React.SyntheticEvent, newValue: string) => {
      setValue(newValue);
    },
    []
  );

  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");

  const { userRoleName } = useAuth();
  const { isQuantitative } = useRiskAssessmentMode();

  // Use props if provided, otherwise fallback to hook
  const hookData = useUsers();
  const users = usersProp || hookData.users;
  const usersLoading = usersLoadingProp !== undefined ? usersLoadingProp : hookData.loading;

  // Get inputValues from context
  const { inputValues } = useContext(VerifyWiseContext);

  const isEditingDisabled =
    !allowedRoles.projectRisks.edit.includes(userRoleName);
  const isCreatingDisabled =
    !allowedRoles.projectRisks.create.includes(userRoleName);

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
      // riskData
      const currentRiskData: RiskFormValues = {
        ...riskInitialState,
        riskName: inputValues.risk_name ?? "",
        actionOwner: typeof inputValues.risk_owner === 'number' ? inputValues.risk_owner : parseInt(String(inputValues.risk_owner)) || 0,
        riskDescription: inputValues.risk_description ?? "",
        aiLifecyclePhase:
          aiLifecyclePhase.find(
            (item) => item.name === inputValues.ai_lifecycle_phase
          )?._id ?? 1,
        riskCategory: Array.isArray(inputValues.risk_category)
          ? inputValues.risk_category.map(
              (category: string) =>
                riskCategoryItems.find((item) => item.name === category)?._id ?? 1
            )
          : [1],
        potentialImpact: inputValues.impact ?? "",
        assessmentMapping: inputValues.assessment_mapping ?? 0,
        controlsMapping: inputValues.controlsMapping ?? 0,
        likelihood:
          likelihoodItems.find((item) => item.name === inputValues.likelihood)
            ?._id ?? 1,
        riskSeverity:
          riskSeverityItems.find((item) => item.name === inputValues.severity)
            ?._id ?? 1,
        riskLevel: typeof inputValues.riskLevel === 'number' ? inputValues.riskLevel : 0,
        reviewNotes: inputValues.review_notes ?? "",
        applicableProjects: Array.isArray(inputValues.projects) ? inputValues.projects : [],
        applicableFrameworks: Array.isArray(inputValues.frameworks) ? inputValues.frameworks : [],
      };

      const currentMitigationData: MitigationFormValues = {
        ...mitigationInitialState,
        mitigationStatus:
          mitigationStatusItems.find(
            (item) => item.name === inputValues.mitigation_status
          )?._id ?? 1,
        mitigationPlan: inputValues.mitigation_plan ?? "",
        currentRiskLevel:
          riskLevelItems.find(
            (item) => item.name === inputValues.current_risk_level
          )?._id ?? 1,
        implementationStrategy: inputValues.implementation_strategy ?? "",
        deadline: parseDateValue(inputValues.deadline),
        doc: inputValues.mitigation_evidence_document ?? "",
        likelihood:
          likelihoodItems.find(
            (item) => item.name === inputValues.likelihood_mitigation
          )?._id ?? 1,
        riskSeverity:
          riskSeverityItems.find(
            (item) => item.name === inputValues.risk_severity
          )?._id ?? 1,
        approver: inputValues.risk_approval ?? 0,
        approvalStatus:
          approvalStatusItems.find(
            (item) => item.name === inputValues.approval_status
          )?._id ?? 1,
        dateOfAssessment: parseDateValue(inputValues.date_of_assessment),
      };
      setRiskValues(currentRiskData);
      setMitigationValues(currentMitigationData);
      setOriginalRiskValues(currentRiskData);
      setOriginalMitigationValues(currentMitigationData);

      // Populate quantitative FAIR fields from existing risk data
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
        currency: (typeof inputValues.currency === 'string' ? inputValues.currency : null) ?? "USD",
      };
      setQuantitativeValues(currentQuantitativeData);
      setOriginalQuantitativeValues(currentQuantitativeData);
    }
  }, [popupStatus, inputValues, users, usersLoading]);

  // Helper functions for validation
  const validateRiskFields = useCallback(
    (values: RiskFormValues): RiskFormErrors => {
      const errors: RiskFormErrors = {};

      const riskName = checkStringValidation(
        "Risk name",
        values.riskName,
        VALIDATION_LIMITS.RISK_NAME.MIN,
        VALIDATION_LIMITS.RISK_NAME.MAX
      );
      if (!riskName.accepted) {
        errors.riskName = riskName.message;
      }

      const riskDescription = checkStringValidation(
        "Risk description",
        values.riskDescription,
        VALIDATION_LIMITS.RISK_DESCRIPTION.MIN,
        VALIDATION_LIMITS.RISK_DESCRIPTION.MAX
      );
      if (!riskDescription.accepted) {
        errors.riskDescription = riskDescription.message;
      }

      const potentialImpact = checkStringValidation(
        "Potential impact",
        values.potentialImpact,
        VALIDATION_LIMITS.POTENTIAL_IMPACT.MIN,
        VALIDATION_LIMITS.POTENTIAL_IMPACT.MAX
      );
      if (!potentialImpact.accepted) {
        errors.potentialImpact = potentialImpact.message;
      }

      if (values.reviewNotes.length > 0) {
        const reviewNotes = checkStringValidation(
          "Review notes",
          values.reviewNotes,
          VALIDATION_LIMITS.REVIEW_NOTES.MIN,
          VALIDATION_LIMITS.REVIEW_NOTES.MAX
        );
        if (!reviewNotes.accepted) {
          errors.reviewNotes = reviewNotes.message;
        }
      }

      const aiLifecyclePhase = selectValidation(
        "AI lifecycle phase",
        values.aiLifecyclePhase
      );
      if (!aiLifecyclePhase.accepted) {
        errors.aiLifecyclePhase = aiLifecyclePhase.message;
      }

      values.riskCategory.forEach((category) => {
        const riskCategory = selectValidation("Risk category", category);
        if (!riskCategory.accepted) {
          errors.riskCategory = [riskCategory.message];
        }
      });

      return errors;
    },
    []
  );

  const validateMitigationFields = useCallback(
    (values: MitigationFormValues): MitigationFormErrors => {
      const errors: MitigationFormErrors = {};

      const mitigationPlan = checkStringValidation(
        "Mitigation plan",
        values.mitigationPlan,
        VALIDATION_LIMITS.MITIGATION_PLAN.MIN,
        VALIDATION_LIMITS.MITIGATION_PLAN.MAX
      );
      if (!mitigationPlan.accepted) {
        errors.mitigationPlan = mitigationPlan.message;
      }

      const implementationStrategy = checkStringValidation(
        "Implementation strategy",
        values.implementationStrategy,
        VALIDATION_LIMITS.IMPLEMENTATION_STRATEGY.MIN,
        VALIDATION_LIMITS.IMPLEMENTATION_STRATEGY.MAX
      );
      if (!implementationStrategy.accepted) {
        errors.implementationStrategy = implementationStrategy.message;
      }

      const deadline = checkStringValidation(
        "Deadline",
        values.deadline,
        VALIDATION_LIMITS.REQUIRED_FIELD.MIN
      );
      if (!deadline.accepted) {
        errors.deadline = deadline.message;
      }

      const dateOfAssessment = checkStringValidation(
        "Date Of Assessment",
        values.dateOfAssessment,
        VALIDATION_LIMITS.REQUIRED_FIELD.MIN
      );
      if (!dateOfAssessment.accepted) {
        errors.dateOfAssessment = dateOfAssessment.message;
      }

      const mitigationStatus = selectValidation(
        "Mitigation status",
        values.mitigationStatus
      );
      if (!mitigationStatus.accepted) {
        errors.mitigationStatus = mitigationStatus.message;
      }

      const currentRiskLevel = selectValidation(
        "Current risk level",
        values.currentRiskLevel
      );
      if (!currentRiskLevel.accepted) {
        errors.currentRiskLevel = currentRiskLevel.message;
      }

      const approver = selectValidation("Approver", values.approver);
      if (!approver.accepted) {
        errors.approver = approver.message;
      }

      const approvalStatus = selectValidation(
        "Approval status",
        values.approvalStatus
      );
      if (!approvalStatus.accepted) {
        errors.approvalStatus = approvalStatus.message;
      }

      if (values.recommendations.length > 0) {
        const recommendations = checkStringValidation(
          "Recommendation",
          values.recommendations,
          VALIDATION_LIMITS.RECOMMENDATIONS.MIN,
          VALIDATION_LIMITS.RECOMMENDATIONS.MAX
        );
        if (!recommendations.accepted) {
          errors.recommendations = recommendations.message;
        }
      }

      return errors;
    },
    []
  );

  const validateForm = useCallback((): {
    isValid: boolean;
    errors: RiskFormErrors;
    mitigationErrors: MitigationFormErrors;
  } => {
    const newErrors = validateRiskFields(riskValues);
    const newMitigationErrors = validateMitigationFields(mitigationValues);

    setMitigationErrors(newMitigationErrors);
    setRiskErrors(newErrors);

    return {
      isValid:
        Object.keys(newErrors).length === 0 &&
        Object.keys(newMitigationErrors).length === 0,
      errors: newErrors,
      mitigationErrors: newMitigationErrors,
    };
  }, [
    riskValues,
    mitigationValues,
    validateRiskFields,
    validateMitigationFields,
  ]);

  // Helper function to get only changed fields for UPDATE requests
  const getChangedFields = useCallback(<T extends object>(original: T, current: T): Record<string, unknown> => {
    const changedFields: Record<string, unknown> = {};

    // Check each field for changes
    (Object.keys(current) as Array<keyof T>).forEach((key) => {
      const originalValue = original[key];
      const currentValue = current[key];

      // For arrays, do deep comparison (use copies to avoid mutating originals)
      if (Array.isArray(originalValue) && Array.isArray(currentValue)) {
        const originalArr = [...originalValue].sort();
        const currentArr = [...currentValue].sort();
        if (JSON.stringify(originalArr) !== JSON.stringify(currentArr)) {
          changedFields[key as string] = currentValue;
        }
      }
      // For other values, do simple comparison
      else if (originalValue !== currentValue) {
        changedFields[key as string] = currentValue;
      }
    });

    return changedFields;
  }, []);

  // Helper function to build form data for API submission
  const buildFormData = useCallback(
    (riskLevel: string, mitigationRiskLevel: string, changedFields?: Record<string, unknown>) => {
      const fullData = {
        project_id: projectId,
        risk_name: riskValues.riskName,
        risk_owner: riskValues.actionOwner,
        ai_lifecycle_phase:
          aiLifecyclePhase.find(
            (item) => item._id === riskValues.aiLifecyclePhase
          )?.name || "",
        risk_description: riskValues.riskDescription,
        risk_category: riskValues.riskCategory.map(
          (category) =>
            riskCategoryItems.find((item) => item._id === category)?.name
        ),
        impact: riskValues.potentialImpact,
        assessment_mapping: riskValues.assessmentMapping,
        controls_mapping: riskValues.controlsMapping,
        likelihood:
          likelihoodItems.find((item) => item._id === riskValues.likelihood)
            ?.name || "",
        severity:
          riskSeverityItems.find((item) => item._id === riskValues.riskSeverity)
            ?.name || "",
        risk_level_autocalculated: riskLevel,
        review_notes: riskValues.reviewNotes,
        mitigation_status:
          mitigationStatusItems.find(
            (item) => item._id === mitigationValues.mitigationStatus
          )?.name || "",
        current_risk_level:
          riskLevelItems.find(
            (item) => item._id === mitigationValues.currentRiskLevel
          )?.name || "",
        deadline: mitigationValues.deadline,
        mitigation_plan: mitigationValues.mitigationPlan,
        implementation_strategy: mitigationValues.implementationStrategy,
        mitigation_evidence_document: mitigationValues.doc,
        likelihood_mitigation:
          likelihoodItems.find(
            (item) => item._id === mitigationValues.likelihood
          )?.name || "",
        risk_severity:
          riskSeverityItems.find(
            (item) => item._id === mitigationValues.riskSeverity
          )?.name === "Catastrophic"
            ? "Critical"
            : riskSeverityItems.find(
                (item) => item._id === mitigationValues.riskSeverity
              )?.name || "",
        final_risk_level: mitigationRiskLevel,
        risk_approval: mitigationValues.approver,
        approval_status:
          approvalStatusItems.find(
            (item) => item._id === mitigationValues.approvalStatus
          )?.name || "",
        date_of_assessment: mitigationValues.dateOfAssessment,
        projects: riskValues.applicableProjects,
        frameworks: riskValues.applicableFrameworks,
        // Quantitative FAIR fields (included when quantitative mode is active)
        ...(isQuantitative ? {
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
        } : {}),
      };

      // If changedFields is provided (for updates), only return the changed fields
      if (changedFields) {
        const updateData: Record<string, unknown> = {};

        // Map frontend field names to backend field names and include only changed fields
        // Note: Fields are now prefixed with 'risk_' or 'mitigation_' to distinguish their source
        const fieldMapping: Record<string, string> = {
          // Risk tab fields
          risk_riskName: 'risk_name',
          risk_actionOwner: 'risk_owner',
          risk_aiLifecyclePhase: 'ai_lifecycle_phase',
          risk_riskDescription: 'risk_description',
          risk_riskCategory: 'risk_category',
          risk_potentialImpact: 'impact',
          risk_assessmentMapping: 'assessment_mapping',
          risk_controlsMapping: 'controls_mapping',
          risk_likelihood: 'likelihood',
          risk_riskSeverity: 'severity',
          risk_riskLevel: 'risk_level_autocalculated',
          risk_reviewNotes: 'review_notes',
          risk_applicableProjects: 'projects',
          risk_applicableFrameworks: 'frameworks',

          // Mitigation tab fields
          mitigation_mitigationStatus: 'mitigation_status',
          mitigation_currentRiskLevel: 'current_risk_level',
          mitigation_deadline: 'deadline',
          mitigation_mitigationPlan: 'mitigation_plan',
          mitigation_implementationStrategy: 'implementation_strategy',
          mitigation_doc: 'mitigation_evidence_document',
          mitigation_likelihood: 'likelihood_mitigation',
          mitigation_riskSeverity: 'risk_severity',
          mitigation_approver: 'risk_approval',
          mitigation_approvalStatus: 'approval_status',
          mitigation_dateOfAssessment: 'date_of_assessment',
        };

        Object.keys(changedFields).forEach(frontendField => {
          const backendField = fieldMapping[frontendField];
          if (backendField && Object.prototype.hasOwnProperty.call(fullData, backendField)) {
            updateData[backendField] = fullData[backendField as keyof typeof fullData];
          }
        });

        // Always include calculated risk levels if any risk-related field changed
        if (Object.keys(changedFields).some(field =>
          ['risk_likelihood', 'risk_riskSeverity', 'risk_riskName', 'risk_riskDescription', 'risk_potentialImpact'].includes(field)
        )) {
          updateData.risk_level_autocalculated = riskLevel;
        }

        // Always include mitigation risk level if any mitigation-related field changed
        if (Object.keys(changedFields).some(field =>
          ['mitigation_likelihood', 'mitigation_riskSeverity', 'mitigation_mitigationStatus', 'mitigation_currentRiskLevel', 'mitigation_mitigationPlan', 'mitigation_implementationStrategy'].includes(field)
        )) {
          updateData.final_risk_level = mitigationRiskLevel;
        }

        // Add boolean flags for deleted/emptied linked projects and frameworks
        // These flags will be set where buildFormData is called since we have access to original values there

        return updateData;
      }

      // Return full data for create operations
      return fullData;
    },
    [projectId, riskValues, mitigationValues, isQuantitative, quantitativeValues]
  );

  const riskFormSubmitHandler = async () => {
    const { isValid, errors } = validateForm();
    const selectedRiskLikelihood = likelihoodItems.find(
      (r) => r._id === riskValues.likelihood
    );
    const selectedRiskSeverity = riskSeverityItems.find(
      (r) => r._id === riskValues.riskSeverity
    );
    if (!selectedRiskLikelihood || !selectedRiskSeverity) {
      console.error("Could not find selected likelihood or severity");
      return;
    }

    const risk_risklevel = RiskCalculator.getRiskLevel(
      selectedRiskLikelihood.name as RiskLikelihood,
      selectedRiskSeverity.name as RiskSeverity
    );

    const selectedMitigationLikelihood = likelihoodItems.find(
      (r) => r._id === mitigationValues.likelihood
    );
    const selectedMitigationSeverity = riskSeverityItems.find(
      (r) => r._id === mitigationValues.riskSeverity
    );
    if (!selectedMitigationLikelihood || !selectedMitigationSeverity) {
      console.error("Could not find selected likelihood or severity");
      return;
    }

    const mitigation_risklevel = RiskCalculator.getRiskLevel(
      selectedMitigationLikelihood.name as RiskLikelihood,
      selectedMitigationSeverity.name as RiskSeverity
    );

    // Check forms validation
    if (isValid) {
      onLoading(
        popupStatus !== "new"
          ? "Updating the risk. Please wait..."
          : "Creating the risk. Please wait..."
      );

      let formData: Record<string, unknown>;

      if (popupStatus !== "new") {
        // For updates, get only changed fields separately for risk and mitigation
        const changedRiskFields = getChangedFields(originalRiskValues, riskValues);
        const changedMitigationFields = getChangedFields(originalMitigationValues, mitigationValues);

        // Combine with prefixes to distinguish risk vs mitigation fields
        const changedFields: Record<string, unknown> = {};
        Object.keys(changedRiskFields).forEach(key => {
          changedFields[`risk_${key}`] = changedRiskFields[key];
        });
        Object.keys(changedMitigationFields).forEach(key => {
          changedFields[`mitigation_${key}`] = changedMitigationFields[key];
        });

        // Include quantitative field changes if in quantitative mode
        if (isQuantitative) {
          const changedQuantitativeFields = getChangedFields(originalQuantitativeValues, quantitativeValues);
          Object.keys(changedQuantitativeFields).forEach(key => {
            changedFields[`quantitative_${key}`] = changedQuantitativeFields[key];
          });
        }

        formData = buildFormData(
          risk_risklevel.level,
          mitigation_risklevel.level,
          changedFields
        ) as Record<string, unknown>;

        // For quantitative updates, directly include FAIR fields that changed
        if (isQuantitative) {
          const changedQuantitativeFields = getChangedFields(originalQuantitativeValues, quantitativeValues);
          Object.keys(changedQuantitativeFields).forEach(key => {
            formData[key] = changedQuantitativeFields[key];
          });
        }

        // Add boolean flags for deleted/emptied linked projects and frameworks
        if (Object.prototype.hasOwnProperty.call(changedFields, 'risk_applicableProjects')) {
          const originalProjects = originalRiskValues?.applicableProjects || [];
          const currentProjects = riskValues.applicableProjects || [];
          formData.deletedLinkedProject = originalProjects.length > 0 && currentProjects.length === 0;
        }

        if (Object.prototype.hasOwnProperty.call(changedFields, 'risk_applicableFrameworks')) {
          const originalFrameworks = originalRiskValues?.applicableFrameworks || [];
          const currentFrameworks = riskValues.applicableFrameworks || [];
          formData.deletedLinkedFrameworks = originalFrameworks.length > 0 && currentFrameworks.length === 0;
        }

      } else {
        // For creates, send all fields
        formData = buildFormData(
          risk_risklevel.level,
          mitigation_risklevel.level
        ) as Record<string, unknown>;
      }

      try {
        const response =
          popupStatus !== "new"
            ? await updateProjectRisk({ id: Number(inputValues.id), body: formData })
            : await createProjectRisk({ body: formData });

        if (response && response.status === 201) {
          // risk create success
          closePopup();
          onSuccess();
        } else if (response && response.status === 200) {
          // risk update success
          closePopup();
          onSuccess();
        } else {
          const responseData = response?.data as ApiResponse;
          let errorMessage = responseData?.message || "Unknown error occurred";
          
          // Handle validation errors with detailed field information
          if (responseData?.errors && Array.isArray(responseData.errors)) {
            const fieldErrors = responseData.errors.map((err: { message?: string }) =>
              `• ${err.message ?? 'Unknown error'}`
            ).join('\n');
            errorMessage = `${errorMessage}:\n${fieldErrors}`;
          }
          
          console.error(responseData?.error);
          onError(errorMessage);
        }
      } catch (error: unknown) {
        console.error("Error sending request", error);

        // Handle CustomException from networkServices
        if (error instanceof Error && error.name === "CustomException") {
          // CustomException has a response property with errors array
          const customError = error as Error & { response?: { errors?: Array<{ message?: string }> } };

          let errorMessage = error.message || "Unknown error occurred";

          // Handle validation errors from CustomException response
          if (customError.response?.errors && Array.isArray(customError.response.errors)) {
            const fieldErrors = customError.response.errors.map((err: { message?: string }) =>
              `• ${err.message ?? 'Unknown error'}`
            ).join('\n');
            errorMessage = `${errorMessage}:\n${fieldErrors}`;
          }

          onError(errorMessage);
        } else if (error instanceof Error) {
          // Standard Error object
          onError(error.message || "Network error occurred");
        } else {
          // Fallback for other types of errors
          onError("Network error occurred");
        }
      }
    } else {
      if (Object.keys(errors).length) {
        setValue("risks");
      } else {
        setValue("mitigation");
      }
    }
  };

  // Show loading state while users are being fetched
  if (usersLoading) {
    return (
      <Stack
        className="AddNewRiskForm"
        sx={{ p: 3, textAlign: "center" }}
        role="status"
        aria-busy="true"
        aria-label="Loading form data"
      >
        <Typography>Loading form data...</Typography>
      </Stack>
    );
  }

  // Calculate tab bar width based on compactMode
  const tabBarWidth = compactMode
    ? COMPONENT_CONSTANTS.COMPACT_CONTENT_WIDTH
    : COMPONENT_CONSTANTS.CONTENT_WIDTH;

  // Get theme-aware tab style
  const tabStyle = getTabStyle(theme);

  return (
    <Stack className="AddNewRiskForm" aria-label="Risk form">
      <TabContext value={value}>
        <Box sx={{ borderBottom: 1, borderColor: "divider", width: `${tabBarWidth}px` }}>
          <TabList
            onChange={handleChange}
            aria-label="Add new risk tabs"
            TabIndicatorProps={{
              style: { backgroundColor: theme.palette.primary.main },
            }}
            sx={{
              minHeight: COMPONENT_CONSTANTS.MIN_TAB_HEIGHT,
              "& .MuiTabs-flexContainer": {
                columnGap: COMPONENT_CONSTANTS.TAB_GAP,
              },
            }}
          >
            <Tab
              label="Risks"
              value="risks"
              sx={tabStyle}
              disableRipple={disableRipple}
            />
            <Tab
              label="Mitigation"
              value="mitigation"
              sx={tabStyle}
              disableRipple={disableRipple}
            />
            {isQuantitative && (
              <Tab
                label="Quantitative"
                value="quantitative"
                sx={tabStyle}
                disableRipple={disableRipple}
              />
            )}
            {popupStatus === "edit" && entityId && (
              <Tab
                label="Activity"
                value="activity"
                sx={tabStyle}
                disableRipple={disableRipple}
              />
            )}
          </TabList>
        </Box>
        <Suspense fallback={<div>Loading...</div>}>
          <TabPanel
            value="risks"
            sx={{
              p: COMPONENT_CONSTANTS.TAB_PADDING,
              // Only set maxHeight when not in StandardModal (no onSubmitRef)
              ...(onSubmitRef ? {} : { maxHeight: COMPONENT_CONSTANTS.MAX_HEIGHT }),
            }}
          >
            <RiskSection
              riskValues={riskValues}
              setRiskValues={setRiskValues}
              riskErrors={riskErrors}
              userRoleName={userRoleName}
              disableInternalScroll={!!onSubmitRef}
              compactMode={compactMode}
            />
          </TabPanel>
          <TabPanel
            value="mitigation"
            sx={{
              p: COMPONENT_CONSTANTS.TAB_PADDING,
              // Only set maxHeight when not in StandardModal (no onSubmitRef)
              ...(onSubmitRef ? {} : { maxHeight: COMPONENT_CONSTANTS.MAX_HEIGHT }),
            }}
          >
            <MitigationSection
              mitigationValues={mitigationValues}
              setMitigationValues={setMitigationValues}
              mitigationErrors={mitigationErrors}
              userRoleName={userRoleName}
              disableInternalScroll={!!onSubmitRef}
              compactMode={compactMode}
            />
          </TabPanel>
          {isQuantitative && (
            <TabPanel
              value="quantitative"
              sx={{
                p: COMPONENT_CONSTANTS.TAB_PADDING,
                ...(onSubmitRef ? {} : { maxHeight: COMPONENT_CONSTANTS.MAX_HEIGHT }),
                overflowY: "auto",
              }}
            >
              <QuantitativeRiskForm
                values={quantitativeValues}
                onChange={setQuantitativeValues}
                disabled={
                  popupStatus === "new" ? isCreatingDisabled : isEditingDisabled
                }
              />
            </TabPanel>
          )}
          {popupStatus === "edit" && entityId && (
            <TabPanel value="activity" sx={{ p: 0 }}>
              <HistorySidebar
                inline
                isOpen={true}
                entityType="risk"
                entityId={entityId}
              />
            </TabPanel>
          )}
        </Suspense>
        {/* Only show internal button when not using StandardModal pattern (no onSubmitRef) */}
        {!onSubmitRef && (
          <Box sx={{ display: "flex" }}>
            <CustomizableButton
              sx={{
                alignSelf: "flex-end",
                width: "fit-content",
                backgroundColor: theme.palette.primary.main,
                border: `1px solid ${theme.palette.primary.main}`,
                gap: 2,
                borderRadius: COMPONENT_CONSTANTS.BORDER_RADIUS,
                maxHeight: COMPONENT_CONSTANTS.BUTTON_HEIGHT,
                textTransform: "inherit",
                boxShadow: "none",
                ml: "auto",
                mr: 0,
                mt: COMPONENT_CONSTANTS.TAB_MARGIN_TOP,
                "&:hover": { boxShadow: "none" },
              }}
              icon={
                popupStatus === "new" ? (
                  <SaveIcon size={16} />
                ) : (
                  <UpdateIconSVGWhite size={16} />
                )
              }
              variant="contained"
              onClick={riskFormSubmitHandler}
              text={popupStatus === "new" ? "Save" : "Update"}
              isDisabled={
                popupStatus === "new" ? isCreatingDisabled : isEditingDisabled
              }
              aria-label={popupStatus === "new" ? "Save new risk" : "Update risk"}
            />
          </Box>
        )}
      </TabContext>
    </Stack>
  );
};

export default AddNewRiskForm;
