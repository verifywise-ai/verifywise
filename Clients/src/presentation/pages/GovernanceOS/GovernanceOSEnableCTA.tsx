import React from "react";
import { Box, Stack, Typography, Button, Paper, Tooltip } from "@mui/material";
import { GitCompareArrows, Layers, Compass, BarChart3, Lightbulb } from "lucide-react";
import { useAuth } from "../../../application/hooks/useAuth";
import { useUpdatePreferences } from "../../../application/hooks/useGovernanceOs";
import { palette } from "../../themes/palette";
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
      icon: <GitCompareArrows size={20} color={palette.brand.primary} />,
      title: "Framework Mapper",
      description:
        "Explore control-to-control mappings between any two frameworks. See direct equivalents, partial overlaps, and related controls.",
    },
    {
      icon: <Compass size={20} color={palette.brand.primary} />,
      title: "Scenario Builder",
      description:
        "Get personalized framework recommendations based on your industry, region, risk level, and use case type.",
    },
    {
      icon: <BarChart3 size={20} color={palette.brand.primary} />,
      title: "Unified Insights",
      description:
        "Per-project coverage analysis showing how well each project satisfies its assigned frameworks, with gap and synergy detection.",
    },
  ];

  return (
    <Box sx={{ py: 4, px: { xs: 2, md: 4 } }}>
      <Stack spacing={4} alignItems="center" maxWidth={720} mx="auto">
        {/* Header */}
        <Stack spacing={2} alignItems="center" textAlign="center">
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              backgroundColor: palette.brand.primaryLight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Layers size={32} color={palette.brand.primary} />
          </Box>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 600,
              color: palette.text.primary,
              fontSize: 22,
            }}
          >
            Core Governance OS
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: palette.text.tertiary,
              maxWidth: 520,
              lineHeight: 1.6,
              fontSize: 14,
            }}
          >
            Cross-framework intelligence layer that connects your compliance frameworks into a
            unified governance view. Reduce duplicate work, prioritize intelligently, and measure
            progress holistically.
          </Typography>
        </Stack>

        {/* Feature cards */}
        <Stack spacing={2} width="100%">
          {features.map((feature) => (
            <Paper
              key={feature.title}
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: `1px solid ${palette.border.light}`,
                backgroundColor: palette.background.alt,
              }}
            >
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Box sx={{ mt: 0.25, flexShrink: 0 }}>{feature.icon}</Box>
                <Stack spacing={0.5}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 600,
                      color: palette.text.primary,
                      fontSize: 14,
                    }}
                  >
                    {feature.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: palette.text.tertiary,
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
        <Stack spacing={2} alignItems="center">
          <Tooltip title={!isAdmin ? "Contact your admin to enable Governance OS" : ""} arrow>
            <span>
              <Button
                variant="contained"
                size="large"
                disabled={!isAdmin || updatePreferences.isPending}
                onClick={handleEnable}
                startIcon={<Lightbulb size={18} />}
                sx={{
                  "textTransform": "none",
                  "fontWeight": 600,
                  "fontSize": 15,
                  "borderRadius": 2,
                  "px": 4,
                  "py": 1,
                  "boxShadow": "none",
                  "backgroundColor": palette.brand.primary,
                  "&:hover": {
                    backgroundColor: palette.brand.primaryHover,
                    boxShadow: "none",
                  },
                }}
              >
                {updatePreferences.isPending ? "Enabling..." : "Enable Governance OS"}
              </Button>
            </span>
          </Tooltip>

          <Button
            variant="text"
            size="small"
            onClick={() => openUserGuide("governance-os")}
            sx={{
              "textTransform": "none",
              "fontWeight": 500,
              "fontSize": 13,
              "color": palette.brand.primary,
              "&:hover": {
                backgroundColor: palette.brand.primaryLight,
              },
            }}
          >
            Learn more in the user guide
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
};

export default GovernanceOSEnableCTA;
