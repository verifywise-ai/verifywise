// React imports
import { FC, useState, useContext, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

// MUI imports
import {
  Autocomplete,
  Button,
  SelectChangeEvent,
  Stack,
  TextField,
  useTheme,
  Typography,
  CircularProgress,
  Box,
} from "@mui/material";

// Third-party imports
import dayjs, { Dayjs } from "dayjs";

// Internal imports - components
import Field from "../Inputs/Field";
import DatePicker from "../Inputs/Datepicker";
import Select from "../Inputs/Select";

// Internal imports - application layer
import selectValidation from "../../../application/validations/selectValidation";
import { checkStringValidation } from "../../../application/validations/stringValidation";
import {
  createVendorRisk,
  updateVendorRisk,
} from "../../../application/repository/vendorRisk.repository";
import { VerifyWiseContext } from "../../../application/contexts/VerifyWise.context";
import useUsers from "../../../application/hooks/useUsers";
import useFrameworks from "../../../application/hooks/useFrameworks";
import { handleAlert } from "../../../application/tools/alertUtils";

// Internal imports - types
import { AlertProps } from "../../types/alert.types";
import { RiskSectionProps } from "../../../domain/interfaces/i.riskForm";
import { FormValues } from "../../../domain/interfaces/i.form";
import { FormErrors } from "../../types/form.props";
import { Framework } from "../../../domain/types/Framework";

// Types
interface Vendor {
  id: number;
  vendor_name: string;
}

interface User {
  id: number;
  name: string;
}

interface VendorRiskFormData {
  project_id: string | null;
  vendor_name: number;
  risk_name: string;
  owner: number;
  risk_level: string;
  review_date: string;
  frameworks?: number[];
}

interface ApiResponse {
  status: number;
  data?: unknown;
}

// Constants
const VALIDATION_LIMITS = {
  RISK_NAME: { MIN: 1, MAX: 255 },
  DESCRIPTION: { MIN: 1, MAX: 256 },
  REVIEW_DATE: { MIN: 1 },
} as const;

const FORM_CONFIG = {
  FIELD_WIDTH: "350px",
  DATE_PICKER_WIDTH: "130px",
  DATE_INPUT_WIDTH: "85px",
  GRID_COLUMN_GAP: 20,
  GRID_ROW_GAP: 8,
  MARGIN_TOP: 13.5,
  SUBMIT_MARGIN_TOP: "30px",
  DESCRIPTION_MARGIN_TOP: "16px",
} as const;

const HTTP_STATUS = {
  CREATED: 201,
  UPDATED: 202,
} as const;

import Alert from "../Alert";

const INITIAL_FORM_STATE: FormValues = {
  vendorName: 0,
  actionOwner: 0,
  riskName: "",
  reviewDate: "",
  riskDescription: "",
};

// Utility functions
const createVendorOptions = (vendors: Vendor[]) =>
  vendors.map((vendor) => ({
    _id: vendor.id,
    name: vendor.vendor_name,
  }));

const createUserOptions = (users: User[]) =>
  users.map((user) => ({
    _id: user.id,
    name: user.name,
  }));

const formatErrorMessage = (operation: string, error: unknown): string => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return `${errorMessage} occurred while ${operation}.`;
};

const AddNewVendorRiskForm: FC<RiskSectionProps> = ({ closePopup, onSuccess, popupStatus }) => {
  const theme = useTheme();
  const { inputValues, dashboardValues } = useContext(VerifyWiseContext);

  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");

  const [values, setValues] = useState<FormValues>(INITIAL_FORM_STATE);
  const [selectedFrameworks, setSelectedFrameworks] = useState<number[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { users } = useUsers();
  const { allFrameworks: frameworks, loading: frameworksLoading } = useFrameworks({
    listOfFrameworks: [],
  });

  // Memoized options for better performance
  const vendorOptions = useMemo(
    () => createVendorOptions(dashboardValues.vendors as Vendor[]),
    [dashboardValues.vendors],
  );

  const userOptions = useMemo(() => createUserOptions(users as User[]), [users]);

  const organizationalFrameworks = useMemo(
    () => (frameworks || []).filter((fw: Framework) => fw.is_organizational),
    [frameworks],
  );

  // Memoized event handlers for performance
  const handleDateChange = useCallback((newDate: Dayjs | null) => {
    if (newDate?.isValid()) {
      setValues((prevValues) => ({
        ...prevValues,
        reviewDate: newDate ? newDate.toISOString() : "",
      }));
      setErrors((prevErrors: FormErrors) => ({
        ...prevErrors,
        reviewDate: "",
      }));
    }
  }, []);

  const handleOnSelectChange = useCallback(
    (prop: keyof FormValues) => (event: SelectChangeEvent<string | number>) => {
      const value = event.target.value;
      setValues((prevValues) => ({
        ...prevValues,
        [prop]: value,
      }));
      setErrors((prevErrors: FormErrors) => ({
        ...prevErrors,
        [prop]: "",
      }));
    },
    [],
  );

  const handleOnTextFieldChange = useCallback(
    (prop: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setValues((prevValues) => ({
        ...prevValues,
        [prop]: value,
      }));
      setErrors((prevErrors: FormErrors) => ({
        ...prevErrors,
        [prop]: "",
      }));
    },
    [],
  );

  const handleFrameworkChange = useCallback(
    (_event: React.SyntheticEvent, newValue: Framework[]) => {
      setSelectedFrameworks(newValue.map((fw) => Number(fw.id)));
    },
    [],
  );

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    // Risk name validation
    const riskName = checkStringValidation(
      "Risk name",
      values.riskName,
      VALIDATION_LIMITS.RISK_NAME.MIN,
      VALIDATION_LIMITS.RISK_NAME.MAX,
    );
    if (!riskName.accepted) {
      newErrors.riskName = riskName.message;
    }

    // Risk description validation
    const riskDescription = checkStringValidation(
      "Risk description",
      values.riskDescription,
      VALIDATION_LIMITS.DESCRIPTION.MIN,
      VALIDATION_LIMITS.DESCRIPTION.MAX,
    );
    if (!riskDescription.accepted) {
      newErrors.riskDescription = riskDescription.message;
    }

    // Review date validation
    const reviewDate = checkStringValidation(
      "Review date",
      values.reviewDate,
      VALIDATION_LIMITS.REVIEW_DATE.MIN,
    );
    if (!reviewDate.accepted) {
      newErrors.reviewDate = reviewDate.message;
    }

    // Vendor name validation
    const vendorName = selectValidation("Vendor name", values.vendorName);
    if (!vendorName.accepted) {
      newErrors.vendorName = vendorName.message;
    }

    // Action owner validation
    const actionOwner = selectValidation("Action owner", values.actionOwner);
    if (!actionOwner.accepted) {
      newErrors.actionOwner = actionOwner.message;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [values]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!validateForm()) {
        return;
      }

      setIsSubmitting(true);

      try {
        const formData: VendorRiskFormData = {
          project_id: projectId,
          vendor_name: values.vendorName,
          risk_name: values.riskName,
          owner: values.actionOwner,
          risk_level: "High Risk", // TODO: Make this dynamic
          review_date: values.reviewDate,
          frameworks: selectedFrameworks,
        };

        let response: ApiResponse;

        if (popupStatus === "edit") {
          // Update existing risk
          response = await updateVendorRisk({
            id: Number(inputValues.id),
            body: formData,
          });

          if (response.status === HTTP_STATUS.UPDATED) {
            onSuccess?.();
            closePopup();
            setValues(INITIAL_FORM_STATE);
            setSelectedFrameworks([]);
          } else {
            handleAlert({
              variant: "error",
              body: "Failed to update the vendor risk. Please try again.",
              setAlert,
            });
          }
        } else {
          // Create new risk
          response = await createVendorRisk({ body: formData });

          if (response.status === HTTP_STATUS.CREATED) {
            onSuccess?.();
            closePopup();
            setValues(INITIAL_FORM_STATE);
            setSelectedFrameworks([]);
          } else {
            handleAlert({
              variant: "error",
              body: "Failed to create the vendor risk. Please try again.",
              setAlert,
            });
          }
        }
      } catch (error) {
        const operation = popupStatus === "edit" ? "updating" : "creating";
        handleAlert({
          variant: "error",
          body: formatErrorMessage(`${operation} the vendor risk`, error),
          setAlert,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      validateForm,
      popupStatus,
      projectId,
      values,
      selectedFrameworks,
      inputValues.id,
      onSuccess,
      closePopup,
    ],
  );

  // Memoized styles for performance
  const fieldStyle = useMemo(
    () => ({
      "backgroundColor": theme.palette.background.main,
      "& input": {
        padding: "0 14px",
      },
    }),
    [theme.palette.background.main],
  );

  const gridStyle = useMemo(
    () => ({
      display: "grid",
      gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
      columnGap: FORM_CONFIG.GRID_COLUMN_GAP,
      rowGap: FORM_CONFIG.GRID_ROW_GAP,
      mt: FORM_CONFIG.MARGIN_TOP,
    }),
    [],
  );

  const submitButtonStyle = useMemo(
    () => ({
      "borderRadius": theme.spacing(1),
      "maxHeight": 34,
      "textTransform": "none" as const,
      "backgroundColor": theme.palette.primary.main,
      "boxShadow": "none",
      "ml": "auto",
      "mr": 0,
      "mt": FORM_CONFIG.SUBMIT_MARGIN_TOP,
      "minWidth": 100,
      "&:hover": {
        boxShadow: "none",
        backgroundColor: theme.palette.primary.dark,
      },
      "&:disabled": {
        backgroundColor: theme.palette.action.disabledBackground,
      },
    }),
    [theme],
  );

  // Initialize form values for edit mode
  useEffect(() => {
    if (popupStatus === "edit" && inputValues) {
      const currentRiskData: FormValues = {
        ...INITIAL_FORM_STATE,
        riskName: inputValues.risk_name || "",
        reviewDate:
          inputValues.review_date &&
          (typeof inputValues.review_date === "string" || inputValues.review_date instanceof Date)
            ? dayjs(inputValues.review_date).toISOString()
            : "",
        vendorName: parseInt(String(inputValues.vendor_name)) || 0,
        actionOwner: parseInt(String(inputValues.owner)) || 0,
        riskDescription: inputValues.risk_description || "",
      };
      setValues(currentRiskData);

      // Pre-populate frameworks in edit mode
      if (Array.isArray(inputValues.frameworks)) {
        setSelectedFrameworks(inputValues.frameworks.map(Number));
      } else if (Array.isArray(inputValues.framework_ids)) {
        setSelectedFrameworks(inputValues.framework_ids.map(Number));
      } else {
        setSelectedFrameworks([]);
      }
    } else if (popupStatus === "new") {
      // Reset form for new entries
      setValues(INITIAL_FORM_STATE);
      setSelectedFrameworks([]);
      setErrors({});
    }
  }, [popupStatus, inputValues]);

  // Reset alert when component unmounts or popup closes
  useEffect(() => {
    return () => {
      setAlert(null);
    };
  }, []);

  // Early return for loading state or no vendors
  if (dashboardValues.vendors.length === 0) {
    return (
      <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
        <Typography color="text.secondary">
          No vendors available. Please create a vendor first to add vendor risks.
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack role="main" aria-label="Vendor risk form">
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
        component="form"
        onSubmit={handleSubmit}
        noValidate
        aria-label={`${popupStatus === "new" ? "Create" : "Edit"} vendor risk`}
      >
        <Stack sx={gridStyle}>
          <Select
            id="vendor-name-input"
            label="Vendor name"
            placeholder="Select vendor"
            value={values.vendorName === 0 ? "" : values.vendorName}
            onChange={handleOnSelectChange("vendorName")}
            items={vendorOptions}
            sx={{
              width: { xs: "100%", md: FORM_CONFIG.FIELD_WIDTH },
              backgroundColor: theme.palette.background.main,
            }}
            error={errors.vendorName}
            isRequired
            aria-describedby={errors.vendorName ? "vendor-name-error" : undefined}
          />
          <Select
            id="action-owner-input"
            label="Action owner"
            placeholder="Select owner"
            value={values.actionOwner === 0 ? "" : values.actionOwner}
            onChange={handleOnSelectChange("actionOwner")}
            items={userOptions}
            sx={{
              width: { xs: "100%", md: FORM_CONFIG.FIELD_WIDTH },
              backgroundColor: theme.palette.background.main,
            }}
            error={errors.actionOwner}
            isRequired
            aria-describedby={errors.actionOwner ? "action-owner-error" : undefined}
          />
          <Field
            id="risk-name-input"
            label="Risk name"
            placeholder="Enter the risk name"
            width={FORM_CONFIG.FIELD_WIDTH}
            value={values.riskName}
            onChange={handleOnTextFieldChange("riskName")}
            error={errors.riskName}
            sx={{
              ...fieldStyle,
              width: { xs: "100%", md: FORM_CONFIG.FIELD_WIDTH },
            }}
            isRequired
          />
          <DatePicker
            label="Review date"
            date={values.reviewDate ? dayjs(values.reviewDate) : null}
            handleDateChange={handleDateChange}
            sx={{
              "width": { xs: "100%", md: FORM_CONFIG.DATE_PICKER_WIDTH },
              "& input": {
                width: { xs: "100%", md: FORM_CONFIG.DATE_INPUT_WIDTH },
              },
            }}
            isRequired
            error={errors.reviewDate}
            aria-label="Select review date"
          />
        </Stack>

        {/* Framework multi-select */}
        <Stack sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: theme.typography.fontSize, fontWeight: 500, mb: 1 }}>
            Applicable frameworks
          </Typography>
          <Autocomplete
            multiple
            id="applicable-frameworks-input"
            size="small"
            value={
              frameworksLoading || !organizationalFrameworks.length
                ? []
                : organizationalFrameworks.filter((fw) =>
                    selectedFrameworks.includes(Number(fw.id)),
                  )
            }
            options={organizationalFrameworks}
            getOptionLabel={(fw) => fw.name}
            renderOption={(props, option) => {
              const { key, ...optionProps } = props;
              return (
                <Box key={key} component="li" {...optionProps}>
                  <Typography
                    sx={{
                      fontSize: theme.typography.fontSize,
                      color: theme.palette.text.primary,
                    }}
                  >
                    {option.name}
                  </Typography>
                </Box>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={
                  frameworksLoading
                    ? "Loading frameworks..."
                    : selectedFrameworks.length > 0
                      ? ""
                      : "Select applicable frameworks"
                }
                sx={{
                  "& .MuiOutlinedInput-root": {
                    paddingTop: "4px !important",
                    paddingBottom: "4px !important",
                  },
                  "& ::placeholder": {
                    fontSize: theme.typography.fontSize,
                  },
                }}
              />
            )}
            onChange={handleFrameworkChange}
            sx={{
              "width": "100%",
              "backgroundColor": theme.palette.background.main,
              "& .MuiChip-root": {
                borderRadius: "4px",
              },
            }}
            disabled={frameworksLoading}
          />
        </Stack>

        <Stack sx={{ marginTop: FORM_CONFIG.DESCRIPTION_MARGIN_TOP }}>
          <Field
            id="risk-description-input"
            label="Risk description"
            type="description"
            value={values.riskDescription}
            onChange={handleOnTextFieldChange("riskDescription")}
            sx={{ backgroundColor: theme.palette.background.main }}
            isRequired
            error={errors.riskDescription}
          />
        </Stack>
        <Button
          type="submit"
          variant="contained"
          disableRipple={theme.components?.MuiButton?.defaultProps?.disableRipple}
          disabled={isSubmitting}
          sx={submitButtonStyle}
          aria-label={`${popupStatus === "new" ? "Save" : "Update"} vendor risk`}
        >
          {isSubmitting ? (
            <Stack direction="row" alignItems="center" spacing={1}>
              <CircularProgress size={16} color="inherit" />
              <Typography variant="body2">
                {popupStatus === "new" ? "Saving..." : "Updating..."}
              </Typography>
            </Stack>
          ) : (
            <Typography variant="body2">{popupStatus === "new" ? "Save" : "Update"}</Typography>
          )}
        </Button>
      </Stack>
    </Stack>
  );
};

export default AddNewVendorRiskForm;
