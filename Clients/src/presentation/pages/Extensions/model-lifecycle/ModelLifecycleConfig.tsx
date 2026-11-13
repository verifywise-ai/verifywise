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
import {
  background,
  border,
  brand,
  editor,
  icon,
  status,
  text,
  radiusPx,
} from "../../../themes/palette";
import { textStyles } from "../../../../presentation/themes/typography";
import { CustomizableButton } from "../../../components/button/customizable-button";

// ============================================================================
// VerifyWise Theme Constants
// ============================================================================

const VW_COLORS = {
  primary: brand.primary,
  primaryDark: brand.primaryHover,
  textPrimary: text.primary,
  textSecondary: text.secondary,
  textTertiary: text.tertiary,
  textAccent: text.accent,
  bgMain: background.main,

  bgAccent: background.alt,
  error: icon.error,
  errorBg: editor.imageErrorBg,
  success: status.success.strong,
};

const VW_TYPOGRAPHY = {
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  fontSize: 13,
};

// ============================================================================
// Styled Components
// ============================================================================

const vwTextField = {
  "& .MuiOutlinedInput-root": {
    "backgroundColor": VW_COLORS.bgMain,
    "borderRadius": radiusPx.sm,
    ...textStyles.body,
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: border.dark,
      borderWidth: "1px",
    },
    "&:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: border.dark,
    },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: VW_COLORS.primary,
      borderWidth: "1px",
    },
  },
};

const vwSelect = {
  "backgroundColor": VW_COLORS.bgMain,
  "borderRadius": radiusPx.sm,
  ...textStyles.body,
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: border.dark,
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: border.dark,
  },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: VW_COLORS.primary,
  },
};

const vwAccordion = {
  "border": `1px solid ${border.light}`,
  "borderRadius": "4px !important",
  "&:before": { display: "none" },
  "boxShadow": "none",
  "overflow": "hidden",
};

const vwAccordionSummary = {
  "backgroundColor": VW_COLORS.bgAccent,
  "px": 8,
  "py": 4,
  "minHeight": 20,
  "& .MuiAccordionSummary-expandIconWrapper": {
    transform: "none !important",
    order: -1,
    mr: 4,
  },
  "& .MuiAccordionSummary-content": {
    margin: 0,
    alignItems: "center",
    gap: 4,
  },
};

const vwDialog = {
  "& .MuiDialog-paper": {
    borderRadius: "8px",
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
      <Stack sx={{ gap: 8 }}>
        {/* Phases Summary */}
        {loading ? (
          <Stack alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={24} sx={{ color: VW_COLORS.primary }} />
          </Stack>
        ) : phases.length === 0 ? (
          <Typography
            sx={{
              ...textStyles.body,
              color: VW_COLORS.textTertiary,
            }}
          >
            No lifecycle phases configured yet. Click the button below to add phases.
          </Typography>
        ) : (
          <Stack sx={{ gap: 4 }}>
            <Typography
              sx={{
                ...textStyles.subsectionTitle,
                color: text.primary,
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
                  gap: 6,
                  py: 4,
                  px: 6,
                  backgroundColor: phase.is_active ? VW_COLORS.bgAccent : background.main,
                  borderRadius: radiusPx.sm,
                  border: `1px solid ${border.light}`,
                  opacity: phase.is_active ? 1 : 0.6,
                }}
              >
                <Typography
                  sx={{
                    ...textStyles.formLabel,

                    color: text.subdued,
                    minWidth: 10,
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
                    height: 10,
                    backgroundColor: background.main,
                    color: VW_COLORS.textTertiary,
                    borderRadius: radiusPx.sm,
                  }}
                />
                {!phase.is_active && (
                  <Chip
                    label="Inactive"
                    size="small"
                    sx={{
                      fontSize: "11px",
                      fontFamily: VW_TYPOGRAPHY.fontFamily,
                      height: 10,
                      backgroundColor: status.error.bg,
                      color: status.error.text,
                      borderRadius: radiusPx.sm,
                    }}
                  />
                )}
              </Box>
            ))}
          </Stack>
        )}

        {/* Configure Button */}
        <CustomizableButton
          variant="outlined"
          color="secondary"
          startIcon={<Settings size={16} />}
          onClick={() => setConfigOpen(true)}
          sx={{ alignSelf: "flex-start" }}
        >
          Configure Phases
        </CustomizableButton>
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
            borderBottom: `1px solid ${border.light}`,
            py: 6,
            px: 10,
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

        <DialogContent sx={{ p: 10 }}>
          {loading && phases.length === 0 ? (
            <Stack alignItems="center" sx={{ py: 4 }}>
              <CircularProgress sx={{ color: VW_COLORS.primary }} />
            </Stack>
          ) : (
            <Stack sx={{ gap: 6 }}>
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
                        sx={{ flex: 1, gap: 2, mr: 4 }}
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
                        sx={{ "flex": 1, "gap": 4, "&:hover .phase-edit-icon": { opacity: 1 } }}
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
                            p: 1,
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

                  <AccordionDetails sx={{ px: 8, py: 6, backgroundColor: VW_COLORS.bgMain }}>
                    <Stack spacing={0}>
                      {(Array.isArray(phase.items) ? phase.items : []).map((item, itemIdx) => (
                        <Stack
                          key={item.id}
                          direction="row"
                          alignItems="center"
                          sx={{
                            gap: 6,
                            py: 4,
                            borderBottom: `1px solid ${border.light}`,
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
                              borderColor: border.dark,
                              color: VW_COLORS.textTertiary,
                              borderRadius: radiusPx.sm,
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
                              gap: 2,
                              pl: 6,
                              borderLeft: `1px solid ${border.light}`,
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
                        <Stack direction="row" sx={{ gap: 4, pt: 6 }} alignItems="center">
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
                          <CustomizableButton
                            variant="contained"
                            size="small"
                            onClick={() => handleCreateItem(phase.id)}
                            disabled={!newItemName.trim() || saving}
                          >
                            Add
                          </CustomizableButton>
                          <CustomizableButton
                            variant="text"
                            color="secondary"
                            size="small"
                            onClick={() => {
                              setAddingItemForPhase(null);
                              setNewItemName("");
                            }}
                          >
                            Cancel
                          </CustomizableButton>
                        </Stack>
                      ) : (
                        <CustomizableButton
                          variant="text"
                          color="primary"
                          size="small"
                          startIcon={<Plus size={14} />}
                          onClick={() => setAddingItemForPhase(phase.id)}
                          sx={{
                            alignSelf: "flex-start",
                            mt: 6,
                            textTransform: "none",
                          }}
                        >
                          Add item
                        </CustomizableButton>
                      )}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              ))}

              {/* Add new phase */}
              <Box
                sx={{
                  border: `1px dashed ${border.dark}`,
                  borderRadius: 2,
                  p: 8,
                  backgroundColor: VW_COLORS.bgMain,
                }}
              >
                <Typography
                  sx={{
                    ...textStyles.subsectionTitle,
                    fontSize: "13px",
                    color: text.primary,
                    mb: 6,
                  }}
                >
                  Add new phase
                </Typography>
                <Stack sx={{ gap: 4 }}>
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
                  <CustomizableButton
                    variant="contained"
                    size="medium"
                    startIcon={<Plus size={14} />}
                    onClick={handleCreatePhase}
                    disabled={!newPhaseName.trim() || saving}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Create phase
                  </CustomizableButton>
                </Stack>
              </Box>
            </Stack>
          )}
        </DialogContent>

        <DialogActions
          sx={{
            px: 10,
            py: 6,
            borderTop: `1px solid ${border.light}`,
          }}
        >
          <CustomizableButton
            variant="outlined"
            color="secondary"
            onClick={() => setConfigOpen(false)}
          >
            Close
          </CustomizableButton>
        </DialogActions>
      </Dialog>

      {/* Delete phase confirmation */}
      <Dialog open={deletePhaseId !== null} onClose={() => setDeletePhaseId(null)} sx={vwDialog}>
        <DialogTitle
          sx={{
            ...textStyles.cardTitle,
            color: text.primary,
          }}
        >
          Delete phase
        </DialogTitle>
        <DialogContent>
          <Typography
            sx={{
              ...textStyles.body,
              color: text.primary,
            }}
          >
            Delete this phase and all its items? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 10, py: 6 }}>
          <CustomizableButton
            onClick={() => setDeletePhaseId(null)}
            variant="text"
            color="secondary"
          >
            Cancel
          </CustomizableButton>
          <CustomizableButton
            onClick={confirmDeletePhase}
            variant="contained"
            color="error"
            disabled={saving}
          >
            Delete
          </CustomizableButton>
        </DialogActions>
      </Dialog>

      {/* Delete item confirmation */}
      <Dialog open={deleteItemId !== null} onClose={() => setDeleteItemId(null)} sx={vwDialog}>
        <DialogTitle
          sx={{
            ...textStyles.cardTitle,
            color: text.primary,
          }}
        >
          Delete item
        </DialogTitle>
        <DialogContent>
          <Typography
            sx={{
              ...textStyles.body,
              color: text.primary,
            }}
          >
            Delete this item? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 6, py: 6 }}>
          <CustomizableButton
            onClick={() => setDeleteItemId(null)}
            variant="text"
            color="secondary"
          >
            Cancel
          </CustomizableButton>
          <CustomizableButton
            onClick={confirmDeleteItem}
            variant="contained"
            color="error"
            disabled={saving}
          >
            Delete
          </CustomizableButton>
        </DialogActions>
      </Dialog>
    </>
  );
}
