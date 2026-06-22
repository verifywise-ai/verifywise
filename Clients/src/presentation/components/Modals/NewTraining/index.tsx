import React, { FC, useState, useMemo, useCallback, useEffect } from "react";
import {
  useTheme,
  Stack,
  Box,
  SelectChangeEvent,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import Field from "../../Inputs/Field";
import Select from "../../Inputs/Select";
import { CirclePlus as AddCircleOutlineIcon, Trash2 } from "lucide-react";

import { useModalKeyHandling } from "../../../../application/hooks/useModalKeyHandling";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import {
  TrainingRegistarDTO,
  NewTrainingProps,
} from "../../../../domain/models/Common/trainingRegistar/trainingRegistar.model";
import { TrainingStatus } from "../../../../domain/enums/status.enum";
import StandardModal from "../StandardModal";
import TabBar from "../../TabBar";
import { TabContext } from "@mui/lab";
import { HistorySidebar } from "../../Common/HistorySidebar";
import { logEngine } from "../../../../application/tools/log.engine";
import NewTrainingEvidence from "../NewTrainingEvidence";
import { EvidenceHubModel } from "../../../../domain/models/Common/evidenceHub/evidenceHub.model";
import {
  getAllEntities,
  deleteEntityById,
} from "../../../../application/repository/entity.repository";
import { createEvidenceHub } from "../../../../application/repository/evidenceHub.repository";
import { CustomizableButton } from "../../button/customizable-button";

type TrainingFormState = Omit<Partial<TrainingRegistarDTO>, "status"> & {
  status: TrainingStatus;
};

const initialState: TrainingFormState = {
  training_name: "",
  duration: "",
  provider: "",
  department: "",
  status: TrainingStatus.Planned,
  numberOfPeople: undefined, // Defensive: Don't default to 0
  description: "",
};

const statusOptions: Array<{ _id: string; name: string }> = [
  { _id: TrainingStatus.Planned, name: "Planned" },
  { _id: TrainingStatus.InProgress, name: "In Progress" },
  { _id: TrainingStatus.Completed, name: "Completed" },
];

const NewTraining: FC<NewTrainingProps> = ({
  isOpen,
  setIsOpen,
  onSuccess,
  initialData,
  isEdit = false,
  entityId,
}) => {
  const theme = useTheme();
  const [values, setValues] = useState<TrainingFormState>(initialData || initialState);
  const validators = useMemo(
    () => ({
      training_name: (v: unknown) => {
        const r = checkStringValidation("Training name", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      duration: (v: unknown) => {
        const r = checkStringValidation("Duration", v as string, 1, 128);
        return r.accepted ? "" : r.message;
      },
      provider: (v: unknown) => {
        const r = checkStringValidation("Provider", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      department: (v: unknown) => {
        const r = checkStringValidation("Department", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      status: (v: unknown) => (!v ? "Status is required." : ""),
      numberOfPeople: (v: unknown) => {
        const numValue = Number(v);
        if (!v || isNaN(numValue) || numValue < 1) {
          return "Number of people is required and must be a positive number.";
        }
        return "";
      },
    }),
    [],
  );
  const { errors, validateAll, clearFieldError, resetErrors } =
    useFormValidation<TrainingFormState>(validators);
  const [activeTab, setActiveTab] = useState("details");

  // Evidence tab state — only used in edit mode where we have an entityId
  const [evidenceList, setEvidenceList] = useState<EvidenceHubModel[]>([]);
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [deletingEvidenceId, setDeletingEvidenceId] = useState<number | null>(null);

  const fetchEvidenceForTraining = useCallback(async () => {
    if (!entityId) return;
    setIsEvidenceLoading(true);
    try {
      const response = await getAllEntities({ routeUrl: "/evidenceHub" });
      if (response?.data) {
        const list = (response.data as EvidenceHubModel[]).filter(
          (e) =>
            Array.isArray(e.mapped_training_ids) &&
            e.mapped_training_ids.includes(Number(entityId)),
        );
        setEvidenceList(list);
      }
    } catch (error) {
      logEngine({ type: "error", message: `Failed to fetch training evidence: ${error}` });
    } finally {
      setIsEvidenceLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    if (isOpen && activeTab === "evidence" && entityId) {
      fetchEvidenceForTraining();
    }
  }, [isOpen, activeTab, entityId, fetchEvidenceForTraining]);

  const handleEvidenceUploadSuccess = useCallback(
    async (formData: EvidenceHubModel) => {
      try {
        await createEvidenceHub("/evidenceHub", formData);
        await fetchEvidenceForTraining();
        setIsUploadModalOpen(false);
      } catch (error) {
        logEngine({ type: "error", message: `Failed to upload training evidence: ${error}` });
      }
    },
    [fetchEvidenceForTraining],
  );

  const handleDeleteEvidence = useCallback(
    async (id: number) => {
      try {
        setDeletingEvidenceId(id);
        await deleteEntityById({ routeUrl: `/evidenceHub/${id}` });
        await fetchEvidenceForTraining();
      } catch (error) {
        logEngine({ type: "error", message: `Failed to delete training evidence: ${error}` });
      } finally {
        setDeletingEvidenceId(null);
      }
    },
    [fetchEvidenceForTraining],
  );

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
      resetErrors();
    }
  }, [isOpen]);

  // Handler: Text field change with proper typing (Type Safety)
  const handleOnTextFieldChange = useCallback(
    (prop: keyof TrainingRegistarDTO) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;

      // Defensive: Handle number fields explicitly
      if (prop === "numberOfPeople") {
        // Don't default to 0 - let validation catch empty values
        const numValue = value === "" ? undefined : Number(value);
        if (numValue === undefined || (!isNaN(numValue) && numValue >= 0)) {
          setValues((prev) => ({
            ...prev,
            numberOfPeople: numValue,
          }));
        }
      } else {
        setValues((prev) => ({ ...prev, [prop]: value }));
      }

      // Clear error for this field
      clearFieldError(prop as keyof TrainingFormState);
    },
    [clearFieldError],
  );

  // Handler: Select change with proper typing (Type Safety)
  // DEFENSIVE: Cast value to TrainingStatus to ensure type safety end-to-end
  const handleOnSelectChange = useCallback(
    (prop: keyof TrainingRegistarDTO) => (event: SelectChangeEvent<string | number>) => {
      const value = event.target.value as TrainingStatus;
      setValues((prev) => ({ ...prev, [prop]: value }));
      clearFieldError(prop as keyof TrainingFormState);
    },
    [clearFieldError],
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setActiveTab("details");
  }, [setIsOpen]);

  // Submit: With error boundary (Defensive Programming)
  // Await the onSuccess callback and only close modal on success
  const handleSaveTraining = useCallback(
    async (event?: React.FormEvent) => {
      if (event) event.preventDefault();

      if (!validateAll(values)) return;

      // Defensive: Guard against undefined callback
      if (!onSuccess) {
        logEngine({
          type: "error",
          message: "onSuccess callback not provided",
        });
        handleClose();
        return;
      }

      try {
        // Call success callback with validated data and await result
        // Type assertion: After validation, all required fields are guaranteed to exist
        const success = await onSuccess(values as TrainingRegistarDTO);

        // Only close modal if save was successful
        if (success) {
          handleClose();
        } else {
          // Failed to save - keep modal open, show generic error if parent didn't set specific one
          logEngine({
            type: "error",
            message: "Save operation failed, keeping modal open",
          });
          // Parent handler is responsible for setting the specific error alert
        }
      } catch (error) {
        // Defensive: Catch errors from parent callback (if they throw instead of returning false)
        logEngine({
          type: "error",
          message: `Error in onSuccess callback: ${error}`,
        });
        // Keep modal open to preserve user input
      }
    },
    [values, onSuccess, handleClose, validateAll],
  );

  const fieldStyle = useMemo(
    () => ({
      "backgroundColor": theme.palette.background.main,
      "& input": {
        padding: "0 14px",
      },
    }),
    [theme.palette.background.main],
  );

  useModalKeyHandling({
    isOpen,
    onClose: handleClose,
  });

  const formContent = (
    <Stack spacing={6}>
      <Stack direction="row" spacing={6}>
        <Box sx={{ width: "350px" }}>
          <Field
            id="training-name"
            label="Training name"
            value={values.training_name}
            onChange={handleOnTextFieldChange("training_name")}
            error={errors.training_name}
            isRequired
            sx={fieldStyle}
            placeholder="e.g., Introduction to AI Ethics"
          />
        </Box>
        <Box sx={{ width: "350px" }}>
          <Field
            id="duration"
            label="Duration"
            value={values.duration}
            onChange={handleOnTextFieldChange("duration")}
            error={errors.duration}
            isRequired
            sx={fieldStyle}
            type="text"
            placeholder="e.g., 2 hours, 3 days, 6 weeks"
          />
        </Box>
      </Stack>
      <Stack direction="row" spacing={6}>
        <Box sx={{ width: "350px" }}>
          <Field
            id="provider"
            label="Provider"
            value={values.provider}
            onChange={handleOnTextFieldChange("provider")}
            error={errors.provider}
            isRequired
            sx={fieldStyle}
            placeholder="e.g., VerifyWise, External Vendor, Internal Team"
          />
        </Box>
        <Box sx={{ width: "350px" }}>
          <Field
            id="department"
            label="Department"
            value={values.department}
            onChange={handleOnTextFieldChange("department")}
            error={errors.department}
            isRequired
            sx={fieldStyle}
            placeholder="e.g., Compliance, Engineering, HR"
          />
        </Box>
      </Stack>
      <Stack direction="row" spacing={6}>
        <Box sx={{ width: "350px" }}>
          <Select
            items={statusOptions}
            value={values.status}
            error={errors.status}
            sx={{ width: "100%" }}
            id="status"
            label="Status"
            isRequired
            onChange={handleOnSelectChange("status")}
            placeholder="Select status"
          />
        </Box>
        <Box sx={{ width: "350px" }}>
          <Field
            id="number-of-people"
            label="Number of people"
            value={values.numberOfPeople?.toString() || ""}
            onChange={handleOnTextFieldChange("numberOfPeople")}
            error={errors.numberOfPeople}
            isRequired
            sx={fieldStyle}
            type="number"
            placeholder="Enter total participants (e.g., 25)"
          />
        </Box>
      </Stack>
      <Box sx={{ width: "100%" }}>
        <Field
          id="description"
          label="Description"
          type="description"
          value={values.description}
          onChange={handleOnTextFieldChange("description")}
          error={errors.description}
          sx={fieldStyle}
          placeholder="Provide a short overview of the training goals and content"
        />
      </Box>
    </Stack>
  );

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? "Edit training" : "New training"}
      description="Record and manage your organization's AI literacy and compliance trainings. Enter training details such as name, provider, duration, department, participants, and status to keep a clear history of all AI-related education initiatives."
      onSubmit={activeTab === "details" ? handleSaveTraining : undefined}
      hideSubmitButton={activeTab !== "details"}
      submitButtonText={isEdit ? "Update training" : "Create training"}
      maxWidth="680px"
    >
      {isEdit && entityId ? (
        <TabContext value={activeTab}>
          <Box sx={{ marginBottom: 3 }}>
            <TabBar
              tabs={[
                { label: "Training details", value: "details", icon: "GraduationCap" },
                {
                  label: "Evidence",
                  value: "evidence",
                  icon: "Database",
                  count: evidenceList.length,
                  isLoading: isEvidenceLoading,
                },
                { label: "Activity", value: "activity", icon: "History" },
              ]}
              activeTab={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
            />
          </Box>
          {activeTab === "details" && formContent}
          {activeTab === "evidence" && (
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                <Typography
                  sx={{
                    fontSize: 13,
                    color: "text.secondary",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  Upload certificates, attendance proofs, or other compliance evidence for this
                  training.
                </Typography>
                <Box sx={{ flexShrink: 0 }}>
                  <CustomizableButton
                    variant="contained"
                    sx={{
                      backgroundColor: "brand.primary",
                      border: "1px solid brand.primary",
                      gap: 1,
                      whiteSpace: "nowrap",
                      minWidth: "160px",
                      height: 34,
                    }}
                    text="Upload evidence"
                    icon={<AddCircleOutlineIcon size={16} />}
                    onClick={() => setIsUploadModalOpen(true)}
                  />
                </Box>
              </Stack>

              <TableContainer
                sx={{
                  border: "1px solid",
                  borderColor: "border.light",
                  borderRadius: "4px",
                }}
              >
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "background.accent" }}>
                      <TableCell sx={{ fontSize: 11, fontWeight: 600, color: "text.icon" }}>
                        EVIDENCE NAME
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, fontWeight: 600, color: "text.icon" }}>
                        TYPE
                      </TableCell>
                      <TableCell
                        sx={{ fontSize: 11, fontWeight: 600, color: "text.icon" }}
                        align="center"
                      >
                        FILES
                      </TableCell>
                      <TableCell sx={{ width: 48 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {isEvidenceLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                          <CircularProgress size={20} />
                        </TableCell>
                      </TableRow>
                    ) : evidenceList.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          align="center"
                          sx={{ py: 5, color: "text.icon", fontSize: 13 }}
                        >
                          No evidence uploaded yet for this training.
                        </TableCell>
                      </TableRow>
                    ) : (
                      evidenceList.map((evidence) => {
                        const fileCount = evidence.evidence_files?.length ?? 0;
                        return (
                          <TableRow key={evidence.id} hover>
                            <TableCell
                              sx={{
                                fontSize: 13,
                                color: "text.primary",
                                maxWidth: 220,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {evidence.evidence_name || "-"}
                            </TableCell>
                            <TableCell sx={{ fontSize: 13, color: "text.secondary" }}>
                              {evidence.evidence_type || "-"}
                            </TableCell>
                            <TableCell
                              align="center"
                              sx={{ fontSize: 13, color: "text.secondary" }}
                            >
                              {fileCount}
                            </TableCell>
                            <TableCell align="right" sx={{ width: 48 }}>
                              <Tooltip title="Delete evidence">
                                <span>
                                  <IconButton
                                    size="small"
                                    disabled={deletingEvidenceId === evidence.id}
                                    onClick={() => evidence.id && handleDeleteEvidence(evidence.id)}
                                    sx={{ color: "text.icon" }}
                                  >
                                    {deletingEvidenceId === evidence.id ? (
                                      <CircularProgress size={14} />
                                    ) : (
                                      <Trash2 size={14} />
                                    )}
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <NewTrainingEvidence
                isOpen={isUploadModalOpen}
                setIsOpen={setIsUploadModalOpen}
                onSuccess={handleEvidenceUploadSuccess}
                trainingId={Number(entityId)}
              />
            </Stack>
          )}
          {activeTab === "activity" && (
            <HistorySidebar inline isOpen={true} entityType="training" entityId={entityId} />
          )}
        </TabContext>
      ) : (
        formContent
      )}
    </StandardModal>
  );
};

export default NewTraining;
