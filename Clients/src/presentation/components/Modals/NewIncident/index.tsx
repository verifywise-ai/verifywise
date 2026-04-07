/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { FC, useState, useEffect, useMemo, Suspense, useCallback } from "react";
import {
    Drawer,
    Stack,
    Box,
    Typography,
    FormControlLabel,
    FormGroup,
    FormLabel,
    useTheme,
    Divider,
} from "@mui/material";
import Toggle from "../../Inputs/Toggle";
import Checkbox from "../../Inputs/Checkbox";
import dayjs, { Dayjs } from "dayjs";
import { CustomizableButton } from "../../button/customizable-button";
import { ReactComponent as CloseIcon } from "../../../assets/icons/close.svg";
import { ReactComponent as SaveIconSVGWhite } from "../../../assets/icons/save-white.svg";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import { useProjects } from "../../../../application/hooks/useProjects";
import { User } from "../../../../domain/types/User";
import { Project } from "../../../../domain/types/Project";
import { useModalKeyHandling } from "../../../../application/hooks/useModalKeyHandling";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import {
    Severity,
    IncidentManagementStatus,
    AIIncidentManagementApprovalStatus,
    IncidentType,
    HarmCategory,
} from "../../../../domain/enums/aiIncidentManagement.enum";
import { HistorySidebar } from "../../Common/HistorySidebar";
import TabBar from "../../TabBar";
import { TabContext } from "@mui/lab";

// To
import Field from "../../Inputs/Field";
import DatePicker from "../../Inputs/Datepicker";
import SelectComponent from "../../Inputs/Select";

interface SideDrawerIncidentProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    onSuccess?: (data: NewIncidentFormValues) => void;
    initialData?: NewIncidentFormValues;
    isEdit?: boolean;
    mode?: string;
    incidentId?: number;
}

export interface NewIncidentFormValues {
    incident_id?: string;
    ai_project: string;
    type: string;
    severity: Severity;
    status: IncidentManagementStatus;
    occurred_date: string;
    date_detected: string;
    reporter: string;
    categories_of_harm: string[];
    affected_persons_groups?: string;
    description: string;
    relationship_causality?: string;
    immediate_mitigations?: string;
    planned_corrective_actions?: string;
    model_system_version?: string;
    interim_report: boolean;
    approval_status: AIIncidentManagementApprovalStatus;
    approved_by?: string;
    approval_date?: string;
    approval_notes?: string;
}

const initialState: NewIncidentFormValues = {
    ai_project: "",
    type: "",
    severity: Severity.MINOR,
    status: IncidentManagementStatus.OPEN,
    occurred_date: new Date().toISOString().split("T")[0],
    date_detected: new Date().toISOString().split("T")[0],
    reporter: "",
    categories_of_harm: [],
    description: "",
    affected_persons_groups: "",
    relationship_causality: "",
    immediate_mitigations: "",
    planned_corrective_actions: "",
    model_system_version: "",
    interim_report: false,
    approval_status: AIIncidentManagementApprovalStatus.PENDING,
    approved_by: "",
    approval_date: "",
    approval_notes: "",
};

const severityOptions = [
    { _id: Severity.MINOR, name: "Minor" },
    { _id: Severity.SERIOUS, name: "Serious" },
    { _id: Severity.VERY_SERIOUS, name: "Very Serious" },
];

const statusOptions = [
    { _id: IncidentManagementStatus.OPEN, name: "Open" },
    { _id: IncidentManagementStatus.INVESTIGATED, name: "Investigating" },
    { _id: IncidentManagementStatus.MITIGATED, name: "Mitigated" },
    { _id: IncidentManagementStatus.CLOSED, name: "Closed" },
];

const approvalStatusOptions = [
    { _id: AIIncidentManagementApprovalStatus.PENDING, name: "Pending" },
    { _id: AIIncidentManagementApprovalStatus.APPROVED, name: "Approved" },
    { _id: AIIncidentManagementApprovalStatus.REJECTED, name: "Rejected" },
    {
        _id: AIIncidentManagementApprovalStatus.NOT_REQUIRED,
        name: "Not Required",
    },
];

const incidentTypes = Object.values(IncidentType);
const harmCategories = Object.values(HarmCategory);

const SideDrawerIncident: FC<SideDrawerIncidentProps> = ({
    isOpen,
    setIsOpen,
    onSuccess,
    initialData,
    isEdit = false,
    mode,
    incidentId,
}) => {
    const theme = useTheme();
    const [values, setValues] = useState<NewIncidentFormValues>(
        initialData || initialState
    );
    const [users, setUsers] = useState<User[]>([]);
    const [, setIsLoadingUsers] = useState(false);
    const [activeTab, setActiveTab] = useState("details");

    const validators = useMemo(
        () => ({
            ai_project: (v: unknown) =>
                !v ? "Project is required." : "",
            occurred_date: (v: unknown) => {
                if (!v) return "Occurred date is required.";
                if (dayjs(v as string).isAfter(dayjs())) return "Cannot be in the future.";
                return "";
            },
            date_detected: (v: unknown) =>
                !v ? "Detected date is required." : "",
            reporter: (v: unknown) =>
                !v ? "Reporter is required." : "",
            description: (v: unknown) =>
                !v ? "Description is required." : "",
            categories_of_harm: (v: unknown) => {
                const cats = v as string[];
                return !cats || cats.length < 1
                    ? "Please select at least one Category of Harm."
                    : "";
            },
        }),
        []
    );

    const { errors, validateAll, clearFieldError, resetErrors } =
        useFormValidation<NewIncidentFormValues>(validators);

    // Use the useProjects hook to get approved projects only
    const { approvedProjects } = useProjects();

    // Fetch Users
    useEffect(() => {
        if (isOpen) {
            fetchUsers();
        }
    }, [isOpen]);

    useEffect(() => {
        if (initialData) {
            setValues((prev) => ({
                ...prev,
                ...initialData,
            }));
        }
    }, [initialData]);

    const fetchUsers = async () => {
        setIsLoadingUsers(true);
        try {
            const response = await getAllEntities({ routeUrl: "/users" });
            if (response?.data) setUsers(response.data);
        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            setIsLoadingUsers(false);
        }
    };

    const projectOptions = useMemo(() => {
        // Use a Set to track unique project titles
        const seen = new Set<string>();

        return Array.isArray(approvedProjects)
            ? approvedProjects
                .filter((p: Project) => {
                    // Only keep the first occurrence of each project_title
                    if (seen.has(p.project_title)) return false;
                    seen.add(p.project_title);
                    return true;
                })
                .map((p: Project) => ({
                    _id: p.project_title,
                    name: p.project_title,
                }))
            : [];
    }, [approvedProjects]);

    const userOptions = useMemo(
        () =>
            users.map((u) => ({ _id: u.name, name: `${u.name} ${u.surname}` })),
        [users]
    );

    const handleFieldChange =
        useCallback((prop: keyof NewIncidentFormValues) => (e: any) => {
            const value = e.target.value;
            setValues((prev) => ({ ...prev, [prop]: value }));
            clearFieldError(prop);
        }, [clearFieldError]);

    const handleDateChange =
        useCallback((prop: "occurred_date" | "date_detected" | "approval_date") =>
            (newDate: Dayjs | null) => {
                if (newDate?.isValid()) {
                    setValues((prev) => ({
                        ...prev,
                        [prop]: newDate.format("YYYY-MM-DD"),
                    }));
                    clearFieldError(prop);
                }
            }, [clearFieldError]);

    const handleSwitchChange =
        (prop: "interim_report") =>
            (e: React.ChangeEvent<HTMLInputElement>) => {
                setValues((prev) => ({ ...prev, [prop]: e.target.checked }));
            };

    const handleHarmCategoryChange = useCallback((category: string) => {
        setValues((prev) => {
            const newCategories = prev.categories_of_harm.includes(category)
                ? prev.categories_of_harm.filter((c) => c !== category)
                : [...prev.categories_of_harm, category];
            return { ...prev, categories_of_harm: newCategories };
        });
        clearFieldError("categories_of_harm");
    }, [clearFieldError]);

    const handleClose = () => {
        setIsOpen(false);
        setValues(initialState);
        resetErrors();
        setActiveTab("details");
    };

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (validateAll(values)) {
            onSuccess?.(values);
            handleClose();
        }
    };

    const isViewMode = mode === "view";

    useModalKeyHandling({ isOpen, onClose: handleClose });

    return (
        <Drawer anchor="right" open={isOpen} onClose={handleClose}>
            <Stack
                sx={{
                    width: 700,
                    maxHeight: "100vh",
                    overflowY: "auto",
                    p: theme.spacing(10),
                    bgcolor: theme.palette.background.paper,
                }}
            >
                {/* Header */}

                {mode !== "view" && (
                    <>
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                            mb={3}
                        >
                            <Stack direction="row" alignItems="center" spacing={1}>
                                <Typography
                                    fontWeight={600}
                                    color={theme.palette.text.primary}
                                >
                                    {isEdit ? "Edit incident" : "Create new incident"}
                                </Typography>
                                {isEdit && values.incident_id && (
                                    <Typography
                                        fontWeight={400}
                                        fontSize={14}
                                        sx={{
                                            ml: 1,
                                        }}
                                    >
                                        <Typography
                                            component="span"
                                            color={theme.palette.text.secondary}
                                            fontSize={14}
                                        >
                                            (Incident ID:{" "}
                                        </Typography>
                                        <Typography
                                            component="span"
                                            color={theme.palette.text.tertiary}
                                            fontSize={14}
                                        >
                                            {values.incident_id})
                                        </Typography>
                                    </Typography>
                                )}
                            </Stack>
                            <Box onClick={handleClose} sx={{ cursor: "pointer" }}>
                                <CloseIcon />
                            </Box>
                        </Stack>
                        <Divider sx={{
                            mb: 4,
                            mx: `calc(-1 * ${theme.spacing(10)})`,
                        }} />
                    </>
                )}

                {/* TabBar for edit mode */}
                {isEdit && incidentId && (
                    <TabContext value={activeTab}>
                        <Box sx={{ marginBottom: 3 }}>
                            <TabBar
                                tabs={[
                                    { label: "Incident details", value: "details", icon: "AlertTriangle" },
                                    { label: "Activity", value: "activity", icon: "History" },
                                ]}
                                activeTab={activeTab}
                                onChange={(_, newValue) => setActiveTab(newValue)}
                            />
                        </Box>
                    </TabContext>
                )}

                {/* Activity tab content */}
                {activeTab === "activity" && isEdit && incidentId ? (
                    <HistorySidebar
                        inline
                        isOpen={true}
                        entityType="incident"
                        entityId={incidentId}
                    />
                ) : (

                    <form onSubmit={handleSubmit}>
                        <Stack spacing={4} width="100%">
                            {/* SECTION 1: INCIDENT INFORMATION */}
                            <Stack spacing={4}>
                                <Stack direction="row" spacing={1} alignItems="baseline">
                                    <Typography
                                        sx={{
                                            fontSize: 12,
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            color: theme.palette.text.secondary,
                                            letterSpacing: '0.5px'
                                        }}
                                    >
                                        INCIDENT INFORMATION
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontSize: 12,
                                            fontWeight: 400,
                                            color: theme.palette.text.tertiary,
                                        }}
                                    >
                                        (Basic incident details)
                                    </Typography>
                                </Stack>

                                {/* Row: AI Project + Incident Type */}
                                <Stack direction={"row"} gap={theme.spacing(8)} sx={{ mt: 2 }}>
                                    <Stack sx={{ gap: 3, width: "50%" }}>
                                        <SelectComponent
                                            id="ai_project"
                                            label="AI use case or framework"
                                            placeholder="Select AI use case or framework"
                                            items={projectOptions}
                                            value={values.ai_project}
                                            onChange={handleFieldChange("ai_project")}
                                            error={errors.ai_project}
                                            isRequired
                                            sx={{ flex: 1 }}
                                            disabled={isViewMode}
                                        />
                                    </Stack>
                                    <Stack sx={{ gap: 3, width: "50%" }}>
                                        <SelectComponent
                                            id="type"
                                            label="Incident type"
                                            placeholder="Select incident type"
                                            items={incidentTypes.map((t) => ({
                                                _id: t,
                                                name: t,
                                            }))}
                                            value={values.type}
                                            onChange={handleFieldChange("type")}
                                            error={errors.type}
                                            sx={{ flex: 1 }}
                                            disabled={isViewMode}
                                        />
                                    </Stack>
                                </Stack>

                                {/* Row: Severity + Status */}
                                <Stack direction={"row"} gap={theme.spacing(8)} sx={{ mt: 2 }}>
                                    <Stack sx={{ gap: 3, width: "50%" }}>
                                        <SelectComponent
                                            id="severity"
                                            label="Severity"
                                            items={severityOptions}
                                            placeholder="Select severity"
                                            value={values.severity}
                                            onChange={handleFieldChange("severity")}
                                            error={errors.severity}
                                            sx={{ flex: 1 }}
                                            disabled={isViewMode}
                                        />
                                    </Stack>
                                    <Stack sx={{ gap: 3, width: "50%" }}>
                                        <SelectComponent
                                            id="status"
                                            label="Status"
                                            placeholder="Select status"
                                            items={statusOptions}
                                            value={values.status}
                                            onChange={handleFieldChange("status")}
                                            error={errors.status}
                                            sx={{ flex: 1 }}
                                            disabled={isViewMode}
                                        />
                                    </Stack>
                                </Stack>

                                {/* Row: Occurred Date + Detected Date */}
                                <Stack direction={"row"} gap={theme.spacing(8)} sx={{ mt: 2 }}>
                                    <Suspense fallback={<div>Loading...</div>}>
                                        <Stack sx={{ gap: 3, width: "50%" }}>
                                            <DatePicker
                                                label="Occurred date"
                                                date={dayjs(values.occurred_date)}
                                                handleDateChange={handleDateChange(
                                                    "occurred_date"
                                                )}
                                                isRequired
                                                error={errors.occurred_date}
                                                sx={{ flex: 1 }}
                                                disabled={isViewMode}
                                            />
                                        </Stack>
                                        <Stack sx={{ gap: 3, width: "50%" }}>
                                            <DatePicker
                                                label="Detected date"
                                                date={dayjs(values.date_detected)}
                                                handleDateChange={handleDateChange(
                                                    "date_detected"
                                                )}
                                                isRequired
                                                error={errors.date_detected}
                                                sx={{ flex: 1 }}
                                                disabled={isViewMode}
                                            />
                                        </Stack>
                                    </Suspense>
                                </Stack>

                                {/* Row: Reporter + Model/System Version */}
                                <Stack direction={"row"} gap={theme.spacing(8)} sx={{ mt: 2 }}>
                                    <Stack sx={{ gap: 3, width: "50%" }}>
                                        <SelectComponent
                                            id="reporter"
                                            label="Reporter"
                                            placeholder="Select reporter"
                                            items={userOptions}
                                            value={values.reporter}
                                            onChange={handleFieldChange("reporter")}
                                            error={errors.reporter}
                                            isRequired
                                            sx={{ flex: 1 }}
                                            disabled={isViewMode}
                                        />
                                    </Stack>
                                    <Stack sx={{ gap: 3, width: "50%" }}>
                                        <Field
                                            id="model_version"
                                            label="Model / system version"
                                            value={values.model_system_version || ""}
                                            onChange={handleFieldChange(
                                                "model_system_version"
                                            )}
                                            placeholder="Model/system version"
                                            sx={{ flex: 1 }}
                                            disabled={isViewMode}
                                        />
                                    </Stack>
                                </Stack>
                            </Stack>

                            <Box sx={{ py: 6 }}>
                                <Divider sx={{
                                    mx: `calc(-1 * ${theme.spacing(10)})`,
                                }} />
                            </Box>

                            {/* SECTION 2: IMPACT ASSESSMENT */}
                            <Stack spacing={4}>
                                <Stack direction="row" spacing={1} alignItems="baseline">
                                    <Typography
                                        sx={{
                                            fontSize: 12,
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            color: theme.palette.text.secondary,
                                            letterSpacing: '0.5px'
                                        }}
                                    >
                                        IMPACT ASSESSMENT
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontSize: 12,
                                            fontWeight: 400,
                                            color: theme.palette.text.tertiary,
                                        }}
                                    >
                                        (What was affected)
                                    </Typography>
                                </Stack>

                                {/* Categories of harm */}
                                <FormLabel
                                    sx={{
                                        color: theme.palette.text.secondary,
                                        fontSize: 13,
                                        fontWeight: 500,
                                    }}
                                >
                                    Categories of harm
                                </FormLabel>
                                <FormGroup row sx={{ gap: theme.spacing(3), flexWrap: 'nowrap' }}>
                                    {harmCategories.map((category) => (
                                        <Box key={category} sx={{ flex: 1 }}>
                                            <Checkbox
                                                id={`harm-category-${category}`}
                                                label={category}
                                                size="small"
                                                isChecked={values.categories_of_harm.includes(
                                                    category
                                                )}
                                                value={category}
                                                onChange={() =>
                                                    handleHarmCategoryChange(
                                                        category
                                                    )
                                                }
                                                isDisabled={isViewMode}
                                            />
                                        </Box>
                                    ))}
                                </FormGroup>

                                {errors.categories_of_harm && (
                                    <Typography
                                        color="error"
                                        sx={{ mt: 0.5, fontSize: 13 }}
                                    >
                                        {errors.categories_of_harm}
                                    </Typography>
                                )}

                                <Field
                                    id="affected_persons"
                                    label="Affected persons / groups"
                                    value={values.affected_persons_groups || ""}
                                    onChange={handleFieldChange(
                                        "affected_persons_groups"
                                    )}
                                    placeholder="List affected persons or groups"
                                    rows={2}
                                    disabled={isViewMode}
                                />
                                <Field
                                    id="description"
                                    label="Description"
                                    value={values.description}
                                    onChange={handleFieldChange("description")}
                                    error={errors.description}
                                    placeholder="Describe the incident"
                                    rows={3}
                                    isRequired
                                    disabled={isViewMode}
                                />
                                <Field
                                    id="relationship"
                                    label="Relationship / causality"
                                    value={values.relationship_causality || ""}
                                    onChange={handleFieldChange(
                                        "relationship_causality"
                                    )}
                                    placeholder="Explain the relationship to AI system"
                                    rows={2}
                                    disabled={isViewMode}
                                />
                            </Stack>

                            <Box sx={{ py: 6 }}>
                                <Divider sx={{
                                    mx: `calc(-1 * ${theme.spacing(10)})`,
                                }} />
                            </Box>

                            {/* SECTION 3: RESPONSE & ACTIONS */}
                            <Stack spacing={4}>
                                <Stack direction="row" spacing={1} alignItems="baseline">
                                    <Typography
                                        sx={{
                                            fontSize: 12,
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            color: theme.palette.text.secondary,
                                            letterSpacing: '0.5px'
                                        }}
                                    >
                                        RESPONSE & ACTIONS
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontSize: 12,
                                            fontWeight: 400,
                                            color: theme.palette.text.tertiary,
                                        }}
                                    >
                                        (What was/will be done)
                                    </Typography>
                                </Stack>

                                <Field
                                    id="immediate_mitigations"
                                    label="Immediate mitigations taken"
                                    value={values.immediate_mitigations || ""}
                                    onChange={handleFieldChange(
                                        "immediate_mitigations"
                                    )}
                                    placeholder="Describe immediate mitigations"
                                    rows={2}
                                    disabled={isViewMode}
                                />
                                <Field
                                    id="planned_corrective_actions"
                                    label="Planned corrective actions"
                                    value={values.planned_corrective_actions || ""}
                                    onChange={handleFieldChange(
                                        "planned_corrective_actions"
                                    )}
                                    placeholder="Describe planned corrective actions"
                                    rows={2}
                                    disabled={isViewMode}
                                />
                            </Stack>

                            <Box sx={{ py: 6 }}>
                                <Divider sx={{
                                    mx: `calc(-1 * ${theme.spacing(10)})`,
                                }} />
                            </Box>

                            {/* SECTION 4: APPROVAL & REPORTING */}
                            <Stack spacing={4}>
                                <Stack direction="row" spacing={1} alignItems="baseline">
                                    <Typography
                                        sx={{
                                            fontSize: 12,
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            color: theme.palette.text.secondary,
                                            letterSpacing: '0.5px'
                                        }}
                                    >
                                        APPROVAL & REPORTING
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontSize: 12,
                                            fontWeight: 400,
                                            color: theme.palette.text.tertiary,
                                        }}
                                    >
                                        (Approval workflow)
                                    </Typography>
                                </Stack>

                                {/* Row: Approval Status + Approved By */}
                                <Stack direction={"row"} gap={theme.spacing(8)} sx={{ mt: 2 }}>
                                    <Stack sx={{ gap: 3, width: "50%" }}>
                                        <SelectComponent
                                            id="approval_status"
                                            placeholder="Select approval status"
                                            label="Approval status"
                                            items={approvalStatusOptions}
                                            value={values.approval_status}
                                            onChange={handleFieldChange(
                                                "approval_status"
                                            )}
                                            sx={{ flex: 1 }}
                                            disabled={isViewMode}
                                        />
                                    </Stack>
                                    <Stack sx={{ gap: 3, width: "50%" }}>
                                        <SelectComponent
                                            id="approved_by"
                                            label="Approved by"
                                            placeholder="Select approver"
                                            items={userOptions}
                                            value={values.approved_by || ""}
                                            onChange={handleFieldChange("approved_by")}
                                            sx={{ flex: 1 }}
                                            disabled={isViewMode}
                                        />
                                    </Stack>
                                </Stack>

                                {/* Row: Approval Date */}
                                <Stack direction={"row"} gap={theme.spacing(8)} sx={{ mt: 2 }}>
                                    <Suspense fallback={<div>Loading...</div>}>
                                        <Stack sx={{ gap: 3, width: "50%" }}>
                                            <DatePicker
                                                label="Approval date"
                                                date={
                                                    values.approval_date
                                                        ? dayjs(values.approval_date)
                                                        : null
                                                }
                                                handleDateChange={(d) =>
                                                    setValues((prev) => ({
                                                        ...prev,
                                                        approval_date: d
                                                            ? d.format("YYYY-MM-DD")
                                                            : "",
                                                    }))
                                                }
                                                sx={{ flex: 1 }}
                                                disabled={isViewMode}
                                            />
                                        </Stack>
                                    </Suspense>
                                </Stack>

                                <Field
                                    id="approval_notes"
                                    label="Approval notes / comments"
                                    value={values.approval_notes || ""}
                                    onChange={handleFieldChange("approval_notes")}
                                    placeholder="Add approval notes"
                                    rows={2}
                                    disabled={isViewMode}
                                />

                                {/* Interim Report Toggle */}
                                <FormControlLabel
                                    control={
                                        <Toggle
                                            checked={values.interim_report}
                                            onChange={handleSwitchChange(
                                                "interim_report"
                                            )}
                                        />
                                    }
                                    label="This incident has an interim report"
                                    sx={{
                                        mt: 2,
                                        "& .MuiFormControlLabel-label": {
                                            fontSize: 13,
                                        }
                                    }}
                                    disabled={isViewMode}
                                />
                            </Stack>
                        </Stack>

                        {/* Buttons */}
                        <Stack
                            direction="row"
                            spacing={2}
                            mt={6}
                            justifyContent={
                                mode === "view" ? "flex-start" : "flex-end"
                            }
                        >
                            {mode === "view" ? (
                                <CustomizableButton
                                    variant="contained"
                                    text="Close"
                                    onClick={handleClose}
                                />
                            ) : (
                                <>
                                    <CustomizableButton
                                        variant="outlined"
                                        text="Cancel"
                                        onClick={handleClose}
                                    />
                                    <CustomizableButton
                                        variant="contained"
                                        text={
                                            isEdit
                                                ? "Update incident"
                                                : "Save incident"
                                        }
                                        icon={<SaveIconSVGWhite />}
                                        onClick={handleSubmit as (event: unknown) => void}
                                        sx={{
                                            backgroundColor: theme.palette.primary.main,
                                            border: `1px solid ${theme.palette.primary.main}`,
                                        }}
                                    />
                                </>
                            )}
                        </Stack>
                    </form>
                )}
            </Stack>
        </Drawer>
    );
};
export default SideDrawerIncident;
