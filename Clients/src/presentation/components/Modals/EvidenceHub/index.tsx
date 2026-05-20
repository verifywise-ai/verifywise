/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { FC, useState, useEffect, useCallback, Suspense } from "react";
import { Stack, Box, Typography, IconButton, Tooltip, Chip } from "@mui/material";
import StepperModal from "../StepperModal";
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
import TagInput from "../../Inputs/TagInput";

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

const WIZARD_STEPS = [
  "Upload files",
  "Classification",
  "Tags & metadata",
  "Frameworks & models",
  "Assignment",
];

const FRAMEWORK_OPTIONS = [
  "EU AI Act",
  "ISO 42001",
  "ISO 27001",
  "NIST AI RMF",
  "SOC 2",
  "GDPR",
  "HIPAA",
];

const RETENTION_OPTIONS = [
  { _id: "30_days", name: "30 days" },
  { _id: "90_days", name: "90 days" },
  { _id: "6_months", name: "6 months" },
  { _id: "1_year", name: "1 year" },
  { _id: "3_years", name: "3 years" },
  { _id: "5_years", name: "5 years" },
  { _id: "7_years", name: "7 years" },
  { _id: "indefinite", name: "Indefinite" },
];

const TAG_SUGGESTIONS = [
  "policy",
  "risk",
  "control mapping",
  "audit",
  "compliance",
  "security",
  "privacy",
  "training",
  "monitoring",
];

const evidenceTypes = [
  { _id: EvidenceType.MODEL_CARD, name: "Model Card" },
  { _id: EvidenceType.RISK_ASSESSMENT_REPORT, name: "Risk Assessment Report" },
  { _id: EvidenceType.BIAS_AND_FAIRNESS_REPORT, name: "Bias and Fairness Report" },
  { _id: EvidenceType.SECURITY_ASSESSMENT_REPORT, name: "Security Assessment Report" },
  {
    _id: EvidenceType.DATA_PROTECTION_IMPACT_ASSESSMENT,
    name: "Data Protection Impact Assessment",
  },
  {
    _id: EvidenceType.ROBUSTNESS_AND_STRESS_TEST_REPORT,
    name: "Robustness and Stress Test Report",
  },
  { _id: EvidenceType.EVALUATION_METRICS_SUMMARY, name: "Evaluation Metrics Summary" },
  { _id: EvidenceType.HUMAN_OVERSIGHT_PLAN, name: "Human Oversight Plan" },
  { _id: EvidenceType.POST_MARKET_MONITORING_PLAN, name: "Post-Market Monitoring Plan" },
  { _id: EvidenceType.VERSION_CHANGE_LOG, name: "Version Change Log" },
  { _id: EvidenceType.THIRD_PARTY_AUDIT_REPORT, name: "Third-Party Audit Report" },
  { _id: EvidenceType.CONFORMITY_ASSESSMENT_REPORT, name: "Conformity Assessment Report" },
  { _id: EvidenceType.TECHNICAL_FILE, name: "Technical File / CE Documentation" },
  { _id: EvidenceType.VENDOR_MODEL_DOCUMENTATION, name: "Vendor Model Documentation" },
  { _id: EvidenceType.INTERNAL_APPROVAL_RECORD, name: "Internal Approval Record" },
];

const initialState: EvidenceHubModel = {
  evidence_name: "",
  evidence_type: "",
  description: "",
  mapped_model_ids: [],
  expiry_date: null,
  evidence_files: [] as FileResponse[],
  tags: [],
  framework_ids: [],
  reviewer_id: null,
  retention_policy: null,
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
  const [values, setValues] = useState<EvidenceHubModel>(initialData || initialState);
  const [errors, setErrors] = useState<NewEvidenceHubFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [userOptions, setUserOptions] = useState<{ _id: number; name: string }[]>([]);
  const [activeStep, setActiveStep] = useState(0);

  const theme = useTheme();

  useEffect(() => {
    if (isOpen) {
      const baseValues = initialData || initialState;
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
      setActiveStep(0);
      fetchModels();
      fetchUsers();
    } else {
      setValues(initialState);
      setErrors({});
      setIsSubmitting(false);
      setActiveStep(0);
    }
  }, [isOpen, initialData, isEdit, preselectedModelId]);

  const fetchModels = async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/modelInventory" });
      if (response?.data) {
        setModelOptions(
          response.data.map((m: any) => ({
            _id: m.id,
            name: `${m.provider} - ${m.model}`,
          })),
        );
      }
    } catch (err) {
      console.error("Error fetching models:", err);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/users" });
      if (response?.data) {
        setUserOptions(
          response.data.map((u: any) => ({
            _id: u.id,
            name: `${u.name}${u.surname ? ` ${u.surname}` : ""}`,
          })),
        );
      }
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  };

  const handleTextChange = useCallback(
    (field: keyof EvidenceHubModel) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues((prev) => ({ ...prev, [field]: event.target.value }));
      setErrors((prev) => ({ ...prev, [field]: "" }));
    },
    [],
  );

  const handleSelectChange = useCallback(
    (field: keyof EvidenceHubModel) => (event: any) => {
      setValues((prev) => ({ ...prev, [field]: event.target.value }));
      setErrors((prev) => ({ ...prev, [field]: "" }));
    },
    [],
  );

  const handleDateChange = useCallback((newDate: Dayjs | null) => {
    setValues((prev) => ({
      ...prev,
      expiry_date: newDate?.isValid() ? newDate.toDate() : null,
    }));
    setErrors((prev) => ({ ...prev, expiry_date: "" }));
  }, []);

  const handleUploadSuccess = (files: FileResponse[]) => {
    console.log("[NewEvidenceHub.handleUploadSuccess] received files:", files);
    const mapped = files.map((file) => ({
      id: file.id,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      uploaded_by: file.uploaded_by,
      upload_date: file.upload_date,
    }));
    console.log("[NewEvidenceHub.handleUploadSuccess] mapped into evidence_files shape:", mapped);
    setValues((prev) => {
      const next = {
        ...prev,
        evidence_files: [...prev.evidence_files, ...mapped],
      };
      console.log(
        "[NewEvidenceHub.handleUploadSuccess] evidence_files after merge:",
        next.evidence_files,
      );
      return next;
    });
    setErrors((prev) => ({ ...prev, files: "" }));
    setIsUploadModalOpen(false);
  };

  const handleRemoveFile = (id: string | number) => {
    setValues((prev) => ({
      ...prev,
      evidence_files: prev.evidence_files.filter((f) => f.id !== id),
    }));
  };

  const toggleFramework = (framework: string) => {
    setValues((prev) => {
      const current = prev.framework_ids || [];
      const updated = current.includes(framework)
        ? current.filter((f) => f !== framework)
        : [...current, framework];
      return { ...prev, framework_ids: updated };
    });
  };

  const validateCurrentStep = (): boolean => {
    const newErrors: NewEvidenceHubFormErrors = {};

    if (activeStep === 0) {
      if (!values.evidence_files || values.evidence_files.length === 0) {
        newErrors.files = "Please upload at least one file";
      }
    }

    if (activeStep === 1) {
      if (!values.evidence_name?.trim()) {
        newErrors.evidence_name = "Evidence name is required";
      }
      if (!values.evidence_type) {
        newErrors.evidence_type = "Evidence type is required";
      }
      if (!values.description?.trim()) {
        newErrors.description = "Description is required";
      }
      if (values.expiry_date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiry = new Date(values.expiry_date);
        expiry.setHours(0, 0, 0, 0);
        if (expiry < today) {
          newErrors.expiry_date = "Expiry date cannot be in the past";
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const canProceed = (): boolean => {
    if (activeStep === 0) {
      return values.evidence_files?.length > 0;
    }
    if (activeStep === 1) {
      return !!(values.evidence_name?.trim() && values.evidence_type && values.description?.trim());
    }
    return true;
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleSubmit = async () => {
    if (!validateCurrentStep()) return;

    setIsSubmitting(true);
    try {
      console.log("[NewEvidenceHub.handleSubmit] submitting evidence values:", values);
      console.log(
        "[NewEvidenceHub.handleSubmit] evidence_files count:",
        values.evidence_files?.length,
        "files:",
        values.evidence_files,
      );
      if (onSuccess) onSuccess(values);
      setIsOpen(false);
    } catch (error) {
      console.error("[NewEvidenceHub.handleSubmit] error:", error);
      setIsSubmitting(false);
      if (onError) onError(error);
    }
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <Stack spacing={6}>
            <Stack direction="row" spacing={2}>
              <CustomizableButton
                variant="contained"
                text={values.evidence_files?.length ? "Add more files" : "Upload files"}
                icon={<UploadIcon size={16} />}
                onClick={() => setIsUploadModalOpen(true)}
              />
            </Stack>

            {errors.files && (
              <Typography
                sx={{
                  mt: 1,
                  color: theme.palette.status.error.text,
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
                    border={`1px solid ${theme.palette.border.dark}`}
                    borderRadius={1}
                  >
                    <Box>
                      <Typography sx={{ fontSize: 13 }}>
                        <strong>File:</strong> {file.filename}
                      </Typography>
                      <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary }}>
                        <strong>Size:</strong> {(Number(file.size) / 1024 / 1024).toFixed(2)} MB
                      </Typography>
                    </Box>
                    <Tooltip title="Remove file" arrow>
                      <IconButton
                        onClick={() => handleRemoveFile(file.id)}
                        edge="end"
                        size="small"
                        aria-label="Remove file"
                        sx={{
                          "padding": "4px",
                          "&:hover": { bgcolor: theme.palette.background.fill },
                        }}
                      >
                        <DeleteIconGrey size={18} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
              </Stack>
            )}

            {values.evidence_files?.length === 0 && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "120px",
                  border: `1px dashed ${theme.palette.border.dark}`,
                  borderRadius: "4px",
                  color: theme.palette.text.tertiary,
                }}
              >
                <Typography sx={{ fontSize: 13 }}>
                  No files uploaded yet. Click the button above to upload.
                </Typography>
              </Box>
            )}

            <FileManagerUploadModal
              open={isUploadModalOpen}
              onClose={() => setIsUploadModalOpen(false)}
              onSuccess={handleUploadSuccess}
            />
          </Stack>
        );

      case 1:
        return (
          <Stack spacing={6}>
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

            <Suspense fallback={<div>Loading...</div>}>
              <Field
                id="description"
                label="Description"
                width="100%"
                value={values.description || ""}
                onChange={handleTextChange("description")}
                isRequired
                placeholder="Describe the evidence"
                error={errors.description}
              />
            </Suspense>

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
              <Box sx={{ flex: 1 }} />
            </Stack>
          </Stack>
        );

      case 2:
        return (
          <Stack spacing={6}>
            <TagInput
              label="Tags"
              value={values.tags || []}
              onChange={(tags) => setValues((prev) => ({ ...prev, tags }))}
              placeholder="Type and press Enter to add a tag"
              suggestions={TAG_SUGGESTIONS}
            />
          </Stack>
        );

      case 3:
        return (
          <Stack spacing={6}>
            <Stack spacing={1}>
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: theme.palette.text.secondary,
                }}
              >
                Related frameworks
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {FRAMEWORK_OPTIONS.map((framework) => {
                  const isSelected = (values.framework_ids || []).includes(framework);
                  return (
                    <Chip
                      key={framework}
                      label={framework}
                      onClick={() => toggleFramework(framework)}
                      sx={{
                        "height": "30px",
                        "fontSize": 13,
                        "fontWeight": 500,
                        "cursor": "pointer",
                        "backgroundColor": isSelected
                          ? theme.palette.status.success.bg
                          : theme.palette.background.accent,
                        "color": isSelected
                          ? theme.palette.status.success.text
                          : theme.palette.text.secondary,
                        "border": `1px solid ${
                          isSelected
                            ? theme.palette.status.success.border
                            : theme.palette.border.light
                        }`,
                        "&:hover": {
                          backgroundColor: isSelected
                            ? theme.palette.status.success.light
                            : theme.palette.background.fill,
                        },
                      }}
                    />
                  );
                })}
              </Box>
            </Stack>

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
          </Stack>
        );

      case 4:
        return (
          <Stack spacing={6}>
            <SelectComponent
              id="reviewer"
              label="Assign reviewer / owner"
              items={userOptions}
              value={values.reviewer_id ?? ""}
              onChange={(event: any) => {
                const val = event.target.value;
                setValues((prev) => ({
                  ...prev,
                  reviewer_id: val ? Number(val) : null,
                }));
              }}
              placeholder="Select a reviewer"
              sx={{ width: "100%" }}
            />

            <SelectComponent
              id="retention-policy"
              label="Retention / review cycle"
              items={RETENTION_OPTIONS}
              value={values.retention_policy ?? ""}
              onChange={(event: any) => {
                setValues((prev) => ({
                  ...prev,
                  retention_policy: event.target.value || null,
                }));
              }}
              placeholder="Select retention policy"
              sx={{ width: "100%" }}
            />
          </Stack>
        );

      default:
        return null;
    }
  };

  return (
    <StepperModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title={isEdit ? "Edit evidence" : "Add new evidence"}
      steps={WIZARD_STEPS}
      activeStep={activeStep}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={handleSubmit}
      canProceed={canProceed()}
      isSubmitting={isSubmitting}
      submitButtonText={isEdit ? "Update" : "Save"}
      maxWidth="900px"
    >
      {renderStepContent()}
    </StepperModal>
  );
};

export default NewEvidenceHub;
