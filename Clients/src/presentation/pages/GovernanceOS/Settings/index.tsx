import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Stack,
  Alert,
  FormControlLabel,
  CircularProgress,
  alpha,
} from "@mui/material";
import { Power, Bell, Target, Filter, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import GovernanceLayout from "../shared/GovernanceLayout";
import Toggle from "../../../components/Inputs/Toggle";
import Checkbox from "../../../components/Inputs/Checkbox";
import FrameworkChip from "../../../components/GovernanceOS/FrameworkChip";
import GovernanceTooltip from "../../../components/GovernanceOS/GovernanceTooltip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import {
  useGovernancePreferences,
  useUpdatePreferences,
} from "../../../../application/hooks/useGovernanceOs";
import { useIsAdmin } from "../../../../application/hooks/useIsAdmin";
import { border as borderPalette, background, text, brand } from "../../../themes/palette";

const FRAMEWORK_NAMES: Record<number, string> = {
  1: "EU AI Act",
  2: "ISO 42001",
  3: "ISO 27001",
  4: "NIST AI RMF",
};

const GovernanceSettings: React.FC = () => {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const { data: preferences, isLoading: prefsLoading } = useGovernancePreferences();
  const updatePrefsMutation = useUpdatePreferences();

  const [isEnabled, setIsEnabled] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [alert, setAlert] = useState<{ variant: "success" | "error"; message: string } | null>(
    null,
  );

  useEffect(() => {
    if (preferences) {
      setIsEnabled(preferences.is_enabled ?? false);
      setDontAskAgain(preferences.dont_ask_governance_os ?? false);
    }
  }, [preferences]);

  const handleSave = () => {
    updatePrefsMutation.mutate(
      {
        is_enabled: isEnabled,
        dont_ask_governance_os: dontAskAgain,
      },
      {
        onSuccess: () => {
          setAlert({ variant: "success", message: "Settings saved successfully." });
          setTimeout(() => setAlert(null), 4000);
        },
        onError: () => {
          setAlert({ variant: "error", message: "Failed to save settings. Please try again." });
          setTimeout(() => setAlert(null), 4000);
        },
      },
    );
  };

  const activeScenarioId = preferences?.selected_scenario_id;
  const customPriority = preferences?.custom_framework_priority as {
    primary?: number;
    secondary?: number[];
    supplementary?: number[];
  } | null;

  if (prefsLoading) {
    return (
      <GovernanceLayout title="Settings" subtitle="Manage Governance Intelligence configuration">
        <Box sx={{ display: "flex", justifyContent: "center", py: "48px" }}>
          <CircularProgress size={32} />
        </Box>
      </GovernanceLayout>
    );
  }

  return (
    <GovernanceLayout
      title="Settings"
      subtitle="Manage Governance Intelligence configuration, preferences, and defaults."
    >
      <Stack gap="16px">
        {alert && (
          <Alert severity={alert.variant} sx={{ fontSize: 13 }}>
            {alert.message}
          </Alert>
        )}

        {/* Module Status */}
        <SettingsSection
          icon={<Power size={18} color={brand.primary} />}
          title="Module Status"
          description="Enable or disable the Governance Intelligence module for your organization."
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              p: "16px",
              border: `1px solid ${borderPalette.dark}`,
              borderRadius: "4px",
              background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
            }}
          >
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500, color: text.primary }}>
                Governance Intelligence
              </Typography>
              <Typography sx={{ fontSize: 12, color: text.muted }}>
                {isEnabled
                  ? "Module is enabled and visible."
                  : "Module is disabled and hidden from sidebar."}
              </Typography>
            </Box>
            <GovernanceTooltip
              header="Module Status"
              description="Toggle Governance Intelligence on or off for your organization. Only admins can change this."
            >
              <span>
                <FormControlLabel
                  control={
                    <Toggle
                      checked={isEnabled}
                      onChange={(e) => setIsEnabled(e.target.checked)}
                      disabled={!isAdmin}
                    />
                  }
                  label=""
                />
              </span>
            </GovernanceTooltip>
          </Box>
          {!isAdmin && (
            <Typography sx={{ fontSize: 11, color: text.muted, mt: "4px" }}>
              Only admins can change module status.
            </Typography>
          )}
        </SettingsSection>

        {/* Active Scenario */}
        <SettingsSection
          icon={<Target size={18} color={brand.primary} />}
          title="Active Scenario"
          description="The currently selected governance scenario drives framework prioritization across projects."
        >
          <Box
            sx={{
              p: "16px",
              border: `1px solid ${borderPalette.dark}`,
              borderRadius: "4px",
              background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
            }}
          >
            {activeScenarioId ? (
              <Stack gap="12px">
                <Typography sx={{ fontSize: 13, fontWeight: 500, color: text.primary }}>
                  Scenario ID: {activeScenarioId}
                </Typography>
                {customPriority && (
                  <Stack direction="row" flexWrap="wrap" gap="6px">
                    {customPriority.primary && (
                      <FrameworkChip
                        frameworkName={
                          FRAMEWORK_NAMES[customPriority.primary] || String(customPriority.primary)
                        }
                        priority="primary"
                        size="small"
                      />
                    )}
                    {customPriority.secondary?.map((id: number) => (
                      <FrameworkChip
                        key={id}
                        frameworkName={FRAMEWORK_NAMES[id] || String(id)}
                        priority="secondary"
                        size="small"
                      />
                    ))}
                  </Stack>
                )}
                <Box>
                  <GovernanceTooltip
                    header="Change scenario"
                    description="Switch to a different governance scenario to update framework priorities."
                  >
                    <span>
                      <CustomizableButton
                        size="small"
                        variant="outlined"
                        onClick={() => navigate("/governance/scenarios")}
                        text="Change scenario"
                      />
                    </span>
                  </GovernanceTooltip>
                </Box>
              </Stack>
            ) : (
              <Stack gap="12px">
                <Typography sx={{ fontSize: 13, color: text.accent }}>
                  No active scenario selected.
                </Typography>
                <GovernanceTooltip
                  header="Choose scenario"
                  description="Select or create a governance scenario to activate framework prioritization across projects."
                >
                  <span>
                    <CustomizableButton
                      size="small"
                      variant="contained"
                      onClick={() => navigate("/governance/scenarios")}
                      text="Choose scenario"
                    />
                  </span>
                </GovernanceTooltip>
              </Stack>
            )}
          </Box>
        </SettingsSection>

        {/* Smart Prompt Preferences */}
        <SettingsSection
          icon={<Bell size={18} color={brand.primary} />}
          title="Smart Prompt Preferences"
          description="Control whether the system prompts you to enable Governance Intelligence when conditions are met."
        >
          <Box
            sx={{
              p: "16px",
              border: `1px solid ${borderPalette.dark}`,
              borderRadius: "4px",
              background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <GovernanceTooltip
                header="Smart Prompt Preference"
                description="Stop the system from prompting you to enable Governance Intelligence in the future."
              >
                <span>
                  <Checkbox
                    id="dont-ask-governance-os"
                    isChecked={dontAskAgain}
                    value="dont-ask"
                    onChange={() => setDontAskAgain((prev) => !prev)}
                  />
                </span>
              </GovernanceTooltip>
              <Typography sx={{ fontSize: 13, color: text.primary }}>
                Don&apos;t ask me again about enabling Governance Intelligence
              </Typography>
            </Box>
            <Box sx={{ mt: "12px" }}>
              <GovernanceTooltip
                header="Reset prompt preference"
                description="Re-enable the smart prompt that suggests turning on Governance Intelligence."
              >
                <span>
                  <CustomizableButton
                    size="small"
                    variant="text"
                    onClick={() => setDontAskAgain(false)}
                    isDisabled={!dontAskAgain}
                    text="Reset prompt preference"
                  />
                </span>
              </GovernanceTooltip>
            </Box>
          </Box>
        </SettingsSection>

        {/* Mapping Filters */}
        <SettingsSection
          icon={<Filter size={18} color={brand.primary} />}
          title="Mapping Filters"
          description="Default filters applied to the Framework Mapper view."
        >
          <Box
            sx={{
              p: "16px",
              border: `1px solid ${borderPalette.dark}`,
              borderRadius: "4px",
              background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
            }}
          >
            {preferences?.active_mapping_filters ? (
              <Typography sx={{ fontSize: 13, color: text.accent }}>
                Custom filters: {JSON.stringify(preferences.active_mapping_filters)}
              </Typography>
            ) : (
              <Typography sx={{ fontSize: 13, color: text.muted }}>
                No default filters configured. Filters are set per-session in the Framework Mapper.
              </Typography>
            )}
            <Box sx={{ mt: "12px" }}>
              <GovernanceTooltip
                header="Open Framework Mapper"
                description="Go to the Framework Mapper to configure filters for your session."
              >
                <span>
                  <CustomizableButton
                    size="small"
                    variant="outlined"
                    onClick={() => navigate("/governance/framework-mapper")}
                    text="Open Framework Mapper"
                  />
                </span>
              </GovernanceTooltip>
            </Box>
          </Box>
        </SettingsSection>

        {/* Save */}
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <GovernanceTooltip
            header="Save changes"
            description="Save your Governance Intelligence preferences."
          >
            <span>
              <CustomizableButton
                variant="contained"
                size="small"
                startIcon={<Save size={14} />}
                onClick={handleSave}
                isDisabled={updatePrefsMutation.isPending}
                text={updatePrefsMutation.isPending ? "Saving..." : "Save changes"}
              />
            </span>
          </GovernanceTooltip>
        </Box>
      </Stack>
    </GovernanceLayout>
  );
};

const SettingsSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ icon, title, description, children }) => (
  <Box>
    <Stack direction="row" gap="12px" alignItems="center" sx={{ mb: "12px" }}>
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          backgroundColor: alpha(brand.primary, 0.08),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: text.primary }}>{title}</Typography>
        <Typography sx={{ fontSize: 12, color: text.muted }}>{description}</Typography>
      </Box>
    </Stack>
    {children}
  </Box>
);

export default GovernanceSettings;
