import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Typography, Stack, IconButton } from "@mui/material";
import {
  CirclePlus,
  KeyRound,
  Trash2,
  Ban,
  Copy,
  Check,
  Shield,
  Wrench,
  AlertTriangle,
  RotateCcw,
  Activity,
  SlidersHorizontal,
} from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import DatePicker from "../../../components/Inputs/Datepicker";
import Chip from "../../../components/Chip";
import Toggle from "../../../components/Inputs/Toggle";
import StandardModal from "../../../components/Modals/StandardModal";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { getGatewayErrorText } from "../../../../application/utils/apiErrorReason";
import palette from "../../../themes/palette";
import {
  CODE_BLOCK_BG,
  CODE_BLOCK_TEXT,
  WARNING_BG,
  WARNING_BORDER,
  WARNING_TEXT,
  KEY_DISPLAY_BG,
  ENFORCEMENT_MODE_ITEMS,
  MCP_STATUS_COLORS,
  MONITOR_MODE_HELPER,
  type EnforcementMode,
} from "../shared";
import MCPTable from "../MCPTable";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import AgentActivityDrawer from "../AgentActivityDrawer";
import CustomizableSkeleton from "../../../components/Skeletons";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
import dayjs from "dayjs";

interface CreateAgentKeyPayload {
  name: string;
  description?: string;
  allowed_tools?: string[];
  blocked_tools?: string[];
  rate_limit_rpm?: number;
  expires_at?: string;
  enforcement_mode?: EnforcementMode;
  apply_tool_lists_to_hook?: boolean;
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
  /** Missing on gateways older than monitor mode; treated as "enforce". */
  enforcement_mode?: EnforcementMode;
  enforcement_mode_changed_at?: string | null;
  enforcement_mode_changed_by?: number | null;
  /** Name of the user who last changed the mode; null when unknown or since deleted. */
  enforcement_mode_changed_by_name?: string | null;
  /** Missing on older gateways; treated as off (tool lists apply to the MCP proxy only). */
  apply_tool_lists_to_hook?: boolean;
}

const EMPTY_CREATE_FORM = {
  name: "",
  description: "",
  allowed_tools: "",
  blocked_tools: "",
  rate_limit_rpm: "",
  expires_at: "",
  enforcement_mode: "enforce" as EnforcementMode,
  apply_tool_lists_to_hook: false,
};

const MONITOR_CONFIRM_BODY =
  'Guardrails and approval rules are still checked, and so are the key\'s tool lists for calls through the MCP proxy, and for native tool calls when the key\'s "Also apply tool lists to native tool calls" setting is on. Every match is logged in Activity as "Would block" or "Would need approval". No approval requests are created. Rate limits still apply.';

const keyMode = (key: AgentKey): EnforcementMode => key.enforcement_mode ?? "enforce";
const appliesToNative = (key: AgentKey): boolean => key.apply_tool_lists_to_hook === true;

const NATIVE_TOOL_LISTS_LABEL = "Also apply tool lists to native tool calls (hooks and SDK)";
const NATIVE_TOOL_LISTS_HELPER =
  "Off: the allowed and blocked tool lists apply only to MCP server tools called through the proxy. On: they also apply to the agent's own tool calls checked by the hook script or the Python SDK, such as Bash, Edit or your Python functions. Leave it off for keys used by Claude Code or Cursor unless the lists name those tools.";

/** Opt-in for checking the key's tool lists on native tool calls, shared by both modals. */
function NativeToolListsToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Box>
      <Stack direction="row" alignItems="center" gap="8px">
        <Toggle
          checked={checked}
          onChange={(_e, value) => onChange(value)}
          ariaLabel={NATIVE_TOOL_LISTS_LABEL}
          data-testid="toggle-apply-tool-lists-to-hook"
        />
        <Typography sx={{ fontSize: 13 }}>{NATIVE_TOOL_LISTS_LABEL}</Typography>
      </Stack>
      <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mt: "6px" }}>
        {NATIVE_TOOL_LISTS_HELPER}
      </Typography>
    </Box>
  );
}

/** Mode select with its explanation, shared by the create and change-mode modals. */
function EnforcementModeSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: EnforcementMode;
  onChange: (mode: EnforcementMode) => void;
}) {
  return (
    <Box>
      <Select
        id={id}
        dataTestId={`select-${id}`}
        label="Mode"
        items={ENFORCEMENT_MODE_ITEMS}
        value={value}
        onChange={(e) => onChange(e.target.value as EnforcementMode)}
      />
      <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mt: "6px" }}>
        {MONITOR_MODE_HELPER}
      </Typography>
    </Box>
  );
}

export default function MCPAgentKeysPage() {
  const formatDate = useFormattedDate();
  const { t: tr } = useTranslation();
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activityKey, setActivityKey] = useState<{ id: number; name: string } | null>(null);
  // Kept separately so the drawer keeps its agent's name while it slides out.
  const [activityOpen, setActivityOpen] = useState(false);

  // Create modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [createError, setCreateError] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Key display modal (shown once after creation)
  const [isKeyDisplayOpen, setIsKeyDisplayOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [copied, setCopied] = useState(false);

  // Revoke confirmation modal
  const [revokeTarget, setRevokeTarget] = useState<AgentKey | null>(null);

  // Change-mode modal for an existing key
  const [modeTarget, setModeTarget] = useState<AgentKey | null>(null);
  const [modeValue, setModeValue] = useState<EnforcementMode>("enforce");
  const [nativeListsValue, setNativeListsValue] = useState(false);
  const [modeError, setModeError] = useState("");
  const [modeSubmitting, setModeSubmitting] = useState(false);

  // Confirmation shown before a key is created in, or switched to, monitor only
  const [monitorConfirm, setMonitorConfirm] = useState<"create" | "change" | null>(null);

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set synchronously on the first submit so a second click in the same tick
  // (before the isSubmitting state re-renders) cannot send a second request.
  const submittingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiServices.get<Record<string, any>>("/ai-gateway/mcp/agent-keys");
      setKeys(res?.data?.data || []);
    } catch {
      setLoadError("Failed to load agent keys. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = () => {
    if (!createForm.name.trim()) {
      setCreateError("Name is required");
      return;
    }
    if (createForm.enforcement_mode === "monitor") {
      setMonitorConfirm("create");
      return;
    }
    void submitCreate();
  };

  const submitCreate = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setCreateSubmitting(true);
    setCreateError("");
    try {
      const payload: CreateAgentKeyPayload = {
        name: createForm.name.trim(),
        enforcement_mode: createForm.enforcement_mode,
      };
      // Sent only when on, so older gateways without the setting accept the request.
      if (createForm.apply_tool_lists_to_hook) payload.apply_tool_lists_to_hook = true;
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
      setCreateForm(EMPTY_CREATE_FORM);

      if (created?.plain_key) {
        setNewKey(created.plain_key);
        setIsKeyDisplayOpen(true);
      }

      await loadData();
    } catch (err: unknown) {
      setCreateError(getGatewayErrorText(err, "Failed to create agent key"));
    } finally {
      submittingRef.current = false;
      setCreateSubmitting(false);
      setMonitorConfirm(null);
    }
  };

  const openModeModal = (key: AgentKey) => {
    setModeTarget(key);
    setModeValue(keyMode(key));
    setNativeListsValue(appliesToNative(key));
    setModeError("");
  };

  /** Only the settings that differ from the key's current values. */
  const settingsChanges = (key: AgentKey) => {
    const changes: { enforcement_mode?: EnforcementMode; apply_tool_lists_to_hook?: boolean } = {};
    if (modeValue !== keyMode(key)) changes.enforcement_mode = modeValue;
    if (nativeListsValue !== appliesToNative(key))
      changes.apply_tool_lists_to_hook = nativeListsValue;
    return changes;
  };

  const handleModeSave = () => {
    if (!modeTarget) return;
    const changes = settingsChanges(modeTarget);
    if (Object.keys(changes).length === 0) {
      setModeTarget(null);
      return;
    }
    if (changes.enforcement_mode === "monitor") {
      setMonitorConfirm("change");
      return;
    }
    void submitModeChange();
  };

  const submitModeChange = async () => {
    if (!modeTarget || submittingRef.current) return;
    submittingRef.current = true;
    setModeSubmitting(true);
    setModeError("");
    try {
      await apiServices.patch(
        `/ai-gateway/mcp/agent-keys/${modeTarget.id}`,
        settingsChanges(modeTarget),
      );
      setModeTarget(null);
      await loadData();
    } catch (err: unknown) {
      setModeError(getGatewayErrorText(err, "Failed to save the key settings"));
    } finally {
      submittingRef.current = false;
      setModeSubmitting(false);
      setMonitorConfirm(null);
    }
  };

  /** "Monitor only since <date> · by <user>", or the date alone when the user is unknown. */
  const monitorSinceText = (key: AgentKey): string | null => {
    if (!key.enforcement_mode_changed_at) return null;
    const date = formatDate(key.enforcement_mode_changed_at);
    const userName = key.enforcement_mode_changed_by_name?.trim() ?? "";
    return userName
      ? fill(tr("Monitor only since {date} · by {name}"), { date, name: userName })
      : fill(tr("Monitor only since {date}"), { date });
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
        setCreateForm(EMPTY_CREATE_FORM);
        setCreateError("");
        setIsCreateOpen(true);
      }}
    />
  );

  const content = (
    <>
      {loading ? (
        <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
      ) : loadError ? (
        <EmptyState icon={AlertTriangle} message={loadError}>
          <CustomizableButton
            variant="outlined"
            text="Retry"
            icon={<RotateCcw size={16} />}
            onClick={loadData}
          />
        </EmptyState>
      ) : (
        keys.length === 0 && (
          <EmptyState
            icon={KeyRound}
            message="Issue scoped API keys for AI agents to authenticate with MCP servers through the gateway."
            showBorder
          >
            <EmptyStateTip
              icon={Shield}
              title="Tool-level access control"
              description="Each agent key can list the MCP server tools it may or may not call through the proxy, and can apply the same lists to native tool calls from the hook script or the Python SDK. Combine with rate limits for fine-grained governance."
            />
            <EmptyStateTip
              icon={Wrench}
              title="Per-key rate limits and expiry"
              description="Set requests-per-minute limits and expiration dates on each key. When an agent key is revoked, all requests using it are rejected immediately."
            />
          </EmptyState>
        )
      )}

      {keys.length > 0 && (
        <Box sx={{ px: 3, pb: 3 }}>
          <MCPTable
            id="mcp-agent-keys-table"
            columns={[
              { label: "Name", width: 200 },
              { label: "Status", width: 160 },
              { label: "Prefix", width: 140 },
              { label: "Rate limit", width: 100 },
              { label: "Tools", width: 160 },
              { label: "Created", width: 200 },
              { label: "", width: 90, align: "right" },
            ]}
            rows={keys}
            rowKey={(key) => key.id}
            renderRow={(key) => {
              const status = getStatusLabel(key);
              const monitored = keyMode(key) === "monitor";
              const since = monitored ? monitorSinceText(key) : null;
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
                  {since && (
                    <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mt: "2px" }}>
                      {since}
                    </Typography>
                  )}
                </Box>,
                <Stack direction="row" gap="6px" flexWrap="wrap">
                  <Chip label={status} size="small" uppercase={false} />
                  {monitored && (
                    <Chip
                      label="Monitor only"
                      size="small"
                      uppercase={false}
                      backgroundColor={MCP_STATUS_COLORS.would_block.bg}
                      textColor={MCP_STATUS_COLORS.would_block.text}
                    />
                  )}
                </Stack>,
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
                  {(key.allowed_tools?.length > 0 || key.blocked_tools?.length > 0) && (
                    <Typography sx={{ fontSize: 12, color: palette.text.tertiary, width: "100%" }}>
                      {appliesToNative(key) ? "MCP proxy and native calls" : "MCP proxy only"}
                    </Typography>
                  )}
                </Stack>,
                <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                  by {key.created_by_name} &middot; {formatDate(key.created_at)}
                </Typography>,
                <Stack direction="row" alignItems="center" justifyContent="flex-end" gap="4px">
                  <IconButton
                    size="small"
                    onClick={() => {
                      setActivityKey({ id: key.id, name: key.name });
                      setActivityOpen(true);
                    }}
                    sx={{ p: 0.5 }}
                    aria-label="View agent activity"
                  >
                    <Activity size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                  </IconButton>
                  {key.is_active && !key.revoked_at && (
                    <IconButton
                      size="small"
                      onClick={() => openModeModal(key)}
                      sx={{ p: 0.5 }}
                      aria-label="Enforcement settings"
                    >
                      <SlidersHorizontal
                        size={14}
                        strokeWidth={1.5}
                        color={palette.text.tertiary}
                      />
                    </IconButton>
                  )}
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
            helperText="Allowlist for MCP server tools called through the proxy: if set, this key may call only these tools. Comma-separated; leave empty to allow all. Applies to native tool calls (Bash, Edit, SDK functions) only when the setting below is on."
          />
          <Field
            label="Blocked tools"
            placeholder="e.g., delete_record, drop_table"
            value={createForm.blocked_tools}
            onChange={(e) => setCreateForm((p) => ({ ...p, blocked_tools: e.target.value }))}
            helperText="Denylist for MCP server tools called through the proxy: these are always denied, even if also in the allowlist. Comma-separated; leave empty to block none. Applies to native tool calls only when the setting below is on."
          />
          <NativeToolListsToggle
            checked={createForm.apply_tool_lists_to_hook}
            onChange={(checked) =>
              setCreateForm((p) => ({ ...p, apply_tool_lists_to_hook: checked }))
            }
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
          <EnforcementModeSelect
            id="mcp-agent-key-mode"
            value={createForm.enforcement_mode}
            onChange={(mode) => setCreateForm((p) => ({ ...p, enforcement_mode: mode }))}
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
      >
        <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
          Guardrail rules for selected agents stop listing this key. A rule that listed only this
          agent then applies to no agent until you choose another one in Guardrails.
        </Typography>
      </StandardModal>

      {/* Change mode of an existing key */}
      <StandardModal
        isOpen={!!modeTarget}
        onClose={() => setModeTarget(null)}
        title="Enforcement settings"
        description={fill(tr('Choose how policies apply to calls made with "{name}".'), {
          name: modeTarget?.name ?? "",
        })}
        onSubmit={handleModeSave}
        submitButtonText="Save"
        isSubmitting={modeSubmitting}
        maxWidth="440px"
      >
        <Stack gap="16px">
          <EnforcementModeSelect
            id="mcp-agent-key-mode-edit"
            value={modeValue}
            onChange={setModeValue}
          />
          <NativeToolListsToggle checked={nativeListsValue} onChange={setNativeListsValue} />
          {modeError && (
            <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>
              {modeError}
            </Typography>
          )}
        </Stack>
      </StandardModal>

      {/* Confirmation before a key is created in, or switched to, monitor only */}
      <StandardModal
        isOpen={monitorConfirm !== null}
        onClose={() => setMonitorConfirm(null)}
        title="Use monitor only mode?"
        description="Calls made with this key will no longer be blocked or paused for approval."
        onSubmit={monitorConfirm === "create" ? submitCreate : submitModeChange}
        submitButtonText="Use monitor only"
        isSubmitting={createSubmitting || modeSubmitting}
        maxWidth="440px"
      >
        <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
          {MONITOR_CONFIRM_BODY}
        </Typography>
      </StandardModal>

      {/* Per-agent activity view */}
      <AgentActivityDrawer
        agentKeyId={activityKey?.id ?? null}
        agentKeyName={activityKey?.name}
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
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
