import { useEffect, useMemo, useState } from "react";
import { Box, Stack } from "@mui/material";
import StandardModal from "../StandardModal";
import Field from "../../Inputs/Field";
import Select from "../../Inputs/Select";
import { useCreateAiApp, useUpdateAiApp } from "../../../../application/hooks/useAiApps";
import { useVendors } from "../../../../application/hooks/useVendors";
import useUsers from "../../../../application/hooks/useUsers";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import { AiAppStatus, AiAppDiscoveredSource } from "../../../../domain/enums/aiApp.enum";
import { User } from "../../../../domain/types/User";
import { VendorModel } from "../../../../domain/models/Common/vendor/vendor.model";
import { IAIApp, IAIAppDetail } from "../../../../domain/interfaces/i.aiApp";
import { STATUS_OPTIONS } from "../../../pages/AIApps/utils";
import Alert from "../../Alert";

interface ApiErrorResponse {
  response?: { data?: { message?: string } };
}

interface NewAIAppProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** When provided, the modal edits this app instead of creating a new one. */
  app?: IAIAppDetail | IAIApp | null;
}

interface FormState {
  name: string;
  description: string;
  vendor_id: number | null;
  owner_id: number | null;
  status: AiAppStatus;
  discovered_source: AiAppDiscoveredSource;
  required_training: string;
}

const initialState: FormState = {
  name: "",
  description: "",
  vendor_id: null,
  owner_id: null,
  status: AiAppStatus.DRAFT,
  discovered_source: AiAppDiscoveredSource.MANUAL,
  required_training: "",
};

const NONE_OPTION = -1;

const SOURCE_OPTIONS = [
  { _id: AiAppDiscoveredSource.MANUAL, name: "Manual" },
  { _id: AiAppDiscoveredSource.SHADOW_AI, name: "Shadow AI" },
  { _id: AiAppDiscoveredSource.EMPLOYEE_REPORT, name: "Employee report" },
  { _id: AiAppDiscoveredSource.PROCUREMENT, name: "Procurement" },
  { _id: AiAppDiscoveredSource.SSO, name: "SSO" },
  { _id: AiAppDiscoveredSource.PROXY, name: "Proxy" },
  { _id: AiAppDiscoveredSource.FIREWALL, name: "Firewall" },
];

interface OptionItem {
  _id: number;
  name: string;
}

/** Builds the form state from an existing app when editing. */
function stateFromApp(app: IAIAppDetail | IAIApp): FormState {
  return {
    name: app.name ?? "",
    description: app.description ?? "",
    vendor_id: app.vendor_id ?? null,
    owner_id: app.owner_id ?? null,
    status: app.status ?? AiAppStatus.DRAFT,
    discovered_source: app.discovered_source ?? AiAppDiscoveredSource.MANUAL,
    required_training: app.required_training ?? "",
  };
}

export default function NewAIApp({ isOpen, onClose, onSuccess, app }: NewAIAppProps) {
  const isEditing = !!app;
  const [values, setValues] = useState<FormState>(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);

  const createAiAppMutation = useCreateAiApp();
  const updateAiAppMutation = useUpdateAiApp();
  const { data: vendorsData } = useVendors();
  const { users } = useUsers();

  const validators = useMemo(
    () => ({
      name: (v: unknown) => {
        const r = checkStringValidation("AI App name", v as string, 1, 128);
        return r.accepted ? "" : r.message;
      },
    }),
    [],
  );

  const { errors, validateAll, clearFieldError, resetErrors } =
    useFormValidation<FormState>(validators);

  useEffect(() => {
    if (isOpen) {
      setValues(app ? stateFromApp(app) : initialState);
      resetErrors();
      setAlert(null);
    }
  }, [isOpen, app, resetErrors]);

  const vendorOptions: OptionItem[] = useMemo(
    () => [
      { _id: NONE_OPTION, name: "No vendor" },
      ...(vendorsData || []).map((vendor: VendorModel) => ({
        _id: vendor.id!,
        name: vendor.vendor_name || `Vendor ${vendor.id}`,
      })),
    ],
    [vendorsData],
  );

  const userOptions: OptionItem[] = useMemo(
    () => [
      { _id: NONE_OPTION, name: "No owner" },
      ...(users || []).map((user: User) => ({
        _id: user.id,
        name: `${user.name} ${user.surname}`,
      })),
    ],
    [users],
  );

  const handleChange = (field: keyof FormState, value: FormState[keyof FormState]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    clearFieldError(field);
  };

  const handleSubmit = async () => {
    const isValid = validateAll(values);
    if (!isValid) return;

    setIsSubmitting(true);
    try {
      if (isEditing && app?.id) {
        await updateAiAppMutation.mutateAsync({
          id: app.id,
          data: {
            name: values.name,
            description: values.description || null,
            vendor_id: values.vendor_id,
            owner_id: values.owner_id,
            status: values.status,
            discovered_source: values.discovered_source,
            required_training: values.required_training || null,
          },
        });
      } else {
        await createAiAppMutation.mutateAsync({
          name: values.name,
          description: values.description || undefined,
          vendor_id: values.vendor_id,
          owner_id: values.owner_id,
          status: values.status,
          discovered_source: values.discovered_source,
          required_training: values.required_training || undefined,
        });
      }
      onSuccess();
    } catch (err: unknown) {
      const message =
        (err as ApiErrorResponse)?.response?.data?.message ||
        (isEditing ? "Failed to update AI app" : "Failed to create AI app");
      setAlert({
        variant: "error",
        body: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit AI app" : "New AI app"}
      description={
        isEditing
          ? "Update the details of this AI application in your governance inventory."
          : "Add an AI application to your governance inventory."
      }
      onSubmit={handleSubmit}
      submitButtonText={isEditing ? "Save" : "Create"}
      isSubmitting={isSubmitting}
      maxWidth="720px"
    >
      <Stack sx={{ gap: "16px" }}>
        <Field
          label="Name"
          placeholder="e.g. ChatGPT Enterprise"
          value={values.name}
          onChange={(e) => handleChange("name", e.target.value)}
          error={errors.name}
          isRequired
        />

        <Field
          label="Description"
          placeholder="What is this app used for?"
          value={values.description}
          onChange={(e) => handleChange("description", e.target.value)}
          multiline
          minRows={3}
        />

        <Box sx={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <Select
            id="ai-app-vendor"
            label="Vendor"
            placeholder="Select vendor"
            value={values.vendor_id ?? NONE_OPTION}
            onChange={(e) => {
              const next = e.target.value as number;
              handleChange("vendor_id", next === NONE_OPTION ? null : next);
            }}
            items={vendorOptions}
            sx={{ flex: 1, minWidth: 220 }}
          />
          <Select
            id="ai-app-owner"
            label="Owner"
            placeholder="Select owner"
            value={values.owner_id ?? NONE_OPTION}
            onChange={(e) => {
              const next = e.target.value as number;
              handleChange("owner_id", next === NONE_OPTION ? null : next);
            }}
            items={userOptions}
            sx={{ flex: 1, minWidth: 220 }}
          />
        </Box>

        <Box sx={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <Select
            id="ai-app-status"
            label="Status"
            value={values.status}
            onChange={(e) => handleChange("status", e.target.value as AiAppStatus)}
            items={[...STATUS_OPTIONS]}
            sx={{ flex: 1, minWidth: 220 }}
          />
          <Select
            id="ai-app-source"
            label="Source"
            value={values.discovered_source}
            onChange={(e) =>
              handleChange("discovered_source", e.target.value as AiAppDiscoveredSource)
            }
            items={SOURCE_OPTIONS}
            sx={{ flex: 1, minWidth: 220 }}
          />
        </Box>

        <Field
          label="Required training"
          placeholder="e.g. AI Literacy 101"
          value={values.required_training}
          onChange={(e) => handleChange("required_training", e.target.value)}
        />

        {alert && (
          <Alert
            variant={alert.variant}
            title={alert.title}
            body={alert.body}
            isToast
            onClick={() => setAlert(null)}
          />
        )}
      </Stack>
    </StandardModal>
  );
}
