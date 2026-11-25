import { useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Pencil } from "lucide-react";
import StandardModal from "../../../../components/Modals/StandardModal";
import Field from "../../../../components/Inputs/Field";
import Alert from "../../../../components/Alert";
import StatusBadge from "../../../../components/StatusBadge";
import { VWLink } from "../../../../components/Link";
import UseCaseWorkflowSelect from "../../../../components/UseCaseWorkflowSelect";
import LifecyclePanel from "../../../../components/LifecycleTabs/LifecyclePanel";
import {
  lifecycleLabelSx,
  lifecycleValueSx,
} from "../../../../components/LifecycleTabs/lifecyclePanelStyles";
import { useAuth } from "../../../../../application/hooks/useAuth";
import { canManageLifecycle } from "../../../../../application/utils/useCaseLifecycle";
import { useCan } from "../../../../../application/hooks/useCan";
import {
  useUseCaseLifecycleActions,
  useUseCaseLifecycleSummary,
} from "../../../../../application/hooks/useUseCaseLifecycle";
import { useUseCaseApprovalWorkflows } from "../../../../../application/hooks/useUseCaseApprovalWorkflows";
import { LifecycleStage } from "../../../../../domain/enums/lifecycleStage.enum";
import { Project } from "../../../../../domain/types/Project";

/**
 * What saving a workflow choice does, sentence by sentence, as the server
 * does it (project.ctrl.ts updateProjectById): attaching or replacing opens
 * a new approval request, and only a planned use case moves to In review;
 * replacing or clearing withdraws a pending request.
 */
function workflowChangeNotes({
  selected,
  current,
  stage,
  approvalStatus,
}: {
  selected: number;
  current: number;
  stage: LifecycleStage;
  approvalStatus: Project["approval_status"];
}): string[] {
  if (selected === current) return [];
  const notes: string[] = [];
  if (selected) {
    notes.push("Saving sends this use case for approval.");
    if (stage === LifecycleStage.PLANNED) {
      notes.push("It moves to In review until the request is approved or rejected.");
    }
  } else {
    notes.push("Saving removes the approval workflow from this use case.");
  }
  if (current && approvalStatus === "pending") {
    notes.push("The pending approval request is withdrawn.");
  }
  return notes;
}

/**
 * Lifecycle strip on the use case overview (#5187): the shared LifecyclePanel
 * plus the use case's department and approval workflow.
 */
const UseCaseLifecyclePanel = ({
  project,
  onChanged,
}: {
  project: Project;
  onChanged?: () => void;
}) => {
  const { userRoleName, userId } = useAuth();
  const { goLive, retire, confirm, setDepartment, setApprovalWorkflow } =
    useUseCaseLifecycleActions(project.id);
  const { data: summary } = useUseCaseLifecycleSummary();
  const { data: workflows, isSuccess: workflowsLoaded } = useUseCaseApprovalWorkflows();

  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [department, setDepartmentDraft] = useState(project.department ?? "");
  const [error, setError] = useState<string | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [workflowDraft, setWorkflowDraft] = useState(0);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  // Same per-org permission matrix the server checks (custom roles included);
  // the built-in role rule only stands in until the list has loaded.
  const canEditUseCases = useCan("useCase.edit");
  const canManage = canManageLifecycle(
    userRoleName,
    userId,
    project.owner ?? undefined,
    canEditUseCases,
  );
  const stage = project.lifecycle_stage ?? LifecycleStage.PLANNED;

  // While the latest approval is pending or rejected the server lets only an
  // approval workflow admin change the workflow.
  const isWorkflowAdmin = useCan("approvalWorkflow.admin");
  const approvalStatus = project.approval_status ?? null;
  const currentWorkflowId = project.approval_workflow_id ?? 0;
  const canChangeWorkflow = canManage && (!approvalStatus || isWorkflowAdmin);
  const workflowTitle = currentWorkflowId
    ? workflowsLoaded
      ? (workflows?.find((workflow) => workflow._id === Number(currentWorkflowId))?.name ??
        "Archived workflow")
      : ""
    : "None";
  const workflowNotes = workflowChangeNotes({
    selected: workflowDraft,
    current: Number(currentWorkflowId),
    stage,
    approvalStatus,
  });

  const openWorkflow = () => {
    setWorkflowDraft(Number(currentWorkflowId));
    setWorkflowError(null);
    setWorkflowOpen(true);
  };

  const saveWorkflow = async () => {
    setWorkflowError(null);
    try {
      await setApprovalWorkflow.mutateAsync(workflowDraft || null);
      setWorkflowOpen(false);
      onChanged?.();
    } catch (err) {
      setWorkflowError((err as { message?: string })?.message || "The change could not be saved.");
    }
  };

  const saveDepartment = async () => {
    setError(null);
    try {
      await setDepartment.mutateAsync(department.trim() || null);
      setDepartmentOpen(false);
      onChanged?.();
    } catch (err) {
      setError((err as { message?: string })?.message || "The change could not be saved.");
    }
  };

  return (
    <>
      <LifecyclePanel
        testId="use-case-lifecycle-panel"
        stage={stage}
        goLiveDate={project.go_live_date}
        lastConfirmedAt={project.last_confirmed_at}
        retiredAt={project.retired_at}
        canManage={canManage}
        isStale={!!summary?.stale_ids.includes(project.id)}
        goLiveBlockedReason={
          // The server refuses go-live while the latest approval request is
          // pending or rejected (audit decision 2). A rejected use case whose
          // workflow an admin cleared stays rejected until a new approval.
          // Only an approval workflow admin may attach one to a rejected use case.
          project.approval_status === "rejected"
            ? project.approval_workflow_id == null
              ? isWorkflowAdmin
                ? "Its last approval request was rejected. Attach an approval workflow and get it approved before marking it as live."
                : "Its last approval request was rejected. An approval workflow admin needs to attach a workflow and get it approved before it can go live."
              : "Approve this use case before marking it as live. Its last approval request was rejected."
            : project.approval_status === "pending"
              ? "Approve this use case before marking it as live."
              : undefined
        }
        goLive={goLive}
        retire={retire}
        confirm={confirm}
        onChanged={onChanged}
        isBusy={setDepartment.isPending || setApprovalWorkflow.isPending}
        copy={{
          staleMessage:
            "Nobody has confirmed this use case is still live within the check interval set for your organization. Confirm it, or retire it if it is no longer in use.",
          goLiveDescription:
            "Record the date this use case went into use. Owners are asked to confirm it is still live at the interval set in Settings.",
          retireTitle: "Retire use case",
          retireDescription:
            "A retired use case stays in the inventory under Retired, with its history, but is no longer checked for being live.",
        }}
        extraFields={
          <>
            <Stack sx={{ gap: "4px" }}>
              <Typography sx={lifecycleLabelSx}>Department</Typography>
              <Stack direction="row" alignItems="center" sx={{ gap: "4px" }}>
                <Typography sx={lifecycleValueSx}>{project.department || "Not set"}</Typography>
                {canManage && (
                  <Box
                    component="button"
                    type="button"
                    aria-label="Edit department"
                    data-testid="lifecycle-edit-department"
                    onClick={() => {
                      setDepartmentDraft(project.department ?? "");
                      setError(null);
                      setDepartmentOpen(true);
                    }}
                    sx={{
                      display: "inline-flex",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      p: "2px",
                      color: "text.secondary",
                    }}
                  >
                    <Pencil size={14} strokeWidth={1.5} />
                  </Box>
                )}
              </Stack>
            </Stack>
            <Stack sx={{ gap: "4px" }} data-testid="lifecycle-approval-workflow">
              <Typography sx={lifecycleLabelSx}>Approval workflow</Typography>
              <Stack direction="row" alignItems="center" flexWrap="wrap" sx={{ gap: "8px" }}>
                <Typography
                  sx={lifecycleValueSx}
                  data-testid="lifecycle-workflow-title"
                  data-vw-no-translate={
                    currentWorkflowId && workflowTitle !== "Archived workflow" ? "true" : undefined
                  }
                >
                  {workflowTitle}
                </Typography>
                {approvalStatus === "pending" && (
                  <StatusBadge
                    label="Pending approval"
                    variant="warning"
                    size="small"
                    uppercase={false}
                  />
                )}
                {approvalStatus === "rejected" && (
                  <StatusBadge label="Rejected" variant="error" size="small" uppercase={false} />
                )}
                {canChangeWorkflow && (
                  <VWLink testId="lifecycle-workflow-action" onClick={openWorkflow}>
                    {currentWorkflowId ? "Change workflow" : "Attach workflow"}
                  </VWLink>
                )}
              </Stack>
              {canManage && !canChangeWorkflow && (
                <Typography
                  sx={{ fontSize: 13, color: "text.secondary", maxWidth: "320px" }}
                  data-testid="lifecycle-workflow-locked"
                >
                  Only an approval workflow admin can change it while approval is pending or
                  rejected.
                </Typography>
              )}
            </Stack>
          </>
        }
      />

      <StandardModal
        isOpen={departmentOpen}
        onClose={() => setDepartmentOpen(false)}
        title="Department"
        description="The team that runs this use case. Used to group live use cases on the dashboard."
        submitButtonText="Save"
        isSubmitting={setDepartment.isPending}
        isSubmitDisabled={department.trim().length > 255}
        onSubmit={() => void saveDepartment()}
      >
        <Stack sx={{ gap: "16px" }}>
          <Field
            id="use-case-department"
            label="Department"
            value={department}
            onChange={(event) => setDepartmentDraft(event.target.value)}
            placeholder="For example, Finance"
            isOptional
          />
          {error && <Alert variant="error" body={error} inline />}
        </Stack>
      </StandardModal>

      <StandardModal
        isOpen={workflowOpen}
        onClose={() => setWorkflowOpen(false)}
        title={currentWorkflowId ? "Change approval workflow" : "Attach approval workflow"}
        description="The workflow decides who reviews this use case before it can go live."
        submitButtonText="Save"
        isSubmitting={setApprovalWorkflow.isPending}
        isSubmitDisabled={workflowDraft === Number(currentWorkflowId)}
        onSubmit={() => void saveWorkflow()}
      >
        <Stack sx={{ gap: "16px" }}>
          <UseCaseWorkflowSelect
            id="use-case-approval-workflow"
            value={workflowDraft}
            onChange={setWorkflowDraft}
            allowNone={!!currentWorkflowId}
            showManageLink
          />
          {workflowNotes.length > 0 && (
            <Stack sx={{ gap: "4px" }} data-testid="lifecycle-workflow-notes">
              {workflowNotes.map((note) => (
                <Typography key={note} sx={{ fontSize: 13, color: "text.secondary" }}>
                  {note}
                </Typography>
              ))}
            </Stack>
          )}
          {workflowError && <Alert variant="error" body={workflowError} inline />}
        </Stack>
      </StandardModal>
    </>
  );
};

export default UseCaseLifecyclePanel;
