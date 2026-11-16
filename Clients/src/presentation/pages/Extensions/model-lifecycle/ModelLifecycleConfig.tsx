/**
 * ModelLifecycleConfig - Admin UI for managing lifecycle phases and items.
 * Uses VerifyWise styling patterns.
 */

import { useState, useCallback } from "react";
import {
  Stack,
  Typography,
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
  Pencil,
  Check,
  Settings,
} from "lucide-react";
import { LifecycleItem, useLifecycleConfig } from "./useModelLifecycle";
import { useCan } from "../../../../application/hooks/useCan";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { background, border, brand, status, text, radiusPx } from "../../../themes/palette";
import { textStyles } from "../../../../presentation/themes/typography";
import { CustomizableButton } from "../../../components/button/customizable-button";
import StandardModal from "../../../components/Modals/StandardModal";

// ============================================================================
// Styled Components
// ============================================================================

const vwTextField = {
  "& .MuiOutlinedInput-root": {
    "backgroundColor": background.main,
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
      borderColor: brand.primary,
      borderWidth: "1px",
    },
  },
};

const vwSelect = {
  "backgroundColor": background.main,
  "borderRadius": radiusPx.sm,
  ...textStyles.body,
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: border.dark,
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: border.dark,
  },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: brand.primary,
  },
};

const vwSwitch = {
  "& .MuiSwitch-switchBase.Mui-checked": {
    color: brand.primary,
  },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
    backgroundColor: brand.primary,
  },
};

const vwAccordion = {
  "border": `1px solid ${border.light}`,
  "borderRadius": `${radiusPx.sm} !important`,
  "&:before": { display: "none" },
  "boxShadow": "none",
  "overflow": "hidden",
};

const vwAccordionSummary = {
  "backgroundColor": background.alt,
  "px": "16px",
  "py": "8px",
  "minHeight": 20,
  "& .MuiAccordionSummary-expandIconWrapper": {
    transform: "none !important",
    order: -1,
    mr: "8px",
  },
  "& .MuiAccordionSummary-content": {
    margin: 0,
    alignItems: "center",
    gap: "8px",
  },
};

const vwChip = {
  ...textStyles.caption,
  borderRadius: radiusPx.sm,
};

const iconButtonSx = { color: text.tertiary };
const deleteIconButtonSx = { color: status.error.text };

// ============================================================================
// Component
// ============================================================================

const ITEM_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Text area" },
  { value: "documents", label: "Documents" },
  { value: "people", label: "People" },
  { value: "classification", label: "Classification" },
  { value: "checklist", label: "Checklist" },
  { value: "approval", label: "Approval" },
];

const itemTypeLabel = (value: string) => ITEM_TYPES.find((t) => t.value === value)?.label ?? value;

export default function ModelLifecycleConfig() {
  const { phases, loading, refresh, setPhases } = useLifecycleConfig(true);
  // Phase and item setup is an extension.admin action on the server.
  const canConfigure = useCan("extension.admin");
  const [saving, setSaving] = useState(false);
  // Set when a phase or item write fails, shown at the top of the dialog
  // until the next write starts. The global error toast carries the reason;
  // the forms keep what was typed and optimistic edits are rolled back.
  const [saveFailed, setSaveFailed] = useState(false);
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
    setSaveFailed(false);
    try {
      await apiServices.post("/extensions/model-lifecycle/phases", {
        name: newPhaseName.trim(),
        description: newPhaseDesc.trim() || undefined,
      });
      setNewPhaseName("");
      setNewPhaseDesc("");
      refresh();
    } catch {
      // The name and description stay in the form for another try.
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }, [newPhaseName, newPhaseDesc, refresh]);

  const confirmDeletePhase = useCallback(async () => {
    if (deletePhaseId === null) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await apiServices.delete(`/extensions/model-lifecycle/phases/${deletePhaseId}`);
      refresh();
    } catch {
      setSaveFailed(true);
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
      setSaveFailed(false);
      try {
        await apiServices.put("/extensions/model-lifecycle/phases/reorder", { orderedIds });
      } catch {
        // Revert on error
        setPhases(oldPhases);
        setSaveFailed(true);
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
      setSaveFailed(false);
      try {
        await apiServices.put(`/extensions/model-lifecycle/phases/${phaseId}`, { name: trimmed });
      } catch {
        setPhases((prev) => prev.map((p) => (p.id === phaseId ? { ...p, name: oldName } : p)));
        setSaveFailed(true);
      }
    },
    [phases, setPhases],
  );

  const handleTogglePhaseActive = useCallback(
    async (phaseId: number, isActive: boolean) => {
      setPhases((prev) => prev.map((p) => (p.id === phaseId ? { ...p, is_active: isActive } : p)));
      setSaveFailed(false);
      try {
        await apiServices.put(`/extensions/model-lifecycle/phases/${phaseId}`, {
          is_active: isActive,
        });
      } catch {
        setPhases((prev) =>
          prev.map((p) => (p.id === phaseId ? { ...p, is_active: !isActive } : p)),
        );
        setSaveFailed(true);
      }
    },
    [setPhases],
  );

  // Item operations
  const handleCreateItem = useCallback(
    async (phaseId: number) => {
      if (!newItemName.trim()) return;
      setSaving(true);
      setSaveFailed(false);
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
        // The new item form stays open with what was entered.
        setSaveFailed(true);
      } finally {
        setSaving(false);
      }
    },
    [newItemName, newItemType, newItemRequired, refresh],
  );

  const confirmDeleteItem = useCallback(async () => {
    if (deleteItemId === null) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await apiServices.delete(`/extensions/model-lifecycle/items/${deleteItemId}`);
      refresh();
    } catch {
      setSaveFailed(true);
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
      setSaveFailed(false);
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
        setSaveFailed(true);
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
      setSaveFailed(false);
      try {
        await apiServices.put(`/extensions/model-lifecycle/phases/${phaseId}/items/reorder`, {
          orderedIds,
        });
      } catch {
        // Revert on error
        setPhases((prev) => prev.map((p) => (p.id === phaseId ? { ...p, items } : p)));
        setSaveFailed(true);
      }
    },
    [setPhases],
  );

  // Cancel, the close icon and Escape wait while a write is in flight.
  const closeConfig = () => {
    if (!saving) setConfigOpen(false);
  };
  const cancelDeletePhase = () => {
    if (!saving) setDeletePhaseId(null);
  };
  const cancelDeleteItem = () => {
    if (!saving) setDeleteItemId(null);
  };

  return (
    <>
      <Stack sx={{ gap: "16px" }}>
        {/* Phases summary */}
        {loading ? (
          <Stack alignItems="center" sx={{ py: "4px" }}>
            <CircularProgress size={24} sx={{ color: brand.primary }} />
          </Stack>
        ) : phases.length === 0 ? (
          <Typography
            sx={{
              ...textStyles.body,
              color: text.tertiary,
            }}
          >
            {canConfigure
              ? "No lifecycle phases configured yet. Click the button below to add phases."
              : "No lifecycle phases yet. An Admin can add them."}
          </Typography>
        ) : (
          <Stack sx={{ gap: "8px" }}>
            <Typography
              sx={{
                ...textStyles.subsectionTitle,
                color: text.primary,
              }}
            >
              {/* Heading, count and word are separate text nodes so each translates. */}
              <span>Configured phases</span> (
              <span>{phases.filter((p) => p.is_active).length}</span> <span>active</span>)
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
                  backgroundColor: phase.is_active ? background.alt : background.main,
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
                    ...textStyles.body,
                    flex: 1,
                    fontWeight: 500,
                    color: text.primary,
                  }}
                >
                  {phase.name}
                </Typography>
                <Chip
                  // Count and word are separate text nodes so the word translates.
                  label={
                    <>
                      {phase.items?.length || 0} {phase.items?.length === 1 ? "item" : "items"}
                    </>
                  }
                  size="small"
                  sx={{
                    ...vwChip,
                    backgroundColor: background.main,
                    color: text.tertiary,
                  }}
                />
                {!phase.is_active && (
                  <Chip
                    label="Inactive"
                    size="small"
                    sx={{
                      ...vwChip,
                      backgroundColor: status.error.bg,
                      color: status.error.text,
                    }}
                  />
                )}
              </Box>
            ))}
          </Stack>
        )}

        {canConfigure && (
          <CustomizableButton
            variant="outlined"
            color="secondary"
            startIcon={<Settings size={16} />}
            testId="model-lifecycle-configure-phases"
            onClick={() => {
              setSaveFailed(false);
              setConfigOpen(true);
            }}
            sx={{ alignSelf: "flex-start" }}
          >
            Configure phases
          </CustomizableButton>
        )}
      </Stack>

      {/* Configuration modal. Every change saves as it is made, so the footer
          only closes it. */}
      <StandardModal
        isOpen={configOpen && canConfigure}
        onClose={closeConfig}
        title="Configure model lifecycle"
        description="Set the phases and items each model goes through. Changes save as you make them."
        cancelButtonText="Close"
        maxWidth="900px"
      >
        <Stack sx={{ gap: "12px" }}>
          {saveFailed && (
            <Typography role="alert" sx={{ ...textStyles.body, color: status.error.text }}>
              Not saved. Try again.
            </Typography>
          )}
          {loading && phases.length === 0 ? (
            <Stack alignItems="center" sx={{ py: "8px" }}>
              <CircularProgress sx={{ color: brand.primary }} />
            </Stack>
          ) : (
            <>
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
                      color={text.tertiary}
                      style={{
                        transform: expandedPhases.has(phase.id) ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.2s ease",
                      }}
                    />
                    {editingPhaseId === phase.id ? (
                      <Stack
                        direction="row"
                        alignItems="center"
                        sx={{ flex: 1, gap: "4px", mr: "8px" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <TextField
                          value={editingPhaseName}
                          onChange={(e) => setEditingPhaseName(e.target.value)}
                          onBlur={() => handleRenamePhaseSave(phase.id, editingPhaseName)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              // Saves the name; does not submit the modal's form.
                              e.preventDefault();
                              handleRenamePhaseSave(phase.id, editingPhaseName);
                            } else if (e.key === "Escape") {
                              // Cancels the rename only; the modal stays open.
                              e.stopPropagation();
                              setEditingPhaseId(null);
                            }
                          }}
                          autoFocus
                          size="small"
                          sx={{ ...vwTextField, flex: 1 }}
                        />
                        <CustomizableButton
                          iconOnly
                          variant="text"
                          size="small"
                          ariaLabel="Save phase name"
                          onClick={() => handleRenamePhaseSave(phase.id, editingPhaseName)}
                          sx={{ color: brand.primary }}
                        >
                          <Check size={16} />
                        </CustomizableButton>
                      </Stack>
                    ) : (
                      <Stack
                        direction="row"
                        alignItems="center"
                        sx={{
                          "flex": 1,
                          "gap": "8px",
                          "&:hover .phase-edit-icon": { opacity: 1 },
                        }}
                      >
                        <Typography
                          sx={{
                            ...textStyles.body,
                            fontWeight: 600,
                            color: text.primary,
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
                        <CustomizableButton
                          iconOnly
                          variant="text"
                          size="small"
                          className="phase-edit-icon"
                          ariaLabel="Edit phase name"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPhaseId(phase.id);
                            setEditingPhaseName(phase.name);
                          }}
                          sx={{ ...iconButtonSx, opacity: 0, transition: "opacity 0.2s" }}
                        >
                          <Pencil size={14} />
                        </CustomizableButton>
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
                          sx={vwSwitch}
                        />
                      }
                      label={
                        <Typography sx={{ ...textStyles.bodySmall, color: text.tertiary }}>
                          Active
                        </Typography>
                      }
                      onClick={(e) => e.stopPropagation()}
                      sx={{ mr: 0 }}
                    />
                    <CustomizableButton
                      iconOnly
                      variant="text"
                      size="small"
                      ariaLabel="Move phase up"
                      isDisabled={phaseIdx === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMovePhase(phase.id, "up");
                      }}
                      sx={iconButtonSx}
                    >
                      <ArrowUp size={16} />
                    </CustomizableButton>
                    <CustomizableButton
                      iconOnly
                      variant="text"
                      size="small"
                      ariaLabel="Move phase down"
                      isDisabled={phaseIdx === phases.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMovePhase(phase.id, "down");
                      }}
                      sx={iconButtonSx}
                    >
                      <ArrowDown size={16} />
                    </CustomizableButton>
                    <CustomizableButton
                      iconOnly
                      variant="text"
                      size="small"
                      ariaLabel="Delete phase"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletePhaseId(phase.id);
                      }}
                      sx={deleteIconButtonSx}
                    >
                      <Trash2 size={16} />
                    </CustomizableButton>
                  </AccordionSummary>

                  <AccordionDetails
                    sx={{ px: "16px", py: "12px", backgroundColor: background.main }}
                  >
                    <Stack spacing={0}>
                      {(Array.isArray(phase.items) ? phase.items : []).map((item, itemIdx) => (
                        <Stack
                          key={item.id}
                          direction="row"
                          alignItems="center"
                          sx={{
                            gap: "12px",
                            py: "8px",
                            borderBottom: `1px solid ${border.light}`,
                          }}
                        >
                          <Typography
                            sx={{
                              ...textStyles.body,
                              flex: 1,
                              color: text.secondary,
                            }}
                          >
                            {item.name}
                          </Typography>
                          <Chip
                            label={itemTypeLabel(item.item_type)}
                            size="small"
                            variant="outlined"
                            sx={{
                              ...vwChip,
                              borderColor: border.dark,
                              color: text.tertiary,
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
                                sx={vwSwitch}
                              />
                            }
                            label={
                              <Typography sx={{ ...textStyles.caption, color: text.tertiary }}>
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
                              borderLeft: `1px solid ${border.light}`,
                            }}
                          >
                            <CustomizableButton
                              iconOnly
                              variant="text"
                              size="small"
                              ariaLabel="Move item up"
                              isDisabled={itemIdx === 0}
                              onClick={() =>
                                handleMoveItem(phase.id, phase.items ?? [], item.id, "up")
                              }
                              sx={iconButtonSx}
                            >
                              <ArrowUp size={14} />
                            </CustomizableButton>
                            <CustomizableButton
                              iconOnly
                              variant="text"
                              size="small"
                              ariaLabel="Move item down"
                              isDisabled={itemIdx === (phase.items?.length ?? 0) - 1}
                              onClick={() =>
                                handleMoveItem(phase.id, phase.items ?? [], item.id, "down")
                              }
                              sx={iconButtonSx}
                            >
                              <ArrowDown size={14} />
                            </CustomizableButton>
                            <CustomizableButton
                              iconOnly
                              variant="text"
                              size="small"
                              ariaLabel="Delete item"
                              onClick={() => setDeleteItemId(item.id)}
                              sx={deleteIconButtonSx}
                            >
                              <Trash2 size={14} />
                            </CustomizableButton>
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
                              <MenuItem key={t.value} value={t.value} sx={textStyles.body}>
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
                                sx={vwSwitch}
                              />
                            }
                            label={
                              <Typography sx={{ ...textStyles.caption, color: text.tertiary }}>
                                Required
                              </Typography>
                            }
                            sx={{ ml: "4px" }}
                          />
                          <CustomizableButton
                            variant="contained"
                            testId="model-lifecycle-add-item-submit"
                            onClick={() => handleCreateItem(phase.id)}
                            isDisabled={!newItemName.trim()}
                            loading={saving}
                          >
                            Add
                          </CustomizableButton>
                          <CustomizableButton
                            variant="text"
                            color="secondary"
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
                          startIcon={<Plus size={14} />}
                          testId="model-lifecycle-add-item"
                          onClick={() => setAddingItemForPhase(phase.id)}
                          sx={{ alignSelf: "flex-start", mt: "12px" }}
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
                  borderRadius: radiusPx.sm,
                  p: "16px",
                  backgroundColor: background.main,
                }}
              >
                <Typography
                  sx={{
                    ...textStyles.subsectionTitle,
                    fontSize: textStyles.body.fontSize,
                    color: text.primary,
                    mb: "12px",
                  }}
                >
                  Add new phase
                </Typography>
                <Stack sx={{ gap: "8px" }}>
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
                    startIcon={<Plus size={14} />}
                    testId="model-lifecycle-create-phase"
                    onClick={handleCreatePhase}
                    isDisabled={!newPhaseName.trim()}
                    loading={saving}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Create phase
                  </CustomizableButton>
                </Stack>
              </Box>
            </>
          )}
        </Stack>
      </StandardModal>

      {/* Delete phase confirmation */}
      <StandardModal
        isOpen={deletePhaseId !== null}
        onClose={cancelDeletePhase}
        title="Delete phase"
        description="Delete this phase and all its items? This cannot be undone."
        onSubmit={confirmDeletePhase}
        submitButtonText="Delete"
        submitButtonColor={status.error.text}
        isSubmitting={saving}
        fitContent
        maxWidth="480px"
      />

      {/* Delete item confirmation */}
      <StandardModal
        isOpen={deleteItemId !== null}
        onClose={cancelDeleteItem}
        title="Delete item"
        description="Delete this item? This cannot be undone."
        onSubmit={confirmDeleteItem}
        submitButtonText="Delete"
        submitButtonColor={status.error.text}
        isSubmitting={saving}
        fitContent
        maxWidth="480px"
      />
    </>
  );
}
