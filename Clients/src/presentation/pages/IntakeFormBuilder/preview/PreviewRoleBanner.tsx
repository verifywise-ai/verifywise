import { Box, Typography, useTheme } from "@mui/material";
import { Eye } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import {
  PREVIEW_ROLE_LABELS,
  type PreviewRole,
} from "../../../../application/utils/intakeRouting/previewRole";
import { RoleSwitch } from "./PreviewMenu";

interface PreviewRoleBannerProps {
  role: PreviewRole;
  onRoleChange: (role: PreviewRole) => void;
  onExit: () => void;
}

/** Shown on every simulated view: names the role and that nothing is saved. */
export const PreviewRoleBanner = ({ role, onRoleChange, onExit }: PreviewRoleBannerProps) => {
  const theme = useTheme();
  const info = theme.palette.status.info;
  return (
    <Box
      role="status"
      data-testid="preview-role-banner"
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "8px 12px",
        p: "8px 12px",
        border: `1px solid ${info.border ?? theme.palette.border.dark}`,
        borderRadius: "4px",
        backgroundColor: info.bg ?? theme.palette.background.accent,
      }}
    >
      <Eye size={16} strokeWidth={1.5} color={info.text ?? theme.palette.text.secondary} />
      <Box sx={{ flex: 1, minWidth: 200 }}>
        <Typography
          data-testid="preview-role-banner-title"
          sx={{ fontSize: "13px", fontWeight: 600, color: theme.palette.text.primary }}
        >
          <span>Previewing as</span> <span>{PREVIEW_ROLE_LABELS[role]}</span>,{" "}
          <span>simulation only</span>
        </Typography>
        <Typography sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
          Actions are turned off. The server still checks every real action against your own role.
        </Typography>
      </Box>
      <RoleSwitch role={role} onChange={onRoleChange} />
      <CustomizableButton
        variant="outlined"
        size="small"
        text="Exit preview"
        onClick={onExit}
        testId="button-preview-exit"
        sx={{
          "height": 30,
          "fontSize": "13px",
          "borderColor": "border.dark",
          "color": "text.secondary",
          "backgroundColor": "background.main",
          "&:hover": { borderColor: "text.accent", backgroundColor: "background.accent" },
        }}
      />
    </Box>
  );
};

export default PreviewRoleBanner;
