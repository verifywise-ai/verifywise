import { useState } from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";
import { CustomizableButton } from "../../../components/button/customizable-button";
import StandardModal from "../../../components/Modals/StandardModal";
import Select from "../../../components/Inputs/Select";
import Field from "../../../components/Inputs/Field";
import Alert from "../../../components/Alert";
import {
  useApprovePolicyDirectly,
  usePolicyApproval,
  useSubmitPolicyForApproval,
  useWithdrawPolicyApproval,
} from "../../../../application/hooks/usePolicyApproval";
import { useCan } from "../../../../application/hooks/useCan";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
import { radiusPx } from "../../../themes/palette";

/** Server limit for a direct-approve comment. */
const MAX_COMMENT_LENGTH = 2000;

/** Statuses a policy can be submitted or approved from (server rule). */
const APPROVABLE_STATUSES = ["Draft", "Under Review"];

export interface PolicyApprovalSectionProps {
  /** null while the policy is new and unsaved. */
  policyId: number | null;
  /** The saved status of the policy. */
  policyStatus: string | null;
  /** The editor holds changes that are not saved yet. */
  hasUnsavedChanges: boolean;
  /** The user can edit policies (shows the unsaved-policy hint). */
  canEdit: boolean;
  /** Called after an approval action changed the policy, so the editor can reload it. */
  onPolicyChanged?: () => void;
}

/** The server's reason for a failed approval action, or a generic line. */
function errorMessage(error: unknown, fallback: string): string {
  const e = error as {
    status?: number;
    message?: string;
    response?: { data?: unknown };
  } | null;
  if (!e || (e.status ?? 0) >= 500) return fallback;
  const data = e.response?.data;
  if (typeof data === "string" && data) return data;
  const fieldError = (data as { errors?: Array<{ message?: string }> } | undefined)?.errors?.[0]
    ?.message;
  if (fieldError) return fieldError;
  return e.message || fallback;
}

const textSx = { fontSize: "13px", color: "text.secondary" } as const;

/**
 * Approval block in the policy editor sidebar: the pending request, the last
 * decision, and the submit, approve and withdraw actions the server allows
 * (GET /api/v1/policies/:id/approval decides which).
 */
export function PolicyApprovalSection({
  policyId,
  policyStatus,
  hasUnsavedChanges,
  canEdit,
  onPolicyChanged,
}: PolicyApprovalSectionProps) {
  const { t } = useTranslation();
  const formatDate = useFormattedDate();
  const isAdmin = useCan("organization.admin");
  const { data, isLoading, isError } = usePolicyApproval(policyId ?? undefined);

  const submitMutation = useSubmitPolicyForApproval();
  const approveMutation = useApprovePolicyDirectly();
  const withdrawMutation = useWithdrawPolicyApproval();

  const [submitOpen, setSubmitOpen] = useState(false);
  const [workflowId, setWorkflowId] = useState<number | "">("");
  const [approveOpen, setApproveOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const genericError = t("Something went wrong, please try again");

  const container = (children: React.ReactNode) => (
    <Box
      data-testid="policy-approval-section"
      sx={{
        border: "1px solid",
        borderColor: "border.light",
        borderRadius: radiusPx.sm,
        p: "12px 16px",
        mb: "8px",
        flexShrink: 0,
      }}
    >
      <Typography sx={{ fontSize: "13px", fontWeight: 600, color: "text.primary", mb: "8px" }}>
        {t("Approval")}
      </Typography>
      <Stack gap="8px">{children}</Stack>
    </Box>
  );

  // New policy: nothing to submit until it is saved.
  if (policyId == null) {
    if (!canEdit) return null;
    return container(
      <>
        <Box>
          <CustomizableButton
            variant="outlined"
            text={t("Submit for approval")}
            isDisabled
            testId="policy-submit-for-approval"
          />
        </Box>
        <Typography sx={textSx}>
          {t("Save the policy before submitting it for approval.")}
        </Typography>
      </>,
    );
  }

  if (isLoading) {
    return container(<Skeleton variant="rectangular" height={34} />);
  }

  if (isError || !data) {
    return container(
      <Typography sx={textSx}>{t("Could not load the approval status.")}</Typography>,
    );
  }

  const pending = data.pending_request;
  const usable = data.usable_workflows;
  const isApprovable = policyStatus !== null && APPROVABLE_STATUSES.includes(policyStatus);
  const showNoWorkflowHint = !pending && usable.length === 0 && !isAdmin && isApprovable;

  let decisionLine: string | null = null;
  if (!pending && data.review_status === "approved") {
    decisionLine = data.reviewed_by_name
      ? fill(t("Approved by {name} on {date}"), {
          name: data.reviewed_by_name,
          date: formatDate(data.reviewed_at),
        })
      : fill(t("Approved on {date}"), { date: formatDate(data.reviewed_at) });
  } else if (!pending && data.review_status === "changes_requested") {
    decisionLine = data.reviewed_by_name
      ? fill(t("Changes requested by {name}"), { name: data.reviewed_by_name })
      : t("Changes requested");
  }

  const hasActions = data.can_submit || data.can_approve_directly;
  if (!pending && !decisionLine && !hasActions && !showNoWorkflowHint) return null;

  const singleWorkflow = usable.length === 1 ? usable[0] : null;
  const commentTooLong = comment.length > MAX_COMMENT_LENGTH;

  const afterChange = () => {
    onPolicyChanged?.();
  };

  const openSubmit = () => {
    submitMutation.reset();
    setWorkflowId("");
    setSubmitOpen(true);
  };

  const handleSubmit = () => {
    if (usable.length > 1 && workflowId === "") return;
    submitMutation.mutate(
      {
        policyId,
        // One usable workflow: the server picks it.
        workflowId: usable.length > 1 ? Number(workflowId) : undefined,
      },
      {
        onSuccess: () => {
          setSubmitOpen(false);
          afterChange();
        },
      },
    );
  };

  const openApprove = () => {
    approveMutation.reset();
    setComment("");
    setApproveOpen(true);
  };

  const handleApprove = () => {
    if (commentTooLong) return;
    approveMutation.mutate(
      { policyId, comment: comment.trim() || undefined },
      {
        onSuccess: () => {
          setApproveOpen(false);
          afterChange();
        },
      },
    );
  };

  const handleWithdraw = () => {
    if (!pending) return;
    setWithdrawError(null);
    withdrawMutation.mutate(
      { policyId, requestId: pending.id },
      {
        onSuccess: () => {
          setWithdrawOpen(false);
          afterChange();
        },
        onError: (error) => {
          setWithdrawOpen(false);
          setWithdrawError(errorMessage(error, genericError));
        },
      },
    );
  };

  return (
    <>
      {container(
        <>
          {pending && (
            <Stack gap="4px" data-testid="policy-approval-pending">
              <Typography sx={{ ...textSx, color: "text.primary" }}>
                {fill(t("Waiting for approval in {workflow}"), {
                  workflow: pending.workflow_title,
                })}
              </Typography>
              <Typography sx={textSx}>
                {fill(t("Step {current} of {total}"), {
                  current: pending.current_step,
                  total: pending.total_steps,
                })}
              </Typography>
              <Typography sx={textSx}>
                {pending.requested_by_name
                  ? fill(t("Requested by {name} on {date}"), {
                      name: pending.requested_by_name,
                      date: formatDate(pending.created_at),
                    })
                  : fill(t("Requested on {date}"), { date: formatDate(pending.created_at) })}
              </Typography>
            </Stack>
          )}

          {decisionLine && (
            <Stack gap="4px" data-testid="policy-approval-decision">
              <Typography sx={{ ...textSx, color: "text.primary" }}>{decisionLine}</Typography>
              {data.review_comment && (
                <Typography sx={{ ...textSx, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {data.review_comment}
                </Typography>
              )}
            </Stack>
          )}

          {showNoWorkflowHint && (
            <Typography sx={textSx} data-testid="policy-approval-no-workflow">
              {t(
                "An Admin approves this policy. Your organization has no policy approval workflow.",
              )}
            </Typography>
          )}

          {(hasActions || data.can_withdraw) && (
            <Stack direction="row" gap="8px" flexWrap="wrap">
              {data.can_submit && (
                <CustomizableButton
                  variant="contained"
                  text={t("Submit for approval")}
                  isDisabled={hasUnsavedChanges}
                  onClick={openSubmit}
                  testId="policy-submit-for-approval"
                />
              )}
              {data.can_approve_directly && (
                <CustomizableButton
                  variant="contained"
                  text={t("Approve")}
                  isDisabled={hasUnsavedChanges}
                  onClick={openApprove}
                  testId="policy-approve-directly"
                />
              )}
              {data.can_withdraw && (
                <CustomizableButton
                  variant="outlined"
                  text={t("Withdraw request")}
                  onClick={() => {
                    setWithdrawError(null);
                    setWithdrawOpen(true);
                  }}
                  testId="policy-withdraw-approval"
                />
              )}
            </Stack>
          )}

          {hasActions && hasUnsavedChanges && (
            <Typography sx={textSx} data-testid="policy-approval-unsaved-hint">
              {t("Save your changes before sending the policy for approval.")}
            </Typography>
          )}

          {withdrawError && <Alert variant="error" body={withdrawError} isToast={false} />}
        </>,
      )}

      <StandardModal
        isOpen={submitOpen}
        onClose={() => !submitMutation.isPending && setSubmitOpen(false)}
        title={t("Submit for approval")}
        description={
          singleWorkflow
            ? fill(t("{workflow} approves this policy. It stays under review until a decision."), {
                workflow: singleWorkflow.workflow_title,
              })
            : t("Choose the workflow that approves this policy.")
        }
        onSubmit={handleSubmit}
        submitButtonText={t("Submit")}
        isSubmitting={submitMutation.isPending}
        isSubmitDisabled={usable.length > 1 && workflowId === ""}
        maxWidth="480px"
        fitContent
      >
        <Stack gap="16px">
          {usable.length > 1 && (
            <Select
              id="policy-approval-workflow"
              label={t("Approval workflow")}
              placeholder={t("Select a workflow")}
              value={workflowId}
              onChange={(e) => setWorkflowId(Number(e.target.value))}
              items={usable.map((w) => ({ _id: w.id, name: w.workflow_title }))}
              isRequired
              dataTestId="policy-approval-workflow-select"
            />
          )}
          {submitMutation.isError && (
            <Alert
              variant="error"
              body={errorMessage(submitMutation.error, genericError)}
              isToast={false}
            />
          )}
        </Stack>
      </StandardModal>

      <StandardModal
        isOpen={approveOpen}
        onClose={() => !approveMutation.isPending && setApproveOpen(false)}
        title={t("Approve policy")}
        description={t(
          "Your organization has no policy approval workflow, so you approve it here.",
        )}
        onSubmit={handleApprove}
        submitButtonText={t("Approve")}
        isSubmitting={approveMutation.isPending}
        isSubmitDisabled={commentTooLong}
        maxWidth="480px"
        fitContent
      >
        <Stack gap="16px">
          <Field
            id="policy-approve-comment"
            label={t("Comment")}
            isOptional
            multiline
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            error={commentTooLong ? t("Comment must be 2000 characters or fewer") : undefined}
            dataTestId="policy-approve-comment"
          />
          {approveMutation.isError && (
            <Alert
              variant="error"
              body={errorMessage(approveMutation.error, genericError)}
              isToast={false}
            />
          )}
        </Stack>
      </StandardModal>

      <StandardModal
        isOpen={withdrawOpen}
        onClose={() => !withdrawMutation.isPending && setWithdrawOpen(false)}
        title={t("Withdraw approval request?")}
        description={t("The policy goes back to draft. You can submit it again later.")}
        onSubmit={handleWithdraw}
        submitButtonText={t("Withdraw")}
        isSubmitting={withdrawMutation.isPending}
        maxWidth="480px"
        fitContent
      />
    </>
  );
}
