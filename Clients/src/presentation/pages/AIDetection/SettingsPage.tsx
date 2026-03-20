/**
 * @fileoverview AI Detection Settings Page
 *
 * Settings page for AI Detection configuration.
 * Currently supports GitHub token management for private repository access.
 *
 * @module pages/AIDetection/SettingsPage
 */

import { useState, useEffect, useCallback, Suspense } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  InputAdornment,
  IconButton,
  Slider,
  SelectChangeEvent,
  Chip,
} from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import TabPanel from "@mui/lab/TabPanel";
import {
  Eye,
  EyeOff,
  Trash2,
  ExternalLink,
  Info,
  RotateCcw,
} from "lucide-react";
import Toggle from "../../components/Inputs/Toggle";
import Select from "../../components/Inputs/Select";
import TabBar from "../../components/TabBar";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import Field from "../../components/Inputs/Field";
import { CustomizableButton } from "../../components/button/customizable-button";
import Alert from "../../components/Alert";
import {
  getGitHubTokenStatus,
  saveGitHubToken,
  deleteGitHubToken,
  testGitHubToken,
  GitHubTokenStatus,
  GitHubTokenTestResult,
} from "../../../application/repository/githubToken.repository";
import {
  getRiskScoringConfig,
  updateRiskScoringConfig,
} from "../../../application/repository/aiDetection.repository";
import { getLLMKeys } from "../../../application/repository/llmKeys.repository";
import { LLMKeysModel } from "../../../domain/models/Common/llmKeys/llmKeys.model";
import {
  DimensionKey,
  RiskScoringConfig,
  VulnerabilityTypeKey,
  DIMENSION_LABELS,
  DIMENSION_DESCRIPTIONS,
  DIMENSION_ORDER,
  DEFAULT_DIMENSION_WEIGHTS,
  VULNERABILITY_TYPES,
  DEFAULT_VULNERABILITY_TYPES_ENABLED,
} from "../../../domain/ai-detection/riskScoringTypes";
import { palette } from "../../themes/palette";

interface ToastAlert {
  variant: "success" | "error" | "warning" | "info";
  body: string;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("github");
  const [tokenStatus, setTokenStatus] = useState<GitHubTokenStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenNameInput, setTokenNameInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [alert, setAlert] = useState<ToastAlert | null>(null);

  // Risk scoring state
  const [_riskConfig, setRiskConfig] = useState<RiskScoringConfig | null>(null);
  const [riskConfigLoading, setRiskConfigLoading] = useState(false);
  const [riskConfigSaving, setRiskConfigSaving] = useState(false);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmKeyId, setLlmKeyId] = useState<number | null>(null);
  const [dimensionWeights, setDimensionWeights] = useState<Record<DimensionKey, number>>(
    { ...DEFAULT_DIMENSION_WEIGHTS }
  );
  const [llmKeys, setLlmKeys] = useState<LLMKeysModel[]>([]);
  const [vulnerabilityScanEnabled, setVulnerabilityScanEnabled] = useState(false);
  const [vulnerabilityTypesEnabled, setVulnerabilityTypesEnabled] = useState<Record<VulnerabilityTypeKey, boolean>>(
    { ...DEFAULT_VULNERABILITY_TYPES_ENABLED }
  );

  // Load token status on mount
  const loadTokenStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const status = await getGitHubTokenStatus();
      setTokenStatus(status);
    } catch (err) {
      console.error("Failed to load token status:", err);
      setAlert({ variant: "error", body: "Failed to load token status" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokenStatus();
  }, [loadTokenStatus]);

  // Load risk scoring config and LLM keys
  const loadRiskConfig = useCallback(async () => {
    setRiskConfigLoading(true);
    try {
      const [config, keysResponse] = await Promise.all([
        getRiskScoringConfig(),
        getLLMKeys(),
      ]);
      setRiskConfig(config);
      setLlmEnabled(config.llm_enabled);
      setLlmKeyId(config.llm_key_id);
      setDimensionWeights(config.dimension_weights);
      setVulnerabilityScanEnabled(config.vulnerability_scan_enabled ?? false);
      setVulnerabilityTypesEnabled(config.vulnerability_types_enabled ?? { ...DEFAULT_VULNERABILITY_TYPES_ENABLED });

      const keys = keysResponse?.data?.data || keysResponse?.data || [];
      setLlmKeys(Array.isArray(keys) ? keys : []);
    } catch (err) {
      console.error("Failed to load risk scoring config:", err);
    } finally {
      setRiskConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRiskConfig();
  }, [loadRiskConfig]);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  };

  const handleTestToken = async () => {
    if (!tokenInput.trim()) {
      setAlert({ variant: "error", body: "Please enter a token to test" });
      return;
    }

    setIsTesting(true);

    try {
      const result: GitHubTokenTestResult = await testGitHubToken(tokenInput);
      if (result.valid) {
        setAlert({ variant: "success", body: "Token is valid" });
      } else {
        setAlert({ variant: "error", body: result.error || "Token is invalid" });
      }
    } catch (err) {
      setAlert({ variant: "error", body: err instanceof Error ? err.message : "Failed to test token" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) {
      setAlert({ variant: "error", body: "Please enter a token" });
      return;
    }

    setIsSaving(true);

    try {
      const status = await saveGitHubToken(
        tokenInput,
        tokenNameInput.trim() || undefined
      );
      setTokenStatus(status);
      setTokenInput("");
      setTokenNameInput("");
      setAlert({ variant: "success", body: "GitHub token saved successfully" });
    } catch (err) {
      setAlert({ variant: "error", body: err instanceof Error ? err.message : "Failed to save token" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteToken = async () => {
    setIsDeleting(true);

    try {
      await deleteGitHubToken();
      setTokenStatus({ configured: false });
      setAlert({ variant: "success", body: "GitHub token deleted successfully" });
    } catch (err) {
      setAlert({ variant: "error", body: err instanceof Error ? err.message : "Failed to delete token" });
    } finally {
      setIsDeleting(false);
    }
  };

  // Risk scoring handlers
  const handleWeightChange = (key: DimensionKey, newValue: number) => {
    setDimensionWeights((prev) => ({ ...prev, [key]: newValue }));
  };

  const handleResetWeights = () => {
    setDimensionWeights({ ...DEFAULT_DIMENSION_WEIGHTS });
  };

  const weightsTotal = Object.values(dimensionWeights).reduce((sum, w) => sum + w, 0);
  const weightsValid = Math.abs(weightsTotal - 1.0) < 0.02;

  const handleSaveRiskConfig = async () => {
    if (!weightsValid) {
      setAlert({ variant: "error", body: "Dimension weights must sum to 100%" });
      return;
    }
    if (llmEnabled && !llmKeyId) {
      setAlert({ variant: "error", body: "Please select an LLM key or disable LLM analysis" });
      return;
    }
    setRiskConfigSaving(true);
    try {
      const updated = await updateRiskScoringConfig({
        llm_enabled: llmEnabled,
        llm_key_id: llmEnabled ? llmKeyId : null,
        dimension_weights: dimensionWeights,
        vulnerability_scan_enabled: llmEnabled ? vulnerabilityScanEnabled : false,
        vulnerability_types_enabled: vulnerabilityTypesEnabled,
      });
      setRiskConfig(updated);
      setAlert({ variant: "success", body: "Risk scoring settings saved" });
    } catch (err) {
      setAlert({ variant: "error", body: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setRiskConfigSaving(false);
    }
  };

  if (isLoading) {
    return (
      <PageHeaderExtended title="Settings" description="Configure integrations and tokens for AI detection scanning.">
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: 300,
          }}
        >
          <CircularProgress size={32} />
        </Box>
      </PageHeaderExtended>
    );
  }

  return (
    <PageHeaderExtended
      title="Settings"
      description="Configure integrations and tokens for AI detection scanning."
      helpArticlePath="ai-detection/settings"
      alert={
        alert ? (
          <Suspense fallback={null}>
            <Alert
              variant={alert.variant}
              body={alert.body}
              isToast={true}
              onClick={() => setAlert(null)}
            />
          </Suspense>
        ) : undefined
      }
    >
      <TabContext value={activeTab}>
        <TabBar
          tabs={[
            {
              label: "GitHub integration",
              value: "github",
              icon: "Github",
              tooltip: "Connect a GitHub token to scan private repositories",
            },
            {
              label: "Risk scoring",
              value: "risk-scoring",
              icon: "Shield",
              tooltip: "Configure AI Governance Risk Score settings",
            },
          ]}
          activeTab={activeTab}
          onChange={handleTabChange}
        />

        <TabPanel value="github" sx={{ p: 0, pt: "8px" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* Help Text */}
            <Box>
              <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
                To scan private repositories, you need a GitHub Personal Access
                Token with <strong>repo</strong> scope (for private repos) or{" "}
                <strong>public_repo</strong> scope (for public repos only).
              </Typography>
              <Typography
                component="a"
                href="https://github.com/settings/tokens/new?description=VerifyWise%20Scanner&scopes=repo"
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  fontSize: 13,
                  color: palette.brand.primary,
                  textDecoration: "none",
                  mt: 0.5,
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                Create a new token on GitHub
                <ExternalLink size={12} />
              </Typography>
            </Box>

            {/* Current Status */}
            {tokenStatus?.configured && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  p: "8px",
                  borderRadius: "4px",
                  backgroundColor: "rgba(19, 113, 91, 0.08)",
                  border: "1px solid rgba(19, 113, 91, 0.2)",
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography
                    sx={{ fontSize: 14, fontWeight: 500, color: palette.brand.primary }}
                  >
                    Token configured
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                    {tokenStatus.token_name || "GitHub Personal Access Token"}
                  </Typography>
                </Box>
                <CustomizableButton
                  variant="text"
                  size="small"
                  onClick={handleDeleteToken}
                  isDisabled={isDeleting}
                  sx={{ color: palette.status.error.text, minWidth: "auto", p: 1 }}
                >
                  {isDeleting ? (
                    <CircularProgress size={16} />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </CustomizableButton>
              </Box>
            )}

            {/* Token Input Form */}
            <Field
              label="Personal access token"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={tokenInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setTokenInput(e.target.value);
              }}
              type={showToken ? "text" : "password"}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowToken(!showToken)}
                      edge="end"
                    >
                      {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Field
              label="Token name (optional)"
              placeholder="e.g., VerifyWise Scanner Token"
              value={tokenNameInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setTokenNameInput(e.target.value)
              }
            />

            {/* Action Buttons */}
            <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
              <CustomizableButton
                variant="outlined"
                onClick={handleTestToken}
                isDisabled={!tokenInput.trim() || isTesting}
                loading={isTesting}
              >
                Test token
              </CustomizableButton>
              <CustomizableButton
                variant="contained"
                onClick={handleSaveToken}
                isDisabled={!tokenInput.trim() || isSaving}
                loading={isSaving}
              >
                {tokenStatus?.configured ? "Update token" : "Save token"}
              </CustomizableButton>
            </Box>
          </Box>
        </TabPanel>
        <TabPanel value="risk-scoring" sx={{ p: 0, pt: "8px" }}>
          {riskConfigLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* LLM-enhanced analysis toggle */}
              <Box
                sx={{
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px",
                  p: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <Typography sx={{ fontSize: 15, fontWeight: 600, color: palette.text.primary }}>
                  LLM-enhanced analysis
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Box>
                    <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                      Use an LLM to provide contextual narrative, cross-finding correlation, and
                      actionable recommendations alongside rule-based scoring.
                    </Typography>
                  </Box>
                  <Toggle
                    checked={llmEnabled}
                    onChange={(e) => setLlmEnabled(e.target.checked)}
                    size="small"
                  />
                </Box>

                {llmEnabled && (
                  <Box>
                    <Select
                      id="llm-key-select"
                      label="LLM provider"
                      placeholder="Select an LLM key"
                      value={llmKeyId ?? ""}
                      items={llmKeys.map((key) => ({
                        _id: key.id,
                        name: `${key.name} — ${key.model}`,
                      }))}
                      onChange={(e: SelectChangeEvent<string | number>) =>
                        setLlmKeyId(e.target.value ? Number(e.target.value) : null)
                      }
                      sx={{ maxWidth: 360 }}
                    />
                    {llmKeys.length === 0 && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: "8px", mt: "8px" }}>
                        <Info size={12} color={palette.text.accent} strokeWidth={1.5} />
                        <Typography sx={{ fontSize: 12, color: palette.text.accent }}>
                          Configure LLM keys in Settings → Organization → LLM keys
                        </Typography>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>

              {/* Vulnerability scanning */}
              <Box
                sx={{
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px",
                  p: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  opacity: llmEnabled ? 1 : 0.5,
                }}
              >
                <Box>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 600, color: palette.text.primary }}>
                      Vulnerability detection
                    </Typography>
                    <Toggle
                      checked={vulnerabilityScanEnabled}
                      onChange={(e) => setVulnerabilityScanEnabled(e.target.checked)}
                      size="small"
                      disabled={!llmEnabled}
                    />
                  </Box>
                  <Typography sx={{ fontSize: 13, color: palette.text.secondary, mt: "4px" }}>
                    Use LLM analysis to detect security vulnerabilities in scanned code.
                    Uses additional LLM API tokens per scan. Patterns are adapted from
                    Promptfoo redteam graders and mapped to the OWASP LLM Top 10.
                  </Typography>
                </Box>

                {!llmEnabled && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Info size={12} color={palette.text.tertiary} strokeWidth={1.5} />
                    <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                      Enable LLM-enhanced analysis above to use vulnerability detection.
                    </Typography>
                  </Box>
                )}

                {/* Per-type vulnerability cards */}
                {vulnerabilityScanEnabled && llmEnabled && (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {VULNERABILITY_TYPES.map((vulnType) => (
                      <Box
                        key={vulnType.key}
                        sx={{
                          border: `1px solid ${palette.border.dark}`,
                          borderRadius: "4px",
                          p: "12px",
                          opacity: vulnerabilityTypesEnabled[vulnType.key] ? 1 : 0.6,
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>
                              {vulnType.name}
                            </Typography>
                            <Chip
                              label={vulnType.owaspId}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: 11,
                                fontWeight: 600,
                                backgroundColor: palette.background.alt,
                                color: palette.text.secondary,
                              }}
                            />
                          </Box>
                          <Toggle
                            checked={vulnerabilityTypesEnabled[vulnType.key]}
                            onChange={(e) =>
                              setVulnerabilityTypesEnabled((prev) => ({
                                ...prev,
                                [vulnType.key]: e.target.checked,
                              }))
                            }
                            size="small"
                          />
                        </Box>
                        <Typography sx={{ fontSize: 12, color: palette.text.secondary, mt: "4px" }}>
                          {vulnType.description}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>

              {/* Dimension weights */}
              <Box
                sx={{
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px",
                  p: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 600, color: palette.text.primary }}>
                    Dimension weights
                  </Typography>
                  <CustomizableButton
                    variant="text"
                    size="small"
                    onClick={handleResetWeights}
                    sx={{ fontSize: 12, textTransform: "none", minWidth: "auto" }}
                  >
                    <RotateCcw size={12} style={{ marginRight: 4 }} />
                    Reset to defaults
                  </CustomizableButton>
                </Box>

                {DIMENSION_ORDER.map((key) => {
                  const pct = Math.round(dimensionWeights[key] * 100);
                  return (
                    <Box key={key}>
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Box>
                          <Typography sx={{ fontSize: 13, fontWeight: 500, color: palette.text.primary }}>
                            {DIMENSION_LABELS[key]}
                          </Typography>
                          <Typography sx={{ fontSize: 13, color: palette.text.accent }}>
                            {DIMENSION_DESCRIPTIONS[key]}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 500, color: palette.text.primary, fontFamily: "monospace", flexShrink: 0 }}>
                          {pct}%
                        </Typography>
                      </Box>
                      <Slider
                        value={pct}
                        onChange={(_, val) => handleWeightChange(key, (val as number) / 100)}
                        min={0}
                        max={100}
                        step={1}
                        size="small"
                        sx={{
                          color: palette.brand.primary,
                          height: 4,
                          "& .MuiSlider-thumb": {
                            width: 14,
                            height: 14,
                          },
                        }}
                      />
                    </Box>
                  );
                })}

                <Box sx={{ display: "flex", justifyContent: "space-between", pt: "8px", borderTop: `1px solid ${palette.border.light}` }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: weightsValid ? palette.text.secondary : palette.status.error.text }}>
                    Total: {Math.round(weightsTotal * 100)}%
                  </Typography>
                  {!weightsValid && (
                    <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>
                      Weights must sum to 100%
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Save button */}
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <CustomizableButton
                  variant="contained"
                  onClick={handleSaveRiskConfig}
                  isDisabled={riskConfigSaving || !weightsValid}
                  loading={riskConfigSaving}
                >
                  Save
                </CustomizableButton>
              </Box>
            </Box>
          )}
        </TabPanel>
      </TabContext>
    </PageHeaderExtended>
  );
}
