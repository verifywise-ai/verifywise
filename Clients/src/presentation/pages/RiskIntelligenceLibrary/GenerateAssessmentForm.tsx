import { useState } from "react";
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
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

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <FormControl size="small" fullWidth>
        <InputLabel>LLM Key *</InputLabel>
        <Select
          value={llmKeyId}
          label="LLM Key *"
          onChange={(e) => setLlmKeyId(Number(e.target.value))}
        >
          {llmKeys.map((k) => (
            <MenuItem key={k.id} value={k.id}>
              {k.name} — {k.model}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        size="small"
        fullWidth
        label="Use Case *"
        value={useCase}
        onChange={(e) => setUseCase(e.target.value)}
        placeholder="e.g., AI-powered medical diagnosis assistant"
      />

      <FormControl size="small" fullWidth>
        <InputLabel>Industry *</InputLabel>
        <Select value={industry} label="Industry *" onChange={(e) => setIndustry(e.target.value)}>
          {industries.map((i) => (
            <MenuItem key={i} value={i}>
              {i}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

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

      <FormControl size="small" fullWidth>
        <InputLabel>Model Type</InputLabel>
        <Select
          value={modelType}
          label="Model Type"
          onChange={(e) => setModelType(e.target.value)}
        >
          <MenuItem value="">Any</MenuItem>
          {modelTypes.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" fullWidth>
        <InputLabel>Lifecycle Phase</InputLabel>
        <Select
          value={lifecyclePhase}
          label="Lifecycle Phase"
          onChange={(e) => setLifecyclePhase(e.target.value)}
        >
          <MenuItem value="">Any</MenuItem>
          {lifecyclePhases.map((p) => (
            <MenuItem key={p} value={p}>
              {p}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

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
