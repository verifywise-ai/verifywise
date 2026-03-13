import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Tab,
  Tabs,
  Typography,
  useTheme,
} from "@mui/material";
import { Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLLMKeyStatus } from "../../../application/hooks/useLLMKeyStatus";
import { getLLMKeys } from "../../../application/repository/llmKeys.repository";
import { LLMKeysModel } from "../../../domain/models/Common/llmKeys/llmKeys.model";
import {
  useGenerateTaxonomy,
  useGenerateMitigations,
  useGenerateAssessment,
  useSubmitGenerationFeedback,
} from "../../../application/hooks/useRiskLibrary";
import {
  GeneratedRisk,
  GeneratedMitigation,
  GeneratedAssessment,
} from "../../../domain/types/RiskLibrary";
import GenerateTaxonomyForm from "./GenerateTaxonomyForm";
import GenerateMitigationsForm from "./GenerateMitigationsForm";
import GenerateAssessmentForm from "./GenerateAssessmentForm";
import {
  TaxonomyResult,
  MitigationsResult,
  AssessmentResult,
} from "./GenerationResult";

type GenerationType = "taxonomy" | "mitigations" | "assessment";

type ResultState =
  | { type: "taxonomy"; risks: GeneratedRisk[]; generationId?: number }
  | { type: "mitigations"; mitigations: GeneratedMitigation[]; generationId?: number }
  | { type: "assessment"; assessment: GeneratedAssessment; generationId?: number }
  | null;

const GeneratePanel = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { data: keyStatus, loading: keyStatusLoading } = useLLMKeyStatus();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState<GenerationType>("taxonomy");
  const [llmKeys, setLlmKeys] = useState<LLMKeysModel[]>([]);
  const [result, setResult] = useState<ResultState>(null);

  const generateTaxonomy = useGenerateTaxonomy();
  const generateMitigations = useGenerateMitigations();
  const generateAssessment = useGenerateAssessment();
  const genFeedback = useSubmitGenerationFeedback();

  // Fetch LLM keys when dialog opens
  useEffect(() => {
    if (dialogOpen) {
      getLLMKeys().then((res) => {
        const keys = (res.data as any)?.data || (res.data as any) || [];
        setLlmKeys(Array.isArray(keys) ? keys : []);
      }).catch(() => setLlmKeys([]));
    }
  }, [dialogOpen]);

  const handleOpen = () => {
    if (!keyStatus?.hasKeys) return;
    setDialogOpen(true);
    setResult(null);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setResult(null);
  };

  const handleTabChange = (_: unknown, value: GenerationType) => {
    setTab(value);
    setResult(null);
  };

  const handleTaxonomySubmit = (params: Parameters<typeof generateTaxonomy.mutate>[0]) => {
    generateTaxonomy.mutate(params, {
      onSuccess: (data) => {
        const res = (data as any)?.data || data;
        setResult({
          type: "taxonomy",
          risks: res.risks || [],
          generationId: res.generation_id,
        });
      },
    });
  };

  const handleMitigationsSubmit = (params: Parameters<typeof generateMitigations.mutate>[0]) => {
    generateMitigations.mutate(params, {
      onSuccess: (data) => {
        const res = (data as any)?.data || data;
        setResult({
          type: "mitigations",
          mitigations: res.mitigations || [],
          generationId: res.generation_id,
        });
      },
    });
  };

  const handleAssessmentSubmit = (params: Parameters<typeof generateAssessment.mutate>[0]) => {
    generateAssessment.mutate(params, {
      onSuccess: (data) => {
        const res = (data as any)?.data || data;
        setResult({
          type: "assessment",
          assessment: res.assessment || res,
          generationId: res.generation_id,
        });
      },
    });
  };

  const handleGenerationFeedback = (params: {
    id: number;
    feedback_type: "upvote" | "downvote" | "flag";
  }) => {
    genFeedback.mutate(params);
  };

  const isLoading =
    generateTaxonomy.isPending ||
    generateMitigations.isPending ||
    generateAssessment.isPending;

  const error =
    generateTaxonomy.error ||
    generateMitigations.error ||
    generateAssessment.error;

  // No keys configured — show setup prompt
  if (!keyStatusLoading && !keyStatus?.hasKeys) {
    return (
      <Box
        sx={{
          display: "flex",
          p: 1.5,
          borderRadius: 1,
          backgroundColor: theme.palette.background.paper,
          border: `1px solid ${theme.palette.primary.main}`,
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="body2" fontWeight={600}>
            Unlock AI-powered risk generation
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Configure an LLM key to generate risk taxonomies, mitigations, and assessments.
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          onClick={() => navigate("/settings/apikeys")}
          sx={{ textTransform: "none", whiteSpace: "nowrap", ml: 2 }}
        >
          Configure LLM Key
        </Button>
      </Box>
    );
  }

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<Sparkles size={16} />}
        onClick={handleOpen}
        disabled={keyStatusLoading}
        sx={{ textTransform: "none" }}
      >
        AI Generate
      </Button>

      <Dialog
        open={dialogOpen}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { maxHeight: "85vh" } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Sparkles size={20} />
            <Typography variant="h6" fontWeight={700}>
              AI Risk Generation
            </Typography>
          </Box>
          <IconButton onClick={handleClose} size="small">
            <X size={18} />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Tabs
            value={tab}
            onChange={handleTabChange}
            sx={{ mb: 2 }}
          >
            <Tab label="Risk Taxonomy" value="taxonomy" />
            <Tab label="Mitigations" value="mitigations" />
            <Tab label="Full Assessment" value="assessment" />
          </Tabs>

          {!result && (
            <Box>
              {tab === "taxonomy" && (
                <GenerateTaxonomyForm
                  llmKeys={llmKeys}
                  onSubmit={handleTaxonomySubmit}
                  isLoading={isLoading}
                />
              )}
              {tab === "mitigations" && (
                <GenerateMitigationsForm
                  llmKeys={llmKeys}
                  onSubmit={handleMitigationsSubmit}
                  isLoading={isLoading}
                />
              )}
              {tab === "assessment" && (
                <GenerateAssessmentForm
                  llmKeys={llmKeys}
                  onSubmit={handleAssessmentSubmit}
                  isLoading={isLoading}
                />
              )}
            </Box>
          )}

          {error && (
            <Box sx={{ mt: 2, p: 2, backgroundColor: "error.main", borderRadius: 1, color: "#fff" }}>
              <Typography variant="body2">
                {(error as Error).message || "Generation failed. Please try again."}
              </Typography>
            </Box>
          )}

          {result && (
            <Box sx={{ mt: 1 }}>
              {result.type === "taxonomy" && (
                <TaxonomyResult
                  risks={result.risks}
                  generationId={result.generationId}
                  onFeedback={handleGenerationFeedback}
                />
              )}
              {result.type === "mitigations" && (
                <MitigationsResult
                  mitigations={result.mitigations}
                  generationId={result.generationId}
                  onFeedback={handleGenerationFeedback}
                />
              )}
              {result.type === "assessment" && (
                <AssessmentResult
                  assessment={result.assessment}
                  generationId={result.generationId}
                  onFeedback={handleGenerationFeedback}
                />
              )}
              <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setResult(null)}
                  sx={{ textTransform: "none" }}
                >
                  Generate Again
                </Button>
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GeneratePanel;
