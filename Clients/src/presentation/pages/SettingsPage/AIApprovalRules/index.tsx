import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Stack,
  Typography,
  Chip,
  Switch,
  IconButton,
  Alert,
  CircularProgress,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Shield, Trash2, Plus, Edit2, Info } from "lucide-react";
import {
  listApprovalRules,
  createApprovalRule,
  updateApprovalRule,
  deleteApprovalRule,
  type ApprovalRule,
} from "../../../../application/repository/aiApprovalRules.repository";

const EVENT_TYPE_COLORS: Record<string, "success" | "warning" | "error"> = {
  "auto-approve": "success",
  "require-approval": "warning",
  "auto-reject": "error",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  "auto-approve": "Auto-Approve",
  "require-approval": "Require Approval",
  "auto-reject": "Auto-Reject",
};

export default function AIApprovalRules() {
  const theme = useTheme();
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<ApprovalRule> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listApprovalRules();
      setRules(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("Failed to load approval rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleToggle = async (rule: ApprovalRule) => {
    if (rule.is_default || !rule.id) return;
    try {
      await updateApprovalRule(rule.id, { is_active: !rule.is_active });
      fetchRules();
    } catch {
      setError("Failed to toggle rule");
    }
  };

  const handleDelete = async (rule: ApprovalRule) => {
    if (rule.is_default || !rule.id) return;
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await deleteApprovalRule(rule.id);
      fetchRules();
    } catch {
      setError("Failed to delete rule");
    }
  };

  const openCreateDialog = () => {
    setEditingRule({
      name: "",
      description: "",
      conditions: { all: [{ fact: "risk_level", operator: "equal", value: "info" }] },
      event_type: "auto-approve",
      event_params: {},
      priority: 100,
    });
    setEditDialogOpen(true);
  };

  const openEditDialog = (rule: ApprovalRule) => {
    if (rule.is_default) return;
    setEditingRule({ ...rule });
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingRule?.name || !editingRule?.conditions || !editingRule?.event_type) return;
    setSaving(true);
    try {
      if (editingRule.id) {
        await updateApprovalRule(editingRule.id, editingRule);
      } else {
        await createApprovalRule(editingRule);
      }
      setEditDialogOpen(false);
      setEditingRule(null);
      fetchRules();
    } catch {
      setError("Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  const formatConditions = (conditions: Record<string, unknown>): string => {
    const arr = (conditions.all || conditions.any) as
      | Array<{ fact: string; operator: string; value: unknown }>
      | undefined;
    if (!arr || !Array.isArray(arr)) return "No conditions";
    return arr
      .map((c) => `${c.fact} ${c.operator} ${JSON.stringify(c.value)}`)
      .join(conditions.all ? " AND " : " OR ");
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={8}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3} sx={{ py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Shield size={22} color={theme.palette.primary.main} />
          <Typography variant="h6" fontWeight={600}>
            AI Approval Rules
          </Typography>
        </Stack>
        <Tooltip title="Create a custom rule">
          <IconButton
            onClick={openCreateDialog}
            sx={{
              "bgcolor": theme.palette.primary.main,
              "color": "#fff",
              "&:hover": { bgcolor: theme.palette.primary.dark },
              "borderRadius": 2,
              "px": 2,
            }}
          >
            <Plus size={16} />
            <Typography variant="body2" sx={{ ml: 0.5 }}>
              Add Rule
            </Typography>
          </IconButton>
        </Tooltip>
      </Stack>

      <Alert severity="info" icon={<Info size={18} />}>
        Rules determine whether AI write operations are auto-approved, require human approval, or
        are auto-rejected. Higher priority rules are evaluated first. Default rules cannot be edited
        but can be overridden by creating a custom rule with the same name.
      </Alert>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Stack spacing={1.5}>
        {rules.map((rule, idx) => (
          <Box
            key={rule.id || `default-${idx}`}
            sx={{
              p: 2,
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: rule.is_active
                ? theme.palette.background.paper
                : theme.palette.action.disabledBackground,
              opacity: rule.is_active ? 1 : 0.6,
              transition: "all 0.2s",
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={1.5} flex={1}>
                <Chip
                  label={EVENT_TYPE_LABELS[rule.event_type] || rule.event_type}
                  color={EVENT_TYPE_COLORS[rule.event_type] || "default"}
                  size="small"
                  sx={{ fontWeight: 600, minWidth: 130 }}
                />
                <Stack spacing={0.25} flex={1}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {rule.name}
                    </Typography>
                    {rule.is_default && (
                      <Chip
                        label="Default"
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: 11 }}
                      />
                    )}
                    <Typography variant="caption" color="text.secondary">
                      Priority: {rule.priority}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {rule.description}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontFamily: "monospace", fontSize: 11 }}
                  >
                    {formatConditions(rule.conditions)}
                  </Typography>
                </Stack>
              </Stack>

              <Stack direction="row" alignItems="center" spacing={0.5}>
                {!rule.is_default && (
                  <>
                    <Switch
                      checked={rule.is_active}
                      onChange={() => handleToggle(rule)}
                      size="small"
                    />
                    <IconButton size="small" onClick={() => openEditDialog(rule)}>
                      <Edit2 size={14} />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(rule)} color="error">
                      <Trash2 size={14} />
                    </IconButton>
                  </>
                )}
              </Stack>
            </Stack>
          </Box>
        ))}

        {rules.length === 0 && (
          <Typography color="text.secondary" textAlign="center" py={4}>
            No approval rules configured.
          </Typography>
        )}
      </Stack>

      {/* Create/Edit Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingRule?.id ? "Edit Rule" : "Create Rule"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Name"
              value={editingRule?.name || ""}
              onChange={(e) =>
                setEditingRule((prev) => (prev ? { ...prev, name: e.target.value } : prev))
              }
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={editingRule?.description || ""}
              onChange={(e) =>
                setEditingRule((prev) => (prev ? { ...prev, description: e.target.value } : prev))
              }
              fullWidth
              multiline
              rows={2}
            />
            <FormControl fullWidth>
              <InputLabel>Decision</InputLabel>
              <Select
                value={editingRule?.event_type || "require-approval"}
                onChange={(e) =>
                  setEditingRule((prev) =>
                    prev
                      ? { ...prev, event_type: e.target.value as ApprovalRule["event_type"] }
                      : prev,
                  )
                }
                label="Decision"
              >
                <MenuItem value="auto-approve">Auto-Approve</MenuItem>
                <MenuItem value="require-approval">Require Approval</MenuItem>
                <MenuItem value="auto-reject">Auto-Reject</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Priority"
              type="number"
              value={editingRule?.priority || 100}
              onChange={(e) =>
                setEditingRule((prev) =>
                  prev ? { ...prev, priority: Number(e.target.value) } : prev,
                )
              }
              fullWidth
              helperText="Higher priority rules are evaluated first (1000 = highest)"
            />
            <TextField
              label="Conditions (JSON)"
              value={JSON.stringify(editingRule?.conditions || {}, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  setEditingRule((prev) => (prev ? { ...prev, conditions: parsed } : prev));
                } catch {
                  // Allow invalid JSON while typing
                }
              }}
              fullWidth
              multiline
              rows={6}
              InputProps={{ sx: { fontFamily: "monospace", fontSize: 13 } }}
              helperText='Use {"all": [...]} or {"any": [...]}. Facts: operation_type, risk_level, tool_category, user_role, entity_count, is_bulk'
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <IconButton onClick={() => setEditDialogOpen(false)} sx={{ borderRadius: 2, px: 2 }}>
            <Typography variant="body2">Cancel</Typography>
          </IconButton>
          <IconButton
            onClick={handleSave}
            disabled={saving || !editingRule?.name}
            sx={{
              "bgcolor": theme.palette.primary.main,
              "color": "#fff",
              "&:hover": { bgcolor: theme.palette.primary.dark },
              "borderRadius": 2,
              "px": 2,
            }}
          >
            {saving ? (
              <CircularProgress size={16} />
            ) : (
              <Typography variant="body2">Save</Typography>
            )}
          </IconButton>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
