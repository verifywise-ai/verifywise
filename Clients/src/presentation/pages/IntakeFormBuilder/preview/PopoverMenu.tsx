import { useState, type ReactNode } from "react";
import { Box, Popover, Typography, useTheme } from "@mui/material";
import { Check, ChevronDown } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { outlinedButtonSx } from "./previewStyles";

interface MenuOptionProps {
  label: string;
  description?: string;
  selected?: boolean;
  onSelect: () => void;
}

/** One row of a popover menu. */
export const MenuOption = ({ label, description, selected, onSelect }: MenuOptionProps) => {
  const theme = useTheme();
  return (
    <Box
      role="menuitem"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      sx={{
        "display": "flex",
        "alignItems": "center",
        "gap": "8px",
        "p": "8px 12px",
        "borderRadius": "4px",
        "cursor": "pointer",
        "&:hover, &:focus-visible": {
          backgroundColor: theme.palette.background.accent,
          outline: "none",
        },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: "13px", fontWeight: 500, color: theme.palette.text.primary }}>
          {label}
        </Typography>
        {description && (
          <Typography sx={{ fontSize: "13px", color: theme.palette.text.tertiary }}>
            {description}
          </Typography>
        )}
      </Box>
      {selected && <Check size={14} strokeWidth={1.5} color={theme.palette.primary.main} />}
    </Box>
  );
};

interface PopoverMenuProps {
  text: string;
  testId: string;
  startIcon?: ReactNode;
  /** The menu rows; call close after acting on a choice. */
  children: (close: () => void) => ReactNode;
}

/** An outlined button that opens a menu of choices below it. */
export const PopoverMenu = ({ text, testId, startIcon, children }: PopoverMenuProps) => {
  const theme = useTheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  return (
    <>
      <CustomizableButton
        variant="outlined"
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        startIcon={startIcon}
        endIcon={<ChevronDown size={14} />}
        text={text}
        testId={testId}
        sx={outlinedButtonSx}
      />
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              mt: "4px",
              p: "4px",
              minWidth: 240,
              border: `1px solid ${theme.palette.border.dark}`,
              borderRadius: "4px",
              boxShadow: theme.boxShadow,
            },
          },
        }}
      >
        <Box role="menu" aria-label={text}>
          {children(close)}
        </Box>
      </Popover>
    </>
  );
};
