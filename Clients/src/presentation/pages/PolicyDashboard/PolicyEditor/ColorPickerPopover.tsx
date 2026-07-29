import { Box, Popover } from "@mui/material";
import type { Editor } from "@tiptap/react";
import { palette } from "../../../themes/palette";

const { border } = palette;

const COLOR_PALETTE = [
  "text.black",
  "text.secondary",
  "text.tertiary",
  "text.icon",
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#ca8a04",
  "#16a34a",
  "#059669",
  "#0d9488",
  "#0891b2",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#9333ea",
];

export interface ColorPickerPopoverProps {
  editor: Editor | null;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

/** Text color swatch popover for the policy editor toolbar. */
export function ColorPickerPopover({ editor, anchorEl, onClose }: ColorPickerPopoverProps) {
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{
        paper: {
          sx: {
            p: 1.5,
            borderRadius: "6px",
            border: "1px solid",
            borderColor: border.dark,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          },
        },
      }}
    >
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "4px" }}>
        {COLOR_PALETTE.map((c) => (
          <Box
            key={c}
            onClick={() => {
              editor?.chain().focus().setColor(c).run();
              onClose();
            }}
            sx={{
              "width": 24,
              "height": 24,
              "borderRadius": "4px",
              "backgroundColor": c,
              "cursor": "pointer",
              "border": "1px solid rgba(0,0,0,0.1)",
              "&:hover": { transform: "scale(1.15)", transition: "transform 0.1s" },
            }}
          />
        ))}
      </Box>
      <Box
        onClick={() => {
          editor?.chain().focus().unsetColor().run();
          onClose();
        }}
        sx={{
          "mt": 1,
          "textAlign": "center",
          "fontSize": 11,
          "color": "text.icon",
          "cursor": "pointer",
          "&:hover": { color: "text.secondary" },
        }}
      >
        Reset to default
      </Box>
    </Popover>
  );
}
