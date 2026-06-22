import { Box, Divider, Stack, Typography, useTheme } from "@mui/material";
import { FC, useEffect, useState, useMemo } from "react";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import StandardModal from "../StandardModal";
import Field from "../../Inputs/Field";
import { fieldStyle } from "../../Reporting/GenerateReport/GenerateReportFrom/styles";
import SelectComponent from "../../Inputs/Select";
import { CustomizableButton } from "../../button/customizable-button";
import { ReactComponent as AddCircleOutlineIcon } from "../../../assets/icons/plus-circle-dark_grey.svg";
import { ChevronDown } from "lucide-react";
import {
  addNewStep,
  stepNumberStyle,
  entitySelectStyle,
  stepContainerStyle,
  stepTitleStyle,
  removeStepLinkContainer,
  verticalStepDividerStyle,
  stepFieldsContainer,
  conditionsSelectStyle,
  descriptionFieldStyle,
} from "./style";
import AutoCompleteField from "../../Inputs/Autocomplete";
import { ApprovalWorkflowStepModel } from "../../../../domain/models/Common/approvalWorkflow/approvalWorkflowStepModel";
import { entities, conditions } from "./arrays";
import { ICreateApprovalWorkflowProps } from "src/domain/interfaces/i.approvalForkflow";
import { getAllUsers } from "../../../../application/repository/user.repository";
import { User } from "../../../../domain/types/User";

interface IApprovalWorkflowFlatValues {
  workflow_title: string;
  entity: number;
}

const CreateNewApprovalWorkflow: FC<ICreateApprovalWorkflowProps> = ({
  isOpen,
  setIsOpen,
  initialData,
  isEdit = false,
  onSuccess,
}) => {
  const theme = useTheme();
  const [stepErrors, setStepErrors] = useState<
    Array<{ step_name?: string; approver?: string; conditions?: string }>
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validators = useMemo(
    () => ({
      workflow_title: (v: unknown) =>
        !String(v ?? "").trim() ? "Workflow title is required." : "",
      entity: (v: unknown) => ((v as number) < 1 ? "Entity is required." : ""),
    }),
    [],
  );
  const { errors, validateAll, clearFieldError, resetErrors } =
    useFormValidation<IApprovalWorkflowFlatValues>(validators);

  const [stepsCount, setStepsCount] = useState(1);
  const [workflowTitle, setWorkflowTitle] = useState("");
  const [entity, setEntity] = useState(0);
  const [workflowSteps, setWorkflowSteps] = useState<ApprovalWorkflowStepModel[]>([]);
  const [users, setUsers] = useState<Array<{ _id: number; name: string; surname?: string }>>([]);

  // Fetch users on mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await getAllUsers();
        const usersData = response?.data || [];
        setUsers(
          usersData.map((user: User) => ({
            _id: user.id,
            name: user.name,
            surname: user.surname,
          })),
        );
      } catch (error) {
        console.error("Failed to fetch users:", error);
        setUsers([]);
      }
    };

    fetchUsers();
  }, []);

  useEffect(() => {
    if (initialData && isEdit) {
      setWorkflowTitle(initialData.workflow_title || "");
      setEntity(initialData.entity);
      if (initialData.steps && initialData.steps.length > 0) {
        // Steps are already ApprovalWorkflowStepModel instances, just use them directly
        setWorkflowSteps([...initialData.steps]);
        setStepsCount(initialData.steps.length);
      } else {
        setWorkflowSteps([new ApprovalWorkflowStepModel()]);
        setStepsCount(1);
      }
    } else {
      clearForm();
    }
  }, [initialData, isEdit]);

  const clearForm = () => {
    setWorkflowTitle("");
    setEntity(0);
    setWorkflowSteps([new ApprovalWorkflowStepModel()]);
    setStepsCount(1);
    resetErrors();
    setStepErrors([]);
  };

  const clearStepFieldError = (
    stepIndex: number,
    field: "step_name" | "approver" | "conditions",
  ) => {
    setStepErrors((prev) => {
      const updated = [...prev];
      if (updated[stepIndex]) {
        updated[stepIndex] = { ...updated[stepIndex], [field]: undefined };
      }
      return updated;
    });
  };

  const validateSteps = (): boolean => {
    const newStepErrors = workflowSteps.map((step) => ({
      step_name: !step.step_name?.trim() ? "Step name is required." : undefined,
      approver: !step.approver_ids?.length ? "At least one approver is required." : undefined,
      conditions:
        step.requires_all_approvers === undefined || step.requires_all_approvers === null
          ? "Conditions are required."
          : undefined,
    }));
    setStepErrors(newStepErrors);
    return !newStepErrors.some((e) => e.step_name || e.approver || e.conditions);
  };

  const handleSave = () => {
    const flatValues: IApprovalWorkflowFlatValues = { workflow_title: workflowTitle, entity };
    const flatValid = validateAll(flatValues);
    const stepsValid = validateSteps();
    if (flatValid && stepsValid) {
      setIsSubmitting(true);
      const formData = {
        workflow_title: workflowTitle.trim(),
        entity: entity,
        steps: workflowSteps.map(
          (step) =>
            new ApprovalWorkflowStepModel({
              step_name: step.step_name?.trim() || "",
              approver_ids: step.approver_ids || [],
              requires_all_approvers: step.requires_all_approvers ?? false,
              description: step.description?.trim() || "",
            }),
        ),
      };
      clearForm();
      onSuccess?.(formData);
      setIsSubmitting(false);
    }
  };

  const handleNewStepClick = () => {
    setWorkflowSteps([...workflowSteps, new ApprovalWorkflowStepModel()]);
    setStepsCount(stepsCount + 1);
  };

  const removeStep = (stepIndex: number) => {
    const updatedSteps = workflowSteps.filter((_, index) => index !== stepIndex);
    setWorkflowSteps(updatedSteps);
    setStepsCount(updatedSteps.length);
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={() => {
        clearForm();
        setIsOpen();
      }}
      title={isEdit ? "Edit approval workflow" : "New approval workflow"}
      description="Define a structured approval workflow with multiple steps, approvers, and conditions to ensure proper oversight and compliance."
      maxWidth="680px"
      onSubmit={handleSave}
      submitButtonText={isEdit ? "Update" : "Create workflow"}
      isSubmitting={isSubmitting}
    >
      <Stack spacing={8}>
        <Stack direction="row" spacing={6}>
          <Field
            id="title"
            label="Workflow title"
            width="50%"
            error={errors.workflow_title}
            isRequired
            sx={fieldStyle}
            placeholder="Enter workflow title"
            value={workflowTitle}
            onChange={(e) => {
              setWorkflowTitle(e.target.value);
              clearFieldError("workflow_title");
            }}
          />
          <SelectComponent
            items={entities}
            value={entity}
            sx={entitySelectStyle(theme)}
            id="entity"
            label="Entity"
            error={errors.entity}
            isRequired
            onChange={(e: any) => {
              setEntity(e.target.value);
              clearFieldError("entity");
            }}
            placeholder="Select entity"
          />
        </Stack>
        {workflowSteps.map((step, stepIndex) => (
          <Stack key={stepIndex} spacing={8}>
            {/* STEPS */}
            <Stack spacing={4} sx={stepContainerStyle()}>
              <Stack direction="row" spacing={8} alignItems="center">
                <Box sx={stepNumberStyle}>{stepIndex + 1}</Box>
                <Typography sx={stepTitleStyle}>{"STEP " + (stepIndex + 1)}</Typography>
                <Box sx={removeStepLinkContainer}>
                  <CustomizableButton
                    variant="text"
                    color="error"
                    onClick={() => removeStep(stepIndex)}
                    text={"Remove step"}
                  />
                </Box>
              </Stack>
              <Stack direction="row" alignItems="flex-start">
                <Box>
                  <Divider orientation="vertical" flexItem sx={verticalStepDividerStyle} />
                </Box>
                <Stack sx={stepFieldsContainer} spacing={6}>
                  <Field
                    id={`step_name_${stepIndex}`}
                    label="Step name"
                    width="100%"
                    isRequired
                    error={stepErrors[stepIndex]?.step_name}
                    sx={fieldStyle}
                    placeholder="Enter step name"
                    value={step.step_name || ""}
                    onChange={(e) => {
                      const newSteps = [...workflowSteps];
                      newSteps[stepIndex].step_name = e.target.value;
                      setWorkflowSteps(newSteps);
                      clearStepFieldError(stepIndex, "step_name");
                    }}
                  />
                  <Stack direction="row" spacing={6}>
                    <AutoCompleteField
                      multiple
                      id={`approver-${stepIndex}`}
                      label="Approvers"
                      isRequired
                      placeholder="Select approvers"
                      error={stepErrors[stepIndex]?.approver}
                      value={users.filter((u) => (step.approver_ids || []).includes(u._id))}
                      options={users}
                      onChange={(_event, newValue) => {
                        const newSteps = [...workflowSteps];
                        newSteps[stepIndex].approver_ids = newValue.map((u) => u._id);
                        setWorkflowSteps(newSteps);
                        if (newValue.length > 0) clearStepFieldError(stepIndex, "approver");
                      }}
                      getOptionLabel={(user) =>
                        `${user.name}${user.surname ? ` ${user.surname}` : ""}`
                      }
                      renderOption={(props, option) => {
                        const { key, ...otherProps } = props;
                        return (
                          <Box component="li" key={key} {...otherProps}>
                            <Typography sx={{ fontSize: "13px", color: "#1c2130" }}>
                              {option.name}
                              {option.surname ? ` ${option.surname}` : ""}
                            </Typography>
                          </Box>
                        );
                      }}
                      filterSelectedOptions
                      noOptionsText={
                        (step.approver_ids || []).length === users.length
                          ? "All approvers selected"
                          : "No options"
                      }
                      popupIcon={<ChevronDown size={20} />}
                      sx={{ width: "50%" }}
                    />
                    <Box sx={{ width: "50%" }}>
                      <SelectComponent
                        items={conditions}
                        value={
                          step.requires_all_approvers === true
                            ? 1
                            : step.requires_all_approvers === false
                              ? 2
                              : ""
                        }
                        sx={conditionsSelectStyle(theme)}
                        id={`conditions-${stepIndex}`}
                        label="Conditions"
                        isRequired
                        error={stepErrors[stepIndex]?.conditions}
                        onChange={(e: any) => {
                          const newSteps = [...workflowSteps];
                          newSteps[stepIndex].requires_all_approvers = Number(e.target.value) === 1;
                          setWorkflowSteps(newSteps);
                          clearStepFieldError(stepIndex, "conditions");
                        }}
                        placeholder="Select conditions"
                      />
                    </Box>
                  </Stack>
                  <Field
                    id={`description_${stepIndex}`}
                    label="Description"
                    width="100%"
                    rows={2}
                    type="description"
                    value={step.description || ""}
                    onChange={(e) => {
                      const newSteps = [...workflowSteps];
                      newSteps[stepIndex].description = e.target.value;
                      setWorkflowSteps(newSteps);
                    }}
                    sx={{ ...fieldStyle, ...descriptionFieldStyle }}
                    placeholder="Enter description"
                  />
                </Stack>
              </Stack>
            </Stack>
          </Stack>
        ))}
        <Box data-joyride-id="add-step-button">
          <CustomizableButton
            variant="outlined"
            text="Add step"
            onClick={handleNewStepClick}
            icon={<AddCircleOutlineIcon />}
            sx={addNewStep}
          />
        </Box>
      </Stack>
    </StandardModal>
  );
};

export default CreateNewApprovalWorkflow;
