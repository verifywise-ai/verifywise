import { useEffect, useRef, useState } from "react";
import { Box, IconButton, TextField, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { Check, Pencil, X } from "lucide-react";
import { palette } from "../../themes/palette";

interface EditableTextProps {
  /** Current value to display */
  value: string;
  /** Called with the trimmed new value when the user confirms the edit. May be async. */
  onSave: (next: string) => Promise<void> | void;
  /** Optional fallback when `value` is empty. */
  placeholder?: string;
  /** Max length enforced client-side. */
  maxLength?: number;
  /** Whether the user is allowed to edit. When false, the pencil never appears. */
  disabled?: boolean;
  /** Style overrides for the displayed text / input (font size, weight, color). */
  textSx?: SxProps<Theme>;
  /** Accessible label for the edit button. */
  editAriaLabel?: string;
  /** Min width of the input while editing. Defaults to 320px. */
  inputMinWidth?: number | string;
}

/**
 * Hover-to-reveal inline text editor. Pattern: show text with an edit icon that
 * fades in on hover; clicking the icon swaps the text for a TextField with
 * save/cancel controls. Enter saves, Escape cancels.
 *
 * onSave is awaited — while in flight the controls are disabled.
 */
export default function EditableText({
  value,
  onSave,
  placeholder = "(not set)",
  maxLength = 255,
  disabled = false,
  textSx,
  editAriaLabel = "Edit",
  inputMinWidth = 320,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(value);
    }
  }, [isEditing, value]);

  const handleStart = () => {
    if (disabled) return;
    setDraft(value);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    const next = draft.trim();
    if (!next || next === value || saving) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (isEditing) {
    return (
      <Box sx={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
        <TextField
          inputRef={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            } else if (e.key === "Escape") {
              e.preventDefault();
              handleCancel();
            }
          }}
          variant="outlined"
          size="small"
          autoFocus
          disabled={saving}
          sx={{
            "minWidth": inputMinWidth,
            "& .MuiOutlinedInput-root": textSx as object,
          }}
        />
        <IconButton
          size="small"
          onClick={handleSave}
          disabled={saving || !draft.trim()}
          aria-label="Save"
          sx={{ color: palette.brand.primary }}
        >
          <Check size={16} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          size="small"
          onClick={handleCancel}
          disabled={saving}
          aria-label="Cancel"
          sx={{ color: palette.text.disabled }}
        >
          <X size={16} strokeWidth={1.75} />
        </IconButton>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        "display": "inline-flex",
        "alignItems": "center",
        "gap": "4px",
        "&:hover .editable-text-icon": { opacity: disabled ? 0 : 1 },
      }}
    >
      <Typography sx={textSx}>{value || placeholder}</Typography>
      {!disabled && (
        <IconButton
          size="small"
          onClick={handleStart}
          className="editable-text-icon"
          aria-label={editAriaLabel}
          sx={{
            "opacity": 0,
            "transition": "opacity 0.15s",
            "color": palette.text.disabled,
            "&:hover": {
              color: palette.brand.primary,
              backgroundColor: "rgba(19, 113, 91, 0.1)",
            },
          }}
        >
          <Pencil size={14} strokeWidth={1.75} />
        </IconButton>
      )}
    </Box>
  );
}
