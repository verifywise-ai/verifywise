import { Box, Stack } from "@mui/material"
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import ApprovalWorkflowsTable from "./ApprovalWorkflowsTable";
import { useState, useMemo, useEffect, useCallback } from "react";
import { ApprovalWorkflowModel } from "../../../domain/models/Common/approvalWorkflow/approvalWorkflow.model";
import { logEngine } from "../../../application/tools/log.engine";
import { addNewWorkflowButton, workflowMainStack, filterSearchContainer } from "./style";
import { CustomizableButton } from "../../components/button/customizable-button";
import { ReactComponent as AddCircleOutlineIcon } from "../../assets/icons/plus-circle-white.svg";
import CreateNewApprovalWorkflow from "../../components/Modals/NewApprovalWorkflow";
import { ApprovalWorkflowStepModel } from "../../../domain/models/Common/approvalWorkflow/approvalWorkflowStepModel";
import { ApprovalStatus } from "../../../domain/enums/aiApprovalWorkflow.enum";
import { FilterBy, FilterColumn } from "../../components/Table/FilterBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import { SearchBox } from "../../components/Search";
import { ColumnSelector } from "../../components/Table/ColumnSelector";
import { useColumnVisibility, ColumnConfig } from "../../../application/hooks/useColumnVisibility";
import {
    getAllApprovalWorkflows,
    getApprovalWorkflowById,
    createApprovalWorkflow,
    updateApprovalWorkflow,
    deleteApprovalWorkflow,
} from "../../../application/repository/approvalWorkflow.repository";

type ApprovalWorkflowColumnKey =
    | "workflow_title"
    | "entity_name"
    | "steps"
    | "date_updated"
    | "actions";

const APPROVAL_WORKFLOW_TABLE_COLUMNS: ColumnConfig<ApprovalWorkflowColumnKey>[] = [
    { key: "workflow_title", label: "Title", defaultVisible: true, alwaysVisible: true },
    { key: "entity_name", label: "Entity", defaultVisible: true },
    { key: "steps", label: "Steps count", defaultVisible: true },
    { key: "date_updated", label: "Date updated", defaultVisible: true },
    { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

const ApprovalWorkflows: React.FC = () => {

    const [workflowData, setWorkflowData] = useState<ApprovalWorkflowModel[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectWorkflow, setSelectWorkflow] = useState<ApprovalWorkflowModel | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isNewWorkflowModalOpen, setIsNewWorkflowModalOpen] = useState(false);
    const [archivedId, setArchivedId] = useState<string | null>(null);

    // Column visibility
    const {
        visibleColumns: workflowVisibleColumns,
        allColumns: allWorkflowColumns,
        toggleColumn: toggleWorkflowColumn,
        resetToDefaults: resetWorkflowColumns,
    } = useColumnVisibility({
        tableId: "approval-workflows-table",
        columns: APPROVAL_WORKFLOW_TABLE_COLUMNS,
    });


    // FilterBy - Filter columns configuration
    const workflowFilterColumns: FilterColumn[] = useMemo(() => [
        {
            id: 'workflow_title',
            label: 'Title',
            type: 'text' as const,
        },
        {
            id: 'entity',
            label: 'Entity',
            type: 'select' as const,
            options: [
                { value: '1', label: 'Use case' },
                { value: '2', label: 'File / Evidence' },
            ],
        },
        {
            id: 'approval_status',
            label: 'Approval Status',
            type: 'select' as const,
            options: [
                { value: ApprovalStatus.PENDING, label: 'Pending' },
                { value: ApprovalStatus.APPROVED, label: 'Approved' },
                { value: ApprovalStatus.REJECTED, label: 'Rejected' },
            ],
        },
    ], []);

    // FilterBy - Field value getter
    const getWorkflowFieldValue = useCallback(
        (item: ApprovalWorkflowModel, fieldId: string): string | number | Date | null | undefined => {
            switch (fieldId) {
                case 'workflow_title':
                    return item.workflow_title;
                case 'entity':
                    return item.entity?.toString();
                case 'approval_status':
                    return item.approval_status;
                default:
                    return null;
            }
        },
        []
    );

    // FilterBy - Initialize hook
    const { filterData: filterWorkflowData, handleFilterChange: handleWorkflowFilterChange } = useFilterBy<ApprovalWorkflowModel>(getWorkflowFieldValue);

    /** -------------------- FILTERING -------------------- */
    const filteredData = useMemo(() => {
        // Apply FilterBy conditions
        let result = filterWorkflowData(workflowData);

        // Apply search filter
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            result = result.filter((w) =>
                (w.workflow_title || "").toLowerCase().includes(search) ||
                (w.id || "").toString().toLowerCase().includes(search)
            );
        }

        return result;
    }, [filterWorkflowData, workflowData, searchTerm]);


    /** -------------------- FETCHING ON LOAD -------------------- */
    const fetchApprovalWorkflowData = async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        try {
            const response = await getAllApprovalWorkflows();
            const workflows = response?.data || [];
            setWorkflowData(workflows.map((w: any) => new ApprovalWorkflowModel(w)));
        } catch (error) {
            logEngine({
                type: "error",
                message: `Failed to fetch approval workflows: ${error}`,
            });
        } finally {
            if (showLoading) setIsLoading(false);
        }
    };


    /** -------------------- FETCHING BY SELECTED ID -------------------- */
    const fetchWorkflowDataById = async (id: string) => {
        try {
            setIsLoading(true);

            // First check if workflow is already in state
            const workflowFromState = workflowData.find(w => w.id?.toString() === id);
            if (workflowFromState) {
                setSelectWorkflow(workflowFromState);
                setIsLoading(false);
                return workflowFromState;
            }

            // Fetch from API if not in state
            const response = await getApprovalWorkflowById({ id: parseInt(id, 10) });
            const fetchedWorkflow = response?.data;

            if (fetchedWorkflow) {
                const workflow = new ApprovalWorkflowModel(fetchedWorkflow);
                setSelectWorkflow(workflow);
                setIsLoading(false);
                return workflow;
            }

            logEngine({
                type: "error",
                message: "No workflow data found for this ID.",
            });
            setIsLoading(false);
            return null;
        }
        catch (error) {
            logEngine({
                type: "error",
                message: `Failed to fetch workflow by ID: ${error}`,
            });
            setIsLoading(false);
            return null;
        }
    };

    /** -------------------- INITIAL LOAD -------------------- */
    useEffect(() => {
        fetchApprovalWorkflowData();
    }, []);

    /** -------------------- WORKFLOW MODAL HANDLERS -------------------- */
    const handleNewWorkflowClick = () => setIsNewWorkflowModalOpen(true);

    const handleEditWorkflowClick = async (id: string) => {
        await fetchWorkflowDataById(id);
        // Open modal even if workflow fetch has issues - the modal will show error state
        setIsNewWorkflowModalOpen(true);
    }

    // Map entity ID to entity_type string
    const getEntityType = (entityId: number): string => {
        switch (entityId) {
            case 1: return "use_case";
            case 2: return "file";
            default: return "use_case";
        }
    };

    const handleWorkflowSuccess = async (formData: {
        workflow_title: string;
        entity: number;
        steps: ApprovalWorkflowStepModel[];
    }) => {
        try {
            const entityType = getEntityType(formData.entity);

            if (selectWorkflow) {
                await updateApprovalWorkflow({
                    id: selectWorkflow.id!,
                    body: {
                        workflow_title: formData.workflow_title,
                        entity_type: entityType,
                        steps: formData.steps.map(step => ({
                            step_name: step.step_name,
                            description: step.description,
                            approver_ids: step.approver_ids || [],
                            requires_all_approvers: step.requires_all_approvers ?? false,
                        })),
                    },
                });

                logEngine({
                    type: "info",
                    message: "Workflow updated successfully!",
                });
            } else {
                await createApprovalWorkflow({
                    body: {
                        workflow_title: formData.workflow_title,
                        entity_type: entityType,
                        steps: formData.steps.map(step => ({
                            step_name: step.step_name,
                            description: step.description,
                            approver_ids: step.approver_ids || [],
                            requires_all_approvers: step.requires_all_approvers ?? false,
                        })),
                    },
                });

                logEngine({
                    type: "info",
                    message: "Workflow created successfully!",
                });
            }
            handleCloseModal();
            await fetchApprovalWorkflowData(false);
        } catch (error) {
            logEngine({
                type: "error",
                message: `Failed to save workflow: ${error}`,
            });
        }
    };

    const handleCloseModal = () => {
        setIsNewWorkflowModalOpen(false);
        setSelectWorkflow(null);
    }

    const handleArchiveWorkflow = async (id: string) => {
        try {
            setArchivedId(id);

            await deleteApprovalWorkflow({ id: parseInt(id, 10) });

            logEngine({
                type: "info",
                message: "Workflow archived successfully!",
            });

            // Remove from local state after successful deletion
            setTimeout(() => {
                setWorkflowData(prev => prev.filter(w => w.id?.toString() !== id));
                setArchivedId(null);
            }, 500);

            await fetchApprovalWorkflowData(false);
        } catch (error) {
            setArchivedId(null);
            logEngine({
                type: "error",
                message: `Failed to archive workflow: ${error}`,
            });
        }
    };

    /** -------------------- RENDER -------------------- */
    return (
        <PageHeaderExtended
            title="Approval Workflows"
            description="A structured overview of all approval processes, including steps, conditions, and current status."
        >
            <Stack sx={workflowMainStack}>
                <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    spacing={2}
                    sx={filterSearchContainer}
                >
                    <Stack direction="row" spacing={2} alignItems="center">
                        <FilterBy
                            columns={workflowFilterColumns}
                            onFilterChange={handleWorkflowFilterChange}
                        />
                        <ColumnSelector
                            columns={allWorkflowColumns}
                            visibleColumns={workflowVisibleColumns}
                            onToggleColumn={toggleWorkflowColumn}
                            onResetToDefaults={resetWorkflowColumns}
                        />
                        <SearchBox
                            placeholder="Search workflows..."
                            value={searchTerm}
                            onChange={setSearchTerm}
                            inputProps={{ "aria-label": "Search workflows" }}
                            fullWidth={false}
                        />
                    </Stack>
                    <Box data-joyride-id="add-workflow-button">
                        <CustomizableButton
                            variant="contained"
                            sx={addNewWorkflowButton}
                            text="Add new workflow"
                            icon={<AddCircleOutlineIcon />}
                            onClick={handleNewWorkflowClick}
                        />
                    </Box>
                </Stack>
                {/* Approval Table */}
                <ApprovalWorkflowsTable
                    data={filteredData}
                    isLoading={isLoading}
                    onEdit={handleEditWorkflowClick}
                    onArchive={handleArchiveWorkflow}
                    archivedId={archivedId}
                    visibleColumns={workflowVisibleColumns}
                />
            </Stack>
            <CreateNewApprovalWorkflow
                isOpen={isNewWorkflowModalOpen}
                setIsOpen={handleCloseModal}
                initialData={
                    selectWorkflow
                        ? {
                            workflow_title: selectWorkflow.workflow_title || "",
                            entity: selectWorkflow.entity ?? 0,
                            steps: selectWorkflow?.steps || [],
                        }
                        : undefined
                }
                isEdit={!!selectWorkflow}
                onSuccess={handleWorkflowSuccess}
            />
        </PageHeaderExtended>
    )
}

export default ApprovalWorkflows;