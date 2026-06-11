import React from "react";
import { Stack, Typography, Box } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { GitCompareArrows, BarChart3, ArrowRight, Sparkles } from "lucide-react";
import { useGovernancePreferences } from "../../../application/hooks/useGovernanceOs";
import { CustomizableButton } from "../button/customizable-button";
import { text, brand, background, border as borderPalette } from "../../themes/palette";

interface GovernanceIntelligenceContextBarProps {
  frameworkCount: number;
}

const GovernanceIntelligenceContextBar: React.FC<GovernanceIntelligenceContextBarProps> = ({
  frameworkCount,
}) => {
  const navigate = useNavigate();
  const { data: preferences } = useGovernancePreferences();
  const isEnabled = preferences?.is_enabled ?? false;

  if (!isEnabled || frameworkCount < 2) return null;

  return (
    <Box
      sx={{
        mb: "16px",
        p: "16px",
        borderRadius: "4px",
        border: `1px solid ${borderPalette.dark}`,
        background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        gap="16px"
        alignItems={{ xs: "flex-start", md: "center" }}
        justifyContent="space-between"
      >
        <Stack direction="row" gap="12px" alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              backgroundColor: brand.primaryLight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Sparkles size={16} color={brand.primary} />
          </Box>
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 500,
              color: text.primary,
              lineHeight: 1.5,
            }}
          >
            Governance Intelligence is active — {frameworkCount} frameworks mapped
          </Typography>
        </Stack>

        <Stack direction="row" gap="8px" alignItems="center" sx={{ flexShrink: 0 }}>
          <CustomizableButton
            variant="outlined"
            size="small"
            color="primary"
            onClick={() => navigate("/governance/framework-mapper")}
            startIcon={<GitCompareArrows size={14} />}
            text="View Mappings"
          />
          <CustomizableButton
            variant="outlined"
            size="small"
            color="primary"
            onClick={() => navigate("/governance/insights")}
            startIcon={<BarChart3 size={14} />}
            text="Analyze Coverage"
          />
          <CustomizableButton
            variant="text"
            size="small"
            color="primary"
            onClick={() => navigate("/governance")}
            endIcon={<ArrowRight size={14} />}
            text="Open Hub"
          />
        </Stack>
      </Stack>
    </Box>
  );
};

export default GovernanceIntelligenceContextBar;
