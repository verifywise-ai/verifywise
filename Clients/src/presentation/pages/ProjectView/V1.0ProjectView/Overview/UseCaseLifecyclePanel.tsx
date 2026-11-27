import { useEffect, useRef, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Pencil } from "lucide-react";
import StandardModal from "../../../../components/Modals/StandardModal";
import Field from "../../../../components/Inputs/Field";
import Alert from "../../../../components/Alert";
import StatusBadge from "../../../../components/StatusBadge";
import { VWLink } from "../../../../components/Link";
import UseCaseWorkflowSelect, {
  archivedWorkflowLabel,
} from "../../../../components/UseCaseWorkflowSelect";
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
import {
  useUseCaseApprovalWorkflow,
  useUseCaseApprovalWorkflows,
} from "../../../../../application/hooks/useUseCaseApprovalWorkflows";
import { useTranslation } from "../../../../../application/hooks/useTranslation";
import { LifecycleStage } from "../../../../../domain/enums/lifecycleStage.enum";
import { Project } from "../../../../../domain/types/Project";
import {
  getApiValidationMessage,
  getClientErrorReason,
} from "../../../../../application/utils/apiErrorReason";
import { fontSize } from "../../../../themes/typography";

/**
 * What saving a workflow choice does, sentence by sentence, as the server
 * does it (project.ctrl.ts updateProjectById): attaching or replacing opens
 * a new approval request (approved at once when an auto-approve level
 * covers the use case's risk), and only a planned use case moves to In review;
 * replacing or clearing withdraws a pending request.
 */
function workflowChangeNotes({
  selected,
  current,
  stage,
  approvalStatus,
  autoApproves,
}: {
  selected: number;
  current: number;
  stage: LifecycleStage;
  approvalStatus: Project["approval_status"];
  /** The selected workflow has an auto-approve risk level. */
  autoApproves: boolean;
}): string[] {
  if (selected === current) return [];
  const notes: string[] = [];
  if (selected) {
    notes.push("Saving sends this use case for approval.");
    if (stage === LifecycleStage.PLANNED) {
      notes.push("It moves to In review until the request is approved or rejected.");
    }
    // createUseCaseApprovalRequest approves at once when the use case's risk
    // is at or below the workflow's threshold.
    if (autoApproves) {
      notes.push(
        "If its risk classification is at or below the workflow's auto-approve level, it is approved at once.",
      );
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
  const { goLive, retire, confirm, setDepartment, setApprovalWorkflow, resubmitApproval } =
    useUseCaseLifecycleActions(project.id);
  const { data: summary } = useUseCaseLifecycleSummary();
  const { data: workflows } = useUseCaseApprovalWorkflows();
  const { t } = useTranslation();

  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [department, setDepartmentDraft] = useState(project.department ?? "");
  const [error, setError] = useState<string | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [workflowDraft, setWorkflowDraft] = useState(0);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

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
  // The project responses do not carry the workflow id; this endpoint does,
  // with its title, whether it is archived, and the approval status.
  const {
    data: attached,
    isSuccess: attachedLoaded,
    isError: attachedFailed,
    refetch: refetchAttached,
  } = useUseCaseApprovalWorkflow(project.id);
  // viewer_can_write depends on the owner and members, so re-read it when a
  // save changes them rather than offering Resubmit from a cached answer.
  const accessKey = JSON.stringify([project.owner ?? null, project.members ?? []]);
  const lastAccessKey = useRef(accessKey);
  useEffect(() => {
    if (lastAccessKey.current === accessKey) return;
    lastAccessKey.current = accessKey;
    void refetchAttached();
  }, [accessKey, refetchAttached]);
  const approvalStatus = attachedLoaded
    ? attached.approval_status
    : (project.approval_status ?? null);
  const currentWorkflowId = attached?.approval_workflow_id ?? 0;
  // The PATCH that changes it is authorized on useCase.edit, which an owner
  // who may manage the lifecycle does not always hold.
  const canEditWorkflow = canManage && canEditUseCases;
  const canChangeWorkflow =
    attachedLoaded && canEditWorkflow && (!approvalStatus || isWorkflowAdmin);
  // An attached workflow that can't be chosen again: archived (its title
  // kept), or not found in the organization (no title at all).
  const savedWorkflow =
    currentWorkflowId && attached?.workflow_is_active === false
      ? {
          id: currentWorkflowId,
          label: attached.workflow_title
            ? archivedWorkflowLabel(attached.workflow_title, t)
            : "Unavailable workflow",
          // The user's title is not translated; the fixed label is.
          noTranslate: !!attached.workflow_title,
        }
      : null;
  const workflowLabel: { text: string; noTranslate: boolean } = attachedFailed
    ? { text: "Could not load the approval workflow.", noTranslate: false }
    : !attachedLoaded
      ? { text: "", noTranslate: false }
      : !currentWorkflowId
        ? { text: "None", noTranslate: false }
        : savedWorkflow
          ? { text: savedWorkflow.label, noTranslate: savedWorkflow.noTranslate }
          : { text: attached.workflow_title ?? "", noTranslate: true };
  // A rejected use case goes back for approval under the same workflow
  // (POST /v1/projects/:id/resubmit-approval), gated like the server:
  // useCase.edit plus write access to this use case. Write access comes from
  // the server (viewer_can_write, the rule the route's guard applies), so a
  // user who writes through a group attached to the use case gets the button
  // too; while it loads or if it fails, there is no button. No approval
  // workflow admin is needed since the workflow stays. An archived or missing
  // workflow can't review it; an admin changes it first.
  const canResubmit =
    attachedLoaded &&
    // canManage only rules out Auditors here, since useCase.edit is held.
    canManage &&
    canEditUseCases &&
    attached.viewer_can_write === true &&
    approvalStatus === "rejected" &&
    !!currentWorkflowId &&
    attached.workflow_is_active === true;
  // As the server does it: only a planned use case moves to In review. A
  // resubmission is never auto-approved, since a person rejected it.
  const resubmitNotes: string[] = [];
  if (stage === LifecycleStage.PLANNED) {
    resubmitNotes.push("It moves to In review until the request is approved or rejected.");
  }
  const workflowNotes = workflowChangeNotes({
    selected: workflowDraft,
    current: Number(currentWorkflowId),
    stage,
    approvalStatus,
    autoApproves: !!workflows?.find((workflow) => workflow._id === workflowDraft)
      ?.autoApproveMaxRisk,
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
      // A refused workflow comes back as a field error on approval_workflow_id
      // ({ errors: [...] }), a refused change as a plain message.
      setWorkflowError(
        getApiValidationMessage(err, { passThrough: ["approval_workflow_id"] }) ||
          "The change could not be saved.",
      );
    }
  };

  const resubmit = async () => {
    setResubmitError(null);
    try {
      await resubmitApproval.mutateAsync();
      setResubmitOpen(false);
      setToast("The use case was sent for approval.");
      onChanged?.();
    } catch (err) {
      // The server's reason for a refusal (409, 400, 403); never a 5xx's.
      setResubmitError(getClientErrorReason(err) || "The use case could not be resubmitted.");
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
          // With a usable workflow attached, whoever may resubmit is told to.
          approvalStatus === "rejected"
            ? attachedLoaded && !currentWorkflowId
              ? isWorkflowAdmin
                ? "Its last approval request was rejected. Attach an approval workflow and get it approved before marking it as live."
                : "Its last approval request was rejected. An approval workflow admin needs to attach a workflow and get it approved before it can go live."
              : canResubmit
                ? "Its last approval request was rejected. Resubmit it for approval and get it approved before marking it as live."
                : "Approve this use case before marking it as live. Its last approval request was rejected."
            : approvalStatus === "pending"
              ? "Approve this use case before marking it as live."
              : undefined
        }
        goLive={goLive}
        retire={retire}
        confirm={confirm}
        onChanged={onChanged}
        isBusy={
          setDepartment.isPending || setApprovalWorkflow.isPending || resubmitApproval.isPending
        }
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
                  data-vw-no-translate={workflowLabel.noTranslate ? "true" : undefined}
                >
                  {workflowLabel.text}
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
                {canResubmit && (
                  <VWLink
                    testId="lifecycle-workflow-resubmit"
                    onClick={() => {
                      setResubmitError(null);
                      setResubmitOpen(true);
                    }}
                  >
                    Resubmit for approval
                  </VWLink>
                )}
                {canChangeWorkflow && (
                  <VWLink testId="lifecycle-workflow-action" onClick={openWorkflow}>
                    {currentWorkflowId ? "Change workflow" : "Attach workflow"}
                  </VWLink>
                )}
              </Stack>
              {canEditWorkflow && !canChangeWorkflow && (
                <Typography
                  sx={{ fontSize: fontSize.base, color: "text.secondary", maxWidth: "320px" }}
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
            savedWorkflow={savedWorkflow}
            showManageLink
          />
          {workflowNotes.length > 0 && (
            <Stack sx={{ gap: "4px" }} data-testid="lifecycle-workflow-notes">
              {workflowNotes.map((note) => (
                <Typography key={note} sx={{ fontSize: fontSize.base, color: "text.secondary" }}>
                  {note}
                </Typography>
              ))}
            </Stack>
          )}
          {workflowError && <Alert variant="error" body={workflowError} inline />}
        </Stack>
      </StandardModal>

      <StandardModal
        isOpen={resubmitOpen}
        onClose={() => setResubmitOpen(false)}
        title="Resubmit for approval"
        description={t("Send this use case for approval again with {workflow}?").replace(
          "{workflow}",
          () => attached?.workflow_title ?? "",
        )}
        submitButtonText="Resubmit"
        isSubmitting={resubmitApproval.isPending}
        onSubmit={() => void resubmit()}
      >
        <Stack sx={{ gap: "16px" }}>
          {resubmitNotes.length > 0 && (
            <Stack sx={{ gap: "4px" }} data-testid="lifecycle-resubmit-notes">
              {resubmitNotes.map((note) => (
                <Typography key={note} sx={{ fontSize: fontSize.base, color: "text.secondary" }}>
                  {note}
                </Typography>
              ))}
            </Stack>
          )}
          {resubmitError && <Alert variant="error" body={resubmitError} inline />}
        </Stack>
      </StandardModal>

      {toast && <Alert variant="success" body={toast} isToast onClick={() => setToast(null)} />}
    </>
  );
};

export default UseCaseLifecyclePanel;
