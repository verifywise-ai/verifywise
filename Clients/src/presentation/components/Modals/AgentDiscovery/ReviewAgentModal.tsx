import React, { useEffect, useState } from "react";
import { Drawer, Stack, Box, Typography, Divider, IconButton } from "@mui/material";
import { X, Link as LinkIcon, Unlink, Pencil } from "lucide-react";
import VWChip from "../../Chip";
import { CustomizableButton } from "../../button/customizable-button";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { AgentPrimitiveRow } from "../../../../domain/interfaces/i.agentDiscovery";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import LinkAgentModal, { AgentLinkKind } from "./LinkAgentModal";
import Alert from "../../Alert";
import { getClientErrorReason } from "../../../../application/utils/apiErrorReason";
import { useHasPermission } from "../../../../application/hooks/useMyPermissions";
import {
  formatSourceLabel,
  formatUseCaseLabel,
  getAgentOwnerIds,
  getReviewStatusDisplay,
} from "../../../pages/AgentDiscovery/agentLabels";
import { useUserNames } from "../../../pages/AgentDiscovery/useUserNames";
import { useLinkedModelLabel } from "../../../pages/AgentDiscovery/useLinkedModelLabel";
import { palette } from "../../../themes/palette";

interface ReviewAgentModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  agent: AgentPrimitiveRow | null;
  onSuccess: () => void;
  onEdit?: (agent: AgentPrimitiveRow) => void;
}

const ReviewAgentModal: React.FC<ReviewAgentModalProps> = ({
  isOpen,
  setIsOpen,
  agent,
  onSuccess,
  onEdit,
}) => {
  const formatUserDate = useFormattedDate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  // Set only when the link drawer opens, so it keeps its kind while it closes.
  const [linkKind, setLinkKind] = useState<AgentLinkKind>("model");
  const openLink = (kind: AgentLinkKind) => {
    setLinkKind(kind);
    setIsLinkOpen(true);
  };
  const [actionError, setActionError] = useState<string | null>(null);
  // Review, link, unlink and edit need the agentDiscovery.admin permission
  // (Admins by default) on the server; everyone else gets a read-only view.
  const canManage = useHasPermission("agentDiscovery.admin", { fallbackToAdmin: true });

  useEffect(() => {
    setActionError(null);
  }, [isOpen, agent?.id]);
  const { formatUser } = useUserNames();
  // Fetched only while the drawer is open.
  const linkedModelLabel = useLinkedModelLabel(
    isOpen ? (agent?.linked_model_inventory_id ?? null) : null,
  );

  if (!agent) return null;

  // All owners, primary first (see getAgentOwnerIds for the legacy owner_id).
  const ownerIds = getAgentOwnerIds(agent);
  const ownerNames = ownerIds.length > 0 ? ownerIds.map((oid) => formatUser(oid)).join(", ") : "—";
  const linkedModelName = agent.linked_model_inventory_id
    ? linkedModelLabel || `Model #${agent.linked_model_inventory_id}`
    : null;
  const linkedUseCaseName = agent.linked_project_id ? formatUseCaseLabel(agent) : null;
  const reviewedByName = agent.reviewed_by ? formatUser(agent.reviewed_by) : null;
  const reviewStatus = getReviewStatusDisplay(agent.review_status);

  const handleReview = async (status: "confirmed" | "rejected") => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      await apiServices.patch(`/agent-primitives/${agent.id}/review`, {
        review_status: status,
      });
      onSuccess();
    } catch (error) {
      setActionError(getClientErrorReason(error) ?? "Could not update the agent. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlink = async (path: "unlink-model" | "unlink-use-case") => {
    // One request at a time: a double click must not send a second unlink.
    if (isSubmitting) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await apiServices.patch(`/agent-primitives/${agent.id}/${path}`);
      onSuccess();
    } catch (error) {
      setActionError(getClientErrorReason(error) ?? "Could not update the agent. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLinkSuccess = () => {
    setIsLinkOpen(false);
    onSuccess();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return formatUserDate(dateStr, { includeTime: true });
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={isOpen}
        onClose={() => setIsOpen(false)}
        PaperProps={{
          sx: { width: 480, backgroundColor: palette.background.modal },
        }}
      >
        {/* Header */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ p: "16px 24px" }}
        >
          <Typography fontSize={16} fontWeight={600}>
            Agent details
          </Typography>
          <IconButton onClick={() => setIsOpen(false)} size="small">
            <X size={20} />
          </IconButton>
        </Stack>

        <Divider />

        {/* Content */}
        <Stack sx={{ p: "24px", gap: "20px", flex: 1, overflow: "auto" }}>
          {/* Entry type — makes manual vs. discovered explicit up top */}
          <Box>
            <Typography fontSize={12} fontWeight={600} color="text.secondary" mb="4px">
              Entry type
            </Typography>
            <VWChip
              label={agent.is_manual ? "Manual" : formatSourceLabel(agent.source_system)}
              variant="info"
              size="small"
            />
          </Box>

          <DetailRow label="Display name" value={agent.display_name} />
          <DetailRow label="Type" value={agent.primitive_type} />
          <DetailRow label="Owners" value={ownerNames} />
          {/* Discovery-only fields — hidden for manually added agents, which have
              no source/external id/activity data to show. */}
          {!agent.is_manual && (
            <>
              <DetailRow label="Source system" value={formatSourceLabel(agent.source_system)} />
              <DetailRow label="External ID" value={agent.external_id} />
              <DetailRow label="Last activity" value={formatDate(agent.last_activity)} />
            </>
          )}
          <DetailRow label="Created" value={formatDate(agent.created_at)} />

          {/* Review status with audit info */}
          <Box>
            <Typography fontSize={12} fontWeight={600} color="text.secondary" mb="4px">
              Review status
            </Typography>
            <Stack direction="row" alignItems="center" gap="8px">
              <VWChip label={reviewStatus.label} variant={reviewStatus.variant} />
              {reviewedByName && (
                <Typography fontSize={12} color="text.secondary">
                  by {reviewedByName} on {formatDate(agent.reviewed_at)}
                </Typography>
              )}
            </Stack>
          </Box>

          {agent.is_stale && (
            <DetailRow label="Stale" value="This agent has been inactive for 30+ days" />
          )}

          {/* Notes — shown for manually added agents (their metadata.notes). */}
          {agent.is_manual && agent.metadata?.notes && (
            <DetailRow label="Notes" value={agent.metadata.notes} />
          )}

          {/* Permissions — discovery-derived, so hidden for manual agents. */}
          {!agent.is_manual && (
            <>
              <Box>
                <Typography fontSize={12} fontWeight={600} color="text.secondary" mb="4px">
                  Categories
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap="4px">
                  {(agent.permission_categories || []).length > 0 ? (
                    agent.permission_categories.map((cat: string) => (
                      <VWChip key={cat} label={cat} variant="info" size="small" />
                    ))
                  ) : (
                    <Typography fontSize={13} color="text.secondary">
                      None
                    </Typography>
                  )}
                </Stack>
              </Box>

              <Box>
                <Typography fontSize={12} fontWeight={600} color="text.secondary" mb="4px">
                  Raw permissions
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap="4px">
                  {(agent.permissions || []).length > 0 ? (
                    agent.permissions.map((perm: any, idx: number) => (
                      <VWChip
                        key={idx}
                        label={typeof perm === "string" ? perm : JSON.stringify(perm)}
                        size="small"
                      />
                    ))
                  ) : (
                    <Typography fontSize={13} color="text.secondary">
                      None
                    </Typography>
                  )}
                </Stack>
              </Box>
            </>
          )}

          {/* Links. These work for synced agents too, which cannot be edited. */}
          <LinkSection
            label="Linked use case"
            linkedName={linkedUseCaseName}
            canManage={canManage}
            linkText="Link to use case"
            unlinkTitle="Unlink use case"
            disabled={isSubmitting}
            onLink={() => openLink("useCase")}
            onUnlink={() => handleUnlink("unlink-use-case")}
          />
          <LinkSection
            label="Linked model"
            linkedName={linkedModelName}
            canManage={canManage}
            linkText="Link to model"
            unlinkTitle="Unlink model"
            disabled={isSubmitting}
            onLink={() => openLink("model")}
            onUnlink={() => handleUnlink("unlink-model")}
          />

          {/* Raw metadata — discovery-derived (region/project/etc). Hidden for
              manual agents, whose only metadata (notes) is shown above. */}
          {!agent.is_manual && Object.keys(agent.metadata || {}).length > 0 && (
            <Box>
              <Typography fontSize={12} fontWeight={600} color="text.secondary" mb="8px">
                Metadata
              </Typography>
              <Box
                sx={{
                  p: "12px",
                  borderRadius: "4px",
                  border: `1px solid ${palette.border.light}`,
                  backgroundColor: palette.background.accent,
                  fontSize: 12,
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  maxHeight: 200,
                  overflow: "auto",
                }}
              >
                {JSON.stringify(agent.metadata, null, 2)}
              </Box>
            </Box>
          )}
        </Stack>

        {actionError && (
          <Box sx={{ px: "24px", pb: "16px" }}>
            <Alert variant="error" body={actionError} hasIcon={false} sx={{ position: "static" }} />
          </Box>
        )}

        {/* Footer */}
        <Divider />
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ p: "16px 24px" }}
        >
          {/* Edit — only for manually added agents (synced agents aren't editable). */}
          <Box>
            {canManage && agent.is_manual && onEdit && (
              <CustomizableButton
                variant="outlined"
                sx={{ border: `1px solid ${palette.border.dark}` }}
                icon={<Pencil size={14} strokeWidth={1.5} />}
                text="Edit"
                onClick={() => {
                  setIsOpen(false);
                  onEdit(agent);
                }}
              />
            )}
          </Box>
          <Stack direction="row" gap="8px">
            <CustomizableButton
              variant="outlined"
              sx={{ border: `1px solid ${palette.border.dark}` }}
              onClick={() => setIsOpen(false)}
            >
              {canManage ? "Cancel" : "Close"}
            </CustomizableButton>
            {canManage && agent.review_status !== "rejected" && (
              <CustomizableButton
                variant="outlined"
                sx={{
                  border: `1px solid ${palette.status.error.text}`,
                  color: palette.status.error.text,
                }}
                onClick={() => handleReview("rejected")}
                isDisabled={isSubmitting}
              >
                Reject
              </CustomizableButton>
            )}
            {canManage && agent.review_status !== "confirmed" && (
              <CustomizableButton
                variant="contained"
                onClick={() => handleReview("confirmed")}
                isDisabled={isSubmitting}
              >
                Confirm
              </CustomizableButton>
            )}
          </Stack>
        </Stack>
      </Drawer>

      <LinkAgentModal
        isOpen={isLinkOpen}
        setIsOpen={setIsLinkOpen}
        agentId={agent.id}
        kind={linkKind}
        onSuccess={handleLinkSuccess}
      />
    </>
  );
};

/** One link (use case or model): its name with unlink, or a link button. */
const LinkSection: React.FC<{
  label: string;
  linkedName: string | null;
  canManage: boolean;
  linkText: string;
  unlinkTitle: string;
  disabled: boolean;
  onLink: () => void;
  onUnlink: () => void;
}> = ({ label, linkedName, canManage, linkText, unlinkTitle, disabled, onLink, onUnlink }) => (
  <Box>
    <Typography fontSize={12} fontWeight={600} color="text.secondary" mb="8px">
      {label}
    </Typography>
    {linkedName ? (
      <Stack direction="row" alignItems="center" gap="8px">
        <Typography fontSize={13}>{linkedName}</Typography>
        {canManage && (
          <IconButton
            size="small"
            onClick={onUnlink}
            disabled={disabled}
            title={unlinkTitle}
            aria-label={unlinkTitle}
          >
            <Unlink size={14} strokeWidth={1.5} />
          </IconButton>
        )}
      </Stack>
    ) : !canManage ? (
      <Typography fontSize={13}>Not linked</Typography>
    ) : (
      <CustomizableButton
        variant="outlined"
        sx={{ border: `1px solid ${palette.border.dark}` }}
        icon={<LinkIcon size={14} strokeWidth={1.5} />}
        text={linkText}
        isDisabled={disabled}
        onClick={onLink}
      />
    )}
  </Box>
);

const DetailRow: React.FC<{
  label: string;
  value: string;
}> = ({ label, value }) => (
  <Box>
    <Typography fontSize={12} fontWeight={600} color="text.secondary" mb="4px">
      {label}
    </Typography>
    <Typography fontSize={13}>{value}</Typography>
  </Box>
);

export default ReviewAgentModal;
