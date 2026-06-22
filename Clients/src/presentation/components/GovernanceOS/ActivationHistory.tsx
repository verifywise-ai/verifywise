import React from "react";
import { Box, Typography, Stack, CircularProgress, alpha } from "@mui/material";
import { History, XCircle } from "lucide-react";
import {
  useActivationHistory,
  useDeactivateScenario,
} from "../../../application/hooks/useGovernanceOs";
import GovernanceTooltip from "./GovernanceTooltip";
import { CustomizableButton } from "../button/customizable-button";
import { border as borderPalette, background, text, brand, status } from "../../themes/palette";

const ActivationHistory: React.FC = () => {
  const { data: activations, isLoading } = useActivationHistory();
  const deactivateMutation = useDeactivateScenario();

  const handleDeactivate = (id: number) => {
    deactivateMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (!activations || activations.length === 0) {
    return (
      <Box
        sx={{
          border: `1px dashed ${borderPalette.light}`,
          borderRadius: "4px",
          p: "16px",
          background: background.main,
        }}
      >
        <Stack direction="row" gap="16px" alignItems="center">
          <History size={18} color={text.muted} />
          <Typography sx={{ fontSize: 13, color: text.muted }}>
            No activations yet. Activate a scenario to see its history here.
          </Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        border: `1px solid ${borderPalette.dark}`,
        borderRadius: "4px",
        p: "16px",
        background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
      }}
    >
      <Stack direction="row" gap="16px" alignItems="center" sx={{ mb: "16px" }}>
        <History size={20} color={brand.primary} />
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Activation History</Typography>
      </Stack>

      <Stack gap="12px">
        {activations.slice(0, 5).map((activation: any) => {
          const isActive = activation.status === "active";
          const date = activation.activated_at
            ? new Date(activation.activated_at).toLocaleDateString()
            : "—";

          return (
            <Box
              key={activation.id}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                p: "12px",
                borderRadius: "4px",
                border: `1px solid ${borderPalette.light}`,
                background: isActive ? alpha(brand.primary, 0.04) : background.main,
              }}
            >
              <Stack direction="row" gap="16px" alignItems="center" flexWrap="wrap">
                <Typography sx={{ fontSize: 13, fontWeight: 500, color: text.primary }}>
                  {activation.scenario_name || `Scenario #${activation.scenario_id}`}
                </Typography>
                <GovernanceTooltip
                  header="Activation status"
                  description="Whether this scenario activation is currently active"
                >
                  <Box
                    component="span"
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 20,
                      px: 1,
                      borderRadius: "4px",
                      fontSize: 11,
                      fontWeight: isActive ? 500 : 400,
                      backgroundColor: isActive ? status.success.bg : background.hover,
                      color: isActive ? status.success.text : text.muted,
                      border: `1px solid ${isActive ? status.success.border : borderPalette.light}`,
                    }}
                  >
                    {isActive ? "Active" : "Inactive"}
                  </Box>
                </GovernanceTooltip>
                <Typography sx={{ fontSize: 12, color: text.muted }}>{date}</Typography>
                <Typography sx={{ fontSize: 12, color: text.secondary }}>
                  {activation.tasks_created} task(s)
                </Typography>
                <Typography sx={{ fontSize: 12, color: text.secondary }}>
                  {activation.frameworks_assigned} framework(s)
                </Typography>
              </Stack>

              {isActive && (
                <GovernanceTooltip
                  header="Deactivate activation"
                  description="Stop this active activation and remove its tasks"
                >
                  <span>
                    <CustomizableButton
                      size="small"
                      variant="text"
                      startIcon={<XCircle size={14} />}
                      text="Deactivate"
                      onClick={() => handleDeactivate(activation.id)}
                      isDisabled={deactivateMutation.isPending}
                      sx={{
                        fontSize: 12,
                        color: status.error.text,
                        minWidth: 0,
                      }}
                    />
                  </span>
                </GovernanceTooltip>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

export default ActivationHistory;
