import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Typography, Stack, IconButton, Collapse } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import { CirclePlus, Key, Wallet, Trash2, Pencil, Lock, Router, AlertTriangle, ChevronDown, ChevronRight, Check, X, Play } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import StandardModal from "../../../components/Modals/StandardModal";
import Toggle from "../../../components/Inputs/Toggle";
import TabBar from "../../../components/TabBar";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import palette from "../../../themes/palette";
import { sectionTitleSx, useCardSx, ProviderIcon, TOP_PROVIDERS } from "../shared";
import VirtualKeysTab from "../VirtualKeys/index";
import { validateApiKeyFormat } from "../../../../application/utils/apiKeyValidation";

const TOP_IDS = new Set(TOP_PROVIDERS.map((p) => p._id));

const TABS = [
  { label: "API keys", value: "api-keys", icon: "Key" as const },
  { label: "Budget", value: "budget", icon: "Wallet" as const },
  { label: "Virtual keys", value: "virtual-keys", icon: "KeyRound" as const },
  { label: "Guardrail settings", value: "guardrails", icon: "Shield" as const },
  { label: "Suggested risks", value: "risks", icon: "AlertTriangle" as const },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#DC2626",
  high: "#EA580C",
  medium: "#D97706",
  low: "#2563EB",
};

/** Metadata for each risk condition — description + human-readable threshold labels */
const CONDITION_META: Record<string, { description: string; thresholdLabels: Record<string, string> }> = {
  pii_exposure: {
    description: "Flags when users send personal data (names, emails, SSNs) to LLM providers above a threshold.",
    thresholdLabels: { count: "Detections", period_days: "Window (days)" },
  },
  no_guardrails: {
    description: "Flags when active endpoints have zero guardrail rules configured — all traffic flows unchecked.",
    thresholdLabels: {},
  },
  budget_exhaustion: {
    description: "Flags when monthly AI Gateway spend approaches the configured budget limit.",
    thresholdLabels: { pct: "Alert at (%)" },
  },
  provider_concentration: {
    description: "Flags when most of the spend is concentrated on a single LLM provider, increasing vendor risk.",
    thresholdLabels: { pct: "Concentration (%)" },
  },
  error_rate_spike: {
    description: "Flags when the 24-hour error rate exceeds a multiple of the 7-day average, indicating provider issues.",
    thresholdLabels: { multiplier: "Spike factor (x)" },
  },
  cost_anomaly: {
    description: "Flags when today's spend exceeds a multiple of the 7-day daily average, catching unexpected surges.",
    thresholdLabels: { multiplier: "Spike factor (x)" },
  },
  stale_virtual_key: {
    description: "Flags virtual keys that are old but still actively used — rotating keys reduces exposure.",
    thresholdLabels: { age_days: "Key age (days)", min_spend_usd: "Min spend ($)" },
  },
  unused_endpoint: {
    description: "Flags active endpoints with zero requests, which increase the attack surface unnecessarily.",
    thresholdLabels: { inactive_days: "Inactive (days)" },
  },
};

interface RiskSetting {
  condition_id: string;
  label: string;
  default_threshold: Record<string, any>;
  default_severity: string;
  is_enabled: boolean;
  threshold: Record<string, any>;
  severity_override: string | null;
}

interface RiskSuggestion {
  id: number;
  condition_id: string;
  title: string;
  description: string;
  severity: string;
  evidence: Record<string, any>;
  compliance_tags: string[];
  suggested_mitigation: string | null;
  status: "pending" | "accepted" | "dismissed";
  accepted_risk_id?: number;
  dismiss_reason?: string;
  created_at: string;
  reviewed_at?: string;
  reviewed_by_name?: string;
}

export default function AIGatewaySettingsPage() {
  const cardSx = useCardSx();
  const { tab: urlTab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const VALID_TABS = TABS.map((t) => t.value);
  const activeTab = urlTab && VALID_TABS.includes(urlTab) ? urlTab : "api-keys";
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [budget, setBudget] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [providerItems, setProviderItems] = useState(TOP_PROVIDERS);

  // API Key modal state
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [keyForm, setKeyForm] = useState({ key_name: "", provider: "", api_key: "" });
  const [keyError, setKeyError] = useState("");
  const [keySubmitting, setKeySubmitting] = useState(false);
  const [keyDeleteTarget, setKeyDeleteTarget] = useState<any>(null);
  const [keyDeleting, setKeyDeleting] = useState(false);

  // Budget modal state
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [budgetForm, setBudgetForm] = useState({
    monthly_limit_usd: "",
    alert_threshold_pct: "80",
    is_hard_limit: false,
  });
  const [budgetSubmitting, setBudgetSubmitting] = useState(false);

  // Guardrail settings state
  const [, setGuardrailSettings] = useState<any>(null);
  const [gsForm, setGsForm] = useState({
    pii_on_error: "block",
    content_filter_on_error: "allow",
    pii_replacement_format: "<ENTITY_TYPE>",
    content_filter_replacement: "[REDACTED]",
    log_retention_days: "90",
    log_request_body: false,
    log_response_body: false,
  });
  const [gsSaving, setGsSaving] = useState(false);
  const [spendPurgeResult, setSpendPurgeResult] = useState("");

  // Cache settings
  const [cacheSettings, setCacheSettings] = useState({
    cache_global_enabled: true,
    cache_default_ttl_seconds: "14400",
    cache_max_entries_per_org: "50000",
  });
  const [cacheSaving, setCacheSaving] = useState(false);
  const [cachePurgeResult, setCachePurgeResult] = useState("");

  // Risk suggestions state
  const [riskSettings, setRiskSettings] = useState<RiskSetting[]>([]);
  const [riskSettingsDirty, setRiskSettingsDirty] = useState(false);
  const [riskSettingsSaving, setRiskSettingsSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<RiskSuggestion[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [acceptTarget, setAcceptTarget] = useState<RiskSuggestion | null>(null);
  const [acceptForm, setAcceptForm] = useState({ risk_name: "", risk_description: "", severity: "", mitigation_plan: "" });
  const [acceptSubmitting, setAcceptSubmitting] = useState(false);
  const [dismissTarget, setDismissTarget] = useState<RiskSuggestion | null>(null);
  const [dismissModalOpen, setDismissModalOpen] = useState(false);
  const [dismissReason, setDismissReason] = useState("");
  const [dismissSubmitting, setDismissSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [keysRes, budgetRes, providersRes, gsRes] = await Promise.all([
        apiServices.get<Record<string, any>>("/ai-gateway/keys"),
        apiServices.get<Record<string, any>>("/ai-gateway/budget"),
        apiServices.get<{ data: any; providers?: string[] }>("/ai-gateway/providers").catch(() => null),
        apiServices.get<Record<string, any>>("/ai-gateway/guardrails/settings").catch(() => null),
      ]);
      setApiKeys(keysRes?.data?.data || []);
      setBudget(budgetRes?.data?.data || null);

      const dynamicProviders: string[] = providersRes?.data?.data?.providers || [];
      const otherProviders = dynamicProviders
        .filter((p) => !TOP_IDS.has(p))
        .sort()
        .map((p) => ({ _id: p, name: p }));

      if (otherProviders.length > 0) {
        setProviderItems([...TOP_PROVIDERS, ...otherProviders]);
        
      }

      const gs = gsRes?.data?.settings;
      if (gs) {
        setGuardrailSettings(gs);
        setGsForm({
          pii_on_error: gs.pii_on_error || "block",
          content_filter_on_error: gs.content_filter_on_error || "allow",
          pii_replacement_format: gs.pii_replacement_format || "<ENTITY_TYPE>",
          content_filter_replacement: gs.content_filter_replacement || "[REDACTED]",
          log_retention_days: String(gs.log_retention_days ?? 90),
          log_request_body: gs.log_request_body || false,
          log_response_body: gs.log_response_body || false,
        });
        // Cache settings live on the same guardrail_settings row
        if (gs.cache_global_enabled !== undefined) {
          setCacheSettings({
            cache_global_enabled: gs.cache_global_enabled ?? true,
            cache_default_ttl_seconds: String(gs.cache_default_ttl_seconds ?? 14400),
            cache_max_entries_per_org: String(gs.cache_max_entries_per_org ?? 50000),
          });
        }
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRiskData = useCallback(async () => {
    try {
      const [settingsRes, suggestionsRes] = await Promise.all([
        apiServices.get<Record<string, any>>("/ai-gateway/risk-settings").catch(() => null),
        apiServices.get<Record<string, any>>("/ai-gateway/risk-suggestions").catch(() => null),
      ]);
      if (settingsRes?.data) {
        setRiskSettings(settingsRes.data?.settings || settingsRes.data);
        setRiskSettingsDirty(false);
      }
      if (suggestionsRes?.data) {
        setSuggestions(suggestionsRes.data?.suggestions || suggestionsRes.data);
      }
    } catch {
      // Silently handle
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (activeTab === "risks") loadRiskData(); }, [activeTab, loadRiskData]);

  const handleCreateKey = async () => {
    if (!keyForm.key_name || !keyForm.provider || !keyForm.api_key) {
      setKeyError("All fields are required");
      return;
    }

    // Step 1: Client-side format validation
    const formatCheck = validateApiKeyFormat(keyForm.provider, keyForm.api_key);
    if (!formatCheck.valid) {
      setKeyError(formatCheck.error || "Invalid key format");
      return;
    }

    setKeySubmitting(true);
    setKeyError("");
    try {
      // Step 2: Live provider verification
      const verifyRes = await apiServices.post<Record<string, any>>("/ai-gateway/keys/verify", {
        provider: keyForm.provider,
        api_key: keyForm.api_key,
      });
      if (verifyRes?.data?.data?.valid === false) {
        setKeyError(verifyRes.data.data.message || "API key verification failed");
        setKeySubmitting(false);
        return;
      }

      // Step 3: Save
      await apiServices.post("/ai-gateway/keys", keyForm);
      setIsKeyModalOpen(false);
      setKeyForm({ key_name: "", provider: "", api_key: "" });
      await loadData();
    } catch (err: any) {
      setKeyError(err?.response?.data?.detail || err?.response?.data?.message || "Failed to create API key");
    } finally {
      setKeySubmitting(false);
    }
  };

  const handleDeleteKeyConfirm = async () => {
    if (!keyDeleteTarget) return;
    setKeyDeleting(true);
    try {
      await apiServices.delete(`/ai-gateway/keys/${keyDeleteTarget.id}`);
      setKeyDeleteTarget(null);
      await loadData();
    } catch {
      // Silently handle
    } finally {
      setKeyDeleting(false);
    }
  };

  const handleSaveBudget = async () => {
    setBudgetSubmitting(true);
    try {
      await apiServices.put("/ai-gateway/budget", {
        monthly_limit_usd: Number(budgetForm.monthly_limit_usd),
        alert_threshold_pct: Number(budgetForm.alert_threshold_pct),
        is_hard_limit: budgetForm.is_hard_limit,
      });
      setIsBudgetModalOpen(false);
      await loadData();
    } catch {
      // Silently handle
    } finally {
      setBudgetSubmitting(false);
    }
  };

  const openBudgetModal = () => {
    if (budget) {
      setBudgetForm({
        monthly_limit_usd: String(budget.monthly_limit_usd || ""),
        alert_threshold_pct: String(budget.alert_threshold_pct || "80"),
        is_hard_limit: budget.is_hard_limit || false,
      });
    } else {
      setBudgetForm({ monthly_limit_usd: "", alert_threshold_pct: "80", is_hard_limit: false });
    }
    setIsBudgetModalOpen(true);
  };

  const handleSaveGuardrailSettings = async () => {
    setGsSaving(true);
    try {
      await apiServices.put("/ai-gateway/guardrails/settings", {
        ...gsForm,
        log_retention_days: Number(gsForm.log_retention_days) || 90,
      });
      await loadData();
    } catch {
      // Silently handle
    } finally {
      setGsSaving(false);
    }
  };

  const handleSaveCacheSettings = async () => {
    setCacheSaving(true);
    try {
      await apiServices.put("/ai-gateway/cache/settings", {
        cache_global_enabled: cacheSettings.cache_global_enabled,
        cache_default_ttl_seconds: Number(cacheSettings.cache_default_ttl_seconds) || 14400,
        cache_max_entries_per_org: Number(cacheSettings.cache_max_entries_per_org) || 50000,
      });
      await loadData();
    } catch {
      // Silently handle
    } finally {
      setCacheSaving(false);
    }
  };

  // ─── Risk suggestion handlers ──────────────────────────────────────

  const handleToggleCondition = (conditionId: string, enabled: boolean) => {
    setRiskSettings((prev) =>
      prev.map((s) => (s.condition_id === conditionId ? { ...s, is_enabled: enabled } : s))
    );
    setRiskSettingsDirty(true);
  };

  const handleThresholdChange = (conditionId: string, key: string, value: string) => {
    setRiskSettings((prev) =>
      prev.map((s) =>
        s.condition_id === conditionId
          ? { ...s, threshold: { ...s.threshold, [key]: Number(value) || 0 } }
          : s
      )
    );
    setRiskSettingsDirty(true);
  };

  const handleSaveRiskSettings = async () => {
    setRiskSettingsSaving(true);
    try {
      await Promise.all(
        riskSettings.map((s) =>
          apiServices.put(`/ai-gateway/risk-settings/${s.condition_id}`, {
            is_enabled: s.is_enabled,
            threshold: s.threshold,
            severity_override: s.severity_override,
          })
        )
      );
      setRiskSettingsDirty(false);
    } catch {
      // Silently handle
    } finally {
      setRiskSettingsSaving(false);
    }
  };

  const handleRunDetection = async () => {
    setDetecting(true);
    setDetectResult("");
    try {
      const res = await apiServices.post<Record<string, any>>("/ai-gateway/risk-suggestions/detect");
      const count = res?.data?.new_suggestions_count ?? res?.data?.data?.new_suggestions ?? 0;
      setDetectResult(count > 0 ? `${count} new suggestion${count > 1 ? "s" : ""} found` : "No new risks detected");
      await loadRiskData();
      setTimeout(() => setDetectResult(""), 5000);
    } catch {
      setDetectResult("Detection failed");
      setTimeout(() => setDetectResult(""), 3000);
    } finally {
      setDetecting(false);
    }
  };

  const openAcceptModal = (s: RiskSuggestion) => {
    setAcceptTarget(s);
    setAcceptForm({
      risk_name: s.title,
      risk_description: `${s.description}\n\nEvidence: ${JSON.stringify(s.evidence, null, 2)}`,
      severity: s.severity,
      mitigation_plan: s.suggested_mitigation || "",
    });
    setAcceptModalOpen(true);
  };

  const handleAccept = async () => {
    if (!acceptTarget) return;
    setAcceptSubmitting(true);
    try {
      await apiServices.post(`/ai-gateway/risk-suggestions/${acceptTarget.id}/accept`, {
        risk_name: acceptForm.risk_name,
        risk_description: acceptForm.risk_description,
        severity: acceptForm.severity,
        risk_category: ["Operational"],
        mitigation_plan: acceptForm.mitigation_plan,
      });
      setAcceptModalOpen(false);
      setAcceptTarget(null);
      await loadRiskData();
    } catch {
      // Silently handle
    } finally {
      setAcceptSubmitting(false);
    }
  };

  const openDismissModal = (s: RiskSuggestion) => {
    setDismissTarget(s);
    setDismissReason("");
    setDismissModalOpen(true);
  };

  const handleDismiss = async () => {
    if (!dismissTarget) return;
    setDismissSubmitting(true);
    try {
      await apiServices.post(`/ai-gateway/risk-suggestions/${dismissTarget.id}/dismiss`, {
        dismiss_reason: dismissReason,
      });
      setDismissModalOpen(false);
      setDismissTarget(null);
      await loadRiskData();
    } catch {
      // Silently handle
    } finally {
      setDismissSubmitting(false);
    }
  };

  const pendingSuggestions = suggestions.filter((s) => s.status === "pending");
  const historySuggestions = suggestions.filter((s) => s.status !== "pending");

  // no-op — threshold inputs are now inline in the condition row

  return (
    <PageHeaderExtended
      title="Settings"
      description="Manage API keys, budget, and guardrail settings for the AI Gateway."
      tipBoxEntity="ai-gateway-settings"
      helpArticlePath="ai-gateway/settings"
    >
      <TabContext value={activeTab}>
        <TabBar
          tabs={TABS}
          activeTab={activeTab}
          onChange={(_, v) => navigate(`/ai-gateway/settings/${v}`, { replace: true })}
        />

        <Box sx={{ mt: "16px" }}>
          {/* ─── API Keys tab ─────────────────────────────────────────── */}
          {activeTab === "api-keys" && (
            <Box sx={cardSx}>
              <Stack gap="12px">
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography sx={sectionTitleSx}>API keys</Typography>
                    <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mt: "4px" }}>
                      Provider API keys are encrypted at rest (AES-256-CBC) and only decrypted when proxying a request.
                    </Typography>
                  </Box>
                  <CustomizableButton
                    text="Add key"
                    icon={<CirclePlus size={14} strokeWidth={1.5} />}
                    onClick={() => {
                      setKeyForm({ key_name: "", provider: "", api_key: "" });
                      setKeyError("");
                      setIsKeyModalOpen(true);
                    }}
                  />
                </Stack>

                {loading ? null : apiKeys.length === 0 ? (
                  <EmptyState
                    icon={Key}
                    message="No API keys configured. Add a provider API key to start creating endpoints."
                    showBorder
                  >
                    <EmptyStateTip
                      icon={Lock}
                      title="Keys are encrypted at rest"
                      description="Your provider API keys are encrypted using AES-256-CBC before being stored. They are only decrypted when proxying a request and are never exposed in logs."
                    />
                    <EmptyStateTip
                      icon={Router}
                      title="Each endpoint references an API key"
                      description="After adding a key, create endpoints in the Endpoints tab. Each endpoint uses one API key to authenticate with the LLM provider."
                    />
                  </EmptyState>
                ) : (
                  <Stack gap="8px">
                    {apiKeys.map((key) => (
                      <Stack
                        key={key.id}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{
                          p: "12px 16px",
                          border: `1px solid ${palette.border.dark}`,
                          borderRadius: "4px",
                        }}
                      >
                        <Stack direction="row" alignItems="center" gap="10px">
                          <ProviderIcon provider={key.provider} size={20} />
                          <Box>
                            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                              {key.key_name}
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                              {key.provider} &middot; {key.masked_key}
                            </Typography>
                          </Box>
                        </Stack>
                        <Stack direction="row" alignItems="center" gap="8px">
                          <Typography
                            sx={{
                              fontSize: 12,
                              color: key.is_active ? palette.status.success.text : palette.text.disabled,
                              fontWeight: 500,
                            }}
                          >
                            {key.is_active ? "Active" : "Inactive"}
                          </Typography>
                          <IconButton size="small" onClick={() => setKeyDeleteTarget(key)} sx={{ p: 0.5 }}>
                            <Trash2 size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                          </IconButton>
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Box>
          )}

          {/* ─── Budget tab ───────────────────────────────────────────── */}
          {activeTab === "budget" && (
            <Box sx={cardSx}>
              <Stack gap="12px">
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography sx={sectionTitleSx}>Budget</Typography>
                    <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mt: "4px" }}>
                      Set a monthly spending limit. When hard limit is enabled, requests are rejected once exceeded.
                    </Typography>
                  </Box>
                  <CustomizableButton
                    text={budget ? "Edit budget" : "Set budget"}
                    icon={<Pencil size={14} strokeWidth={1.5} />}
                    onClick={openBudgetModal}
                  />
                </Stack>

                {loading ? null : budget ? (
                  <Stack gap="12px">
                    <Stack direction="row" justifyContent="space-between">
                      <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>Monthly limit</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                        ${Number(budget.monthly_limit_usd).toFixed(2)}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>Current spend</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                        ${Number(budget.current_spend_usd).toFixed(4)}
                      </Typography>
                    </Stack>
                    {Number(budget.monthly_limit_usd) > 0 && (
                      <Box
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: palette.border.light,
                          overflow: "hidden",
                        }}
                      >
                        <Box
                          sx={{
                            height: "100%",
                            width: `${Math.min(100, (Number(budget.current_spend_usd) / Number(budget.monthly_limit_usd)) * 100)}%`,
                            backgroundColor:
                              (Number(budget.current_spend_usd) / Number(budget.monthly_limit_usd)) * 100 >= budget.alert_threshold_pct
                                ? palette.status.error.text
                                : palette.brand.primary,
                            borderRadius: 3,
                            transition: "width 0.3s",
                          }}
                        />
                      </Box>
                    )}
                    <Stack direction="row" justifyContent="space-between">
                      <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>Alert threshold</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                        {budget.alert_threshold_pct}%
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>Hard limit</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                        {budget.is_hard_limit ? "Yes (requests rejected)" : "No (alert only)"}
                      </Typography>
                    </Stack>
                  </Stack>
                ) : (
                  <EmptyState
                    icon={Wallet}
                    message="No budget configured. All requests are allowed without cost limits."
                    showBorder
                  />
                )}
              </Stack>
            </Box>
          )}

          {/* ─── Virtual keys tab ─────────────────────────────────────── */}
          {activeTab === "virtual-keys" && (
            <VirtualKeysTab embedded />
          )}

          {/* ─── Guardrail settings tab ───────────────────────────────── */}
          {activeTab === "guardrails" && (
            <Stack gap="16px">
              {/* Save button */}
              <Stack direction="row" justifyContent="flex-end">
                <CustomizableButton
                  text={gsSaving ? "Saving..." : "Save settings"}
                  onClick={handleSaveGuardrailSettings}
                  isDisabled={gsSaving}
                />
              </Stack>

              {/* Error behavior card */}
              <Box sx={cardSx}>
                <Stack gap="8px">
                  <Typography sx={sectionTitleSx}>Error behavior</Typography>
                  <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
                    What happens when the guardrail scanner itself fails. "Fail-closed" blocks all requests for safety. "Fail-open" allows requests through.
                  </Typography>
                  <Stack direction="row" gap="16px" mt="8px">
                    <Box flex={1}>
                      <Select
                        id="pii-on-error"
                        label="PII scan on error"
                        value={gsForm.pii_on_error}
                        items={[
                          { _id: "block", name: "Block request (fail-closed)" },
                          { _id: "allow", name: "Allow request (fail-open)" },
                        ]}
                        onChange={(e) => setGsForm((p) => ({ ...p, pii_on_error: e.target.value as string }))}
                        getOptionValue={(item) => item._id}
                      />
                    </Box>
                    <Box flex={1}>
                      <Select
                        id="cf-on-error"
                        label="Content filter on error"
                        value={gsForm.content_filter_on_error}
                        items={[
                          { _id: "allow", name: "Allow request (fail-open)" },
                          { _id: "block", name: "Block request (fail-closed)" },
                        ]}
                        onChange={(e) => setGsForm((p) => ({ ...p, content_filter_on_error: e.target.value as string }))}
                        getOptionValue={(item) => item._id}
                      />
                    </Box>
                  </Stack>
                </Stack>
              </Box>

              {/* Replacement text card */}
              <Box sx={cardSx}>
                <Stack gap="8px">
                  <Typography sx={sectionTitleSx}>Replacement text</Typography>
                  <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
                    When a guardrail masks content, this text replaces the detected value. Use ENTITY_TYPE in the PII format to include the detected type (e.g., &lt;EMAIL_ADDRESS&gt;).
                  </Typography>
                  <Stack direction="row" gap="16px" mt="8px">
                    <Box flex={1}>
                      <Field
                        label="PII replacement format"
                        placeholder="<ENTITY_TYPE>"
                        value={gsForm.pii_replacement_format}
                        onChange={(e) => setGsForm((p) => ({ ...p, pii_replacement_format: e.target.value }))}
                      />
                    </Box>
                    <Box flex={1}>
                      <Field
                        label="Content filter replacement"
                        placeholder="[REDACTED]"
                        value={gsForm.content_filter_replacement}
                        onChange={(e) => setGsForm((p) => ({ ...p, content_filter_replacement: e.target.value }))}
                      />
                    </Box>
                  </Stack>
                </Stack>
              </Box>

              {/* Audit log retention card */}
              <Box sx={cardSx}>
                <Stack gap="8px">
                  <Typography sx={sectionTitleSx}>Audit log retention</Typography>
                  <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
                    How long to keep guardrail detection logs. These logs record every blocked or masked request for compliance auditing (EU AI Act Art. 12).
                  </Typography>
                  <Box sx={{ maxWidth: 200, mt: "8px" }}>
                    <Field
                      label="Retention period (days)"
                      placeholder="90"
                      value={gsForm.log_retention_days}
                      onChange={(e) => setGsForm((p) => ({ ...p, log_retention_days: e.target.value }))}
                    />
                  </Box>
                  <Box sx={{ mt: "8px" }}>
                    <CustomizableButton
                      text="Purge old logs"
                      variant="outlined"
                      onClick={async () => {
                        try {
                          await apiServices.post("/ai-gateway/guardrails/logs/purge");
                        } catch {
                          // Silently handle
                        }
                      }}
                    />
                  </Box>
                </Stack>
              </Box>

              {/* Request body logging card */}
              <Box sx={cardSx}>
                <Stack gap="8px">
                  <Typography sx={sectionTitleSx}>Request body logging</Typography>
                  <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
                    When enabled, full request prompts and LLM responses are stored in the spend logs. Disabled by default for privacy. Bodies are truncated to 2,048 characters.
                  </Typography>
                  <Stack gap="12px" mt="8px">
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography sx={{ fontSize: 13 }}>Log request body (prompts)</Typography>
                      <Toggle
                        checked={gsForm.log_request_body}
                        onChange={() => setGsForm((p) => ({ ...p, log_request_body: !p.log_request_body }))}
                      />
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography sx={{ fontSize: 13 }}>Log response body (LLM output)</Typography>
                      <Toggle
                        checked={gsForm.log_response_body}
                        onChange={() => setGsForm((p) => ({ ...p, log_response_body: !p.log_response_body }))}
                      />
                    </Stack>
                  </Stack>
                </Stack>
              </Box>

              {/* Spend log cleanup card */}
              <Box sx={cardSx}>
                <Stack gap="8px">
                  <Typography sx={sectionTitleSx}>Spend log cleanup</Typography>
                  <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
                    Delete old spend log entries based on the retention period above.
                  </Typography>
                  <Box sx={{ mt: "8px" }}>
                    <CustomizableButton
                      text={spendPurgeResult || "Purge old spend logs"}
                      variant="outlined"
                      onClick={async () => {
                        setSpendPurgeResult("Purging...");
                        try {
                          const res = await apiServices.post<Record<string, any>>("/ai-gateway/spend/logs/purge");
                          const count = res?.data?.deleted ?? res?.data?.data?.deleted_count ?? 0;
                          setSpendPurgeResult(count > 0 ? `Deleted ${count} logs` : "No old logs to purge");
                          if (count > 0) await loadData();
                          setTimeout(() => setSpendPurgeResult(""), 3000);
                        } catch {
                          setSpendPurgeResult("Failed to purge");
                          setTimeout(() => setSpendPurgeResult(""), 3000);
                        }
                      }}
                    />
                  </Box>
                </Stack>
              </Box>
              {/* Response cache settings card */}
              <Box sx={cardSx}>
                <Stack gap="12px">
                  <Typography sx={sectionTitleSx}>Response caching</Typography>
                  <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
                    Cache identical LLM requests to reduce cost and latency. Enable caching globally here, then toggle it per-endpoint in the Endpoints tab.
                  </Typography>

                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography sx={{ fontSize: 13 }}>Enable caching globally</Typography>
                    <Toggle
                      checked={cacheSettings.cache_global_enabled}
                      onChange={() => setCacheSettings((p) => ({ ...p, cache_global_enabled: !p.cache_global_enabled }))}
                    />
                  </Stack>

                  <Stack direction="row" gap="16px">
                    <Box sx={{ flex: 1 }}>
                      <Field
                        label="Default TTL (seconds)"
                        placeholder="14400"
                        value={cacheSettings.cache_default_ttl_seconds}
                        onChange={(e) => setCacheSettings((p) => ({ ...p, cache_default_ttl_seconds: e.target.value }))}
                      />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Field
                        label="Max entries per org"
                        placeholder="50000"
                        value={cacheSettings.cache_max_entries_per_org}
                        onChange={(e) => setCacheSettings((p) => ({ ...p, cache_max_entries_per_org: e.target.value }))}
                      />
                    </Box>
                  </Stack>

                  <Stack direction="row" gap="8px" sx={{ mt: "8px" }}>
                    <CustomizableButton
                      text={cacheSaving ? "Saving..." : "Save cache settings"}
                      variant="contained"
                      onClick={handleSaveCacheSettings}
                    />
                    <CustomizableButton
                      text={cachePurgeResult || "Purge expired entries"}
                      variant="outlined"
                      onClick={async () => {
                        setCachePurgeResult("Purging...");
                        try {
                          const res = await apiServices.post<Record<string, any>>("/ai-gateway/cache/purge");
                          const count = res?.data?.deleted ?? 0;
                          setCachePurgeResult(count > 0 ? `Deleted ${count} entries` : "No expired entries");
                          setTimeout(() => setCachePurgeResult(""), 3000);
                        } catch {
                          setCachePurgeResult("Failed");
                          setTimeout(() => setCachePurgeResult(""), 3000);
                        }
                      }}
                    />
                  </Stack>
                </Stack>
              </Box>
            </Stack>
          )}

          {/* ─── Suggested risks tab ──────────────────────────────────── */}
          {activeTab === "risks" && (
            <Stack gap="16px">
              {/* Detection settings card */}
              <Box sx={cardSx}>
                <Stack gap="12px">
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography sx={sectionTitleSx}>Risk detection settings</Typography>
                      <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mt: "4px" }}>
                        Configure which risk conditions to monitor. Detection runs daily at 6 AM or manually below.
                      </Typography>
                    </Box>
                    <Stack direction="row" gap="8px" alignItems="center">
                      {detectResult && (
                        <Typography sx={{ fontSize: 12, color: detectResult.includes("found") ? palette.status.success.text : palette.text.tertiary, mr: "4px" }}>
                          {detectResult}
                        </Typography>
                      )}
                      <CustomizableButton
                        text={detecting ? "Detecting..." : "Run detection now"}
                        variant="outlined"
                        icon={<Play size={14} strokeWidth={1.5} />}
                        onClick={handleRunDetection}
                        isDisabled={detecting}
                      />
                      <CustomizableButton
                        text={riskSettingsSaving ? "Saving..." : "Save settings"}
                        onClick={handleSaveRiskSettings}
                        isDisabled={riskSettingsSaving || !riskSettingsDirty}
                      />
                    </Stack>
                  </Stack>

                  <Stack gap="0px" mt="4px">
                    {riskSettings.map((s, idx) => {
                      const meta = CONDITION_META[s.condition_id];
                      const thresholdKeys = Object.keys(s.default_threshold);
                      return (
                        <Stack
                          key={s.condition_id}
                          direction="row"
                          alignItems="flex-start"
                          gap="12px"
                          sx={{
                            p: "12px 0",
                            borderTop: idx > 0 ? `1px solid ${palette.border.light}` : "none",
                            opacity: s.is_enabled ? 1 : 0.55,
                          }}
                        >
                          <Box sx={{ pt: "2px" }}>
                            <Toggle
                              checked={s.is_enabled}
                              onChange={() => handleToggleCondition(s.condition_id, !s.is_enabled)}
                            />
                          </Box>
                          <Box flex={1} minWidth={0}>
                            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                              {s.label}
                            </Typography>
                            {meta?.description && (
                              <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mt: "2px", lineHeight: 1.4 }}>
                                {meta.description}
                              </Typography>
                            )}
                            {thresholdKeys.length > 0 && (
                              <Box sx={{ display: "flex", flexDirection: "row", mt: "8px" }}>
                                {thresholdKeys.map((key, ki) => (
                                  <Box key={key} sx={{ width: "110px", ml: ki > 0 ? "8px" : "0px" }}>
                                    <Field
                                      label={meta?.thresholdLabels[key] || key.replace(/_/g, " ")}
                                      value={String(s.threshold[key] ?? s.default_threshold[key] ?? "")}
                                      onChange={(e) => handleThresholdChange(s.condition_id, key, e.target.value)}
                                      sx={{ minWidth: "unset", width: "100%" }}
                                    />
                                  </Box>
                                ))}
                              </Box>
                            )}
                          </Box>
                        </Stack>
                      );
                    })}
                  </Stack>
                </Stack>
              </Box>

              {/* Pending suggestions */}
              {pendingSuggestions.length > 0 ? (
                <Box>
                  <Typography sx={{ ...sectionTitleSx, mb: "12px" }}>
                    Pending suggestions ({pendingSuggestions.length})
                  </Typography>
                  <Stack gap="12px">
                    {pendingSuggestions.map((s) => (
                      <Box key={s.id} sx={cardSx}>
                        <Stack gap="8px">
                          <Stack direction="row" alignItems="center" gap="8px">
                            <Typography
                              sx={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: SEVERITY_COLORS[s.severity] || palette.text.tertiary,
                                backgroundColor: `${SEVERITY_COLORS[s.severity] || palette.text.tertiary}1a`,
                                px: "8px",
                                py: "2px",
                                borderRadius: "4px",
                                textTransform: "uppercase",
                              }}
                            >
                              {s.severity}
                            </Typography>
                            <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
                              {s.title}
                            </Typography>
                          </Stack>

                          <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                            {s.description}
                          </Typography>

                          {s.suggested_mitigation && (
                            <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
                              <strong>Suggested:</strong> {s.suggested_mitigation}
                            </Typography>
                          )}

                          {s.compliance_tags.length > 0 && (
                            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                              {s.compliance_tags.join(" \u00b7 ")}
                            </Typography>
                          )}

                          {s.evidence && Object.keys(s.evidence).length > 0 && (
                            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                              Evidence: {Object.entries(s.evidence)
                                .filter(([k]) => !k.startsWith("threshold"))
                                .slice(0, 4)
                                .map(([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : v}`)
                                .join(" \u00b7 ")}
                            </Typography>
                          )}

                          <Stack direction="row" justifyContent="flex-end" gap="8px" mt="4px">
                            <CustomizableButton
                              text="Dismiss"
                              variant="outlined"
                              icon={<X size={14} strokeWidth={1.5} />}
                              onClick={() => openDismissModal(s)}
                            />
                            <CustomizableButton
                              text="Accept as risk"
                              icon={<Check size={14} strokeWidth={1.5} />}
                              onClick={() => openAcceptModal(s)}
                            />
                          </Stack>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              ) : (
                <EmptyState
                  icon={AlertTriangle}
                  message="No pending risk suggestions. Run detection or wait for the next scheduled check."
                  showBorder
                />
              )}

              {/* History (collapsed) */}
              {historySuggestions.length > 0 && (
                <Box>
                  <Stack
                    direction="row"
                    alignItems="center"
                    gap="4px"
                    sx={{ cursor: "pointer", mb: "8px" }}
                    onClick={() => setShowHistory(!showHistory)}
                  >
                    {showHistory ? <ChevronDown size={16} strokeWidth={1.5} /> : <ChevronRight size={16} strokeWidth={1.5} />}
                    <Typography sx={{ fontSize: 13, fontWeight: 500, color: palette.text.secondary }}>
                      History ({historySuggestions.length})
                    </Typography>
                  </Stack>
                  <Collapse in={showHistory}>
                    <Stack gap="8px">
                      {historySuggestions.map((s) => (
                        <Stack
                          key={s.id}
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          sx={{
                            p: "8px 12px",
                            border: `1px solid ${palette.border.light}`,
                            borderRadius: "4px",
                            opacity: 0.7,
                          }}
                        >
                          <Stack direction="row" alignItems="center" gap="8px">
                            <Typography
                              sx={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: s.status === "accepted" ? palette.status.success.text : palette.text.tertiary,
                                textTransform: "uppercase",
                              }}
                            >
                              {s.status}
                            </Typography>
                            <Typography sx={{ fontSize: 13 }}>{s.title}</Typography>
                          </Stack>
                          <Stack direction="row" alignItems="center" gap="8px">
                            {s.reviewed_by_name && (
                              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                                by {s.reviewed_by_name}
                              </Typography>
                            )}
                            {s.reviewed_at && (
                              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                                {new Date(s.reviewed_at).toLocaleDateString()}
                              </Typography>
                            )}
                          </Stack>
                        </Stack>
                      ))}
                    </Stack>
                  </Collapse>
                </Box>
              )}
            </Stack>
          )}
        </Box>
      </TabContext>

      {/* Add API Key Modal */}
      <StandardModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        title="Add API key"
        description="Add a provider API key for your gateway endpoints"
        onSubmit={handleCreateKey}
        submitButtonText="Add key"
        isSubmitting={keySubmitting}
        maxWidth="480px"
      >
        <Stack gap="16px">
          <Field
            label="Key name"
            placeholder="e.g., Production OpenAI key"
            value={keyForm.key_name}
            onChange={(e) => setKeyForm((p) => ({ ...p, key_name: e.target.value }))}
            isRequired
          />
          <Select
            id="provider"
            label="Provider"
            placeholder="Select provider"
            value={keyForm.provider}
            items={providerItems}
            onChange={(e) => setKeyForm((p) => ({ ...p, provider: e.target.value as string }))}
            getOptionValue={(item) => item._id}
            dividerAfterIndex={TOP_PROVIDERS.length}
            dividerLabel="Other providers"
            isRequired
          />
          <Field
            label="API key"
            placeholder="sk-..."
            value={keyForm.api_key}
            onChange={(e) => setKeyForm((p) => ({ ...p, api_key: e.target.value }))}
            autoComplete="off"
            isRequired
          />
          {keyError && (
            <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>
              {keyError}
            </Typography>
          )}
        </Stack>
      </StandardModal>

      {/* Delete API Key Confirmation */}
      <StandardModal
        isOpen={!!keyDeleteTarget}
        onClose={() => setKeyDeleteTarget(null)}
        title="Remove API key"
        description={`Are you sure you want to remove "${keyDeleteTarget?.key_name}"?`}
        onSubmit={handleDeleteKeyConfirm}
        submitButtonText="Remove key"
        submitButtonColor="#D32F2F"
        isSubmitting={keyDeleting}
        maxWidth="480px"
      >
        <Stack gap="8px">
          <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
            This action takes effect immediately. Any endpoints using this key will lose their provider authentication and stop working.
          </Typography>
          <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
            Provider: <strong>{keyDeleteTarget?.provider}</strong>
          </Typography>
        </Stack>
      </StandardModal>

      {/* Budget Modal */}
      <StandardModal
        isOpen={isBudgetModalOpen}
        onClose={() => setIsBudgetModalOpen(false)}
        title={budget ? "Edit budget" : "Set budget"}
        description="Configure monthly spending limits for the AI Gateway"
        onSubmit={handleSaveBudget}
        submitButtonText={budget ? "Update budget" : "Set budget"}
        isSubmitting={budgetSubmitting}
        maxWidth="480px"
      >
        <Stack gap="16px">
          <Field
            label="Monthly limit (USD)"
            placeholder="e.g., 100.00"
            value={budgetForm.monthly_limit_usd}
            onChange={(e) => setBudgetForm((p) => ({ ...p, monthly_limit_usd: e.target.value }))}
            isRequired
          />
          <Field
            label="Alert threshold (%)"
            placeholder="80"
            value={budgetForm.alert_threshold_pct}
            onChange={(e) => setBudgetForm((p) => ({ ...p, alert_threshold_pct: e.target.value }))}
          />
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                Hard limit
              </Typography>
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                Reject requests when budget is exceeded
              </Typography>
            </Box>
            <Toggle
              checked={budgetForm.is_hard_limit}
              onChange={() => setBudgetForm((p) => ({ ...p, is_hard_limit: !p.is_hard_limit }))}
            />
          </Stack>
        </Stack>
      </StandardModal>

      {/* Accept as risk Modal */}
      <StandardModal
        isOpen={acceptModalOpen}
        onClose={() => { setAcceptModalOpen(false); setAcceptTarget(null); }}
        title="Accept as risk"
        description="This will create a new risk in Risk Management pre-filled with the suggestion data."
        onSubmit={handleAccept}
        submitButtonText="Create risk"
        isSubmitting={acceptSubmitting}
        maxWidth="560px"
      >
        <Stack gap="16px">
          <Field
            label="Risk name"
            value={acceptForm.risk_name}
            onChange={(e) => setAcceptForm((p) => ({ ...p, risk_name: e.target.value }))}
            isRequired
          />
          <Field
            label="Description"
            value={acceptForm.risk_description}
            onChange={(e) => setAcceptForm((p) => ({ ...p, risk_description: e.target.value }))}
            multiline
            minRows={3}
          />
          <Select
            id="severity"
            label="Severity"
            value={acceptForm.severity}
            items={[
              { _id: "critical", name: "Critical" },
              { _id: "high", name: "High" },
              { _id: "medium", name: "Medium" },
              { _id: "low", name: "Low" },
            ]}
            onChange={(e) => setAcceptForm((p) => ({ ...p, severity: e.target.value as string }))}
            getOptionValue={(item) => item._id}
          />
          <Field
            label="Mitigation plan"
            value={acceptForm.mitigation_plan}
            onChange={(e) => setAcceptForm((p) => ({ ...p, mitigation_plan: e.target.value }))}
            multiline
            minRows={2}
          />
        </Stack>
      </StandardModal>

      {/* Dismiss Modal */}
      <StandardModal
        isOpen={dismissModalOpen}
        onClose={() => { setDismissModalOpen(false); setDismissTarget(null); }}
        title="Dismiss suggestion"
        description={`Dismiss "${dismissTarget?.title || ""}" — optionally provide a reason.`}
        onSubmit={handleDismiss}
        submitButtonText="Dismiss"
        isSubmitting={dismissSubmitting}
        maxWidth="480px"
      >
        <Field
          label="Reason (optional)"
          placeholder="e.g., Already addressed, Not applicable"
          value={dismissReason}
          onChange={(e) => setDismissReason(e.target.value)}
          multiline
          minRows={2}
        />
      </StandardModal>
    </PageHeaderExtended>
  );
}
