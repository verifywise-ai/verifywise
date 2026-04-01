/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Component for adding or editing a vendor through a modal interface.
 *
 * @component
 * @param {AddNewVendorProps} props - The properties for the AddNewVendor component.
 * @param {boolean} props.isOpen - Determines if the modal is open.
 * @param {(isOpen: boolean) => void} props.setIsOpen - Function to set the modal open state.
 * @param {() => void} props.onSuccess - Callback on successful save.
 * @param {VendorModel} [props.existingVendor] - Existing vendor data for edit mode.
 * @param {() => void} [props.onChange] - Optional callback on change.
 *
 * @returns {JSX.Element} The rendered AddNewVendor component.
 */

import TabContext from "@mui/lab/TabContext";
import {
  Autocomplete,
  AutocompleteRenderInputParams,
  Box,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import Field from "../../Inputs/Field";
import Select from "../../Inputs/Select";
import DatePicker from "../../Inputs/Datepicker";
import { ChevronDown, ChevronUp } from "lucide-react";
import { HistorySidebar } from "../../Common/HistorySidebar";
import { useEntityChangeHistory } from "../../../../application/hooks/useEntityChangeHistory";
import { useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useMemo, useState } from "react";
import dayjs, { Dayjs } from "dayjs";
import Alert from "../../Alert";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import { useAuth } from "../../../../application/hooks/useAuth";
import { useProjects } from "../../../../application/hooks/useProjects";
import useUsers from "../../../../application/hooks/useUsers";
import CustomizableToast from "../../Toast";
import { logEngine } from "../../../../application/tools/log.engine";
import StandardModal from "../StandardModal";
import TabBar from "../../TabBar";
import { EnhancedTooltip } from "../../EnhancedTooltip";
import allowedRoles from "../../../../application/constants/permissions";
import {
  useCreateVendor,
  useUpdateVendor,
} from "../../../../application/hooks/useVendors";
import { useModalKeyHandling } from "../../../../application/hooks/useModalKeyHandling";
import { User } from "../../../../domain/types/User";
import { AddNewVendorProps, VendorFormErrors } from "../../../../domain/interfaces/i.vendor";
import { getAutocompleteStyles } from "../../../utils/inputStyles";
import { 
  DataSensitivity,
  BusinessCriticality,
  PastIssues,
  RegulatoryExposure
} from "../../../../domain/enums/status.enum";
import { calculateVendorRiskScore, getRiskScoreColor } from "../../../../domain/utils/vendorScorecard.utils";

const initialState = {
  vendorName: "",
  website: "",
  projectIds: [] as number[],
  vendorProvides: "",
  vendorContactPerson: "",
  reviewStatus: "",
  reviewer: null as number | null,
  reviewResult: "",
  assignee: null as number | null,
  reviewDate: new Date().toISOString(),
  // Scorecard fields
  dataSensitivity: "",
  businessCriticality: "",
  pastIssues: "",
  regulatoryExposure: "",
};

const REVIEW_STATUS_OPTIONS = [
  { _id: "notStarted", name: "Not started" },
  { _id: "inReview", name: "In review" },
  { _id: "reviewed", name: "Reviewed" },
  { _id: "requiresFollowUp", name: "Requires follow-up" },
];

const DATA_SENSITIVITY_OPTIONS = [
  { _id: DataSensitivity.None, name: "None" },
  { _id: DataSensitivity.InternalOnly, name: "Internal only" },
  { _id: DataSensitivity.PII, name: "Personally identifiable information (PII)" },
  { _id: DataSensitivity.FinancialData, name: "Financial data" },
  { _id: DataSensitivity.HealthData, name: "Health data (e.g. HIPAA)" },
  { _id: DataSensitivity.ModelWeights, name: "Model weights or AI assets" },
  { _id: DataSensitivity.OtherSensitive, name: "Other sensitive data" },
];

const BUSINESS_CRITICALITY_OPTIONS = [
  { _id: BusinessCriticality.Low, name: "Low (vendor supports non-core functions)" },
  { _id: BusinessCriticality.Medium, name: "Medium (affects operations but is replaceable)" },
  { _id: BusinessCriticality.High, name: "High (critical to core services or products)" },
];

const PAST_ISSUES_OPTIONS = [
  { _id: PastIssues.None, name: "None" },
  { _id: PastIssues.MinorIncident, name: "Minor incident (e.g. small delay, minor bug)" },
  { _id: PastIssues.MajorIncident, name: "Major incident (e.g. data breach, legal issue)" },
];

const REGULATORY_EXPOSURE_OPTIONS = [
  { _id: RegulatoryExposure.None, name: "None" },
  { _id: RegulatoryExposure.GDPR, name: "GDPR (EU)" },
  { _id: RegulatoryExposure.HIPAA, name: "HIPAA (US)" },
  { _id: RegulatoryExposure.SOC2, name: "SOC 2" },
  { _id: RegulatoryExposure.ISO27001, name: "ISO 27001" },
  { _id: RegulatoryExposure.EUAIAct, name: "EU AI act" },
  { _id: RegulatoryExposure.CCPA, name: "CCPA (california)" },
  { _id: RegulatoryExposure.Other, name: "Other" },
];

const AddNewVendor: React.FC<AddNewVendorProps> = ({
  isOpen,
  setIsOpen,
  onSuccess,
  existingVendor,
  onChange = () => {},
}) => {
  const theme = useTheme();
  const [values, setValues] = useState(initialState);
  const [errors, setErrors] = useState<VendorFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false); // Track if projects are loaded
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);
  const [projectOptions, setProjectOptions] = useState<
    { _id: number; name: string }[]
  >([]);
  const [isScorecardExpanded, setIsScorecardExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const { userRoleName } = useAuth();
  const { users } = useUsers();
  const { approvedProjects } = useProjects();
  const queryClient = useQueryClient();

  // TanStack Query hooks
  const createVendorMutation = useCreateVendor();
  const updateVendorMutation = useUpdateVendor();

  // Prefetch history data when modal opens in edit mode
  useEntityChangeHistory(
    "vendor",
    existingVendor?.id
  );

  const isEditingDisabled = !allowedRoles.vendors.edit.includes(userRoleName);

  const formattedUsers = users?.map((user: User) => ({
    _id: user.id,
    name: `${user.name} ${user.surname}`,
  }));

  const formattedProjects = useMemo(() => {
    return Array.isArray(approvedProjects)
      ? approvedProjects.map((project: any) => ({
          _id: project.id,
          name: project.project_title,
        }))
      : [];
  }, [approvedProjects]);

  useEffect(() => {
    if (!isOpen) {
      setValues(initialState);
      setErrors({} as VendorFormErrors);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !projectsLoaded) {
      setProjectOptions(formattedProjects);
      setProjectsLoaded(true);
    }
  }, [isOpen, projectsLoaded, formattedProjects]);

  useEffect(() => {
    if (isOpen && !existingVendor) {
      setValues(initialState);
    }
    if (existingVendor) {
      setValues((prevValues) => ({
        ...prevValues,
        vendorName: existingVendor.vendor_name,
        website: existingVendor.website,
        projectIds: existingVendor.projects || [],
        vendorProvides: existingVendor.vendor_provides,
        vendorContactPerson: existingVendor.vendor_contact_person,
        reviewStatus:
          REVIEW_STATUS_OPTIONS?.find(
            (s) => s.name === existingVendor.review_status
          )?._id || "",
        reviewer: existingVendor.reviewer || null,
        reviewResult: existingVendor.review_result,
        assignee: existingVendor.assignee || null,
        reviewDate: existingVendor.review_date && dayjs(existingVendor.review_date).isValid()
          ? dayjs(existingVendor.review_date).toISOString()
          : "",
        dataSensitivity: existingVendor.data_sensitivity || "",
        businessCriticality: existingVendor.business_criticality || "",
        pastIssues: existingVendor.past_issues || "",
        regulatoryExposure: existingVendor.regulatory_exposure || "",
      }));
      // Expand scorecard if any scorecard fields have values
      if (existingVendor.data_sensitivity || existingVendor.business_criticality || 
          existingVendor.past_issues || existingVendor.regulatory_exposure) {
        setIsScorecardExpanded(true);
      }
    }
  }, [existingVendor]);

  // ESC key handling and focus trapping
  useModalKeyHandling({
    isOpen,
    onClose: () => setIsOpen(false)
  });

  /**
   * Opens the confirmation modal if form validation passes
   */
  const handleSave = () => {
    if (validateForm()) {
      handleOnSave();
    }
  };

  /**
   * Updates the review date in the vendor details
   * @param newDate - The new date value or null
   */
  const handleDateChange = (newDate: Dayjs | null) => {
    if (newDate?.isValid()) {
      setValues((prevValues) => ({
        ...prevValues,
        reviewDate: newDate && newDate.isValid() ? newDate.toISOString() : "",
      }));
    }
  };

  /**
   * Generic change handler for form fields
   * @param section - The section of the form (vendorDetails or risks)
   * @param field - The field name to update
   * @param value - The new value
   */
  const handleOnChange = (field: string, value: string | number | number[]) => {
    setValues((prevValues) => ({
      ...prevValues,
      [field]: value,
    }));
    setErrors({ ...errors, [field]: "" });
  };

  /**
   * Validates all required fields in the form
   * @returns boolean indicating if form is valid
   */
  const validateForm = (): boolean => {
    const newErrors: VendorFormErrors = {};
    const vendorName = checkStringValidation(
      "Vendor Name",
      values.vendorName,
      1,
      64
    );
    if (!vendorName.accepted) {
      newErrors.vendorName = vendorName.message;
    }
    const vendorWebsite = checkStringValidation(
      "Vendor Website",
      values.website,
      1,
      64
    );
    if (!vendorWebsite.accepted) {
      newErrors.website = vendorWebsite.message;
    }
    // Review result is now optional
    if (values.reviewResult) {
      const vendorReviewResult = checkStringValidation(
        "Vendor review result",
        values.reviewResult,
        1,
        256
      );
      if (!vendorReviewResult.accepted) {
        newErrors.reviewResult = vendorReviewResult.message;
      }
    }
    if (
      !values.projectIds ||
      Number(values.projectIds.length) === 0
    ) {
      newErrors.projectIds = "Please select a use case from the dropdown";
    }
    const vendorProvides = checkStringValidation(
      "Vendor Provides",
      values.vendorProvides,
      1,
      256
    );
    if (!vendorProvides.accepted) {
      newErrors.vendorProvides = vendorProvides.message;
    }
    const vendorContactPerson = checkStringValidation(
      "Vendor Contact Person",
      values.vendorContactPerson,
      1,
      64,
      undefined,
      undefined,
      undefined,
      undefined,
      "contactPerson" //
    );
    if (!vendorContactPerson.accepted) {
      newErrors.vendorContactPerson = vendorContactPerson.message;
    }
    // Review status, reviewer, and review date are now optional
    if (values.assignee === null) {
      newErrors.assignee = "Please select an assignee from the dropdown";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handles the final save operation after confirmation
   * Creates new vendor or updates existing one
   */
  const handleOnSave = async () => {
     // Ensure website starts with http:// or https://
    let formattedWebsite = values.website?.trim() || "";
    if (
      formattedWebsite &&
      !/^https?:\/\//i.test(formattedWebsite)
    ) {
      formattedWebsite = `http://${formattedWebsite}`;
    }
    // Calculate risk score if any scorecard fields are provided
    const riskScore = (values.dataSensitivity || values.businessCriticality || values.pastIssues || values.regulatoryExposure) 
      ? calculateVendorRiskScore({
          data_sensitivity: values.dataSensitivity || undefined,
          business_criticality: values.businessCriticality || undefined,
          past_issues: values.pastIssues || undefined,
          regulatory_exposure: values.regulatoryExposure || undefined,
        })
      : undefined;

    const _vendorDetails = {
      projects: values.projectIds,
      vendor_name: values.vendorName,
      assignee: values.assignee ?? undefined,
      vendor_provides: values.vendorProvides,
      website: formattedWebsite,
      vendor_contact_person: values.vendorContactPerson,
      review_result: values.reviewResult,
      review_status:
        REVIEW_STATUS_OPTIONS?.find(
          (s) => s._id === values.reviewStatus
        )?.name || "",
      reviewer: values.reviewer ?? undefined,
      review_date: values.reviewDate,
      // Scorecard fields
      data_sensitivity: values.dataSensitivity || undefined,
      business_criticality: values.businessCriticality || undefined,
      past_issues: values.pastIssues || undefined,
      regulatory_exposure: values.regulatoryExposure || undefined,
      risk_score: riskScore,
    };
    if (existingVendor) {
      await updateVendor(existingVendor.id!, _vendorDetails);
    } else {
      await createVendor(_vendorDetails);
    }
  };

  /**
   * Creates a new vendor in the system
   * @param vendorDetails - The vendor details to create
   */
  const createVendor = async (vendorDetails: object) => {
    setIsSubmitting(true);
    try {
      const response = await createVendorMutation.mutateAsync(vendorDetails);

      if (response.status === 201) {
        setAlert({
          variant: "success",
          body: "Vendor created successfully",
        });
        setTimeout(() => setAlert(null), 3000);
        onSuccess();
        setIsOpen(false);
      } else {
        setAlert({
          variant: "error",
          body: response.data?.data?.message || "An error occurred.",
        });
        setTimeout(() => {
          setAlert(null);
          onChange();
        }, 3000);
      }
    } catch (error) {
      logEngine({
        type: "error",
        message: "Unexpected response. Please try again.",
      });

      setAlert({
        variant: "error",
        body: `An error occurred: ${
          (error as Error).message || "Please try again."
        }`,
      });

      setTimeout(() => setAlert(null), 3000);
    } finally {
      setIsSubmitting(false);
      setValues(initialState);
    }
  };

  /**
   * Updates an existing vendor in the system
   * @param vendorId - The ID of the vendor to update
   * @param updatedVendorDetails - The new vendor details
   */
  const updateVendor = async (
    vendorId: number,
    updatedVendorDetails: object
  ) => {
    setIsSubmitting(true);
    try {
      const response = await updateVendorMutation.mutateAsync({
        id: vendorId,
        data: updatedVendorDetails,
      });

      if (response.status === 202) {
        setAlert({
          variant: "success",
          body: "Vendor updated successfully",
        });
        setTimeout(() => setAlert(null), 3000);
        onSuccess();
        setIsOpen(false);
      } else {
        setAlert({
          variant: "error",
          body: response.data?.data?.message || "An error occurred.",
        });
        setTimeout(() => setAlert(null), 3000);
      }
    } catch (error) {
      logEngine({
        type: "error",
        message: "Unexpected response. Please try again.",
      });
      setAlert({
        variant: "error",
        body: `An error occurred: ${
          (error as Error).message || "Please try again."
        }`,
      });

      setTimeout(() => setAlert(null), 3000);
    } finally {
      setIsSubmitting(false);
      setValues(initialState);
    }
  };

  const vendorDetailsPanel = (
      <Stack spacing={6}>
      <Stack
        direction={"row"}
        spacing={6}
      >
        <Field // vendorName
          label="Vendor name"
          width={220}
          value={values?.vendorName}
          onChange={(e) => handleOnChange("vendorName", e.target.value)}
          error={errors.vendorName}
          isRequired
          disabled={isEditingDisabled}
        />
        <Stack sx={{ width: 454 }}>
          <Typography
            sx={{
              fontSize: theme.typography.fontSize,
              fontWeight: 500,
              mb: 2,
            }}
          >
            Use cases*
          </Typography>
          <Autocomplete
            multiple
            id="projects-input"
            size="small"
            disabled={isEditingDisabled}
            value={
              projectOptions?.filter((project) =>
                values.projectIds?.includes(project._id)
              ) || []
            }
            options={projectOptions || []}
            noOptionsText={
              values?.projectIds?.length ===
              projectOptions?.length
                ? "All use cases are selected"
                : "No options"
            }
            onChange={(_event, newValue: { _id: number; name: string }[]) => {
              handleOnChange(
                "projectIds",
                newValue.map((project) => project._id)
              );
            }}
            getOptionLabel={(project: { _id: number; name: string }) =>
              project.name
            }
            renderOption={(props, option: { _id: number; name: string }) => {
              const { key, ...optionProps } = props;
              return (
                <Box key={`${option._id}-${key}`} component="li" {...optionProps}>
                  <Typography sx={{ fontSize: "13px" }}>
                    {option.name}
                  </Typography>
                </Box>
              );
            }}
            filterSelectedOptions
            popupIcon={<ChevronDown size={16} />}
            renderInput={(params: AutocompleteRenderInputParams) => (
              <TextField
                {...params}
                placeholder="Select use cases"
                required
                sx={{
                  "& .MuiOutlinedInput-root": {
                    minHeight: "34px",
                    height: "auto",
                    alignItems: "flex-start",
                    paddingY: "3px !important",
                    flexWrap: "wrap",
                    gap: "2px",
                  },
                  "& ::placeholder": {
                    fontSize: "13px",
                  },
                }}
              />
            )}
            sx={{
              ...getAutocompleteStyles(theme, { hasError: !!errors.projectIds }),
              width: "100%",
              backgroundColor: theme.palette.background.main,
              "& .MuiOutlinedInput-root": {
                ...getAutocompleteStyles(theme, { hasError: !!errors.projectIds })["& .MuiOutlinedInput-root"],
                borderRadius: "3px",
                overflowY: "auto",
                flexWrap: "wrap",
                maxHeight: "115px",
                alignItems: "flex-start",
              },
              "& .MuiAutocomplete-tag": {
                margin: "2px",
                maxWidth: "calc(100% - 25px)",
                "& .MuiChip-label": {
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                },
              },
              "& .MuiChip-root": {
                borderRadius: "4px",
              },
              borderRadius: "3px",
            }}
            slotProps={{
              paper: {
                sx: {
                  "& .MuiAutocomplete-listbox": {
                    "& .MuiAutocomplete-option": {
                      fontSize: "13px",
                      color: "#1c2130",
                      paddingLeft: "9px",
                      paddingRight: "9px",
                    },
                    "& .MuiAutocomplete-option.Mui-focused": {
                      background: "background.accent",
                    },
                  },
                  "& .MuiAutocomplete-noOptions": {
                    fontSize: "13px",
                    paddingLeft: "9px",
                    paddingRight: "9px",
                  },
                },
              },
            }}
          />
          {errors.projectIds && (
            <Typography
              color="error"
              variant="caption"
              sx={{ mt: 0.5, ml: 1, color: "#f04438", opacity: 0.8 }}
            >
              {errors.projectIds}
            </Typography>
          )}
        </Stack>
      </Stack>
      <Stack
        direction={"row"}
        spacing={6}
      >
        <Field // website
          label="Website"
          width={220}
          value={values.website}
          onChange={(e) => handleOnChange("website", e.target.value)}
          error={errors.website}
          isRequired
          disabled={isEditingDisabled}
          placeholder="Enter vendor website"
        />
        <Field // vendorContactPerson
          label="Vendor contact person"
          width={220}
          value={values.vendorContactPerson}
          onChange={(e) =>
            handleOnChange("vendorContactPerson", e.target.value)
          }
          error={errors.vendorContactPerson}
          isRequired
          disabled={isEditingDisabled}
        />
        <Select // assignee (not in the server model!)
          items={formattedUsers}
          label="Assignee"
          placeholder="Select person"
          isHidden={false}
          id=""
          onChange={(e) => handleOnChange("assignee", Number(e.target.value))}
          value={values.assignee !== null ? values.assignee : ""}
          sx={{
            width: 220,
          }}
          error={errors.assignee}
          isRequired
          disabled={isEditingDisabled}
        />
      </Stack>
      <Field // vendorProvides
        label="What does the vendor provide?"
        width={686}
        type="description"
        value={values.vendorProvides}
        onChange={(e) => handleOnChange("vendorProvides", e.target.value)}
        error={errors.vendorProvides}
        isRequired
        disabled={isEditingDisabled}
        placeholder="Describe the products or services this vendor delivers (e.g., cloud hosting, legal advisory, AI APIs)."
        rows={2}
      />
      <Stack
        direction={"row"}
        spacing={6}
      >
        <Select // reviewStatus
          items={REVIEW_STATUS_OPTIONS}
          label="Review status"
          placeholder="Select review status"
          isHidden={false}
          id=""
          onChange={(e) => handleOnChange("reviewStatus", e.target.value)}
          value={values.reviewStatus}
          sx={{
            width: 220,
          }}
          error={errors.reviewStatus}
          disabled={isEditingDisabled}
        />
        <Select // reviewer
          items={formattedUsers}
          label="Reviewer"
          placeholder="Select reviewer"
          isHidden={false}
          id=""
          onChange={(e) => handleOnChange("reviewer", Number(e.target.value))}
          value={values.reviewer !== null ? values.reviewer : ""}
          error={errors.reviewer}
          sx={{
            width: 220,
          }}
          disabled={isEditingDisabled}
        />
        <Stack sx={{ width: 220 }}>
          <DatePicker // reviewDate
            label="Review date"
            sx={{
              width: "100%",
            }}
            date={
              values.reviewDate
                ? dayjs(values.reviewDate)
                : dayjs(new Date())
            }
            handleDateChange={handleDateChange}
            disabled={isEditingDisabled}
          />
        </Stack>
      </Stack>
      <Field // reviewResult
        label="Review result"
        width={686}
        type="description"
        value={values.reviewResult}
        error={errors.reviewResult}
        onChange={(e) => handleOnChange("reviewResult", e.target.value)}
        disabled={isEditingDisabled}
        placeholder="Summarize the outcome of the review (e.g., approved, rejected, pending more info, or risk concerns identified)."
        rows={2}
      />
      
      {/* Vendor Scorecard Section */}
      <Stack spacing={2} sx={{ width: 686 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            padding: theme.spacing(2),
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: "4px",
            backgroundColor: theme.palette.grey[50],
            "&:hover": {
              backgroundColor: theme.palette.grey[100],
            },
          }}
          onClick={() => setIsScorecardExpanded(!isScorecardExpanded)}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Vendor scorecard (advanced)
            </Typography>
            <EnhancedTooltip
              title="Vendor Risk Score Calculation"
              content={
                <>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "rgba(255, 255, 255, 0.85)",
                      fontSize: "13px",
                      lineHeight: 1.6,
                      mb: 2,
                    }}
                  >
                    The risk score is calculated using a weighted formula:
                  </Typography>
                  <Box
                    sx={{
                      backgroundColor: "rgba(255, 255, 255, 0.05)",
                      borderRadius: "4px",
                      padding: "12px",
                      mb: 2,
                      fontFamily: "monospace",
                    }}
                  >
                    <Typography
                      sx={{
                        color: "#16C784",
                        fontSize: "12px",
                        lineHeight: 1.8,
                      }}
                    >
                      Risk Score = <br />
                      &nbsp;&nbsp;(Data Sensitivity × 30%) +<br />
                      &nbsp;&nbsp;(Business Criticality × 30%) +<br />
                      &nbsp;&nbsp;(Past Issues × 20%) +<br />
                      &nbsp;&nbsp;(Regulatory Exposure × 20%)
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "rgba(255, 255, 255, 0.7)",
                      fontSize: "12px",
                      lineHeight: 1.5,
                    }}
                  >
                    Each factor is normalized to a 0-1 scale before applying weights. The final score ranges from 0% (lowest risk) to 100% (highest risk).
                  </Typography>
                </>
              }
            >
              <Typography
                component="span"
                onClick={(e) => e.stopPropagation()}
                sx={{
                  fontSize: "12px",
                  color: theme.palette.primary.main,
                  cursor: "pointer",
                  textDecoration: "underline",
                  ml: "auto",
                  mr: 2,
                  "&:hover": {
                    color: theme.palette.primary.dark,
                  },
                }}
              >
                How is this calculated?
              </Typography>
            </EnhancedTooltip>
            {(values.dataSensitivity || values.businessCriticality || values.pastIssues || values.regulatoryExposure) && (() => {
              const riskScore = calculateVendorRiskScore({
                data_sensitivity: values.dataSensitivity || undefined,
                business_criticality: values.businessCriticality || undefined,
                past_issues: values.pastIssues || undefined,
                regulatory_exposure: values.regulatoryExposure || undefined,
              });
              const riskColor = getRiskScoreColor(riskScore);
              
              return (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    padding: "4px 8px",
                    borderRadius: "4px",
                    backgroundColor: `${riskColor}20`,
                    border: `1px solid ${riskColor}`,
                    minWidth: "50px",
                  }}
                >
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: riskColor,
                    }}
                  />
                  <Typography variant="body2" sx={{ fontSize: "11px", fontWeight: 500, color: riskColor }}>
                    {riskScore}%
                  </Typography>
                </Box>
              );
            })()}
          </Box>
          {isScorecardExpanded ? (
            <ChevronUp size={16} style={{ color: theme.palette.text.tertiary }} />
          ) : (
            <ChevronDown size={16} style={{ color: theme.palette.text.tertiary }} />
          )}
        </Box>
        
        {isScorecardExpanded && (
          <Stack spacing={6}>
            <Stack direction="row" spacing={6}>
              <Box sx={{ flex: 1 }}>
                <Select
                  items={DATA_SENSITIVITY_OPTIONS}
                  label="Data sensitivity"
                  placeholder="Select data sensitivity level"
                  isHidden={false}
                  id="dataSensitivity"
                  onChange={(e) => handleOnChange("dataSensitivity", e.target.value)}
                  value={values.dataSensitivity}
                  sx={{ width: "100%" }}
                  error={errors.dataSensitivity}
                  disabled={isEditingDisabled}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Select
                  items={BUSINESS_CRITICALITY_OPTIONS}
                  label="Business criticality"
                  placeholder="Select business criticality"
                  isHidden={false}
                  id="businessCriticality"
                  onChange={(e) => handleOnChange("businessCriticality", e.target.value)}
                  value={values.businessCriticality}
                  sx={{ width: "100%" }}
                  error={errors.businessCriticality}
                  disabled={isEditingDisabled}
                />
              </Box>
            </Stack>
            <Stack direction="row" spacing={6}>
              <Box sx={{ flex: 1 }}>
                <Select
                  items={PAST_ISSUES_OPTIONS}
                  label="Past issues"
                  placeholder="Select past issues level"
                  isHidden={false}
                  id="pastIssues"
                  onChange={(e) => handleOnChange("pastIssues", e.target.value)}
                  value={values.pastIssues}
                  sx={{ width: "100%" }}
                  error={errors.pastIssues}
                  disabled={isEditingDisabled}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Select
                  items={REGULATORY_EXPOSURE_OPTIONS}
                  label="Regulatory exposure"
                  placeholder="Select regulatory exposure"
                  isHidden={false}
                  id="regulatoryExposure"
                  onChange={(e) => handleOnChange("regulatoryExposure", e.target.value)}
                  value={values.regulatoryExposure}
                  sx={{ width: "100%" }}
                  error={errors.regulatoryExposure}
                  disabled={isEditingDisabled}
                />
              </Box>
            </Stack>
          </Stack>
        )}
      </Stack>
      </Stack>
  );

  return (
    <Stack>
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
      {isSubmitting && (
        <CustomizableToast title="Processing your request. Please wait..." />
      )}
      <StandardModal
        isOpen={isOpen}
        onClose={() => {
          setValues(initialState);
          setActiveTab("details");
          // Invalidate history cache to get fresh data on next open
          if (existingVendor?.id) {
            queryClient.invalidateQueries({ queryKey: ["changeHistory", "vendor", existingVendor.id] });
          }
          setIsOpen(false);
        }}
        title={existingVendor ? "Edit vendor" : "Add new vendor"}
        description={
          existingVendor
            ? "Update vendor details including products/services provided, contact information, and review status."
            : "Use this form to register a new vendor. Include details about what they provide, who is responsible, and the outcome of your review. Provide enough details so your team can assess risks, responsibilities, and compliance requirements."
        }
        onSubmit={activeTab === "details" ? handleSave : undefined}
        submitButtonText="Save"
        isSubmitting={isSubmitting || isEditingDisabled}
        maxWidth="734px"
      >
        {existingVendor ? (
          <TabContext value={activeTab}>
            <Box sx={{ marginBottom: 3 }}>
              <TabBar
                tabs={[
                  { label: "Vendor details", value: "details", icon: "Store" },
                  { label: "Activity", value: "activity", icon: "History" },
                ]}
                activeTab={activeTab}
                onChange={(_, newValue) => setActiveTab(newValue)}
              />
            </Box>
            {activeTab === "details" && vendorDetailsPanel}
            {activeTab === "activity" && (
              <HistorySidebar
                inline
                isOpen={true}
                entityType="vendor"
                entityId={existingVendor.id!}
              />
            )}
          </TabContext>
        ) : (
          vendorDetailsPanel
        )}
      </StandardModal>
    </Stack>
  );
};

export default AddNewVendor;
