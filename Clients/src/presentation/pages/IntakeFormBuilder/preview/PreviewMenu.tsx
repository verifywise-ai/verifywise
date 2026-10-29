import { useState } from "react";
import { Box, Popover, Typography, useTheme } from "@mui/material";
import { Check, ChevronDown, Eye } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import {
  PREVIEW_ROLES,
  PREVIEW_ROLE_LABELS,
  type PreviewRole,
} from "../../../../application/utils/intakeRouting/previewRole";

interface MenuOptionProps {
  label: string;
  description?: string;
  selected?: boolean;
  onSelect: () => void;
}

/** One row of a preview menu. */
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

const menuPaperSx = {
  mt: "4px",
  p: "4px",
  minWidth: 240,
  border: "1px solid",
  borderColor: "border.dark",
  borderRadius: "4px",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
};

const SectionLabel = ({ children }: { children: string }) => {
  const theme = useTheme();
  return (
    <Typography
      sx={{
        fontSize: "13px",
        fontWeight: 600,
        color: theme.palette.text.secondary,
        p: "8px 12px 4px",
      }}
    >
      {children}
    </Typography>
  );
};

interface PreviewMenuProps {
  onPreviewForm: () => void;
  onPreviewReview: (role: PreviewRole) => void;
}

/** The builder's Preview button: the public form, or the review flow as a role. */
export const PreviewMenu = ({ onPreviewForm, onPreviewReview }: PreviewMenuProps) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  return (
    <>
      <CustomizableButton
        variant="outlined"
        onClick={(e) => setAnchor(e.currentTarget)}
        startIcon={<Eye size={14} />}
        endIcon={<ChevronDown size={14} />}
        text="Preview"
        testId="button-intake-preview"
        ariaLabel="Preview"
        sx={{
          "height": 34,
          "fontSize": "13px",
          "borderColor": "border.dark",
          "color": "text.secondary",
          "&:hover": { borderColor: "text.accent", backgroundColor: "background.accent" },
        }}
      />
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: menuPaperSx } }}
      >
        <Box role="menu" aria-label="Preview">
          <MenuOption
            label="Form as a submitter"
            description="Opens the public form in a new tab"
            onSelect={() => {
              close();
              onPreviewForm();
            }}
          />
          <SectionLabel>Review flow as</SectionLabel>
          {PREVIEW_ROLES.map((role) => (
            <MenuOption
              key={role}
              label={PREVIEW_ROLE_LABELS[role]}
              onSelect={() => {
                close();
                onPreviewReview(role);
              }}
            />
          ))}
        </Box>
      </Popover>
    </>
  );
};

interface RoleSwitchProps {
  role: PreviewRole;
  onChange: (role: PreviewRole) => void;
}

/** Switches the simulated role in place. */
export const RoleSwitch = ({ role, onChange }: RoleSwitchProps) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  return (
    <>
      <CustomizableButton
        variant="outlined"
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        endIcon={<ChevronDown size={14} />}
        text="Switch role"
        testId="button-preview-switch-role"
        sx={{
          "height": 30,
          "fontSize": "13px",
          "borderColor": "border.dark",
          "color": "text.secondary",
          "backgroundColor": "background.main",
          "&:hover": { borderColor: "text.accent", backgroundColor: "background.accent" },
        }}
      />
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: menuPaperSx } }}
      >
        <Box role="menu" aria-label="Switch role">
          {PREVIEW_ROLES.map((r) => (
            <MenuOption
              key={r}
              label={PREVIEW_ROLE_LABELS[r]}
              selected={r === role}
              onSelect={() => {
                close();
                onChange(r);
              }}
            />
          ))}
        </Box>
      </Popover>
    </>
  );
};
