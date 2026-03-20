import React, {
  FC,
  useState,
  useCallback,
  Suspense,
  Dispatch,
  SetStateAction,
} from "react";
import {
  Stack,
  Typography,
  useTheme,
  SelectChangeEvent,
  Autocomplete,
  Box,
  TextField,
} from "@mui/material";
import { ChevronDown as GreyDownArrowIcon } from "lucide-react";
import Field from "../../Inputs/Field";
import Select from "../../Inputs/Select";
import Alert from "../../Alert";
import { RiskFormValues, RiskFormErrors } from "../interface";
import { aiLifecyclePhase, riskCategoryItems } from "../projectRiskValue";
import { alertState } from "../../../../domain/interfaces/i.alert";
import useUsers from "../../../../application/hooks/useUsers";
import { useProjects } from "../../../../application/hooks/useProjects";
import useFrameworks from "../../../../application/hooks/useFrameworks";
import allowedRoles from "../../../../application/constants/permissions";
import styles from "../styles.module.css";
import { getAutocompleteStyles as getCentralizedAutocompleteStyles } from "../../../utils/inputStyles";

const RiskLevel = React.lazy(() => import("../../RiskLevel"));

// Layout constants
const LAYOUT = {
  FIELD_WIDTH: 323,
  COMPACT_FIELD_WIDTH: 318,
  HORIZONTAL_GAP: 8,
  VERTICAL_GAP: 16,
  COMPACT_CONTENT_WIDTH: 970, // Account for scrollbar (~17px)
  get TOTAL_CONTENT_WIDTH() {
    return (this.FIELD_WIDTH * 3) + (this.HORIZONTAL_GAP * 2); // 985px
  },
} as const;

// Constants
const FORM_CONSTANTS = {
  FIELD_WIDTH: `${LAYOUT.FIELD_WIDTH}px`,
  MIN_HEIGHT: 500,
  MAX_HEIGHT: 500,
  CONTENT_MAX_HEIGHT: 600,
  TEXT_AREA_MAX_HEIGHT: "120px",
} as const;

const FORM_STYLES = {
  fontSize: "13px",
  borderRadius: "8px",
  focusedBackground: "background.accent",
  padding: "12px",
  chipPadding: "4px",
} as const;

interface RiskSectionProps {
  riskValues: RiskFormValues;
  setRiskValues: Dispatch<SetStateAction<RiskFormValues>>;
  riskErrors: RiskFormErrors;
  userRoleName: string;
  disableInternalScroll?: boolean;
  compactMode?: boolean;
}

/**
 * RiskSection component renders a form for adding or updating risk details.
 * It includes fields for risk name, description, potential impact, review notes,
 * action owner, AI lifecycle phase, and risk category. It also calculates the risk level
 * based on likelihood and severity scores.
 *
 * @component
 * @param {RiskSectionProps} props - The props for the RiskSection component
 * @param {RiskFormValues} props.riskValues - Current form values
 * @param {Dispatch<SetStateAction<RiskFormValues>>} props.setRiskValues - Function to update form values
 * @param {RiskFormErrors} props.riskErrors - Current form validation errors
 * @param {string} props.userRoleName - Current user's role name for permissions
 * @returns {JSX.Element} The rendered RiskSection component
 */
const RiskSection: FC<RiskSectionProps> = ({
  riskValues,
  setRiskValues,
  riskErrors,
  userRoleName,
  disableInternalScroll = false,
  compactMode = false,
}) => {
  const theme = useTheme();
  const isEditingDisabled =
    !allowedRoles.projectRisks.edit.includes(userRoleName);

  // Dynamic layout based on compactMode - squeeze into 990px when sidebar is open
  const fieldWidth = compactMode ? `${LAYOUT.COMPACT_FIELD_WIDTH}px` : FORM_CONSTANTS.FIELD_WIDTH;
  const contentWidth = compactMode ? `${LAYOUT.COMPACT_CONTENT_WIDTH}px` : `${LAYOUT.TOTAL_CONTENT_WIDTH}px`;

  const formRowStyles = {
    display: "flex",
    flexDirection: "row" as const,
    justifyContent: "flex-start",
    flexWrap: "wrap" as const,
    gap: `${LAYOUT.HORIZONTAL_GAP}px`,
    width: contentWidth,
    maxWidth: contentWidth,
    boxSizing: "border-box" as const,
  };

  const [alert, setAlert] = useState<alertState | null>(null);
  const { users, loading: usersLoading } = useUsers();
  const { approvedProjects, isLoading: projectsLoading } = useProjects();
  const { allFrameworks: frameworks, loading: frameworksLoading } = useFrameworks({ listOfFrameworks: [] });

  const handleOnSelectChange = useCallback(
    (prop: keyof RiskFormValues) =>
      (event: SelectChangeEvent<string | number>) => {
        setRiskValues((prevValues) => ({
          ...prevValues,
          [prop]: event.target.value,
        }));
      },
    [setRiskValues]
  );

  const handleOnMultiselectChange = useCallback(
    (prop: keyof RiskFormValues) =>
      (
        _event: React.SyntheticEvent,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newValue: any[]
      ) => {
        setRiskValues((prevValues) => ({
          ...prevValues,
          [prop]: newValue.map((item) => Number(item._id || item.id)),
        }));
      },
    [setRiskValues]
  );

  const handleOnTextFieldChange = useCallback(
    (prop: keyof RiskFormValues) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setRiskValues((prevValues) => ({
          ...prevValues,
          [prop]: event.target.value,
        }));
      },
    [setRiskValues]
  );

  return (
    <Stack
      sx={{
        ...(disableInternalScroll ? {} : {
          minHeight: FORM_CONSTANTS.MIN_HEIGHT,
          maxHeight: FORM_CONSTANTS.MAX_HEIGHT,
        }),
        gap: 3,
      }}
    >
      {alert && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={true}
          onClick={() => setAlert(null)}
        />
      )}
      <Stack
        className={disableInternalScroll ? "AddNewRiskForm" : `AddNewRiskForm ${styles.popupBody}`}
        sx={{
          width: "100%",
          ...(disableInternalScroll ? {} : {
            maxHeight: FORM_CONSTANTS.CONTENT_MAX_HEIGHT,
            overflowY: "auto",
            overflowX: "hidden",
          }),
        }}
      >
        {/* Risk Scope & Frameworks Section - Moved to top */}
        <Stack
          sx={{
            width: contentWidth,
            boxSizing: "border-box",
          }}
        >
          <Typography
            sx={{
              fontSize: theme.typography.fontSize,
              mb: 2,
              color: theme.palette.text.tertiary,
              lineHeight: 1.5,
            }}
          >
            Define the scope of this risk by selecting applicable use cases and frameworks.
          </Typography>

          {/* Horizontal layout for Use Cases and Frameworks */}
          <Stack direction="row" sx={{ gap: `${LAYOUT.HORIZONTAL_GAP}px` }}>
            {/* Applicable Use Cases */}
            <Stack sx={{ flex: 1 }}>
              <Typography
                sx={{ fontSize: theme.typography.fontSize, fontWeight: 500, mb: 1 }}
              >
                Applicable use cases
              </Typography>
              <Autocomplete
                multiple
                readOnly={isEditingDisabled}
                id="applicable-projects-input"
                size="small"
                value={
                  projectsLoading || !approvedProjects?.length
                    ? []
                    : approvedProjects
                        .filter((project) => !project.is_organizational)
                        .filter((project) =>
                          riskValues.applicableProjects.includes(project.id)
                        )
                }
                options={
                  approvedProjects?.filter((project) => !project.is_organizational) || []
                }
                getOptionLabel={(project) => project.project_title}
                renderOption={(props, option) => {
                  const { key, ...optionProps } = props;
                  return (
                    <Box key={key} component="li" {...optionProps}>
                      <Typography sx={{
                        fontSize: FORM_STYLES.fontSize,
                        color: theme.palette.text.primary
                      }}>
                        {option.project_title}
                      </Typography>
                    </Box>
                  );
                }}
                popupIcon={<GreyDownArrowIcon size={20} />}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder={
                      projectsLoading || !approvedProjects?.length
                        ? "Loading use cases..."
                        : approvedProjects?.filter((project) => !project.is_organizational && riskValues.applicableProjects.includes(project.id)).length > 0
                        ? ""
                        : "Select applicable use cases"
                    }
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        paddingTop: `${FORM_STYLES.chipPadding} !important`,
                        paddingBottom: `${FORM_STYLES.chipPadding} !important`,
                      },
                      "& ::placeholder": {
                        fontSize: FORM_STYLES.fontSize,
                      },
                    }}
                  />
                )}
                onChange={handleOnMultiselectChange("applicableProjects")}
                sx={{
                  ...getCentralizedAutocompleteStyles(theme, { hasError: !!riskErrors.applicableProjects }),
                  width: "100%",
                  backgroundColor: theme.palette.background.main,
                  "& .MuiChip-root": {
                    borderRadius: "4px",
                    "& .MuiChip-deleteIcon": {
                      display: "flex",
                    },
                  },
                }}
                slotProps={{
                  paper: {
                    sx: {
                      "& .MuiAutocomplete-listbox": {
                        "& .MuiAutocomplete-option": {
                          fontSize: FORM_STYLES.fontSize,
                          color: theme.palette.text.primary,
                          padding: `8px ${FORM_STYLES.padding}`,
                        },
                        "& .MuiAutocomplete-option.Mui-focused": {
                          backgroundColor: theme.palette.background.accent,
                        },
                      },
                      "& .MuiAutocomplete-noOptions": {
                        fontSize: FORM_STYLES.fontSize,
                        paddingLeft: FORM_STYLES.padding,
                        paddingRight: FORM_STYLES.padding,
                      },
                    },
                  },
                }}
                disabled={projectsLoading}
              />
              {riskErrors.applicableProjects && (
                <Typography
                  sx={{
                    color: theme.palette.error.main,
                    fontSize: "12px",
                    mt: 0.5,
                    ml: 1.75,
                  }}
                >
                  {riskErrors.applicableProjects}
                </Typography>
              )}
            </Stack>

            {/* Applicable Frameworks */}
            <Stack sx={{ flex: 1 }}>
              <Typography
                sx={{ fontSize: theme.typography.fontSize, fontWeight: 500, mb: 1 }}
              >
                Applicable frameworks
              </Typography>
              <Autocomplete
                multiple
                readOnly={isEditingDisabled}
                id="applicable-frameworks-input"
                size="small"
                value={
                  frameworksLoading || !frameworks?.length
                    ? []
                    : frameworks
                        .filter((framework) => framework.is_organizational)
                        .filter((framework) =>
                          riskValues.applicableFrameworks.includes(Number(framework.id))
                        )
                }
                options={frameworks?.filter((framework) => framework.is_organizational) || []}
                getOptionLabel={(framework) => framework.name}
                renderOption={(props, option) => {
                  const { key, ...optionProps } = props;
                  return (
                    <Box key={key} component="li" {...optionProps}>
                      <Typography sx={{
                        fontSize: FORM_STYLES.fontSize,
                        color: theme.palette.text.primary
                      }}>
                        {option.name}
                      </Typography>
                    </Box>
                  );
                }}
                popupIcon={<GreyDownArrowIcon size={20} />}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder={
                      frameworksLoading || !frameworks?.length
                        ? "Loading frameworks..."
                        : frameworks?.filter((framework) => framework.is_organizational && riskValues.applicableFrameworks.includes(Number(framework.id))).length > 0
                        ? ""
                        : "Select applicable frameworks"
                    }
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        paddingTop: `${FORM_STYLES.chipPadding} !important`,
                        paddingBottom: `${FORM_STYLES.chipPadding} !important`,
                      },
                      "& ::placeholder": {
                        fontSize: FORM_STYLES.fontSize,
                      },
                    }}
                  />
                )}
                onChange={handleOnMultiselectChange("applicableFrameworks")}
                sx={{
                  ...getCentralizedAutocompleteStyles(theme, { hasError: !!riskErrors.applicableFrameworks }),
                  width: "100%",
                  backgroundColor: theme.palette.background.main,
                  "& .MuiChip-root": {
                    borderRadius: "4px",
                    "& .MuiChip-deleteIcon": {
                      display: "flex",
                    },
                  },
                }}
                slotProps={{
                  paper: {
                    sx: {
                      "& .MuiAutocomplete-listbox": {
                        "& .MuiAutocomplete-option": {
                          fontSize: FORM_STYLES.fontSize,
                          color: theme.palette.text.primary,
                          padding: `8px ${FORM_STYLES.padding}`,
                        },
                        "& .MuiAutocomplete-option.Mui-focused": {
                          backgroundColor: theme.palette.background.accent,
                        },
                      },
                      "& .MuiAutocomplete-noOptions": {
                        fontSize: FORM_STYLES.fontSize,
                        paddingLeft: FORM_STYLES.padding,
                        paddingRight: FORM_STYLES.padding,
                      },
                    },
                  },
                }}
                disabled={frameworksLoading}
              />
              {riskErrors.applicableFrameworks && (
                <Typography
                  sx={{
                    color: theme.palette.error.main,
                    fontSize: "12px",
                    mt: 0.5,
                    ml: 1.75,
                  }}
                >
                  {riskErrors.applicableFrameworks}
                </Typography>
              )}
            </Stack>
          </Stack>
        </Stack>

        <Stack sx={{ width: contentWidth, mt: `${LAYOUT.VERTICAL_GAP}px` }}>
          <Stack sx={{ gap: `${LAYOUT.VERTICAL_GAP}px` }}>
            {/* Row 1 */}
            <Stack sx={formRowStyles}>
              <Field
                id="risk-name-input"
                label="Risk name"
                placeholder="Write risk name"
                value={riskValues.riskName}
                onChange={handleOnTextFieldChange("riskName")}
                isRequired
                error={riskErrors.riskName}
                sx={{
                  width: fieldWidth,
                }}
                disabled={isEditingDisabled}
              />
              <Select
                id="action-owner-input"
                label="Action owner"
                placeholder="Select owner"
                value={
                  usersLoading || !users?.length
                    ? ""
                    : riskValues.actionOwner === 0
                    ? ""
                    : riskValues.actionOwner
                }
                onChange={handleOnSelectChange("actionOwner")}
                items={
                  users?.map((user) => ({
                    _id: user.id,
                    name: `${user.name} ${user.surname}`,
                  })) || []
                }
                // isRequired
                // error={riskErrors.actionOwner}
                sx={{
                  width: fieldWidth,
                }}
                disabled={isEditingDisabled || usersLoading}
              />
              <Select
                id="ai-lifecycle-phase-input"
                label="AI lifecycle phase"
                placeholder="Select phase"
                value={
                  riskValues.aiLifecyclePhase === 0
                    ? ""
                    : riskValues.aiLifecyclePhase
                }
                onChange={handleOnSelectChange("aiLifecyclePhase")}
                items={aiLifecyclePhase}
                isRequired
                error={riskErrors.aiLifecyclePhase}
                sx={{
                  width: fieldWidth,
                }}
                disabled={isEditingDisabled}
              />
            </Stack>

            {/* Row 2 */}
            <Stack sx={formRowStyles}>
              <Field
                id="risk-description-input"
                label="Risk description"
                placeholder="Write risk description"
                value={riskValues.riskDescription}
                onChange={handleOnTextFieldChange("riskDescription")}
                isRequired
                error={riskErrors.riskDescription}
                sx={{
                  width: fieldWidth,
                }}
                disabled={isEditingDisabled}
              />
              <Stack gap={theme.spacing(2)} sx={{ width: fieldWidth }}>
                <Typography
                  sx={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: theme.palette.text.secondary,
                    margin: 0,
                    height: "22px",
                  }}
                >
                  Risk categories *
                </Typography>
                <Autocomplete
                  multiple
                  readOnly={isEditingDisabled}
                  id="risk-categories-input"
                  size="small"
                  value={riskCategoryItems.filter((category) =>
                    riskValues.riskCategory.includes(category._id)
                  )}
                  options={riskCategoryItems}
                  getOptionLabel={(category) => `${category.name}`}
                  renderOption={(props, option) => {
                    const { key, ...optionProps } = props;
                    return (
                      <Box key={key} component="li" {...optionProps}>
                        <Typography sx={{ fontSize: FORM_STYLES.fontSize }}>
                          {option.name}
                        </Typography>
                      </Box>
                    );
                  }}
                  popupIcon={<GreyDownArrowIcon size={20} />}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Select risk categories"
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          paddingTop: `${FORM_STYLES.chipPadding} !important`,
                          paddingBottom: `${FORM_STYLES.chipPadding} !important`,
                        },
                        "& ::placeholder": {
                          fontSize: FORM_STYLES.fontSize,
                        },
                      }}
                    />
                  )}
                  onChange={handleOnMultiselectChange("riskCategory")}
                  sx={{
                    ...getCentralizedAutocompleteStyles(theme, { hasError: !!riskErrors.riskCategory }),
                    width: "100%",
                    backgroundColor: theme.palette.background.main,
                    "& .MuiChip-root": {
                      borderRadius: "4px",
                      "& .MuiChip-deleteIcon": {
                        display:
                          riskValues.riskCategory.length === 1
                            ? "none"
                            : "flex",
                      },
                    },
                  }}
                  slotProps={{
                    paper: {
                      sx: {
                        borderRadius: 2,
                        boxShadow: "0px 4px 24px -4px rgba(16, 24, 40, 0.1)",
                        border: `1px solid ${theme.palette.border?.light}`,
                        "& .MuiAutocomplete-listbox": {
                          "& .MuiAutocomplete-option": {
                            fontSize: FORM_STYLES.fontSize,
                            color: theme.palette.text.primary,
                            padding: `8px ${FORM_STYLES.padding}`,
                            "&:hover": {
                              backgroundColor: theme.palette.background.accent,
                            },
                          },
                          "& .MuiAutocomplete-option.Mui-focused": {
                            backgroundColor: theme.palette.background.accent,
                          },
                        },
                        "& .MuiAutocomplete-noOptions": {
                          fontSize: FORM_STYLES.fontSize,
                          color: theme.palette.text.tertiary,
                          padding: `8px ${FORM_STYLES.padding}`,
                        },
                      },
                    },
                  }}
                />
                {riskErrors.riskCategory && (
                  <Typography
                    sx={{
                      color: theme.palette.error.main,
                      fontSize: "12px",
                      mt: 0.5,
                      ml: 1.75,
                    }}
                  >
                    {riskErrors.riskCategory}
                  </Typography>
                )}
              </Stack>
              <Field
                id="potential-impact-input"
                label="Potential impact"
                placeholder="Describe potential impact"
                value={riskValues.potentialImpact}
                onChange={handleOnTextFieldChange("potentialImpact")}
                isRequired
                error={riskErrors.potentialImpact}
                sx={{
                  width: fieldWidth,
                }}
                disabled={isEditingDisabled}
              />
            </Stack>
          </Stack>
        </Stack>

        <Stack sx={{ gap: `${LAYOUT.HORIZONTAL_GAP}px`, mt: `${LAYOUT.VERTICAL_GAP}px`, width: contentWidth }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: theme.palette.text.primary }}>
            Calculate inherent risk level
          </Typography>
          <Typography sx={{ fontSize: theme.typography.fontSize, color: theme.palette.text.tertiary, lineHeight: 1.5 }}>
            The Risk Level is calculated by multiplying the Likelihood and
            Severity scores. By assigning these scores, the risk level will be
            determined based on your inputs.
          </Typography>
        </Stack>
        <Stack sx={{ mt: `${LAYOUT.VERTICAL_GAP}px`, width: contentWidth }}>
          <Suspense fallback={<div>Loading...</div>}>
            <RiskLevel
              likelihood={riskValues.likelihood}
              riskSeverity={riskValues.riskSeverity}
              handleOnSelectChange={handleOnSelectChange}
              disabled={isEditingDisabled}
            />
          </Suspense>
        </Stack>
        <Stack sx={{ mt: `${LAYOUT.VERTICAL_GAP}px`, width: contentWidth }}>
          <Field
            id="review-notes-input"
            label="Review notes"
            type="description"
            rows={2}
            value={riskValues.reviewNotes}
            onChange={handleOnTextFieldChange("reviewNotes")}
            sx={{
              width: "100%",
              "& #review-notes-input": {
                maxHeight: FORM_CONSTANTS.TEXT_AREA_MAX_HEIGHT,
              },
            }}
            error={riskErrors.reviewNotes}
            disabled={isEditingDisabled}
          />
        </Stack>
      </Stack>
    </Stack>
  );
};

export default RiskSection;
