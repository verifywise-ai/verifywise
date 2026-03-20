import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Box,
  Typography,
  Stack,
  IconButton,
} from "@mui/material";
import { CirclePlus, Router, Trash2, Zap, Settings, Shield, TriangleAlert, KeyRound, Pencil } from "lucide-react";
import Toggle from "../../../components/Inputs/Toggle";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import StandardModal from "../../../components/Modals/StandardModal";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import palette from "../../../themes/palette";
import { useCardSx, ProviderIcon, useGatewayModels, slugify } from "../shared";
import { displayFormattedDate } from "../../../tools/isoDateToString";

interface EndpointForm {
  display_name: string;
  slug: string;
  provider: string;
  model: string;
  api_key_id: string;
  max_tokens: string;
  temperature: string;
  system_prompt: string;
  rate_limit_rpm: string;
  fallback_endpoint_id: string;
  prompt_id: string;
  prompt_label: string;
  cache_enabled: boolean;
  cache_ttl_seconds: string;
}

const EMPTY_FORM: EndpointForm = {
  display_name: "", slug: "", provider: "", model: "",
  api_key_id: "", max_tokens: "", temperature: "", system_prompt: "",
  rate_limit_rpm: "", fallback_endpoint_id: "",
  prompt_id: "", prompt_label: "production",
  cache_enabled: false, cache_ttl_seconds: "14400",
};

export default function EndpointsPage() {
  const cardSx = useCardSx();
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [activeGuardrailCount, setActiveGuardrailCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null); // null = create, number = edit
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const [prompts, setPrompts] = useState<any[]>([]);
  const [form, setForm] = useState<EndpointForm>({ ...EMPTY_FORM });
  const { providerItems, getModelsForProvider } = useGatewayModels();

  const loadData = useCallback(async () => {
    try {
      const [endpointsRes, keysRes, grRes, promptsRes] = await Promise.all([
        apiServices.get<Record<string, any>>("/ai-gateway/endpoints"),
        apiServices.get<Record<string, any>>("/ai-gateway/keys"),
        apiServices.get<Record<string, any>>("/ai-gateway/guardrails").catch(() => null),
        apiServices.get<Record<string, any>>("/ai-gateway/prompts").catch(() => null),
      ]);
      setEndpoints(endpointsRes?.data?.endpoints || []);
      setApiKeys(keysRes?.data?.data || []);
      setPrompts(promptsRes?.data?.prompts || []);
      const allRules = grRes?.data?.rules || grRes?.data?.data || [];
      setActiveGuardrailCount(allRules.filter((r: any) => r.is_active).length);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleNameChange = (value: string) => {
    setForm((p) => ({
      ...p,
      display_name: value,
      // Only auto-generate slug on create, not edit
      ...(editingId === null ? { slug: slugify(value) } : {}),
    }));
  };

  const handleProviderSelect = (provider: string) => {
    setForm((p) => ({ ...p, provider, model: "" }));
  };

  const handleModelSelect = (model: string) => {
    setForm((p) => ({ ...p, model }));
  };

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (ep: any) => {
    setEditingId(ep.id);
    setForm({
      display_name: ep.display_name || "",
      slug: ep.slug || "",
      provider: ep.provider || "",
      model: ep.model || "",
      api_key_id: ep.api_key_id ? String(ep.api_key_id) : "",
      max_tokens: ep.max_tokens != null ? String(ep.max_tokens) : "",
      temperature: ep.temperature != null ? String(ep.temperature) : "",
      system_prompt: ep.system_prompt || "",
      rate_limit_rpm: ep.rate_limit_rpm != null ? String(ep.rate_limit_rpm) : "",
      fallback_endpoint_id: ep.fallback_endpoint_id ? String(ep.fallback_endpoint_id) : "",
      prompt_id: ep.prompt_id ? String(ep.prompt_id) : "",
      prompt_label: ep.prompt_label || "production",
      cache_enabled: ep.cache_enabled || false,
      cache_ttl_seconds: ep.cache_ttl_seconds != null ? String(ep.cache_ttl_seconds) : "14400",
    });
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.display_name || !form.provider || !form.model || !form.api_key_id) {
      setFormError("Name, provider, model, and API key are required");
      return;
    }
    if (editingId === null && !form.slug) {
      setFormError("Could not generate a valid slug from the name provided");
      return;
    }
    setIsSubmitting(true);
    setFormError("");

    const payload: Record<string, any> = {
      display_name: form.display_name,
      provider: form.provider,
      model: form.model,
      api_key_id: Number(form.api_key_id),
      max_tokens: form.max_tokens ? Number(form.max_tokens) : null,
      temperature: form.temperature ? Number(form.temperature) : null,
      system_prompt: form.system_prompt || null,
      rate_limit_rpm: form.rate_limit_rpm ? Number(form.rate_limit_rpm) : null,
      fallback_endpoint_id: form.fallback_endpoint_id ? Number(form.fallback_endpoint_id) : null,
      prompt_id: form.prompt_id ? Number(form.prompt_id) : null,
      prompt_label: form.prompt_label || "production",
      cache_enabled: form.cache_enabled,
      cache_ttl_seconds: form.cache_ttl_seconds ? Number(form.cache_ttl_seconds) : 14400,
    };

    try {
      if (editingId === null) {
        payload.slug = form.slug;
        await apiServices.post("/ai-gateway/endpoints", payload);
      } else {
        await apiServices.patch(`/ai-gateway/endpoints/${editingId}`, payload);
      }
      setIsModalOpen(false);
      setForm({ ...EMPTY_FORM });
      await loadData();
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || err?.response?.data?.message || `Failed to ${editingId ? "update" : "create"} endpoint`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiServices.delete(`/ai-gateway/endpoints/${deleteTarget.id}`);
      setDeleteTarget(null);
      await loadData();
    } catch {
      // Silently handle
    }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      await apiServices.patch(`/ai-gateway/endpoints/${id}`, { is_active: !isActive });
      await loadData();
    } catch {
      // Silently handle
    }
  };

  const apiKeyItems = apiKeys
    .filter((k) => k.is_active)
    .map((k) => ({ _id: String(k.id), name: `${k.key_name} (${k.provider})` }));

  const promptName = (id: number | null) => {
    if (!id) return null;
    const p = prompts.find((pr: any) => pr.id === id);
    return p?.name || null;
  };

  const isEditing = editingId !== null;

  return (
    <PageHeaderExtended
      title="Endpoints"
      description="Configure LLM provider endpoints for your organization."
      tipBoxEntity="ai-gateway-endpoints"
      helpArticlePath="ai-gateway/endpoints"
      actionButton={
        <CustomizableButton
          text="Add endpoint"
          icon={<CirclePlus size={14} strokeWidth={1.5} />}
          onClick={openCreateModal}
          isDisabled={!loading && apiKeyItems.length === 0}
        />
      }
    >
      {loading ? (
        <Box sx={cardSx}>
          <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>Loading endpoints...</Typography>
        </Box>
      ) : endpoints.length === 0 ? (
        <EmptyState
          icon={Router}
          message="No endpoints configured yet. Add your first LLM endpoint to start routing requests through the gateway."
          showBorder
        >
          {apiKeyItems.length === 0 && (
            <Box sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              p: "12px 16px",
              borderRadius: "4px",
              border: "1px solid #FEDF89",
              bgcolor: "#FFFAEB",
              mb: "8px",
            }}>
              <TriangleAlert size={16} strokeWidth={1.5} color="#B54708" style={{ flexShrink: 0, marginTop: 1 }} />
              <Box>
                <Typography fontSize={13} fontWeight={500} color="#B54708">
                  No API keys configured
                </Typography>
                <Typography fontSize={12} color="#93370D" mt="2px">
                  You need at least one LLM provider API key before you can create an endpoint.{" "}
                  <Link to="/ai-gateway/settings" style={{ color: "#B54708", fontWeight: 500 }}>Go to Settings</Link> to add your OpenAI, Anthropic, or other provider keys.
                </Typography>
              </Box>
            </Box>
          )}
          <EmptyStateTip
            icon={apiKeyItems.length === 0 ? KeyRound : Zap}
            title={apiKeyItems.length === 0 ? "Step 1: Add an API key in Settings" : "Route requests through a unified gateway"}
            description={apiKeyItems.length === 0
              ? "Go to the Settings tab in the sidebar and add your provider API key (OpenAI, Anthropic, etc.). Once added, come back here to create your first endpoint."
              : "Each endpoint maps to a specific provider and model. Your applications reference endpoints by slug, so you can swap models without changing application code."}
          />
          <EmptyStateTip
            icon={Settings}
            title={apiKeyItems.length === 0 ? "Step 2: Create an endpoint" : "Configure API keys first"}
            description={apiKeyItems.length === 0
              ? "After adding a key, create an endpoint that pairs a model with that key. Each endpoint gets a unique slug your applications can reference."
              : "Go to Settings to add your provider API keys (OpenAI, Anthropic, etc.). Then create endpoints that reference those keys."}
          />
          <EmptyStateTip
            icon={Shield}
            title="Monitor costs and enforce budgets"
            description="Every request through the gateway is logged with cost, tokens, and latency. Set a monthly budget to prevent unexpected cost overruns."
          />
        </EmptyState>
      ) : (
        <Box sx={cardSx}>
          <Stack gap="8px">
            {endpoints.map((ep) => {
              const boundPrompt = promptName(ep.prompt_id);
              return (
                <Stack
                  key={ep.id}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{
                    p: "12px 16px",
                    border: `1px solid ${palette.border.dark}`,
                    borderRadius: "4px",
                    cursor: "pointer",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                  onClick={() => openEditModal(ep)}
                >
                  <Stack direction="row" alignItems="center" gap="10px">
                    <ProviderIcon provider={ep.provider} size={20} />
                    <Box>
                      <Stack direction="row" alignItems="center" gap="8px">
                        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                          {ep.display_name}
                        </Typography>
                        {boundPrompt && (
                          <Chip label={`${boundPrompt} (${ep.prompt_label || "production"})`} variant="info" />
                        )}
                      </Stack>
                      <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                        {ep.provider} / {ep.model} &middot; {ep.api_key_name || "No key"}
                        {ep.rate_limit_rpm > 0 && (
                          <span> &middot; {ep.rate_limit_rpm} RPM</span>
                        )}
                        {ep.fallback_endpoint_id && (
                          <span> &middot; has fallback</span>
                        )}
                        {activeGuardrailCount > 0 && (
                          <span> &middot; {activeGuardrailCount} guardrail{activeGuardrailCount !== 1 ? "s" : ""}</span>
                        )}
                        {ep.cache_enabled && (
                          <span> &middot; cached {Math.round((ep.cache_ttl_seconds || 14400) / 3600)}h</span>
                        )}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: palette.text.disabled, mt: "2px" }}>
                        {ep.created_by_name ? `Added by ${ep.created_by_name}` : "Added"} &middot; {displayFormattedDate(ep.created_at)}
                      </Typography>
                    </Box>
                  </Stack>
                  <Stack direction="row" alignItems="center" gap="8px" onClick={(e) => e.stopPropagation()}>
                    <Toggle
                      checked={ep.is_active}
                      onChange={() => handleToggleActive(ep.id, ep.is_active)}
                      size="small"
                    />
                    <IconButton
                      size="small"
                      onClick={() => openEditModal(ep)}
                      sx={{ p: 0.5 }}
                    >
                      <Pencil size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => setDeleteTarget({ id: ep.id, name: ep.display_name })}
                      sx={{ p: 0.5 }}
                    >
                      <Trash2 size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                    </IconButton>
                  </Stack>
                </Stack>
              );
            })}
          </Stack>
        </Box>
      )}

      {/* Create / Edit Endpoint Modal */}
      <StandardModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? "Edit endpoint" : "Add endpoint"}
        description={isEditing ? "Update this endpoint's configuration." : "Configure a new LLM provider endpoint"}
        onSubmit={handleSubmit}
        submitButtonText={isEditing ? "Save changes" : "Create endpoint"}
        isSubmitting={isSubmitting}
        maxWidth="480px"
      >
        <Stack gap="16px">
          <Field
            label="Endpoint name"
            placeholder="e.g., Production GPT-4o"
            value={form.display_name}
            onChange={(e) => handleNameChange(e.target.value)}
            isRequired
          />

          {isEditing && (
            <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
              Slug: <strong>{form.slug}</strong> (cannot be changed)
            </Typography>
          )}

          <Stack direction="row" gap="8px">
            <Box flex={1}>
              <Select
                id="provider"
                label="Provider"
                placeholder="Select provider"
                value={form.provider}
                items={providerItems}
                onChange={(e) => handleProviderSelect(e.target.value as string)}
                getOptionValue={(item) => item._id}
                isRequired
              />
            </Box>
            <Box flex={2}>
              <Select
                id="model"
                label="Model"
                placeholder={form.provider ? "Select a model" : "Select a provider first"}
                value={form.model}
                items={form.provider ? getModelsForProvider(form.provider) : []}
                onChange={(e) => handleModelSelect(e.target.value as string)}
                getOptionValue={(item) => item._id}
                isRequired
              />
            </Box>
          </Stack>

          {apiKeyItems.length > 0 ? (
            <Select
              id="api_key_id"
              label="API key"
              placeholder="Select an API key"
              value={form.api_key_id}
              items={apiKeyItems}
              onChange={(e) => setForm((p) => ({ ...p, api_key_id: e.target.value as string }))}
              getOptionValue={(item) => item._id}
            />
          ) : (
            <Stack
              direction="row"
              alignItems="flex-start"
              gap="6px"
              sx={{
                p: "8px 12px",
                bgcolor: palette.background.accent,
                borderRadius: "4px",
                border: `1px solid ${palette.border.light}`,
              }}
            >
              <Typography sx={{ fontSize: 12, lineHeight: 1.5, color: palette.text.tertiary }}>
                No API keys available. Go to Settings to add one first.
              </Typography>
            </Stack>
          )}

          <Stack direction="row" gap="12px">
            <Box sx={{ flex: 1 }}>
              <Field
                label="Max tokens"
                placeholder="4096"
                value={form.max_tokens}
                onChange={(e) => setForm((p) => ({ ...p, max_tokens: e.target.value }))}
                isOptional
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Field
                label="Temperature"
                placeholder="0.7"
                value={form.temperature}
                onChange={(e) => setForm((p) => ({ ...p, temperature: e.target.value }))}
                isOptional
              />
            </Box>
          </Stack>

          <Field
            label="System prompt"
            placeholder="Optional system prompt prepended to all requests"
            value={form.system_prompt}
            onChange={(e) => setForm((p) => ({ ...p, system_prompt: e.target.value }))}
            isOptional
          />

          {prompts.length > 0 && (
            <Stack direction="row" gap="12px">
              <Box sx={{ flex: 1 }}>
                <Select
                  id="prompt_id"
                  label="Prompt template"
                  placeholder="None"
                  value={form.prompt_id}
                  items={[
                    { _id: "", name: "None" },
                    ...prompts.map((p: any) => ({ _id: String(p.id), name: p.name })),
                  ]}
                  onChange={(e) => setForm((p) => ({ ...p, prompt_id: e.target.value as string }))}
                  getOptionValue={(item) => item._id}
                  isOptional
                />
              </Box>
              {form.prompt_id && (
                <Box sx={{ flex: 1 }}>
                  <Field
                    label="Prompt label"
                    placeholder="production"
                    value={form.prompt_label}
                    onChange={(e) => setForm((p) => ({ ...p, prompt_label: e.target.value }))}
                    isOptional
                  />
                </Box>
              )}
            </Stack>
          )}

          <Stack direction="row" gap="12px">
            <Box sx={{ flex: 1 }}>
              <Field
                label="Rate limit (RPM)"
                placeholder="e.g., 60"
                value={form.rate_limit_rpm}
                onChange={(e) => setForm((p) => ({ ...p, rate_limit_rpm: e.target.value }))}
                isOptional
              />
            </Box>
          </Stack>

          {endpoints.length > 0 && (
            <Select
              id="fallback"
              label="Fallback endpoint"
              placeholder="None (no fallback)"
              value={form.fallback_endpoint_id}
              items={[
                { _id: "", name: "None" },
                ...endpoints
                  .filter((ep) => ep.id !== editingId && ep.is_active)
                  .map((ep) => ({ _id: String(ep.id), name: ep.display_name })),
              ]}
              onChange={(e) => setForm((p) => ({ ...p, fallback_endpoint_id: e.target.value as string }))}
              getOptionValue={(item) => item._id}
              isOptional
            />
          )}

          {/* Caching */}
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ fontSize: 13 }}>Enable response caching</Typography>
            <Toggle
              checked={form.cache_enabled}
              onChange={() => setForm((p) => ({ ...p, cache_enabled: !p.cache_enabled }))}
            />
          </Stack>
          {form.cache_enabled && (
            <Field
              label="Cache TTL (seconds)"
              placeholder="14400 (4 hours)"
              value={form.cache_ttl_seconds}
              onChange={(e) => setForm((p) => ({ ...p, cache_ttl_seconds: e.target.value }))}
              isOptional
            />
          )}

          {!isEditing && form.slug && (
            <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
              Endpoint slug: <strong>{form.slug}</strong>
            </Typography>
          )}

          {formError && (
            <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>
              {formError}
            </Typography>
          )}
        </Stack>
      </StandardModal>

      {/* Delete confirmation modal */}
      <StandardModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete endpoint"
        description=""
        onSubmit={handleDelete}
        submitButtonText="Delete"
        maxWidth="400px"
      >
        <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
          Are you sure you want to delete "{deleteTarget?.name}"? This will permanently remove the endpoint and any requests using its slug will fail.
        </Typography>
      </StandardModal>
    </PageHeaderExtended>
  );
}
