import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Typography, Stack, IconButton } from "@mui/material";
import {
  Check,
  Circle,
  ArrowRight,
  Code2,
  Fingerprint,
  ShieldCheck,
  Gauge,
  Wallet,
  GitBranch,
  Lock,
  History,
  Copy,
  Play,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import StandardModal from "../../../components/Modals/StandardModal";
import palette from "../../../themes/palette";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { validateApiKeyFormat } from "../../../../application/utils/apiKeyValidation";
import {
  TOP_PROVIDERS,
  useGatewayModels,
  slugify,
  GATEWAY_URL,
  CODE_BLOCK_BG,
  CODE_BLOCK_TEXT,
  WARNING_BG,
  WARNING_BORDER,
  WARNING_TEXT,
  KEY_DISPLAY_BG,
} from "../shared";

// Spinner keyframes for loading state
const spinKeyframes = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
if (typeof document !== "undefined" && !document.getElementById("vw-spin-keyframes")) {
  const style = document.createElement("style");
  style.id = "vw-spin-keyframes";
  style.textContent = spinKeyframes;
  document.head.appendChild(style);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetupStatus {
  hasApiKey: boolean;
  hasEndpoint: boolean;
  hasVirtualKey: boolean;
  hasRequests: boolean;
}

interface OnboardingOverlayProps {
  onGetStarted: () => void;
  setupStatus: SetupStatus;
  onStepCompleted: () => void;
}

// ─── Architecture diagram (compact) ──────────────────────────────────────────

function ArchDiagram() {
  const cardBase = {
    background: "linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)",
    border: `0.5px solid #c0c5cc`,
    borderRadius: "4px",
    p: "14px 18px",
    boxShadow: "0 1px 3px rgba(16,24,40,0.05)",
  };

  const featureIconBase = {
    width: 26,
    height: 26,
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };

  const HArrow = () => (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, flexShrink: 0 }}>
      <Box sx={{ position: "relative", width: 26, height: 1.5, backgroundColor: palette.border.dark }}>
        <Box sx={{
          position: "absolute", right: -1, top: "50%",
          transform: "translateY(-50%) rotate(-45deg)",
          width: 6, height: 6,
          borderRight: `1.5px solid ${palette.border.dark}`,
          borderBottom: `1.5px solid ${palette.border.dark}`,
        }} />
      </Box>
    </Box>
  );

  const FeatureRow = ({ icon, label, colorScheme }: {
    icon: React.ReactNode; label: string; colorScheme: { bg: string; color: string };
  }) => (
    <Stack direction="row" alignItems="center" gap="6px" sx={{ py: "1px" }}>
      <Box sx={{ ...featureIconBase, background: colorScheme.bg, color: colorScheme.color }}>{icon}</Box>
      <Typography sx={{ fontSize: 12, fontWeight: 500, color: palette.text.secondary }}>{label}</Typography>
    </Stack>
  );

  const SectionLabel = ({ children }: { children: string }) => (
    <Typography sx={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: palette.text.disabled, borderTop: `0.5px solid #f2f4f7`, pt: "4px", mt: "6px", mb: "2px" }}>
      {children}
    </Typography>
  );

  const PROVIDER_LABELS = ["OpenAI", "Anthropic", "Google Gemini", "AWS Bedrock", "Azure OpenAI", "Mistral"];

  return (
    <Stack direction="row" alignItems="stretch" justifyContent="center">
      <Box sx={{ ...cardBase, minWidth: 150, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: palette.text.primary, letterSpacing: "-0.2px", mb: "2px" }}>Your app</Typography>
        <Typography sx={{ fontSize: 11, color: palette.text.disabled, mb: "10px" }}>Any language or framework</Typography>
        <Stack direction="row" alignItems="center" gap="6px" sx={{ background: palette.background.accent, border: `0.5px solid ${palette.border.light}`, borderRadius: "4px", p: "6px 10px" }}>
          <Code2 size={12} color={palette.text.disabled} strokeWidth={1.8} />
          <Box component="code" sx={{ fontSize: 10, color: palette.text.tertiary, background: "#f2f4f7", px: "5px", py: "1px", borderRadius: "3px", fontFamily: "monospace" }}>REST API</Box>
        </Stack>
        <Typography sx={{ fontSize: 9, color: palette.text.disabled, mt: "4px" }}>OpenAI-compatible format</Typography>
      </Box>

      <HArrow />

      <Box sx={{ ...cardBase, flex: 1, maxWidth: 320, borderColor: `${palette.brand.primary}28`, background: "linear-gradient(180deg, #ffffff 0%, #f7fdfb 100%)" }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: palette.brand.primary, letterSpacing: "-0.2px", mb: "2px" }}>VerifyWise AI gateway</Typography>
        <Typography sx={{ fontSize: 10, color: palette.text.disabled, mb: "4px" }}>Unified proxy with governance controls</Typography>
        <SectionLabel>Security &amp; guardrails</SectionLabel>
        <FeatureRow icon={<Fingerprint size={12} strokeWidth={1.8} />} label="PII detection" colorScheme={{ bg: "#ecfdf3", color: "#13715B" }} />
        <FeatureRow icon={<ShieldCheck size={12} strokeWidth={1.8} />} label="Content filter" colorScheme={{ bg: "#ecfdf3", color: "#13715B" }} />
        <SectionLabel>Traffic controls</SectionLabel>
        <FeatureRow icon={<Gauge size={12} strokeWidth={1.8} />} label="Rate limiting" colorScheme={{ bg: "#eff8ff", color: "#1570EF" }} />
        <FeatureRow icon={<Wallet size={12} strokeWidth={1.8} />} label="Budget controls" colorScheme={{ bg: "#eff8ff", color: "#1570EF" }} />
        <FeatureRow icon={<GitBranch size={12} strokeWidth={1.8} />} label="Fallback chains" colorScheme={{ bg: "#eff8ff", color: "#1570EF" }} />
        <SectionLabel>Governance</SectionLabel>
        <FeatureRow icon={<Lock size={12} strokeWidth={1.8} />} label="Role-based access" colorScheme={{ bg: "#fffaeb", color: "#B54708" }} />
        <FeatureRow icon={<History size={12} strokeWidth={1.8} />} label="Audit trail" colorScheme={{ bg: "#fffaeb", color: "#B54708" }} />
      </Box>

      <HArrow />

      <Box sx={{ ...cardBase, minWidth: 170 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: palette.brand.primary, letterSpacing: "-0.2px", mb: "2px" }}>LLM providers</Typography>
        <Typography sx={{ fontSize: 10, color: palette.text.disabled, mb: "8px" }}>100+ supported models</Typography>
        <Stack gap="3px">
          {PROVIDER_LABELS.map((name) => (
            <Stack key={name} direction="row" alignItems="center" gap="6px">
              <Box sx={{ width: 20, height: 20, borderRadius: "3px", background: palette.background.accent, border: `0.5px solid ${palette.border.light}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Typography sx={{ fontSize: 7, fontWeight: 700, color: palette.text.tertiary, lineHeight: 1 }}>{name.slice(0, 2).toUpperCase()}</Typography>
              </Box>
              <Typography sx={{ fontSize: 12, fontWeight: 500, color: palette.text.secondary }}>{name}</Typography>
            </Stack>
          ))}
          <Typography sx={{ fontSize: 10, color: palette.text.disabled, pl: "26px", mt: "2px" }}>+ xAI, Cohere, Ollama, Groq...</Typography>
        </Stack>
      </Box>
    </Stack>
  );
}

// ─── Checklist item ───────────────────────────────────────────────────────────

interface ChecklistItemProps {
  label: string;
  done: boolean;
  onClick?: () => void;
}

function ChecklistItem({ label, done, onClick }: ChecklistItemProps) {
  const isClickable = !done && !!onClick;
  return (
    <Stack
      direction="row"
      alignItems="center"
      gap="8px"
      onClick={() => isClickable && onClick()}
      sx={{
        cursor: isClickable ? "pointer" : "default",
        borderRadius: "4px",
        px: "2px",
        py: "2px",
        "&:hover": isClickable
          ? { "& .checklist-label": { textDecoration: "underline" } }
          : {},
        transition: "background-color 0.15s",
      }}
    >
      {done ? (
        <Box sx={{ width: 18, height: 18, borderRadius: "50%", background: palette.brand.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Check size={11} color={palette.brand.primary} strokeWidth={2.5} />
        </Box>
      ) : (
        <Circle size={18} color={palette.border.dark} strokeWidth={1.5} style={{ flexShrink: 0 }} />
      )}
      <Typography
        className="checklist-label"
        sx={{
          fontSize: 13,
          color: done ? palette.text.tertiary : palette.text.primary,
          textDecoration: done ? "line-through" : "none",
          textDecorationColor: palette.text.disabled,
        }}
      >
        {label}
      </Typography>
    </Stack>
  );
}

// ─── Main overlay ─────────────────────────────────────────────────────────────

export default function OnboardingOverlay({ onGetStarted, setupStatus, onStepCompleted }: OnboardingOverlayProps) {
  const [activeModal, setActiveModal] = useState<"api-key" | "endpoint" | "virtual-key" | "first-request" | null>(null);

  // ── API key modal state ──
  const [keyForm, setKeyForm] = useState({ key_name: "", provider: "", api_key: "" });
  const [keyError, setKeyError] = useState("");
  const [keySubmitting, setKeySubmitting] = useState(false);

  // ── Provider list (dynamic, fetched when API key modal opens) ──
  const [providerItems, setProviderItems] = useState(TOP_PROVIDERS);
  const [topProviderCount, setTopProviderCount] = useState(TOP_PROVIDERS.length);

  // ── Endpoint modal state ──
  const [endpointForm, setEndpointForm] = useState({ display_name: "", slug: "", provider: "", model: "", api_key_id: "" });
  const { providerItems: gatewayProviders, getModelsForProvider } = useGatewayModels();
  const [endpointError, setEndpointError] = useState("");
  const [endpointSubmitting, setEndpointSubmitting] = useState(false);
  const [availableKeys, setAvailableKeys] = useState<{ _id: string; name: string }[]>([]);

  // ── Virtual key modal state ──
  const [vkeyName, setVkeyName] = useState("");
  const [vkeyError, setVkeyError] = useState("");
  const [vkeySubmitting, setVkeySubmitting] = useState(false);
  const [createdKey, setCreatedKey] = useState("");
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── First request modal state ──
  const [firstReqSlug, setFirstReqSlug] = useState("");
  const [firstReqVirtualKey, setFirstReqVirtualKey] = useState("");
  const [firstReqRunning, setFirstReqRunning] = useState(false);
  const [firstReqResponse, setFirstReqResponse] = useState("");
  const [firstReqError, setFirstReqError] = useState("");

  // Fetch dynamic providers when API key modal opens
  useEffect(() => {
    if (activeModal !== "api-key") return;
    const topIds = new Set(TOP_PROVIDERS.map((p) => p._id));
    apiServices.get<Record<string, any>>("/ai-gateway/providers").then((res) => {
      const dynamic: string[] = res?.data?.data?.providers || [];
      const others = dynamic
        .filter((p) => !topIds.has(p))
        .sort()
        .map((p) => ({ _id: p, name: p }));
      if (others.length > 0) {
        setProviderItems([...TOP_PROVIDERS, ...others]);
        setTopProviderCount(TOP_PROVIDERS.length);
      }
    }).catch(() => {});
  }, [activeModal]);

  // Fetch available keys when endpoint modal opens (with abort guard)
  useEffect(() => {
    if (activeModal !== "endpoint") return;
    let cancelled = false;
    setAvailableKeys([]);
    apiServices.get<Record<string, any>>("/ai-gateway/keys").then((res) => {
      if (cancelled) return;
      const keys = (res?.data?.data || []).filter((k: { is_active: boolean }) => k.is_active);
      setAvailableKeys(keys.map((k: { id: number; key_name: string; provider: string }) => ({
        _id: String(k.id),
        name: `${k.key_name} (${k.provider})`,
      })));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeModal]);

  // Fetch endpoint slug and virtual key prefix when first-request modal opens
  useEffect(() => {
    if (activeModal !== "first-request") return;
    let cancelled = false;
    Promise.all([
      apiServices.get<Record<string, any>>("/ai-gateway/endpoints").catch(() => null),
      apiServices.get<Record<string, any>>("/ai-gateway/virtual-keys").catch(() => null),
    ]).then(([epRes, vkRes]) => {
      if (cancelled) return;
      const endpoints = epRes?.data?.endpoints || [];
      const activeEp = endpoints.find((e: { is_active: boolean }) => e.is_active);
      if (activeEp) setFirstReqSlug(activeEp.slug);
      const vkeys = vkRes?.data?.data || [];
      const activeVk = vkeys.find((k: { is_active: boolean }) => k.is_active);
      if (activeVk) setFirstReqVirtualKey(activeVk.key_prefix);
    });
    return () => { cancelled = true; };
  }, [activeModal]);

  useEffect(() => {
    return () => { if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current); };
  }, []);

  const openModal = useCallback((modal: "api-key" | "endpoint" | "virtual-key" | "first-request") => {
    // Clear any prior errors before opening
    setKeyError("");
    setEndpointError("");
    setVkeyError("");
    setActiveModal(modal);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setKeyForm({ key_name: "", provider: "", api_key: "" });
    setKeyError("");
    setEndpointForm({ display_name: "", slug: "", provider: "", model: "", api_key_id: "" });
    setEndpointError("");
    setVkeyName("");
    setVkeyError("");
    setCreatedKey("");
    setCopied(false);
    setFirstReqSlug("");
    setFirstReqVirtualKey("");
    setFirstReqRunning(false);
    setFirstReqResponse("");
    setFirstReqError("");
  }, []);

  // Guard against modal close triggered by MUI Select popover interactions
  const selectOpenRef = useRef(false);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      selectOpenRef.current = !!document.querySelector(".MuiPopover-root, .MuiMenu-root");
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const safeCloseModal = useCallback(() => {
    if (selectOpenRef.current) return;
    // Small delay to let MUI finish removing the popover before checking
    setTimeout(() => {
      if (!selectOpenRef.current) closeModal();
    }, 50);
  }, [closeModal]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(createdKey);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  // ── Submit handlers ──

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
      closeModal();
      onStepCompleted();
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { detail?: string; message?: string } } })?.response?.data;
      setKeyError(errData?.detail || errData?.message || "Failed to create API key");
    } finally {
      setKeySubmitting(false);
    }
  };

  const handleCreateEndpoint = async () => {
    if (!endpointForm.display_name || !endpointForm.slug || !endpointForm.provider || !endpointForm.model || !endpointForm.api_key_id) {
      setEndpointError("Name, provider, model, and API key are required");
      return;
    }
    setEndpointSubmitting(true);
    setEndpointError("");
    try {
      await apiServices.post("/ai-gateway/endpoints", {
        display_name: endpointForm.display_name,
        slug: endpointForm.slug,
        provider: endpointForm.provider,
        model: endpointForm.model,
        api_key_id: Number(endpointForm.api_key_id),
      });
      closeModal();
      onStepCompleted();
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { detail?: string; message?: string } } })?.response?.data;
      setEndpointError(errData?.detail || errData?.message || "Failed to create endpoint");
    } finally {
      setEndpointSubmitting(false);
    }
  };

  const handleCreateVirtualKey = async () => {
    if (!vkeyName.trim()) {
      setVkeyError("Name is required");
      return;
    }
    setVkeySubmitting(true);
    setVkeyError("");
    try {
      const res = await apiServices.post<Record<string, any>>("/ai-gateway/virtual-keys", { name: vkeyName.trim() });
      const created = res?.data?.data;
      if (created?.plain_key) {
        setCreatedKey(created.plain_key);
        onStepCompleted();
      } else {
        setVkeyError("Key was created but could not be retrieved. Refresh the page.");
      }
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { detail?: string; message?: string } } })?.response?.data;
      setVkeyError(errData?.detail || errData?.message || "Failed to create virtual key");
    } finally {
      setVkeySubmitting(false);
    }
  };

  const handleRunFirstRequest = async () => {
    if (!firstReqSlug) {
      setFirstReqError("No endpoint found. Create an endpoint first.");
      return;
    }
    setFirstReqRunning(true);
    setFirstReqError("");
    setFirstReqResponse("");
    try {
      const res = await apiServices.post<Record<string, any>>("/ai-gateway/chat", {
        endpoint_slug: firstReqSlug,
        messages: [{ role: "user", content: "Say hello and introduce yourself in one sentence." }],
      });
      const data = res?.data?.data || res?.data;
      const text = data?.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
      setFirstReqResponse(text);
      onStepCompleted();
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { detail?: string; message?: string } } })?.response?.data;
      setFirstReqError(errData?.detail || errData?.message || "Request failed. Check that your endpoint and API key are configured correctly.");
    } finally {
      setFirstReqRunning(false);
    }
  };

  const CHECKLIST_ITEMS: ChecklistItemProps[] = [
    { label: "Add a provider API key", done: setupStatus.hasApiKey, onClick: () => openModal("api-key") },
    { label: "Create an endpoint", done: setupStatus.hasEndpoint, onClick: () => openModal("endpoint") },
    { label: "Create a virtual key", done: setupStatus.hasVirtualKey, onClick: () => openModal("virtual-key") },
    { label: "Make your first request", done: setupStatus.hasRequests, onClick: () => openModal("first-request") },
  ];

  const isKeyDisplayPhase = createdKey !== "";

  return (
    <>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(245,247,249,0.90)",
          backdropFilter: "blur(1px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          zIndex: 10,
          overflowY: "auto",
          pt: "20px",
          pb: "24px",
          px: "16px",
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 820 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: "24px" }}>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: palette.text.primary, letterSpacing: "-0.2px", mb: "4px" }}>
                Visualize your LLM traffic
              </Typography>
              <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mb: "14px" }}>
                Make your first request to see a real-time map of your model connections
              </Typography>
              <Stack gap="2px">
                {CHECKLIST_ITEMS.map((item) => (
                  <ChecklistItem key={item.label} {...item} />
                ))}
              </Stack>
            </Box>
            <Box sx={{ flexShrink: 0, pt: "2px" }}>
              <CustomizableButton
                text="Read the guide"
                onClick={onGetStarted}
                endIcon={<ArrowRight size={14} strokeWidth={1.8} />}
              />
            </Box>
          </Stack>
          <ArchDiagram />
        </Box>
      </Box>

      {/* ── Modal 1: Add API key ── */}
      <StandardModal
        isOpen={activeModal === "api-key"}
        onClose={safeCloseModal}
        title="Add API key"
        description="Add a provider API key for your gateway endpoints"
        onSubmit={handleCreateKey}
        submitButtonText="Add key"
        isSubmitting={keySubmitting}
        maxWidth="480px"
      >
        <Stack gap="16px">
          <Field label="Key name" placeholder="e.g., Production OpenAI key" value={keyForm.key_name} onChange={(e) => setKeyForm((p) => ({ ...p, key_name: e.target.value }))} isRequired />
          <Select id="onboarding-provider" label="Provider" placeholder="Select provider" value={keyForm.provider} items={providerItems} onChange={(e) => setKeyForm((p) => ({ ...p, provider: e.target.value as string }))} getOptionValue={(item) => item._id} dividerAfterIndex={topProviderCount} dividerLabel="Other providers" isRequired />
          <Field label="API key" placeholder="sk-..." value={keyForm.api_key} onChange={(e) => setKeyForm((p) => ({ ...p, api_key: e.target.value }))} autoComplete="off" isRequired />
          {keyError && <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>{keyError}</Typography>}
        </Stack>
      </StandardModal>

      {/* ── Modal 2: Create endpoint ── */}
      <StandardModal
        isOpen={activeModal === "endpoint"}
        onClose={safeCloseModal}
        title="Create endpoint"
        description="Configure a new LLM provider endpoint"
        onSubmit={handleCreateEndpoint}
        submitButtonText="Create endpoint"
        isSubmitting={endpointSubmitting}
        maxWidth="480px"
      >
        <Stack gap="16px">
          <Field label="Endpoint name" placeholder="e.g., Production GPT-4o" value={endpointForm.display_name} onChange={(e) => {
            const val = e.target.value;
            setEndpointForm((p) => ({ ...p, display_name: val, slug: slugify(val) }));
          }} isRequired />
          {endpointForm.slug && (
            <Typography sx={{ fontSize: 11, color: palette.text.tertiary, mt: "-8px" }}>
              Endpoint slug: <strong>{endpointForm.slug}</strong>
            </Typography>
          )}
          <Stack direction="row" gap="8px">
            <Box flex={1}>
              <Select id="onboarding-provider" label="Provider" placeholder="Select provider" value={endpointForm.provider} items={gatewayProviders} onChange={(e) => setEndpointForm((p) => ({ ...p, provider: e.target.value as string, model: "" }))} getOptionValue={(item) => item._id} isRequired />
            </Box>
            <Box flex={2}>
              <Select id="onboarding-model" label="Model" placeholder={endpointForm.provider ? "Select a model" : "Select a provider first"} value={endpointForm.model} items={endpointForm.provider ? getModelsForProvider(endpointForm.provider) : []} onChange={(e) => setEndpointForm((p) => ({ ...p, model: e.target.value as string }))} getOptionValue={(item) => item._id} isRequired />
            </Box>
          </Stack>
          {availableKeys.length > 0 ? (
            <Select id="onboarding-api-key" label="API key" placeholder="Select an API key" value={endpointForm.api_key_id} items={availableKeys} onChange={(e) => setEndpointForm((p) => ({ ...p, api_key_id: e.target.value as string }))} getOptionValue={(item) => item._id} isRequired />
          ) : (
            <Stack direction="row" alignItems="flex-start" gap="6px" sx={{ p: "8px 12px", bgcolor: palette.background.accent, borderRadius: "4px", border: `1px solid ${palette.border.light}` }}>
              <Typography sx={{ fontSize: 12, lineHeight: 1.5, color: palette.text.tertiary }}>
                No API keys available. Complete step 1 first.
              </Typography>
            </Stack>
          )}
          {endpointError && <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>{endpointError}</Typography>}
        </Stack>
      </StandardModal>

      {/* ── Modal 3a: Create virtual key (form phase) ── */}
      <StandardModal
        isOpen={activeModal === "virtual-key" && !isKeyDisplayPhase}
        onClose={closeModal}
        title="Create virtual key"
        description="Generate an API key for developers to use the gateway"
        onSubmit={handleCreateVirtualKey}
        submitButtonText="Create key"
        isSubmitting={vkeySubmitting}
        maxWidth="480px"
      >
        <Stack gap="16px">
          <Field label="Name" placeholder="e.g., Backend production key" value={vkeyName} onChange={(e) => setVkeyName(e.target.value)} isRequired />
          {vkeyError && <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>{vkeyError}</Typography>}
        </Stack>
      </StandardModal>

      {/* ── Modal 3b: Virtual key display (shown once) ── */}
      <StandardModal
        isOpen={isKeyDisplayPhase}
        onClose={closeModal}
        title="Virtual key created"
        description="Copy the key below. It won't be shown again."
        maxWidth="560px"
        onSubmit={closeModal}
        submitButtonText="I copied, continue"
        showCancelButton={false}
      >
        <Stack gap="16px">
          <Box sx={{ p: "12px 16px", backgroundColor: KEY_DISPLAY_BG, border: `1px solid ${palette.border.dark}`, borderRadius: "4px", fontFamily: "monospace", fontSize: 13, wordBreak: "break-all", position: "relative" }}>
            {createdKey}
            <IconButton size="small" onClick={copyToClipboard} sx={{ position: "absolute", top: 8, right: 8, p: 0.5 }} aria-label="Copy key">
              {copied ? <Check size={14} strokeWidth={1.5} color={palette.status.success.text} /> : <Copy size={14} strokeWidth={1.5} color={palette.text.tertiary} />}
            </IconButton>
          </Box>
          <Box sx={{ p: "12px 16px", backgroundColor: WARNING_BG, border: `1px solid ${WARNING_BORDER}`, borderRadius: "4px" }}>
            <Typography sx={{ fontSize: 12, color: WARNING_TEXT, fontWeight: 500 }}>
              This key won't be shown again. Store it securely.
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 500, mb: 1 }}>Usage example</Typography>
            <Box sx={{ p: "12px 16px", backgroundColor: CODE_BLOCK_BG, borderRadius: "4px", fontFamily: "monospace", fontSize: 12, color: CODE_BLOCK_TEXT, lineHeight: 1.6, whiteSpace: "pre-wrap", overflow: "auto" }}>
{`from openai import OpenAI

client = OpenAI(
    base_url="${GATEWAY_URL}/v1",
    api_key="${createdKey}"
)

response = client.chat.completions.create(
    model="your-endpoint-slug",
    messages=[{"role": "user", "content": "Hello"}]
)`}
            </Box>
          </Box>
        </Stack>
      </StandardModal>

      {/* ── Modal 4: Make your first request ── */}
      <StandardModal
        isOpen={activeModal === "first-request"}
        onClose={closeModal}
        title="Make your first request"
        description="Run a test request through the gateway to complete setup"
        maxWidth="560px"
        hideSubmitButton
      >
        <Stack gap="16px">
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 500, mb: 1 }}>Code</Typography>
            <Box sx={{ p: "12px 16px", backgroundColor: CODE_BLOCK_BG, borderRadius: "4px", fontFamily: "monospace", fontSize: 12, color: CODE_BLOCK_TEXT, lineHeight: 1.6, whiteSpace: "pre-wrap", overflow: "auto" }}>
{`from openai import OpenAI

client = OpenAI(
    base_url="${GATEWAY_URL}/v1",
    api_key="${firstReqVirtualKey || "sk-vw-your-key"}"
)

response = client.chat.completions.create(
    model="${firstReqSlug || "your-endpoint-slug"}",
    messages=[{"role": "user", "content": "Say hello and introduce yourself in one sentence."}]
)
print(response.choices[0].message.content)`}
            </Box>
          </Box>

          <CustomizableButton
            text={firstReqRunning ? "Running..." : firstReqResponse ? "Done" : "Run"}
            icon={firstReqRunning ? <Loader2 size={14} strokeWidth={1.8} style={{ animation: "spin 1s linear infinite" }} /> : firstReqResponse ? <CheckCircle size={14} strokeWidth={1.8} /> : <Play size={14} strokeWidth={1.8} />}
            onClick={handleRunFirstRequest}
            sx={{ alignSelf: "flex-start" }}
          />

          {firstReqResponse && (
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 500, mb: 1, color: palette.status.success.text }}>Response</Typography>
              <Box sx={{ p: "12px 16px", backgroundColor: palette.background.accent, border: `1px solid ${palette.border.light}`, borderRadius: "4px", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {firstReqResponse}
              </Box>
            </Box>
          )}

          {firstReqError && (
            <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>{firstReqError}</Typography>
          )}
        </Stack>
      </StandardModal>
    </>
  );
}
