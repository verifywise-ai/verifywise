import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Box, Stack, Typography, Divider } from "@mui/material";
import { Bot, ClipboardCheck, Eye, Pencil } from "lucide-react";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { EmptyState } from "../../../components/EmptyState";
import CustomizableSkeleton from "../../../components/Skeletons";
import VWChip from "../../../components/Chip";
import VWAvatar from "../../../components/Avatar/VWAvatar";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { getEntityById } from "../../../../application/repository/entity.repository";
import { logEngine } from "../../../../application/tools/log.engine";
import {
  AgentPrimitiveRow,
  AgentAuditLogEntry,
} from "../../../../domain/interfaces/i.agentDiscovery";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { getAgentLifecycle } from "../agentLifecycle";
import { formatSourceLabel, getAgentOwnerIds } from "../agentLabels";
import { useUserNames } from "../useUserNames";
import { useLinkedModelLabel } from "../useLinkedModelLabel";
import ReviewAgentModal from "../../../components/Modals/AgentDiscovery/ReviewAgentModal";
import { useHasPermission } from "../../../../application/hooks/useMyPermissions";
import ManualAgentModal from "../../../components/Modals/AgentDiscovery/ManualAgentModal";
import { palette } from "../../../themes/palette";
import LifecycleStepper from "./LifecycleStepper";
import ActivityTimeline from "./ActivityTimeline";

const sectionCardStyle = {
  border: `1px solid ${palette.border.dark}`,
  borderRadius: "4px",
  padding: "24px",
  backgroundColor: palette.background.main,
};

const SectionTitle: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <Box mb="16px">
    <Typography sx={{ fontSize: 15, fontWeight: 600, color: palette.text.primary }}>
      {title}
    </Typography>
    {subtitle && (
      <Typography sx={{ fontSize: 12, color: palette.text.secondary }}>{subtitle}</Typography>
    )}
  </Box>
);

const FieldBlock: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <Box sx={{ minWidth: 160 }}>
    <Typography sx={{ fontSize: 12, fontWeight: 600, color: palette.text.secondary, mb: "4px" }}>
      {label}
    </Typography>
    {children}
  </Box>
);

/** True when a failed request was answered with 404 (the agent does not exist). */
function isNotFoundError(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 404;
}

/** Parse a route id; only a positive integer is a valid agent id. */
function parseAgentId(id: string | undefined): number | null {
  if (!id || !/^\d+$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export default function AgentDetail() {
  const navigate = useNavigate();
  const formatUserDate = useFormattedDate();
  const canManage = useHasPermission("agentDiscovery.admin", { fallbackToAdmin: true });
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const agentId = parseAgentId(id);
  const { formatUser, avatarName } = useUserNames();

  const [agent, setAgent] = useState<AgentPrimitiveRow | null>(null);
  const [auditLogs, setAuditLogs] = useState<AgentAuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(agentId !== null);
  const [notFound, setNotFound] = useState(agentId === null);
  // The first load failed for a reason other than "not found" (network, 500,
  // timeout): shown as an error with a retry, not as a missing agent.
  const [loadError, setLoadError] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const linkedModelLabel = useLinkedModelLabel(agent?.linked_model_inventory_id);
  // The in-flight load. A new load (another :id, or a refresh) aborts it, so a
  // slower response for a previous request can never overwrite newer state.
  const loadControllerRef = useRef<AbortController | null>(null);

  /**
   * Load the agent and its audit trail. `background` keeps the page on screen
   * (no skeleton) for a refresh after a review or edit.
   */
  const fetchAll = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      loadControllerRef.current?.abort();
      // A non-numeric or non-positive id can never match an agent.
      if (agentId === null) {
        loadControllerRef.current = null;
        setAgent(null);
        setNotFound(true);
        setLoadError(false);
        setIsLoading(false);
        return;
      }
      const controller = new AbortController();
      loadControllerRef.current = controller;
      const { signal } = controller;
      if (!background) {
        setIsLoading(true);
        setNotFound(false);
        setLoadError(false);
      }

      // Only the agent request decides "not found" (a 404). The audit trail is supporting
      // data: when it fails the page still renders, just without activity. User
      // names come from the shared, cached users query (useUserNames).
      const [agentResult, auditResult] = await Promise.allSettled([
        getEntityById({ routeUrl: `/agent-primitives/${agentId}`, signal }),
        apiServices.get(`/agent-primitives/${agentId}/audit-logs`, { signal }),
      ]);
      if (signal.aborted) return;

      const agentData =
        agentResult.status === "fulfilled"
          ? ((agentResult.value?.data as AgentPrimitiveRow) ?? null)
          : null;
      if (!agentData) {
        const missing = agentResult.status === "fulfilled" || isNotFoundError(agentResult.reason);
        if (!missing) {
          logEngine({ type: "error", message: `Failed to load agent ${agentId}` });
          // A failed refresh after a review or edit keeps the agent on screen.
          if (background) return;
        }
        setAgent(null);
        setNotFound(missing);
        setLoadError(!missing);
        setIsLoading(false);
        return;
      }

      const auditBody =
        auditResult.status === "fulfilled" ? (auditResult.value as any)?.data : null;
      const audit = auditBody?.data ?? auditBody ?? [];

      setAgent(agentData);
      setNotFound(false);
      setLoadError(false);
      setAuditLogs(Array.isArray(audit) ? audit : []);
      setIsLoading(false);
    },
    [agentId],
  );

  useEffect(() => {
    fetchAll();
    return () => loadControllerRef.current?.abort();
  }, [fetchAll]);

  const handleReviewSuccess = () => {
    setIsReviewOpen(false);
    fetchAll({ background: true });
  };

  const handleEditSuccess = () => {
    setIsEditOpen(false);
    fetchAll({ background: true });
  };

  const breadcrumbItems = [
    { label: "AI agents", path: "/agent-discovery" },
    { label: agent?.display_name || "Agent", path: `/agent-discovery/${id ?? ""}` },
  ];

  if (isLoading) {
    return (
      <PageHeaderExtended title="AI agents" breadcrumbItems={breadcrumbItems}>
        <CustomizableSkeleton variant="rectangular" width="100%" height={480} />
      </PageHeaderExtended>
    );
  }

  if (loadError && !agent) {
    return (
      <PageHeaderExtended title="AI agents" breadcrumbItems={breadcrumbItems}>
        <EmptyState icon={Bot} message="Could not load this agent.">
          <CustomizableButton
            text="Try again"
            variant="contained"
            onClick={() => fetchAll()}
            testId="agent-detail-retry"
          />
        </EmptyState>
      </PageHeaderExtended>
    );
  }

  if (notFound || !agent) {
    return (
      <PageHeaderExtended title="AI agents" breadcrumbItems={breadcrumbItems}>
        <EmptyState icon={Bot} message="Agent not found">
          <CustomizableButton
            text="Back to AI agents"
            variant="contained"
            onClick={() => navigate("/agent-discovery")}
          />
        </EmptyState>
      </PageHeaderExtended>
    );
  }

  // Resolve all owners, primary first (falls back to the legacy single owner_id,
  // which for a synced agent is the owner reported by the source, e.g. an email).
  const owners = getAgentOwnerIds(agent).map((oid) => ({
    id: oid,
    name: formatUser(oid),
    ...avatarName(oid),
  }));
  const linkedModelName = agent.linked_model_inventory_id
    ? linkedModelLabel || `Model #${agent.linked_model_inventory_id}`
    : null;
  const lifecycle = getAgentLifecycle(
    agent,
    (iso) => formatUserDate(iso, { includeTime: true }),
    formatUser,
  );

  return (
    <PageHeaderExtended
      title={agent.display_name}
      // One text node, so the source label is translated before it is joined.
      description={`${agent.primitive_type} · ${
        agent.is_manual ? t("Manually entered") : formatSourceLabel(agent.source_system)
      }`}
      breadcrumbItems={breadcrumbItems}
      actionButton={
        <Stack direction="row" gap="8px">
          {/* Edit only for manually added agents (synced agents are read-only),
              and only with the agentDiscovery.admin permission (Admins by
              default), which changing an agent needs. */}
          {canManage && agent.is_manual && (
            <CustomizableButton
              variant="outlined"
              text="Edit"
              icon={<Pencil size={14} strokeWidth={1.5} />}
              onClick={() => setIsEditOpen(true)}
              testId="agent-detail-edit"
            />
          )}
          {/* Review needs the same permission; everyone else opens the same
              drawer read-only, so it is offered as "Details". */}
          {canManage ? (
            <CustomizableButton
              variant="contained"
              text="Review"
              icon={<ClipboardCheck size={14} strokeWidth={1.5} />}
              onClick={() => setIsReviewOpen(true)}
              testId="agent-detail-review"
            />
          ) : (
            <CustomizableButton
              variant="outlined"
              text="Details"
              icon={<Eye size={14} strokeWidth={1.5} />}
              onClick={() => setIsReviewOpen(true)}
              testId="agent-detail-details"
            />
          )}
        </Stack>
      }
    >
      <Stack spacing="16px">
        {/* ── Lifecycle ─────────────────────────────────────────── */}
        <Box sx={sectionCardStyle}>
          <SectionTitle
            title="Lifecycle"
            subtitle="Each stage shows who is in charge and when it happened"
          />
          <Box sx={{ px: "8px", py: "8px" }}>
            <LifecycleStepper steps={lifecycle} />
          </Box>
          {(!agent.is_manual || agent.is_stale) && (
            <>
              <Divider sx={{ my: "16px" }} />
              <Stack direction="row" flexWrap="wrap" gap="24px">
                {!agent.is_manual && (
                  <FieldBlock label="Last activity">
                    <Typography sx={{ fontSize: 13, color: palette.text.primary }}>
                      {formatUserDate(agent.last_activity, { includeTime: true })}
                    </Typography>
                  </FieldBlock>
                )}
                {agent.is_stale && (
                  <FieldBlock label="Status">
                    <VWChip label="Inactive 30+ days" variant="warning" size="small" />
                  </FieldBlock>
                )}
              </Stack>
            </>
          )}
        </Box>

        {/* ── Ownership & capabilities ──────────────────────────── */}
        <Box sx={sectionCardStyle}>
          <SectionTitle
            title="Ownership & capabilities"
            subtitle="Who is accountable, and what this agent can access"
          />

          {/* Owners — the accountability anchor, given prominence. The first is
              the primary owner; any others are additional accountable owners. */}
          <Box
            sx={{
              p: "16px",
              mb: "20px",
              borderRadius: "4px",
              backgroundColor: palette.background.alt,
              border: `1px solid ${palette.border.light}`,
            }}
          >
            <Typography
              sx={{ fontSize: 12, fontWeight: 600, color: palette.text.secondary, mb: "12px" }}
            >
              {owners.length > 1 ? "Accountable owners" : "Accountable owner"}
            </Typography>
            {owners.length > 0 ? (
              <Stack direction="row" flexWrap="wrap" gap="20px">
                {owners.map((o, idx) => (
                  <Stack key={o.id} direction="row" alignItems="center" spacing={1}>
                    <VWAvatar
                      user={{ firstname: o.firstname, lastname: o.lastname }}
                      size="small"
                    />
                    <Box>
                      <Typography
                        sx={{ fontSize: 14, fontWeight: 600, color: palette.text.primary }}
                      >
                        {o.name}
                      </Typography>
                      {idx === 0 && owners.length > 1 && (
                        <Typography sx={{ fontSize: 11, color: palette.text.secondary }}>
                          Primary
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Typography sx={{ fontSize: 13, color: palette.text.secondary, fontStyle: "italic" }}>
                No owner assigned
              </Typography>
            )}
          </Box>

          <Stack direction="row" flexWrap="wrap" gap="24px" mb="20px">
            <FieldBlock label="Type">
              <Typography sx={{ fontSize: 13, color: palette.text.primary }}>
                {agent.primitive_type}
              </Typography>
            </FieldBlock>
            <FieldBlock label="Source">
              <Typography sx={{ fontSize: 13, color: palette.text.primary }}>
                {agent.is_manual ? "Manually entered" : formatSourceLabel(agent.source_system)}
              </Typography>
            </FieldBlock>
            <FieldBlock label="Linked model">
              <Typography
                sx={{
                  fontSize: 13,
                  color: linkedModelName ? palette.text.primary : palette.text.secondary,
                }}
              >
                {linkedModelName || "Not linked"}
              </Typography>
            </FieldBlock>
          </Stack>

          {/* Capability categories — hidden/empty for manual agents */}
          <FieldBlock label="Access categories">
            <Stack direction="row" flexWrap="wrap" gap="4px" mt="4px">
              {(agent.permission_categories || []).length > 0 ? (
                agent.permission_categories.map((cat) => (
                  <VWChip key={cat} label={cat} variant="info" size="small" />
                ))
              ) : (
                <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                  None recorded
                </Typography>
              )}
            </Stack>
          </FieldBlock>

          {(agent.permissions || []).length > 0 && (
            <Box mt="20px">
              <FieldBlock label="Permissions">
                <Stack direction="row" flexWrap="wrap" gap="4px" mt="4px">
                  {agent.permissions.map((perm: any, idx: number) => (
                    <VWChip
                      key={idx}
                      label={typeof perm === "string" ? perm : JSON.stringify(perm)}
                      size="small"
                    />
                  ))}
                </Stack>
              </FieldBlock>
            </Box>
          )}
        </Box>

        {/* ── Activity / process ────────────────────────────────── */}
        <Box sx={sectionCardStyle}>
          <SectionTitle title="Activity" subtitle="Governance actions taken on this agent" />
          <ActivityTimeline entries={auditLogs} formatUser={formatUser} />
        </Box>
      </Stack>

      <ReviewAgentModal
        isOpen={isReviewOpen}
        setIsOpen={setIsReviewOpen}
        agent={agent}
        onSuccess={handleReviewSuccess}
        onEdit={() => setIsEditOpen(true)}
      />
      <ManualAgentModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        onSuccess={handleEditSuccess}
        agent={agent}
      />
    </PageHeaderExtended>
  );
}
