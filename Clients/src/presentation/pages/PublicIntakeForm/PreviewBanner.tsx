import { Box, IconButton, Typography, useTheme } from "@mui/material";
import { Eye, X } from "lucide-react";

interface PreviewBannerProps {
  onDismiss: () => void;
}

/**
 * Framing for a builder previewing the public form. The form and its checks
 * work as they do for anyone; Submit asks whether to test or submit for real.
 */
export const PreviewBanner = ({ onDismiss }: PreviewBannerProps) => {
  const theme = useTheme();
  const info = theme.palette.status.info;
  return (
    <Box
      role="status"
      data-testid="public-preview-banner"
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        mb: "16px",
        p: "12px 16px",
        border: `1px solid ${info.border ?? theme.palette.border.dark}`,
        borderRadius: "4px",
        backgroundColor: info.bg ?? theme.palette.background.accent,
      }}
    >
      <Box sx={{ pt: "2px", display: "flex" }}>
        <Eye size={16} strokeWidth={1.5} color={info.text ?? theme.palette.text.secondary} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: "13px", fontWeight: 600, color: theme.palette.text.primary }}>
          Previewing as a submitter
        </Typography>
        <Typography sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
          This is the form people see from your public link. Submit lets you test it, which sends
          nothing, or submit for real, which reaches your reviewers.
        </Typography>
      </Box>
      <IconButton
        aria-label="Dismiss preview notice"
        data-testid="public-preview-banner-dismiss"
        onClick={onDismiss}
        size="small"
        sx={{ p: "4px", borderRadius: "4px" }}
      >
        <X size={16} strokeWidth={1.5} color={theme.palette.text.tertiary} />
      </IconButton>
    </Box>
  );
};

export default PreviewBanner;
