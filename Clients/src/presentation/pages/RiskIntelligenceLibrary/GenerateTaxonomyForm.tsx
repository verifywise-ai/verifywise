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
    industry: string;
    use_case: string;
    ai_system_type?: string;
    lifecycle_phase?: string;
    project_description?: string;
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

const aiSystemTypes = [
  "LLM / Text Generation",
  "Computer Vision",
  "Recommendation System",
  "Speech Recognition",
  "Predictive Analytics",
  "Autonomous System",
  "Decision Support",
  "Content Moderation",
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

const selectSx = { "& .MuiSelect-select": { py: 1 } };

const GenerateTaxonomyForm = ({ llmKeys, onSubmit, isLoading }: Props) => {
  const [industry, setIndustry] = useState("");
  const [useCase, setUseCase] = useState("");
  const [aiSystemType, setAiSystemType] = useState("");
  const [lifecyclePhase, setLifecyclePhase] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [llmKeyId, setLlmKeyId] = useState<number>(llmKeys[0]?.id || 0);

  const canSubmit = industry && useCase && llmKeyId;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      industry,
      use_case: useCase,
      ai_system_type: aiSystemType || undefined,
      lifecycle_phase: lifecyclePhase || undefined,
      project_description: projectDescription || undefined,
      llm_key_id: llmKeyId,
    });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <FormControl size="small" fullWidth sx={selectSx}>
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

      <FormControl size="small" fullWidth sx={selectSx}>
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
        label="Use Case *"
        value={useCase}
        onChange={(e) => setUseCase(e.target.value)}
        placeholder="e.g., Customer service chatbot for banking"
      />

      <FormControl size="small" fullWidth sx={selectSx}>
        <InputLabel>AI System Type</InputLabel>
        <Select
          value={aiSystemType}
          label="AI System Type"
          onChange={(e) => setAiSystemType(e.target.value)}
        >
          <MenuItem value="">None</MenuItem>
          {aiSystemTypes.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" fullWidth sx={selectSx}>
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

      <TextField
        size="small"
        fullWidth
        multiline
        rows={3}
        label="Project Description"
        value={projectDescription}
        onChange={(e) => setProjectDescription(e.target.value)}
        placeholder="Describe your AI project for more tailored risk identification..."
      />

      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={!canSubmit || isLoading}
      >
        {isLoading ? "Generating..." : "Generate Risk Taxonomy"}
      </Button>
    </Box>
  );
};

export default GenerateTaxonomyForm;
