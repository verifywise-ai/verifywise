/**
 * Component for adding or editing a vendor risk through a modal interface.
 *
 * @component
 * @param {AddNewRiskProps} props - The properties for the AddNewRisk component.
 * @param {boolean} props.isOpen - Determines if the modal is open.
 * @param {() => void} props.setIsOpen - Function to set the modal open state.
 * @param {ExistingRisk} [props.existingRisk] - Existing risk data for edit mode.
 * @param {() => void} [props.onSuccess] - Callback on successful save.
 * @param {VendorModel[]} props.vendors - Available vendors for selection.
 *
 * @returns {JSX.Element} The rendered AddNewRisk component.
 */

import TabContext from "@mui/lab/TabContext";
import { Autocomplete, Box, Stack, TextField, Typography, Divider } from "@mui/material";
import Field from "../../Inputs/Field";
import Select from "../../Inputs/Select";
import { Suspense, useEffect, useState, useMemo, lazy, useCallback } from "react";
import Alert from "../../Alert";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import useUsers from "../../../../application/hooks/useUsers";
import useFrameworks from "../../../../application/hooks/useFrameworks";
import CustomizableToast from "../../Toast";
import { logEngine } from "../../../../application/tools/log.engine";
import StandardModal from "../StandardModal";
import TabBar from "../../TabBar";
import { RiskCalculator } from "../../../tools/riskCalculator";
import { RiskLikelihood, RiskSeverity } from "../../RiskLevel/riskValues";
import allowedRoles from "../../../../application/constants/permissions";
import { SelectChangeEvent } from "@mui/material";
import {
  useCreateVendorRisk,
  useUpdateVendorRisk,
} from "../../../../application/hooks/useVendorRiskMutations";
import { useAuth } from "../../../../application/hooks/useAuth";
import { HistorySidebar } from "../../Common/HistorySidebar";
import { useVendorRiskChangeHistory } from "../../../../application/hooks/useVendorRiskChangeHistory";
import { VendorModel } from "../../../../domain/models/Common/vendor/vendor.model";
import { ExistingRisk } from "../../../../domain/interfaces/i.vendor";
import { Framework } from "../../../../domain/types/Framework";
const RiskLevel = lazy(() => import("../../RiskLevel"));

interface FormErrors {
  risk_description: string;
  impact_description: string;
  action_owner: string;
  risk_severity: string;
  likelihood: string;
  risk_level?: string;
  action_plan: string;
  vendor_id: string;
}
interface AddNewRiskProps {
  isOpen: boolean;
  setIsOpen: () => void;
  value?: string;
  handleChange?: (event: React.SyntheticEvent, newValue: string) => void;
  existingRisk?: ExistingRisk | null;
  onSuccess?: () => void;
  vendors: VendorModel[];
}

const initialState = {
  risk_description: "",
  impact_description: "",
  action_owner: "",
  risk_severity: "1",
  likelihood: "1",
  risk_level: "",
  action_plan: "",
  vendor_id: "",
};

const RISK_LEVEL_OPTIONS = [
  { _id: "", name: "Select risk level" },
  { _id: 1, name: "Very high risk" },
  { _id: 2, name: "High risk" },
  { _id: 3, name: "Medium risk" },
  { _id: 4, name: "Low risk" },
  { _id: 5, name: "Very low risk" },
];

const LIKELIHOOD_OPTIONS = [
  { _id: "", name: "Select likelihood" },
  { _id: 1, name: RiskLikelihood.Rare },
  { _id: 2, name: RiskLikelihood.Unlikely },
  { _id: 3, name: RiskLikelihood.Possible },
  { _id: 4, name: RiskLikelihood.Likely },
  { _id: 5, name: RiskLikelihood.AlmostCertain },
] as const;

const RISK_SEVERITY_OPTIONS = [
  { _id: "", name: "Select severity" },
  { _id: 1, name: RiskSeverity.Negligible },
  { _id: 2, name: RiskSeverity.Minor },
  { _id: 3, name: RiskSeverity.Moderate },
  { _id: 4, name: RiskSeverity.Major },
  { _id: 5, name: RiskSeverity.Catastrophic },
] as const;

const AddNewRisk: React.FC<AddNewRiskProps> = ({
  isOpen,
  setIsOpen,
  existingRisk,
  onSuccess = () => {},
  vendors,
}) => {
  const { userRoleName } = useAuth();
  const isEditingDisabled = !allowedRoles.vendors.edit.includes(userRoleName);
  const VENDOR_OPTIONS =
    vendors?.length > 0
      ? vendors
          .filter((vendor) => vendor.id !== undefined)
          .map((vendor) => ({
            _id: vendor.id as number,
            name: vendor.vendor_name,
          }))
      : [{ _id: "no-vendor" as string | number, name: "No Vendor Exists" }];

  const [values, setValues] = useState(initialState);
  const [errors, setErrors] = useState({} as FormErrors);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [selectedFrameworks, setSelectedFrameworks] = useState<number[]>([]);

  const { allFrameworks: frameworks, loading: frameworksLoading } = useFrameworks({
    listOfFrameworks: [],
  });
  const organizationalFrameworks = useMemo(
    () => (frameworks || []).filter((fw: Framework) => fw.is_organizational),
    [frameworks],
  );

  // Prefetch history data when modal opens in edit mode
  useVendorRiskChangeHistory(isOpen && existingRisk?.id ? existingRisk.id : undefined);

  const { users } = useUsers();
  const formattedUsers = users?.map((user) => ({
    _id: String(user.id),
    name: `${user.name} ${user.surname}`,
  }));

  // TanStack Query hooks
  const createVendorRiskMutation = useCreateVendorRisk();
  const updateVendorRiskMutation = useUpdateVendorRisk();
  useEffect(() => {
    if (!isOpen) {
      setValues(initialState);
      setErrors({} as FormErrors);
      setSelectedFrameworks([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !existingRisk) {
      setValues(initialState);
      setSelectedFrameworks([]);
    } else if (existingRisk) {
      setValues((prevValues) => ({
        ...prevValues,
        risk_description: existingRisk.risk_description,
        impact_description: existingRisk.impact_description,
        action_owner: String(existingRisk.action_owner) || "",
        risk_severity: Number(
          RISK_SEVERITY_OPTIONS.find((r) => r.name === existingRisk.risk_severity)?._id ?? 1,
        ).toString(),
        likelihood: Number(
          LIKELIHOOD_OPTIONS.find((r) => r.name === existingRisk.likelihood)?._id ?? 1,
        ).toString(),
        risk_level: String(
          RISK_LEVEL_OPTIONS.find((r) => r.name === existingRisk.risk_level)?._id ?? "",
        ),
        action_plan: existingRisk.action_plan,
        vendor_id: existingRisk.vendor_id,
      }));
      setSelectedFrameworks(
        Array.isArray(existingRisk.frameworks) ? existingRisk.frameworks.map(Number) : [],
      );
    }
  }, [existingRisk, isOpen]);

  const handleSave = () => {
    if (validateForm()) {
      handleOnSave();
    }
  };

  /**
   * Generic change handler for form fields
   * @param section - The section of the form (riskDetails or risks)
   * @param field - The field name to update
   * @param value - The new value
   */

  const handleOnChange = (field: string, value: string | number) => {
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
    const newErrors = {} as FormErrors;
    const risk_description = checkStringValidation(
      "Risk description",
      values.risk_description,
      1,
      256, // updated from 64
    );
    if (!risk_description.accepted) {
      newErrors.risk_description = risk_description.message;
    }
    const impact_description = checkStringValidation(
      "Impact description",
      values.impact_description,
      1,
      256, // updated from 64
    );
    if (!impact_description.accepted) {
      newErrors.impact_description = impact_description.message;
    }
    const action_plan = checkStringValidation(
      "Action plan",
      values.action_plan,
      1,
      256, // updated from 64
    );
    if (!action_plan.accepted) {
      newErrors.action_plan = action_plan.message;
    }
    if (!values.vendor_id || Number(values.vendor_id) === 0) {
      newErrors.vendor_id = "Please select a vendor from the dropdown";
    }
    if (!values.action_owner || values.action_owner === "") {
      newErrors.action_owner = "Please select an action owner from the dropdown";
    }
    if (!values.risk_severity || Number(values.risk_severity) < 1) {
      newErrors.risk_severity = "Please select a risk severity from the dropdown";
    }
    if (!values.likelihood || Number(values.likelihood) < 1) {
      newErrors.likelihood = "Please select a risk likelihood from the dropdown";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handles the final save operation after confirmation
   * Creates new vendor or updates existing one
   */

  const handleOnSave = async () => {
    const selectedLikelihood = LIKELIHOOD_OPTIONS.find((r) => r._id === Number(values.likelihood));
    const selectedSeverity = RISK_SEVERITY_OPTIONS.find(
      (r) => r._id === Number(values.risk_severity),
    );

    // Only call if both are valid (not the "Select ..." option)
    if (
      !selectedLikelihood ||
      !selectedSeverity ||
      selectedLikelihood._id === "" ||
      selectedSeverity._id === ""
    ) {
      console.error("Could not find selected likelihood or severity");
      return;
    }

    const risk_risklevel = RiskCalculator.getRiskLevel(
      selectedLikelihood.name as RiskLikelihood,
      selectedSeverity.name as RiskSeverity,
    );
    const _riskDetails = {
      vendor_id: values.vendor_id,
      risk_description: values.risk_description,
      impact_description: values.impact_description,
      action_owner: formattedUsers?.find((user) => String(user._id) === String(values.action_owner))
        ?._id,
      action_plan: values.action_plan,
      risk_severity: selectedSeverity.name,
      risk_level: risk_risklevel.level,
      likelihood: selectedLikelihood.name,
      frameworks: selectedFrameworks,
    };
    if (existingRisk) {
      await updateRisk(existingRisk.id!, _riskDetails);
    } else {
      await createRisk(_riskDetails);
    }
  };

  /**
   * Creates a new vendor in the system
   * @param riskDetails - The vendor details to create
   */

  const createRisk = async (riskDetails: object) => {
    setIsSubmitting(true);
    try {
      const response = await createVendorRiskMutation.mutateAsync(riskDetails);

      if (response.status === 201) {
        setAlert({
          variant: "success",
          body: "Vendor-Risk created successfully",
        });
        setTimeout(() => setAlert(null), 3000);
        onSuccess();
        setIsOpen();
      } else {
        setAlert({
          variant: "error",
          body: response.data?.data?.message || "An error occurred.",
        });
        setTimeout(() => setAlert(null), 3000);
      }
    } catch (error) {
      console.error("API Error:", error);

      logEngine({
        type: "error",
        message: "Unexpected response. Please try again.",
      });

      setAlert({
        variant: "error",
        body: `An error occurred: ${(error as Error).message || "Please try again."}`,
      });

      setTimeout(() => setAlert(null), 3000);
    } finally {
      setIsSubmitting(false);
      setValues(initialState);
    }
  };

  /**
   * Updates an existing vendor in the system
   * @param riskId - The ID of the vendor to update
   * @param updatedriskDetails - The new vendor details
   */

  const updateRisk = async (riskId: number, updatedRiskDetails: object) => {
    setIsSubmitting(true);
    try {
      const response = await updateVendorRiskMutation.mutateAsync({
        id: riskId,
        data: updatedRiskDetails,
      });

      if (response.status === 202) {
        setAlert({
          variant: "success",
          body: "Vendor-Risk updated successfully",
        });
        setTimeout(() => setAlert(null), 3000);
        onSuccess();
        setIsOpen();
      } else {
        setAlert({
          variant: "error",
          body: response.data?.data?.message || "An error occurred.",
        });
        setTimeout(() => setAlert(null), 3000);
      }
    } catch (error) {
      console.error("API Error:", error);

      logEngine({
        type: "error",
        message: "Unexpected response. Please try again.",
      });

      setAlert({
        variant: "error",
        body: `An error occurred: ${(error as Error).message || "Please try again."}`,
      });

      setTimeout(() => setAlert(null), 3000);
    } finally {
      setIsSubmitting(false);
      setValues(initialState);
    }
  };

  // Add this function to handle RiskLevel select changes, clearing errors as well
  const handleOnSelectChange = useCallback(
    (prop: "likelihood" | "riskSeverity") => (event: SelectChangeEvent<string | number>) => {
      const key = prop === "riskSeverity" ? "risk_severity" : prop;
      setValues((prev) => ({
        ...prev,
        [key]: event.target.value,
      }));
      setErrors((prev) => ({ ...prev, [key]: "" }));
    },
    [],
  );

  const risksPanel = (
    <Stack spacing={6}>
      <Stack direction="row" spacing={6}>
        <Stack flex={1} spacing={6}>
          <Stack direction="row" spacing={6}>
            <Box flex={1}>
              <Select
                items={VENDOR_OPTIONS}
                label="Vendor"
                placeholder="Select vendor"
                isHidden={false}
                id="vendor_id"
                onChange={(e) => handleOnChange("vendor_id", e.target.value)}
                value={values.vendor_id}
                error={errors.vendor_id}
                sx={{ width: "100%" }}
                isRequired
                disabled={isEditingDisabled}
              />
            </Box>
            <Box flex={1}>
              <Select
                items={formattedUsers}
                label="Action owner"
                placeholder="Select owner"
                isHidden={false}
                id="action_owner"
                onChange={(e) => handleOnChange("action_owner", e.target.value)}
                value={values.action_owner || ""}
                error={errors.action_owner}
                sx={{ width: "100%" }}
                isRequired
                disabled={isEditingDisabled}
              />
            </Box>
          </Stack>
          <Box>
            <Field
              label="Risk description"
              width="100%"
              value={values.risk_description}
              onChange={(e) => handleOnChange("risk_description", e.target.value)}
              error={errors.risk_description}
              isRequired
              disabled={isEditingDisabled}
              type="description"
              rows={7}
              placeholder="Describe the specific risk related to this vendor (e.g., data breach, service outage, compliance gap)."
            />
          </Box>
        </Stack>
        <Stack flex={1} spacing={6}>
          <Box>
            <Field
              label="Action plan"
              width="100%"
              type="description"
              value={values.action_plan}
              error={errors.action_plan}
              onChange={(e) => handleOnChange("action_plan", e.target.value)}
              isRequired
              disabled={isEditingDisabled}
              rows={4}
              placeholder="Outline the steps or controls you will take to reduce or eliminate this risk."
            />
          </Box>
          <Box>
            <Field
              label="Impact description"
              width="100%"
              value={values.impact_description}
              onChange={(e) => handleOnChange("impact_description", e.target.value)}
              error={errors.impact_description}
              isRequired
              disabled={isEditingDisabled}
              type="description"
              rows={4}
              placeholder="Explain the potential consequences if this risk occurs (e.g., financial, reputational, regulatory)."
            />
          </Box>
        </Stack>
      </Stack>

      {/* Applicable Frameworks */}
      <Stack>
        <Typography fontWeight={600} fontSize={16} mb={2}>
          Applicable frameworks
        </Typography>
        <Typography fontSize={13} color="text.secondary" mb={2}>
          Select the compliance frameworks this vendor risk applies to.
        </Typography>
        <Autocomplete
          multiple
          id="vendor-risk-frameworks-input"
          size="small"
          value={
            frameworksLoading || !organizationalFrameworks.length
              ? []
              : organizationalFrameworks.filter((fw) => selectedFrameworks.includes(Number(fw.id)))
          }
          options={organizationalFrameworks}
          getOptionLabel={(fw) => fw.name}
          renderOption={(props, option) => {
            const { key, ...optionProps } = props;
            return (
              <Box key={key} component="li" {...optionProps}>
                <Typography fontSize={13}>{option.name}</Typography>
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
                  fontSize: 13,
                },
              }}
            />
          )}
          onChange={(_event, newValue) => {
            setSelectedFrameworks(newValue.map((fw) => Number(fw.id)));
          }}
          sx={{
            "width": "100%",
            "& .MuiChip-root": {
              borderRadius: "4px",
            },
          }}
          disabled={frameworksLoading || isEditingDisabled}
        />
      </Stack>

      <Stack>
        <Divider sx={{ mb: 4 }} />
        <Box>
          <Typography fontWeight={600} fontSize={16} mb={2}>
            Calculate risk level
          </Typography>
          <Typography fontSize={13} color="text.secondary" mb={4}>
            The Risk Level is calculated by multiplying the Likelihood and Severity scores. By
            assigning these scores, the risk level will be determined based on your inputs.
          </Typography>
          <Stack direction="row" spacing={6}>
            <Suspense fallback={<div>Loading...</div>}>
              <RiskLevel
                likelihood={Number(values.likelihood) || 1}
                riskSeverity={Number(values.risk_severity) || 1}
                handleOnSelectChange={handleOnSelectChange}
                disabled={isEditingDisabled}
              />
            </Suspense>
          </Stack>
        </Box>
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
      {isSubmitting && <CustomizableToast title="Processing your request. Please wait..." />}
      <StandardModal
        isOpen={isOpen}
        onClose={() => {
          setValues(initialState);
          setActiveTab("details");
          setIsOpen();
        }}
        title={existingRisk ? "Edit risk" : "Add a new vendor risk"}
        description={
          existingRisk
            ? "Update risk details including description, impact assessment, and mitigation plan."
            : "Document and assess a potential risk associated with your vendor. Provide details of the risk, its impact, and your mitigation plan."
        }
        onSubmit={activeTab === "details" ? handleSave : undefined}
        submitButtonText="Save"
        isSubmitting={isSubmitting || isEditingDisabled}
        maxWidth="1000px"
      >
        {existingRisk?.id ? (
          <TabContext value={activeTab}>
            <Box sx={{ marginBottom: 3 }}>
              <TabBar
                tabs={[
                  { label: "Risk details", value: "details", icon: "ShieldAlert" },
                  { label: "Activity", value: "activity", icon: "History" },
                ]}
                activeTab={activeTab}
                onChange={(_, newValue) => setActiveTab(newValue)}
              />
            </Box>
            {activeTab === "details" && risksPanel}
            {activeTab === "activity" && (
              <HistorySidebar
                inline
                isOpen={true}
                entityType="vendor_risk"
                entityId={existingRisk.id}
              />
            )}
          </TabContext>
        ) : (
          risksPanel
        )}
      </StandardModal>
    </Stack>
  );
};

export default AddNewRisk;
