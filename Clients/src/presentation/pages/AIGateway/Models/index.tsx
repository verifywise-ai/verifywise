import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Typography, Stack, IconButton, Tooltip } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import {
  Layers,
  Eye,
  Wrench,
  FileText,
  Database,
  CirclePlus,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Trash2,
  Medal,
  Trophy,
  Award,
} from "lucide-react";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import TabBar from "../../../components/TabBar";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import palette from "../../../themes/palette";
import { sectionTitleSx, useCardSx, ProviderIcon } from "../shared";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ModelInfo {
  id: string;
  model?: string;
  provider: string;
  mode: string;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  input_cost_per_million: number;
  output_cost_per_million: number;
  supports_vision: boolean;
  supports_function_calling: boolean;
  supports_pdf_input: boolean;
  supports_prompt_caching: boolean;
  supports_response_schema: boolean;
  supports_system_messages: boolean;
  supports_tool_choice: boolean;
  supports_parallel_function_calling: boolean;
}

const TABS = [
  { label: "All models", value: "catalog", icon: "Layers" as const },
  { label: "Cost calculator", value: "calculator", icon: "Calculator" as const },
  { label: "Feature comparison", value: "compare", icon: "GitCompare" as const },
];

const MODE_OPTIONS = [
  { _id: "", name: "All modes" },
  { _id: "chat", name: "Chat" },
  { _id: "embedding", name: "Embedding" },
  { _id: "image_generation", name: "Image generation" },
  { _id: "audio_transcription", name: "Audio transcription" },
  { _id: "completion", name: "Completion" },
];

const FEATURE_FILTERS = [
  { key: "supports_vision", label: "Vision", icon: Eye },
  { key: "supports_function_calling", label: "Tools", icon: Wrench },
  { key: "supports_pdf_input", label: "PDF", icon: FileText },
  { key: "supports_prompt_caching", label: "Caching", icon: Database },
];

const PAGE_SIZE = 25;

const formatTokens = (n: number | null) => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
};

const formatCost = (n: number) => {
  if (n == null || n === 0) return "—";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function ModelsPage() {
  const cardSx = useCardSx();
  const navigate = useNavigate();
  const { tab: urlTab } = useParams<{ tab: string }>();
  const VALID_TABS = TABS.map((t) => t.value);
  const activeTab = urlTab && VALID_TABS.includes(urlTab) ? urlTab : "catalog";
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [featureFilters, setFeatureFilters] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  // Cost calculator
  const [calcRequests, setCalcRequests] = useState("1000");
  const [calcInputTokens, setCalcInputTokens] = useState("2000");
  const [calcOutputTokens, setCalcOutputTokens] = useState("500");
  const [calcShowAll, setCalcShowAll] = useState(false);

  // Feature comparison
  const [compareIds, setCompareIds] = useState<string[]>(["gpt-4o", "claude-sonnet-4-20250514", "gemini-2.0-flash"]);

  const loadModels = useCallback(async () => {
    try {
      const res = await apiServices.get<Record<string, any>>("/ai-gateway/models/catalog");
      setModels(res?.data?.data?.models || res?.data?.models || []);
      setError("");
    } catch {
      setError("Failed to load model catalog. Is the AI Gateway running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadModels(); }, [loadModels]);

  // Filter out LiteLLM's description/sample row
  const cleanModels = useMemo(() => {
    return models.filter((m) => {
      const name = (m.model || m.id || "").toLowerCase();
      return name !== "sample_spec" && !m.provider?.includes("docs.litellm.ai");
    });
  }, [models]);

  // Derived: unique providers
  const providers = useMemo(() => {
    const set = new Set(cleanModels.map((m) => m.provider));
    return [{ _id: "", name: "All providers" }, ...[...set].sort().map((p) => ({ _id: p, name: p }))];
  }, [cleanModels]);

  // Filtered + searched models
  const filtered = useMemo(() => {
    let result = cleanModels;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((m) => (m.model || m.id || "").toLowerCase().includes(q) || m.provider.toLowerCase().includes(q));
    }
    if (providerFilter) result = result.filter((m) => m.provider === providerFilter);
    if (modeFilter) result = result.filter((m) => m.mode === modeFilter);
    for (const feat of featureFilters) {
      result = result.filter((m) => (m as any)[feat] === true);
    }
    return result;
  }, [cleanModels, search, providerFilter, modeFilter, featureFilters]);

  const pageCount = useMemo(() => Math.ceil(filtered.length / PAGE_SIZE), [filtered]);
  const pageModels = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  // Cost calculator results
  const calcResults = useMemo(() => {
    const reqs = Number(calcRequests) || 0;
    const inp = Number(calcInputTokens) || 0;
    const out = Number(calcOutputTokens) || 0;
    if (!reqs || !inp) return [];

    return filtered
      .filter((m) => m.mode === "chat" && (m.input_cost_per_million > 0 || m.output_cost_per_million > 0))
      .map((m) => {
        const dailyInputCost = (reqs * inp * m.input_cost_per_million) / 1_000_000;
        const dailyOutputCost = (reqs * out * m.output_cost_per_million) / 1_000_000;
        const monthlyCost = (dailyInputCost + dailyOutputCost) * 30;
        return { ...m, monthlyCost, dailyCost: dailyInputCost + dailyOutputCost };
      })
      .sort((a, b) => a.monthlyCost - b.monthlyCost);
  }, [filtered, calcRequests, calcInputTokens, calcOutputTokens]);

  const calcResultsTotal = calcResults.length;
  const calcResultsVisible = useMemo(() => {
    return calcShowAll ? calcResults : calcResults.slice(0, 50);
  }, [filtered, calcRequests, calcInputTokens, calcOutputTokens]);

  // Compare models
  const compareModels = useMemo(() => models.filter((m) => compareIds.includes(m.id)), [models, compareIds]);

  const toggleFeature = (key: string) => {
    setFeatureFilters((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setPage(0);
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev
    );
  };

  // ─── Feature icon helper ──────────────────────────────────────────────────

  const featureIcons = (m: ModelInfo) => (
    <Stack direction="row" gap="4px" alignItems="center">
      {m.supports_vision && <Tooltip title="Vision" arrow><span style={{ display: "inline-flex" }}><Eye size={12} strokeWidth={1.5} color={palette.brand.primary} /></span></Tooltip>}
      {m.supports_function_calling && <Tooltip title="Function calling" arrow><span style={{ display: "inline-flex" }}><Wrench size={12} strokeWidth={1.5} color={palette.brand.primary} /></span></Tooltip>}
      {m.supports_pdf_input && <Tooltip title="PDF input" arrow><span style={{ display: "inline-flex" }}><FileText size={12} strokeWidth={1.5} color={palette.brand.primary} /></span></Tooltip>}
      {m.supports_prompt_caching && <Tooltip title="Prompt caching" arrow><span style={{ display: "inline-flex" }}><Database size={12} strokeWidth={1.5} color={palette.text.tertiary} /></span></Tooltip>}
    </Stack>
  );

  return (
    <PageHeaderExtended
      title="Models"
      description={`Browse ${cleanModels.length.toLocaleString()} LLM models across ${providers.length - 1} providers.`}
      tipBoxEntity="ai-gateway-models"
      helpArticlePath="ai-gateway/models"
    >
      <TabContext value={activeTab}>
        <TabBar
          tabs={TABS}
          activeTab={activeTab}
          onChange={(_, v) => navigate(`/ai-gateway/models/${v}`, { replace: true })}
        />

        <Box sx={{ mt: "16px" }}>
          {/* ─── All Models tab ─────────────────────────────────────── */}
          {activeTab === "catalog" && (
            <Stack gap="16px">
              {/* Filters */}
              <Stack direction="row" gap="8px" flexWrap="wrap" alignItems="flex-end">
                <Box sx={{ width: "240px", minWidth: "160px" }}>
                  <Field
                    placeholder="Search models..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                    sx={{ minWidth: "unset" }}
                  />
                </Box>
                <Box sx={{ width: "160px" }}>
                  <Select
                    id="provider-filter"
                    value={providerFilter}
                    items={providers}
                    onChange={(e) => { setProviderFilter(e.target.value as string); setPage(0); }}
                    getOptionValue={(i) => i._id}
                    sx={{ minWidth: "unset" }}
                  />
                </Box>
                <Box sx={{ width: "160px" }}>
                  <Select
                    id="mode-filter"
                    value={modeFilter}
                    items={MODE_OPTIONS}
                    onChange={(e) => { setModeFilter(e.target.value as string); setPage(0); }}
                    getOptionValue={(i) => i._id}
                    sx={{ minWidth: "unset" }}
                  />
                </Box>
                {FEATURE_FILTERS.map((f) => {
                  const active = featureFilters.has(f.key);
                  const Icon = f.icon;
                  return (
                    <Box
                      key={f.key}
                      onClick={() => toggleFeature(f.key)}
                      sx={{
                        display: "flex", alignItems: "center", gap: "4px",
                        px: "8px", height: "34px", borderRadius: "4px", cursor: "pointer",
                        border: `1px solid ${active ? palette.brand.primary : palette.border.dark}`,
                        backgroundColor: active ? `${palette.brand.primary}10` : "transparent",
                        color: active ? palette.brand.primary : palette.text.tertiary,
                        fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
                      }}
                    >
                      <Icon size={12} strokeWidth={1.5} />
                      {f.label}
                    </Box>
                  );
                })}
              </Stack>

              {/* Results count */}
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                {filtered.length.toLocaleString()} models
                {search || providerFilter || modeFilter || featureFilters.size > 0 ? " (filtered)" : ""}
              </Typography>

              {/* Table */}
              <Box sx={cardSx}>
                {/* Header */}
                <Stack
                  direction="row"
                  sx={{ p: "8px 0", borderBottom: `1px solid ${palette.border.light}` }}
                >
                  <Typography sx={{ flex: 0.8, fontSize: 11, fontWeight: 600, color: palette.text.tertiary }}>PROVIDER</Typography>
                  <Typography sx={{ flex: 2, fontSize: 11, fontWeight: 600, color: palette.text.tertiary }}>MODEL</Typography>
                  <Typography sx={{ flex: 0.6, fontSize: 11, fontWeight: 600, color: palette.text.tertiary }}>MODE</Typography>
                  <Typography sx={{ flex: 0.7, fontSize: 11, fontWeight: 600, color: palette.text.tertiary, textAlign: "right" }}>CONTEXT</Typography>
                  <Typography sx={{ flex: 0.8, fontSize: 11, fontWeight: 600, color: palette.text.tertiary, textAlign: "right" }}>$/1M IN</Typography>
                  <Typography sx={{ flex: 0.8, fontSize: 11, fontWeight: 600, color: palette.text.tertiary, textAlign: "right" }}>$/1M OUT</Typography>
                  <Typography sx={{ flex: 0.6, fontSize: 11, fontWeight: 600, color: palette.text.tertiary, textAlign: "center" }}>FEATURES</Typography>
                  <Box sx={{ width: "60px" }} />
                </Stack>

                {/* Rows */}
                {error ? (
                  <Typography sx={{ p: "16px", fontSize: 13, color: palette.status.error.text }}>{error}</Typography>
                ) : loading ? (
                  <Typography sx={{ p: "16px", fontSize: 13, color: palette.text.tertiary }}>Loading models...</Typography>
                ) : pageModels.length === 0 ? (
                  <Typography sx={{ p: "16px", fontSize: 13, color: palette.text.tertiary }}>No models match your filters.</Typography>
                ) : (
                  <Stack gap="0px">
                    {pageModels.map((m) => (
                      <Stack
                        key={m.model || m.id}
                        direction="row"
                        alignItems="center"
                        sx={{
                          p: "8px 0",
                          borderBottom: `1px solid ${palette.border.light}`,
                          "&:last-child": { borderBottom: "none" },
                          "&:hover": { backgroundColor: palette.background.alt },
                        }}
                      >
                        <Stack direction="row" alignItems="center" gap="6px" sx={{ flex: 0.8 }}>
                          <ProviderIcon provider={m.provider} size={14} />
                          <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>{m.provider}</Typography>
                        </Stack>
                        <Typography sx={{ flex: 2, fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.id}
                        </Typography>
                        <Typography sx={{ flex: 0.6, fontSize: 11, color: palette.text.tertiary }}>{m.mode}</Typography>
                        <Typography sx={{ flex: 0.7, fontSize: 12, textAlign: "right" }}>
                          {formatTokens(m.max_input_tokens)}
                        </Typography>
                        <Typography sx={{ flex: 0.8, fontSize: 12, textAlign: "right", color: m.input_cost_per_million > 0 ? palette.text.primary : palette.text.disabled }}>
                          {formatCost(m.input_cost_per_million)}
                        </Typography>
                        <Typography sx={{ flex: 0.8, fontSize: 12, textAlign: "right", color: m.output_cost_per_million > 0 ? palette.text.primary : palette.text.disabled }}>
                          {formatCost(m.output_cost_per_million)}
                        </Typography>
                        <Box sx={{ flex: 0.6, display: "flex", justifyContent: "center" }}>
                          {featureIcons(m)}
                        </Box>
                        <Box sx={{ width: "60px", display: "flex", justifyContent: "flex-end" }}>
                          <CustomizableButton
                            text="Add"
                            variant="outlined"
                            icon={<CirclePlus size={12} strokeWidth={1.5} />}
                            onClick={() => navigate(`/ai-gateway/endpoints?add=${encodeURIComponent(m.id)}&provider=${encodeURIComponent(m.provider)}`)}
                          />
                        </Box>
                      </Stack>
                    ))}
                  </Stack>
                )}

                {/* Pagination */}
                {pageCount > 1 && (
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ pt: "12px" }}>
                    <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                      Page {page + 1} of {pageCount}
                    </Typography>
                    <Stack direction="row" gap="4px">
                      <IconButton size="small" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
                        <ChevronLeft size={14} />
                      </IconButton>
                      <IconButton size="small" onClick={() => setPage(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1}>
                        <ChevronRight size={14} />
                      </IconButton>
                    </Stack>
                  </Stack>
                )}
              </Box>
            </Stack>
          )}

          {/* ─── Cost Calculator tab ───────────────────────────────── */}
          {activeTab === "calculator" && (
            <Stack gap="16px">
              <Box sx={cardSx}>
                <Stack gap="12px">
                  <Typography sx={sectionTitleSx}>Cost calculator</Typography>
                  <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
                    Estimate monthly costs across models based on your expected usage. Only chat models with known pricing are shown.
                  </Typography>
                  <Stack direction="row" gap="8px" flexWrap="wrap">
                    <Box sx={{ width: "130px" }}>
                      <Field label="Requests/day" value={calcRequests} onChange={(e) => setCalcRequests(e.target.value)} sx={{ minWidth: "unset" }} />
                    </Box>
                    <Box sx={{ width: "140px" }}>
                      <Field label="Avg input tokens" value={calcInputTokens} onChange={(e) => setCalcInputTokens(e.target.value)} sx={{ minWidth: "unset" }} />
                    </Box>
                    <Box sx={{ width: "140px" }}>
                      <Field label="Avg output tokens" value={calcOutputTokens} onChange={(e) => setCalcOutputTokens(e.target.value)} sx={{ minWidth: "unset" }} />
                    </Box>
                    <Box sx={{ width: "160px" }}>
                      <Select
                        id="calc-provider"
                        label="Provider"
                        value={providerFilter}
                        items={providers}
                        onChange={(e) => setProviderFilter(e.target.value as string)}
                        getOptionValue={(i) => i._id}
                        sx={{ minWidth: "unset" }}
                      />
                    </Box>
                  </Stack>
                </Stack>
              </Box>

              {calcResultsVisible.length > 0 && (
                <Box sx={cardSx}>
                  <Stack gap="0px">
                    <Typography sx={{ ...sectionTitleSx, mb: "12px" }}>
                      Estimated costs ({Number(calcRequests).toLocaleString()} req/day)
                    </Typography>
                    {/* Table header */}
                    <Stack direction="row" sx={{ p: "6px 12px", borderBottom: `1px solid ${palette.border.light}` }}>
                      <Typography sx={{ width: "28px", fontSize: 11, fontWeight: 600, color: palette.text.tertiary }}>#</Typography>
                      <Typography sx={{ flex: 2, fontSize: 11, fontWeight: 600, color: palette.text.tertiary }}>MODEL</Typography>
                      <Typography sx={{ flex: 0.6, fontSize: 11, fontWeight: 600, color: palette.text.tertiary, textAlign: "right" }}>CONTEXT</Typography>
                      <Typography sx={{ flex: 0.8, fontSize: 11, fontWeight: 600, color: palette.text.tertiary, textAlign: "right" }}>$/REQ</Typography>
                      <Typography sx={{ flex: 0.8, fontSize: 11, fontWeight: 600, color: palette.text.tertiary, textAlign: "right" }}>INPUT</Typography>
                      <Typography sx={{ flex: 0.8, fontSize: 11, fontWeight: 600, color: palette.text.tertiary, textAlign: "right" }}>OUTPUT</Typography>
                      <Typography sx={{ flex: 0.8, fontSize: 11, fontWeight: 600, color: palette.text.tertiary, textAlign: "right" }}>$/DAY</Typography>
                      <Typography sx={{ flex: 1, fontSize: 11, fontWeight: 600, color: palette.text.tertiary, textAlign: "right" }}>$/MONTH</Typography>
                    </Stack>
                    {calcResultsVisible.map((m, i) => {
                      const inputCostPerReq = (Number(calcInputTokens) * m.input_cost_per_million) / 1_000_000;
                      const outputCostPerReq = (Number(calcOutputTokens) * m.output_cost_per_million) / 1_000_000;
                      const costPerReq = inputCostPerReq + outputCostPerReq;
                      return (
                        <Stack
                          key={m.model || m.id}
                          direction="row"
                          alignItems="center"
                          sx={{
                            p: "8px 12px",
                            borderBottom: `1px solid ${palette.border.light}`,
                            backgroundColor: i === 0 ? "#F0FDF4" : i === 1 ? "#F8FAFC" : i === 2 ? "#FFFBEB" : i < 10 ? `${palette.background.alt}` : "transparent",
                            "&:last-child": { borderBottom: "none" },
                          }}
                        >
                          <Box sx={{ width: "28px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {i === 0 ? <Trophy size={14} strokeWidth={1.5} color="#D4AF37" /> :
                             i === 1 ? <Medal size={14} strokeWidth={1.5} color="#9CA3AF" /> :
                             i === 2 ? <Award size={14} strokeWidth={1.5} color="#CD7F32" /> :
                             <Typography sx={{ fontSize: 12, color: palette.text.disabled, fontWeight: 600 }}>{i + 1}</Typography>}
                          </Box>
                          <Stack direction="row" alignItems="center" gap="6px" sx={{ flex: 2, minWidth: 0, overflow: "hidden" }}>
                            <ProviderIcon provider={m.provider} size={13} />
                            <Typography component="span" sx={{ fontSize: 12, color: palette.text.tertiary, flexShrink: 0 }}>
                              {m.provider}/
                            </Typography>
                            <Typography component="span" sx={{ fontSize: 12, fontWeight: i === 0 ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {m.id.includes("/") ? m.id.split("/").slice(1).join("/") : m.id}
                            </Typography>
                            {i === 0 && (
                              <Typography sx={{ fontSize: 10, color: palette.brand.primary, fontWeight: 600, border: `1px solid ${palette.brand.primary}40`, borderRadius: "4px", px: "4px", py: "1px", whiteSpace: "nowrap", flexShrink: 0 }}>
                                cheapest
                              </Typography>
                            )}
                          </Stack>
                          <Typography sx={{ flex: 0.6, fontSize: 12, textAlign: "right", color: palette.text.tertiary }}>{formatTokens(m.max_input_tokens)}</Typography>
                          <Typography sx={{ flex: 0.8, fontSize: 12, textAlign: "right", fontFamily: "monospace" }}>${costPerReq.toFixed(6)}</Typography>
                          <Typography sx={{ flex: 0.8, fontSize: 12, textAlign: "right", color: palette.text.tertiary, fontFamily: "monospace" }}>${(inputCostPerReq * Number(calcRequests)).toFixed(4)}</Typography>
                          <Typography sx={{ flex: 0.8, fontSize: 12, textAlign: "right", color: palette.text.tertiary, fontFamily: "monospace" }}>${(outputCostPerReq * Number(calcRequests)).toFixed(4)}</Typography>
                          <Typography sx={{ flex: 0.8, fontSize: 12, textAlign: "right", fontFamily: "monospace" }}>${m.dailyCost.toFixed(4)}</Typography>
                          <Typography sx={{ flex: 1, fontSize: 13, textAlign: "right", fontWeight: 600 }}>${m.monthlyCost.toFixed(2)}</Typography>
                        </Stack>
                      );
                    })}
                    {calcResultsTotal > 50 && (
                      <Stack direction="row" justifyContent="center" sx={{ pt: "12px" }}>
                        <CustomizableButton
                          text={calcShowAll ? `Show top 50 of ${calcResultsTotal}` : `Show all ${calcResultsTotal} models`}
                          variant="outlined"
                          onClick={() => setCalcShowAll(!calcShowAll)}
                        />
                      </Stack>
                    )}
                  </Stack>
                </Box>
              )}
            </Stack>
          )}

          {/* ─── Feature Comparison tab ────────────────────────────── */}
          {activeTab === "compare" && (
            <Stack gap="16px">
              <Box sx={cardSx}>
                <Stack gap="12px">
                  <Typography sx={sectionTitleSx}>Feature comparison</Typography>
                  <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
                    Select up to 5 models to compare side by side.
                  </Typography>

                  {/* Popular models quick-select */}
                  <Stack gap="4px">
                    <Typography sx={{ fontSize: 11, color: palette.text.disabled, fontWeight: 600 }}>POPULAR MODELS</Typography>
                    <Stack direction="row" gap="6px" flexWrap="wrap">
                      {["gpt-4o", "gpt-4o-mini", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001", "gemini-2.0-flash", "gemini-2.5-pro-preview-06-05", "mistral-large-latest", "grok-3"].map((id) => {
                        const selected = compareIds.includes(id);
                        return (
                          <Box
                            key={id}
                            onClick={() => toggleCompare(id)}
                            sx={{
                              display: "flex", alignItems: "center", gap: "4px",
                              px: "8px", height: "28px", borderRadius: "4px", cursor: "pointer",
                              border: `1px solid ${selected ? palette.brand.primary : palette.border.dark}`,
                              backgroundColor: selected ? `${palette.brand.primary}10` : "transparent",
                              fontSize: 11, fontWeight: 500, whiteSpace: "nowrap",
                              color: selected ? palette.brand.primary : palette.text.secondary,
                            }}
                          >
                            {id}
                          </Box>
                        );
                      })}
                    </Stack>
                  </Stack>

                  {/* Search */}
                  <Field
                    placeholder="Or search for any model..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{ minWidth: "unset" }}
                  />
                  {search && (
                    <Stack gap="4px" sx={{ maxHeight: "200px", overflowY: "auto" }}>
                      {filtered.slice(0, 20).map((m) => (
                        <Stack
                          key={m.model || m.id}
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          onClick={() => { toggleCompare(m.id); setSearch(""); }}
                          sx={{
                            p: "6px 8px", borderRadius: "4px", cursor: "pointer",
                            "&:hover": { backgroundColor: palette.background.alt },
                            backgroundColor: compareIds.includes(m.id) ? `${palette.brand.primary}08` : "transparent",
                          }}
                        >
                          <Stack direction="row" gap="8px" alignItems="center">
                            <ProviderIcon provider={m.provider} size={14} />
                            <Typography sx={{ fontSize: 12 }}>{m.id}</Typography>
                          </Stack>
                          {compareIds.includes(m.id) && (
                            <Typography sx={{ fontSize: 11, color: palette.brand.primary }}>selected</Typography>
                          )}
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </Box>

              {compareModels.length > 0 && (
                <Box sx={{ ...cardSx, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th scope="col" style={{ textAlign: "left", padding: "8px", borderBottom: `1px solid ${palette.border.light}`, color: palette.text.tertiary, fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const }}>Feature</th>
                        {compareModels.map((m) => (
                          <th scope="col" key={m.model || m.id} style={{ textAlign: "center", padding: "8px", borderBottom: `1px solid ${palette.border.light}`, fontSize: 11, fontWeight: 600, minWidth: "140px", position: "relative", color: palette.text.tertiary, textTransform: "uppercase" as const }}>
                            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                              {m.id}
                              <span
                                onClick={() => toggleCompare(m.id)}
                                style={{ cursor: "pointer", opacity: 0.4, display: "inline-flex" }}
                                title="Remove from comparison"
                              >
                                <Trash2 size={11} strokeWidth={1.5} />
                              </span>
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "Provider", icon: null, fn: (m: ModelInfo) => m.provider },
                        { label: "Mode", icon: null, fn: (m: ModelInfo) => m.mode },
                        { label: "Max input tokens", icon: null, fn: (m: ModelInfo) => formatTokens(m.max_input_tokens) },
                        { label: "Max output tokens", icon: null, fn: (m: ModelInfo) => formatTokens(m.max_output_tokens) },
                        { label: "Input $/1M tokens", icon: null, fn: (m: ModelInfo) => formatCost(m.input_cost_per_million) },
                        { label: "Output $/1M tokens", icon: null, fn: (m: ModelInfo) => formatCost(m.output_cost_per_million) },
                        { label: "Vision", icon: Eye, fn: (m: ModelInfo) => m.supports_vision ? "Yes" : "No" },
                        { label: "Function calling", icon: Wrench, fn: (m: ModelInfo) => m.supports_function_calling ? "Yes" : "No" },
                        { label: "Parallel tools", icon: Wrench, fn: (m: ModelInfo) => m.supports_parallel_function_calling ? "Yes" : "No" },
                        { label: "PDF input", icon: FileText, fn: (m: ModelInfo) => m.supports_pdf_input ? "Yes" : "No" },
                        { label: "Prompt caching", icon: Database, fn: (m: ModelInfo) => m.supports_prompt_caching ? "Yes" : "No" },
                        { label: "Response schema", icon: Layers, fn: (m: ModelInfo) => m.supports_response_schema ? "Yes" : "No" },
                        { label: "System messages", icon: null, fn: (m: ModelInfo) => m.supports_system_messages ? "Yes" : "No" },
                      ].map((row) => (
                        <tr key={row.label}>
                          <td style={{ padding: "8px", borderBottom: `1px solid ${palette.border.light}`, fontSize: 12, color: palette.text.tertiary }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              {row.icon && <row.icon size={13} strokeWidth={1.5} />}
                              {row.label}
                            </span>
                          </td>
                          {(() => {
                            const vals = compareModels.map((m) => row.fn(m));
                            // Determine "best" value for highlighting
                            const numVals = vals.map((v) => {
                              if (v === "Yes") return 1;
                              if (v === "No") return 0;
                              const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
                              return isNaN(n) ? null : n;
                            });
                            // For cost rows (contains $), lower is better; for tokens/features, higher is better
                            const isCostRow = row.label.includes("$/");
                            const validNums = numVals.filter((n) => n !== null && n > 0) as number[];
                            const bestVal = validNums.length > 0
                              ? (isCostRow ? Math.min(...validNums) : Math.max(...validNums))
                              : null;

                            return compareModels.map((m, mi) => {
                              const val = vals[mi];
                              const isYes = val === "Yes";
                              const isNo = val === "No";
                              const numVal = numVals[mi];
                              const isBest = bestVal !== null && numVal === bestVal && validNums.length > 1;

                              return (
                                <td key={m.model || m.id} style={{
                                  textAlign: "center", padding: "8px",
                                  borderBottom: `1px solid ${palette.border.light}`,
                                  fontSize: 12,
                                  color: isYes ? palette.brand.primary : isNo ? palette.text.disabled : palette.text.primary,
                                  backgroundColor: isBest ? "#F0FDF4" : "transparent",
                                  fontWeight: isBest ? 600 : 400,
                                }}>
                                  {isYes ? <Check size={15} strokeWidth={2} color={palette.brand.primary} /> :
                                   isNo ? <X size={15} strokeWidth={1.5} color={palette.text.disabled} /> :
                                   val}
                                </td>
                              );
                            });
                          })()}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              )}

              {compareModels.length === 0 && !search && (
                <Typography sx={{ fontSize: 13, color: palette.text.tertiary, textAlign: "center", py: "32px" }}>
                  Search and select models above to compare features side by side.
                </Typography>
              )}
            </Stack>
          )}
        </Box>
      </TabContext>
    </PageHeaderExtended>
  );
}
