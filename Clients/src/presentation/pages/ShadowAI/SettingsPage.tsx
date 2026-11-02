/**
 * Shadow AI Settings Page
 *
 * Configuration page with API key management, syslog config,
 * rate limiting, data retention, and connection status.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Stack,
  Typography,
  Skeleton,
  Box,
  IconButton,
  Alert,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  useTheme,
} from "@mui/material";
import Chip from "../../components/Chip";
import { Trash2, Copy, Check, Pencil, Ban } from "lucide-react";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  deleteApiKey,
  getSyslogConfigs,
  createSyslogConfig,
  updateSyslogConfig,
  deleteSyslogConfig,
  regenerateSyslogKey,
  getSyslogListenerStatus,
  getSettingsConfig,
  updateSettingsConfig,
} from "../../../application/repository/shadowAi.repository";
import {
  IShadowAiApiKey,
  IShadowAiSyslogConfig,
  IShadowAiSyslogListenerStatus,
  IShadowAiSettings,
} from "../../../domain/interfaces/i.shadowAi";
import singleTheme from "../../themes/v1SingleTheme";
import { CustomizableButton } from "../../components/button/customizable-button";
import StandardModal from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { useUserGuideSidebarContext } from "../../components/UserGuide/UserGuideSidebarContext";
import { palette } from "../../themes/palette";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { formatRelativeDate } from "../../../application/utils/dateFormatter";

const numberFormatter = new Intl.NumberFormat("en-US");

const sectionTitleSx = {
  fontWeight: 600,
  fontSize: 16,
};

const docLinkSx = {
  "fontSize": 13,
  "color": palette.brand.primary,
  "cursor": "pointer",
  "textDecoration": "none",
  "&:hover": { textDecoration: "underline" },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<IShadowAiSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getSettingsConfig();
        if (cancelled) return;
        setSettings(data);
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageHeaderExtended
      title="Settings"
      description="Manage API keys for the REST API and syslog sources for proxy and firewall logs, and set the rate limit and data retention for Shadow AI."
      helpArticlePath="shadow-ai/settings"
      tipBoxEntity="shadow-ai-settings"
    >
      <ApiKeysSection />
      <SyslogConfigSection />
      <DataFormatsSection />
      <RateLimitSection
        settings={settings}
        loading={settingsLoading}
        onSettingsUpdate={setSettings}
      />
      <DataRetentionSection
        settings={settings}
        loading={settingsLoading}
        onSettingsUpdate={setSettings}
      />
      <RiskScoreSection />
    </PageHeaderExtended>
  );
}

// ─── API Keys Section ───────────────────────────────────────────────

function useCardSx() {
  const theme = useTheme();
  return {
    background: theme.palette.background.paper,
    border: `1.5px solid ${theme.palette.border.light}`,
    borderRadius: theme.shape.borderRadius,
    p: theme.spacing(5, 6),
    boxShadow: "none",
  };
}

function ApiKeysSection() {
  const formatDate = useFormattedDate();
  const cardSx = useCardSx();
  const { open: openGuide } = useUserGuideSidebarContext();
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<IShadowAiApiKey[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<IShadowAiApiKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IShadowAiApiKey | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup copy timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const fetchKeys = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const data = await listApiKeys();
      if (signal?.aborted) return;
      setKeys(data);
    } catch (error) {
      if (signal?.aborted) return;
      console.error("Failed to load API keys:", error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchKeys(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchKeys]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createApiKey(newKeyLabel.trim() || undefined);
      setNewlyCreatedKey(result.key);
      setCreateModalOpen(false);
      setNewKeyLabel("");
      fetchKeys();
    } catch (error) {
      console.error("Failed to create API key:", error);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeApiKey(revokeTarget.id);
      setRevokeTarget(null);
      fetchKeys();
    } catch (error) {
      console.error("Failed to revoke API key:", error);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteApiKey(deleteTarget.id);
      setDeleteTarget(null);
      fetchKeys();
    } catch (error) {
      console.error("Failed to delete API key:", error);
    }
  };

  const handleCopy = () => {
    if (newlyCreatedKey) {
      navigator.clipboard.writeText(newlyCreatedKey);
      setCopied(true);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Box sx={cardSx}>
      <Stack gap="12px">
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography sx={sectionTitleSx}>API keys</Typography>
          <CustomizableButton
            text="Create API key"
            variant="contained"
            sx={{
              "backgroundColor": palette.brand.primary,
              "&:hover": { backgroundColor: palette.brand.primaryHover },
              "height": 34,
              "fontSize": 13,
            }}
            onClick={() => setCreateModalOpen(true)}
          />
        </Stack>

        <Typography sx={{ fontSize: 13, color: palette.status.default.text }}>
          API keys authenticate events sent to the REST API from a SIEM, script or browser
          extension. Syslog sources use their own keys.{" "}
          <Typography
            component="span"
            sx={docLinkSx}
            onClick={() => openGuide("shadow-ai/integration-guide")}
          >
            View integration guide
          </Typography>
        </Typography>

        {/* Newly created key banner */}
        {newlyCreatedKey && (
          <Alert
            severity="success"
            sx={{ mb: 2, fontSize: 13 }}
            onClose={() => setNewlyCreatedKey(null)}
          >
            <Stack gap="8px">
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                API key created successfully
              </Typography>
              <Typography sx={{ fontSize: 12, color: palette.status.default.text }}>
                Copy this key now. You won't be able to see it again.
              </Typography>
              <Stack direction="row" alignItems="center" gap="8px">
                <Box
                  sx={{
                    fontFamily: "monospace",
                    fontSize: 12,
                    backgroundColor: palette.background.hover,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: "4px",
                    border: `1px solid ${palette.border.dark}`,
                    wordBreak: "break-all",
                    flex: 1,
                  }}
                >
                  {newlyCreatedKey}
                </Box>
                <IconButton size="small" onClick={handleCopy}>
                  {copied ? (
                    <Check size={14} color={palette.status.success.text} />
                  ) : (
                    <Copy size={14} />
                  )}
                </IconButton>
              </Stack>
            </Stack>
          </Alert>
        )}

        {loading ? (
          <Skeleton variant="rectangular" height={150} sx={{ borderRadius: "4px" }} />
        ) : keys.length === 0 ? (
          <Box
            sx={{
              py: 4,
              textAlign: "center",
              border: `1px dashed ${palette.border.dark}`,
              borderRadius: "4px",
            }}
          >
            <Typography sx={{ fontSize: 13, color: palette.text.disabled }}>
              No API keys created yet
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={singleTheme.tableStyles.primary.frame}>
            <Table>
              <TableHead>
                <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                  {["Key prefix", "Label", "Status", "Created", "Last used", ""].map((h) => (
                    <TableCell key={h} sx={singleTheme.tableStyles.primary.header.cell}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id} sx={singleTheme.tableStyles.primary.body.row}>
                    <TableCell
                      sx={{ ...singleTheme.tableStyles.primary.body.cell, fontFamily: "monospace" }}
                    >
                      {k.key_prefix}...
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {k.label || "—"}
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      <Chip label={k.is_active ? "Active" : "Revoked"} size="small" />
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {k.created_at ? formatDate(k.created_at) : "—"}
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {k.last_used_at ? formatDate(k.last_used_at) : "Never"}
                    </TableCell>
                    <TableCell align="right" sx={singleTheme.tableStyles.primary.body.cell}>
                      {k.is_active ? (
                        <IconButton
                          size="small"
                          onClick={() => setRevokeTarget(k)}
                          sx={{ color: palette.status.warning.text }}
                          title="Revoke key"
                        >
                          <Ban size={14} strokeWidth={1.5} />
                        </IconButton>
                      ) : (
                        <IconButton
                          size="small"
                          onClick={() => setDeleteTarget(k)}
                          sx={{ color: palette.status.error.text }}
                          title="Delete key"
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Create modal */}
        <StandardModal
          isOpen={createModalOpen}
          onClose={() => {
            setCreateModalOpen(false);
            setNewKeyLabel("");
          }}
          title="Create API key"
          description=""
          submitButtonText="Create"
          onSubmit={handleCreate}
          isSubmitting={creating}
          maxWidth="400px"
        >
          <Field
            label="Label (optional)"
            value={newKeyLabel}
            onChange={(e) => setNewKeyLabel(e.target.value)}
            placeholder="e.g., Zscaler proxy"
          />
        </StandardModal>

        {/* Revoke confirmation */}
        <StandardModal
          isOpen={!!revokeTarget}
          onClose={() => setRevokeTarget(null)}
          title={`Revoke "${revokeTarget?.label || revokeTarget?.key_prefix}"?`}
          description=""
          submitButtonText="Revoke"
          onSubmit={handleRevoke}
          submitButtonColor={palette.status.error.text}
          maxWidth="400px"
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            This action cannot be undone. Any integrations using this key will stop working.
          </Typography>
        </StandardModal>

        {/* Delete confirmation */}
        <StandardModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title={`Delete "${deleteTarget?.label || deleteTarget?.key_prefix}"?`}
          description=""
          submitButtonText="Delete"
          onSubmit={handleDelete}
          submitButtonColor={palette.status.error.text}
          maxWidth="400px"
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            This will permanently remove this API key record. This action cannot be undone.
          </Typography>
        </StandardModal>
      </Stack>
    </Box>
  );
}

// ─── Syslog Config Section ──────────────────────────────────────────

type SyslogParser = IShadowAiSyslogConfig["parser_type"];

const PARSER_LABELS: Record<SyslogParser, string> = {
  zscaler: "Zscaler",
  netskope: "Netskope",
  squid: "Squid proxy",
  generic_kv: "Generic key-value",
};

/** Plain-words wording for the drop reasons the listener records. */
const DROP_REASON_LABELS: Record<string, string> = {
  no_user: "No user email in the log line",
  no_destination: "No destination host in the log line",
  unparseable: "Line does not match the parser type",
  wrong_sender_ip: "Sent from an IP that isn't allowed or is shared with another source",
  rate_limited: "Over the hourly event limit",
};

const IPV4_PATTERN = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** Loose IPv4 or IPv6 check. The server normalises and has the final say. */
function isIpAddress(value: string): boolean {
  if (IPV4_PATTERN.test(value)) return true;
  const colons = value.split(":").length - 1;
  return colons >= 2 && /^[0-9a-fA-F:.]+$/.test(value);
}

function sourceName(config: IShadowAiSyslogConfig): string {
  return config.source_identifier || `${PARSER_LABELS[config.parser_type]} source`;
}

const wrapSx = { overflowWrap: "anywhere" as const, minWidth: 0 };

const keyBoxSx = {
  fontFamily: "monospace",
  fontSize: 13,
  backgroundColor: palette.background.hover,
  px: "12px",
  py: "6px",
  borderRadius: "4px",
  border: `1px solid ${palette.border.dark}`,
  wordBreak: "break-all" as const,
  flex: 1,
};

function SyslogConfigSection() {
  const { t } = useTranslation();
  const cardSx = useCardSx();
  const { open: openGuide } = useUserGuideSidebarContext();
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<IShadowAiSyslogConfig[]>([]);
  const [listenerStatus, setListenerStatus] = useState<IShadowAiSyslogListenerStatus | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [formSource, setFormSource] = useState("");
  const [formParser, setFormParser] = useState<SyslogParser>("generic_kv");
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IShadowAiSyslogConfig | null>(null);
  const [editTarget, setEditTarget] = useState<IShadowAiSyslogConfig | null>(null);
  const [editSource, setEditSource] = useState("");
  const [editParser, setEditParser] = useState<SyslogParser>("generic_kv");
  const [editError, setEditError] = useState("");
  const [editing, setEditing] = useState(false);
  const [regenTarget, setRegenTarget] = useState<IShadowAiSyslogConfig | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [actionError, setActionError] = useState("");
  // The full key lives here only while the dialog is open. Never persisted or logged.
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<"key" | "line" | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  // Ref, not state: a second click can land before a state update re-renders.
  const generatingRef = useRef(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const fetchConfigs = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const data = await getSyslogConfigs();
      if (signal?.aborted) return;
      setConfigs(data);
    } catch (error) {
      if (signal?.aborted) return;
      console.error("Failed to load syslog configs:", error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await getSyslogListenerStatus();
      if (signal?.aborted) return;
      setListenerStatus(data);
    } catch (error) {
      if (signal?.aborted) return;
      console.error("Failed to load syslog listener status:", error);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchConfigs(controller.signal);
    fetchStatus(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchConfigs, fetchStatus]);

  const closeKeyDialog = () => {
    setRevealedKey(null);
    setCopiedField(null);
    setCopyFailed(false);
  };

  const handleCopy = async (field: "key" | "line", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setCopiedField(null);
      setCopyFailed(true);
      return;
    }
    setCopyFailed(false);
    setCopiedField(field);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedField(null), 2000);
  };

  const resetCreateForm = () => {
    setCreateModalOpen(false);
    setFormSource("");
    setFormParser("generic_kv");
    setFormError("");
  };

  const handleCreate = async () => {
    const sender = formSource.trim();
    if (sender && !isIpAddress(sender)) {
      setFormError(t("Enter an IPv4 or IPv6 address."));
      return;
    }
    setCreating(true);
    setActionError("");
    try {
      const created = await createSyslogConfig({
        source_identifier: sender || null,
        parser_type: formParser,
        is_active: true,
      });
      resetCreateForm();
      setRevealedKey(created.key);
      fetchConfigs();
    } catch {
      setActionError(t("Could not add the source. Try again."));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (config: IShadowAiSyslogConfig) => {
    setEditTarget(config);
    setEditSource(config.source_identifier ?? "");
    setEditParser(config.parser_type);
    setEditError("");
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    const sender = editSource.trim();
    // Send the sender IP only when it changed, so a legacy hostname row can
    // still change its parser without clearing or retyping that field.
    const senderChanged = sender !== (editTarget.source_identifier ?? "").trim();
    if (senderChanged && sender && !isIpAddress(sender)) {
      setEditError(t("Enter an IPv4 or IPv6 address."));
      return;
    }
    setEditing(true);
    setActionError("");
    try {
      await updateSyslogConfig(editTarget.id, {
        ...(senderChanged ? { source_identifier: sender || null } : {}),
        parser_type: editParser,
      });
      setEditTarget(null);
      fetchConfigs();
    } catch {
      setActionError(t("Could not save the source. Try again."));
    } finally {
      setEditing(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionError("");
    try {
      await deleteSyslogConfig(deleteTarget.id);
      setDeleteTarget(null);
      fetchConfigs();
    } catch {
      setDeleteTarget(null);
      setActionError(t("Could not remove the source. Try again."));
    }
  };

  const handleGenerateKey = async (config: IShadowAiSyslogConfig) => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setRegenerating(true);
    setActionError("");
    try {
      const result = await regenerateSyslogKey(config.id);
      setRegenTarget(null);
      setRevealedKey(result.key);
      fetchConfigs();
    } catch {
      setRegenTarget(null);
      setActionError(t("Could not generate a key. Try again."));
    } finally {
      generatingRef.current = false;
      setRegenerating(false);
    }
  };

  // Enabled in configuration but not bound (port taken, bad TLS files, ...).
  // `running` is compared to false so a status without the field reads as running.
  const listenerFailed = !!listenerStatus?.enabled && listenerStatus.running === false;

  const statusText = (() => {
    if (!listenerStatus) return "";
    if (!listenerStatus.enabled) {
      return t(
        "Syslog listener is off. Set SHADOW_AI_SYSLOG_ENABLED=true on the server to turn it on.",
      );
    }
    if (listenerFailed) return t("Syslog listener failed to start. Check the server log.");
    const template = listenerStatus.tls
      ? "Syslog listener is on. Send to {host}:{port} over TLS."
      : "Syslog listener is on. Send to {host}:{port} over plain TCP.";
    return t(template)
      .replace("{host}", window.location.hostname)
      .replace("{port}", String(listenerStatus.port));
  })();

  const ipOnlyHint = listenerStatus?.ipOnly
    ? t("In IP-only mode, log lines without a key are matched by this IP.")
    : undefined;

  const columns = [
    "Allowed sender IP",
    "Parser",
    "Key",
    "Last received",
    "Accepted",
    "Dropped",
    "Last drop reason",
    "Status",
    "",
  ];

  const parserItems = Object.entries(PARSER_LABELS).map(([value, label]) => ({
    _id: value,
    name: label,
  }));

  const renderDropReason = (reason?: string | null) => {
    if (!reason) return "—";
    const label = DROP_REASON_LABELS[reason];
    return label ? t(label) : t("Unknown reason");
  };

  return (
    <Box sx={cardSx}>
      <Stack gap="12px">
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography sx={sectionTitleSx}>Syslog sources</Typography>
          <CustomizableButton
            text="Add source"
            variant="contained"
            testId="syslog-add-source"
            sx={{
              "backgroundColor": palette.brand.primary,
              "&:hover": { backgroundColor: palette.brand.primaryHover },
              "height": 34,
              "fontSize": 13,
            }}
            onClick={() => setCreateModalOpen(true)}
          />
        </Stack>

        <Typography sx={{ fontSize: 13, color: palette.status.default.text }}>
          Configure syslog sources to ingest network traffic data from your proxy or firewall.{" "}
          <Typography
            component="span"
            sx={docLinkSx}
            onClick={() => openGuide("shadow-ai/integration-guide")}
          >
            View setup instructions
          </Typography>
        </Typography>

        {statusText && (
          <Typography
            data-testid="syslog-listener-status"
            sx={{
              ...wrapSx,
              fontSize: 13,
              color: listenerFailed
                ? palette.status.error.text
                : listenerStatus?.enabled
                  ? palette.status.success.text
                  : palette.status.default.text,
            }}
          >
            {statusText}
          </Typography>
        )}

        {actionError && (
          <Alert severity="error" sx={{ fontSize: 13 }} onClose={() => setActionError("")}>
            {actionError}
          </Alert>
        )}

        {loading ? (
          <Skeleton variant="rectangular" height={100} sx={{ borderRadius: "4px" }} />
        ) : configs.length === 0 ? (
          <Box
            sx={{
              py: 4,
              textAlign: "center",
              border: `1px dashed ${palette.border.dark}`,
              borderRadius: "4px",
            }}
          >
            <Typography sx={{ fontSize: 13, color: palette.text.disabled }}>
              No syslog sources configured
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={singleTheme.tableStyles.primary.frame}>
            <Table>
              <TableHead>
                <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                  {columns.map((h, index) => (
                    <TableCell
                      key={h || `actions-${index}`}
                      sx={singleTheme.tableStyles.primary.header.cell}
                    >
                      {t(h)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {configs.map((c) => {
                  const legacyIdentifier =
                    !!c.source_identifier && !isIpAddress(c.source_identifier);
                  const cellSx = singleTheme.tableStyles.primary.body.cell;
                  return (
                    <TableRow
                      key={c.id}
                      sx={{ ...singleTheme.tableStyles.primary.body.row, cursor: "pointer" }}
                      onClick={() => openEdit(c)}
                    >
                      <TableCell
                        sx={{ ...cellSx, ...wrapSx, fontFamily: "monospace", maxWidth: 200 }}
                      >
                        {c.source_identifier || "—"}
                        {legacyIdentifier && (
                          <Typography
                            sx={{
                              fontFamily: "inherit",
                              fontSize: 12,
                              color: palette.status.warning.text,
                            }}
                          >
                            {t("Not an IP address. Clear it or enter the sender's IP.")}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={cellSx}>{PARSER_LABELS[c.parser_type]}</TableCell>
                      <TableCell sx={cellSx} onClick={(e) => e.stopPropagation()}>
                        <Stack gap="4px" alignItems="flex-start">
                          <Typography
                            sx={{
                              ...wrapSx,
                              fontSize: 13,
                              fontFamily: c.key_prefix ? "monospace" : "inherit",
                            }}
                          >
                            {c.key_prefix ? `${c.key_prefix}...` : t("No key yet")}
                          </Typography>
                          <CustomizableButton
                            text={t(c.key_prefix ? "Regenerate key" : "Generate key")}
                            variant="outlined"
                            disabled={regenerating}
                            testId={`syslog-key-action-${c.id}`}
                            sx={{ height: 30, fontSize: 13 }}
                            onClick={() =>
                              c.key_prefix ? setRegenTarget(c) : handleGenerateKey(c)
                            }
                          />
                        </Stack>
                      </TableCell>
                      <TableCell sx={cellSx}>
                        {c.last_event_at ? formatRelativeDate(c.last_event_at) : t("Never")}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        {numberFormatter.format(Number(c.events_accepted ?? 0))}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        {numberFormatter.format(Number(c.events_dropped ?? 0))}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, ...wrapSx, maxWidth: 220 }}>
                        {renderDropReason(c.last_drop_reason)}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <Chip label={t(c.is_active ? "Active" : "Inactive")} size="small" />
                      </TableCell>
                      <TableCell align="right" sx={cellSx}>
                        <Stack direction="row" gap="4px" justifyContent="flex-end">
                          <IconButton
                            size="small"
                            aria-label={t("Edit source")}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(c);
                            }}
                            sx={{ color: palette.status.default.text }}
                          >
                            <Pencil size={14} strokeWidth={1.5} />
                          </IconButton>
                          <IconButton
                            size="small"
                            aria-label={t("Remove source")}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(c);
                            }}
                            sx={{ color: palette.status.error.text }}
                          >
                            <Trash2 size={14} strokeWidth={1.5} />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Create modal */}
        <StandardModal
          isOpen={createModalOpen}
          onClose={resetCreateForm}
          title={t("Add syslog source")}
          description=""
          submitButtonText={t("Add")}
          onSubmit={handleCreate}
          isSubmitting={creating}
          maxWidth="400px"
        >
          <Stack gap="16px">
            <Select
              id="parser-type-select"
              label={t("Parser type")}
              value={formParser}
              onChange={(e) => setFormParser(e.target.value as SyslogParser)}
              items={parserItems}
            />
            <Field
              label={t("Allowed sender IP (optional)")}
              value={formSource}
              onChange={(e) => {
                setFormSource(e.target.value);
                setFormError("");
              }}
              error={formError}
              helperText={ipOnlyHint}
              placeholder={t("e.g., 203.0.113.7")}
            />
          </Stack>
        </StandardModal>

        {/* Edit modal */}
        <StandardModal
          isOpen={!!editTarget}
          onClose={() => setEditTarget(null)}
          title={t("Edit syslog source")}
          description=""
          submitButtonText={t("Save")}
          onSubmit={handleEdit}
          isSubmitting={editing}
          maxWidth="400px"
        >
          <Stack gap="16px">
            <Select
              id="edit-parser-type-select"
              label={t("Parser type")}
              value={editParser}
              onChange={(e) => setEditParser(e.target.value as SyslogParser)}
              items={parserItems}
            />
            <Field
              label={t("Allowed sender IP (optional)")}
              value={editSource}
              onChange={(e) => {
                setEditSource(e.target.value);
                setEditError("");
              }}
              error={editError}
              helperText={ipOnlyHint}
              placeholder={t("e.g., 203.0.113.7")}
            />
          </Stack>
        </StandardModal>

        {/* Key shown once */}
        <StandardModal
          isOpen={revealedKey !== null}
          onClose={closeKeyDialog}
          title={t("Your source key")}
          description={t("Copy this key now. You won't be able to see it again.")}
          submitButtonText={t("Done")}
          onSubmit={closeKeyDialog}
          showCancelButton={false}
          maxWidth="520px"
        >
          <Stack gap="16px">
            <Stack gap="4px">
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{t("Key")}</Typography>
              <Stack direction="row" alignItems="center" gap="8px">
                <Box sx={keyBoxSx}>{revealedKey}</Box>
                <IconButton
                  size="small"
                  aria-label={t("Copy key")}
                  onClick={() => revealedKey && handleCopy("key", revealedKey)}
                >
                  {copiedField === "key" ? (
                    <Check size={14} color={palette.status.success.text} />
                  ) : (
                    <Copy size={14} />
                  )}
                </IconButton>
              </Stack>
            </Stack>
            <Stack gap="4px">
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                {t("Add this to the start or end of each line in the sender's log format")}
              </Typography>
              <Stack direction="row" alignItems="center" gap="8px">
                <Box sx={keyBoxSx}>{`vw_source=${revealedKey ?? ""}`}</Box>
                <IconButton
                  size="small"
                  aria-label={t("Copy log format line")}
                  onClick={() => revealedKey && handleCopy("line", `vw_source=${revealedKey}`)}
                >
                  {copiedField === "line" ? (
                    <Check size={14} color={palette.status.success.text} />
                  ) : (
                    <Copy size={14} />
                  )}
                </IconButton>
              </Stack>
            </Stack>
            <Typography
              aria-live="polite"
              sx={{ fontSize: 13, color: palette.status.success.text }}
            >
              {copiedField ? t("Copied") : ""}
            </Typography>
            {copyFailed && (
              <Typography role="alert" sx={{ fontSize: 13, color: palette.status.error.text }}>
                {t("Could not copy. Select the key and copy it by hand.")}
              </Typography>
            )}
          </Stack>
        </StandardModal>

        {/* Regenerate confirmation */}
        <StandardModal
          isOpen={!!regenTarget}
          onClose={() => setRegenTarget(null)}
          title={t("Regenerate key for {name}?").replace(
            "{name}",
            regenTarget ? sourceName(regenTarget) : "",
          )}
          description=""
          submitButtonText={t("Regenerate")}
          onSubmit={() => regenTarget && handleGenerateKey(regenTarget)}
          isSubmitting={regenerating}
          maxWidth="400px"
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("The current key stops working within a minute. Update every sender that uses it.")}
          </Typography>
        </StandardModal>

        {/* Delete confirmation */}
        <StandardModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title={t('Remove "{name}"?').replace(
            "{name}",
            deleteTarget ? sourceName(deleteTarget) : "",
          )}
          description=""
          submitButtonText={t("Remove")}
          onSubmit={handleDelete}
          submitButtonColor={palette.status.error.text}
          maxWidth="400px"
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("This will stop processing events from this source.")}
          </Typography>
        </StandardModal>
      </Stack>
    </Box>
  );
}

// ─── Data Formats Section ────────────────────────────────────────────

const REST_API_SCHEMA = `{
  "events": [
    {
      "user_email": "alice@company.com",
      "destination": "chat.openai.com",
      "timestamp": "2026-02-09T14:32:00Z",
      "uri_path": "/v1/chat",
      "http_method": "POST",
      "action": "allowed",
      "department": "Engineering",
      "job_title": "Senior Engineer",
      "manager_email": "bob@company.com"
    }
  ]
}`;

const API_FIELDS = [
  {
    field: "user_email",
    required: "Yes",
    description: "Email address of the user who made the request",
  },
  {
    field: "destination",
    required: "Yes",
    description: "Hostname or domain of the AI tool (e.g., chat.openai.com)",
  },
  { field: "timestamp", required: "Yes", description: "ISO 8601 timestamp of the event" },
  { field: "uri_path", required: "No", description: "URL path of the request (e.g., /v1/chat)" },
  { field: "http_method", required: "No", description: "HTTP method (GET, POST, etc.)" },
  {
    field: "action",
    required: "No",
    description:
      '"blocked" if the proxy refused the request. Any other value is stored as "allowed"',
  },
  {
    field: "department",
    required: "No",
    description: "Department of the user (e.g., Engineering, Finance)",
  },
  { field: "job_title", required: "No", description: "Job title of the user" },
  { field: "manager_email", required: "No", description: "Email address of the user's manager" },
];

const SYSLOG_EXAMPLES: { label: string; format: string; example: string }[] = [
  {
    label: "Zscaler (key=value)",
    format: "zscaler",
    example:
      "user=alice@company.com dst=chat.openai.com method=POST uri=https://chat.openai.com/v1/chat action=allowed department=Engineering vw_source=YOUR_SOURCE_KEY",
  },
  {
    label: "Netskope (JSON-in-syslog)",
    format: "netskope",
    example: `{"user":"alice@company.com","url":"https://chat.openai.com/v1/chat","method":"POST","action":"allow","department":"Engineering","timestamp":"2026-02-09T14:32:00Z","vw_source":"YOUR_SOURCE_KEY"}`,
  },
  {
    label: "Squid (space-delimited)",
    format: "squid",
    example:
      "1707489120.000 200 10.0.0.1 TCP_MISS/200 1024 POST https://chat.openai.com/v1/chat alice@company.com DIRECT/chat.openai.com vw_source=YOUR_SOURCE_KEY",
  },
  {
    label: "Generic key-value (CEF-like)",
    format: "generic_kv",
    example:
      "suser=alice@company.com dhost=chat.openai.com requestMethod=POST act=allowed vw_source=YOUR_SOURCE_KEY",
  },
];

const FIELD_MAPPING = [
  {
    normalized: "user_email",
    zscaler: "user",
    netskope: "user",
    squid: "field 8",
    generic: "suser",
  },
  {
    normalized: "destination",
    zscaler: "dst, else host of uri",
    netskope: "url (host), else domain or site",
    squid: "url (host)",
    generic: "dhost, else host of request",
  },
  {
    normalized: "uri_path",
    zscaler: "uri (path)",
    netskope: "url (path)",
    squid: "url (path)",
    generic: "request (path)",
  },
  {
    normalized: "http_method",
    zscaler: "method",
    netskope: "method",
    squid: "field 6",
    generic: "requestMethod",
  },
  {
    normalized: "action",
    zscaler: "action",
    netskope: "action, else activity",
    squid: "field 4 (result)",
    generic: "act",
  },
  {
    normalized: "timestamp",
    zscaler: "timestamp",
    netskope: "timestamp",
    squid: "field 1 (epoch)",
    generic: "timestamp, else rt, end or start",
  },
  {
    normalized: "department",
    zscaler: "department",
    netskope: "department",
    squid: "—",
    generic: "department",
  },
];

const codeBoxSx = {
  fontFamily: "monospace",
  fontSize: 12,
  backgroundColor: palette.background.accent,
  border: `1px solid ${palette.border.dark}`,
  borderRadius: "4px",
  p: 2,
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-all" as const,
  overflowX: "auto" as const,
};

function DataFormatsSection() {
  const cardSx = useCardSx();
  const { open: openGuide } = useUserGuideSidebarContext();
  return (
    <Box sx={cardSx}>
      <Stack gap="16px">
        <Typography sx={sectionTitleSx}>Data formats</Typography>
        <Typography sx={{ fontSize: 13, color: palette.status.default.text, lineHeight: 1.5 }}>
          Reference for the exact data formats VerifyWise expects when ingesting Shadow AI events
          via the REST API or syslog forwarding.{" "}
          <Typography
            component="span"
            sx={docLinkSx}
            onClick={() => openGuide("shadow-ai/integration-guide")}
          >
            View full integration guide
          </Typography>
        </Typography>

        {/* REST API */}
        <Typography sx={{ fontSize: 14, fontWeight: 600, mt: 1 }}>REST API event schema</Typography>
        <Typography sx={{ fontSize: 13, color: palette.status.default.text, lineHeight: 1.5 }}>
          Send events via{" "}
          <Typography component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>
            POST /api/v1/shadow-ai/events
          </Typography>{" "}
          with a JSON body. Authenticate using the{" "}
          <Typography component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>
            X-API-Key
          </Typography>{" "}
          header.
        </Typography>

        <Box sx={codeBoxSx}>{REST_API_SCHEMA}</Box>

        <TableContainer sx={singleTheme.tableStyles.primary.frame}>
          <Table size="small">
            <TableHead>
              <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                {["Field", "Required", "Description"].map((h) => (
                  <TableCell key={h} sx={singleTheme.tableStyles.primary.header.cell}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {API_FIELDS.map((f) => (
                <TableRow key={f.field} sx={singleTheme.tableStyles.primary.body.row}>
                  <TableCell
                    sx={{ ...singleTheme.tableStyles.primary.body.cell, fontFamily: "monospace" }}
                  >
                    {f.field}
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{f.required}</TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {f.description}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Syslog formats */}
        <Typography sx={{ fontSize: 14, fontWeight: 600, mt: 2 }}>
          Syslog format examples
        </Typography>
        <Typography sx={{ fontSize: 13, color: palette.status.default.text, lineHeight: 1.5 }}>
          {
            'Every line must start or end with vw_source=<key>, using its syslog source\'s key. A Netskope JSON object can carry it as a top-level "vw_source" member instead. An RFC 3164 or RFC 5424 header is removed before parsing. One example line per parser:'
          }
        </Typography>

        <Stack gap="12px">
          {SYSLOG_EXAMPLES.map((ex) => (
            <Box key={ex.format}>
              <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 0.5 }}>{ex.label}</Typography>
              <Box sx={codeBoxSx}>{ex.example}</Box>
            </Box>
          ))}
        </Stack>

        {/* Field mapping */}
        <Typography sx={{ fontSize: 14, fontWeight: 600, mt: 2 }}>Field mapping</Typography>
        <Typography sx={{ fontSize: 13, color: palette.status.default.text, lineHeight: 1.5 }}>
          How each parser maps source fields to the normalized event schema:
        </Typography>

        <TableContainer sx={singleTheme.tableStyles.primary.frame}>
          <Table size="small">
            <TableHead>
              <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                {["Normalized field", "Zscaler", "Netskope", "Squid", "Generic KV"].map((h) => (
                  <TableCell key={h} sx={singleTheme.tableStyles.primary.header.cell}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {FIELD_MAPPING.map((row) => (
                <TableRow key={row.normalized} sx={singleTheme.tableStyles.primary.body.row}>
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      fontFamily: "monospace",
                      fontWeight: 500,
                    }}
                  >
                    {row.normalized}
                  </TableCell>
                  <TableCell
                    sx={{ ...singleTheme.tableStyles.primary.body.cell, fontFamily: "monospace" }}
                  >
                    {row.zscaler}
                  </TableCell>
                  <TableCell
                    sx={{ ...singleTheme.tableStyles.primary.body.cell, fontFamily: "monospace" }}
                  >
                    {row.netskope}
                  </TableCell>
                  <TableCell
                    sx={{ ...singleTheme.tableStyles.primary.body.cell, fontFamily: "monospace" }}
                  >
                    {row.squid}
                  </TableCell>
                  <TableCell
                    sx={{ ...singleTheme.tableStyles.primary.body.cell, fontFamily: "monospace" }}
                  >
                    {row.generic}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </Box>
  );
}

// ─── Rate Limit Section ─────────────────────────────────────────────

function RateLimitSection({
  settings,
  loading,
  onSettingsUpdate,
}: {
  settings: IShadowAiSettings | null;
  loading: boolean;
  onSettingsUpdate: (s: IShadowAiSettings) => void;
}) {
  const [rateLimit, setRateLimit] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setRateLimit(
        settings.rate_limit_max_events_per_hour === 0
          ? ""
          : String(settings.rate_limit_max_events_per_hour),
      );
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const value = rateLimit.trim() === "" ? 0 : parseInt(rateLimit, 10);
      if (isNaN(value) || value < 0) return;
      const updated = await updateSettingsConfig({
        rate_limit_max_events_per_hour: value,
      });
      onSettingsUpdate(updated);
    } catch (error) {
      console.error("Failed to update rate limit:", error);
    } finally {
      setSaving(false);
    }
  };

  const cardSx = useCardSx();
  const currentValue = settings?.rate_limit_max_events_per_hour ?? 0;
  const inputValue = rateLimit.trim() === "" ? 0 : parseInt(rateLimit, 10) || 0;
  const hasChanged = inputValue !== currentValue;

  return (
    <Box sx={cardSx}>
      <Stack gap="12px">
        <Typography sx={sectionTitleSx}>Rate limiting</Typography>
        <Typography sx={{ fontSize: 13, color: palette.status.default.text }}>
          Limit the number of events that can be ingested per hour. Leave empty or set to 0 to allow
          unlimited ingestion.
        </Typography>

        {loading ? (
          <Skeleton variant="rectangular" height={40} sx={{ borderRadius: "4px", maxWidth: 300 }} />
        ) : (
          <Stack direction="row" alignItems="flex-end" gap="12px">
            <Field
              label="Max events per hour"
              value={rateLimit}
              onChange={(e) => setRateLimit(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="0 (unlimited)"
              sx={{ maxWidth: 200 }}
            />
            <CustomizableButton
              text={saving ? "Saving..." : "Save"}
              variant="contained"
              isDisabled={!hasChanged || saving}
              sx={{
                "backgroundColor": palette.brand.primary,
                "&:hover": { backgroundColor: palette.brand.primaryHover },
                "height": 34,
                "fontSize": 13,
                "mb": "2px",
              }}
              onClick={handleSave}
            />
          </Stack>
        )}

        {settings && currentValue > 0 && (
          <Typography sx={{ fontSize: 12, color: palette.text.disabled }}>
            Currently limited to {numberFormatter.format(currentValue)} events/hour
          </Typography>
        )}
        {settings && currentValue === 0 && (
          <Typography sx={{ fontSize: 12, color: palette.text.disabled }}>
            No rate limit applied
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

// ─── Data Retention Section ─────────────────────────────────────────

function DataRetentionSection({
  settings,
  loading,
  onSettingsUpdate,
}: {
  settings: IShadowAiSettings | null;
  loading: boolean;
  onSettingsUpdate: (s: IShadowAiSettings) => void;
}) {
  const [eventsDays, setEventsDays] = useState("");
  const [rollupsDays, setRollupsDays] = useState("");
  const [alertsDays, setAlertsDays] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setEventsDays(
        settings.retention_events_days === 0 ? "" : String(settings.retention_events_days),
      );
      setRollupsDays(
        settings.retention_daily_rollups_days === 0
          ? ""
          : String(settings.retention_daily_rollups_days),
      );
      setAlertsDays(
        settings.retention_alert_history_days === 0
          ? ""
          : String(settings.retention_alert_history_days),
      );
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const parseVal = (v: string) => {
        const n = v.trim() === "" ? 0 : parseInt(v, 10);
        return isNaN(n) || n < 0 ? 0 : n;
      };
      const updated = await updateSettingsConfig({
        retention_events_days: parseVal(eventsDays),
        retention_daily_rollups_days: parseVal(rollupsDays),
        retention_alert_history_days: parseVal(alertsDays),
      });
      onSettingsUpdate(updated);
    } catch (error) {
      console.error("Failed to update retention settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const parseOrZero = (v: string) => {
    const n = v.trim() === "" ? 0 : parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  };

  const hasChanged = settings
    ? parseOrZero(eventsDays) !== settings.retention_events_days ||
      parseOrZero(rollupsDays) !== settings.retention_daily_rollups_days ||
      parseOrZero(alertsDays) !== settings.retention_alert_history_days
    : false;

  const RETENTION_FIELDS = [
    {
      label: "Raw events",
      description: "Individual event records from ingestion",
      value: eventsDays,
      setter: setEventsDays,
      defaultVal: 30,
    },
    {
      label: "Daily rollups",
      description: "Aggregated daily statistics",
      value: rollupsDays,
      setter: setRollupsDays,
      defaultVal: 365,
    },
    {
      label: "Alert history",
      description: "Records of triggered alerts",
      value: alertsDays,
      setter: setAlertsDays,
      defaultVal: 90,
    },
  ];

  const cardSx = useCardSx();

  return (
    <Box sx={cardSx}>
      <Stack gap="12px">
        <Typography sx={sectionTitleSx}>Data retention</Typography>
        <Typography sx={{ fontSize: 13, color: palette.status.default.text }}>
          Configure how long Shadow AI data is retained. Set to 0 or leave empty to keep data
          indefinitely. Changes take effect on the next cleanup cycle.
        </Typography>

        {loading ? (
          <Skeleton variant="rectangular" height={120} sx={{ borderRadius: "4px" }} />
        ) : (
          <Stack gap="16px">
            {RETENTION_FIELDS.map((field) => (
              <Stack key={field.label} direction="row" alignItems="flex-end" gap="12px">
                <Box sx={{ flex: 1, maxWidth: 280 }}>
                  <Field
                    label={`${field.label} (days)`}
                    value={field.value}
                    onChange={(e) => field.setter(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder={`${field.defaultVal} (default)`}
                  />
                  <Typography sx={{ fontSize: 11, color: palette.text.disabled, mt: 0.5 }}>
                    {field.description}
                  </Typography>
                </Box>
              </Stack>
            ))}

            <CustomizableButton
              text={saving ? "Saving..." : "Save retention settings"}
              variant="contained"
              isDisabled={!hasChanged || saving}
              sx={{
                "backgroundColor": palette.brand.primary,
                "&:hover": { backgroundColor: palette.brand.primaryHover },
                "height": 34,
                "fontSize": 13,
                "alignSelf": "flex-start",
              }}
              onClick={handleSave}
            />
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

// ─── Risk Score Explanation ──────────────────────────────────────────

const RISK_WEIGHTS = [
  {
    factor: "Approval status",
    weight: "40%",
    description:
      "Unapproved tools (not in model inventory or not approved) receive the maximum score for this factor.",
  },
  {
    factor: "Data & compliance",
    weight: "25%",
    description:
      "Based on whether the tool trains on user data, has SOC 2 certification, GDPR compliance, SSO support, and encryption at rest.",
  },
  {
    factor: "Usage volume",
    weight: "15%",
    description:
      "Normalized against the organization average. Higher-than-average usage increases the score, capped at 100.",
  },
  {
    factor: "Department sensitivity",
    weight: "20%",
    description:
      "Uses the highest sensitivity score among departments accessing the tool. Finance, Legal, and HR are rated highest (80).",
  },
];

function RiskScoreSection() {
  const cardSx = useCardSx();
  return (
    <Box sx={cardSx}>
      <Stack gap="16px">
        <Typography sx={sectionTitleSx}>Risk score calculation</Typography>
        <Typography sx={{ fontSize: 13, color: palette.status.default.text, lineHeight: 1.5 }}>
          Each AI tool receives a risk score from 0 to 100, recalculated nightly. The score is a
          weighted composite of four factors:
        </Typography>
        <Stack gap="8px">
          {RISK_WEIGHTS.map((w) => (
            <Stack
              key={w.factor}
              direction="row"
              gap="12px"
              sx={{
                p: "12px 16px",
                border: `1px solid ${palette.border.dark}`,
                borderRadius: "4px",
                alignItems: "flex-start",
              }}
            >
              <Typography
                sx={{ fontSize: 13, fontWeight: 600, minWidth: 36, color: palette.brand.primary }}
              >
                {w.weight}
              </Typography>
              <Stack gap="2px">
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{w.factor}</Typography>
                <Typography
                  sx={{ fontSize: 12, color: palette.status.default.text, lineHeight: 1.5 }}
                >
                  {w.description}
                </Typography>
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
