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
import {
  useFormValidation,
  type FieldValidators,
} from "../../../../application/hooks/useFormValidation";
import { MITIGATION_FORM_FIELD_ORDER } from "../../../constants/formValidationFieldMaps";
import { createFieldBlurHandler } from "../../../../application/utils/formValidationFocus";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import selectValidation from "../../../../application/validations/selectValidation";
import useUsers from "../../../../application/hooks/useUsers";
import {
  mitigationStatusItems,
  riskLevelItems,
  approvalStatusItems,
  RISK_APPROVAL_STATUS,
  RISK_APPROVAL_DECISION_IDS,
} from "../projectRiskValue";
import { alertState } from "../../../../domain/interfaces/i.alert";
import { useCanCheck } from "../../../../application/hooks/useCan";
import { useAuth } from "../../../../application/hooks/useAuth";
import { useTranslation } from "../../../../application/hooks/useTranslation";

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
  disableInternalScroll?: boolean;
  compactMode?: boolean;
  /** Backend validation errors to display inline (keyed by MitigationFormValues field). */
  serverErrors?: Partial<Record<keyof MitigationFormValues, string>>;
  /** Reports live client-side validity (drives the submit button's disabled state). */
  onValidityChange?: (isValid: boolean) => void;
  /** The approver and approval status the risk has saved (none for a new risk). */
  savedApproval?: Pick<MitigationFormValues, "approver" | "approvalStatus">;
}

const NO_SAVED_APPROVAL: Pick<MitigationFormValues, "approver" | "approvalStatus"> = {
  approver: 0,
  approvalStatus: RISK_APPROVAL_STATUS.NotRequired,
};

const isDecision = (statusId: number) => RISK_APPROVAL_DECISION_IDS.includes(statusId);
/**
 * MitigationSection component manages mitigation details for risk assessment.
 *
 * Handles form fields for mitigation plan, implementation strategy, risk levels,
 * and approvals with proper validation and state management.
 *
 * @component
 * @param {MitigationSectionProps} props - Component props
 * @param {MitigationFormValues} props.mitigationValues - Current form values
 * @param {function} props.setMitigationValues - State setter for form values
 * @param {MitigationFormErrors} [props.mitigationErrors] - Form validation errors (optional)
 * @returns {JSX.Element} Rendered mitigation form section
 */
const MitigationSection: FC<MitigationSectionProps> = ({
  mitigationValues,
  setMitigationValues,
  validateRef,
  firstInvalidFieldRef,
  disableInternalScroll = false,
  compactMode = false,
  serverErrors,
  onValidityChange,
  savedApproval = NO_SAVED_APPROVAL,
}) => {
  const theme = useTheme();
  const can = useCanCheck();
  const { userId } = useAuth();
  const isEditingDisabled = !can("risks.edit");
  const isAdmin = can("organization.admin");
  const { t } = useTranslation();

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

  // Mirrors the server rule. "Decides" means an Admin or the risk's SAVED
  // approver, never the approver picked in this form.
  // - With a saved approver, only someone who decides changes the status.
  // - A new approver sets Pending; only an Admin may decide in that save.
  // - An Approved or Rejected risk changes approver only through someone who
  //   decides.
  // - A non-Admin cannot pick themself as a new approver.
  // - Without an approver the status is always Not required.
  const savedApprover = savedApproval.approver;
  const hasApprover = Boolean(mitigationValues.approver);
  const approverUnchanged = mitigationValues.approver === savedApprover;
  const callerDecides = isAdmin || (Boolean(savedApprover) && userId === savedApprover);
  const approverLocked = !callerDecides && isDecision(savedApproval.approvalStatus);
  const statusLocked = !hasApprover || !(approverUnchanged ? callerDecides : isAdmin);

  // Option names are translated for display only; the value sent to the
  // server is looked up from approvalStatusItems by id, so it stays English.
  const approvalStatusOptions = useMemo(
    () =>
      approvalStatusItems.map((item) => ({
        ...item,
        name: t(item.name),
        // A new approver always means Pending unless an Admin decides.
        disabled: !approverUnchanged && item._id === RISK_APPROVAL_STATUS.NotRequired,
      })),
    [t, approverUnchanged],
  );

  const validators = useMemo<FieldValidators<MitigationFormValues>>(
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
      // Approver, approval status and assessment date are optional.
    }),
    [],
  );

  const {
    errors,
    validateAll,
    validateField,
    clearFieldError,
    setServerErrors,
    getFirstInvalidField,
  } = useFormValidation<MitigationFormValues>(validators);
  const mitigationValuesRef = useRef(mitigationValues);
  mitigationValuesRef.current = mitigationValues;

  // Once the approver is cleared, drop server errors about the approver and
  // the status it set, and about an assessment date that is now empty. A date
  // left filled in keeps its error, since the value it describes is unchanged.
  // serverErrors is deliberately not a dependency: this runs only when the
  // approver is cleared, so a server error that arrives afterwards is merged
  // by the effect below and kept.
  useEffect(() => {
    if (hasApprover) return;
    clearFieldError("approver");
    clearFieldError("approvalStatus");
    if (!mitigationValuesRef.current.dateOfAssessment) clearFieldError("dateOfAssessment");
  }, [hasApprover, clearFieldError]);

  // Merge backend validation errors into the inline error state.
  useEffect(() => {
    if (serverErrors) setServerErrors(serverErrors);
  }, [serverErrors, setServerErrors]);

  // Live client-side validity, computed without surfacing errors in the UI.
  const isSectionValid = useMemo(
    () =>
      (Object.keys(validators) as (keyof MitigationFormValues)[]).every(
        (field) => !validators[field]?.(mitigationValues[field], mitigationValues),
      ),
    [validators, mitigationValues],
  );

  useEffect(() => {
    onValidityChange?.(isSectionValid);
  }, [isSectionValid, onValidityChange]);

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

  // Memoized values. "None" (id 0) clears the approver. A non-Admin sees
  // their own name but cannot pick it, unless they already are the approver.
  const userOptions = useMemo(
    () => [
      { _id: 0, name: t("None") },
      ...(users?.map((user) => ({
        _id: user.id,
        name: `${user.name} ${user.surname}`,
        disabled: !isAdmin && user.id === userId && user.id !== savedApprover,
      })) || []),
    ],
    [users, t, isAdmin, userId, savedApprover],
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

  // A new approver resets the status to Pending, no approver means Not
  // required, and going back to the saved approver restores the saved status.
  const handleApproverChange = useCallback(
    (event: SelectChangeEvent<string | number>) => {
      const approver = Number(event.target.value) || 0;
      const approvalStatus =
        approver === savedApproval.approver
          ? savedApproval.approvalStatus
          : approver
            ? RISK_APPROVAL_STATUS.Pending
            : RISK_APPROVAL_STATUS.NotRequired;
      setMitigationValues((prevValues) => ({ ...prevValues, approver, approvalStatus }));
      clearFieldError("approver");
      clearFieldError("approvalStatus");
    },
    [savedApproval, setMitigationValues, clearFieldError],
  );

  const handleDateChange = useCallback(
    (
      field: keyof Pick<MitigationFormValues, "deadline" | "dateOfAssessment">,
      newDate: Dayjs | null,
    ) => {
      if (newDate === null) {
        // Cleared by the user: keep it empty.
        setMitigationValues((prevValues) => ({ ...prevValues, [field]: "" }));
      } else if (newDate.isValid()) {
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
              {/* Current Risk Level */}
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
                disabled={isEditingDisabled}
              />
              {/* Deadline */}
              <DatePicker
                id="mitigation-deadline-input"
                label="Deadline"
                date={mitigationValues.deadline ? dayjs(mitigationValues.deadline) : null}
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
            The risk level is a weighted score: likelihood plus three times severity, so severity
            counts more. Pick a likelihood and a severity and the level follows from the score.
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
            onChange={handleApproverChange}
            onBlur={handleFieldBlur("approver")}
            items={userOptions}
            sx={formFieldStyles}
            error={errors.approver}
            // Only an Admin or the saved approver re-assigns a decided risk.
            disabled={isEditingDisabled || usersLoading || approverLocked}
            dataTestId="approver-select"
          />
          <Select
            id="approval-status-input"
            label="Approval status"
            placeholder="Select status"
            value={mitigationValues.approvalStatus === 0 ? "" : mitigationValues.approvalStatus}
            onChange={handleOnSelectChange("approvalStatus")}
            onBlur={handleFieldBlur("approvalStatus")}
            items={approvalStatusOptions}
            sx={formFieldStyles}
            error={errors.approvalStatus}
            disabled={isEditingDisabled || statusLocked}
            dataTestId="approval-status-select"
          />
          <DatePicker
            id="mitigation-assessment-date-input"
            label="Assessment date"
            date={
              mitigationValues.dateOfAssessment ? dayjs(mitigationValues.dateOfAssessment) : null
            }
            handleDateChange={(e) => handleDateChange("dateOfAssessment", e)}
            onBlur={handleFieldBlur("dateOfAssessment")}
            sx={{ flex: 1 }}
            error={errors.dateOfAssessment}
            disabled={isEditingDisabled}
          />
        </Stack>
      </Stack>
    </Stack>
  );
};

export default MitigationSection;
