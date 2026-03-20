import { Box, CircularProgress, Stack, Typography, useTheme } from "@mui/material";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { Settings } from "lucide-react";
import Toggle from "../../../components/Inputs/Toggle";
import { useRiskAssessmentMode } from "../../../../application/hooks/useRiskAssessmentMode";
import { useAuth } from "../../../../application/hooks/useAuth";
import { text } from "../../../themes/palette";

const Features: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { userRoleName } = useAuth();
  const { isQuantitative, isLoading: modeLoading, toggleMode } = useRiskAssessmentMode();
  const [toggling, setToggling] = useState(false);
  const isAdmin = userRoleName === "Admin";

  const handleToggleMode = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      await toggleMode();
    } catch {
      // error already logged in hook
    } finally {
      setToggling(false);
    }
  };

  return (
    <Stack sx={{ mt: 3, width: "100%" }}>
      <Stack sx={{ pt: theme.spacing(20) }}>
        <Box sx={{ mb: 3 }}>
          <Typography
            sx={{ fontSize: 15, fontWeight: 600, color: `${text.black}` }}
          >
            Features
          </Typography>
          <Typography sx={{ fontSize: 13, color: "#666666", mt: 0.5 }}>
            Configure which features are enabled for your organization
          </Typography>
        </Box>

        <Stack sx={{ gap: "16px" }}>
          {/* Risk Assessment Mode */}
          <Box
            sx={{
              border: `1px solid ${theme.palette.border.light}`,
              borderRadius: "4px",
              p: "16px",
              backgroundColor: theme.palette.background.main,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                Quantitative Risk Assessment
              </Typography>
              <Typography
                sx={{ fontSize: 13, color: theme.palette.text.secondary }}
              >
                {isQuantitative
                  ? "Enabled — risks include FAIR-based monetary estimates (ALE, residual risk, ROI)."
                  : "Disabled — risks use qualitative scoring only (severity, likelihood)."}
              </Typography>
              {!isAdmin && (
                <Typography
                  sx={{ fontSize: 12, color: theme.palette.text.secondary, mt: 0.5, fontStyle: "italic" }}
                >
                  Only admins can change this setting.
                </Typography>
              )}
            </Box>
            {modeLoading ? (
              <CircularProgress size={20} />
            ) : (
              <Toggle
                checked={isQuantitative}
                onChange={handleToggleMode}
                disabled={!isAdmin || toggling}
              />
            )}
          </Box>

          {/* Model Lifecycle (plugin-managed) */}
          <Box
            sx={{
              border: `1px solid ${theme.palette.border.light}`,
              borderRadius: "4px",
              p: "16px",
              backgroundColor: theme.palette.background.main,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                Model Lifecycle
              </Typography>
              <Typography
                sx={{ fontSize: 13, color: theme.palette.text.secondary }}
              >
                Model Lifecycle is now managed via the Plugins page. Install or
                uninstall the "Model Lifecycle" plugin to control this feature.
              </Typography>
            </Box>
            <CustomizableButton
              variant="contained"
              text="Manage plugins"
              sx={{
                backgroundColor: "brand.primary",
                border: "1px solid brand.primary",
                gap: 2,
                whiteSpace: "nowrap",
              }}
              icon={<Settings size={16} />}
              onClick={() => navigate("/plugins")}
            />
          </Box>
        </Stack>
      </Stack>
    </Stack>
  );
};

export default Features;
