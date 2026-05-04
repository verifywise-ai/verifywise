import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  Paper,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
} from "@mui/material";
import VWChip from "../../components/Chip";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  readDataset,
  getCurrentOrg,
  uploadDataset,
  type DatasetPromptRecord,
} from "../../../application/repository/deepEval.repository";
import {
  isSingleTurnPrompt,
  type SingleTurnPrompt,
} from "../../../application/repository/deepEval.repository";
import Alert from "../../components/Alert";
import {
  ArrowLeft,
  ChevronDown,
  Save as SaveIcon,
  Plus,
  Trash2,
  Download,
  Copy,
  Check,
} from "lucide-react";
import { PageBreadcrumbs } from "../../components/breadcrumbs/PageBreadcrumbs";
import { palette } from "../../themes/palette";

export default function DatasetEditorPage() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const path = params.get("path") || "";
  const [datasetName, setDatasetName] = useState<string>("");
  const [prompts, setPrompts] = useState<DatasetPromptRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [alert, setAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);
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
      if (!path) return;
      try {
        setLoading(true);
        const data = await readDataset(path);
        setPrompts(data.prompts || []);

        // Derive name from path
        const base = path.split("/").pop() || "dataset";
        setDatasetName(
          base
            .replace(/\.json$/i, "")
            .replace(/[_-]+/g, " ")
            .replace(/^\d+\s+/, ""),
        );
      } catch (e) {
        setAlert({
          variant: "error",
          body: e instanceof Error ? e.message : "Failed to load dataset",
        });
        setTimeout(() => setAlert(null), 6000);
      } finally {
        setLoading(false);
      }
    })();
  }, [path]);

  const isValidToSave = useMemo(() => {
    return (
      prompts && prompts.length > 0 && prompts.some((p) => isSingleTurnPrompt(p) && p.prompt.trim())
    );
  }, [prompts]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const json = JSON.stringify(prompts, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const slug = datasetName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      const finalName = slug ? `${slug}.json` : "dataset.json";
      const file = new File([blob], finalName, { type: "application/json" });
      await uploadDataset(file, "chatbot", "single-turn", orgId || undefined);
      setAlert({ variant: "success", body: `Dataset "${datasetName}" saved successfully!` });
      setTimeout(() => {
        setAlert(null);
        navigate(`/evals/${projectId}#datasets`);
      }, 1500);
    } catch (e) {
      type AxiosLike = { response?: { data?: unknown } };
      const axiosErr = e as AxiosLike | Error;
      const resData = (axiosErr as AxiosLike)?.response?.data as
        | Record<string, unknown>
        | undefined;
      const serverMsg =
        (resData && (String(resData.message ?? "") || String(resData.detail ?? ""))) ||
        (axiosErr instanceof Error ? axiosErr.message : null);
      setAlert({ variant: "error", body: serverMsg || "Save failed. Check dataset structure." });
      setTimeout(() => setAlert(null), 6000);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    navigate(`/evals/${projectId}#datasets`);
  };

  const handleDownload = () => {
    const json = JSON.stringify(prompts, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug =
      datasetName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "dataset";
    a.download = `${slug}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = async () => {
    try {
      const json = JSON.stringify(prompts, null, 2);
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setAlert({ variant: "error", body: "Failed to copy to clipboard" });
      setTimeout(() => setAlert(null), 3000);
    }
  };

  const handleAddPrompt = () => {
    const newPrompt: SingleTurnPrompt = {
      id: `prompt_${Date.now()}`,
      category: "General",
      prompt: "",
      expected_output: "",
      expected_keywords: [],
      retrieval_context: [],
    };
    setPrompts((prev) => [...prev, newPrompt]);
  };

  const handleDeletePrompt = (idx: number) => {
    setPrompts((prev) => prev.filter((_, i) => i !== idx));
  };

  if (loading) {
    return (
      <Box
        sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}
      >
        <CircularProgress sx={{ color: palette.brand.primary }} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: "900px", margin: "0 auto", p: 3 }}>
      {alert && <Alert variant={alert.variant} body={alert.body} />}

      <PageBreadcrumbs
        items={[
          { label: "Dashboard", path: "/" },
          { label: "LLM evals", path: "/evals" },
          { label: "Project", path: `/evals/${projectId}` },
          { label: "Datasets", path: `/evals/${projectId}#datasets` },
          {
            label: datasetName || "Editor",
            path: `/evals/${projectId}/datasets/editor?path=${encodeURIComponent(path)}`,
          },
        ]}
      />

      {/* Header with back button and save */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 3, mt: 2 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton size="small" onClick={handleBack} aria-label="Back">
            <ArrowLeft size={18} />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "16px" }}>
            Edit dataset
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            onClick={handleCopyJson}
            startIcon={copied ? <Check size={16} /> : <Copy size={16} />}
            sx={{
              color: copied ? palette.status.success.text : palette.text.secondary,
              borderColor: copied ? palette.status.success.text : palette.border.dark,
              "&:hover": {
                borderColor: palette.text.disabled,
                backgroundColor: palette.background.accent,
              },
            }}
          >
            {copied ? "Copied!" : "Copy JSON"}
          </Button>
          <Button
            variant="outlined"
            onClick={handleDownload}
            startIcon={<Download size={16} />}
            sx={{
              color: palette.text.secondary,
              borderColor: palette.border.dark,
              "&:hover": {
                borderColor: palette.text.disabled,
                backgroundColor: palette.background.accent,
              },
            }}
          >
            Download
          </Button>
          <Button
            variant="contained"
            disabled={!isValidToSave || saving || !datasetName.trim()}
            sx={{
              bgcolor: palette.brand.primary,
              "&:hover": { bgcolor: palette.brand.primaryHover },
            }}
            startIcon={<SaveIcon size={16} />}
            onClick={handleSave}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </Stack>
      </Stack>

      {/* Dataset name input */}
      <Stack spacing={2} sx={{ mb: 3 }}>
        <TextField
          label="Dataset name"
          value={datasetName}
          onChange={(e) => setDatasetName(e.target.value)}
          fullWidth
          size="small"
          placeholder="Enter a descriptive name for this dataset"
        />
        <Typography variant="body2" sx={{ color: palette.text.tertiary, fontSize: "13px" }}>
          Edit the prompts below, then click Save to create your dataset.
        </Typography>
      </Stack>

      {/* Prompts editor */}
      <Stack spacing={1.25}>
        {prompts.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{
              textAlign: "center",
              py: 4,
              px: 2,
              borderStyle: "dashed",
              borderColor: palette.border.dark,
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              No prompts in this dataset yet.
            </Typography>
            <Button
              variant="outlined"
              startIcon={<Plus size={16} />}
              onClick={handleAddPrompt}
              sx={{
                color: palette.brand.primary,
                borderColor: palette.brand.primary,
                "&:hover": {
                  borderColor: palette.brand.primaryHover,
                  backgroundColor: palette.brand.primaryLight,
                },
              }}
            >
              Add your first prompt
            </Button>
          </Paper>
        ) : (
          prompts.map((p, idx) => {
            // This editor only handles single-turn prompts
            const stp = p as SingleTurnPrompt;
            return (
              <Accordion key={stp.id || idx} disableGutters defaultExpanded={!stp.prompt}>
                <AccordionSummary expandIcon={<ChevronDown size={16} />}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1, mr: 1 }}>
                    <Typography
                      sx={{ fontWeight: 700, fontSize: "13px" }}
                    >{`Prompt ${idx + 1}`}</Typography>
                    <VWChip
                      label={stp.category || "uncategorized"}
                      size="small"
                      variant="default"
                      uppercase={false}
                    />
                    {stp.prompt && (
                      <Typography
                        sx={{
                          fontSize: "12px",
                          color: palette.text.disabled,
                          ml: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "300px",
                        }}
                      >
                        {stp.prompt.substring(0, 50)}
                        {stp.prompt.length > 50 ? "..." : ""}
                      </Typography>
                    )}
                  </Stack>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePrompt(idx);
                    }}
                    sx={{
                      color: palette.text.disabled,
                      "&:hover": {
                        color: palette.status.error.text,
                        backgroundColor: palette.status.error.bg,
                      },
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </AccordionSummary>
                <AccordionDetails>
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <Stack spacing={2}>
                      {/* Category */}
                      <Box>
                        <Typography
                          sx={{ fontSize: "12px", color: palette.text.tertiary, mb: 0.5 }}
                        >
                          Category
                        </Typography>
                        <TextField
                          size="small"
                          value={stp.category || ""}
                          onChange={(e) => {
                            const next = [...prompts];
                            next[idx] = { ...next[idx], category: e.target.value };
                            setPrompts(next);
                          }}
                          fullWidth
                          placeholder="e.g., General, Safety, Factual"
                        />
                      </Box>

                      {/* Prompt */}
                      <Box>
                        <Typography
                          sx={{ fontSize: "12px", color: palette.text.tertiary, mb: 0.5 }}
                        >
                          Prompt *
                        </Typography>
                        <TextField
                          size="small"
                          value={stp.prompt}
                          onChange={(e) => {
                            const next = [...prompts];
                            next[idx] = { ...next[idx], prompt: e.target.value };
                            setPrompts(next);
                          }}
                          fullWidth
                          multiline
                          minRows={2}
                          placeholder="Enter the prompt text..."
                        />
                      </Box>

                      {/* Expected output */}
                      <Box>
                        <Typography
                          sx={{ fontSize: "12px", color: palette.text.tertiary, mb: 0.5 }}
                        >
                          Expected output
                        </Typography>
                        <TextField
                          size="small"
                          value={stp.expected_output || ""}
                          onChange={(e) => {
                            const next = [...prompts];
                            next[idx] = { ...next[idx], expected_output: e.target.value };
                            setPrompts(next);
                          }}
                          fullWidth
                          multiline
                          minRows={2}
                          placeholder="Expected model response..."
                        />
                      </Box>

                      {/* Keywords */}
                      <Box>
                        <Typography
                          sx={{ fontSize: "12px", color: palette.text.tertiary, mb: 0.5 }}
                        >
                          Keywords
                        </Typography>
                        <TextField
                          size="small"
                          value={(stp.expected_keywords || []).join(", ")}
                          onChange={(e) => {
                            const value = e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean);
                            const next = [...prompts];
                            next[idx] = { ...next[idx], expected_keywords: value };
                            setPrompts(next);
                          }}
                          fullWidth
                          placeholder="Comma separated keywords"
                        />
                      </Box>

                      {/* Retrieval context */}
                      <Box>
                        <Typography
                          sx={{ fontSize: "12px", color: palette.text.tertiary, mb: 0.5 }}
                        >
                          Retrieval context
                        </Typography>
                        <TextField
                          size="small"
                          value={(stp.retrieval_context || []).join("\n")}
                          onChange={(e) => {
                            const lines = e.target.value
                              .split("\n")
                              .map((s) => s.trim())
                              .filter(Boolean);
                            const next = [...prompts];
                            next[idx] = { ...next[idx], retrieval_context: lines };
                            setPrompts(next);
                          }}
                          fullWidth
                          multiline
                          minRows={2}
                          placeholder="One context entry per line"
                        />
                      </Box>
                    </Stack>
                  </Paper>
                </AccordionDetails>
              </Accordion>
            );
          })
        )}

        {/* Add prompt button */}
        {prompts.length > 0 && (
          <Button
            variant="outlined"
            startIcon={<Plus size={16} />}
            onClick={handleAddPrompt}
            sx={{
              color: palette.brand.primary,
              borderColor: palette.border.dark,
              borderStyle: "dashed",
              py: 1.5,
              "&:hover": {
                borderColor: palette.brand.primary,
                backgroundColor: palette.brand.primaryLight,
                borderStyle: "dashed",
              },
            }}
          >
            Add prompt
          </Button>
        )}
      </Stack>
    </Box>
  );
}
