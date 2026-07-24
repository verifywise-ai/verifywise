import { Box, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import { ArrowLeft, Check, Loader2, Pencil, X } from "lucide-react";
import { palette } from "../../../themes/palette";
import { textStyles } from "../../../themes/typography";

export interface PolicyEditorTitleAreaProps {
  pageTitle: string;
  isEditingTitle: boolean;
  editedTitle: string;
  isSavingTitle: boolean;
  titleError?: string;
  onBack: () => void;
  onStartEditTitle: () => void;
  onEditedTitleChange: (value: string) => void;
  onSaveTitle: () => void;
  onCancelEditTitle: () => void;
}

/** Back control + inline policy title editing. */
export function PolicyEditorTitleArea({
  pageTitle,
  isEditingTitle,
  editedTitle,
  isSavingTitle,
  titleError,
  onBack,
  onStartEditTitle,
  onEditedTitleChange,
  onSaveTitle,
  onCancelEditTitle,
}: PolicyEditorTitleAreaProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 1 }}>
      <Tooltip title="Back to policies" arrow>
        <IconButton
          onClick={onBack}
          size="small"
          sx={{
            "padding": "4px",
            "borderRadius": "4px",
            "color": palette.text.muted,
            "&:hover": { backgroundColor: palette.background.hover, color: palette.text.secondary },
          }}
        >
          <ArrowLeft size={18} />
        </IconButton>
      </Tooltip>
      <Box
        sx={{
          "display": "inline-flex",
          "alignItems": "center",
          "gap": 0.5,
          "&:hover .edit-title-icon": {
            opacity: 1,
          },
        }}
      >
        {isEditingTitle ? (
          <>
            <TextField
              value={editedTitle}
              onChange={(e) => onEditedTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveTitle();
                if (e.key === "Escape") onCancelEditTitle();
              }}
              placeholder="Policy title"
              variant="outlined"
              size="small"
              autoFocus
              disabled={isSavingTitle}
              error={!!titleError}
              helperText={titleError}
              inputProps={{ maxLength: 128 }}
              sx={{
                "minWidth": "400px",
                "& .MuiOutlinedInput-root": {
                  ...textStyles.cardTitle,
                  color: palette.text.secondary,
                },
              }}
            />
            <IconButton
              size="small"
              onClick={onSaveTitle}
              disabled={!editedTitle.trim() || isSavingTitle}
              sx={{ color: palette.brand.primary }}
            >
              {isSavingTitle ? (
                <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <Check size={18} />
              )}
            </IconButton>
            <IconButton
              size="small"
              onClick={onCancelEditTitle}
              disabled={isSavingTitle}
              sx={{ color: palette.text.disabled }}
            >
              <X size={18} />
            </IconButton>
          </>
        ) : (
          <>
            <Typography sx={{ ...textStyles.cardTitle, color: palette.text.secondary }}>
              {pageTitle}
            </Typography>
            <IconButton
              size="small"
              onClick={onStartEditTitle}
              className="edit-title-icon"
              sx={{
                "transition": "opacity 0.2s",
                "color": palette.text.disabled,
                "&:hover": {
                  color: palette.brand.primary,
                  backgroundColor: palette.background.hover,
                },
              }}
            >
              <Pencil size={14} />
            </IconButton>
          </>
        )}
      </Box>
    </Box>
  );
}
