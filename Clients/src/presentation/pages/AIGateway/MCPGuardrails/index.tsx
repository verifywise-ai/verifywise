import { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Typography, Stack, IconButton } from "@mui/material";
import { CirclePlus, ShieldCheck, Trash2, Pencil, Shield, ScanLine, Lock } from "lucide-react";
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
import { useCardSx } from "../shared";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MCPGuardrail {
  id: number;
  name: string;
  rule_type: "pii" | "content_filter" | "prompt_injection";
  action: "block" | "mask";
  scope: string;
  applies_to_tools: string[];
  config: Record<string, any> | null;
  is_active: boolean;
  created_at: string;
}

interface GuardrailForm {
  name: string;
  rule_type: string;
  action: string;
  scope: string;
  applies_to_tools: string;
  config: string;
  is_active: boolean;
}

const EMPTY_FORM: GuardrailForm = {
  name: "",
  rule_type: "pii",
  action: "block",
  scope: "tool_input",
  applies_to_tools: "",
  config: "",
  is_active: true,
};

const RULE_TYPE_ITEMS = [
  { _id: "pii", name: "PII detection" },
  { _id: "content_filter", name: "Content filter" },
  { _id: "prompt_injection", name: "Prompt injection" },
];

const ACTION_ITEMS = [
  { _id: "block", name: "Block" },
  { _id: "mask", name: "Mask" },
];

const SCOPE_ITEMS = [{ _id: "tool_input", name: "Tool input" }];

const RULE_TYPE_VARIANTS: Record<string, "info" | "warning" | "success"> = {
  pii: "info",
  content_filter: "warning",
  prompt_injection: "success",
};

const RULE_TYPE_LABELS: Record<string, string> = {
  pii: "PII",
  content_filter: "Content filter",
  prompt_injection: "Prompt injection",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function MCPGuardrailsPage() {
  const cardSx = useCardSx();
  const [rules, setRules] = useState<MCPGuardrail[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / Edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<GuardrailForm>({ ...EMPTY_FORM });

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<MCPGuardrail | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await apiServices.get<Record<string, any>>("/ai-gateway/mcp/guardrails");
      setRules(res?.data?.data || []);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Derived ───────────────────────────────────────────────────────────────

  const activeCount = useMemo(() => rules.filter((r) => r.is_active).length, [rules]);

  const isEditing = editingId !== null;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (rule: MCPGuardrail) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name || "",
      rule_type: rule.rule_type || "pii",
      action: rule.action || "block",
      scope: rule.scope || "tool_input",
      applies_to_tools: Array.isArray(rule.applies_to_tools)
        ? rule.applies_to_tools.join(", ")
        : "",
      config: rule.config ? JSON.stringify(rule.config, null, 2) : "",
      is_active: rule.is_active ?? true,
    });
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }

    // Parse applies_to_tools from comma-separated string
    const toolsList = form.applies_to_tools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // Parse optional JSON config
    let parsedConfig: Record<string, any> | null = null;
    if (form.config.trim()) {
      try {
        parsedConfig = JSON.parse(form.config);
      } catch {
        setFormError("Config must be valid JSON");
        return;
      }
    }

    setIsSubmitting(true);
    setFormError("");

    const payload = {
      name: form.name,
      rule_type: form.rule_type,
      action: form.action,
      scope: form.scope,
      applies_to_tools: toolsList,
      config: parsedConfig,
      is_active: form.is_active,
    };

    try {
      if (editingId === null) {
        await apiServices.post("/ai-gateway/mcp/guardrails", payload);
      } else {
        await apiServices.patch(`/ai-gateway/mcp/guardrails/${editingId}`, payload);
      }
      setIsModalOpen(false);
      setForm({ ...EMPTY_FORM });
      await loadData();
    } catch (err: any) {
      setFormError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          `Failed to ${isEditing ? "update" : "create"} guardrail`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (id: number, isActive: boolean) => {
    try {
      await apiServices.patch(`/ai-gateway/mcp/guardrails/${id}`, { is_active: !isActive });
      await loadData();
    } catch {
      // Silently handle
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await apiServices.delete(`/ai-gateway/mcp/guardrails/${deleteTarget.id}`);
      setDeleteTarget(null);
      await loadData();
    } catch {
      // Silently handle
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  const renderRuleRow = (rule: MCPGuardrail) => (
    <Stack
      key={rule.id}
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      sx={{
        "p": "12px 16px",
        "border": `1px solid ${palette.border.dark}`,
        "borderRadius": "4px",
        "opacity": rule.is_active ? 1 : 0.6,
        "cursor": "pointer",
        "&:hover": { bgcolor: "action.hover" },
      }}
      onClick={() => openEditModal(rule)}
    >
      <Stack gap="4px" flex={1} minWidth={0}>
        <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{rule.name}</Typography>
          <Chip
            label={RULE_TYPE_LABELS[rule.rule_type] || rule.rule_type}
            size="small"
            variant={RULE_TYPE_VARIANTS[rule.rule_type] || "info"}
          />
          <Chip label={rule.action === "block" ? "Block" : "Mask"} size="small" />
        </Stack>
        <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
          Scope: {rule.scope || "tool_input"}
          {rule.applies_to_tools && rule.applies_to_tools.length > 0
            ? ` \u00b7 Tools: ${rule.applies_to_tools.join(", ")}`
            : " \u00b7 Applies to all tools"}
        </Typography>
        {rule.applies_to_tools && rule.applies_to_tools.length > 0 && (
          <Stack direction="row" gap="4px" flexWrap="wrap">
            {rule.applies_to_tools.map((tool) => (
              <Box
                key={tool}
                component="span"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 20,
                  px: "6px",
                  borderRadius: "4px",
                  border: `1px solid ${palette.border.light}`,
                  backgroundColor: palette.background.alt,
                  fontSize: 11,
                  color: palette.text.secondary,
                  whiteSpace: "nowrap",
                  lineHeight: 1,
                }}
              >
                {tool}
              </Box>
            ))}
          </Stack>
        )}
      </Stack>
      <Stack direction="row" alignItems="center" gap="8px" onClick={(e) => e.stopPropagation()}>
        <Toggle
          checked={rule.is_active}
          onChange={() => handleToggle(rule.id, rule.is_active)}
          size="small"
        />
        <IconButton size="small" onClick={() => openEditModal(rule)} sx={{ p: 0.5 }}>
          <Pencil size={14} strokeWidth={1.5} color={palette.text.tertiary} />
        </IconButton>
        <IconButton size="small" onClick={() => setDeleteTarget(rule)} sx={{ p: 0.5 }}>
          <Trash2 size={14} strokeWidth={1.5} color={palette.text.tertiary} />
        </IconButton>
      </Stack>
    </Stack>
  );

  return (
    <PageHeaderExtended
      title="MCP Guardrails"
      description="Configure guardrail rules for MCP tool invocations."
      tipBoxEntity="ai-gateway-mcp-guardrails"
      helpArticlePath="ai-gateway/mcp-guardrails"
      actionButton={
        <CustomizableButton
          text="Add guardrail"
          icon={<CirclePlus size={14} strokeWidth={1.5} />}
          onClick={openCreateModal}
        />
      }
    >
      {loading ? (
        <Box sx={cardSx}>
          <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
            Loading guardrails...
          </Typography>
        </Box>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Shield}
          message="No MCP guardrail rules configured yet. Add rules to scan tool inputs for PII, prohibited content, or prompt injection attempts."
          showBorder
        >
          <EmptyStateTip
            icon={ScanLine}
            title="Scan tool inputs before execution"
            description="Guardrail rules are evaluated against tool input data before the MCP tool is executed. Block or mask sensitive content to protect your downstream systems."
          />
          <EmptyStateTip
            icon={Lock}
            title="Scope rules to specific tools"
            description="Apply guardrails globally or restrict them to specific MCP tools. For example, block PII only when invoking database-query tools."
          />
          <EmptyStateTip
            icon={ShieldCheck}
            title="Multiple rule types"
            description="Choose from PII detection, content filtering, or prompt injection detection. Each rule can either block the request or mask matched content."
          />
        </EmptyState>
      ) : (
        <Box sx={cardSx}>
          <Stack gap="12px">
            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
              {rules.length} rule{rules.length !== 1 ? "s" : ""} configured, {activeCount} active
            </Typography>
            <Stack gap="8px">{rules.map(renderRuleRow)}</Stack>
          </Stack>
        </Box>
      )}

      {/* Create / Edit Guardrail Modal */}
      <StandardModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? "Edit guardrail" : "Add guardrail"}
        description={
          isEditing
            ? "Update this guardrail rule's configuration."
            : "Configure a new guardrail rule for MCP tool invocations."
        }
        onSubmit={handleSubmit}
        submitButtonText={isEditing ? "Save changes" : "Create guardrail"}
        isSubmitting={isSubmitting}
        maxWidth="480px"
      >
        <Stack gap="16px">
          <Field
            label="Name"
            placeholder="e.g., Block PII in database queries"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            isRequired
          />

          <Select
            id="rule-type"
            label="Rule type"
            placeholder="Select rule type"
            value={form.rule_type}
            items={RULE_TYPE_ITEMS}
            onChange={(e) => setForm((p) => ({ ...p, rule_type: e.target.value as string }))}
            getOptionValue={(item) => item._id}
          />

          <Select
            id="action"
            label="Action"
            placeholder="Select action"
            value={form.action}
            items={ACTION_ITEMS}
            onChange={(e) => setForm((p) => ({ ...p, action: e.target.value as string }))}
            getOptionValue={(item) => item._id}
          />

          <Select
            id="scope"
            label="Scope"
            placeholder="Select scope"
            value={form.scope}
            items={SCOPE_ITEMS}
            onChange={(e) => setForm((p) => ({ ...p, scope: e.target.value as string }))}
            getOptionValue={(item) => item._id}
          />

          <Field
            label="Applies to tools"
            placeholder="tool1, tool2 (leave empty for all tools)"
            value={form.applies_to_tools}
            onChange={(e) => setForm((p) => ({ ...p, applies_to_tools: e.target.value }))}
            isOptional
          />
          <Typography sx={{ fontSize: 11, color: palette.text.disabled, mt: "-12px" }}>
            Comma-separated tool names. Leave empty to apply to all MCP tools.
          </Typography>

          <Field
            label="Config (JSON)"
            placeholder='{"entities": {"EMAIL_ADDRESS": "mask"}}'
            value={form.config}
            onChange={(e) => setForm((p) => ({ ...p, config: e.target.value }))}
            isOptional
          />
          <Typography sx={{ fontSize: 11, color: palette.text.disabled, mt: "-12px" }}>
            Optional JSON configuration for advanced rule settings.
          </Typography>

          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ fontSize: 13 }}>Active</Typography>
            <Toggle
              checked={form.is_active}
              onChange={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
            />
          </Stack>

          {form.action === "mask" && (
            <Typography
              sx={{
                fontSize: 12,
                color: palette.status.warning?.text || palette.text.tertiary,
                lineHeight: 1.5,
              }}
            >
              Masking replaces matched content with placeholders before the tool receives the input.
              The tool may produce less relevant results.
            </Typography>
          )}

          {formError && (
            <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>
              {formError}
            </Typography>
          )}
        </Stack>
      </StandardModal>

      {/* Delete Confirmation Modal */}
      <StandardModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove guardrail rule"
        description={`Are you sure you want to remove "${deleteTarget?.name}"?`}
        onSubmit={handleDeleteConfirm}
        submitButtonText="Remove rule"
        submitButtonColor="#D32F2F"
        isSubmitting={deleteSubmitting}
        maxWidth="480px"
      >
        <Stack gap="8px">
          <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
            This action takes effect immediately. MCP tool invocations will no longer be checked
            against this rule.
          </Typography>
          <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
            You can re-create this guardrail at any time.
          </Typography>
        </Stack>
      </StandardModal>
    </PageHeaderExtended>
  );
}
