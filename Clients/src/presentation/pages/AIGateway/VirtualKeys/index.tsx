import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Typography, Stack, IconButton } from "@mui/material";
import { Link } from "react-router-dom";
import {
  CirclePlus,
  KeyRound,
  Trash2,
  Ban,
  Copy,
  Check,
  Server,
  TriangleAlert,
} from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Field from "../../../components/Inputs/Field";
import DatePicker from "../../../components/Inputs/Datepicker";
import Chip from "../../../components/Chip";
import StandardModal from "../../../components/Modals/StandardModal";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import palette from "../../../themes/palette";
import {
  sectionTitleSx,
  useCardSx,
  GATEWAY_URL,
  CODE_BLOCK_BG,
  CODE_BLOCK_TEXT,
  WARNING_BG,
  WARNING_BORDER,
  WARNING_TEXT,
  KEY_DISPLAY_BG,
} from "../shared";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import dayjs from "dayjs";

interface CreateVirtualKeyPayload {
  name: string;
  max_budget_usd?: number;
  rate_limit_rpm?: number;
  expires_at?: string;
  allowed_models?: string[];
  blocked_models?: string[];
  allowed_providers?: string[];
  blocked_providers?: string[];
}

interface VirtualKey {
  id: number;
  key_prefix: string;
  name: string;
  allowed_endpoint_ids: number[];
  allowed_models: string[];
  blocked_models: string[];
  allowed_providers: string[];
  blocked_providers: string[];
  max_budget_usd: number | null;
  current_spend_usd: number;
  rate_limit_rpm: number | null;
  metadata: Record<string, string>;
  expires_at: string | null;
  is_active: boolean;
  revoked_at: string | null;
  created_by_name: string;
  created_at: string;
}

export default function AIGatewayVirtualKeysPage({ embedded }: { embedded?: boolean } = {}) {
  const cardSx = useCardSx();
  const [keys, setKeys] = useState<VirtualKey[]>([]);
  const [endpointCount, setEndpointCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    max_budget_usd: "",
    rate_limit_rpm: "",
    expires_at: "",
    allowed_models: "",
    blocked_models: "",
    allowed_providers: "",
    blocked_providers: "",
  });
  const [createError, setCreateError] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Key display modal (shown once after creation)
  const [isKeyDisplayOpen, setIsKeyDisplayOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [copied, setCopied] = useState(false);

  // Revoke confirmation modal
  const [revokeTarget, setRevokeTarget] = useState<VirtualKey | null>(null);

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [keysRes, endpointsRes] = await Promise.all([
        apiServices.get<Record<string, any>>("/ai-gateway/virtual-keys"),
        apiServices.get<Record<string, any>>("/ai-gateway/endpoints").catch(() => null),
      ]);
      setKeys(keysRes?.data?.data || []);
      const eps = endpointsRes?.data?.endpoints || [];
      setEndpointCount(eps.filter((e: any) => e.is_active).length);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      setCreateError("Name is required");
      return;
    }
    setCreateSubmitting(true);
    setCreateError("");
    try {
      const payload: CreateVirtualKeyPayload = { name: createForm.name.trim() };
      if (createForm.max_budget_usd) payload.max_budget_usd = Number(createForm.max_budget_usd);
      if (createForm.rate_limit_rpm) payload.rate_limit_rpm = Number(createForm.rate_limit_rpm);
      if (createForm.expires_at) payload.expires_at = new Date(createForm.expires_at).toISOString();

      const parseList = (v: string) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      if (createForm.allowed_models.trim())
        payload.allowed_models = parseList(createForm.allowed_models);
      if (createForm.blocked_models.trim())
        payload.blocked_models = parseList(createForm.blocked_models);
      if (createForm.allowed_providers.trim())
        payload.allowed_providers = parseList(createForm.allowed_providers);
      if (createForm.blocked_providers.trim())
        payload.blocked_providers = parseList(createForm.blocked_providers);

      const res = await apiServices.post<Record<string, any>>("/ai-gateway/virtual-keys", payload);
      const created = res?.data?.data;
      setIsCreateOpen(false);
      setCreateForm({
        name: "",
        max_budget_usd: "",
        rate_limit_rpm: "",
        expires_at: "",
        allowed_models: "",
        blocked_models: "",
        allowed_providers: "",
        blocked_providers: "",
      });

      if (created?.plain_key) {
        setNewKey(created.plain_key);
        setIsKeyDisplayOpen(true);
      }

      await loadData();
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { detail?: string; message?: string } } })
        ?.response?.data;
      setCreateError(errData?.detail || errData?.message || "Failed to create virtual key");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await apiServices.post(`/ai-gateway/virtual-keys/${revokeTarget.id}/revoke`);
      setRevokeTarget(null);
      await loadData();
    } catch {
      // Silently handle
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiServices.delete(`/ai-gateway/virtual-keys/${id}`);
      await loadData();
    } catch {
      // Silently handle
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const getStatusLabel = (key: VirtualKey): string => {
    if (key.revoked_at) return "Revoked";
    if (key.expires_at && new Date(key.expires_at) < new Date()) return "Expired";
    if (key.is_active) return "Active";
    return "Inactive";
  };

  const createKeyButton = (
    <CustomizableButton
      text="Create key"
      icon={<CirclePlus size={14} strokeWidth={1.5} />}
      onClick={() => {
        setCreateForm({
          name: "",
          max_budget_usd: "",
          rate_limit_rpm: "",
          expires_at: "",
          allowed_models: "",
          blocked_models: "",
          allowed_providers: "",
          blocked_providers: "",
        });
        setCreateError("");
        setIsCreateOpen(true);
      }}
      isDisabled={!loading && endpointCount === 0}
    />
  );

  const content = (
    <>
      {!loading && keys.length === 0 && (
        <EmptyState
          icon={KeyRound}
          message="Give your developers a single API key to access any LLM through the gateway — no VerifyWise account needed."
          showBorder
        >
          {endpointCount === 0 && (
            <Box
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                p: "12px 16px",
                borderRadius: "4px",
                border: "1px solid #FEDF89",
                bgcolor: "#FFFAEB",
                mb: "8px",
              }}
            >
              <TriangleAlert
                size={16}
                strokeWidth={1.5}
                color="#B54708"
                style={{ flexShrink: 0, marginTop: 1 }}
              />
              <Box>
                <Typography fontSize={13} fontWeight={500} color="#B54708">
                  No endpoints configured
                </Typography>
                <Typography fontSize={12} color="#93370D" mt="2px">
                  Virtual keys route requests through endpoints. You need at least one active
                  endpoint before creating a virtual key.{" "}
                  <Link to="/ai-gateway/endpoints" style={{ color: "#B54708", fontWeight: 500 }}>
                    Go to Endpoints
                  </Link>{" "}
                  to set one up.
                </Typography>
              </Box>
            </Box>
          )}
          <EmptyStateTip
            icon={Server}
            title="Drop-in replacement for any OpenAI SDK"
            description="Developers point their existing OpenAI SDK at the gateway URL and swap in the virtual key. No code changes beyond the base URL and key — all guardrails, logging, and budget controls apply automatically."
          />
          <EmptyStateTip
            icon={KeyRound}
            title="Per-key budgets and rate limits"
            description="Each virtual key can have its own monthly spending cap and request-per-minute limit. When a key hits its budget, only that key is blocked — other keys and the rest of the gateway keep running."
          />
        </EmptyState>
      )}

      {!loading && keys.length > 0 && (
        <Stack gap="8px">
          {keys.map((key) => {
            const status = getStatusLabel(key);
            const budgetPct =
              key.max_budget_usd && Number(key.max_budget_usd) > 0
                ? (Number(key.current_spend_usd) / Number(key.max_budget_usd)) * 100
                : null;

            return (
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
                <Stack direction="row" alignItems="center" gap="12px" flex={1}>
                  <KeyRound size={16} strokeWidth={1.5} color={palette.text.tertiary} />
                  <Box flex={1}>
                    <Stack direction="row" alignItems="center" gap="8px">
                      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{key.name}</Typography>
                      <Chip label={status} size="small" uppercase={false} />
                    </Stack>
                    <Stack direction="row" gap="12px" alignItems="center" mt="2px">
                      <Typography
                        sx={{
                          fontSize: 12,
                          color: palette.text.tertiary,
                          fontFamily: "monospace",
                        }}
                      >
                        {key.key_prefix}
                      </Typography>
                      {key.max_budget_usd !== null && (
                        <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                          ${Number(key.current_spend_usd).toFixed(4)} / $
                          {Number(key.max_budget_usd).toFixed(2)}
                        </Typography>
                      )}
                      {key.rate_limit_rpm && (
                        <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                          {key.rate_limit_rpm} RPM
                        </Typography>
                      )}
                      {key.allowed_models?.length > 0 && (
                        <Chip
                          label={`models: ${key.allowed_models.join(", ")}`}
                          size="small"
                          uppercase={false}
                        />
                      )}
                      {key.blocked_models?.length > 0 && (
                        <Chip
                          label={`blocked: ${key.blocked_models.join(", ")}`}
                          size="small"
                          uppercase={false}
                        />
                      )}
                      {key.allowed_providers?.length > 0 && (
                        <Chip
                          label={`providers: ${key.allowed_providers.join(", ")}`}
                          size="small"
                          uppercase={false}
                        />
                      )}
                      {key.blocked_providers?.length > 0 && (
                        <Chip
                          label={`blocked providers: ${key.blocked_providers.join(", ")}`}
                          size="small"
                          uppercase={false}
                        />
                      )}
                      <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                        by {key.created_by_name} &middot; {displayFormattedDate(key.created_at)}
                      </Typography>
                    </Stack>
                    {budgetPct !== null && (
                      <Box
                        sx={{
                          mt: "6px",
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: palette.border.light,
                          overflow: "hidden",
                          maxWidth: 200,
                        }}
                      >
                        <Box
                          sx={{
                            height: "100%",
                            width: `${Math.min(100, budgetPct)}%`,
                            backgroundColor:
                              budgetPct >= 100
                                ? palette.status.error.text
                                : budgetPct >= 80
                                  ? palette.status.warning?.text || "#F79009"
                                  : palette.brand.primary,
                            borderRadius: 2,
                            transition: "width 0.3s",
                          }}
                        />
                      </Box>
                    )}
                  </Box>
                </Stack>

                <Stack direction="row" alignItems="center" gap="4px">
                  {key.is_active && !key.revoked_at && (
                    <IconButton
                      size="small"
                      onClick={() => setRevokeTarget(key)}
                      sx={{ p: 0.5 }}
                      aria-label="Revoke key"
                    >
                      <Ban size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                    </IconButton>
                  )}
                  {!key.is_active && (
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(key.id)}
                      sx={{ p: 0.5 }}
                      aria-label="Delete key"
                    >
                      <Trash2 size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                    </IconButton>
                  )}
                </Stack>
              </Stack>
            );
          })}
        </Stack>
      )}

      {/* Create Virtual Key Modal */}
      <StandardModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create virtual key"
        description="Generate an API key for developers to use the gateway with the OpenAI SDK."
        onSubmit={handleCreate}
        submitButtonText="Create key"
        isSubmitting={createSubmitting}
        maxWidth="480px"
      >
        <Stack gap="16px">
          <Field
            label="Name"
            placeholder="e.g., Backend production key"
            value={createForm.name}
            onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
            isRequired
          />
          <Field
            label="Monthly budget (USD)"
            placeholder="e.g., 50.00 (leave empty for no limit)"
            value={createForm.max_budget_usd}
            onChange={(e) => setCreateForm((p) => ({ ...p, max_budget_usd: e.target.value }))}
          />
          <Field
            label="Rate limit (requests per minute)"
            placeholder="e.g., 60 (leave empty for no limit)"
            value={createForm.rate_limit_rpm}
            onChange={(e) => setCreateForm((p) => ({ ...p, rate_limit_rpm: e.target.value }))}
          />
          <Field
            label="Allowed models"
            placeholder="e.g., gpt-4o-mini, claude-haiku* (comma-separated, leave empty for all)"
            value={createForm.allowed_models}
            onChange={(e) => setCreateForm((p) => ({ ...p, allowed_models: e.target.value }))}
          />
          <Field
            label="Blocked models"
            placeholder="e.g., gpt-4o, claude-opus* (comma-separated)"
            value={createForm.blocked_models}
            onChange={(e) => setCreateForm((p) => ({ ...p, blocked_models: e.target.value }))}
          />
          <Field
            label="Allowed providers"
            placeholder="e.g., openai, anthropic (comma-separated, leave empty for all)"
            value={createForm.allowed_providers}
            onChange={(e) => setCreateForm((p) => ({ ...p, allowed_providers: e.target.value }))}
          />
          <Field
            label="Blocked providers"
            placeholder="e.g., openrouter (comma-separated)"
            value={createForm.blocked_providers}
            onChange={(e) => setCreateForm((p) => ({ ...p, blocked_providers: e.target.value }))}
          />
          <DatePicker
            label="Expiry date"
            date={createForm.expires_at ? dayjs(createForm.expires_at) : null}
            handleDateChange={(value) =>
              setCreateForm((p) => ({ ...p, expires_at: value ? value.format("YYYY-MM-DD") : "" }))
            }
          />
          {createError && (
            <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>
              {createError}
            </Typography>
          )}
        </Stack>
      </StandardModal>

      {/* Key Display Modal (shown once after creation) */}
      <StandardModal
        isOpen={isKeyDisplayOpen}
        onClose={() => {
          setIsKeyDisplayOpen(false);
          setNewKey("");
          setCopied(false);
        }}
        title="Virtual key created"
        description="Copy the key below. It will not be shown again."
        maxWidth="560px"
        hideSubmitButton
        cancelButtonText="I copied, continue"
      >
        <Stack gap="16px">
          <Box
            sx={{
              p: "12px 16px",
              backgroundColor: KEY_DISPLAY_BG,
              border: `1px solid ${palette.border.dark}`,
              borderRadius: "4px",
              fontFamily: "monospace",
              fontSize: 13,
              wordBreak: "break-all",
              position: "relative",
            }}
          >
            {newKey}
            <IconButton
              size="small"
              onClick={copyToClipboard}
              sx={{ position: "absolute", top: 8, right: 8, p: 0.5 }}
              aria-label="Copy key"
            >
              {copied ? (
                <Check size={14} strokeWidth={1.5} color={palette.status.success.text} />
              ) : (
                <Copy size={14} strokeWidth={1.5} color={palette.text.tertiary} />
              )}
            </IconButton>
          </Box>

          <Box
            sx={{
              p: "12px 16px",
              backgroundColor: WARNING_BG,
              border: `1px solid ${WARNING_BORDER}`,
              borderRadius: "4px",
            }}
          >
            <Typography sx={{ fontSize: 12, color: WARNING_TEXT, fontWeight: 500 }}>
              This key will not be shown again. Store it securely.
            </Typography>
          </Box>

          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 500, mb: 1 }}>Usage example</Typography>
            <Box
              sx={{
                p: "12px 16px",
                backgroundColor: CODE_BLOCK_BG,
                borderRadius: "4px",
                fontFamily: "monospace",
                fontSize: 12,
                color: CODE_BLOCK_TEXT,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                overflow: "auto",
              }}
            >
              {`from openai import OpenAI

client = OpenAI(
    base_url="${GATEWAY_URL}/v1",
    api_key="${newKey}"
)

response = client.chat.completions.create(
    model="your-endpoint-slug",
    messages=[{"role": "user", "content": "Hello"}]
)`}
            </Box>
          </Box>

          <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
            CORS is disabled on gateway routes. Use virtual keys from backend services only.
          </Typography>
        </Stack>
      </StandardModal>

      {/* Revoke Confirmation Modal */}
      <StandardModal
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="Revoke virtual key"
        description={`Are you sure you want to revoke "${revokeTarget?.name}"? All requests using this key will be rejected immediately.`}
        onSubmit={handleRevoke}
        submitButtonText="Revoke key"
        maxWidth="440px"
      />
    </>
  );

  if (embedded) {
    return (
      <Box sx={cardSx}>
        <Stack gap="12px">
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Box>
              <Typography sx={sectionTitleSx}>Virtual keys</Typography>
              <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mt: "4px" }}>
                Generate API keys for developers to use the gateway from their code.
              </Typography>
              {!loading && endpointCount === 0 && (
                <Typography sx={{ fontSize: 12, color: "#B54708", fontWeight: 500, mt: "4px" }}>
                  Create at least one endpoint before generating virtual keys.
                </Typography>
              )}
            </Box>
            {createKeyButton}
          </Stack>
          {content}
        </Stack>
      </Box>
    );
  }

  return (
    <PageHeaderExtended
      title="Virtual keys"
      description="Generate API keys for developers to use the gateway from their code."
      tipBoxEntity="ai-gateway-virtual-keys"
      helpArticlePath="ai-gateway/virtual-keys"
      actionButton={createKeyButton}
    >
      {content}
    </PageHeaderExtended>
  );
}
