import { useState, ReactNode } from "react";
import { Box, Collapse, Typography, useTheme } from "@mui/material";
import { ChevronRight } from "lucide-react";

interface EditorSectionProps {
  title: string;
  /** One line shown under the title, e.g. "Always shown". */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** A collapsed-by-default section in the field editor or palette. */
export function EditorSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: EditorSectionProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box>
      <Box
        component="button"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        sx={{
          "display": "flex",
          "alignItems": "center",
          "gap": "6px",
          "width": "100%",
          "background": "none",
          "border": "none",
          "padding": "4px 0",
          "cursor": "pointer",
          "textAlign": "left",
          "&:hover": { backgroundColor: theme.palette.background.accent },
        }}
      >
        <Box
          sx={{
            display: "flex",
            color: theme.palette.other.icon,
            transition: "transform 0.15s ease",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          <ChevronRight size={14} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography
            sx={{
              fontWeight: 600,
              color: theme.palette.other.icon,
              fontSize: "10px",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}
          >
            {title}
          </Typography>
          {summary && (
            <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>
              {summary}
            </Typography>
          )}
        </Box>
      </Box>
      <Collapse in={open} timeout={150} unmountOnExit>
        <Box sx={{ pt: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}

export default EditorSection;
