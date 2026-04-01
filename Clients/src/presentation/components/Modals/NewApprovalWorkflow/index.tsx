import { Box, Divider, Stack, Typography, useTheme, Autocomplete, TextField, Button } from "@mui/material";
import { FC, useEffect, useState } from "react";
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
    removeStepButtonStyle,
    verticalStepDividerStyle,
    stepFieldsContainer,
    approverAutocompleteStyle,
    conditionsSelectStyle,
    descriptionFieldStyle,
} from "./style";
import { ApprovalWorkflowStepModel } from "../../../../domain/models/Common/approvalWorkflow/approvalWorkflowStepModel";
import { entities, conditions } from "./arrays";
import { ICreateApprovalWorkflowProps, NewApprovalWorkflowFormErrors } from "src/domain/interfaces/i.approvalForkflow";
import { getAllUsers } from "../../../../application/repository/user.repository";
import { User } from "../../../../domain/types/User";

const CreateNewApprovalWorkflow: FC<ICreateApprovalWorkflowProps> = ({
    isOpen,
    setIsOpen,
    initialData,
    isEdit = false,
    onSuccess
}) => {

    const theme = useTheme();
    const [errors, setErrors] = useState<NewApprovalWorkflowFormErrors>({ steps: [] });
    const [isSubmitting, setIsSubmitting] = useState(false);

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
                    }))
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
                setStepsCount(initialData.steps.length)
            } else {
                setWorkflowSteps([new ApprovalWorkflowStepModel()]);
                setStepsCount(1)
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
        setErrors({ steps: [] });
    }

    const validateForm = (): boolean => {
        const newErrors: NewApprovalWorkflowFormErrors = {
            steps: []
        };
        let hasErrors = false;

        if (!workflowTitle.trim()) {
            newErrors.workflow_title = "Workflow title is required.";
            hasErrors = true;
        }
        if (entity < 1) {
            newErrors.entity = "Entity is required.";
            hasErrors = true;
        }
        for (let i = 0; i < workflowSteps.length; i++) {
            const step = workflowSteps[i];
            newErrors.steps.push({})
            if (!step.step_name || !step.step_name.trim()) {
                newErrors.steps[i].step_name = "Step name is required.";
                hasErrors = true;
            }
            if (!step.approver_ids || step.approver_ids.length === 0) {
                newErrors.steps[i].approver = "At least one approver is required.";
                hasErrors = true;
            }
            if (step.requires_all_approvers === undefined || step.requires_all_approvers === null) {
                newErrors.steps[i].conditions = "Conditions are required.";
                hasErrors = true;
            }
        }
        setErrors(newErrors);
        return !hasErrors;
    }

    const handleSave = () => {
        if (validateForm()) {
            setIsSubmitting(true)
            const formData = {
                workflow_title: workflowTitle.trim(),
                entity: entity,
                steps: workflowSteps.map(
                    step => new ApprovalWorkflowStepModel({
                        step_name: step.step_name?.trim() || "",
                        approver_ids: step.approver_ids || [],
                        requires_all_approvers: step.requires_all_approvers ?? false,
                        description: step.description?.trim() || ""
                    })),
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
    }

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
            isSubmitting={isSubmitting}>
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
                        onChange={(e) => setWorkflowTitle(e.target.value)}
                    />
                    <SelectComponent
                        items={entities}
                        value={entity}
                        sx={entitySelectStyle(theme)}
                        id="entity"
                        label="Entity"
                        error={errors.entity}
                        isRequired
                        onChange={(e: any) => setEntity(e.target.value)}
                        placeholder="Select entity"
                    />
                </Stack>
                {workflowSteps.map((step, stepIndex) => (
                    <Stack key={stepIndex} spacing={8}>
                        {/* STEPS */}
                        <Stack spacing={4}
                            sx={stepContainerStyle()}>
                            <Stack direction="row" spacing={8} alignItems="center">
                                <Box sx={stepNumberStyle}>{stepIndex + 1}</Box>
                                <Typography sx={stepTitleStyle}>
                                    {"STEP " + (stepIndex + 1)}
                                </Typography>
                                <Box sx={removeStepLinkContainer}>
                                    <Button
                                        variant="text"
                                        onClick={() => removeStep(stepIndex)}
                                        sx={removeStepButtonStyle(stepIndex === 0)}
                                    >
                                        Remove step
                                    </Button>
                                </Box>
                            </Stack>
                            <Stack direction="row" alignItems="flex-start" >
                                <Box>
                                    <Divider
                                        orientation="vertical"
                                        flexItem
                                        sx={verticalStepDividerStyle}
                                    />
                                </Box>
                                <Stack sx={stepFieldsContainer} spacing={6}>
                                    <Field
                                        id={`step_name_${stepIndex}`}
                                        label="Step name"
                                        width="100%"
                                        isRequired
                                        error={errors.steps[stepIndex]?.step_name}
                                        sx={fieldStyle}
                                        placeholder="Enter step name"
                                        value={step.step_name || ""}
                                        onChange={(e) => {
                                            const newSteps = [...workflowSteps];
                                            newSteps[stepIndex].step_name = e.target.value;
                                            setWorkflowSteps(newSteps);
                                        }}
                                    />
                                    <Stack direction="row" spacing={6}>
                                        <Stack gap={theme.spacing(2)} sx={{ width: "50%" }}>
                                            <Typography
                                                component="p"
                                                variant="body1"
                                                color={theme.palette.text.secondary}
                                                fontWeight={500}
                                                fontSize={"13px"}
                                                sx={{
                                                    margin: 0,
                                                    height: '22px',
                                                    display: "flex",
                                                    alignItems: "center",
                                                }}
                                            >
                                                Approvers
                                                <Typography
                                                    component="span"
                                                    ml={theme.spacing(1)}
                                                    color={theme.palette.error.text}
                                                >
                                                    *
                                                </Typography>
                                            </Typography>
                                            <Autocomplete
                                                multiple
                                                id={`approver-${stepIndex}`}
                                                size="small"
                                                value={users.filter(u => (step.approver_ids || []).includes(u._id))}
                                                options={users}
                                                onChange={(_event, newValue) => {
                                                    const newSteps = [...workflowSteps];
                                                    newSteps[stepIndex].approver_ids = newValue.map(u => u._id);
                                                    setWorkflowSteps(newSteps);
                                                }}
                                                getOptionLabel={(user) => `${user.name}${user.surname ? ` ${user.surname}` : ""}`}
                                                renderOption={(props, option) => {
                                                    const { key, ...otherProps } = props;
                                                    return (
                                                        <Box component="li" key={key} {...otherProps}>
                                                            <Typography sx={{ fontSize: "13px", color: "#1c2130" }}>
                                                                {option.name}{option.surname ? ` ${option.surname}` : ""}
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
                                                renderInput={(params) => (
                                                    <TextField
                                                        {...params}
                                                        placeholder="Select approvers"
                                                        error={!!errors.steps[stepIndex]?.approver}
                                                        sx={{
                                                            "& .MuiOutlinedInput-root": {
                                                                paddingTop: "3.8px !important",
                                                                paddingBottom: "3.8px !important",
                                                            },
                                                            "& ::placeholder": {
                                                                fontSize: "13px",
                                                            },
                                                            // Override MUI's default error border color to match other fields
                                                            "& .MuiOutlinedInput-root.Mui-error .MuiOutlinedInput-notchedOutline": {
                                                                borderColor: theme.palette.status.error.border,
                                                            },
                                                        }}
                                                    />
                                                )}
                                                slotProps={{
                                                    paper: {
                                                        sx: {
                                                            "& .MuiAutocomplete-listbox": {
                                                                "& .MuiAutocomplete-option": {
                                                                    fontSize: "13px",
                                                                    color: "#1c2130",
                                                                    paddingLeft: "9px",
                                                                    paddingRight: "9px",
                                                                },
                                                                "& .MuiAutocomplete-option.Mui-focused": {
                                                                    background: "background.accent",
                                                                },
                                                            },
                                                            "& .MuiAutocomplete-noOptions": {
                                                                fontSize: "13px",
                                                                paddingLeft: "9px",
                                                                paddingRight: "9px",
                                                            },
                                                        },
                                                    },
                                                }}
                                                sx={{
                                                    ...approverAutocompleteStyle(theme),
                                                }}
                                            />
                                            {errors.steps[stepIndex]?.approver && (
                                                <Typography
                                                    component="span"
                                                    sx={{
                                                        color: theme.palette.status.error.text,
                                                        opacity: 0.8,
                                                        fontSize: 11,
                                                    }}
                                                >
                                                    {errors.steps[stepIndex]?.approver}
                                                </Typography>
                                            )}
                                        </Stack>
                                        <Box sx={{ width: "50%" }}>
                                            <SelectComponent
                                                items={conditions}
                                                value={step.requires_all_approvers === true ? 1 : step.requires_all_approvers === false ? 2 : ""}
                                                sx={conditionsSelectStyle(theme)}
                                                id={`conditions-${stepIndex}`}
                                                label="Conditions"
                                                isRequired
                                                error={errors.steps[stepIndex]?.conditions}
                                                onChange={(e: any) => {
                                                    const newSteps = [...workflowSteps];
                                                    newSteps[stepIndex].requires_all_approvers = Number(e.target.value) === 1;
                                                    setWorkflowSteps(newSteps);
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
}

export default CreateNewApprovalWorkflow;