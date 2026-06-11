import React from "react";
import { Stack, Typography, Box, Tooltip } from "@mui/material";
import { GitCompareArrows, X as CloseIcon, Sparkles } from "lucide-react";
import { useAuth } from "../../../application/hooks/useAuth";
import {
  useGovernancePreferences,
  useUpdatePreferences,
} from "../../../application/hooks/useGovernanceOs";
import { CustomizableButton } from "../button/customizable-button";
import { text, brand, background, border as borderPalette } from "../../themes/palette";

interface GovernanceOsBannerProps {
  frameworkCount: number;
  onDismiss?: () => void;
}

const GovernanceOsBanner: React.FC<GovernanceOsBannerProps> = ({ frameworkCount, onDismiss }) => {
  const { userRoleName } = useAuth();
  const { data: preferences } = useGovernancePreferences();
  const updatePreferences = useUpdatePreferences();
  const isAdmin = userRoleName === "Admin";

  const isEnabled = preferences?.is_enabled ?? false;
  const isVisible = frameworkCount >= 2 && !isEnabled;

  if (!isVisible) return null;

  const handleEnable = () => {
    updatePreferences.mutate({ is_enabled: true });
  };

  return (
    <Box
      sx={{
        mb: "16px",
        p: "16px",
        borderRadius: "4px",
        border: `1px solid ${brand.primary}`,
        background: `linear-gradient(135deg, ${background.main} 0%, ${background.accent} 100%)`,
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        gap="16px"
        alignItems={{ xs: "flex-start", md: "center" }}
        justifyContent="space-between"
      >
        <Stack direction="row" gap="12px" alignItems="flex-start" sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              backgroundColor: brand.primaryLight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Sparkles size={18} color={brand.primary} />
          </Box>
          <Stack gap="4px">
            <Typography
              sx={{
                fontSize: 14,
                fontWeight: 600,
                color: text.primary,
                lineHeight: 1.4,
              }}
            >
              Unlock Governance Intelligence
            </Typography>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 400,
                color: text.accent,
                lineHeight: 1.5,
              }}
            >
              You have {frameworkCount} frameworks assigned. Enable Governance Intelligence to map
              controls across frameworks, build scenario-based compliance strategies, and analyze
              per-project coverage — all in one place.
            </Typography>
          </Stack>
        </Stack>

        <Stack direction="row" gap="8px" alignItems="center" sx={{ flexShrink: 0 }}>
          <Tooltip
            title={!isAdmin ? "Contact your admin to enable Governance Intelligence" : ""}
            arrow
          >
            <span>
              <CustomizableButton
                variant="contained"
                size="small"
                color="primary"
                isDisabled={!isAdmin || updatePreferences.isPending}
                onClick={handleEnable}
                startIcon={<GitCompareArrows size={14} />}
                text={
                  updatePreferences.isPending ? "Enabling..." : "Enable Governance Intelligence"
                }
              />
            </span>
          </Tooltip>

          {onDismiss && (
            <CustomizableButton
              size="small"
              iconOnly
              ariaLabel="Dismiss banner"
              onClick={onDismiss}
              icon={<CloseIcon size={16} />}
              sx={{
                "minWidth": 28,
                "width": 28,
                "height": 28,
                "p": 0,
                "color": text.muted,
                "border": `1px solid ${borderPalette.light}`,
                "borderRadius": "4px",
                "&:hover": {
                  color: text.primary,
                  backgroundColor: background.hover,
                },
              }}
            />
          )}
        </Stack>
      </Stack>
    </Box>
  );
};

export default GovernanceOsBanner;
