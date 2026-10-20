import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Typography, Stack, IconButton, Tooltip, CircularProgress } from "@mui/material";
import { useNavigate } from "react-router";
import {
  CirclePlus,
  Server,
  Trash2,
  Pencil,
  Search,
  Activity,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import Toggle from "../../../components/Inputs/Toggle";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import Alert from "../../../components/Alert";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import StandardModal from "../../../components/Modals/StandardModal";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import {
  getClientErrorReason,
  getGatewayErrorDetail,
  getGatewayErrorText,
} from "../../../../application/utils/apiErrorReason";
import palette from "../../../themes/palette";
import { slugify } from "../shared";
import MCPTable from "../MCPTable";
import CustomizableSkeleton from "../../../components/Skeletons";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
import { VWLink } from "../../../components/Link/VWLink";

interface ServerForm {
  name: string;
  slug: string;
  url: string;
  auth_type: string;
  auth_token: string;
  auth_header_name: string;
  auth_api_key: string;
  description: string;
}

const EMPTY_FORM: ServerForm = {
  name: "",
  slug: "",
  url: "",
  auth_type: "none",
  auth_token: "",
  auth_header_name: "",
  auth_api_key: "",
  description: "",
};

const AUTH_TYPE_ITEMS = [
  { _id: "none", name: "None" },
  { _id: "bearer", name: "Bearer token" },
  { _id: "api_key", name: "API key" },
];

interface MCPServer {
  id: number;
  name: string;
  slug: string;
  url: string;
  auth_type: string;
  description: string | null;
  is_active: boolean;
  health_status: string;
  tool_count: number;
  last_discovery_error?: string | null;
  auth_header?: string;
  auth_secret_hint?: string;
  created_by_name: string;
  created_at: string;
}

type DiscoveryChanges = { added: number; removed: number; changed: number; unchanged: number };

type Discovery = {
  status: "success" | "failed" | "skipped";
  tools_discovered: number;
  changes?: DiscoveryChanges | null;
  error: string | null;
};

type Translate = (key: string) => string;

// Counts are filled into translated templates: the DOM translator only matches
// whole strings, so "3 tools found" would otherwise stay in English.
const toolsFound = (t: Translate, n: number) =>
  n === 0
    ? t("The server offered no tools")
    : n === 1
      ? t("One tool found")
      : fill(t("{count} tools found"), { count: n });

const hasChanges = (c: DiscoveryChanges) => c.added + c.removed + c.changed > 0;

const changeSummary = (t: Translate, c: DiscoveryChanges) =>
  [
    c.added && fill(t("{count} new"), { count: c.added }),
    c.removed && fill(t("{count} removed"), { count: c.removed }),
    c.changed && fill(t("{count} changed"), { count: c.changed }),
  ]
    .filter(Boolean)
    .join(", ");

// One wording for every successful discovery, whether it ran on save or from
// the Discover button. With no active tools stored before the run (a new
// server, or one whose tools had all gone) there is nothing to compare, so
// only the total means anything.
const discoveryBody = (t: Translate, total: number, c?: DiscoveryChanges | null) =>
  c && c.removed + c.changed + c.unchanged > 0 && hasChanges(c)
    ? changeSummary(t, c)
    : toolsFound(t, total);

const toolsCatalogPath = (serverId: number) => `/ai-gateway/mcp/tools?server=${serverId}`;

export default function MCPServersPage() {
  const formatDate = useFormattedDate();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const [form, setForm] = useState<ServerForm>({ ...EMPTY_FORM });
  const [alert, setAlert] = useState<{
    variant: "success" | "warning" | "error";
    title: string;
    body?: string;
    action?: { label: string; onClick: () => void };
  } | null>(null);
  // Ids of servers with a discovery running; each row has its own spinner.
  const [discoveringIds, setDiscoveringIds] = useState<ReadonlySet<number>>(new Set());

  // Titles are fixed phrases the DOM translator matches; bodies with counts
  // arrive already translated. One dismiss timer at a time: an older alert's timer must not close a newer one.
  const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showAlert = (
    variant: "success" | "warning" | "error",
    title: string,
    body?: string,
    serverId?: number,
  ) => {
    if (alertTimer.current) clearTimeout(alertTimer.current);
    const action =
      serverId === undefined
        ? undefined
        : { label: "View tools", onClick: () => navigate(toolsCatalogPath(serverId)) };
    setAlert({ variant, title, body, action });
    alertTimer.current = setTimeout(() => setAlert(null), 6000);
  };
  useEffect(
    () => () => {
      if (alertTimer.current) clearTimeout(alertTimer.current);
    },
    [],
  );

  const reportDiscovery = (prefix: string, serverId: number | undefined, discovery?: Discovery) => {
    if (!discovery || discovery.status === "skipped") {
      showAlert("success", prefix);
    } else if (discovery.status === "success") {
      const total = discovery.tools_discovered;
      showAlert(
        "success",
        prefix,
        discoveryBody(t, total, discovery.changes),
        total > 0 ? serverId : undefined,
      );
    } else {
      // The server is saved either way; say so, or the admin may think the save failed.
      showAlert("warning", `${prefix}, but discovery failed`, discovery.error || undefined);
    }
  };

  // Reloads can overlap (two discoveries at once); only the latest one may
  // write, or an older response could put stale tool counts back on screen.
  const loadSeq = useRef(0);

  // The skeleton is for the first load and retries; later reloads keep the table on screen.
  const loadData = useCallback(async (showSkeleton = false) => {
    const seq = ++loadSeq.current;
    if (showSkeleton) setLoading(true);
    setLoadError(null);
    try {
      const res = await apiServices.get<Record<string, any>>("/ai-gateway/mcp/servers");
      if (seq === loadSeq.current) setServers(res?.data?.servers || []);
    } catch {
      if (seq === loadSeq.current) setLoadError("Failed to load MCP servers. Please try again.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  const isEditing = editingId !== null;
  const editingServer = servers.find((s) => s.id === editingId);
  // The stored secret only carries over while the auth type is unchanged;
  // switching type means a new secret is required and no "current" hint applies.
  const keepsStoredSecret = isEditing && editingServer?.auth_type === form.auth_type;

  const handleNameChange = (value: string) => {
    setForm((p) => ({
      ...p,
      name: value,
      ...(editingId === null ? { slug: slugify(value) } : {}),
    }));
  };

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (srv: MCPServer) => {
    setEditingId(srv.id);
    setForm({
      name: srv.name || "",
      slug: srv.slug || "",
      url: srv.url || "",
      auth_type: srv.auth_type || "none",
      auth_token: "",
      auth_header_name: srv.auth_header || "",
      auth_api_key: "",
      description: srv.description || "",
    });
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      setFormError("Name and URL are required");
      return;
    }
    if (editingId === null && !form.slug) {
      setFormError("Could not generate a valid slug from the name provided");
      return;
    }
    setIsSubmitting(true);
    setFormError("");

    const payload: Record<string, any> = {
      name: form.name.trim(),
      url: form.url.trim(),
      auth_type: form.auth_type,
      description: form.description.trim() || null,
    };

    // Build auth_config based on auth_type
    if (form.auth_type === "bearer" && form.auth_token.trim()) {
      payload.auth_config = { token: form.auth_token.trim() };
    } else if (form.auth_type === "api_key") {
      const header = form.auth_header_name.trim();
      const key = form.auth_api_key.trim();
      if (key) {
        payload.auth_config = { header: header || "X-API-Key", key };
      } else if (editingServer && header && header !== (editingServer.auth_header || "")) {
        payload.auth_config = { header };
      }
    }

    try {
      let res: { data?: Record<string, any> } | undefined;
      if (editingId === null) {
        payload.slug = form.slug;
        res = await apiServices.post("/ai-gateway/mcp/servers", payload);
      } else {
        res = await apiServices.patch(`/ai-gateway/mcp/servers/${editingId}`, payload);
      }
      setIsModalOpen(false);
      setForm({ ...EMPTY_FORM });
      reportDiscovery(
        "Server saved",
        res?.data?.server?.id ?? editingId ?? undefined,
        res?.data?.discovery,
      );
      await loadData();
    } catch (err: any) {
      setFormError(getGatewayErrorText(err, `Failed to ${editingId ? "update" : "create"} server`));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiServices.delete(`/ai-gateway/mcp/servers/${deleteTarget.id}`);
      setDeleteTarget(null);
      await loadData();
    } catch {
      // Silently handle
    }
  };

  const handleDiscover = async (id: number) => {
    setDiscoveringIds((prev) => new Set(prev).add(id));
    try {
      const res = await apiServices.post<Record<string, any>>(
        `/ai-gateway/mcp/servers/${id}/discover`,
      );
      const total: number = res?.data?.tools_discovered ?? 0;
      const changes: DiscoveryChanges | null | undefined = res?.data?.changes;
      // A run that only removed tools leaves nothing to view.
      const viewFor = total > 0 ? id : undefined;
      if (!changes) {
        // No change data to go on: report the total only.
        showAlert("success", toolsFound(t, total), undefined, viewFor);
      } else {
        showAlert(
          "success",
          hasChanges(changes) ? "Tools updated" : "No changes",
          discoveryBody(t, total, changes),
          viewFor,
        );
      }
    } catch (err: any) {
      showAlert(
        "error",
        "Discovery failed",
        getGatewayErrorDetail(err) ?? getClientErrorReason(err) ?? undefined,
      );
    } finally {
      // Reload first so the spinner stays until the new tool count is on screen.
      await loadData();
      setDiscoveringIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      const res = await apiServices.patch<Record<string, any>>(`/ai-gateway/mcp/servers/${id}`, {
        is_active: !isActive,
      });
      if (!isActive) reportDiscovery("Server switched on", id, res?.data?.discovery);
      await loadData();
    } catch {
      // Silently handle
    }
  };

  const getHealthChipVariant = (status: string): "success" | "error" | "info" => {
    if (status === "healthy") return "success";
    if (status === "unhealthy") return "error";
    return "info";
  };

  const getHealthLabel = (status: string): string => {
    if (status === "healthy") return "Healthy";
    if (status === "unhealthy") return "Unhealthy";
    return "Unknown";
  };

  return (
    <PageHeaderExtended
      title="MCP Servers"
      description="Register and manage Model Context Protocol servers for agent tool access."
      tipBoxEntity="mcp-servers"
      helpArticlePath="ai-gateway/mcp-servers"
      actionButton={
        <CustomizableButton
          text="Add server"
          icon={<CirclePlus size={14} strokeWidth={1.5} />}
          onClick={openCreateModal}
        />
      }
    >
      {alert && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body ?? ""}
          action={alert.action}
          isToast
          onClick={() => setAlert(null)}
        />
      )}
      {loading ? (
        <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
      ) : loadError ? (
        <EmptyState icon={AlertTriangle} message={loadError}>
          <CustomizableButton
            variant="outlined"
            text="Retry"
            icon={<RotateCcw size={16} />}
            onClick={() => loadData(true)}
          />
        </EmptyState>
      ) : servers.length === 0 ? (
        <EmptyState
          icon={Server}
          message="No MCP servers registered yet. Add your first server to expose its tools to AI agents through the gateway."
          showBorder
        >
          <EmptyStateTip
            icon={Server}
            title="Connect external tool servers"
            description="Register MCP-compatible servers that expose tools like database queries, search, file operations, and more. The gateway proxies agent requests to these servers with auth and logging."
          />
          <EmptyStateTip
            icon={Activity}
            title="Tool discovery"
            description="Tools are discovered when you save a server, and you can run discovery again at any time from the server list."
          />
        </EmptyState>
      ) : (
        <Box sx={{ px: 3, pb: 3 }}>
          <MCPTable
            id="mcp-servers-table"
            columns={[
              { label: "Name", width: 220 },
              { label: "Health", width: 110 },
              { label: "Tools", width: 90 },
              { label: "Endpoint" },
              { label: "Added", width: 200 },
              { label: "Active", width: 80, align: "center" },
              { label: "", width: 90, align: "right" },
            ]}
            rows={servers}
            rowKey={(srv) => srv.id}
            onRowClick={(srv) => openEditModal(srv)}
            renderRow={(srv) => [
              <Stack direction="row" alignItems="center" gap="8px">
                <Server size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{srv.name}</Typography>
              </Stack>,
              <Tooltip
                title={
                  srv.health_status === "unhealthy" && srv.last_discovery_error
                    ? srv.last_discovery_error
                    : ""
                }
                arrow
              >
                <span>
                  <Chip
                    label={getHealthLabel(srv.health_status)}
                    variant={getHealthChipVariant(srv.health_status)}
                    size="small"
                    uppercase={false}
                  />
                </span>
              </Tooltip>,
              srv.tool_count > 0 ? (
                <VWLink
                  ariaLabel={
                    srv.tool_count === 1
                      ? t("View one tool")
                      : fill(t("View {count} tools"), { count: srv.tool_count })
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(toolsCatalogPath(srv.id));
                  }}
                  sx={{ fontSize: 12 }}
                >
                  {srv.tool_count}
                </VWLink>
              ) : (
                <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>—</Typography>
              ),
              <Box>
                <Typography sx={{ fontSize: 12, color: palette.text.secondary }}>
                  {srv.url}
                </Typography>
                <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
                  {srv.auth_type === "none" ? "no auth" : srv.auth_type}
                  {srv.slug && ` · /${srv.slug}`}
                </Typography>
              </Box>,
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                {srv.created_by_name ? `${srv.created_by_name} · ` : ""}
                {formatDate(srv.created_at)}
              </Typography>,
              <Box
                sx={{ display: "flex", justifyContent: "center" }}
                onClick={(e) => e.stopPropagation()}
              >
                <Toggle
                  checked={srv.is_active}
                  onChange={() => handleToggleActive(srv.id, srv.is_active)}
                  size="small"
                />
              </Box>,
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="flex-end"
                gap="2px"
                onClick={(e) => e.stopPropagation()}
              >
                <Tooltip title="Discover tools" arrow>
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => handleDiscover(srv.id)}
                      disabled={discoveringIds.has(srv.id)}
                      sx={{ p: 0.5 }}
                      aria-label="Discover tools"
                      aria-busy={discoveringIds.has(srv.id)}
                    >
                      {discoveringIds.has(srv.id) ? (
                        <CircularProgress size={14} sx={{ color: palette.text.tertiary }} />
                      ) : (
                        <Search size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>
                <IconButton
                  size="small"
                  onClick={() => openEditModal(srv)}
                  sx={{ p: 0.5 }}
                  aria-label="Edit server"
                >
                  <Pencil size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setDeleteTarget({ id: srv.id, name: srv.name })}
                  sx={{ p: 0.5 }}
                  aria-label="Delete server"
                >
                  <Trash2 size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                </IconButton>
              </Stack>,
            ]}
          />
        </Box>
      )}

      {/* Create / Edit Server Modal */}
      <StandardModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? "Edit server" : "Add MCP server"}
        description={
          isEditing
            ? "Update this server's configuration."
            : "Register a new MCP-compatible tool server."
        }
        onSubmit={handleSubmit}
        submitButtonText={isEditing ? "Save changes" : "Add server"}
        isSubmitting={isSubmitting}
        maxWidth="480px"
      >
        <Stack gap="16px">
          <Field
            label="Server name"
            placeholder="e.g., Production Search Server"
            value={form.name}
            onChange={(e) => handleNameChange(e.target.value)}
            isRequired
          />

          {isEditing ? (
            <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
              Slug: <strong>{form.slug}</strong> (cannot be changed)
            </Typography>
          ) : (
            form.slug && (
              <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
                Slug: <strong>{form.slug}</strong>
              </Typography>
            )
          )}

          <Field
            label="URL"
            placeholder="e.g., https://mcp-server.example.com"
            value={form.url}
            onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
            isRequired
          />

          <Field
            label="Description"
            placeholder="e.g., Exposes search and retrieval tools"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />

          <Select
            id="auth_type"
            label="Authentication"
            placeholder="Select auth type"
            value={form.auth_type}
            items={AUTH_TYPE_ITEMS}
            onChange={(e) => setForm((p) => ({ ...p, auth_type: e.target.value as string }))}
            getOptionValue={(item) => item._id}
          />

          {form.auth_type === "bearer" && (
            <Field
              label="Bearer token"
              placeholder="Enter the bearer token"
              value={form.auth_token}
              onChange={(e) => setForm((p) => ({ ...p, auth_token: e.target.value }))}
              isRequired={!keepsStoredSecret}
            />
          )}
          {form.auth_type === "bearer" && keepsStoredSecret && editingServer?.auth_secret_hint && (
            <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
              {`Current token: ${editingServer.auth_secret_hint}. Leave blank to keep it.`}
            </Typography>
          )}

          {form.auth_type === "api_key" && (
            <>
              <Field
                label="Header name"
                placeholder="e.g., X-API-Key (defaults to X-API-Key)"
                value={form.auth_header_name}
                onChange={(e) => setForm((p) => ({ ...p, auth_header_name: e.target.value }))}
              />
              <Field
                label="API key"
                placeholder="Enter the API key value"
                value={form.auth_api_key}
                onChange={(e) => setForm((p) => ({ ...p, auth_api_key: e.target.value }))}
                isRequired={!keepsStoredSecret}
              />
              {keepsStoredSecret && editingServer?.auth_secret_hint && (
                <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
                  {`Current key: ${editingServer.auth_secret_hint}. Leave blank to keep it.`}
                </Typography>
              )}
            </>
          )}

          {formError && (
            <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>
              {formError}
            </Typography>
          )}
        </Stack>
      </StandardModal>

      {/* Delete confirmation modal */}
      <StandardModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete server"
        description=""
        onSubmit={handleDelete}
        submitButtonText="Delete"
        maxWidth="400px"
      >
        <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
          Are you sure you want to delete "{deleteTarget?.name}"? This will permanently remove the
          server and all its registered tools. Agents referencing these tools will receive errors.
        </Typography>
      </StandardModal>
    </PageHeaderExtended>
  );
}
