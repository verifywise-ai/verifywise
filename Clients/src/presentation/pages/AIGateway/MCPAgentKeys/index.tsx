import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Typography, Stack, IconButton } from "@mui/material";
import { CirclePlus, KeyRound, Trash2, Ban, Copy, Check, Shield, Wrench } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Field from "../../../components/Inputs/Field";
import DatePicker from "../../../components/Inputs/Datepicker";
import Chip from "../../../components/Chip";
import StandardModal from "../../../components/Modals/StandardModal";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import palette from "../../../themes/palette";
import {
  CODE_BLOCK_BG,
  CODE_BLOCK_TEXT,
  WARNING_BG,
  WARNING_BORDER,
  WARNING_TEXT,
  KEY_DISPLAY_BG,
} from "../shared";
import MCPTable from "../MCPTable";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import dayjs from "dayjs";

interface CreateAgentKeyPayload {
  name: string;
  description?: string;
  allowed_tools?: string[];
  blocked_tools?: string[];
  rate_limit_rpm?: number;
  expires_at?: string;
}

interface AgentKey {
  id: number;
  key_prefix: string;
  name: string;
  description: string | null;
  allowed_tools: string[];
  blocked_tools: string[];
  rate_limit_rpm: number | null;
  expires_at: string | null;
  is_active: boolean;
  revoked_at: string | null;
  created_by_name: string;
  created_at: string;
}

export default function MCPAgentKeysPage() {
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    allowed_tools: "",
    blocked_tools: "",
    rate_limit_rpm: "",
    expires_at: "",
  });
  const [createError, setCreateError] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Key display modal (shown once after creation)
  const [isKeyDisplayOpen, setIsKeyDisplayOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [copied, setCopied] = useState(false);

  // Revoke confirmation modal
  const [revokeTarget, setRevokeTarget] = useState<AgentKey | null>(null);

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const loadData = useCallback(async () => {
    try {
      const res = await apiServices.get<Record<string, any>>("/ai-gateway/mcp/agent-keys");
      setKeys(res?.data?.data || []);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      setCreateError("Name is required");
      return;
    }
    setCreateSubmitting(true);
    setCreateError("");
    try {
      const payload: CreateAgentKeyPayload = { name: createForm.name.trim() };
      if (createForm.description.trim()) payload.description = createForm.description.trim();
      if (createForm.rate_limit_rpm) payload.rate_limit_rpm = Number(createForm.rate_limit_rpm);
      if (createForm.expires_at) payload.expires_at = new Date(createForm.expires_at).toISOString();

      const parseList = (v: string) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      if (createForm.allowed_tools.trim())
        payload.allowed_tools = parseList(createForm.allowed_tools);
      if (createForm.blocked_tools.trim())
        payload.blocked_tools = parseList(createForm.blocked_tools);

      const res = await apiServices.post<Record<string, any>>(
        "/ai-gateway/mcp/agent-keys",
        payload,
      );
      const created = res?.data?.data;
      setIsCreateOpen(false);
      setCreateForm({
        name: "",
        description: "",
        allowed_tools: "",
        blocked_tools: "",
        rate_limit_rpm: "",
        expires_at: "",
      });

      if (created?.plain_key) {
        setNewKey(created.plain_key);
        setIsKeyDisplayOpen(true);
      }

      await loadData();
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { detail?: string; message?: string } } })
        ?.response?.data;
      setCreateError(errData?.detail || errData?.message || "Failed to create agent key");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await apiServices.post(`/ai-gateway/mcp/agent-keys/${revokeTarget.id}/revoke`);
      setRevokeTarget(null);
      await loadData();
    } catch {
      // Silently handle
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiServices.delete(`/ai-gateway/mcp/agent-keys/${id}`);
      await loadData();
    } catch {
      // Silently handle
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const getStatusLabel = (key: AgentKey): string => {
    if (key.revoked_at) return "Revoked";
    if (key.expires_at && new Date(key.expires_at) < new Date()) return "Expired";
    if (key.is_active) return "Active";
    return "Inactive";
  };

  const createKeyButton = (
    <CustomizableButton
      text="Create agent key"
      icon={<CirclePlus size={14} strokeWidth={1.5} />}
      onClick={() => {
        setCreateForm({
          name: "",
          description: "",
          allowed_tools: "",
          blocked_tools: "",
          rate_limit_rpm: "",
          expires_at: "",
        });
        setCreateError("");
        setIsCreateOpen(true);
      }}
    />
  );

  const content = (
    <>
      {!loading && keys.length === 0 && (
        <EmptyState
          icon={KeyRound}
          message="Issue scoped API keys for AI agents to authenticate with MCP servers through the gateway."
          showBorder
        >
          <EmptyStateTip
            icon={Shield}
            title="Tool-level access control"
            description="Each agent key can restrict which MCP tools the agent is allowed or blocked from calling. Combine with rate limits for fine-grained governance."
          />
          <EmptyStateTip
            icon={Wrench}
            title="Per-key rate limits and expiry"
            description="Set requests-per-minute limits and expiration dates on each key. When an agent key is revoked, all requests using it are rejected immediately."
          />
        </EmptyState>
      )}

      {!loading && keys.length > 0 && (
        <Box sx={{ px: 3, pb: 3 }}>
          <MCPTable
            id="mcp-agent-keys-table"
            columns={[
              { label: "Name", width: 200 },
              { label: "Status", width: 110 },
              { label: "Prefix", width: 140 },
              { label: "Rate limit", width: 100 },
              { label: "Tools", width: 160 },
              { label: "Created", width: 200 },
              { label: "", width: 60, align: "right" },
            ]}
            rows={keys}
            rowKey={(key) => key.id}
            renderRow={(key) => {
              const status = getStatusLabel(key);
              return [
                <Box>
                  <Stack direction="row" alignItems="center" gap="8px">
                    <KeyRound size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{key.name}</Typography>
                  </Stack>
                  {key.description && (
                    <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mt: "2px" }}>
                      {key.description}
                    </Typography>
                  )}
                </Box>,
                <Chip label={status} size="small" uppercase={false} />,
                <Typography
                  sx={{ fontSize: 12, color: palette.text.tertiary, fontFamily: "monospace" }}
                >
                  {key.key_prefix}
                </Typography>,
                <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                  {key.rate_limit_rpm ? `${key.rate_limit_rpm} RPM` : "—"}
                </Typography>,
                <Stack direction="row" gap="6px" flexWrap="wrap">
                  {key.allowed_tools?.length > 0 && (
                    <Chip
                      label={`${key.allowed_tools.length} allowed`}
                      size="small"
                      uppercase={false}
                    />
                  )}
                  {key.blocked_tools?.length > 0 && (
                    <Chip
                      label={`${key.blocked_tools.length} blocked`}
                      size="small"
                      uppercase={false}
                    />
                  )}
                  {!key.allowed_tools?.length && !key.blocked_tools?.length && (
                    <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>All</Typography>
                  )}
                </Stack>,
                <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                  by {key.created_by_name} &middot; {displayFormattedDate(key.created_at)}
                </Typography>,
                <Stack direction="row" alignItems="center" justifyContent="flex-end" gap="4px">
                  {key.is_active && !key.revoked_at && (
                    <IconButton
                      size="small"
                      onClick={() => setRevokeTarget(key)}
                      sx={{ p: 0.5 }}
                      aria-label="Revoke key"
                    >
                      <Ban size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                    </IconButton>
                  )}
                  {!key.is_active && (
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(key.id)}
                      sx={{ p: 0.5 }}
                      aria-label="Delete key"
                    >
                      <Trash2 size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                    </IconButton>
                  )}
                </Stack>,
              ];
            }}
          />
        </Box>
      )}

      {/* Create Agent Key Modal */}
      <StandardModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create agent key"
        description="Generate an API key for AI agents to authenticate with MCP servers through the gateway."
        onSubmit={handleCreate}
        submitButtonText="Create key"
        isSubmitting={createSubmitting}
        maxWidth="480px"
      >
        <Stack gap="16px">
          <Field
            label="Name"
            placeholder="e.g., Production agent key"
            value={createForm.name}
            onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
            isRequired
          />
          <Field
            label="Description"
            placeholder="e.g., Used by the backend orchestration agent"
            value={createForm.description}
            onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
          />
          <Field
            label="Allowed tools"
            placeholder="e.g., search, get_weather, run_query"
            value={createForm.allowed_tools}
            onChange={(e) => setCreateForm((p) => ({ ...p, allowed_tools: e.target.value }))}
            helperText="Allowlist for MCP server tools called through the proxy: if set, this key may call only these tools. Comma-separated; leave empty to allow all. (Does not apply to native tools like Bash/Edit/Write — govern those with guardrails.)"
          />
          <Field
            label="Blocked tools"
            placeholder="e.g., delete_record, drop_table"
            value={createForm.blocked_tools}
            onChange={(e) => setCreateForm((p) => ({ ...p, blocked_tools: e.target.value }))}
            helperText="Denylist for MCP server tools called through the proxy: these are always denied, even if also in the allowlist. Comma-separated; leave empty to block none."
          />
          <Field
            label="Rate limit (requests per minute)"
            placeholder="e.g., 60 (leave empty for no limit)"
            value={createForm.rate_limit_rpm}
            onChange={(e) => setCreateForm((p) => ({ ...p, rate_limit_rpm: e.target.value }))}
          />
          <DatePicker
            label="Expiry date"
            date={createForm.expires_at ? dayjs(createForm.expires_at) : null}
            handleDateChange={(value) =>
              setCreateForm((p) => ({ ...p, expires_at: value ? value.format("YYYY-MM-DD") : "" }))
            }
          />
          {createError && (
            <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>
              {createError}
            </Typography>
          )}
        </Stack>
      </StandardModal>

      {/* Key Display Modal (shown once after creation) */}
      <StandardModal
        isOpen={isKeyDisplayOpen}
        onClose={() => {
          setIsKeyDisplayOpen(false);
          setNewKey("");
          setCopied(false);
        }}
        title="Agent key created"
        description="Copy the key below. It will not be shown again."
        maxWidth="560px"
        hideSubmitButton
        cancelButtonText="I copied, continue"
      >
        <Stack gap="16px">
          <Box
            sx={{
              p: "12px 16px",
              backgroundColor: KEY_DISPLAY_BG,
              border: `1px solid ${palette.border.dark}`,
              borderRadius: "4px",
              fontFamily: "monospace",
              fontSize: 13,
              wordBreak: "break-all",
              position: "relative",
            }}
          >
            {newKey}
            <IconButton
              size="small"
              onClick={copyToClipboard}
              sx={{ position: "absolute", top: 8, right: 8, p: 0.5 }}
              aria-label="Copy key"
            >
              {copied ? (
                <Check size={14} strokeWidth={1.5} color={palette.status.success.text} />
              ) : (
                <Copy size={14} strokeWidth={1.5} color={palette.text.tertiary} />
              )}
            </IconButton>
          </Box>

          <Box
            sx={{
              p: "12px 16px",
              backgroundColor: WARNING_BG,
              border: `1px solid ${WARNING_BORDER}`,
              borderRadius: "4px",
            }}
          >
            <Typography sx={{ fontSize: 12, color: WARNING_TEXT, fontWeight: 500 }}>
              This key will not be shown again. Store it securely.
            </Typography>
          </Box>

          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 500, mb: 1 }}>Usage example</Typography>
            <Box
              sx={{
                p: "12px 16px",
                backgroundColor: CODE_BLOCK_BG,
                borderRadius: "4px",
                fontFamily: "monospace",
                fontSize: 12,
                color: CODE_BLOCK_TEXT,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                overflow: "auto",
              }}
            >
              {`# Authenticate an MCP agent with the gateway
curl -H "Authorization: Bearer ${newKey}" \\
  https://your-verifywise-host/api/ai-gateway/mcp/servers`}
            </Box>
          </Box>

          <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
            Use agent keys from backend services only. Each key is scoped to specific tools and rate
            limits.
          </Typography>
        </Stack>
      </StandardModal>

      {/* Revoke Confirmation Modal */}
      <StandardModal
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="Revoke agent key"
        description={`Are you sure you want to revoke "${revokeTarget?.name}"? All requests using this key will be rejected immediately.`}
        onSubmit={handleRevoke}
        submitButtonText="Revoke key"
        maxWidth="440px"
      />
    </>
  );

  return (
    <PageHeaderExtended
      title="Agent keys"
      description="Issue scoped API keys for AI agents to authenticate with MCP servers."
      tipBoxEntity="mcp-agent-keys"
      helpArticlePath="ai-gateway/mcp-agent-keys"
      actionButton={createKeyButton}
    >
      {content}
    </PageHeaderExtended>
  );
}
