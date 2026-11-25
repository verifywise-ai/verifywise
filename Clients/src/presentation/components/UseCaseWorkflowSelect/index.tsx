import { useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import Select from "../Inputs/Select";
import { VWLink } from "../Link";
import CreateNewApprovalWorkflow from "../Modals/NewApprovalWorkflow";
import { useCan } from "../../../application/hooks/useCan";
import {
  useCaseApprovalWorkflowsQueryKey,
  useUseCaseApprovalWorkflows,
} from "../../../application/hooks/useUseCaseApprovalWorkflows";
import { saveApprovalWorkflow } from "../../../application/repository/approvalWorkflow.repository";
import {
  USE_CASE_WORKFLOW_ENTITY_ID,
  type ApprovalWorkflowFormData,
} from "../../../application/utils/approvalWorkflowBody";

export interface UseCaseWorkflowSelectProps {
  id: string;
  /** The selected workflow id; 0 means none. */
  value: number;
  onChange: (workflowId: number) => void;
  /** Adds a "None" option, so a saved workflow can be cleared. */
  allowNone?: boolean;
  /** Adds a link to the Approval workflows page (admins only). */
  showManageLink?: boolean;
  error?: string;
  sx?: object;
}

const hintSx = { fontSize: 13, color: "text.secondary" };

/**
 * Approval workflow select for a use case: the organization's use case
 * workflows, an empty state, and, for approval workflow admins, a way to
 * create one in place. A new workflow is selected once it is saved.
 */
const UseCaseWorkflowSelect = ({
  id,
  value,
  onChange,
  allowNone = false,
  showManageLink = false,
  error,
  sx,
}: UseCaseWorkflowSelectProps) => {
  const navigate = useNavigate();
  const canManageWorkflows = useCan("approvalWorkflow.admin");
  const queryClient = useQueryClient();
  const { data: workflows = [], isSuccess } = useUseCaseApprovalWorkflows();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // A selected workflow missing from the active list was archived: still
  // show it, so the current choice is visible.
  const isArchived =
    isSuccess && value !== 0 && !workflows.some((workflow) => workflow._id === value);
  const items = [
    ...(allowNone ? [{ _id: 0, name: "None" }] : []),
    ...workflows.map(({ _id, name }) => ({ _id, name, noTranslate: true })),
    ...(isArchived ? [{ _id: value, name: "Archived workflow" }] : []),
  ];

  // A failed save throws back to the modal, which keeps the input and shows why.
  const handleCreated = async (formData: ApprovalWorkflowFormData) => {
    const saved = await saveApprovalWorkflow({ formData });
    setIsCreateOpen(false);
    await queryClient.invalidateQueries({ queryKey: useCaseApprovalWorkflowsQueryKey });
    if (saved?.id) onChange(Number(saved.id));
  };

  return (
    <Stack sx={{ gap: "8px", ...sx }}>
      <Select
        id={id}
        label="Approval workflow"
        placeholder="Select workflow"
        value={allowNone ? value : value || ""}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        items={items}
        error={error}
        sx={{ backgroundColor: "background.main" }}
      />
      {isSuccess && workflows.length === 0 && (
        <Typography sx={hintSx} data-testid="use-case-workflow-empty">
          {canManageWorkflows
            ? "No approval workflows for use cases yet."
            : "No approval workflows for use cases yet. Ask an Admin to create one."}
        </Typography>
      )}
      {canManageWorkflows && (
        <Stack direction="row" alignItems="center" flexWrap="wrap" sx={{ gap: "16px" }}>
          <VWLink testId="use-case-workflow-create" onClick={() => setIsCreateOpen(true)}>
            Create workflow
          </VWLink>
          {showManageLink && (
            <VWLink
              testId="use-case-workflow-manage"
              onClick={() => navigate("/approval-workflows")}
            >
              Manage approval workflows
            </VWLink>
          )}
        </Stack>
      )}
      {canManageWorkflows && isCreateOpen && (
        // React submit events bubble through portals: without this, Enter in
        // the workflow form would also submit the form this select sits in
        // (the create use case form, the change workflow dialog).
        <Box component="span" onSubmit={(event) => event.stopPropagation()}>
          <CreateNewApprovalWorkflow
            isOpen
            setIsOpen={() => setIsCreateOpen(false)}
            fixedEntity={USE_CASE_WORKFLOW_ENTITY_ID}
            onSuccess={handleCreated}
          />
        </Box>
      )}
    </Stack>
  );
};

export default UseCaseWorkflowSelect;
