/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { FC, useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Stack, Box, useTheme } from "@mui/material";
import Field from "../../Inputs/Field";
import DatePicker from "../../Inputs/Datepicker";
import SelectComponent from "../../Inputs/Select";
import StandardModal from "../StandardModal";
import TabBar from "../../TabBar";
import { TabContext } from "@mui/lab";
import { HistorySidebar } from "../../Common/HistorySidebar";
import {
  ModelRiskCategory,
  ModelRiskLevel,
  ModelRiskStatus,
  IModelRiskFormData,
} from "../../../../domain/interfaces/i.modelRisk";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import { getAllUsers } from "../../../../application/repository/user.repository";
import { User } from "../../../../domain/types/User";
import dayjs, { Dayjs } from "dayjs";
import { useModalKeyHandling } from "../../../../application/hooks/useModalKeyHandling";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import CustomFieldsSection, { type CustomFieldsSectionHandle } from "../../CustomFieldsSection";
import { useRequiredCustomFieldsGate } from "../../CustomFieldsSection/RequiredCustomFieldsGate";
import type { TabItem } from "../../TabBar";
import { logEngine } from "../../../../application/tools/log.engine";
import { useCanCheck } from "../../../../application/hooks/useCan";
import ReadOnlyFieldset from "../../ReadOnlyFieldset";
import {
  computeModelRiskLevel,
  MODEL_RISK_LIKELIHOOD_OPTIONS,
  MODEL_RISK_SEVERITY_OPTIONS,
  modelRiskSaveBody,
  picksModelRiskLevel,
} from "../../../tools/modelRiskLevel";

interface NewModelRiskProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  // On create, the parent should return `{ id }` so the modal can flush staged
  // custom field values against the newly created entity. On update, returning
  // the id is optional (we fall back to `entityId`).
  onSuccess?: (data: IModelRiskFormData) => void | Promise<{ id?: number } | void>;
  initialData?: IModelRiskFormData;
  isEdit?: boolean;
  entityId?: number;
}

const initialState: IModelRiskFormData = {
  risk_name: "",
  risk_category: ModelRiskCategory.PERFORMANCE,
  likelihood: "",
  severity: "",
  status: ModelRiskStatus.OPEN,
  owner: "",
  target_date: new Date().toISOString().split("T")[0],
  description: "",
  mitigation_plan: "",
  impact: "",
};

const riskCategoryOptions = [
  { _id: ModelRiskCategory.PERFORMANCE, name: "Performance" },
  { _id: ModelRiskCategory.BIAS, name: "Bias & fairness" },
  { _id: ModelRiskCategory.SECURITY, name: "Security" },
  { _id: ModelRiskCategory.DATA_QUALITY, name: "Data quality" },
  { _id: ModelRiskCategory.COMPLIANCE, name: "Compliance" },
];

const riskLevelOptions = [
  { _id: ModelRiskLevel.LOW, name: "Low" },
  { _id: ModelRiskLevel.MEDIUM, name: "Medium" },
  { _id: ModelRiskLevel.HIGH, name: "High" },
  { _id: ModelRiskLevel.CRITICAL, name: "Critical" },
];

const statusOptions = [
  { _id: ModelRiskStatus.OPEN, name: "Open" },
  { _id: ModelRiskStatus.IN_PROGRESS, name: "In Progress" },
  { _id: ModelRiskStatus.RESOLVED, name: "Resolved" },
  { _id: ModelRiskStatus.ACCEPTED, name: "Accepted" },
];

const NewModelRisk: FC<NewModelRiskProps> = ({
  isOpen,
  setIsOpen,
  onSuccess,
  initialData,
  isEdit = false,
  entityId,
}) => {
  const theme = useTheme();
  // Roles without edit rights can open an existing record but not change it.
  const can = useCanCheck();
  const isReadOnly = isEdit && !can("model.edit");
  const [values, setValues] = useState<IModelRiskFormData>(initialData || initialState);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [models, setModels] = useState<any[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const customFieldsRef = useRef<CustomFieldsSectionHandle | null>(null);
  const customFieldsGate = useRequiredCustomFieldsGate("model_risk", entityId ?? null);

  useEffect(() => {
    if (initialData) {
      setValues(initialData);
    } else if (!isEdit) {
      setValues(initialState);
    }
  }, [initialData, isEdit]);

  const validators = useMemo(
    () => ({
      // A new risk needs both: the server sets its level from them. An older
      // risk without them keeps a hand-picked level until both are set.
      likelihood: (v: unknown) => (!isEdit && !v ? "Likelihood is required." : ""),
      severity: (v: unknown) => (!isEdit && !v ? "Severity is required." : ""),
      risk_name: (v: unknown) => {
        const r = checkStringValidation("Risk name", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      risk_category: (v: unknown) => (!v ? "Risk category is required." : ""),
      status: (v: unknown) => (!v ? "Status is required." : ""),
      owner: (v: unknown) => {
        const r = checkStringValidation("Owner", v as string, 1);
        return r.accepted ? "" : r.message;
      },
      target_date: (v: unknown) => {
        const r = checkStringValidation("Next review date", v as string, 1);
        return r.accepted ? "" : r.message;
      },
    }),
    [isEdit],
  );

  const { errors, validateAll, clearFieldError, resetErrors } =
    useFormValidation<IModelRiskFormData>(validators);

  useEffect(() => {
    if (!isOpen) {
      setValues(initialState);
      resetErrors();
    } else if (isOpen && initialData) {
      setValues(initialData);
    }
  }, [isOpen, initialData, resetErrors]);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      fetchModels();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialData && users && users.length > 0 && isEdit) {
      const ownerUser = users.find((user) => String(user.id) === String(initialData.owner));
      if (ownerUser) {
        setValues((prev) => ({
          ...prev,
          owner: String(ownerUser.id),
        }));
      }
    }
  }, [initialData, users, isEdit]);

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const response = await getAllUsers();
      let userData: any[] = [];
      if (Array.isArray(response)) {
        userData = response;
      } else if (response?.data && Array.isArray(response.data)) {
        userData = response.data;
      }
      setUsers(userData);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const fetchModels = async () => {
    setIsLoadingModels(true);
    try {
      const response = await getAllEntities({ routeUrl: "/modelInventory" });
      let modelsData: any[] = [];
      if (Array.isArray(response)) {
        modelsData = response;
      } else if (response?.data && Array.isArray(response.data)) {
        modelsData = response.data;
      }
      setModels(modelsData);
    } catch (error) {
      console.error("Error fetching models:", error);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const userOptions = useMemo(() => {
    return users.map((user) => ({
      _id: String(user.id),
      name: `${user.name} ${user.surname}`.trim() || user.email,
    }));
  }, [users]);

  const modelOptions = useMemo(() => {
    return [
      { _id: "", name: "None (General Risk)" },
      ...models.map((model) => ({
        _id: model.id,
        name: `${model.provider} ${model.model} ${model.version || ""}`.trim(),
      })),
    ];
  }, [models]);

  const handleOnTextFieldChange = useCallback(
    (prop: keyof IModelRiskFormData) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setValues((prev) => ({ ...prev, [prop]: value }));
      clearFieldError(prop);
    },
    [clearFieldError],
  );

  const handleOnSelectChange = useCallback(
    (prop: keyof IModelRiskFormData) => (event: any) => {
      const value = event.target.value;
      if (prop === "model_id" && value === "") {
        setValues((prev) => ({ ...prev, [prop]: null }));
        clearFieldError(prop);
        return;
      }
      setValues((prev) => ({ ...prev, [prop]: value }));
      clearFieldError(prop);
    },
    [clearFieldError],
  );

  const handleDateChange = useCallback(
    (newDate: Dayjs | null) => {
      if (newDate?.isValid()) {
        setValues((prev) => ({
          ...prev,
          target_date: newDate ? newDate.format("YYYY-MM-DD") : "",
        }));
        clearFieldError("target_date");
      }
    },
    [clearFieldError],
  );

  const handleClose = () => {
    setIsOpen(false);
    setActiveTab("details");
  };

  useModalKeyHandling({
    isOpen,
    onClose: handleClose,
  });

  const computedLevel = computeModelRiskLevel(values.likelihood, values.severity);
  // An older risk with no likelihood or severity keeps its hand-picked level.
  const picksLevel = picksModelRiskLevel(values, isEdit);

  const handleSaveModelRisk = async () => {
    if (customFieldsGate.blocked) return;
    if (!validateAll(values)) return;
    if (picksLevel && !values.risk_level) return;
    // The server computes the level when both are set; send no picked one.
    const payload = modelRiskSaveBody(values, isEdit);
    setIsSubmitting(true);
    try {
      let result: { id?: number } | void;
      try {
        result = onSuccess ? await onSuccess(payload) : undefined;
      } catch {
        // Parent shows its own error toast; keep the modal open so the user
        // can correct the form and retry. Skip flush/close.
        return;
      }
      const targetId =
        (result && typeof result === "object" && "id" in result ? result.id : undefined) ??
        entityId;

      let cfFlushFailed = false;
      if (targetId && customFieldsRef.current?.hasPendingValues()) {
        try {
          await customFieldsRef.current.flush(targetId);
        } catch (cfError) {
          cfFlushFailed = true;
          logEngine({
            type: "error",
            message: `Model risk saved, but custom field values failed to save: ${(cfError as Error).message}`,
          });
        }
      }

      if (cfFlushFailed) {
        // Keep modal open so the inline warning inside CustomFieldsSection
        // remains visible to the user.
        return;
      }
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldStyle = {
    "backgroundColor": theme.palette.background.main,
    "& input": {
      padding: "0 14px",
    },
  };

  const formContent = (
    <Stack spacing={6}>
      {/* First row: name, category, status */}
      <Stack direction="row" spacing={6}>
        <Box sx={{ flex: 1 }}>
          <Field
            id="riskName"
            label="Risk name"
            width="100%"
            value={values.risk_name}
            onChange={handleOnTextFieldChange("risk_name")}
            error={errors.risk_name}
            isRequired
            sx={fieldStyle}
            placeholder="e.g., Model accuracy decline"
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <SelectComponent
            id="riskCategory"
            label="Risk category"
            value={values.risk_category}
            error={errors.risk_category}
            isRequired
            sx={{ width: "100%" }}
            items={riskCategoryOptions}
            onChange={handleOnSelectChange("risk_category")}
            placeholder="Select category"
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <SelectComponent
            id="status"
            label="Status"
            value={values.status}
            error={errors.status}
            isRequired
            sx={{ width: "100%" }}
            items={statusOptions}
            onChange={handleOnSelectChange("status")}
            placeholder="Select status"
          />
        </Box>
      </Stack>

      {/* Second row: likelihood and severity set the level */}
      <Stack direction="row" spacing={6}>
        <Box sx={{ flex: 1 }}>
          <SelectComponent
            id="likelihood"
            label="Likelihood"
            value={values.likelihood ?? ""}
            error={errors.likelihood}
            isRequired={!isEdit}
            sx={{ width: "100%" }}
            items={MODEL_RISK_LIKELIHOOD_OPTIONS}
            onChange={handleOnSelectChange("likelihood")}
            placeholder="Select likelihood"
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <SelectComponent
            id="severity"
            label="Severity"
            value={values.severity ?? ""}
            error={errors.severity}
            isRequired={!isEdit}
            sx={{ width: "100%" }}
            items={MODEL_RISK_SEVERITY_OPTIONS}
            onChange={handleOnSelectChange("severity")}
            placeholder="Select severity"
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          {picksLevel ? (
            <SelectComponent
              id="riskLevel"
              label="Risk level"
              value={values.risk_level ?? ""}
              error={!values.risk_level ? "Set likelihood and severity, or pick a level." : ""}
              isRequired
              sx={{ width: "100%" }}
              items={riskLevelOptions}
              onChange={handleOnSelectChange("risk_level")}
              placeholder="Select risk level"
            />
          ) : (
            <Field
              id="riskLevel"
              label="Risk level"
              width="100%"
              value={computedLevel ?? ""}
              disabled
              sx={fieldStyle}
              placeholder="Set by likelihood and severity"
            />
          )}
        </Box>
      </Stack>

      {/* Third row: owner, review date, model. min-width 0 lets each column
          shrink, so a long model name is cut instead of widening the row. */}
      <Stack direction="row" spacing={6} sx={{ "& > *": { minWidth: 0 } }}>
        <Box sx={{ flex: 1 }}>
          <SelectComponent
            id="owner"
            label="Owner"
            value={values.owner}
            error={errors.owner}
            isRequired
            sx={{ width: "100%" }}
            items={userOptions}
            onChange={handleOnSelectChange("owner")}
            placeholder="Select owner"
            disabled={isLoadingUsers}
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <DatePicker
            label="Next review date"
            date={values.target_date ? dayjs(values.target_date) : dayjs(new Date())}
            handleDateChange={handleDateChange}
            sx={{
              width: "100%",
              backgroundColor: theme.palette.background.main,
            }}
            isRequired
            error={errors.target_date}
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <SelectComponent
            id="modelId"
            label="Associated model (optional)"
            value={values.model_id ?? ""}
            sx={{ width: "100%" }}
            items={modelOptions}
            onChange={handleOnSelectChange("model_id")}
            placeholder="Select model"
            disabled={isLoadingModels}
          />
        </Box>
      </Stack>

      {/* Description Section */}
      <Field
        label="Description"
        width="100%"
        type="description"
        rows={2}
        value={values.description}
        onChange={handleOnTextFieldChange("description")}
        placeholder="Describe the risk in detail"
        error={errors.description}
      />

      {/* Impact Section */}
      <Field
        label="Impact"
        width="100%"
        type="description"
        rows={2}
        value={values.impact}
        onChange={handleOnTextFieldChange("impact")}
        placeholder="Describe the potential impact of this risk"
        error={errors.impact}
      />

      {/* Mitigation Plan Section */}
      <Field
        label="Mitigation plan"
        width="100%"
        type="description"
        rows={2}
        value={values.mitigation_plan}
        onChange={handleOnTextFieldChange("mitigation_plan")}
        placeholder="Describe the plan to mitigate this risk"
        error={errors.mitigation_plan}
      />
    </Stack>
  );

  const isEditMode = isEdit && !!entityId;

  const tabs: TabItem[] = isEditMode
    ? [
        { label: "Risk details", value: "details", icon: "ShieldAlert" },
        { label: "Custom fields", value: "custom-fields", icon: "Settings" },
        { label: "Activity", value: "activity", icon: "History" },
      ]
    : [
        { label: "Risk details", value: "details", icon: "ShieldAlert" },
        { label: "Custom fields", value: "custom-fields", icon: "Settings" },
      ];

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? "Edit model risk" : "Add a new model risk"}
      description={
        isEdit
          ? "Update risk details, mitigation plan, and tracking information"
          : "Document and track potential risks associated with AI models"
      }
      onSubmit={activeTab === "activity" ? undefined : handleSaveModelRisk}
      submitButtonText={isEdit ? "Update risk" : "Save"}
      isSubmitting={isSubmitting || customFieldsGate.blocked}
      hideSubmitButton={isReadOnly}
      maxWidth="760px"
    >
      <TabContext value={activeTab}>
        <Box sx={{ marginBottom: 3 }}>
          <TabBar
            tabs={tabs}
            activeTab={activeTab}
            onChange={(_, newValue) => setActiveTab(newValue)}
          />
        </Box>
        {/* Render details + custom-fields always (display-toggle) so the
            staged-values Map inside CustomFieldsSection survives tab switches. */}
        <Box sx={{ display: activeTab === "details" ? "block" : "none" }}>
          <ReadOnlyFieldset readOnly={isReadOnly}>{formContent}</ReadOnlyFieldset>
        </Box>
        <Box sx={{ display: activeTab === "custom-fields" ? "block" : "none" }}>
          <ReadOnlyFieldset readOnly={isReadOnly}>
            <CustomFieldsSection
              ref={customFieldsRef}
              entityType="model_risk"
              entityId={entityId ?? null}
              onPendingChange={customFieldsGate.onPendingChange}
            />
          </ReadOnlyFieldset>
        </Box>
        {activeTab === "activity" && isEditMode && (
          <HistorySidebar
            inline
            isOpen={true}
            entityType="model_risk"
            entityId={entityId as number}
          />
        )}
      </TabContext>
    </StandardModal>
  );
};

export default NewModelRisk;
