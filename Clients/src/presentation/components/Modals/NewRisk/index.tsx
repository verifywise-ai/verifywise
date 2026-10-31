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
import { Box, Stack, Typography, Divider } from "@mui/material";
import Field from "../../Inputs/Field";
import Select from "../../Inputs/Select";
import AutoCompleteField from "../../Inputs/Autocomplete";
import { textStyles } from "../../../themes/typography";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import Alert from "../../Alert";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import {
  VENDOR_RISK_MODAL_FIELD_IDS,
  VENDOR_RISK_MODAL_FIELD_ORDER,
  VendorRiskModalFormValues,
} from "../../../constants/formValidationFieldMaps";
import {
  createFieldBlurHandler,
  focusFormFieldById,
} from "../../../../application/utils/formValidationFocus";
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
import VendorRiskLinksPanel from "../../LinkedRisksPanel/VendorRiskLinksPanel";
import CustomFieldsSection, { type CustomFieldsSectionHandle } from "../../CustomFieldsSection";
import { useRequiredCustomFieldsGate } from "../../CustomFieldsSection/RequiredCustomFieldsGate";
import { useVendorRiskChangeHistory } from "../../../../application/hooks/useVendorRiskChangeHistory";
import { VendorModel } from "../../../../domain/models/Common/vendor/vendor.model";
import {
  ExistingRisk,
  VendorRiskFormDetails,
  VendorRiskPreview,
} from "../../../../domain/interfaces/i.vendor";
import { Framework } from "../../../../domain/types/Framework";
import RiskLevel from "../../RiskLevel";

interface AddNewRiskProps {
  isOpen: boolean;
  setIsOpen: () => void;
  value?: string;
  handleChange?: (event: React.SyntheticEvent, newValue: string) => void;
  existingRisk?: ExistingRisk | null;
  onSuccess?: () => void;
  /** The form lists these for the vendor field and reads nothing else of them. */
  vendors: Array<Pick<VendorModel, "id" | "vendor_name">>;
  /** The tab an existing risk opens on, e.g. "linked-risks" from the table's reach link. */
  initialTab?: "details" | "linked-risks";
  /**
   * Opens the form on a risk that was drafted elsewhere, as a new risk (see VendorRiskPreview).
   * Saving hands what is on screen to the preview's `onSave` instead of creating the risk here.
   * The vendor is fixed, and the form does not check the role: whoever opens a preview has
   * checked that the person may save it. Ignored when an existing risk is being edited.
   */
  preview?: VendorRiskPreview | null;
}

const initialState: VendorRiskModalFormValues = {
  risk_description: "",
  impact_description: "",
  action_owner: "",
  risk_severity: "1",
  likelihood: "1",
  action_plan: "",
  vendor_id: "",
};

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

/**
 * The register spells its top likelihood "Almost certain", with a small c; the list above spells
 * it with a capital C, as the project risks do. A name is turned into the register's before it is
 * saved, and a register value is matched to its option without regard to case, so that a risk of
 * this level can be shown and saved.
 */
const toRegisterLikelihood = (name: string): string =>
  name === RiskLikelihood.AlmostCertain ? "Almost certain" : name;

/** The id, as a string, of the option that a register value names. Case does not matter; "1" if none does. */
const optionIdOf = (options: ReadonlyArray<{ _id: number | ""; name: string }>, value: string) =>
  String(options.find((option) => option.name.toLowerCase() === value.toLowerCase())?._id ?? 1);

/** The values a preview starts the form on. */
const valuesOfPreview = (preview: VendorRiskPreview): VendorRiskModalFormValues => ({
  vendor_id: preview.values.vendor_id,
  action_owner: preview.values.action_owner === null ? "" : String(preview.values.action_owner),
  risk_description: preview.values.risk_description,
  impact_description: preview.values.impact_description,
  action_plan: preview.values.action_plan,
  likelihood: optionIdOf(LIKELIHOOD_OPTIONS, preview.values.likelihood),
  risk_severity: optionIdOf(RISK_SEVERITY_OPTIONS, preview.values.risk_severity),
});

const AddNewRisk: React.FC<AddNewRiskProps> = ({
  isOpen,
  setIsOpen,
  existingRisk,
  onSuccess = () => {},
  vendors,
  initialTab,
  preview,
}) => {
  const { userRoleName } = useAuth();
  // A preview is for a new risk: with an existing one the form edits that.
  const draft = existingRisk ? null : (preview ?? null);
  const isEditingDisabled = !draft && !allowedRoles.vendors.edit.includes(userRoleName);
  const VENDOR_OPTIONS =
    vendors?.length > 0
      ? vendors
          .filter((vendor) => vendor.id !== undefined)
          .map((vendor) => ({
            _id: vendor.id as number,
            name: vendor.vendor_name,
          }))
      : [{ _id: "no-vendor" as string | number, name: "No Vendor Exists" }];

  const [values, setValues] = useState<VendorRiskModalFormValues>(initialState);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const validators = useMemo(
    () => ({
      // The maxima are the server's (VENDOR_RISK_VALIDATION_LIMITS in
      // Servers/utils/validations/vendorRiskValidation.utils.ts): a risk the research agent
      // wrote carries texts longer than the form used to take, and every save checks them.
      risk_description: (v: unknown) => {
        const r = checkStringValidation("Risk description", v as string, 1, 500);
        return r.accepted ? "" : r.message;
      },
      impact_description: (v: unknown) => {
        const r = checkStringValidation("Impact description", v as string, 1, 500);
        return r.accepted ? "" : r.message;
      },
      action_plan: (v: unknown) => {
        const r = checkStringValidation("Action plan", v as string, 1, 1000);
        return r.accepted ? "" : r.message;
      },
      vendor_id: (v: unknown) => {
        const id = v as string;
        return !id || Number(id) === 0 ? "Please select a vendor from the dropdown" : "";
      },
      action_owner: (v: unknown) => {
        const owner = v as string;
        return !owner ? "Please select an action owner from the dropdown" : "";
      },
      risk_severity: (v: unknown) => {
        const severity = v as string;
        return !severity || Number(severity) < 1
          ? "Please select a risk severity from the dropdown"
          : "";
      },
      likelihood: (v: unknown) => {
        const likelihood = v as string;
        return !likelihood || Number(likelihood) < 1
          ? "Please select a risk likelihood from the dropdown"
          : "";
      },
    }),
    [],
  );

  const { errors, validateAll, validateField, clearFieldError, getFirstInvalidField, resetErrors } =
    useFormValidation<VendorRiskModalFormValues>(validators);

  const handleFieldBlur = useCallback(
    (prop: keyof VendorRiskModalFormValues) =>
      createFieldBlurHandler(prop, () => valuesRef.current, validateField),
    [validateField],
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const customFieldsRef = useRef<CustomFieldsSectionHandle | null>(null);
  const customFieldsGate = useRequiredCustomFieldsGate("vendor_risk", existingRisk?.id ?? null);
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
      resetErrors();
      setSelectedFrameworks([]);
      setActiveTab("details");
    } else if (existingRisk?.id && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, resetErrors, existingRisk?.id, initialTab]);

  // The draft is read through a ref and identified by its key: the form starts from its values
  // when it opens or another draft is opened, not whenever the page renders and hands over a new
  // object, which would wipe what the person has typed.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const draftKey = draft?.key;

  useEffect(() => {
    if (isOpen && !existingRisk) {
      setValues(draftRef.current ? valuesOfPreview(draftRef.current) : initialState);
      setSelectedFrameworks([]);
    } else if (existingRisk) {
      setValues((prevValues) => ({
        ...prevValues,
        risk_description: existingRisk.risk_description,
        impact_description: existingRisk.impact_description,
        action_owner: String(existingRisk.action_owner) || "",
        risk_severity: optionIdOf(RISK_SEVERITY_OPTIONS, existingRisk.risk_severity),
        likelihood: optionIdOf(LIKELIHOOD_OPTIONS, existingRisk.likelihood),
        action_plan: existingRisk.action_plan,
        vendor_id: existingRisk.vendor_id,
      }));
      setSelectedFrameworks(
        Array.isArray(existingRisk.frameworks) ? existingRisk.frameworks.map(Number) : [],
      );
    }
  }, [existingRisk, isOpen, draftKey]);

  const handleSave = () => {
    if (customFieldsGate.blocked) return;
    if (validateAll(values, VENDOR_RISK_MODAL_FIELD_ORDER)) {
      handleOnSave();
      return;
    }

    setActiveTab("details");
    const firstInvalid = getFirstInvalidField();
    const fieldId = firstInvalid ? VENDOR_RISK_MODAL_FIELD_IDS[firstInvalid] : undefined;
    if (fieldId) {
      focusFormFieldById(fieldId);
    }
  };

  const handleOnChange = (field: keyof VendorRiskModalFormValues, value: string | number) => {
    setValues((prevValues) => ({
      ...prevValues,
      [field]: value,
    }));
    clearFieldError(field);
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
    const _riskDetails: VendorRiskFormDetails = {
      vendor_id: values.vendor_id,
      risk_description: values.risk_description,
      impact_description: values.impact_description,
      action_owner: formattedUsers?.find((user) => String(user._id) === String(values.action_owner))
        ?._id,
      action_plan: values.action_plan,
      risk_severity: selectedSeverity.name,
      risk_level: risk_risklevel.level,
      likelihood: toRegisterLikelihood(selectedLikelihood.name),
      frameworks: selectedFrameworks,
    };
    if (existingRisk) {
      await updateRisk(existingRisk.id!, _riskDetails);
    } else if (draft) {
      await savePreview(_riskDetails, draft);
    } else {
      await createRisk(_riskDetails);
    }
  };

  /**
   * Saves the risk the form was opened on through the owner of the draft, which decides what
   * saving means (see VendorRiskPreview). It tells the person whether it worked, so the form adds
   * no message of its own, and it reports a failure through the request layer. The form stays
   * open with the values as they are, so that nothing the person edited is lost and they can save
   * again.
   *
   * Once the risk exists the form closes, also when the custom field values could not be saved:
   * saving again would try to add the risk a second time. The person is told, and can set the
   * values on the risk.
   */
  const savePreview = async (riskDetails: VendorRiskFormDetails, owner: VendorRiskPreview) => {
    setIsSubmitting(true);
    try {
      const newRiskId = await owner.onSave(riskDetails);

      let cfFlushFailed = false;
      if (newRiskId && customFieldsRef.current?.hasPendingValues()) {
        try {
          await customFieldsRef.current.flush(newRiskId);
        } catch (cfError) {
          cfFlushFailed = true;
          logEngine({
            type: "error",
            message: `Vendor risk created, but custom field values failed to save: ${(cfError as Error).message}`,
          });
        }
      }
      onSuccess();
      if (cfFlushFailed) {
        setAlert({
          variant: "warning",
          body: "Risk added, but its custom field values could not be saved. Open the risk to try again.",
        });
        setTimeout(() => setAlert(null), 6000);
      }
      // The form can be closed while the request is on its way, and another draft opened: only
      // close the form that is still on the draft that was just saved.
      if (draftRef.current?.key === owner.key) setIsOpen();
    } catch (error) {
      logEngine({
        type: "error",
        message: `The suggested risk could not be saved: ${(error as Error).message}`,
      });
    } finally {
      setIsSubmitting(false);
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
        const newRiskId = response.data?.data?.id as number | undefined;
        let cfFlushFailed = false;
        if (newRiskId && customFieldsRef.current?.hasPendingValues()) {
          try {
            await customFieldsRef.current.flush(newRiskId);
          } catch (cfError) {
            cfFlushFailed = true;
            logEngine({
              type: "error",
              message: `Vendor risk created, but custom field values failed to save: ${(cfError as Error).message}`,
            });
          }
        }
        onSuccess();
        if (cfFlushFailed) {
          // Risk is created. Keep modal open so the inline warning from
          // CustomFieldsSection stays visible.
          return;
        }
        setAlert({
          variant: "success",
          body: "Vendor-Risk created successfully",
        });
        setTimeout(() => setAlert(null), 3000);
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
        let cfFlushFailed = false;
        if (customFieldsRef.current?.hasPendingValues()) {
          try {
            await customFieldsRef.current.flush(riskId);
          } catch (cfError) {
            cfFlushFailed = true;
            logEngine({
              type: "error",
              message: `Vendor risk updated, but custom field values failed to save: ${(cfError as Error).message}`,
            });
          }
        }
        onSuccess();
        if (cfFlushFailed) {
          return;
        }
        setAlert({
          variant: "success",
          body: "Vendor-Risk updated successfully",
        });
        setTimeout(() => setAlert(null), 3000);
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

  const handleOnSelectChange = useCallback(
    (prop: "likelihood" | "riskSeverity") => (event: SelectChangeEvent<string | number>) => {
      const key: keyof VendorRiskModalFormValues =
        prop === "riskSeverity" ? "risk_severity" : "likelihood";
      setValues((prev) => ({
        ...prev,
        [key]: event.target.value,
      }));
      clearFieldError(key);
    },
    [clearFieldError],
  );

  // Read top to bottom: who and what, then what it would cost and what is
  // being done about it, then where it applies and how severe it is. The
  // validation focus order (VENDOR_RISK_MODAL_FIELD_ORDER) follows the same path.
  const risksPanel = (
    <Stack spacing={8}>
      <Stack direction="row" spacing={6}>
        <Box flex={1}>
          <Select
            items={VENDOR_OPTIONS}
            label="Vendor"
            placeholder="Select vendor"
            isHidden={false}
            id="vendor_id"
            onChange={(e) => handleOnChange("vendor_id", e.target.value)}
            onBlur={handleFieldBlur("vendor_id")}
            value={values.vendor_id}
            error={errors.vendor_id}
            sx={{ width: "100%" }}
            isRequired
            // The vendor of a draft belongs to what it was drafted from.
            disabled={isEditingDisabled || draft !== null}
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
            onBlur={handleFieldBlur("action_owner")}
            value={values.action_owner || ""}
            error={errors.action_owner}
            sx={{ width: "100%" }}
            isRequired
            disabled={isEditingDisabled}
          />
        </Box>
      </Stack>

      <Field
        id="vendor-risk-description-input"
        label="Risk description"
        width="100%"
        value={values.risk_description}
        onChange={(e) => handleOnChange("risk_description", e.target.value)}
        onBlur={handleFieldBlur("risk_description")}
        error={errors.risk_description}
        isRequired
        disabled={isEditingDisabled}
        type="description"
        rows={4}
        placeholder="Describe the specific risk related to this vendor (e.g., data breach, service outage, compliance gap)."
      />

      <Stack direction="row" spacing={6}>
        <Box flex={1}>
          <Field
            id="vendor-risk-impact-description-input"
            label="Impact description"
            width="100%"
            value={values.impact_description}
            onChange={(e) => handleOnChange("impact_description", e.target.value)}
            onBlur={handleFieldBlur("impact_description")}
            error={errors.impact_description}
            isRequired
            disabled={isEditingDisabled}
            type="description"
            rows={4}
            placeholder="Explain the potential consequences if this risk occurs (e.g., financial, reputational, regulatory)."
          />
        </Box>
        <Box flex={1}>
          <Field
            id="vendor-risk-action-plan-input"
            label="Action plan"
            width="100%"
            type="description"
            value={values.action_plan}
            error={errors.action_plan}
            onChange={(e) => handleOnChange("action_plan", e.target.value)}
            onBlur={handleFieldBlur("action_plan")}
            isRequired
            disabled={isEditingDisabled}
            rows={4}
            placeholder="Outline the steps or controls you will take to reduce or eliminate this risk."
          />
        </Box>
      </Stack>

      <AutoCompleteField<Framework, true>
        multiple
        id="vendor-risk-frameworks-input"
        label="Applicable frameworks"
        isOptional
        helperText="Select the compliance frameworks this vendor risk applies to."
        placeholder={
          frameworksLoading
            ? "Loading frameworks..."
            : selectedFrameworks.length > 0
              ? ""
              : "Select applicable frameworks"
        }
        value={
          frameworksLoading || !organizationalFrameworks.length
            ? []
            : organizationalFrameworks.filter((fw) => selectedFrameworks.includes(Number(fw.id)))
        }
        options={organizationalFrameworks}
        getOptionLabel={(fw) => fw.name}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        onChange={(_event, newValue) => {
          setSelectedFrameworks(newValue.map((fw) => Number(fw.id)));
        }}
        sx={{ width: "100%" }}
        disabled={frameworksLoading || isEditingDisabled}
      />

      <Divider />

      <Stack spacing={2}>
        <Typography sx={{ ...textStyles.subsectionTitle, color: "text.primary" }}>
          Calculate risk level
        </Typography>
        <Typography sx={{ ...textStyles.body, color: "text.tertiary" }}>
          The risk level is calculated from the likelihood and the severity you select.
        </Typography>
      </Stack>
      <RiskLevel
        likelihood={Number(values.likelihood) || 1}
        riskSeverity={Number(values.risk_severity) || 1}
        handleOnSelectChange={handleOnSelectChange}
        likelihoodError={errors.likelihood}
        riskSeverityError={errors.risk_severity}
        onLikelihoodBlur={handleFieldBlur("likelihood")}
        onRiskSeverityBlur={handleFieldBlur("risk_severity")}
        disabled={isEditingDisabled}
      />
    </Stack>
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
      {isSubmitting && <CustomizableToast title="Processing your request. Please wait..." />}
      <StandardModal
        isOpen={isOpen}
        onClose={() => {
          setValues(initialState);
          setActiveTab("details");
          setIsOpen();
        }}
        title={draft ? draft.title : existingRisk ? "Edit risk" : "Add a new vendor risk"}
        description={
          draft
            ? draft.description
            : existingRisk
              ? "Update risk details including description, impact assessment, and mitigation plan."
              : "Document and assess a potential risk associated with your vendor. Provide details of the risk, its impact, and your mitigation plan."
        }
        // Neither tab edits the risk: links save on their own, and activity is read-only.
        onSubmit={activeTab === "activity" || activeTab === "linked-risks" ? undefined : handleSave}
        submitButtonText="Save"
        isSubmitting={isSubmitting || isEditingDisabled || customFieldsGate.blocked}
        maxWidth="1000px"
      >
        <TabContext value={activeTab}>
          <Box sx={{ marginBottom: 3 }}>
            <TabBar
              tabs={
                existingRisk?.id
                  ? [
                      { label: "Risk details", value: "details", icon: "ShieldAlert" },
                      { label: "Custom fields", value: "custom-fields", icon: "Settings" },
                      { label: "Activity", value: "activity", icon: "History" },
                      { label: "Linked risks", value: "linked-risks", icon: "Network" },
                    ]
                  : [
                      { label: "Risk details", value: "details", icon: "ShieldAlert" },
                      { label: "Custom fields", value: "custom-fields", icon: "Settings" },
                    ]
              }
              activeTab={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
            />
          </Box>
          <Box sx={{ display: activeTab === "details" ? "block" : "none" }}>{risksPanel}</Box>
          <Box sx={{ display: activeTab === "custom-fields" ? "block" : "none" }}>
            <CustomFieldsSection
              ref={customFieldsRef}
              entityType="vendor_risk"
              entityId={existingRisk?.id ?? null}
              onPendingChange={customFieldsGate.onPendingChange}
            />
          </Box>
          {activeTab === "activity" && existingRisk?.id && (
            <HistorySidebar
              inline
              isOpen={true}
              entityType="vendor_risk"
              entityId={existingRisk.id}
            />
          )}
          {activeTab === "linked-risks" && existingRisk?.id && (
            <VendorRiskLinksPanel vendorRiskId={existingRisk.id} />
          )}
        </TabContext>
      </StandardModal>
    </Stack>
  );
};

export default AddNewRisk;
