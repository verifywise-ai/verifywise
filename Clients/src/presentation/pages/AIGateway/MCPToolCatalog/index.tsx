import { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Typography, Stack, IconButton } from "@mui/material";
import { Wrench, Pencil, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import Toggle from "../../../components/Inputs/Toggle";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import Chip from "../../../components/Chip";
import Select from "../../../components/Inputs/Select";
import StandardModal from "../../../components/Modals/StandardModal";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import palette from "../../../themes/palette";
import { useCardSx } from "../shared";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MCPTool {
  id: number;
  server_id: number;
  server_name?: string;
  tool_name: string;
  description: string | null;
  risk_level: "low" | "medium" | "high";
  requires_approval: boolean;
  input_schema: Record<string, any> | null;
  is_active: boolean;
  created_at: string;
}

interface EditForm {
  risk_level: string;
  requires_approval: boolean;
}

const EMPTY_FORM: EditForm = {
  risk_level: "low",
  requires_approval: false,
};

const RISK_LEVEL_ITEMS = [
  { _id: "low", name: "Low" },
  { _id: "medium", name: "Medium" },
  { _id: "high", name: "High" },
];

const RISK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: "#ECFDF3", text: "#027A48", border: "#A6F4C5" },
  medium: { bg: "#FFFAEB", text: "#B54708", border: "#FEDF89" },
  high: { bg: "#FEF3F2", text: "#B42318", border: "#FECDCA" },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function MCPToolCatalogPage() {
  const cardSx = useCardSx();
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterServer, setFilterServer] = useState("");
  const [filterRisk, setFilterRisk] = useState("");

  // Edit modal
  const [editingTool, setEditingTool] = useState<MCPTool | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<EditForm>({ ...EMPTY_FORM });

  const loadData = useCallback(async () => {
    try {
      const [toolsRes, serversRes] = await Promise.all([
        apiServices.get<Record<string, any>>("/ai-gateway/mcp/tools"),
        apiServices.get<Record<string, any>>("/ai-gateway/mcp/servers"),
      ]);
      setTools(toolsRes?.data?.tools || []);
      setServers(serversRes?.data?.servers || []);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const serverMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const s of servers) {
      map[s.id] = s.name || s.server_name || `Server #${s.id}`;
    }
    return map;
  }, [servers]);

  const serverFilterItems = useMemo(
    () => [
      { _id: "", name: "All servers" },
      ...servers.map((s) => ({
        _id: String(s.id),
        name: s.name || s.server_name || `Server #${s.id}`,
      })),
    ],
    [servers],
  );

  const riskFilterItems = useMemo(
    () => [{ _id: "", name: "All risk levels" }, ...RISK_LEVEL_ITEMS],
    [],
  );

  const filteredTools = useMemo(() => {
    let result = tools;
    if (filterServer) {
      result = result.filter((t) => String(t.server_id) === filterServer);
    }
    if (filterRisk) {
      result = result.filter((t) => t.risk_level === filterRisk);
    }
    return result;
  }, [tools, filterServer, filterRisk]);

  // Group tools by server
  const groupedTools = useMemo(() => {
    const groups: Record<string, MCPTool[]> = {};
    for (const tool of filteredTools) {
      const serverName =
        tool.server_name || serverMap[tool.server_id] || `Server #${tool.server_id}`;
      if (!groups[serverName]) groups[serverName] = [];
      groups[serverName].push(tool);
    }
    return groups;
  }, [filteredTools, serverMap]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const openEditModal = (tool: MCPTool) => {
    setEditingTool(tool);
    setForm({
      risk_level: tool.risk_level || "low",
      requires_approval: tool.requires_approval || false,
    });
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!editingTool) return;
    setIsSubmitting(true);
    setFormError("");

    try {
      await apiServices.patch(`/ai-gateway/mcp/tools/${editingTool.id}`, {
        risk_level: form.risk_level,
        requires_approval: form.requires_approval,
      });
      setIsModalOpen(false);
      setEditingTool(null);
      await loadData();
    } catch (err: any) {
      setFormError(
        err?.response?.data?.detail || err?.response?.data?.message || "Failed to update tool",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleApproval = async (tool: MCPTool) => {
    try {
      await apiServices.patch(`/ai-gateway/mcp/tools/${tool.id}`, {
        requires_approval: !tool.requires_approval,
      });
      await loadData();
    } catch {
      // Silently handle
    }
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  const renderRiskBadge = (level: string) => {
    const colors = RISK_COLORS[level] || RISK_COLORS.low;
    return (
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          height: 22,
          px: "8px",
          borderRadius: "4px",
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.bg,
          fontSize: 11,
          fontWeight: 500,
          color: colors.text,
          whiteSpace: "nowrap",
          lineHeight: 1,
          textTransform: "capitalize",
        }}
      >
        {level}
      </Box>
    );
  };

  const renderToolRow = (tool: MCPTool) => (
    <Stack
      key={tool.id}
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      sx={{
        "p": "12px 16px",
        "border": `1px solid ${palette.border.dark}`,
        "borderRadius": "4px",
        "cursor": "pointer",
        "&:hover": { bgcolor: "action.hover" },
      }}
      onClick={() => openEditModal(tool)}
    >
      <Stack gap="4px" flex={1} minWidth={0}>
        <Stack direction="row" alignItems="center" gap="8px">
          <Wrench size={14} strokeWidth={1.5} color={palette.text.tertiary} />
          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{tool.tool_name}</Typography>
          {renderRiskBadge(tool.risk_level)}
          {tool.requires_approval && (
            <Chip label="Approval required" size="small" variant="warning" />
          )}
        </Stack>
        {tool.description && (
          <Typography sx={{ fontSize: 12, color: palette.text.tertiary, ml: "22px" }}>
            {tool.description}
          </Typography>
        )}
      </Stack>
      <Stack direction="row" alignItems="center" gap="8px" onClick={(e) => e.stopPropagation()}>
        <Typography sx={{ fontSize: 11, color: palette.text.disabled }}>Approval</Typography>
        <Toggle
          checked={tool.requires_approval}
          onChange={() => handleToggleApproval(tool)}
          size="small"
        />
        <IconButton size="small" onClick={() => openEditModal(tool)} sx={{ p: 0.5 }}>
          <Pencil size={14} strokeWidth={1.5} color={palette.text.tertiary} />
        </IconButton>
      </Stack>
    </Stack>
  );

  return (
    <PageHeaderExtended
      title="MCP Tool Catalog"
      description="View and manage all discovered MCP tools across your servers."
      tipBoxEntity="ai-gateway-mcp-tools"
      helpArticlePath="ai-gateway/mcp-tools"
    >
      {/* Filters */}
      {!loading && tools.length > 0 && (
        <Stack direction="row" gap="12px" sx={{ mb: "16px" }}>
          <Box sx={{ minWidth: 200 }}>
            <Select
              id="filter-server"
              label=""
              placeholder="Filter by server"
              value={filterServer}
              items={serverFilterItems}
              onChange={(e) => setFilterServer(e.target.value as string)}
              getOptionValue={(item) => item._id}
            />
          </Box>
          <Box sx={{ minWidth: 160 }}>
            <Select
              id="filter-risk"
              label=""
              placeholder="Filter by risk"
              value={filterRisk}
              items={riskFilterItems}
              onChange={(e) => setFilterRisk(e.target.value as string)}
              getOptionValue={(item) => item._id}
            />
          </Box>
        </Stack>
      )}

      {loading ? (
        <Box sx={cardSx}>
          <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
            Loading tools...
          </Typography>
        </Box>
      ) : tools.length === 0 ? (
        <EmptyState
          icon={Wrench}
          message="No MCP tools discovered yet. Tools will appear here after servers are connected and their tools are fetched."
          showBorder
        >
          <EmptyStateTip
            icon={ShieldCheck}
            title="Manage tool risk levels"
            description="Each discovered tool can be assigned a risk level (low, medium, high). High-risk tools can require approval before execution."
          />
          <EmptyStateTip
            icon={AlertTriangle}
            title="Approval workflows"
            description="Enable approval requirements on sensitive tools to ensure human review before the AI agent can execute them."
          />
        </EmptyState>
      ) : filteredTools.length === 0 ? (
        <Box sx={cardSx}>
          <Typography
            sx={{ fontSize: 13, color: palette.text.tertiary, textAlign: "center", py: "16px" }}
          >
            No tools match the selected filters.
          </Typography>
        </Box>
      ) : (
        <Stack gap="16px">
          {Object.entries(groupedTools).map(([serverName, serverTools]) => (
            <Box key={serverName} sx={cardSx}>
              <Typography sx={{ fontSize: 14, fontWeight: 600, mb: "12px" }}>
                {serverName}
                <Typography
                  component="span"
                  sx={{ fontSize: 12, color: palette.text.tertiary, ml: "8px" }}
                >
                  ({serverTools.length} tool{serverTools.length !== 1 ? "s" : ""})
                </Typography>
              </Typography>
              <Stack gap="8px">{serverTools.map(renderToolRow)}</Stack>
            </Box>
          ))}
        </Stack>
      )}

      {/* Edit Tool Modal */}
      <StandardModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Edit tool settings"
        description={
          editingTool ? `Configure risk level and approval for "${editingTool.tool_name}"` : ""
        }
        onSubmit={handleSubmit}
        submitButtonText="Save changes"
        isSubmitting={isSubmitting}
        maxWidth="480px"
      >
        <Stack gap="16px">
          {editingTool && (
            <Box
              sx={{
                p: "12px 16px",
                bgcolor: palette.background.alt,
                borderRadius: "4px",
                border: `1px solid ${palette.border.light}`,
              }}
            >
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                {editingTool.tool_name}
              </Typography>
              {editingTool.description && (
                <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mt: "4px" }}>
                  {editingTool.description}
                </Typography>
              )}
              <Typography sx={{ fontSize: 11, color: palette.text.disabled, mt: "4px" }}>
                Server:{" "}
                {editingTool.server_name ||
                  serverMap[editingTool.server_id] ||
                  `#${editingTool.server_id}`}
              </Typography>
            </Box>
          )}

          <Select
            id="risk-level"
            label="Risk level"
            placeholder="Select risk level"
            value={form.risk_level}
            items={RISK_LEVEL_ITEMS}
            onChange={(e) => setForm((p) => ({ ...p, risk_level: e.target.value as string }))}
            getOptionValue={(item) => item._id}
          />

          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography sx={{ fontSize: 13 }}>Requires approval</Typography>
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                When enabled, tool invocations must be approved before execution.
              </Typography>
            </Box>
            <Toggle
              checked={form.requires_approval}
              onChange={() => setForm((p) => ({ ...p, requires_approval: !p.requires_approval }))}
            />
          </Stack>

          {form.risk_level === "high" && !form.requires_approval && (
            <Stack
              direction="row"
              alignItems="flex-start"
              gap="6px"
              sx={{
                p: "8px 12px",
                bgcolor: "#FFFAEB",
                borderRadius: "4px",
                border: "1px solid #FEDF89",
              }}
            >
              <ShieldAlert
                size={14}
                strokeWidth={1.5}
                color="#B54708"
                style={{ flexShrink: 0, marginTop: 2 }}
              />
              <Typography sx={{ fontSize: 12, color: "#93370D", lineHeight: 1.5 }}>
                This tool is marked as high risk. Consider enabling approval to ensure human review
                before execution.
              </Typography>
            </Stack>
          )}

          {formError && (
            <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>
              {formError}
            </Typography>
          )}
        </Stack>
      </StandardModal>
    </PageHeaderExtended>
  );
}
