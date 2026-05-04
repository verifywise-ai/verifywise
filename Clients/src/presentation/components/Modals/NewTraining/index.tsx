import React, { FC, useState, useMemo, useCallback, useEffect } from "react";
import { useTheme, Stack, Box, SelectChangeEvent } from "@mui/material";
import { Suspense, lazy } from "react";
const Field = lazy(() => import("../../Inputs/Field"));
import Select from "../../Inputs/Select";

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
  const handleSubmit = useCallback(
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
      backgroundColor: theme.palette.background.main,
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
          <Suspense fallback={<div>Loading...</div>}>
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
          </Suspense>
        </Box>
        <Box sx={{ width: "350px" }}>
          <Suspense fallback={<div>Loading...</div>}>
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
          </Suspense>
        </Box>
      </Stack>
      <Stack direction="row" spacing={6}>
        <Box sx={{ width: "350px" }}>
          <Suspense fallback={<div>Loading...</div>}>
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
          </Suspense>
        </Box>
        <Box sx={{ width: "350px" }}>
          <Suspense fallback={<div>Loading...</div>}>
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
          </Suspense>
        </Box>
      </Stack>
      <Stack direction="row" spacing={6}>
        <Box sx={{ width: "350px" }}>
          <Suspense fallback={<div>Loading...</div>}>
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
          </Suspense>
        </Box>
        <Box sx={{ width: "350px" }}>
          <Suspense fallback={<div>Loading...</div>}>
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
          </Suspense>
        </Box>
      </Stack>
      <Box sx={{ width: "100%" }}>
        <Suspense fallback={<div>Loading...</div>}>
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
        </Suspense>
      </Box>
    </Stack>
  );

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? "Edit training" : "New training"}
      description="Record and manage your organization's AI literacy and compliance trainings. Enter training details such as name, provider, duration, department, participants, and status to keep a clear history of all AI-related education initiatives."
      onSubmit={activeTab === "details" ? handleSubmit : undefined}
      submitButtonText={isEdit ? "Update training" : "Create training"}
      maxWidth="680px"
    >
      {isEdit && entityId ? (
        <TabContext value={activeTab}>
          <Box sx={{ marginBottom: 3 }}>
            <TabBar
              tabs={[
                { label: "Training details", value: "details", icon: "GraduationCap" },
                { label: "Activity", value: "activity", icon: "History" },
              ]}
              activeTab={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
            />
          </Box>
          {activeTab === "details" && formContent}
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
