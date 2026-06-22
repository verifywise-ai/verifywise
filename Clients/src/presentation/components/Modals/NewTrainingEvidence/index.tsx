/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { FC, useState, useEffect, useCallback, Suspense } from "react";
import { Stack, Box, Typography, IconButton, Tooltip } from "@mui/material";
import { UploadIcon, Trash2 as DeleteIcon } from "lucide-react";
import dayjs, { Dayjs } from "dayjs";
import StandardModal from "../StandardModal";
import { CustomizableButton } from "../../button/customizable-button";
import FileManagerUploadModal from "../FileManagerUpload";
import SelectComponent from "../../Inputs/Select";
import DatePicker from "../../Inputs/Datepicker";
import Field from "../../Inputs/Field";
import { EvidenceHubModel } from "../../../../domain/models/Common/evidenceHub/evidenceHub.model";
import { getAllEntities } from "../../../../application/repository/entity.repository";

export interface FileResponse {
  id: string | number;
  filename: string;
  size: number | string;
  mimetype: string;
  uploaded_by: number;
  upload_date: string;
}

interface NewTrainingEvidenceProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSuccess?: (data: EvidenceHubModel) => Promise<void> | void;
  /** When provided, the training is pinned (hidden) and used for mapped_training_ids. Otherwise the user picks one. */
  trainingId?: number;
  /** When provided, prefills the form for editing. */
  initialData?: EvidenceHubModel;
  isEdit?: boolean;
}

const TRAINING_EVIDENCE_TYPES = [
  { _id: "Training Certificate", name: "Training Certificate" },
  { _id: "Attendance Record", name: "Attendance Record" },
  { _id: "Course Completion", name: "Course Completion" },
  { _id: "Assessment Result", name: "Assessment Result" },
  { _id: "Other", name: "Other" },
];

interface FormState {
  evidence_name: string;
  evidence_type: string;
  description: string;
  expiry_date: Date | null;
  evidence_files: FileResponse[];
  selected_training_id: number | "";
}

const initialFormState: FormState = {
  evidence_name: "",
  evidence_type: "",
  description: "",
  expiry_date: null,
  evidence_files: [],
  selected_training_id: "",
};

interface FormErrors {
  evidence_name?: string;
  evidence_type?: string;
  files?: string;
  training?: string;
}

const NewTrainingEvidence: FC<NewTrainingEvidenceProps> = ({
  isOpen,
  setIsOpen,
  onSuccess,
  trainingId,
  initialData,
  isEdit = false,
}) => {
  const [values, setValues] = useState<FormState>(initialFormState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [trainingOptions, setTrainingOptions] = useState<{ _id: number; name: string }[]>([]);

  const trainingPickerNeeded = trainingId == null;

  useEffect(() => {
    if (!isOpen) return;
    const seeded: FormState = initialData
      ? {
          evidence_name: initialData.evidence_name || "",
          evidence_type: initialData.evidence_type || "",
          description: initialData.description || "",
          expiry_date: initialData.expiry_date ? new Date(initialData.expiry_date as any) : null,
          evidence_files: (initialData.evidence_files || []) as any,
          selected_training_id:
            Array.isArray(initialData.mapped_training_ids) &&
            initialData.mapped_training_ids.length > 0
              ? initialData.mapped_training_ids[0]
              : "",
        }
      : initialFormState;
    setValues(seeded);
    setErrors({});
    setIsSubmitting(false);
    if (!trainingPickerNeeded) return;
    (async () => {
      try {
        const response = await getAllEntities({ routeUrl: "/training" });
        if (response?.data) {
          setTrainingOptions(
            (response.data as any[])
              .filter((t) => t.id != null)
              .map((t) => ({
                _id: Number(t.id),
                name: t.training_name || `Training ${t.id}`,
              })),
          );
        }
      } catch (err) {
        console.error("Failed to fetch trainings:", err);
      }
    })();
  }, [isOpen, trainingPickerNeeded, initialData]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  const handleUploadSuccess = useCallback((files: FileResponse[]) => {
    const mapped = files.map((f) => ({
      id: f.id,
      filename: f.filename,
      size: f.size,
      mimetype: f.mimetype,
      uploaded_by: f.uploaded_by,
      upload_date: f.upload_date,
    }));
    setValues((prev) => ({
      ...prev,
      evidence_files: [...prev.evidence_files, ...mapped],
    }));
    setErrors((prev) => ({ ...prev, files: "" }));
    setIsUploadModalOpen(false);
  }, []);

  const handleRemoveFile = useCallback((id: string | number) => {
    setValues((prev) => ({
      ...prev,
      evidence_files: prev.evidence_files.filter((f) => f.id !== id),
    }));
  }, []);

  const handleSaveTrainingEvidence = useCallback(async () => {
    const nextErrors: FormErrors = {};
    if (!values.evidence_name.trim()) nextErrors.evidence_name = "Evidence name is required";
    if (!values.evidence_type) nextErrors.evidence_type = "Evidence type is required";
    if (values.evidence_files.length === 0) nextErrors.files = "Please upload at least one file";

    const effectiveTrainingId =
      trainingId ??
      (typeof values.selected_training_id === "number" ? values.selected_training_id : undefined);

    if (effectiveTrainingId == null) {
      nextErrors.training = "Please select a training";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (!onSuccess) {
      handleClose();
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = new EvidenceHubModel({
        evidence_name: values.evidence_name,
        evidence_type: values.evidence_type,
        description: values.description || null,
        expiry_date: values.expiry_date,
        mapped_training_ids: [effectiveTrainingId as number],
        mapped_model_ids: [],
        evidence_files: values.evidence_files as any,
        tags: [],
        framework_ids: [],
        reviewer_id: null,
        retention_policy: null,
      });
      await onSuccess(payload);
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  }, [values, trainingId, onSuccess, handleClose]);

  return (
    <>
      <StandardModal
        isOpen={isOpen}
        onClose={handleClose}
        title={isEdit ? "Edit training evidence" : "Upload training evidence"}
        description="Upload certificates, attendance proofs, or other compliance evidence for this training."
        onSubmit={handleSaveTrainingEvidence}
        submitButtonText={isEdit ? "Update evidence" : "Save evidence"}
        isSubmitting={isSubmitting}
        maxWidth="640px"
      >
        <Stack spacing={4}>
          {trainingPickerNeeded && (
            <Suspense fallback={<div>Loading...</div>}>
              <SelectComponent
                id="training"
                label="Training"
                items={trainingOptions}
                value={values.selected_training_id}
                onChange={(e: any) => {
                  const v = e.target.value;
                  setValues((prev) => ({
                    ...prev,
                    selected_training_id: v === "" ? "" : Number(v),
                  }));
                  setErrors((prev) => ({ ...prev, training: "" }));
                }}
                placeholder="Select a training"
                error={errors.training}
                isRequired
                sx={{ width: "100%" }}
              />
            </Suspense>
          )}

          {/* Files block */}
          <Stack spacing={1.5}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary" }}>
                Files{" "}
                {errors.files && (
                  <Box component="span" sx={{ color: "error.text", fontWeight: 400, ml: 1 }}>
                    {errors.files}
                  </Box>
                )}
              </Typography>
              <CustomizableButton
                variant="outlined"
                text={values.evidence_files.length ? "Add more files" : "Upload files"}
                icon={<UploadIcon size={14} />}
                onClick={() => setIsUploadModalOpen(true)}
                sx={{
                  gap: 1,
                  whiteSpace: "nowrap",
                  minWidth: "140px",
                  height: 32,
                }}
              />
            </Stack>

            {values.evidence_files.length > 0 ? (
              <Stack spacing={1}>
                {values.evidence_files.map((file) => (
                  <Box
                    key={file.id}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      padding: "8px 12px",
                      border: "1px solid",
                      borderColor: "border.light",
                      borderRadius: "4px",
                    }}
                  >
                    <Typography
                      sx={{
                        flex: 1,
                        fontSize: 13,
                        color: "text.primary",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.filename}
                    </Typography>
                    <Tooltip title="Remove file">
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveFile(file.id)}
                        sx={{ color: "text.icon" }}
                      >
                        <DeleteIcon size={14} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Box
                sx={{
                  textAlign: "center",
                  py: 3,
                  color: "text.icon",
                  fontSize: 12,
                  border: "1px dashed",
                  borderColor: "border.light",
                  borderRadius: "4px",
                }}
              >
                No files uploaded yet.
              </Box>
            )}
          </Stack>

          <Suspense fallback={<div>Loading...</div>}>
            <Field
              id="evidence-name"
              label="Evidence name"
              width="100%"
              value={values.evidence_name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setValues((prev) => ({ ...prev, evidence_name: e.target.value }));
                setErrors((prev) => ({ ...prev, evidence_name: "" }));
              }}
              error={errors.evidence_name}
              isRequired
              placeholder="e.g., Q1 2026 AI ethics certificate"
            />
          </Suspense>

          <Suspense fallback={<div>Loading...</div>}>
            <SelectComponent
              id="evidence-type"
              label="Type"
              items={TRAINING_EVIDENCE_TYPES}
              value={values.evidence_type}
              onChange={(e: any) => {
                setValues((prev) => ({ ...prev, evidence_type: e.target.value }));
                setErrors((prev) => ({ ...prev, evidence_type: "" }));
              }}
              placeholder="Select a type"
              error={errors.evidence_type}
              isRequired
              sx={{ width: "100%" }}
            />
          </Suspense>

          <Suspense fallback={<div>Loading...</div>}>
            <Field
              id="evidence-description"
              label="Description"
              type="description"
              value={values.description}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setValues((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Optional notes about this evidence"
            />
          </Suspense>

          <Suspense fallback={<div>Loading...</div>}>
            <DatePicker
              label="Expiry date"
              date={values.expiry_date ? dayjs(values.expiry_date) : null}
              handleDateChange={(date: Dayjs | null) =>
                setValues((prev) => ({
                  ...prev,
                  expiry_date: date?.isValid() ? date.toDate() : null,
                }))
              }
              sx={{ width: "100%" }}
            />
          </Suspense>
        </Stack>
      </StandardModal>

      <FileManagerUploadModal
        open={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </>
  );
};

export default NewTrainingEvidence;
