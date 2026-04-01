/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { FC, useState, useEffect, useCallback, Suspense } from "react";
import { Stack, Box, Typography, IconButton, Tooltip } from "@mui/material";
import StandardModal from "../StandardModal";
import { UploadIcon } from "lucide-react";
import { CustomizableButton } from "../../button/customizable-button";
import FileManagerUploadModal from "../FileManagerUpload";
import { Trash2 as DeleteIconGrey } from "lucide-react";
import dayjs, { Dayjs } from "dayjs";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import SelectComponent from "../../Inputs/Select";
import DatePicker from "../../Inputs/Datepicker";
import { EvidenceHubModel } from "../../../../domain/models/Common/evidenceHub/evidenceHub.model";
import { EvidenceType } from "../../../../domain/enums/evidenceHub.enum";
import Field from "../../Inputs/Field";
import { useTheme } from "@mui/material";
import CustomizableMultiSelect from "../../Inputs/Select/Multi";

interface NewEvidenceHubProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSuccess?: (data: EvidenceHubModel) => void;
  onError?: (error: any) => void;
  initialData?: EvidenceHubModel;
  isEdit?: boolean;
  preselectedModelId?: number;
}

export interface FileResponse {
  id: string | number;
  filename: string;
  size: number | string;
  mimetype: string;
  uploaded_by: number;
  upload_date: string;
}

export interface ModelOption {
  _id: number;
  name: string;
}

interface NewEvidenceHubFormErrors {
  evidence_name?: string;
  evidence_type?: string;
  mapped_model_ids?: string;
  files?: string;
  description?: string;
  expiry_date?: string;
}

const evidenceTypes = [
  { _id: "all", name: "All evidence type" },
  { _id: EvidenceType.MODEL_CARD, name: "Model Card" },
  {
    _id: EvidenceType.RISK_ASSESSMENT_REPORT,
    name: "Risk Assessment Report",
  },
  {
    _id: EvidenceType.BIAS_AND_FAIRNESS_REPORT,
    name: "Bias and Fairness Report",
  },
  {
    _id: EvidenceType.SECURITY_ASSESSMENT_REPORT,
    name: "Security Assessment Report",
  },
  {
    _id: EvidenceType.DATA_PROTECTION_IMPACT_ASSESSMENT,
    name: "Data Protection Impact Assessment",
  },
  {
    _id: EvidenceType.ROBUSTNESS_AND_STRESS_TEST_REPORT,
    name: "Robustness and Stress Test Report",
  },
  {
    _id: EvidenceType.EVALUATION_METRICS_SUMMARY,
    name: "Evaluation Metrics Summary",
  },
  { _id: EvidenceType.HUMAN_OVERSIGHT_PLAN, name: "Human Oversight Plan" },
  {
    _id: EvidenceType.POST_MARKET_MONITORING_PLAN,
    name: "Post-Market Monitoring Plan",
  },
  { _id: EvidenceType.VERSION_CHANGE_LOG, name: "Version Change Log" },
  {
    _id: EvidenceType.THIRD_PARTY_AUDIT_REPORT,
    name: "Third-Party Audit Report",
  },
  {
    _id: EvidenceType.CONFORMITY_ASSESSMENT_REPORT,
    name: "Conformity Assessment Report",
  },
  {
    _id: EvidenceType.TECHNICAL_FILE,
    name: "Technical File / CE Documentation",
  },
  {
    _id: EvidenceType.VENDOR_MODEL_DOCUMENTATION,
    name: "Vendor Model Documentation",
  },
  {
    _id: EvidenceType.INTERNAL_APPROVAL_RECORD,
    name: "Internal Approval Record",
  },
];

const initialState: EvidenceHubModel = {
  evidence_name: "",
  evidence_type: "",
  description: "",
  mapped_model_ids: [],
  expiry_date: null,
  evidence_files: [] as FileResponse[],
};

const NewEvidenceHub: FC<NewEvidenceHubProps> = ({
  isOpen,
  setIsOpen,
  onSuccess,
  onError,
  initialData,
  isEdit = false,
  preselectedModelId,
}) => {
  const [values, setValues] = useState<EvidenceHubModel>(
    initialData || initialState
  );
  const [errors, setErrors] = useState<NewEvidenceHubFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);

  const theme = useTheme();

  // Reset on open/close
  useEffect(() => {
    if (isOpen) {
      const baseValues = initialData || initialState;
      // If creating new evidence from a model modal, include that model ID
      if (!isEdit && preselectedModelId) {
        setValues({
          ...baseValues,
          mapped_model_ids: [preselectedModelId],
        });
      } else {
        setValues(baseValues);
      }
      setErrors({});
      setIsSubmitting(false);
      fetchModels();
    } else {
      setValues(initialState);
      setErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, initialData, isEdit, preselectedModelId]);

  // Fetch models for multi-select
  const fetchModels = async () => {
    try {
      const response = await getAllEntities({
        routeUrl: "/modelInventory",
      });
      if (response?.data) {
        const options = response.data.map((m: any) => ({
          _id: m.id,
          name: `${m.provider} - ${m.model}`,
        }));
        setModelOptions(options);
      }
    } catch (err) {
      console.error("Error fetching models:", err);
    }
  };

  const handleTextChange = useCallback(
    (field: keyof EvidenceHubModel) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setValues((prev) => ({ ...prev, [field]: event.target.value }));
        setErrors((prev) => ({ ...prev, [field]: "" }));
      },
    []
  );

  const handleSelectChange = useCallback(
    (field: keyof EvidenceHubModel) => (event: any) => {
      setValues((prev) => ({ ...prev, [field]: event.target.value }));
      setErrors((prev) => ({ ...prev, [field]: "" }));
    },
    []
  );

  const handleDateChange = useCallback((newDate: Dayjs | null) => {
    setValues((prev) => ({
      ...prev,
      expiry_date: newDate?.isValid() ? newDate.toDate() : null,
    }));
    // Clear expiry date error when corrected
    setErrors((prev) => ({
      ...prev,
      expiry_date: "",
    }));
  }, []);

  const handleUploadSuccess = (files: FileResponse[]) => {
    setValues((prev) => ({
      ...prev,
      evidence_files: [
        ...prev.evidence_files,
        ...files.map((file) => ({
          id: file.id,
          filename: file.filename,
          size: file.size,
          mimetype: file.mimetype,
          uploaded_by: file.uploaded_by,
          upload_date: file.upload_date,
        })),
      ],
    }));
    setErrors((prev) => ({ ...prev, files: "" }));
    setIsUploadModalOpen(false);
  };

  const handleRemoveFile = (id: string | number) => {
    setValues((prev) => ({
      ...prev,
      evidence_files: prev.evidence_files.filter((f) => f.id !== id),
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: NewEvidenceHubFormErrors = {};

    // Evidence Name
    if (!values.evidence_name?.trim()) {
      newErrors.evidence_name = "Evidence name is required";
    }

    // Evidence Type
    if (!values.evidence_type) {
      newErrors.evidence_type = "Evidence type is required";
    }

    // Description required
    if (!values.description?.trim()) {
      newErrors.description = "Description is required";
    }

    // Expiry date should not be in the past
    if (values.expiry_date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const expiry = new Date(values.expiry_date);
      expiry.setHours(0, 0, 0, 0);

      if (expiry < today) {
        newErrors.expiry_date = "Expiry date cannot be in the past";
      }
    }

    // File Upload validation (at least 1 file required)
    if (!values.evidence_files || values.evidence_files.length === 0) {
      newErrors.files = "Please upload at least one file";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      if (onSuccess) onSuccess(values);
      setIsOpen(false);
    } catch (error) {
      setIsSubmitting(false);
      if (onError) onError(error);
    }
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title={isEdit ? "Edit evidence" : "Add new evidence"}
      description={
        isEdit
          ? "Update evidence details, mapped models, and files"
          : "Register new evidence with details and file attachments"
      }
      onSubmit={handleSubmit}
      submitButtonText={isEdit ? "Update" : "Save"}
      isSubmitting={isSubmitting}
      maxWidth="760px"
    >
      <Stack spacing={6}>
        {/* First Row: Evidence Name and Type */}
        <Stack direction="row" spacing={6}>
          <Box sx={{ flex: 1 }}>
            <Suspense fallback={<div>Loading...</div>}>
              <Field
                id="evidence-name"
                label="Evidence name"
                width="100%"
                value={values.evidence_name}
                onChange={handleTextChange("evidence_name")}
                error={errors.evidence_name}
                isRequired
                placeholder="Evidence name"
              />
            </Suspense>
          </Box>
          <Box sx={{ flex: 1 }}>
            <SelectComponent
              id="evidence-type"
              label="Evidence type"
              items={evidenceTypes}
              value={values.evidence_type}
              onChange={handleSelectChange("evidence_type")}
              error={errors.evidence_type}
              placeholder="Select evidence type"
              isRequired
              sx={{ width: "100%" }}
            />
          </Box>
        </Stack>

        {/* Second Row: Mapped Models (full width) */}
        <Suspense fallback={<div>Loading...</div>}>
          <CustomizableMultiSelect
            label="Mapped models"
            value={values.mapped_model_ids || []}
            onChange={(event) => {
              setValues({
                ...values,
                mapped_model_ids: event.target.value as number[],
              });
            }}
            items={modelOptions}
            placeholder="Select models"
            error={errors.mapped_model_ids}
            sx={{ width: "100%" }}
          />
        </Suspense>

        {/* Third Row: Description (full width) */}
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="description"
            label="Description"
            width="100%"
            value={values.description || ""}
            onChange={handleTextChange("description")}
            isRequired
            placeholder="Description"
            error={errors.description}
          />
        </Suspense>

        {/* Fourth Row: Expiry date (half width) */}
        <Stack direction="row" spacing={6}>
          <Box sx={{ flex: 1 }}>
            <Suspense fallback={<div>Loading...</div>}>
              <DatePicker
                label="Expiry date"
                date={values.expiry_date ? dayjs(values.expiry_date) : null}
                handleDateChange={handleDateChange}
                sx={{
                  width: "100%",
                  backgroundColor: theme.palette.background.main,
                }}
                error={errors.expiry_date}
              />
            </Suspense>
          </Box>
          {/* Empty second column to match 2-column layout */}
          <Box sx={{ flex: 1 }} />
        </Stack>

        {/* File Upload Section */}
        <Stack direction="row" spacing={2}>
          <CustomizableButton
            variant="contained"
            text={
              values.evidence_files?.length ? "Add more files" : "Upload files"
            }
            icon={<UploadIcon size={16} />}
            onClick={() => setIsUploadModalOpen(true)}
          />
        </Stack>

        {errors.files && (
          <Typography
            variant="caption"
            sx={{
              mt: 1,
              color: "#f04438",
              fontWeight: 300,
              fontSize: 11,
            }}
          >
            {errors.files}
          </Typography>
        )}

        {values.evidence_files?.length > 0 && (
          <Stack spacing={2}>
            {values.evidence_files.map((file) => (
              <Box
                key={file.id}
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                p={1.5}
                border={`1px solid #ddd`}
                borderRadius={1}
              >
                <Box>
                  <Typography variant="body2">
                    <strong>File:</strong> {file.filename}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Size:</strong>{" "}
                    {(Number(file.size) / 1024 / 1024).toFixed(2)} MB
                  </Typography>
                </Box>
                <Tooltip title="Remove file" arrow>
                  <IconButton
                    onClick={() => handleRemoveFile(file.id)}
                    edge="end"
                    size="small"
                    sx={{
                      padding: "4px",
                      bgcolor: "background.surface",
                      "&:hover": { bgcolor: "#e0e0e0" },
                    }}
                  >
                    <DeleteIconGrey size={18} />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Stack>
        )}

        <FileManagerUploadModal
          open={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={handleUploadSuccess}
        />
      </Stack>
    </StandardModal>
  );
};

export default NewEvidenceHub;
