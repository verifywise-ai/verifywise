import React, {
  FC,
  useState,
  useCallback,
  useMemo,
  useEffect,
  lazy,
  Suspense,
  Dispatch,
  SetStateAction,
} from "react";
import {
  Divider,
  SelectChangeEvent,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import dayjs, { Dayjs } from "dayjs";
import { MitigationFormValues } from "../interface";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import selectValidation from "../../../../application/validations/selectValidation";
import styles from "../styles.module.css";
import useUsers from "../../../../application/hooks/useUsers";
import {
  mitigationStatusItems,
  riskLevelItems,
  approvalStatusItems,
} from "../projectRiskValue";
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
    return (this.FIELD_WIDTH * 3) + (this.HORIZONTAL_GAP * 2); // 985px
  },
  get TWO_COLUMN_WIDTH() {
    return (this.FIELD_WIDTH * 2) + this.HORIZONTAL_GAP; // 654px
  },
  get COMPACT_TWO_COLUMN_WIDTH() {
    return (this.COMPACT_FIELD_WIDTH * 2) + this.HORIZONTAL_GAP; // 644px
  },
} as const;

// Constants
const FORM_FIELD_WIDTH = LAYOUT.FIELD_WIDTH;
const MIN_HEIGHT = 500;
const MAX_HEIGHT = 500;

// Lazy load components
const Select = lazy(() => import("../../Inputs/Select"));
const Field = lazy(() => import("../../Inputs/Field"));
const DatePicker = lazy(() => import("../../Inputs/Datepicker"));
const RiskLevel = lazy(() => import("../../RiskLevel"));
const Alert = lazy(() => import("../../Alert"));

interface MitigationSectionProps {
  mitigationValues: MitigationFormValues;
  setMitigationValues: Dispatch<SetStateAction<MitigationFormValues>>;
  validateRef?: React.MutableRefObject<((values: MitigationFormValues) => boolean) | null>;
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
  userRoleName,
  disableInternalScroll = false,
  compactMode = false,
}) => {
  const theme = useTheme();
  const isEditingDisabled =
    !allowedRoles.projectRisks.edit.includes(userRoleName);

  const [alert, setAlert] = useState<alertState | null>(null);

  const { users, loading: usersLoading } = useUsers();

  // Dynamic layout based on compactMode - squeeze into 990px when sidebar is open
  const fieldWidth = compactMode ? `${LAYOUT.COMPACT_FIELD_WIDTH}px` : `${FORM_FIELD_WIDTH}px`;
  const contentWidth = compactMode ? `${LAYOUT.COMPACT_CONTENT_WIDTH}px` : `${LAYOUT.TOTAL_CONTENT_WIDTH}px`;
  const twoColumnWidth = compactMode ? `${LAYOUT.COMPACT_TWO_COLUMN_WIDTH}px` : `${LAYOUT.TWO_COLUMN_WIDTH}px`;

  const formRowStyles = {
    display: "flex",
    flexDirection: "row" as const,
    justifyContent: "flex-start",
    flexWrap: "wrap" as const,
    gap: `${LAYOUT.HORIZONTAL_GAP}px`,
    width: contentWidth,
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
    []
  );

  const { errors, validateAll, clearFieldError } =
    useFormValidation<MitigationFormValues>(validators);

  useEffect(() => {
    if (validateRef) {
      validateRef.current = validateAll;
    }
    // No cleanup: TabPanel unmounts inactive tabs, so clearing the ref here
    // would break parent validation when the user is on a different tab.
  }, [validateRef, validateAll]);

  // Memoized values
  const userOptions = useMemo(
    () =>
      users?.map((user) => ({
        _id: user.id,
        name: `${user.name} ${user.surname}`,
      })) || [],
    [users]
  );

  const formFieldStyles = useMemo(
    () => ({
      width: fieldWidth,
      backgroundColor: theme.palette.background.main,
    }),
    [theme.palette.background.main, fieldWidth]
  );

  const handleOnSelectChange = useCallback(
    (prop: keyof MitigationFormValues) =>
      (event: SelectChangeEvent<string | number>) => {
        setMitigationValues((prevValues) => ({
          ...prevValues,
          [prop]: event.target.value,
        }));
        clearFieldError(prop);
      },
    [setMitigationValues, clearFieldError]
  );

  const handleDateChange = useCallback(
    (
      field: keyof Pick<MitigationFormValues, "deadline" | "dateOfAssessment">,
      newDate: Dayjs | null
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
    [setMitigationValues, clearFieldError]
  );

  const handleOnTextFieldChange = useCallback(
    (prop: keyof MitigationFormValues) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setMitigationValues((prevValues) => ({
          ...prevValues,
          [prop]: event.target.value,
        }));
        clearFieldError(prop);
      },
    [setMitigationValues, clearFieldError]
  );

  return (
    <Stack sx={{
      ...(disableInternalScroll ? {} : { minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT })
    }}>
      {alert && (
        <Suspense fallback={<div>Loading...</div>}>
          <Alert
            variant={alert.variant}
            title={alert.title}
            body={alert.body}
            isToast={true}
            onClick={() => setAlert(null)}
          />
        </Suspense>
      )}
      <Suspense fallback={<div>Loading form components...</div>}>
        <Stack
          className={disableInternalScroll ? undefined : styles.popupBody}
          sx={{
            width: "100%",
            ...(disableInternalScroll ? {} : {
              maxHeight: "fit-content",
              overflowY: "auto",
              overflowX: "hidden",
            }),
          }}
        >
          <Stack sx={{ width: contentWidth }}>
            <Stack sx={{ gap: `${LAYOUT.VERTICAL_GAP}px` }}>
              {/* Row 1: Three columns */}
              <Stack sx={formRowStyles}>
                {/* Mitigation Status */}
                <Select
                  id="mitigation-status-input"
                  label="Mitigation status"
                  placeholder="Select status"
                  value={
                    mitigationValues.mitigationStatus === 0
                      ? ""
                      : mitigationValues.mitigationStatus
                  }
                  onChange={handleOnSelectChange("mitigationStatus")}
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
                    mitigationValues.currentRiskLevel === 0
                      ? ""
                      : mitigationValues.currentRiskLevel
                  }
                  onChange={handleOnSelectChange("currentRiskLevel")}
                  items={riskLevelItems}
                  sx={formFieldStyles}
                  isRequired
                  error={errors.currentRiskLevel}
                  disabled={isEditingDisabled}
                />
                {/* Deadline */}
                <DatePicker
                  label="Deadline"
                  date={
                    mitigationValues.deadline
                      ? dayjs(mitigationValues.deadline)
                      : dayjs(new Date())
                  }
                  handleDateChange={(e) => handleDateChange("deadline", e)}
                  sx={{ width: fieldWidth }}
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
                  sx={{ width: fieldWidth }}
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
                  sx={{ width: twoColumnWidth }}
                  isRequired
                  error={errors.implementationStrategy}
                  disabled={isEditingDisabled}
                  placeholder="Write implementation strategy"
                />
              </Stack>
            </Stack>
          </Stack>
          <Divider sx={{ mt: `${LAYOUT.VERTICAL_GAP}px` }} />
          <Stack sx={{ gap: `${LAYOUT.HORIZONTAL_GAP}px`, mt: `${LAYOUT.VERTICAL_GAP}px`, width: contentWidth }}>
            <Typography sx={{ fontSize: 16, fontWeight: 600 }}>
              Calculate residual risk level
            </Typography>
            <Typography sx={{ fontSize: theme.typography.fontSize }}>
              The Risk Level is calculated by multiplying the Likelihood and
              Severity scores. By assigning these scores, the risk level will be
              determined based on your inputs.
            </Typography>
          </Stack>
          <Stack sx={{ mt: `${LAYOUT.VERTICAL_GAP}px`, width: contentWidth }}>
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
              value={
                mitigationValues.approvalStatus === 0
                  ? ""
                  : mitigationValues.approvalStatus
              }
              onChange={handleOnSelectChange("approvalStatus")}
              items={approvalStatusItems}
              sx={formFieldStyles}
              isRequired
              error={errors.approvalStatus}
              disabled={isEditingDisabled}
            />
            <DatePicker
              label="Assessment date"
              date={
                mitigationValues.dateOfAssessment
                  ? dayjs(mitigationValues.dateOfAssessment)
                  : dayjs(new Date())
              }
              handleDateChange={(e) => handleDateChange("dateOfAssessment", e)}
              sx={{ width: fieldWidth }}
              isRequired
              error={errors.dateOfAssessment}
              disabled={isEditingDisabled}
            />
          </Stack>
          <Stack sx={{ mt: `${LAYOUT.VERTICAL_GAP}px`, width: contentWidth }}>
            <Field
              id="recommendations-input"
              label="Recommendations"
              type="description"
              rows={3}
              value={mitigationValues.recommendations}
              onChange={handleOnTextFieldChange("recommendations")}
              sx={{ width: "100%" }}
              disabled={isEditingDisabled}
            />
          </Stack>
        </Stack>
      </Suspense>
    </Stack>
  );
};

export default MitigationSection;
