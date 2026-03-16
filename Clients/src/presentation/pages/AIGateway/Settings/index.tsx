import { useState, useEffect, useCallback } from "react";
import { Box, Typography, Stack, IconButton } from "@mui/material";
import { CirclePlus, Key, Wallet, Trash2, Pencil, Lock, Router } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import StandardModal from "../../../components/Modals/StandardModal";
import Toggle from "../../../components/Inputs/Toggle";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import palette from "../../../themes/palette";
import { sectionTitleSx, useCardSx, ProviderIcon, TOP_PROVIDERS } from "../shared";
import { validateApiKeyFormat } from "../../../../application/utils/apiKeyValidation";

const TOP_IDS = new Set(TOP_PROVIDERS.map((p) => p._id));

export default function AIGatewaySettingsPage() {
  const cardSx = useCardSx();
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [budget, setBudget] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [providerItems, setProviderItems] = useState(TOP_PROVIDERS);
  const [topProviderCount, setTopProviderCount] = useState(TOP_PROVIDERS.length);

  // API Key modal state
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [keyForm, setKeyForm] = useState({ key_name: "", provider: "", api_key: "" });
  const [keyError, setKeyError] = useState("");
  const [keySubmitting, setKeySubmitting] = useState(false);

  // Budget modal state
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [budgetForm, setBudgetForm] = useState({
    monthly_limit_usd: "",
    alert_threshold_pct: "80",
    is_hard_limit: false,
  });
  const [budgetSubmitting, setBudgetSubmitting] = useState(false);

  // Guardrail settings state
  const [guardrailSettings, setGuardrailSettings] = useState<any>(null);
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

  const loadData = useCallback(async () => {
    try {
      const [keysRes, budgetRes, providersRes, gsRes] = await Promise.all([
        apiServices.get("/ai-gateway/keys"),
        apiServices.get("/ai-gateway/budget"),
        apiServices.get("/ai-gateway/providers").catch(() => null),
        apiServices.get("/ai-gateway/guardrails/settings").catch(() => null),
      ]);
      setApiKeys(keysRes?.data?.data || []);
      setBudget(budgetRes?.data?.data || null);

      // Build provider list: top providers first, then rest from LiteLLM SDK
      const dynamicProviders: string[] = providersRes?.data?.data?.providers || [];
      const otherProviders = dynamicProviders
        .filter((p) => !TOP_IDS.has(p))
        .sort()
        .map((p) => ({ _id: p, name: p }));

      if (otherProviders.length > 0) {
        setProviderItems([...TOP_PROVIDERS, ...otherProviders]);
        setTopProviderCount(TOP_PROVIDERS.length);
      }

      // Guardrail settings
      const gs = gsRes?.data?.data;
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
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateKey = async () => {
    if (!keyForm.key_name || !keyForm.provider || !keyForm.api_key) {
      setKeyError("All fields are required");
      return;
    }

    // 1. Client-side format check (instant feedback)
    const formatError = validateApiKeyFormat(keyForm.provider, keyForm.api_key);
    if (formatError) {
      setKeyError(formatError);
      return;
    }

    setKeySubmitting(true);
    setKeyError("");

    try {
      // 2. Live verification — call the provider's API
      const verifyRes = await apiServices.post("/ai-gateway/keys/verify", {
        provider: keyForm.provider,
        apiKey: keyForm.api_key,
      });
      // verifyApiKey uses raw res.json() so valid is at the top level (verifyRes.data.valid)
      const { valid, message } = verifyRes?.data || {};

      if (valid === false) {
        setKeyError(message || "API key is invalid. Please check it and try again.");
        return;
      }

      // 3. Save
      await apiServices.post("/ai-gateway/keys", keyForm);
      setIsKeyModalOpen(false);
      setKeyForm({ key_name: "", provider: "", api_key: "" });
      await loadData();
    } catch (err: any) {
      setKeyError(err?.response?.data?.message || "Failed to create API key");
    } finally {
      setKeySubmitting(false);
    }
  };

  const handleDeleteKey = async (id: number) => {
    try {
      await apiServices.delete(`/ai-gateway/keys/${id}`);
      await loadData();
    } catch {
      // Silently handle
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

  return (
    <PageHeaderExtended
      title="Settings"
      description="Manage API keys and budget for the AI Gateway."
      tipBoxEntity="ai-gateway-settings"
      helpArticlePath="ai-gateway/settings"
    >
      {/* API Keys Section */}
      <Box sx={cardSx}>
        <Stack gap="12px">
          <Stack gap="8px">
            <Typography sx={sectionTitleSx}>API keys</Typography>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Typography sx={{ fontSize: 13, color: palette.text.tertiary, maxWidth: "75%" }}>
                Provider API keys are encrypted at rest (AES-256-CBC) and only decrypted when proxying a request. Each key is scoped to your organization and can be referenced by multiple endpoints.
              </Typography>
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
                    <IconButton size="small" onClick={() => handleDeleteKey(key.id)} sx={{ p: 0.5 }}>
                      <Trash2 size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                    </IconButton>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
      </Box>

      {/* Budget Section */}
      <Box sx={cardSx}>
        <Stack gap="12px">
          <Stack gap="8px">
            <Typography sx={sectionTitleSx}>Budget</Typography>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Typography sx={{ fontSize: 13, color: palette.text.tertiary, maxWidth: "75%" }}>
                Set a monthly spending limit across all endpoints. When the hard limit is enabled, requests are rejected once the budget is exceeded. Use the alert threshold for early warnings.
              </Typography>
              <CustomizableButton
                text={budget ? "Edit budget" : "Set budget"}
                icon={<Pencil size={14} strokeWidth={1.5} />}
                onClick={openBudgetModal}
              />
            </Stack>
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

      {/* Guardrail Settings Section */}
      <Box sx={cardSx}>
        <Stack gap="12px">
          <Stack gap="8px">
            <Typography sx={sectionTitleSx}>Guardrail settings</Typography>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Typography sx={{ fontSize: 13, color: palette.text.tertiary, maxWidth: "75%" }}>
                Configure how guardrails behave when scanning fails, what replacement text to use for masked content, and how long to retain guardrail audit logs.
              </Typography>
              <CustomizableButton
              text={gsSaving ? "Saving..." : "Save"}
              onClick={async () => {
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
              }}
            />
            </Stack>
          </Stack>

          <Stack gap="20px">
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 1 }}>Error behavior</Typography>
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mb: 1.5 }}>
                What happens when the guardrail scanner itself fails (e.g., Presidio unavailable). "Fail-closed" blocks all requests for safety. "Fail-open" allows requests through and logs the error.
              </Typography>
              <Stack direction="row" gap="16px">
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
            </Box>

            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 1 }}>Replacement text</Typography>
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mb: 1.5 }}>
                When a guardrail masks content, this text replaces the detected value. Use ENTITY_TYPE in the PII format to include the detected type (e.g., &lt;EMAIL_ADDRESS&gt;).
              </Typography>
              <Stack direction="row" gap="16px">
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
            </Box>

            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 1 }}>Audit log retention</Typography>
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mb: 1.5 }}>
                How long to keep guardrail detection logs. These logs record every blocked or masked request for compliance auditing (EU AI Act Art. 12).
              </Typography>
              <Stack direction="row" gap={2} alignItems="flex-end">
                <Box sx={{ maxWidth: 200 }}>
                  <Field
                    label="Retention period (days)"
                    placeholder="90"
                    value={gsForm.log_retention_days}
                    onChange={(e) => setGsForm((p) => ({ ...p, log_retention_days: e.target.value }))}
                  />
                </Box>
                <CustomizableButton
                text="Purge old logs"
                onClick={async () => {
                  try {
                    await apiServices.post("/ai-gateway/guardrails/logs/purge");
                  } catch {
                    // Silently handle
                  }
                }}
              />
            </Stack>
            </Box>

            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 1 }}>Request body logging</Typography>
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mb: 1.5 }}>
                When enabled, full request prompts and LLM responses are stored in the spend logs. Disabled by default for privacy. Bodies are truncated to 2,048 characters and only the last 3 messages are kept.
              </Typography>
              <Stack gap="12px">
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
            </Box>

            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 1 }}>Spend log cleanup</Typography>
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mb: 1.5 }}>
                Delete old spend log entries based on the retention period above. Uses the same retention days as guardrail logs.
              </Typography>
              <CustomizableButton
                text="Purge old spend logs"
                onClick={async () => {
                  try {
                    const res = await apiServices.post("/ai-gateway/spend/logs/purge");
                    const count = res?.data?.data?.deleted_count || 0;
                    if (count > 0) {
                      await loadData();
                    }
                  } catch {
                    // Silently handle
                  }
                }}
              />
            </Box>
          </Stack>
        </Stack>
      </Box>

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
            dividerAfterIndex={topProviderCount}
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
    </PageHeaderExtended>
  );
}
