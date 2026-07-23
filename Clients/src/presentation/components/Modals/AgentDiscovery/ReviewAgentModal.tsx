import React, { useState, useEffect, useCallback } from "react";
import { Drawer, Stack, Box, Typography, Divider, IconButton, useTheme } from "@mui/material";
import { X, Link as LinkIcon, Unlink, Pencil } from "lucide-react";
import VWChip from "../../Chip";
import { CustomizableButton } from "../../button/customizable-button";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { AgentPrimitiveRow } from "../../../../domain/interfaces/i.agentDiscovery";
import { displayFormattedDateTime } from "../../../tools/isoDateToString";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import LinkModelModal from "./LinkModelModal";

// Friendly display names for known discovery sources. Falls back to the raw
// source_system key (title-cased) for any source not listed here.
const SOURCE_LABELS: Record<string, string> = {
  "azure-ai-foundry": "Azure AI Foundry",
};

function formatSourceLabel(sourceSystem: string): string {
  if (SOURCE_LABELS[sourceSystem]) return SOURCE_LABELS[sourceSystem];
  return sourceSystem
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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
  const theme = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

  const fetchUsers = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/users" });
      const usersData = Array.isArray(response?.data) ? response.data : [];
      const map: Record<string, string> = {};
      usersData.forEach((u: { id: number; name: string; surname: string }) => {
        map[String(u.id)] = `${u.name} ${u.surname}`.trim();
      });
      setUsersMap(map);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen, fetchUsers]);

  if (!agent) return null;

  const ownerName = agent.owner_id ? usersMap[agent.owner_id] || agent.owner_id : "—";
  const reviewedByName = agent.reviewed_by
    ? usersMap[String(agent.reviewed_by)] || `User #${agent.reviewed_by}`
    : null;

  const handleReview = async (status: "confirmed" | "rejected") => {
    setIsSubmitting(true);
    try {
      await apiServices.patch(`/agent-primitives/${agent.id}/review`, {
        review_status: status,
      });
      onSuccess();
    } catch (error) {
      console.error("Failed to review agent:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlink = async () => {
    try {
      await apiServices.patch(`/agent-primitives/${agent.id}/unlink-model`);
      onSuccess();
    } catch (error) {
      console.error("Failed to unlink model:", error);
    }
  };

  const handleLinkSuccess = () => {
    setIsLinkModalOpen(false);
    onSuccess();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return displayFormattedDateTime(dateStr);
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={isOpen}
        onClose={() => setIsOpen(false)}
        PaperProps={{
          sx: { width: 480, backgroundColor: theme.palette.background.modal || "#FCFCFD" },
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
          <DetailRow label="Owner" value={ownerName} />
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
              <VWChip
                label={agent.review_status}
                variant={
                  agent.review_status === "confirmed"
                    ? "success"
                    : agent.review_status === "rejected"
                      ? "error"
                      : "warning"
                }
              />
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

          {/* Model link */}
          <Box>
            <Typography fontSize={12} fontWeight={600} color="text.secondary" mb="8px">
              Linked model
            </Typography>
            {agent.linked_model_inventory_id ? (
              <Stack direction="row" alignItems="center" gap="8px">
                <Typography fontSize={13}>Model #{agent.linked_model_inventory_id}</Typography>
                <IconButton size="small" onClick={handleUnlink} title="Unlink model">
                  <Unlink size={14} strokeWidth={1.5} />
                </IconButton>
              </Stack>
            ) : (
              <CustomizableButton
                variant="outlined"
                sx={{ border: "1px solid #d0d5dd" }}
                icon={<LinkIcon size={14} strokeWidth={1.5} />}
                text="Link to model"
                onClick={() => setIsLinkModalOpen(true)}
              />
            )}
          </Box>

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
                  border: `1px solid ${theme.palette.border?.light || "#d0d5dd"}`,
                  backgroundColor: "#f9f9f9",
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
            {agent.is_manual && onEdit && (
              <CustomizableButton
                variant="outlined"
                sx={{ border: "1px solid #d0d5dd" }}
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
              sx={{ border: "1px solid #d0d5dd" }}
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </CustomizableButton>
            {agent.review_status !== "rejected" && (
              <CustomizableButton
                variant="outlined"
                sx={{ border: "1px solid #d32f2f", color: "#d32f2f" }}
                onClick={() => handleReview("rejected")}
                isDisabled={isSubmitting}
              >
                Reject
              </CustomizableButton>
            )}
            {agent.review_status !== "confirmed" && (
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

      <LinkModelModal
        isOpen={isLinkModalOpen}
        setIsOpen={setIsLinkModalOpen}
        agentId={agent.id}
        onSuccess={handleLinkSuccess}
      />
    </>
  );
};

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
