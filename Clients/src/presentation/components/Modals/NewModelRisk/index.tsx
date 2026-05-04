/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { FC, useState, useMemo, useCallback, useEffect, Suspense } from "react";
import { Stack, Box, useTheme } from "@mui/material";
import { lazy } from "react";
const Field = lazy(() => import("../../Inputs/Field"));
const DatePicker = lazy(() => import("../../Inputs/Datepicker"));
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

interface NewModelRiskProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSuccess?: (data: IModelRiskFormData) => void;
  initialData?: IModelRiskFormData;
  isEdit?: boolean;
  entityId?: number;
}

interface NewModelRiskFormErrors {
  risk_name?: string;
  risk_category?: string;
  risk_level?: string;
  status?: string;
  owner?: string;
  target_date?: string;
  description?: string;
  mitigation_plan?: string;
  impact?: string;
}

const initialState: IModelRiskFormData = {
  risk_name: "",
  risk_category: ModelRiskCategory.PERFORMANCE,
  risk_level: ModelRiskLevel.MEDIUM,
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
  const [values, setValues] = useState<IModelRiskFormData>(initialData || initialState);
  const [errors, setErrors] = useState<NewModelRiskFormErrors>({});
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [models, setModels] = useState<any[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  useEffect(() => {
    if (initialData) {
      setValues(initialData);
    } else if (!isEdit) {
      setValues(initialState);
    }
  }, [initialData, isEdit]);

  useEffect(() => {
    if (!isOpen) {
      setValues(initialState);
      setErrors({});
    } else if (isOpen && initialData) {
      setValues(initialData);
    }
  }, [isOpen, initialData]);

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
      setErrors((prev) => ({ ...prev, [prop]: "" }));
    },
    [],
  );

  const handleOnSelectChange = useCallback(
    (prop: keyof IModelRiskFormData) => (event: any) => {
      const value = event.target.value;
      if (prop === "model_id" && value === "") {
        setValues((prev) => ({ ...prev, [prop]: null }));
        setErrors((prev) => ({ ...prev, [prop]: "" }));
        return;
      }
      setValues((prev) => ({ ...prev, [prop]: value }));
      setErrors((prev) => ({ ...prev, [prop]: "" }));
    },
    [],
  );

  const handleDateChange = useCallback((newDate: Dayjs | null) => {
    if (newDate?.isValid()) {
      setValues((prev) => ({
        ...prev,
        target_date: newDate ? newDate.format("YYYY-MM-DD") : "",
      }));
      setErrors((prev) => ({ ...prev, target_date: "" }));
    }
  }, []);

  const validateForm = (): boolean => {
    const newErrors: NewModelRiskFormErrors = {};

    if (!values.risk_name || !String(values.risk_name).trim()) {
      newErrors.risk_name = "Risk name is required.";
    }

    if (!values.risk_category) {
      newErrors.risk_category = "Risk category is required.";
    }

    if (!values.risk_level) {
      newErrors.risk_level = "Risk level is required.";
    }

    if (!values.status) {
      newErrors.status = "Status is required.";
    }

    if (!values.owner || !String(values.owner).trim()) {
      newErrors.owner = "Owner is required.";
    }

    if (!values.target_date) {
      newErrors.target_date = "Next review date is required.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleClose = () => {
    setIsOpen(false);
    setActiveTab("details");
  };

  useModalKeyHandling({
    isOpen,
    onClose: handleClose,
  });

  const handleSubmit = () => {
    if (validateForm()) {
      setIsSubmitting(true);
      if (onSuccess) {
        onSuccess(values);
      }
      setIsSubmitting(false);
      handleClose();
    }
  };

  const fieldStyle = {
    backgroundColor: theme.palette.background.main,
    "& input": {
      padding: "0 14px",
    },
  };

  const formContent = (
    <Stack spacing={6}>
      {/* First Row: Risk Name, Category, Risk Level */}
      <Stack direction="row" spacing={6}>
        <Box sx={{ flex: 1 }}>
          <Suspense fallback={<div>Loading...</div>}>
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
          </Suspense>
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
            id="riskLevel"
            label="Risk level"
            value={values.risk_level}
            error={errors.risk_level}
            isRequired
            sx={{ width: "100%" }}
            items={riskLevelOptions}
            onChange={handleOnSelectChange("risk_level")}
            placeholder="Select risk level"
          />
        </Box>
      </Stack>

      {/* Second Row: Status, Owner, Target Date */}
      <Stack direction="row" spacing={6}>
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
          <Suspense fallback={<div>Loading...</div>}>
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
          </Suspense>
        </Box>
      </Stack>

      {/* Third Row: Model (Optional) */}
      <Stack direction="row" spacing={6}>
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
        <Box sx={{ flex: 1 }} />
        <Box sx={{ flex: 1 }} />
      </Stack>

      {/* Description Section */}
      <Suspense fallback={<div>Loading...</div>}>
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
      </Suspense>

      {/* Impact Section */}
      <Suspense fallback={<div>Loading...</div>}>
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
      </Suspense>

      {/* Mitigation Plan Section */}
      <Suspense fallback={<div>Loading...</div>}>
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
      </Suspense>
    </Stack>
  );

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
      onSubmit={activeTab === "details" ? handleSubmit : undefined}
      submitButtonText={isEdit ? "Update risk" : "Save"}
      isSubmitting={isSubmitting}
      maxWidth="760px"
    >
      {isEdit && entityId ? (
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
          {activeTab === "details" && formContent}
          {activeTab === "activity" && (
            <HistorySidebar inline isOpen={true} entityType="model_risk" entityId={entityId} />
          )}
        </TabContext>
      ) : (
        formContent
      )}
    </StandardModal>
  );
};

export default NewModelRisk;
