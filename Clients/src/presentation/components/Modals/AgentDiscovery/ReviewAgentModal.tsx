import React, { useState, useEffect, useCallback } from "react";
import {
  Drawer,
  Stack,
  Box,
  Typography,
  Divider,
  IconButton,
  Chip as MuiChip,
  useTheme,
  Tab,
} from "@mui/material";
import { TabContext, TabList, TabPanel } from "@mui/lab";
import { X, Link as LinkIcon, Unlink } from "lucide-react";
import VWChip from "../../Chip";
import { CustomizableButton } from "../../button/customizable-button";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { AgentPrimitiveRow } from "../../../../domain/interfaces/i.agentDiscovery";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import LinkModelModal from "./LinkModelModal";

interface ReviewAgentModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  agent: AgentPrimitiveRow | null;
  onSuccess: () => void;
}

const ReviewAgentModal: React.FC<ReviewAgentModalProps> = ({
  isOpen,
  setIsOpen,
  agent,
  onSuccess,
}) => {
  const theme = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [permissionsTab, setPermissionsTab] = useState("categories");
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
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={isOpen}
        onClose={() => setIsOpen(false)}
        PaperProps={{ sx: { width: 480, backgroundColor: theme.palette.background.modal || "#FCFCFD" } }}
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
          <DetailRow label="Display name" value={agent.display_name} />
          <DetailRow label="Source system" value={agent.source_system} />
          <DetailRow label="Type" value={agent.primitive_type} />
          <DetailRow label="External ID" value={agent.external_id} />
          <DetailRow label="Owner" value={ownerName} />
          <DetailRow label="Last activity" value={formatDate(agent.last_activity)} />
          <DetailRow label="Created" value={formatDate(agent.created_at)} />
          <Box>
            <Typography fontSize={12} fontWeight={600} color="text.secondary" mb={0.5}>
              Review status
            </Typography>
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
          </Box>
          {agent.is_stale && (
            <DetailRow label="Stale" value="This agent has been inactive for 30+ days" />
          )}
          {agent.is_manual && (
            <DetailRow label="Entry type" value="Manually added" />
          )}

          {/* Permissions with toggle */}
          <Box>
            <Typography fontSize={12} fontWeight={600} color="text.secondary" mb={1}>
              Permissions
            </Typography>
            <TabContext value={permissionsTab}>
              <TabList
                onChange={(_, v) => setPermissionsTab(v)}
                sx={{
                  minHeight: 28,
                  "& .MuiTab-root": { minHeight: 28, fontSize: 12, py: 0, textTransform: "none" },
                  "& .MuiTabs-indicator": { backgroundColor: "brand.primary" },
                }}
              >
                <Tab label="Categories" value="categories" />
                <Tab label="Raw" value="raw" />
              </TabList>
              <TabPanel value="categories" sx={{ p: "8px 0 0 0" }}>
                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                  {(agent.permission_categories || []).length > 0 ? (
                    agent.permission_categories.map((cat: string) => (
                      <MuiChip
                        key={cat}
                        label={cat}
                        size="small"
                        sx={{ fontSize: 11, height: 22 }}
                      />
                    ))
                  ) : (
                    <Typography fontSize={13} color="text.secondary">
                      None
                    </Typography>
                  )}
                </Stack>
              </TabPanel>
              <TabPanel value="raw" sx={{ p: "8px 0 0 0" }}>
                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                  {(agent.permissions || []).length > 0 ? (
                    agent.permissions.map((perm: any, idx: number) => (
                      <MuiChip
                        key={idx}
                        label={typeof perm === "string" ? perm : JSON.stringify(perm)}
                        size="small"
                        sx={{ fontSize: 11, height: 22 }}
                      />
                    ))
                  ) : (
                    <Typography fontSize={13} color="text.secondary">
                      None
                    </Typography>
                  )}
                </Stack>
              </TabPanel>
            </TabContext>
          </Box>

          {/* Model link */}
          <Box>
            <Typography fontSize={12} fontWeight={600} color="text.secondary" mb={1}>
              Linked model
            </Typography>
            {agent.linked_model_inventory_id ? (
              <Stack direction="row" alignItems="center" gap={1}>
                <Typography fontSize={13}>
                  Model #{agent.linked_model_inventory_id}
                </Typography>
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

          {/* Metadata */}
          {Object.keys(agent.metadata || {}).length > 0 && (
            <Box>
              <Typography fontSize={12} fontWeight={600} color="text.secondary" mb={1}>
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
        <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ p: "16px 24px" }}>
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
              sx={{ border: "1px solid status.error.text", color: "status.error.text" }}
              onClick={() => handleReview("rejected")}
              isDisabled={isSubmitting}
            >
              Reject
            </CustomizableButton>
          )}
          {agent.review_status !== "confirmed" && (
            <CustomizableButton
              variant="contained"
              sx={{ backgroundColor: "brand.primary", border: "1px solid brand.primary" }}
              onClick={() => handleReview("confirmed")}
              isDisabled={isSubmitting}
            >
              Confirm
            </CustomizableButton>
          )}
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
    <Typography fontSize={12} fontWeight={600} color="text.secondary" mb={0.5}>
      {label}
    </Typography>
    <Typography fontSize={13}>{value}</Typography>
  </Box>
);

export default ReviewAgentModal;
