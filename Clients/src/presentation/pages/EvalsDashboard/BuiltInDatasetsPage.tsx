import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Stack,
  Typography,
  Paper,
  Divider,
  Button,
  CircularProgress,
  IconButton,
  Select,
  MenuItem,
  useTheme,
  Chip,
} from "@mui/material";
import VWChip from "../../components/Chip";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  listDatasets,
  readDataset,
  getCurrentOrg,
  getAllProjects,
  getAllExperiments,
  uploadDataset,
  type DatasetPromptRecord,
} from "../../../application/repository/deepEval.repository";
import {
  isSingleTurnPrompt,
  type SingleTurnPrompt,
} from "../../../application/repository/deepEval.repository";
import Alert from "../../components/Alert";
import { ArrowLeft, X, Settings, ChevronDown, Upload } from "lucide-react";
import { PageBreadcrumbs } from "../../components/breadcrumbs/PageBreadcrumbs";
import TabBar from "../../components/TabBar";
import { TabContext } from "@mui/lab";
import { getSelectStyles } from "../../utils/inputStyles";
import { palette } from "../../themes/palette";

type ListedDataset = {
  key: string;
  name: string;
  path: string;
  use_case: "chatbot" | "rag" | "agent";
  // Optional metadata for richer cards (if provided by backend)
  test_count?: number;
  categories?: string[];
  category_count?: number;
  difficulty?: { easy: number; medium: number; hard: number };
  description?: string;
  tags?: string[];
};

// DeepEval Benchmarks - standard LLM evaluation benchmarks
const DEEPEVAL_BENCHMARKS = [
  {
    id: "mmlu",
    name: "MMLU",
    fullName: "Massive Multitask Language Understanding",
    description:
      "Evaluates LLMs across 57 subjects including STEM, humanities, social sciences. Tests knowledge breadth and reasoning.",
    tasks: ["High School CS", "Astronomy", "College Math", "Medical Genetics", "Philosophy", "Law"],
    metrics: ["Accuracy"],
    difficulty: "Hard",
    sampleCount: 14042,
  },
  {
    id: "hellaswag",
    name: "HellaSwag",
    fullName: "Harder Endings, Longer Contexts, and Low-shot Activities",
    description:
      "Tests common-sense reasoning by predicting the most plausible continuation of a scenario.",
    tasks: ["Common Sense", "Sentence Completion"],
    metrics: ["Accuracy"],
    difficulty: "Medium",
    sampleCount: 10042,
  },
  {
    id: "big_bench_hard",
    name: "Big-Bench Hard",
    fullName: "Big-Bench Hard",
    description:
      "23 challenging tasks that require multi-step reasoning. Focuses on areas where models struggle.",
    tasks: ["Logical Deduction", "Causal Judgment", "Disambiguation QA", "Date Understanding"],
    metrics: ["Accuracy"],
    difficulty: "Very Hard",
    sampleCount: 6511,
  },
  {
    id: "truthfulqa",
    name: "TruthfulQA",
    fullName: "TruthfulQA",
    description:
      "Measures whether a language model is truthful in generating answers to questions.",
    tasks: ["Truthfulness", "Informativeness"],
    metrics: ["Truthful Score", "Informative Score"],
    difficulty: "Hard",
    sampleCount: 817,
  },
  {
    id: "drop",
    name: "DROP",
    fullName: "Discrete Reasoning Over Paragraphs",
    description:
      "Tests reading comprehension with numerical reasoning, sorting, counting operations.",
    tasks: ["Reading Comprehension", "Numerical Reasoning"],
    metrics: ["F1 Score", "Exact Match"],
    difficulty: "Hard",
    sampleCount: 9536,
  },
  {
    id: "humaneval",
    name: "HumanEval",
    fullName: "HumanEval Code Generation",
    description:
      "Evaluates code generation capabilities with Python programming problems and unit tests.",
    tasks: ["Code Generation", "Problem Solving"],
    metrics: ["Pass@k"],
    difficulty: "Medium",
    sampleCount: 164,
  },
  {
    id: "gsm8k",
    name: "GSM8K",
    fullName: "Grade School Math 8K",
    description:
      "Tests mathematical reasoning with grade school math word problems requiring multi-step arithmetic.",
    tasks: ["Math Word Problems", "Arithmetic Reasoning", "Multi-step Calculation"],
    metrics: ["Accuracy", "Exact Match"],
    difficulty: "Medium",
    sampleCount: 8500,
  },
  {
    id: "arc",
    name: "ARC",
    fullName: "AI2 Reasoning Challenge",
    description:
      "Science exam questions requiring reasoning. Includes Easy and Challenge sets with varying difficulty.",
    tasks: ["Science QA", "Reasoning", "Knowledge Application"],
    metrics: ["Accuracy"],
    difficulty: "Hard",
    sampleCount: 7787,
  },
  {
    id: "winogrande",
    name: "WinoGrande",
    fullName: "WinoGrande Commonsense Reasoning",
    description:
      "Large-scale dataset for commonsense reasoning, testing pronoun resolution in context.",
    tasks: ["Coreference Resolution", "Commonsense Reasoning"],
    metrics: ["Accuracy"],
    difficulty: "Medium",
    sampleCount: 44000,
  },
];

type BuiltInEmbedProps = {
  embed?: boolean;
  onOpenEditor?: (path: string, name: string) => void;
  onBack?: () => void;
};
export default function BuiltInDatasetsPage(_props: BuiltInEmbedProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const theme = useTheme();
  const embed = Boolean(_props?.embed);
  const openEditor = (path: string, name: string) => {
    if (_props?.embed && _props.onOpenEditor) {
      _props.onOpenEditor(path, name);
    } else {
      navigate(`/evals/${projectId}/datasets/editor?path=${encodeURIComponent(path)}`);
    }
  };
  const viewerTopRef = useRef<HTMLDivElement | null>(null);
  void _props;
  const [groups, setGroups] = useState<Record<"chatbot" | "rag" | "agent", ListedDataset[]>>({
    chatbot: [],
    rag: [],
    agent: [],
  });
  const [selected, setSelected] = useState<ListedDataset | null>(null);
  // keep local parsed prompts only; raw JSON preview not needed in this UI
  const [previewPrompts, setPreviewPrompts] = useState<DatasetPromptRecord[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [alert, setAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);
  const [experimentsCount, setExperimentsCount] = useState<number>(0);
  const [datasetsCount, setDatasetsCount] = useState<number>(0);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSection, setActiveSection] = useState<"datasets" | "benchmarks">("datasets");
  const [orgId, setOrgId] = useState<string | null>(null);

  // Fetch current org on mount
  useEffect(() => {
    (async () => {
      try {
        const { org } = await getCurrentOrg();
        if (org) setOrgId(org.id);
      } catch {
        // Ignore - org might not be set
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // load projects for header dropdown
        try {
          const data = await getAllProjects();
          setAllProjects(data.projects || []);
        } catch {
          setAllProjects([]);
        }

        // counts for TabBar, matching EvalsDashboard
        if (projectId) {
          try {
            const ex = await getAllExperiments({ project_id: projectId });
            setExperimentsCount(ex.experiments?.length || 0);
          } catch {
            setExperimentsCount(0);
          }
        }

        const res = await listDatasets();
        setGroups(res);
        try {
          const totalCount = Object.values(res).reduce((sum, arr) => sum + (arr?.length || 0), 0);
          setDatasetsCount(totalCount);
        } catch {
          setDatasetsCount(0);
        }
        if (!embed) {
          const path = params.get("path");
          if (path) {
            const match = Object.values(res)
              .flat()
              .find((d) => d.path === path);
            if (match) {
              setSelected(match);
            }
          }
        }
      } catch (e) {
        setAlert({
          variant: "error",
          body: e instanceof Error ? e.message : "Failed to load datasets",
        });
        setTimeout(() => setAlert(null), 6000);
      }
    })();
  }, [params, projectId, embed]);

  useEffect(() => {
    const path = selected?.path || "";
    if (!path) return;
    (async () => {
      try {
        setLoadingPreview(true);
        const data = await readDataset(path);
        setPreviewPrompts(data.prompts || []);
        if (!embed) {
          setParams(
            (p) => {
              const np = new URLSearchParams(p);
              np.set("path", path);
              return np;
            },
            { replace: true },
          );
        }
      } catch (e) {
        setAlert({
          variant: "error",
          body: e instanceof Error ? e.message : "Failed to load dataset",
        });
        setTimeout(() => setAlert(null), 6000);
      } finally {
        setLoadingPreview(false);
      }
    })();
  }, [selected, setParams, embed]);

  const descriptions: Record<string, string> = useMemo(
    () => ({
      chatbot: "Chatbot prompts for single‑turn or conversational evaluation of assistant replies.",
      rag: "RAG tasks with retrieval_context, suitable for faithfulness/contextual metrics.",
      agent: "Agentic tasks that involve tools and multi‑step plans.",
    }),
    [],
  );

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const resp = await uploadDataset(file, "chatbot", "single-turn", orgId || undefined);
      setAlert({ variant: "success", body: `Uploaded ${resp.filename}` });
      setTimeout(() => setAlert(null), 4000);
      // Reload groups so any new datasets that are exposed via list() appear
      const res = await listDatasets();
      setGroups(res);
    } catch (err) {
      console.error("Upload failed", err);
      setAlert({
        variant: "error",
        body: err instanceof Error ? err.message : "Upload failed",
      });
      setTimeout(() => setAlert(null), 6000);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {alert && <Alert variant={alert.variant} body={alert.body} />}
      {!embed && (
        <>
          <PageBreadcrumbs
            items={[
              { label: "Dashboard", path: "/" },
              { label: "LLM evals", path: "/evals" },
              { label: "Project", path: `/evals/${projectId}` },
              { label: "Built‑in datasets", path: `/evals/${projectId}/datasets/built-in` },
            ]}
          />
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 2, mt: -2 }}
          />
        </>
      )}
      {/* Project selector + settings (match project pages) - ABOVE tabs */}
      {!embed && (
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 2,
            mb: 2,
          }}
        >
          <Stack gap={theme.spacing(2)} className="select-wrapper" sx={{ mb: 0 }}>
            <Typography
              component="p"
              variant="body1"
              color={theme.palette.text.secondary}
              fontWeight={500}
              fontSize="13px"
              sx={{ margin: 0, height: "22px", display: "flex", alignItems: "center" }}
            >
              Project
            </Typography>
            <Select
              className="select-component"
              value={projectId || ""}
              onChange={(e) => {
                const newId = String(e.target.value);
                navigate(`/evals/${newId}#datasets`);
              }}
              displayEmpty
              IconComponent={() => (
                <ChevronDown
                  size={16}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                    color: theme.palette.text.tertiary,
                  }}
                />
              )}
              MenuProps={{
                disableScrollLock: true,
                PaperProps: {
                  sx: {
                    borderRadius: theme.shape.borderRadius,
                    boxShadow: theme.boxShadow,
                    mt: 1,
                    "& .MuiMenuItem-root": {
                      fontSize: 13,
                      color: theme.palette.text.primary,
                      "&:hover": { backgroundColor: theme.palette.background.accent },
                      "&.Mui-selected": {
                        backgroundColor: theme.palette.background.accent,
                        "&:hover": { backgroundColor: theme.palette.background.accent },
                      },
                      "& .MuiTouchRipple-root": { display: "none" },
                    },
                  },
                },
              }}
              sx={{
                fontSize: 13,
                minWidth: "160px",
                maxWidth: "260px",
                backgroundColor: theme.palette.background.main,
                position: "relative",
                cursor: "pointer",
                "& .MuiSelect-select": {
                  padding: "0 32px 0 10px !important",
                  height: "34px",
                  display: "flex",
                  alignItems: "center",
                  lineHeight: 2,
                },
                ...getSelectStyles(theme),
              }}
            >
              {allProjects.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </Stack>
          <IconButton
            aria-label="Settings"
            onClick={() => navigate(`/evals/${projectId}/configuration`)}
          >
            <Settings size={18} />
          </IconButton>
        </Box>
      )}

      {!embed && (
        <TabContext value="datasets">
          <TabBar
            activeTab="datasets"
            onChange={(_, v: string) => {
              if (!projectId) return;
              navigate(`/evals/${projectId}#${v}`);
            }}
            tabs={[
              {
                value: "overview",
                label: "Overview",
                icon: "LayoutDashboard",
                tooltip: "Project summary and key metrics",
              },
              {
                value: "experiments",
                label: "Experiments",
                icon: "FlaskConical",
                count: experimentsCount,
                tooltip: "Run and compare model evaluations",
              },
              {
                value: "datasets",
                label: "Datasets",
                icon: "Database",
                count: datasetsCount,
                tooltip: "Test datasets for evaluating models",
              },
              {
                value: "scorers",
                label: "Scorers",
                icon: "Award",
                tooltip: "Metrics used to score model outputs",
              },
              {
                value: "configuration",
                label: "Configuration",
                icon: "Settings",
                tooltip: "Project settings and LLM API keys",
              },
            ]}
            tabListSx={{ mb: 2 }}
          />
        </TabContext>
      )}
      {!embed && <Divider sx={{ mb: 2 }} />}

      {/* Section toggle: Datasets vs Benchmarks */}
      {!embed && (
        <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
          <Chip
            label="Datasets"
            onClick={() => setActiveSection("datasets")}
            sx={{
              cursor: "pointer",
              backgroundColor:
                activeSection === "datasets" ? palette.brand.primary : palette.background.hover,
              color:
                activeSection === "datasets" ? palette.background.main : palette.text.secondary,
              fontWeight: 500,
              fontSize: "13px",
              "&:hover": {
                backgroundColor:
                  activeSection === "datasets" ? palette.brand.primaryHover : palette.border.dark,
              },
            }}
          />
          <Chip
            label="Benchmarks"
            onClick={() => setActiveSection("benchmarks")}
            sx={{
              cursor: "pointer",
              backgroundColor:
                activeSection === "benchmarks" ? palette.brand.primary : palette.background.hover,
              color:
                activeSection === "benchmarks" ? palette.background.main : palette.text.secondary,
              fontWeight: 500,
              fontSize: "13px",
              "&:hover": {
                backgroundColor:
                  activeSection === "benchmarks" ? palette.brand.primaryHover : palette.border.dark,
              },
            }}
          />
        </Stack>
      )}

      {/* Title with back button when embedded */}
      {embed ? (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <IconButton
            size="small"
            onClick={() => (_props.onBack ? _props.onBack() : window.history.back())}
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "16px" }}>
            Built‑in datasets
          </Typography>
        </Stack>
      ) : (
        <>
          {/* Hidden file input for uploads */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={handleFileChange}
          />

          <Box sx={{ mb: 3 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Typography variant="h6" sx={{ fontWeight: 600, fontSize: "16px" }}>
                Datasets
              </Typography>
              <Button
                variant="outlined"
                size="small"
                disabled={uploading}
                onClick={handleUploadClick}
                sx={{ textTransform: "none" }}
                startIcon={<Upload size={14} />}
              >
                {uploading ? "Uploading..." : "Upload JSON"}
              </Button>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "13px" }}>
              Use pre-built datasets for chatbot, RAG, and agent evaluations, or upload your own
              custom datasets in JSON format.
            </Typography>
          </Box>
        </>
      )}

      {/* Benchmarks Section */}
      {activeSection === "benchmarks" && !embed && (
        <Box>
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: "16px", mb: 1 }}>
              Standard Benchmarks
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "13px" }}>
              Industry-standard benchmarks powered by DeepEval for comprehensive LLM evaluation.
            </Typography>
          </Box>

          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", gap: 2 }}>
            {DEEPEVAL_BENCHMARKS.map((benchmark) => (
              <Paper
                key={benchmark.id}
                variant="outlined"
                sx={{
                  p: 2.5,
                  width: 380,
                  borderRadius: 2,
                  borderColor: palette.border.dark,
                  boxShadow: "none",
                  backgroundColor: palette.background.main,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.5,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  "&:hover": {
                    borderColor: palette.brand.primary,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  },
                }}
                onClick={() => navigate(`/evals/${projectId}?benchmark=${benchmark.id}`)}
              >
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                  <Box>
                    <Typography
                      sx={{ fontWeight: 700, fontSize: "16px", color: palette.text.primary }}
                    >
                      {benchmark.name}
                    </Typography>
                    <Typography
                      sx={{ fontSize: "11px", color: palette.text.tertiary, fontStyle: "italic" }}
                    >
                      {benchmark.fullName}
                    </Typography>
                  </Box>
                  <Chip
                    label={benchmark.difficulty}
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: "10px",
                      fontWeight: 600,
                      backgroundColor:
                        benchmark.difficulty === "Medium"
                          ? palette.status.warning.bg
                          : benchmark.difficulty === "Hard"
                            ? palette.status.error.bg
                            : benchmark.difficulty === "Very Hard"
                              ? palette.accent.purple.bg
                              : palette.border.dark,
                      color:
                        benchmark.difficulty === "Medium"
                          ? palette.status.warning.text
                          : benchmark.difficulty === "Hard"
                            ? palette.status.error.text
                            : benchmark.difficulty === "Very Hard"
                              ? palette.accent.purple.text
                              : palette.text.secondary,
                      borderRadius: "4px",
                    }}
                  />
                </Stack>

                <Typography
                  variant="body2"
                  sx={{ fontSize: "12px", color: palette.text.secondary, lineHeight: 1.6 }}
                >
                  {benchmark.description}
                </Typography>

                <Box>
                  <Typography
                    variant="body2"
                    sx={{ fontSize: "11px", color: palette.text.secondary }}
                  >
                    <strong>{benchmark.sampleCount.toLocaleString()}</strong> samples
                  </Typography>
                </Box>

                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "10px",
                      textTransform: "uppercase",
                      fontWeight: 600,
                      color: palette.text.tertiary,
                      letterSpacing: "0.5px",
                    }}
                  >
                    Tasks
                  </Typography>
                  <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", mt: 0.5, gap: 0.5 }}>
                    {benchmark.tasks.slice(0, 3).map((task) => (
                      <Chip
                        key={task}
                        size="small"
                        label={task}
                        sx={{
                          height: 20,
                          fontSize: "10px",
                          borderRadius: "999px",
                          backgroundColor: palette.accent.blue.bg,
                          color: palette.accent.blue.text,
                        }}
                      />
                    ))}
                    {benchmark.tasks.length > 3 && (
                      <Typography
                        variant="caption"
                        sx={{ fontSize: "10px", color: palette.text.tertiary }}
                      >
                        +{benchmark.tasks.length - 3} more
                      </Typography>
                    )}
                  </Stack>
                </Box>

                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "10px",
                      textTransform: "uppercase",
                      fontWeight: 600,
                      color: palette.text.tertiary,
                      letterSpacing: "0.5px",
                    }}
                  >
                    Metrics
                  </Typography>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                    {benchmark.metrics.map((metric) => (
                      <Chip
                        key={metric}
                        size="small"
                        label={metric}
                        sx={{
                          height: 20,
                          fontSize: "10px",
                          borderRadius: "999px",
                          backgroundColor: palette.status.success.bg,
                          color: palette.status.success.text,
                        }}
                      />
                    ))}
                  </Stack>
                </Box>

                <Button
                  size="small"
                  variant="contained"
                  sx={{
                    mt: 1,
                    textTransform: "none",
                    bgcolor: palette.brand.primary,
                    "&:hover": { bgcolor: palette.brand.primaryHover },
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/evals/${projectId}?benchmark=${benchmark.id}#experiments`);
                  }}
                >
                  Run benchmark
                </Button>
              </Paper>
            ))}
          </Stack>
        </Box>
      )}

      {/* Datasets Section */}
      {activeSection === "datasets" && (
        <Stack direction="row" spacing={2}>
          {selected && (
            <Box sx={{ width: 360 }}>
              {(["chatbot", "rag", "agent"] as const).map((uc) => (
                <Box key={uc} sx={{ mb: 2 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 700, textTransform: "capitalize", fontSize: "13px", mb: 0.5 }}
                  >
                    {uc}{" "}
                    <VWChip
                      label={String((groups[uc] || []).length)}
                      size="small"
                      variant="default"
                      uppercase={false}
                    />
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: palette.text.tertiary, fontSize: "12px", mb: 1 }}
                  >
                    {descriptions[uc]}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                    {(groups[uc] || []).map((ds) => (
                      <Button
                        key={ds.key}
                        variant={selected?.key === ds.key ? "contained" : "outlined"}
                        onClick={() => setSelected(ds)}
                        sx={{
                          justifyContent: "flex-start",
                          textTransform: "none",
                          borderRadius: "8px",
                          px: 1.25,
                          py: 0.75,
                          minHeight: 32,
                          fontSize: "12px",
                        }}
                        fullWidth
                      >
                        {ds.name}
                      </Button>
                    ))}
                  </Stack>
                </Box>
              ))}
            </Box>
          )}
          {selected ? (
            <Box sx={{ flex: 1 }}>
              {loadingPreview ? (
                <Paper variant="outlined" sx={{ p: 2, height: "70vh", overflow: "auto" }}>
                  <Stack alignItems="center" justifyContent="center" sx={{ height: "100%" }}>
                    <CircularProgress size={24} />
                  </Stack>
                </Paper>
              ) : previewPrompts && previewPrompts.length > 0 ? (
                <Paper variant="outlined" sx={{ p: 2, height: "70vh", overflow: "auto" }}>
                  <Box ref={viewerTopRef} />
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ mb: 1 }}
                  >
                    <Typography sx={{ fontWeight: 700, fontSize: "13px" }}>
                      {selected.name}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <IconButton
                        size="small"
                        onClick={() => setSelected(null)}
                        title="Close viewer"
                        aria-label="Close viewer"
                      >
                        <X size={16} />
                      </IconButton>
                      <Button
                        size="small"
                        variant="contained"
                        sx={{
                          bgcolor: palette.brand.primary,
                          "&:hover": { bgcolor: palette.brand.primaryHover },
                        }}
                        onClick={() => openEditor(selected.path, selected.name)}
                      >
                        Open in editor
                      </Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={1.25}>
                    {previewPrompts.map((p, idx) => {
                      if (isSingleTurnPrompt(p)) {
                        const stp = p as SingleTurnPrompt;
                        return (
                          <Paper key={stp.id} variant="outlined" sx={{ p: 1.25 }}>
                            <Stack
                              direction="row"
                              alignItems="center"
                              justifyContent="space-between"
                              sx={{ mb: 0.5 }}
                            >
                              <Typography
                                sx={{ fontWeight: 700, fontSize: "12px" }}
                              >{`Prompt ${idx + 1}`}</Typography>
                              <Chip
                                label={stp.category}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: "10px",
                                  bgcolor: stp.category?.toLowerCase().includes("coding")
                                    ? palette.brand.primaryLight
                                    : stp.category?.toLowerCase().includes("math")
                                      ? palette.accent.blue.bg
                                      : stp.category?.toLowerCase().includes("reason")
                                        ? palette.accent.orange.bg
                                        : palette.background.hover,
                                }}
                              />
                            </Stack>
                            <Typography
                              sx={{
                                fontSize: "12px",
                                color: palette.text.primary,
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {stp.prompt}
                            </Typography>
                            {stp.expected_output && (
                              <Typography
                                sx={{ mt: 0.75, fontSize: "12px", color: palette.text.secondary }}
                              >
                                <b>Expected:</b> {stp.expected_output}
                              </Typography>
                            )}
                            {Array.isArray(stp.expected_keywords) &&
                              stp.expected_keywords.length > 0 && (
                                <Typography
                                  sx={{ mt: 0.5, fontSize: "12px", color: palette.text.secondary }}
                                >
                                  <b>Keywords:</b> {stp.expected_keywords.join(", ")}
                                </Typography>
                              )}
                            {Array.isArray(stp.retrieval_context) &&
                              stp.retrieval_context.length > 0 && (
                                <Typography
                                  sx={{
                                    mt: 0.5,
                                    fontSize: "12px",
                                    color: palette.text.secondary,
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  <b>Context:</b> {stp.retrieval_context.join("\n")}
                                </Typography>
                              )}
                          </Paper>
                        );
                      } else {
                        // Multi-turn conversation
                        const conv = p;
                        return (
                          <Paper key={conv.id || idx} variant="outlined" sx={{ p: 1.25 }}>
                            <Stack
                              direction="row"
                              alignItems="center"
                              justifyContent="space-between"
                              sx={{ mb: 0.5 }}
                            >
                              <Typography
                                sx={{ fontWeight: 700, fontSize: "12px" }}
                              >{`Conversation ${idx + 1}`}</Typography>
                              <Chip
                                label={`${conv.turns?.length || 0} turns`}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: "10px",
                                  bgcolor: palette.accent.blue.bg,
                                }}
                              />
                            </Stack>
                            {conv.scenario && (
                              <Typography
                                sx={{
                                  fontSize: "12px",
                                  color: palette.text.primary,
                                  whiteSpace: "pre-wrap",
                                  mb: 0.5,
                                }}
                              >
                                <b>Scenario:</b> {conv.scenario}
                              </Typography>
                            )}
                            {conv.expected_outcome && (
                              <Typography sx={{ fontSize: "12px", color: palette.text.secondary }}>
                                <b>Expected outcome:</b> {conv.expected_outcome}
                              </Typography>
                            )}
                          </Paper>
                        );
                      }
                    })}
                  </Stack>
                </Paper>
              ) : (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="body2" sx={{ color: palette.text.tertiary }}>
                    No prompts found for this dataset.
                  </Typography>
                </Paper>
              )}
            </Box>
          ) : (
            <Box sx={{ flex: 1 }}>
              <Box>
                {(["chatbot", "rag", "agent"] as const).map((uc) => (
                  <Box key={uc} sx={{ mb: 2 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 700, fontSize: "13px", textTransform: "capitalize", mb: 1 }}
                    >
                      {uc}
                    </Typography>
                    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
                      {(groups[uc] || []).map((ds) => {
                        const difficultyText = (() => {
                          if (!ds.difficulty) return "";
                          const { easy, medium, hard } = ds.difficulty;
                          const parts: string[] = [];
                          if (easy) parts.push(`${easy} easy`);
                          if (medium) parts.push(`${medium} medium`);
                          if (hard) parts.push(`${hard} hard`);
                          return parts.join(", ");
                        })();

                        return (
                          <Paper
                            key={ds.key}
                            variant="outlined"
                            sx={{
                              p: 2,
                              width: 380,
                              borderRadius: 2,
                              borderColor: palette.border.dark,
                              boxShadow: "none",
                              backgroundColor: palette.background.main,
                              display: "flex",
                              flexDirection: "column",
                              gap: 1,
                            }}
                          >
                            <Typography sx={{ fontWeight: 600, fontSize: "14px", mb: 0.5 }}>
                              {ds.name}
                            </Typography>

                            {ds.description && (
                              <Typography
                                variant="body2"
                                sx={{
                                  fontSize: "12px",
                                  color: palette.text.secondary,
                                  lineHeight: 1.6,
                                }}
                              >
                                {ds.description}
                              </Typography>
                            )}

                            {(ds.test_count !== undefined ||
                              ds.category_count !== undefined ||
                              difficultyText) && (
                              <Typography
                                variant="body2"
                                sx={{ fontSize: "11px", color: palette.text.secondary }}
                              >
                                {ds.test_count !== undefined && (
                                  <strong>
                                    {ds.test_count} test{ds.test_count !== 1 ? "s" : ""}
                                  </strong>
                                )}
                                {ds.category_count !== undefined && ds.category_count > 0 && (
                                  <>
                                    {" "}
                                    – {ds.category_count}{" "}
                                    {ds.category_count === 1 ? "category" : "categories"}
                                  </>
                                )}
                                {difficultyText && <> – {difficultyText}</>}
                              </Typography>
                            )}

                            {ds.categories && ds.categories.length > 0 && (
                              <Box sx={{ mt: 0.5 }}>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontSize: "10px",
                                    textTransform: "uppercase",
                                    fontWeight: 600,
                                    color: palette.text.tertiary,
                                    letterSpacing: "0.5px",
                                  }}
                                >
                                  Topics
                                </Typography>
                                <Stack
                                  direction="row"
                                  spacing={0.5}
                                  sx={{ flexWrap: "wrap", mt: 0.5 }}
                                >
                                  {ds.categories.slice(0, 4).map((c) => (
                                    <Chip
                                      key={c}
                                      size="small"
                                      label={c}
                                      sx={{
                                        height: 20,
                                        fontSize: "10px",
                                        borderRadius: "999px",
                                        backgroundColor: palette.background.hover,
                                        color: palette.text.secondary,
                                      }}
                                    />
                                  ))}
                                  {ds.categories.length > 4 && (
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        fontSize: "10px",
                                        color: palette.text.tertiary,
                                        ml: 0.5,
                                      }}
                                    >
                                      +{ds.categories.length - 4} more
                                    </Typography>
                                  )}
                                </Stack>
                              </Box>
                            )}

                            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                              <Button
                                size="small"
                                variant="contained"
                                sx={{
                                  textTransform: "none",
                                  bgcolor: palette.brand.primary,
                                  "&:hover": { bgcolor: palette.brand.primaryHover },
                                }}
                                onClick={() => {
                                  setSelected(ds);
                                  setTimeout(() => {
                                    viewerTopRef.current?.scrollIntoView({
                                      behavior: "smooth",
                                      block: "start",
                                    });
                                  }, 0);
                                }}
                              >
                                View prompts
                              </Button>
                              <Button
                                size="small"
                                variant="contained"
                                sx={{
                                  textTransform: "none",
                                  bgcolor: palette.brand.primary,
                                  "&:hover": { bgcolor: palette.brand.primaryHover },
                                }}
                                onClick={() => openEditor(ds.path, ds.name)}
                              >
                                Open in editor
                              </Button>
                            </Stack>
                          </Paper>
                        );
                      })}
                    </Stack>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Stack>
      )}
    </Box>
  );
}
