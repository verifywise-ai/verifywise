/**
 * ModelLifecycleConfig - Admin UI for managing lifecycle phases and items.
 * Uses VerifyWise styling patterns.
 */

import { useState, useCallback } from "react";
import {
  Stack,
  Typography,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Box,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
  TextField,
  Select,
  MenuItem,
  Switch,
  Chip,
} from "@mui/material";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  X,
  Pencil,
  Check,
  Settings,
} from "lucide-react";
import { LifecycleItem, useLifecycleConfig } from "./useModelLifecycle";
import { apiServices } from "../../../../infrastructure/api/networkServices";

// ============================================================================
// VerifyWise Theme Constants
// ============================================================================

const VW_COLORS = {
  primary: "#13715B",
  primaryDark: "#0F5A47",
  textPrimary: "#1c2130",
  textSecondary: "#344054",
  textTertiary: "#475467",
  textAccent: "#838c99",
  bgMain: "#FFFFFF",
  bgAlt: "#FCFCFD",
  bgFill: "#F4F4F4",
  bgAccent: "#f9fafb",
  borderLight: "#eaecf0",
  borderDark: "#d0d5dd",
  error: "#f04438",
  errorBg: "#FEE2E2",
  success: "#079455",
  successBg: "#ecfdf3",
};

const VW_TYPOGRAPHY = {
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  fontSize: 13,
};

// ============================================================================
// Styled Components
// ============================================================================

const vwButtonPrimary = {
  "textTransform": "none",
  "fontWeight": 500,
  "fontSize": "13px",
  "fontFamily": VW_TYPOGRAPHY.fontFamily,
  "borderRadius": "4px",
  "backgroundColor": VW_COLORS.primary,
  "color": "#fff",
  "&:hover": {
    backgroundColor: VW_COLORS.primaryDark,
  },
};

const vwButtonSecondary = {
  "textTransform": "none",
  "fontWeight": 400,
  "fontSize": "13px",
  "fontFamily": VW_TYPOGRAPHY.fontFamily,
  "borderRadius": "4px",
  "borderColor": VW_COLORS.borderDark,
  "color": VW_COLORS.textSecondary,
  "&:hover": {
    borderColor: VW_COLORS.borderDark,
    backgroundColor: VW_COLORS.bgFill,
  },
};

const vwTextField = {
  "& .MuiOutlinedInput-root": {
    "backgroundColor": VW_COLORS.bgMain,
    "borderRadius": "4px",
    "fontSize": "13px",
    "fontFamily": VW_TYPOGRAPHY.fontFamily,
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: VW_COLORS.borderDark,
      borderWidth: "1px",
    },
    "&:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: VW_COLORS.borderDark,
    },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: VW_COLORS.primary,
      borderWidth: "1px",
    },
  },
};

const vwSelect = {
  "backgroundColor": VW_COLORS.bgMain,
  "borderRadius": "4px",
  "fontSize": "13px",
  "fontFamily": VW_TYPOGRAPHY.fontFamily,
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: VW_COLORS.borderDark,
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: VW_COLORS.borderDark,
  },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: VW_COLORS.primary,
  },
};

const vwAccordion = {
  "border": `1px solid ${VW_COLORS.borderLight}`,
  "borderRadius": "4px !important",
  "&:before": { display: "none" },
  "boxShadow": "none",
  "overflow": "hidden",
};

const vwAccordionSummary = {
  "backgroundColor": VW_COLORS.bgAccent,
  "px": "16px",
  "py": "10px",
  "minHeight": "44px",
  "& .MuiAccordionSummary-expandIconWrapper": {
    transform: "none !important",
    order: -1,
    mr: "10px",
  },
  "& .MuiAccordionSummary-content": {
    margin: 0,
    alignItems: "center",
    gap: "10px",
  },
};

const vwDialog = {
  "& .MuiDialog-paper": {
    borderRadius: "8px",
    backgroundColor: VW_COLORS.bgAlt,
  },
};

// ============================================================================
// Component
// ============================================================================

const ITEM_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Text Area" },
  { value: "documents", label: "Documents" },
  { value: "people", label: "People" },
  { value: "classification", label: "Classification" },
  { value: "checklist", label: "Checklist" },
  { value: "approval", label: "Approval" },
];

export default function ModelLifecycleConfig() {
  const { phases, loading, refresh, setPhases } = useLifecycleConfig(true);
  const [saving, setSaving] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  // New phase form
  const [newPhaseName, setNewPhaseName] = useState("");
  const [newPhaseDesc, setNewPhaseDesc] = useState("");

  // New item form
  const [addingItemForPhase, setAddingItemForPhase] = useState<number | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemType, setNewItemType] = useState("text");
  const [newItemRequired, setNewItemRequired] = useState(false);

  // Delete confirmation
  const [deletePhaseId, setDeletePhaseId] = useState<number | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);

  // Inline editing
  const [editingPhaseId, setEditingPhaseId] = useState<number | null>(null);
  const [editingPhaseName, setEditingPhaseName] = useState("");

  // Expanded phases
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set());

  const toggleExpanded = useCallback((phaseId: number) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }, []);

  // Phase operations
  const handleCreatePhase = useCallback(async () => {
    if (!newPhaseName.trim()) return;
    setSaving(true);
    try {
      await apiServices.post("/extensions/model-lifecycle/phases", {
        name: newPhaseName.trim(),
        description: newPhaseDesc.trim() || undefined,
      });
      setNewPhaseName("");
      setNewPhaseDesc("");
      refresh();
    } catch {
      /* error */
    } finally {
      setSaving(false);
    }
  }, [newPhaseName, newPhaseDesc, refresh]);

  const confirmDeletePhase = useCallback(async () => {
    if (deletePhaseId === null) return;
    setSaving(true);
    try {
      await apiServices.delete(`/extensions/model-lifecycle/phases/${deletePhaseId}`);
      refresh();
    } catch {
      /* error */
    } finally {
      setSaving(false);
      setDeletePhaseId(null);
    }
  }, [deletePhaseId, refresh]);

  const handleMovePhase = useCallback(
    async (phaseId: number, direction: "up" | "down") => {
      const idx = phases.findIndex((p) => p.id === phaseId);
      if (idx < 0) return;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= phases.length) return;

      // Optimistic update
      const oldPhases = [...phases];
      const newPhases = [...phases];
      [newPhases[idx], newPhases[newIdx]] = [newPhases[newIdx], newPhases[idx]];
      setPhases(newPhases);

      const orderedIds = newPhases.map((p) => p.id);
      try {
        await apiServices.put("/extensions/model-lifecycle/phases/reorder", { orderedIds });
      } catch {
        // Revert on error
        setPhases(oldPhases);
      }
    },
    [phases, setPhases],
  );

  const handleRenamePhaseSave = useCallback(
    async (phaseId: number, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) {
        setEditingPhaseId(null);
        return;
      }
      const oldName = phases.find((p) => p.id === phaseId)?.name ?? "";
      if (trimmed === oldName) {
        setEditingPhaseId(null);
        return;
      }

      setPhases((prev) => prev.map((p) => (p.id === phaseId ? { ...p, name: trimmed } : p)));
      setEditingPhaseId(null);
      try {
        await apiServices.put(`/extensions/model-lifecycle/phases/${phaseId}`, { name: trimmed });
      } catch {
        setPhases((prev) => prev.map((p) => (p.id === phaseId ? { ...p, name: oldName } : p)));
      }
    },
    [phases, setPhases],
  );

  const handleTogglePhaseActive = useCallback(
    async (phaseId: number, isActive: boolean) => {
      setPhases((prev) => prev.map((p) => (p.id === phaseId ? { ...p, is_active: isActive } : p)));
      try {
        await apiServices.put(`/extensions/model-lifecycle/phases/${phaseId}`, {
          is_active: isActive,
        });
      } catch {
        setPhases((prev) =>
          prev.map((p) => (p.id === phaseId ? { ...p, is_active: !isActive } : p)),
        );
      }
    },
    [setPhases],
  );

  // Item operations
  const handleCreateItem = useCallback(
    async (phaseId: number) => {
      if (!newItemName.trim()) return;
      setSaving(true);
      try {
        await apiServices.post(`/extensions/model-lifecycle/phases/${phaseId}/items`, {
          name: newItemName.trim(),
          item_type: newItemType,
          is_required: newItemRequired,
        });
        setNewItemName("");
        setNewItemType("text");
        setNewItemRequired(false);
        setAddingItemForPhase(null);
        refresh();
      } catch {
        /* error */
      } finally {
        setSaving(false);
      }
    },
    [newItemName, newItemType, newItemRequired, refresh],
  );

  const confirmDeleteItem = useCallback(async () => {
    if (deleteItemId === null) return;
    setSaving(true);
    try {
      await apiServices.delete(`/extensions/model-lifecycle/items/${deleteItemId}`);
      refresh();
    } catch {
      /* error */
    } finally {
      setSaving(false);
      setDeleteItemId(null);
    }
  }, [deleteItemId, refresh]);

  const handleToggleItemRequired = useCallback(
    async (itemId: number, isRequired: boolean) => {
      setPhases((prev) =>
        prev.map((p) => ({
          ...p,
          items: p.items?.map((i) => (i.id === itemId ? { ...i, is_required: isRequired } : i)),
        })),
      );
      try {
        await apiServices.put(`/extensions/model-lifecycle/items/${itemId}`, {
          is_required: isRequired,
        });
      } catch {
        setPhases((prev) =>
          prev.map((p) => ({
            ...p,
            items: p.items?.map((i) => (i.id === itemId ? { ...i, is_required: !isRequired } : i)),
          })),
        );
      }
    },
    [setPhases],
  );

  const handleMoveItem = useCallback(
    async (phaseId: number, items: LifecycleItem[], itemId: number, direction: "up" | "down") => {
      const idx = items.findIndex((i) => i.id === itemId);
      if (idx < 0) return;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= items.length) return;

      // Optimistic update
      const newItems = [...items];
      [newItems[idx], newItems[newIdx]] = [newItems[newIdx], newItems[idx]];

      setPhases((prev) => prev.map((p) => (p.id === phaseId ? { ...p, items: newItems } : p)));

      const orderedIds = newItems.map((i) => i.id);
      try {
        await apiServices.put(`/extensions/model-lifecycle/phases/${phaseId}/items/reorder`, {
          orderedIds,
        });
      } catch {
        // Revert on error
        setPhases((prev) => prev.map((p) => (p.id === phaseId ? { ...p, items } : p)));
      }
    },
    [setPhases],
  );

  return (
    <>
      <Stack sx={{ gap: "16px" }}>
        {/* Phases Summary */}
        {loading ? (
          <Stack alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={24} sx={{ color: VW_COLORS.primary }} />
          </Stack>
        ) : phases.length === 0 ? (
          <Typography
            sx={{
              fontSize: "13px",
              fontFamily: VW_TYPOGRAPHY.fontFamily,
              color: VW_COLORS.textTertiary,
            }}
          >
            No lifecycle phases configured yet. Click the button below to add phases.
          </Typography>
        ) : (
          <Stack sx={{ gap: "8px" }}>
            <Typography
              sx={{
                fontWeight: 600,
                fontSize: "13px",
                fontFamily: VW_TYPOGRAPHY.fontFamily,
                color: VW_COLORS.textSecondary,
              }}
            >
              Configured Phases ({phases.filter((p) => p.is_active).length} active)
            </Typography>
            {phases.map((phase, idx) => (
              <Box
                key={phase.id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  py: "8px",
                  px: "12px",
                  backgroundColor: phase.is_active ? VW_COLORS.bgAccent : VW_COLORS.bgFill,
                  borderRadius: "4px",
                  border: `1px solid ${VW_COLORS.borderLight}`,
                  opacity: phase.is_active ? 1 : 0.6,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "12px",
                    fontWeight: 600,
                    fontFamily: VW_TYPOGRAPHY.fontFamily,
                    color: VW_COLORS.textAccent,
                    minWidth: "20px",
                  }}
                >
                  {idx + 1}.
                </Typography>
                <Typography
                  sx={{
                    flex: 1,
                    fontSize: "13px",
                    fontWeight: 500,
                    fontFamily: VW_TYPOGRAPHY.fontFamily,
                    color: VW_COLORS.textPrimary,
                  }}
                >
                  {phase.name}
                </Typography>
                <Chip
                  label={`${phase.items?.length || 0} items`}
                  size="small"
                  sx={{
                    fontSize: "11px",
                    fontFamily: VW_TYPOGRAPHY.fontFamily,
                    height: "20px",
                    backgroundColor: VW_COLORS.bgFill,
                    color: VW_COLORS.textTertiary,
                    borderRadius: "4px",
                  }}
                />
                {!phase.is_active && (
                  <Chip
                    label="Inactive"
                    size="small"
                    sx={{
                      fontSize: "11px",
                      fontFamily: VW_TYPOGRAPHY.fontFamily,
                      height: "20px",
                      backgroundColor: VW_COLORS.errorBg,
                      color: VW_COLORS.error,
                      borderRadius: "4px",
                    }}
                  />
                )}
              </Box>
            ))}
          </Stack>
        )}

        {/* Configure Button */}
        <Button
          variant="outlined"
          startIcon={<Settings size={16} />}
          onClick={() => setConfigOpen(true)}
          sx={{ ...vwButtonSecondary, alignSelf: "flex-start" }}
        >
          Configure Phases
        </Button>
      </Stack>

      {/* Configuration Dialog */}
      <Dialog
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        maxWidth="md"
        fullWidth
        sx={vwDialog}
        PaperProps={{ sx: { maxHeight: "85vh" } }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: `1px solid ${VW_COLORS.borderLight}`,
            py: "12px",
            px: "20px",
          }}
        >
          <Typography
            sx={{
              fontWeight: 600,
              fontSize: "16px",
              fontFamily: VW_TYPOGRAPHY.fontFamily,
              color: VW_COLORS.textPrimary,
            }}
          >
            Configure Model Lifecycle
          </Typography>
          <IconButton
            onClick={() => setConfigOpen(false)}
            size="small"
            aria-label="Close"
            sx={{ color: VW_COLORS.textTertiary }}
          >
            <X size={18} />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: "20px" }}>
          {loading && phases.length === 0 ? (
            <Stack alignItems="center" sx={{ py: 4 }}>
              <CircularProgress sx={{ color: VW_COLORS.primary }} />
            </Stack>
          ) : (
            <Stack sx={{ gap: "12px" }}>
              {phases.map((phase, phaseIdx) => (
                <Accordion
                  key={phase.id}
                  expanded={expandedPhases.has(phase.id)}
                  onChange={() => toggleExpanded(phase.id)}
                  disableGutters
                  sx={{
                    ...vwAccordion,
                    opacity: phase.is_active ? 1 : 0.6,
                  }}
                >
                  <AccordionSummary sx={vwAccordionSummary}>
                    <ChevronRight
                      size={16}
                      color={VW_COLORS.textTertiary}
                      style={{
                        transform: expandedPhases.has(phase.id) ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.2s ease",
                      }}
                    />
                    {editingPhaseId === phase.id ? (
                      <Stack
                        direction="row"
                        alignItems="center"
                        sx={{ flex: 1, gap: "6px", mr: "8px" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <TextField
                          value={editingPhaseName}
                          onChange={(e) => setEditingPhaseName(e.target.value)}
                          onBlur={() => handleRenamePhaseSave(phase.id, editingPhaseName)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              handleRenamePhaseSave(phase.id, editingPhaseName);
                            else if (e.key === "Escape") setEditingPhaseId(null);
                          }}
                          autoFocus
                          size="small"
                          sx={{ ...vwTextField, flex: 1 }}
                        />
                        <IconButton
                          size="small"
                          onClick={() => handleRenamePhaseSave(phase.id, editingPhaseName)}
                          aria-label="Save phase name"
                          sx={{ color: VW_COLORS.primary }}
                        >
                          <Check size={16} />
                        </IconButton>
                      </Stack>
                    ) : (
                      <Stack
                        direction="row"
                        alignItems="center"
                        sx={{ "flex": 1, "gap": "6px", "&:hover .phase-edit-icon": { opacity: 1 } }}
                      >
                        <Typography
                          sx={{
                            fontWeight: 600,
                            fontSize: "13px",
                            fontFamily: VW_TYPOGRAPHY.fontFamily,
                            color: VW_COLORS.textPrimary,
                            cursor: "text",
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingPhaseId(phase.id);
                            setEditingPhaseName(phase.name);
                          }}
                        >
                          {phase.name}
                        </Typography>
                        <IconButton
                          className="phase-edit-icon"
                          size="small"
                          sx={{
                            opacity: 0,
                            transition: "opacity 0.2s",
                            p: "2px",
                            color: VW_COLORS.textTertiary,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPhaseId(phase.id);
                            setEditingPhaseName(phase.name);
                          }}
                          aria-label="Edit phase name"
                        >
                          <Pencil size={14} />
                        </IconButton>
                      </Stack>
                    )}
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={phase.is_active}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleTogglePhaseActive(phase.id, e.target.checked);
                          }}
                          sx={{
                            "& .MuiSwitch-switchBase.Mui-checked": {
                              color: VW_COLORS.primary,
                            },
                            "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                              backgroundColor: VW_COLORS.primary,
                            },
                          }}
                        />
                      }
                      label={
                        <Typography
                          sx={{
                            fontSize: "12px",
                            fontFamily: VW_TYPOGRAPHY.fontFamily,
                            color: VW_COLORS.textTertiary,
                          }}
                        >
                          Active
                        </Typography>
                      }
                      onClick={(e) => e.stopPropagation()}
                      sx={{ mr: 0 }}
                    />
                    <IconButton
                      size="small"
                      disabled={phaseIdx === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMovePhase(phase.id, "up");
                      }}
                      aria-label="Move phase up"
                      sx={{ opacity: phaseIdx === 0 ? 0.4 : 1, color: VW_COLORS.textTertiary }}
                    >
                      <ArrowUp size={16} />
                    </IconButton>
                    <IconButton
                      size="small"
                      disabled={phaseIdx === phases.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMovePhase(phase.id, "down");
                      }}
                      aria-label="Move phase down"
                      sx={{
                        opacity: phaseIdx === phases.length - 1 ? 0.4 : 1,
                        color: VW_COLORS.textTertiary,
                      }}
                    >
                      <ArrowDown size={16} />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletePhaseId(phase.id);
                      }}
                      sx={{ color: VW_COLORS.error }}
                      aria-label="Delete phase"
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </AccordionSummary>

                  <AccordionDetails
                    sx={{ px: "16px", py: "12px", backgroundColor: VW_COLORS.bgMain }}
                  >
                    <Stack spacing={0}>
                      {(Array.isArray(phase.items) ? phase.items : []).map((item, itemIdx) => (
                        <Stack
                          key={item.id}
                          direction="row"
                          alignItems="center"
                          sx={{
                            gap: "12px",
                            py: "10px",
                            borderBottom: `1px solid ${VW_COLORS.borderLight}`,
                          }}
                        >
                          <Typography
                            sx={{
                              flex: 1,
                              fontSize: "13px",
                              fontFamily: VW_TYPOGRAPHY.fontFamily,
                              color: VW_COLORS.textSecondary,
                            }}
                          >
                            {item.name}
                          </Typography>
                          <Chip
                            label={item.item_type}
                            size="small"
                            variant="outlined"
                            sx={{
                              fontSize: "11px",
                              fontFamily: VW_TYPOGRAPHY.fontFamily,
                              borderColor: VW_COLORS.borderDark,
                              color: VW_COLORS.textTertiary,
                              borderRadius: "4px",
                            }}
                          />
                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                checked={item.is_required}
                                onChange={(e) =>
                                  handleToggleItemRequired(item.id, e.target.checked)
                                }
                                sx={{
                                  "& .MuiSwitch-switchBase.Mui-checked": {
                                    color: VW_COLORS.primary,
                                  },
                                  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                                    backgroundColor: VW_COLORS.primary,
                                  },
                                }}
                              />
                            }
                            label={
                              <Typography
                                sx={{
                                  fontSize: "11px",
                                  fontFamily: VW_TYPOGRAPHY.fontFamily,
                                  color: VW_COLORS.textTertiary,
                                }}
                              >
                                Required
                              </Typography>
                            }
                            sx={{ mr: 0 }}
                          />
                          <Stack
                            direction="row"
                            alignItems="center"
                            sx={{
                              gap: "4px",
                              pl: "12px",
                              borderLeft: `1px solid ${VW_COLORS.borderLight}`,
                            }}
                          >
                            <IconButton
                              size="small"
                              disabled={itemIdx === 0}
                              onClick={() =>
                                handleMoveItem(phase.id, phase.items ?? [], item.id, "up")
                              }
                              aria-label="Move item up"
                              sx={{
                                opacity: itemIdx === 0 ? 0.4 : 1,
                                color: VW_COLORS.textTertiary,
                              }}
                            >
                              <ArrowUp size={14} />
                            </IconButton>
                            <IconButton
                              size="small"
                              disabled={itemIdx === (phase.items?.length ?? 0) - 1}
                              onClick={() =>
                                handleMoveItem(phase.id, phase.items ?? [], item.id, "down")
                              }
                              aria-label="Move item down"
                              sx={{
                                opacity: itemIdx === (phase.items?.length ?? 0) - 1 ? 0.4 : 1,
                                color: VW_COLORS.textTertiary,
                              }}
                            >
                              <ArrowDown size={14} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => setDeleteItemId(item.id)}
                              sx={{ color: VW_COLORS.error }}
                              aria-label="Delete item"
                            >
                              <Trash2 size={14} />
                            </IconButton>
                          </Stack>
                        </Stack>
                      ))}

                      {addingItemForPhase === phase.id ? (
                        <Stack direction="row" sx={{ gap: "8px", pt: "12px" }} alignItems="center">
                          <TextField
                            placeholder="Item name"
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            size="small"
                            sx={{ ...vwTextField, flex: 1 }}
                          />
                          <Select
                            value={newItemType}
                            onChange={(e) => setNewItemType(e.target.value)}
                            size="small"
                            sx={{ ...vwSelect, minWidth: 120 }}
                          >
                            {ITEM_TYPES.map((t) => (
                              <MenuItem key={t.value} value={t.value} sx={{ fontSize: "13px" }}>
                                {t.label}
                              </MenuItem>
                            ))}
                          </Select>
                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                checked={newItemRequired}
                                onChange={(e) => setNewItemRequired(e.target.checked)}
                                sx={{
                                  "& .MuiSwitch-switchBase.Mui-checked": {
                                    color: VW_COLORS.primary,
                                  },
                                  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                                    backgroundColor: VW_COLORS.primary,
                                  },
                                }}
                              />
                            }
                            label={
                              <Typography
                                sx={{
                                  fontSize: "11px",
                                  fontFamily: VW_TYPOGRAPHY.fontFamily,
                                  color: VW_COLORS.textTertiary,
                                }}
                              >
                                Req
                              </Typography>
                            }
                            sx={{ ml: "4px" }}
                          />
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => handleCreateItem(phase.id)}
                            disabled={!newItemName.trim() || saving}
                            sx={vwButtonPrimary}
                          >
                            Add
                          </Button>
                          <Button
                            variant="text"
                            size="small"
                            onClick={() => {
                              setAddingItemForPhase(null);
                              setNewItemName("");
                            }}
                            sx={{ ...vwButtonSecondary, border: "none" }}
                          >
                            Cancel
                          </Button>
                        </Stack>
                      ) : (
                        <Button
                          variant="text"
                          size="small"
                          startIcon={<Plus size={14} />}
                          onClick={() => setAddingItemForPhase(phase.id)}
                          sx={{
                            "alignSelf": "flex-start",
                            "mt": "12px",
                            "textTransform": "none",
                            "fontSize": "13px",
                            "fontFamily": VW_TYPOGRAPHY.fontFamily,
                            "color": VW_COLORS.primary,
                            "&:hover": {
                              backgroundColor: VW_COLORS.bgAccent,
                            },
                          }}
                        >
                          Add item
                        </Button>
                      )}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              ))}

              {/* Add new phase */}
              <Box
                sx={{
                  border: `1px dashed ${VW_COLORS.borderDark}`,
                  borderRadius: "4px",
                  p: "16px",
                  backgroundColor: VW_COLORS.bgMain,
                }}
              >
                <Typography
                  sx={{
                    fontWeight: 600,
                    fontSize: "13px",
                    fontFamily: VW_TYPOGRAPHY.fontFamily,
                    color: VW_COLORS.textSecondary,
                    mb: "12px",
                  }}
                >
                  Add new phase
                </Typography>
                <Stack sx={{ gap: "10px" }}>
                  <TextField
                    placeholder="Phase name"
                    value={newPhaseName}
                    onChange={(e) => setNewPhaseName(e.target.value)}
                    size="small"
                    fullWidth
                    sx={vwTextField}
                  />
                  <TextField
                    placeholder="Description (optional)"
                    value={newPhaseDesc}
                    onChange={(e) => setNewPhaseDesc(e.target.value)}
                    size="small"
                    multiline
                    rows={2}
                    fullWidth
                    sx={vwTextField}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<Plus size={14} />}
                    onClick={handleCreatePhase}
                    disabled={!newPhaseName.trim() || saving}
                    sx={{ ...vwButtonPrimary, alignSelf: "flex-start" }}
                  >
                    Create phase
                  </Button>
                </Stack>
              </Box>
            </Stack>
          )}
        </DialogContent>

        <DialogActions
          sx={{
            px: "20px",
            py: "12px",
            borderTop: `1px solid ${VW_COLORS.borderLight}`,
          }}
        >
          <Button variant="outlined" onClick={() => setConfigOpen(false)} sx={vwButtonSecondary}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete phase confirmation */}
      <Dialog open={deletePhaseId !== null} onClose={() => setDeletePhaseId(null)} sx={vwDialog}>
        <DialogTitle
          sx={{
            fontWeight: 600,
            fontSize: "16px",
            fontFamily: VW_TYPOGRAPHY.fontFamily,
            color: VW_COLORS.textPrimary,
          }}
        >
          Delete phase
        </DialogTitle>
        <DialogContent>
          <Typography
            sx={{
              fontSize: "13px",
              fontFamily: VW_TYPOGRAPHY.fontFamily,
              color: VW_COLORS.textSecondary,
            }}
          >
            Delete this phase and all its items? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: "20px", py: "12px" }}>
          <Button onClick={() => setDeletePhaseId(null)} sx={vwButtonSecondary}>
            Cancel
          </Button>
          <Button
            onClick={confirmDeletePhase}
            variant="contained"
            disabled={saving}
            sx={{
              ...vwButtonPrimary,
              "backgroundColor": VW_COLORS.error,
              "&:hover": { backgroundColor: "#dc2626" },
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete item confirmation */}
      <Dialog open={deleteItemId !== null} onClose={() => setDeleteItemId(null)} sx={vwDialog}>
        <DialogTitle
          sx={{
            fontWeight: 600,
            fontSize: "16px",
            fontFamily: VW_TYPOGRAPHY.fontFamily,
            color: VW_COLORS.textPrimary,
          }}
        >
          Delete item
        </DialogTitle>
        <DialogContent>
          <Typography
            sx={{
              fontSize: "13px",
              fontFamily: VW_TYPOGRAPHY.fontFamily,
              color: VW_COLORS.textSecondary,
            }}
          >
            Delete this item? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: "20px", py: "12px" }}>
          <Button onClick={() => setDeleteItemId(null)} sx={vwButtonSecondary}>
            Cancel
          </Button>
          <Button
            onClick={confirmDeleteItem}
            variant="contained"
            disabled={saving}
            sx={{
              ...vwButtonPrimary,
              "backgroundColor": VW_COLORS.error,
              "&:hover": { backgroundColor: "#dc2626" },
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
