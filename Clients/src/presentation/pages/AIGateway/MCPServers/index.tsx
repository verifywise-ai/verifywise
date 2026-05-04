import { useState, useEffect, useCallback } from "react";
import { Box, Typography, Stack, IconButton, Tooltip } from "@mui/material";
import { CirclePlus, Server, Trash2, Pencil, Search, Activity } from "lucide-react";
import Toggle from "../../../components/Inputs/Toggle";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import StandardModal from "../../../components/Modals/StandardModal";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import palette from "../../../themes/palette";
import { useCardSx, slugify } from "../shared";
import { displayFormattedDate } from "../../../tools/isoDateToString";

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
  created_by_name: string;
  created_at: string;
}

export default function MCPServersPage() {
  const cardSx = useCardSx();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const [form, setForm] = useState<ServerForm>({ ...EMPTY_FORM });

  const loadData = useCallback(async () => {
    try {
      const res = await apiServices.get<Record<string, any>>("/ai-gateway/mcp/servers");
      setServers(res?.data?.servers || []);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      auth_header_name: "",
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
    } else if (form.auth_type === "api_key" && form.auth_api_key.trim()) {
      payload.auth_config = {
        header_name: form.auth_header_name.trim() || "X-API-Key",
        api_key: form.auth_api_key.trim(),
      };
    }

    try {
      if (editingId === null) {
        payload.slug = form.slug;
        await apiServices.post("/ai-gateway/mcp/servers", payload);
      } else {
        await apiServices.patch(`/ai-gateway/mcp/servers/${editingId}`, payload);
      }
      setIsModalOpen(false);
      setForm({ ...EMPTY_FORM });
      await loadData();
    } catch (err: any) {
      setFormError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          `Failed to ${editingId ? "update" : "create"} server`,
      );
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

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      await apiServices.patch(`/ai-gateway/mcp/servers/${id}`, { is_active: !isActive });
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

  const isEditing = editingId !== null;

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
      {loading ? (
        <Box sx={cardSx}>
          <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
            Loading servers...
          </Typography>
        </Box>
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
            title="Health monitoring and tool discovery"
            description="The gateway periodically checks server health and can discover available tools automatically. Unhealthy servers are temporarily bypassed to keep agents running."
          />
        </EmptyState>
      ) : (
        <Box sx={cardSx}>
          <Stack gap="8px">
            {servers.map((srv) => (
              <Stack
                key={srv.id}
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{
                  p: "12px 16px",
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px",
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                }}
                onClick={() => openEditModal(srv)}
              >
                <Stack direction="row" alignItems="center" gap="10px">
                  <Server size={16} strokeWidth={1.5} color={palette.text.tertiary} />
                  <Box>
                    <Stack direction="row" alignItems="center" gap="8px">
                      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{srv.name}</Typography>
                      <Chip
                        label={getHealthLabel(srv.health_status)}
                        variant={getHealthChipVariant(srv.health_status)}
                        size="small"
                        uppercase={false}
                      />
                      {srv.tool_count > 0 && (
                        <Chip
                          label={`${srv.tool_count} tool${srv.tool_count !== 1 ? "s" : ""}`}
                          size="small"
                          uppercase={false}
                        />
                      )}
                    </Stack>
                    <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                      {srv.url} &middot; {srv.auth_type === "none" ? "no auth" : srv.auth_type}
                      {srv.slug && <span> &middot; /{srv.slug}</span>}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: palette.text.disabled, mt: "2px" }}>
                      {srv.created_by_name ? `Added by ${srv.created_by_name}` : "Added"} &middot;{" "}
                      {displayFormattedDate(srv.created_at)}
                    </Typography>
                  </Box>
                </Stack>
                <Stack
                  direction="row"
                  alignItems="center"
                  gap="8px"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Tooltip title="Coming soon" arrow>
                    <span>
                      <IconButton size="small" disabled sx={{ p: 0.5 }} aria-label="Discover tools">
                        <Search size={14} strokeWidth={1.5} color={palette.text.disabled} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Toggle
                    checked={srv.is_active}
                    onChange={() => handleToggleActive(srv.id, srv.is_active)}
                    size="small"
                  />
                  <IconButton size="small" onClick={() => openEditModal(srv)} sx={{ p: 0.5 }}>
                    <Pencil size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => setDeleteTarget({ id: srv.id, name: srv.name })}
                    sx={{ p: 0.5 }}
                  >
                    <Trash2 size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                  </IconButton>
                </Stack>
              </Stack>
            ))}
          </Stack>
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
              isRequired
            />
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
                isRequired
              />
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
