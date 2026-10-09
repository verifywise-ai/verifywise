import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Box, Stack, Typography, Divider } from "@mui/material";
import { Bot } from "lucide-react";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { EmptyState } from "../../../components/EmptyState";
import CustomizableSkeleton from "../../../components/Skeletons";
import VWChip from "../../../components/Chip";
import VWAvatar from "../../../components/Avatar/VWAvatar";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import {
  getAllEntities,
  getEntityById,
} from "../../../../application/repository/entity.repository";
import { logEngine } from "../../../../application/tools/log.engine";
import {
  AgentPrimitiveRow,
  AgentAuditLogEntry,
} from "../../../../domain/interfaces/i.agentDiscovery";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import { getAgentLifecycle } from "../agentLifecycle";
import { formatModelLabel, formatSourceLabel } from "../agentLabels";
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

/** Parse a route id; only a positive integer is a valid agent id. */
function parseAgentId(id: string | undefined): number | null {
  if (!id || !/^\d+$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export default function AgentDetail() {
  const navigate = useNavigate();
  const formatUserDate = useFormattedDate();
  const { id } = useParams<{ id: string }>();
  const agentId = parseAgentId(id);

  const [agent, setAgent] = useState<AgentPrimitiveRow | null>(null);
  const [auditLogs, setAuditLogs] = useState<AgentAuditLogEntry[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [linkedModelLabel, setLinkedModelLabel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(agentId !== null);
  const [notFound, setNotFound] = useState(agentId === null);

  const fetchAll = useCallback(async () => {
    // A non-numeric or non-positive id can never match an agent.
    if (agentId === null) {
      setAgent(null);
      setNotFound(true);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setNotFound(false);

    // Only the agent request decides "not found". Users and the audit trail are
    // supporting data: when they fail the page still renders, just without names
    // or activity.
    const [agentResult, usersResult, auditResult] = await Promise.allSettled([
      getAllEntities({ routeUrl: `/agent-primitives/${agentId}` }),
      getAllEntities({ routeUrl: "/users" }),
      apiServices.get(`/agent-primitives/${agentId}/audit-logs`),
    ]);

    const agentData =
      agentResult.status === "fulfilled"
        ? ((agentResult.value?.data as AgentPrimitiveRow) ?? null)
        : null;
    if (!agentData) {
      if (agentResult.status === "rejected") {
        logEngine({ type: "error", message: `Failed to load agent ${agentId}` });
      }
      setAgent(null);
      setNotFound(true);
      setIsLoading(false);
      return;
    }

    const usersData =
      usersResult.status === "fulfilled" && Array.isArray(usersResult.value?.data)
        ? usersResult.value.data
        : [];
    const uMap: Record<string, string> = {};
    usersData.forEach((u: { id: number; name: string; surname: string }) => {
      uMap[String(u.id)] = `${u.name} ${u.surname}`.trim();
    });

    const auditBody = auditResult.status === "fulfilled" ? (auditResult.value as any)?.data : null;
    const audit = auditBody?.data ?? auditBody ?? [];

    // Fetch only the linked model, not the whole inventory.
    let modelLabel: string | null = null;
    if (agentData.linked_model_inventory_id) {
      try {
        const modelRes = await getEntityById({
          routeUrl: `/modelInventory/${agentData.linked_model_inventory_id}`,
        });
        if (modelRes?.data) modelLabel = formatModelLabel(modelRes.data);
      } catch {
        modelLabel = null;
      }
    }

    setAgent(agentData);
    setUsersMap(uMap);
    setAuditLogs(Array.isArray(audit) ? audit : []);
    setLinkedModelLabel(modelLabel);
    setIsLoading(false);
  }, [agentId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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

  // Resolve all owners (fall back to the legacy single owner_id).
  const ownerIdList =
    agent.owner_ids && agent.owner_ids.length > 0
      ? agent.owner_ids.map(String)
      : agent.owner_id
        ? [agent.owner_id]
        : [];
  const owners = ownerIdList.map((oid) => {
    const name = usersMap[oid] || oid;
    const [firstname, ...rest] = name.split(" ");
    return { id: oid, name, firstname: firstname || "", lastname: rest.join(" ") };
  });
  const linkedModelName = agent.linked_model_inventory_id
    ? linkedModelLabel || `Model #${agent.linked_model_inventory_id}`
    : null;
  const lifecycle = getAgentLifecycle(
    agent,
    (iso) => formatUserDate(iso, { includeTime: true }),
    usersMap,
  );

  return (
    <PageHeaderExtended
      title={agent.display_name}
      description={`${agent.primitive_type} · ${
        agent.is_manual ? "Manually entered" : formatSourceLabel(agent.source_system)
      }`}
      breadcrumbItems={breadcrumbItems}
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
          <ActivityTimeline entries={auditLogs} usersMap={usersMap} />
        </Box>
      </Stack>
    </PageHeaderExtended>
  );
}
