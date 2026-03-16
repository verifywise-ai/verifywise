import { useState } from "react";
import { Box, Button, TextField } from "@mui/material";
import { SelectChangeEvent } from "@mui/material";
import Select from "../../components/Inputs/Select";
import { LLMKeysModel } from "../../../domain/models/Common/llmKeys/llmKeys.model";

interface Props {
  llmKeys: LLMKeysModel[];
  onSubmit: (params: {
    use_case: string;
    industry: string;
    project_description?: string;
    model_type?: string;
    lifecycle_phase?: string;
    llm_key_id: number;
  }) => void;
  isLoading: boolean;
}

const industries = [
  "Healthcare",
  "Finance",
  "Education",
  "Legal",
  "Manufacturing",
  "Retail",
  "Government",
  "Transportation",
  "Energy",
  "Telecommunications",
  "General",
];

const modelTypes = [
  "LLM / Text Generation",
  "Computer Vision",
  "Recommendation System",
  "Speech Recognition",
  "Predictive Analytics",
  "Autonomous System",
];

const lifecyclePhases = [
  "Design & Planning",
  "Data Collection & Processing",
  "Model Development",
  "Testing & Validation",
  "Deployment",
  "Monitoring & Maintenance",
  "Decommissioning",
];

const toItems = (options: string[], emptyLabel = "Any") => [
  { _id: "", name: emptyLabel },
  ...options.map((opt) => ({ _id: opt, name: opt })),
];

const toRequiredItems = (options: string[]) =>
  options.map((opt) => ({ _id: opt, name: opt }));

const GenerateAssessmentForm = ({ llmKeys, onSubmit, isLoading }: Props) => {
  const [useCase, setUseCase] = useState("");
  const [industry, setIndustry] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [modelType, setModelType] = useState("");
  const [lifecyclePhase, setLifecyclePhase] = useState("");
  const [llmKeyId, setLlmKeyId] = useState<number>(llmKeys[0]?.id || 0);

  const canSubmit = useCase && industry && llmKeyId;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      use_case: useCase,
      industry,
      project_description: projectDescription || undefined,
      model_type: modelType || undefined,
      lifecycle_phase: lifecyclePhase || undefined,
      llm_key_id: llmKeyId,
    });
  };

  const llmKeyItems = llmKeys.map((k) => ({
    _id: k.id,
    name: `${k.name} — ${k.model}`,
  }));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Select
        id="gen-assessment-llm-key"
        label="LLM Key *"
        placeholder="Select LLM key"
        value={llmKeyId}
        items={llmKeyItems}
        onChange={(e: SelectChangeEvent<string | number>) =>
          setLlmKeyId(Number(e.target.value))
        }
        sx={{ width: "100%" }}
      />

      <TextField
        size="small"
        fullWidth
        label="Use Case *"
        value={useCase}
        onChange={(e) => setUseCase(e.target.value)}
        placeholder="e.g., AI-powered medical diagnosis assistant"
      />

      <Select
        id="gen-assessment-industry"
        label="Industry *"
        placeholder="Select industry"
        value={industry}
        items={toRequiredItems(industries)}
        onChange={(e: SelectChangeEvent<string | number>) =>
          setIndustry(e.target.value as string)
        }
        isRequired
        sx={{ width: "100%" }}
      />

      <TextField
        size="small"
        fullWidth
        multiline
        rows={3}
        label="Project Description"
        value={projectDescription}
        onChange={(e) => setProjectDescription(e.target.value)}
        placeholder="Describe your AI project for a more comprehensive assessment..."
      />

      <Select
        id="gen-assessment-model-type"
        label="Model Type"
        placeholder="Any"
        value={modelType}
        items={toItems(modelTypes)}
        onChange={(e: SelectChangeEvent<string | number>) =>
          setModelType(e.target.value as string)
        }
        sx={{ width: "100%" }}
      />

      <Select
        id="gen-assessment-lifecycle-phase"
        label="Lifecycle Phase"
        placeholder="Any"
        value={lifecyclePhase}
        items={toItems(lifecyclePhases)}
        onChange={(e: SelectChangeEvent<string | number>) =>
          setLifecyclePhase(e.target.value as string)
        }
        sx={{ width: "100%" }}
      />

      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={!canSubmit || isLoading}
      >
        {isLoading ? "Generating..." : "Generate Risk Assessment"}
      </Button>
    </Box>
  );
};

export default GenerateAssessmentForm;
