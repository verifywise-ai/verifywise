import React, {
  FC,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  Dispatch,
  SetStateAction,
} from "react";
import { Divider, SelectChangeEvent, Stack, Typography, useTheme } from "@mui/material";
import dayjs, { Dayjs } from "dayjs";
import { MitigationFormValues } from "../interface";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import { MITIGATION_FORM_FIELD_ORDER } from "../../../constants/formValidationFieldMaps";
import { createFieldBlurHandler } from "../../../../application/utils/formValidationFocus";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import selectValidation from "../../../../application/validations/selectValidation";
import useUsers from "../../../../application/hooks/useUsers";
import {
  mitigationStatusItems,
  riskLevelItems,
  approvalStatusItems,
  likelihoodItems,
  riskSeverityItems,
} from "../projectRiskValue";
import { RiskCalculator } from "../../../tools/riskCalculator";
import { RiskLikelihood, RiskSeverity } from "../../RiskLevel/riskValues";
import { alertState } from "../../../../domain/interfaces/i.alert";
import allowedRoles from "../../../../application/constants/permissions";

// Layout constants - matching RisksSection
const LAYOUT = {
  FIELD_WIDTH: 323,
  COMPACT_FIELD_WIDTH: 318,
  HORIZONTAL_GAP: 8,
  VERTICAL_GAP: 16,
  COMPACT_CONTENT_WIDTH: 970, // Account for scrollbar (~17px)
  get TOTAL_CONTENT_WIDTH() {
    return this.FIELD_WIDTH * 3 + this.HORIZONTAL_GAP * 2; // 985px
  },
  get TWO_COLUMN_WIDTH() {
    return this.FIELD_WIDTH * 2 + this.HORIZONTAL_GAP; // 654px
  },
  get COMPACT_TWO_COLUMN_WIDTH() {
    return this.COMPACT_FIELD_WIDTH * 2 + this.HORIZONTAL_GAP; // 644px
  },
} as const;

import Select from "../../Inputs/Select";
import Field from "../../Inputs/Field";
import DatePicker from "../../Inputs/Datepicker";
import RiskLevel from "../../RiskLevel";
import Alert from "../../Alert";

interface MitigationSectionProps {
  mitigationValues: MitigationFormValues;
  setMitigationValues: Dispatch<SetStateAction<MitigationFormValues>>;
  validateRef?: React.MutableRefObject<((values: MitigationFormValues) => boolean) | null>;
  firstInvalidFieldRef?: React.MutableRefObject<keyof MitigationFormValues | null>;
  userRoleName: string;
  disableInternalScroll?: boolean;
  compactMode?: boolean;
}
/**
 * MitigationSection component manages mitigation details for risk assessment.
 *
 * Handles form fields for mitigation plan, implementation strategy, risk levels,
 * approvals, and recommendations with proper validation and state management.
 *
 * @component
 * @param {MitigationSectionProps} props - Component props
 * @param {MitigationFormValues} props.mitigationValues - Current form values
 * @param {function} props.setMitigationValues - State setter for form values
 * @param {MitigationFormErrors} [props.mitigationErrors] - Form validation errors (optional)
 * @param {string} props.userRoleName - Current user's role for permission checks
 * @returns {JSX.Element} Rendered mitigation form section
 */
const MitigationSection: FC<MitigationSectionProps> = ({
  mitigationValues,
  setMitigationValues,
  validateRef,
  firstInvalidFieldRef,
  userRoleName,
  disableInternalScroll = false,
  compactMode = false,
}) => {
  const theme = useTheme();
  const isEditingDisabled = !allowedRoles.projectRisks.edit.includes(userRoleName);

  const [alert, setAlert] = useState<alertState | null>(null);

  const { users, loading: usersLoading } = useUsers();

  // Dynamic layout based on compactMode - squeeze into 990px when sidebar is open
  const contentWidth = compactMode
    ? `${LAYOUT.COMPACT_CONTENT_WIDTH}px`
    : `${LAYOUT.TOTAL_CONTENT_WIDTH}px`;

  const formRowStyles = {
    display: "flex",
    flexDirection: "row" as const,
    justifyContent: "flex-start",
    flexWrap: "nowrap" as const,
    gap: `${LAYOUT.HORIZONTAL_GAP}px`,
    width: "100%",
    maxWidth: contentWidth,
  };

  const validators = useMemo(
    () => ({
      mitigationStatus: (v: unknown) => {
        const r = selectValidation("Mitigation status", v as number);
        return r.accepted ? "" : r.message;
      },
      currentRiskLevel: (v: unknown) => {
        const r = selectValidation("Current risk level", v as number);
        return r.accepted ? "" : r.message;
      },
      deadline: (v: unknown) => {
        const r = checkStringValidation("Deadline", v as string, 1);
        return r.accepted ? "" : r.message;
      },
      mitigationPlan: (v: unknown) => {
        const r = checkStringValidation("Mitigation plan", v as string, 1, 1024);
        return r.accepted ? "" : r.message;
      },
      implementationStrategy: (v: unknown) => {
        const r = checkStringValidation("Implementation strategy", v as string, 1, 1024);
        return r.accepted ? "" : r.message;
      },
      approver: (v: unknown) => {
        const r = selectValidation("Approver", v as number);
        return r.accepted ? "" : r.message;
      },
      approvalStatus: (v: unknown) => {
        const r = selectValidation("Approval status", v as number);
        return r.accepted ? "" : r.message;
      },
      dateOfAssessment: (v: unknown) => {
        const r = checkStringValidation("Date of assessment", v as string, 1);
        return r.accepted ? "" : r.message;
      },
      recommendations: (v: unknown) => {
        const s = v as string;
        if (!s || s.length === 0) return "";
        const r = checkStringValidation("Recommendation", s, 1, 1024);
        return r.accepted ? "" : r.message;
      },
    }),
    [],
  );

  const { errors, validateAll, validateField, clearFieldError, getFirstInvalidField } =
    useFormValidation<MitigationFormValues>(validators);
  const mitigationValuesRef = useRef(mitigationValues);
  mitigationValuesRef.current = mitigationValues;

  const handleFieldBlur = useCallback(
    (prop: keyof MitigationFormValues) =>
      createFieldBlurHandler(prop, () => mitigationValuesRef.current, validateField),
    [validateField],
  );

  useEffect(() => {
    if (!validateRef) return;
    validateRef.current = (values) => {
      const valid = validateAll(values, MITIGATION_FORM_FIELD_ORDER);
      if (firstInvalidFieldRef) {
        firstInvalidFieldRef.current = getFirstInvalidField() ?? null;
      }
      return valid;
    };
  }, [validateRef, firstInvalidFieldRef, validateAll, getFirstInvalidField]);

  // Memoized values
  const userOptions = useMemo(
    () =>
      users?.map((user) => ({
        _id: user.id,
        name: `${user.name} ${user.surname}`,
      })) || [],
    [users],
  );

  const formFieldStyles = useMemo(
    () => ({
      flex: 1,
      backgroundColor: theme.palette.background.main,
    }),
    [theme.palette.background.main],
  );

  const handleOnSelectChange = useCallback(
    (prop: keyof MitigationFormValues) => (event: SelectChangeEvent<string | number>) => {
      setMitigationValues((prevValues) => ({
        ...prevValues,
        [prop]: event.target.value,
      }));
      clearFieldError(prop);
    },
    [setMitigationValues, clearFieldError],
  );

  // Keep "Current risk level" in sync with the residual level computed from the
  // mitigation likelihood and severity. Without this the field (which the
  // dashboard and reporting read via current_risk_level) stays frozen at the
  // pre-mitigation value, so mitigating a risk never lowers the reported level.
  // The computed level string maps to the same options as the dropdown.
  const computedResidualLevelId = useMemo(() => {
    const likelihood = likelihoodItems.find((i) => i._id === mitigationValues.likelihood);
    const severity = riskSeverityItems.find((i) => i._id === mitigationValues.riskSeverity);
    if (!likelihood || !severity) return null;
    const { level } = RiskCalculator.getRiskLevel(
      likelihood.name as RiskLikelihood,
      severity.name as RiskSeverity,
    );
    // getRiskLevel emits "No risk" for the lowest band; the dropdown labels it
    // "Very Low risk", so match on the noRisk option explicitly.
    const normalized = level === "No risk" ? "Very Low risk" : level;
    return riskLevelItems.find((i) => i.name === normalized)?._id ?? null;
  }, [mitigationValues.likelihood, mitigationValues.riskSeverity]);

  useEffect(() => {
    if (computedResidualLevelId == null) return;
    setMitigationValues((prev) =>
      prev.currentRiskLevel === computedResidualLevelId
        ? prev
        : { ...prev, currentRiskLevel: computedResidualLevelId },
    );
  }, [computedResidualLevelId, setMitigationValues]);

  const handleDateChange = useCallback(
    (
      field: keyof Pick<MitigationFormValues, "deadline" | "dateOfAssessment">,
      newDate: Dayjs | null,
    ) => {
      if (newDate?.isValid()) {
        setMitigationValues((prevValues) => ({
          ...prevValues,
          [field]: newDate.toISOString(),
        }));
        clearFieldError(field);
      } else {
        console.warn(`Invalid date provided for field: ${field}`);
      }
    },
    [setMitigationValues, clearFieldError],
  );

  const handleOnTextFieldChange = useCallback(
    (prop: keyof MitigationFormValues) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setMitigationValues((prevValues) => ({
        ...prevValues,
        [prop]: event.target.value,
      }));
      clearFieldError(prop);
    },
    [setMitigationValues, clearFieldError],
  );

  return (
    <Stack>
      {alert && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={true}
          onClick={() => setAlert(null)}
        />
      )}
      <Stack sx={{ width: "100%", ...(disableInternalScroll ? {} : { p: "10px" }) }}>
        <Stack sx={{ width: "100%", maxWidth: contentWidth }}>
          <Stack sx={{ gap: `${LAYOUT.VERTICAL_GAP}px` }}>
            {/* Row 1: Three columns */}
            <Stack sx={formRowStyles}>
              {/* Mitigation Status */}
              <Select
                id="mitigation-status-input"
                label="Mitigation status"
                placeholder="Select status"
                value={
                  mitigationValues.mitigationStatus === 0 ? "" : mitigationValues.mitigationStatus
                }
                onChange={handleOnSelectChange("mitigationStatus")}
                onBlur={handleFieldBlur("mitigationStatus")}
                items={mitigationStatusItems}
                sx={formFieldStyles}
                isRequired
                error={errors.mitigationStatus}
                disabled={isEditingDisabled}
              />
              {/* Current risk level — derived from the residual computed below
                  (likelihood × severity). Read-only so it can never diverge from
                  the computed residual the dashboard and reporting rely on. */}
              <Select
                id="current-risk-level-input"
                label="Current risk level"
                placeholder="Select risk level"
                value={
                  mitigationValues.currentRiskLevel === 0 ? "" : mitigationValues.currentRiskLevel
                }
                onChange={handleOnSelectChange("currentRiskLevel")}
                onBlur={handleFieldBlur("currentRiskLevel")}
                items={riskLevelItems}
                sx={formFieldStyles}
                isRequired
                error={errors.currentRiskLevel}
                disabled
              />
              {/* Deadline */}
              <DatePicker
                id="mitigation-deadline-input"
                label="Deadline"
                date={
                  mitigationValues.deadline ? dayjs(mitigationValues.deadline) : dayjs(new Date())
                }
                handleDateChange={(e) => handleDateChange("deadline", e)}
                onBlur={handleFieldBlur("deadline")}
                sx={{ flex: 1 }}
                isRequired
                error={errors.deadline}
                disabled={isEditingDisabled}
              />
            </Stack>
            {/* Row 2: Mitigation Plan and Implementation Strategy */}
            <Stack sx={formRowStyles}>
              {/* Mitigation Plan */}
              <Field
                id="mitigation-plan-input"
                label="Mitigation plan"
                type="description"
                rows={3}
                value={mitigationValues.mitigationPlan}
                onChange={handleOnTextFieldChange("mitigationPlan")}
                onBlur={handleFieldBlur("mitigationPlan")}
                sx={{ flex: 1 }}
                isRequired
                error={errors.mitigationPlan}
                disabled={isEditingDisabled}
                placeholder="Write mitigation plan"
              />
              {/* Implementation Strategy */}
              <Field
                id="implementation-strategy-input"
                label="Implementation strategy"
                type="description"
                rows={3}
                value={mitigationValues.implementationStrategy}
                onChange={handleOnTextFieldChange("implementationStrategy")}
                onBlur={handleFieldBlur("implementationStrategy")}
                sx={{ flex: 1 }}
                isRequired
                error={errors.implementationStrategy}
                disabled={isEditingDisabled}
                placeholder="Write implementation strategy"
              />
            </Stack>
          </Stack>
        </Stack>
        <Divider sx={{ mt: `${LAYOUT.VERTICAL_GAP}px` }} />
        <Stack
          sx={{
            gap: `${LAYOUT.HORIZONTAL_GAP}px`,
            mt: `${LAYOUT.VERTICAL_GAP}px`,
            width: "100%",
            maxWidth: contentWidth,
          }}
        >
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>
            Calculate residual risk level
          </Typography>
          <Typography sx={{ fontSize: theme.typography.fontSize }}>
            The Risk Level is calculated by multiplying the Likelihood and Severity scores. By
            assigning these scores, the risk level will be determined based on your inputs.
          </Typography>
        </Stack>
        <Stack sx={{ mt: `${LAYOUT.VERTICAL_GAP}px`, width: "100%", maxWidth: contentWidth }}>
          <RiskLevel
            likelihood={mitigationValues.likelihood}
            riskSeverity={mitigationValues.riskSeverity}
            handleOnSelectChange={handleOnSelectChange}
            disabled={isEditingDisabled}
          />
        </Stack>
        <Divider sx={{ mt: `${LAYOUT.VERTICAL_GAP}px` }} />
        <Typography sx={{ fontSize: 16, fontWeight: 600, mt: `${LAYOUT.VERTICAL_GAP}px` }}>
          Risk approval
        </Typography>
        <Stack sx={{ ...formRowStyles, mt: `${LAYOUT.VERTICAL_GAP}px` }}>
          <Select
            id="approver-input"
            label="Approver"
            placeholder="Select approver"
            value={
              usersLoading || !users?.length
                ? ""
                : mitigationValues.approver === 0
                  ? ""
                  : mitigationValues.approver
            }
            onChange={handleOnSelectChange("approver")}
            onBlur={handleFieldBlur("approver")}
            items={userOptions}
            sx={formFieldStyles}
            isRequired
            error={errors.approver}
            disabled={isEditingDisabled || usersLoading}
          />
          <Select
            id="approval-status-input"
            label="Approval status"
            placeholder="Select status"
            value={mitigationValues.approvalStatus === 0 ? "" : mitigationValues.approvalStatus}
            onChange={handleOnSelectChange("approvalStatus")}
            onBlur={handleFieldBlur("approvalStatus")}
            items={approvalStatusItems}
            sx={formFieldStyles}
            isRequired
            error={errors.approvalStatus}
            disabled={isEditingDisabled}
          />
          <DatePicker
            id="mitigation-assessment-date-input"
            label="Assessment date"
            date={
              mitigationValues.dateOfAssessment
                ? dayjs(mitigationValues.dateOfAssessment)
                : dayjs(new Date())
            }
            handleDateChange={(e) => handleDateChange("dateOfAssessment", e)}
            onBlur={handleFieldBlur("dateOfAssessment")}
            sx={{ flex: 1 }}
            isRequired
            error={errors.dateOfAssessment}
            disabled={isEditingDisabled}
          />
        </Stack>
        <Stack sx={{ mt: `${LAYOUT.VERTICAL_GAP}px`, width: "100%", maxWidth: contentWidth }}>
          <Field
            id="recommendations-input"
            label="Recommendations"
            type="description"
            rows={3}
            value={mitigationValues.recommendations}
            onChange={handleOnTextFieldChange("recommendations")}
            onBlur={handleFieldBlur("recommendations")}
            sx={{ width: "100%" }}
            disabled={isEditingDisabled}
          />
        </Stack>
      </Stack>
    </Stack>
  );
};

export default MitigationSection;
