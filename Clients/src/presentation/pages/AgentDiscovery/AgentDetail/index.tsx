import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Stack, Typography, Divider } from "@mui/material";
import { Bot } from "lucide-react";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { EmptyState } from "../../../components/EmptyState";
import CustomizableSkeleton from "../../../components/Skeletons";
import VWChip from "../../../components/Chip";
import VWAvatar from "../../../components/Avatar/VWAvatar";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import {
  AgentPrimitiveRow,
  AgentAuditLogEntry,
} from "../../../../domain/interfaces/i.agentDiscovery";
import { displayFormattedDateTime } from "../../../tools/isoDateToString";
import { getAgentLifecycle } from "../agentLifecycle";
import { palette } from "../../../themes/palette";
import LifecycleStepper from "./LifecycleStepper";
import ActivityTimeline from "./ActivityTimeline";

const sectionCardStyle = {
  border: `1px solid ${palette.border.dark}`,
  borderRadius: "4px",
  padding: "24px",
  backgroundColor: palette.background.main,
};

// Friendly source labels, shared with the table/drawer.
const SOURCE_LABELS: Record<string, string> = { "azure-ai-foundry": "Azure AI Foundry" };
function formatSourceLabel(sourceSystem: string): string {
  if (SOURCE_LABELS[sourceSystem]) return SOURCE_LABELS[sourceSystem];
  return sourceSystem
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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

export default function AgentDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const agentId = id ? parseInt(id, 10) : null;

  const [agent, setAgent] = useState<AgentPrimitiveRow | null>(null);
  const [auditLogs, setAuditLogs] = useState<AgentAuditLogEntry[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [modelsMap, setModelsMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!agentId) return;
    setIsLoading(true);
    try {
      const [agentRes, usersRes, modelsRes, auditRes] = await Promise.all([
        getAllEntities({ routeUrl: `/agent-primitives/${agentId}` }),
        getAllEntities({ routeUrl: "/users" }),
        getAllEntities({ routeUrl: "/modelInventory" }),
        apiServices.get(`/agent-primitives/${agentId}/audit-logs`),
      ]);

      const agentData = (agentRes?.data as AgentPrimitiveRow) || null;
      if (!agentData) {
        setNotFound(true);
        return;
      }
      setAgent(agentData);

      const uMap: Record<string, string> = {};
      (Array.isArray(usersRes?.data) ? usersRes.data : []).forEach(
        (u: { id: number; name: string; surname: string }) => {
          uMap[String(u.id)] = `${u.name} ${u.surname}`.trim();
        },
      );
      setUsersMap(uMap);

      const mMap: Record<string, string> = {};
      (Array.isArray(modelsRes?.data) ? modelsRes.data : []).forEach((m: any) => {
        const name = m.model || m.provider_model || m.model_name || m.name;
        mMap[String(m.id)] = name
          ? m.provider
            ? `${m.provider} · ${name}`
            : name
          : `Model #${m.id}`;
      });
      setModelsMap(mMap);

      const audit = (auditRes as any)?.data?.data || (auditRes as any)?.data || [];
      setAuditLogs(Array.isArray(audit) ? audit : []);
    } catch (error) {
      console.error("Failed to load agent detail:", error);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const breadcrumbItems = [
    { label: "AI Agents", path: "/agent-discovery" },
    { label: agent?.display_name || "Agent", path: `/agent-discovery/${agentId}` },
  ];

  if (isLoading) {
    return (
      <PageHeaderExtended title="AI Agents" breadcrumbItems={breadcrumbItems}>
        <CustomizableSkeleton variant="rectangular" width="100%" height={480} />
      </PageHeaderExtended>
    );
  }

  if (notFound || !agent) {
    return (
      <PageHeaderExtended title="AI Agents" breadcrumbItems={breadcrumbItems}>
        <EmptyState icon={Bot} message="Agent not found">
          <CustomizableButton
            text="Back to AI Agents"
            variant="contained"
            onClick={() => navigate("/agent-discovery")}
          />
        </EmptyState>
      </PageHeaderExtended>
    );
  }

  const ownerName = agent.owner_id ? usersMap[agent.owner_id] || agent.owner_id : null;
  const [ownerFirst, ...ownerRest] = (ownerName || "").split(" ");
  const linkedModelName = agent.linked_model_inventory_id
    ? modelsMap[String(agent.linked_model_inventory_id)] ||
      `Model #${agent.linked_model_inventory_id}`
    : null;
  const lifecycle = getAgentLifecycle(agent, usersMap);

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
                      {agent.last_activity ? displayFormattedDateTime(agent.last_activity) : "—"}
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

          {/* Owner — the accountability anchor, given prominence */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              p: "16px",
              mb: "20px",
              borderRadius: "4px",
              backgroundColor: palette.background.alt,
              border: `1px solid ${palette.border.light}`,
            }}
          >
            <VWAvatar
              user={{ firstname: ownerFirst || "", lastname: ownerRest.join(" ") }}
              size="small"
            />
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: palette.text.secondary }}>
                Accountable owner
              </Typography>
              {ownerName ? (
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: palette.text.primary }}>
                  {ownerName}
                </Typography>
              ) : (
                <Typography
                  sx={{ fontSize: 13, color: palette.text.secondary, fontStyle: "italic" }}
                >
                  No owner assigned
                </Typography>
              )}
            </Box>
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
