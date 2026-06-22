import React from "react";
import { Box, Stack, Typography, Paper, Tooltip } from "@mui/material";
import { GitCompareArrows, Layers, Compass, BarChart3, Sparkles } from "lucide-react";
import { useAuth } from "../../../application/hooks/useAuth";
import { useUpdatePreferences } from "../../../application/hooks/useGovernanceOs";
import { CustomizableButton } from "../../components/button/customizable-button";
import { text, brand, background, border as borderPalette } from "../../themes/palette";
import { useUserGuideSidebarContext } from "../../components/UserGuide";

interface GovernanceOSEnableCTAProps {
  onEnabled?: () => void;
}

const GovernanceOSEnableCTA: React.FC<GovernanceOSEnableCTAProps> = ({ onEnabled }) => {
  const { userRoleName } = useAuth();
  const { open: openUserGuide } = useUserGuideSidebarContext();
  const updatePreferences = useUpdatePreferences();
  const isAdmin = userRoleName === "Admin";

  const handleEnable = () => {
    updatePreferences.mutate(
      { is_enabled: true },
      {
        onSuccess: () => {
          onEnabled?.();
        },
      },
    );
  };

  const features = [
    {
      icon: <GitCompareArrows size={20} color={brand.primary} />,
      title: "Framework Mapper",
      description:
        "Explore control-to-control mappings between any two frameworks. See direct equivalents, partial overlaps, and related controls.",
    },
    {
      icon: <Compass size={20} color={brand.primary} />,
      title: "Scenario Builder",
      description:
        "Get personalized framework recommendations and activate scenario-based compliance strategies across your projects.",
    },
    {
      icon: <BarChart3 size={20} color={brand.primary} />,
      title: "Unified Insights",
      description:
        "Per-project coverage analysis showing how well each project satisfies its assigned frameworks, with gap and synergy detection.",
    },
  ];

  return (
    <Box sx={{ py: "48px", px: { xs: "16px", md: "24px" } }}>
      <Stack gap="16px" alignItems="center" maxWidth={720} mx="auto">
        {/* Header */}
        <Stack gap="16px" alignItems="center" textAlign="center">
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              backgroundColor: brand.primaryLight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Layers size={32} color={brand.primary} />
          </Box>
          <Typography
            sx={{
              fontWeight: 600,
              color: text.primary,
              fontSize: 24,
            }}
          >
            Core Governance OS
          </Typography>
          <Typography
            sx={{
              color: text.accent,
              maxWidth: 520,
              lineHeight: 1.6,
              fontSize: 14,
            }}
          >
            Governance Intelligence connects your compliance frameworks into a unified workspace.
            Map controls, build scenarios, and measure per-project coverage — all in one place.
          </Typography>
        </Stack>

        {/* Feature cards */}
        <Stack gap="16px" width="100%">
          {features.map((feature) => (
            <Paper
              key={feature.title}
              elevation={0}
              sx={{
                p: "16px",
                borderRadius: "4px",
                border: `1px solid ${borderPalette.dark}`,
                background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
              }}
            >
              <Stack direction="row" gap="16px" alignItems="flex-start">
                <Box sx={{ mt: "4px", flexShrink: 0 }}>{feature.icon}</Box>
                <Stack gap="4px">
                  <Typography
                    sx={{
                      fontWeight: 600,
                      color: text.primary,
                      fontSize: 14,
                    }}
                  >
                    {feature.title}
                  </Typography>
                  <Typography
                    sx={{
                      color: text.accent,
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    {feature.description}
                  </Typography>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>

        {/* CTA */}
        <Stack gap="16px" alignItems="center" sx={{ mt: "8px" }}>
          <Tooltip
            title={!isAdmin ? "Contact your admin to enable Governance Intelligence" : ""}
            arrow
          >
            <span>
              <CustomizableButton
                variant="contained"
                size="medium"
                color="primary"
                isDisabled={!isAdmin || updatePreferences.isPending}
                onClick={handleEnable}
                startIcon={<Sparkles size={16} />}
                text={
                  updatePreferences.isPending ? "Enabling..." : "Enable Governance Intelligence"
                }
              />
            </span>
          </Tooltip>

          <CustomizableButton
            variant="text"
            size="small"
            color="primary"
            onClick={() => openUserGuide("governance-os")}
            text="Learn more in the user guide"
          />
        </Stack>
      </Stack>
    </Box>
  );
};

export default GovernanceOSEnableCTA;
