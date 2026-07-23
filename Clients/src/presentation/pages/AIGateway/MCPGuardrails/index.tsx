import { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Typography, Stack, IconButton } from "@mui/material";
import {
  CirclePlus,
  ShieldCheck,
  Trash2,
  Pencil,
  Shield,
  ScanLine,
  Lock,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
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
import MCPTable from "../MCPTable";
import CustomizableSkeleton from "../../../components/Skeletons";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MCPGuardrail {
  id: number;
  name: string;
  rule_type: "pii" | "content_filter" | "prompt_injection" | "require_approval";
  action: "block" | "mask" | "require_approval";
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
  { _id: "require_approval", name: "Require approval" },
];

const ACTION_ITEMS = [
  { _id: "block", name: "Block" },
  { _id: "mask", name: "Mask" },
];

const SCOPE_ITEMS = [{ _id: "tool_input", name: "Tool input" }];

const RULE_TYPE_VARIANTS: Record<string, "info" | "warning" | "success" | "error"> = {
  pii: "info",
  content_filter: "warning",
  prompt_injection: "success",
  require_approval: "error",
};

const RULE_TYPE_LABELS: Record<string, string> = {
  pii: "PII",
  content_filter: "Content filter",
  prompt_injection: "Prompt injection",
  require_approval: "Require approval",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function MCPGuardrailsPage() {
  const [rules, setRules] = useState<MCPGuardrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiServices.get<Record<string, any>>("/ai-gateway/mcp/guardrails");
      setRules(res?.data?.data || []);
    } catch {
      setLoadError("Failed to load guardrails. Please try again.");
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
    const isApproval = rule.rule_type === "require_approval";
    setForm({
      name: rule.name || "",
      rule_type: rule.rule_type || "pii",
      // require_approval rules use a sentinel action; don't seed block/mask for them
      action: isApproval ? "require_approval" : rule.action || "block",
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

    // require_approval rules use a backend-enforced sentinel; never send block/mask for them
    const isApprovalRule = form.rule_type === "require_approval";

    const payload = {
      name: form.name,
      rule_type: form.rule_type,
      action: isApprovalRule ? "require_approval" : form.action,
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

  const renderToolBadges = (tools: string[]) => (
    <Stack direction="row" gap="4px" flexWrap="wrap">
      {tools.map((tool) => (
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
  );

  return (
    <PageHeaderExtended
      title="Guardrails"
      description="Scan agent tool calls, MCP and native tools like Bash, for PII, prohibited content or prompt injection, then block or mask what matches."
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
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Shield}
          message="No guardrail rules configured yet. Add rules to scan agent tool calls for PII, prohibited content, or prompt injection attempts."
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
        <Box sx={{ px: 3, pb: 3 }}>
          <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mb: "12px" }}>
            {rules.length} rule{rules.length !== 1 ? "s" : ""} configured, {activeCount} active
          </Typography>
          <MCPTable
            id="mcp-guardrails-table"
            columns={[
              { label: "Name", width: 200 },
              { label: "Type", width: 140 },
              { label: "Action", width: 90 },
              { label: "Scope", width: 110 },
              { label: "Tools" },
              { label: "Active", width: 80, align: "center" },
              { label: "", width: 70, align: "right" },
            ]}
            rows={rules}
            rowKey={(rule) => rule.id}
            onRowClick={(rule) => openEditModal(rule)}
            rowSx={(rule) => ({ opacity: rule.is_active ? 1 : 0.6 })}
            renderRow={(rule) => [
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{rule.name}</Typography>,
              <Chip
                label={RULE_TYPE_LABELS[rule.rule_type] || rule.rule_type}
                size="small"
                variant={RULE_TYPE_VARIANTS[rule.rule_type] || "info"}
              />,
              rule.rule_type !== "require_approval" ? (
                <Chip label={rule.action === "block" ? "Block" : "Mask"} size="small" />
              ) : (
                <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>—</Typography>
              ),
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                {rule.scope || "tool_input"}
              </Typography>,
              rule.applies_to_tools && rule.applies_to_tools.length > 0 ? (
                renderToolBadges(rule.applies_to_tools)
              ) : (
                <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                  All tools
                </Typography>
              ),
              <Box
                sx={{ display: "flex", justifyContent: "center" }}
                onClick={(e) => e.stopPropagation()}
              >
                <Toggle
                  checked={rule.is_active}
                  onChange={() => handleToggle(rule.id, rule.is_active)}
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
                <IconButton
                  size="small"
                  onClick={() => openEditModal(rule)}
                  sx={{ p: 0.5 }}
                  aria-label="Edit guardrail"
                >
                  <Pencil size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setDeleteTarget(rule)}
                  sx={{ p: 0.5 }}
                  aria-label="Delete guardrail"
                >
                  <Trash2 size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                </IconButton>
              </Stack>,
            ]}
          />
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
            : "Configure a new guardrail rule for agent tool calls."
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
            onChange={(e) => {
              const newType = e.target.value as string;
              setForm((p) => ({
                ...p,
                rule_type: newType,
                // Reset action: approval uses its own sentinel; others default to block
                action: newType === "require_approval" ? "require_approval" : "block",
              }));
            }}
            getOptionValue={(item) => item._id}
          />

          {form.rule_type === "require_approval" ? (
            <Typography
              sx={{
                fontSize: 12,
                color: palette.status.warning?.text || palette.text.tertiary,
                lineHeight: 1.5,
              }}
            >
              Matching tool calls will be paused and routed to a human approver before execution. No
              block or mask action is needed. Approval is enforced automatically.
            </Typography>
          ) : (
            <Select
              id="action"
              label="Action"
              placeholder="Select action"
              value={form.action}
              items={ACTION_ITEMS}
              onChange={(e) => setForm((p) => ({ ...p, action: e.target.value as string }))}
              getOptionValue={(item) => item._id}
            />
          )}

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
            placeholder={'{\n  "entities": {\n    "EMAIL_ADDRESS": "mask"\n  }\n}'}
            value={form.config}
            onChange={(e) => setForm((p) => ({ ...p, config: e.target.value }))}
            rows={4}
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
            This action takes effect immediately. Agent tool calls will no longer be checked against
            this rule.
          </Typography>
          <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
            You can re-create this guardrail at any time.
          </Typography>
        </Stack>
      </StandardModal>
    </PageHeaderExtended>
  );
}
