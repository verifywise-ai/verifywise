import { useState } from "react";
import { Box, Button, TextField } from "@mui/material";
import { SelectChangeEvent } from "@mui/material";
import Select from "../../components/Inputs/Select";
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

const toItems = (options: string[], emptyLabel = "None") => [
  { _id: "", name: emptyLabel },
  ...options.map((opt) => ({ _id: opt, name: opt })),
];

const toRequiredItems = (options: string[]) =>
  options.map((opt) => ({ _id: opt, name: opt }));

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

  const llmKeyItems = llmKeys.map((k) => ({
    _id: k.id,
    name: `${k.name} — ${k.model}`,
  }));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Select
        id="gen-taxonomy-llm-key"
        label="LLM Key *"
        placeholder="Select LLM key"
        value={llmKeyId}
        items={llmKeyItems}
        onChange={(e: SelectChangeEvent<string | number>) =>
          setLlmKeyId(Number(e.target.value))
        }
        sx={{ width: "100%" }}
      />

      <Select
        id="gen-taxonomy-industry"
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
        label="Use Case *"
        value={useCase}
        onChange={(e) => setUseCase(e.target.value)}
        placeholder="e.g., Customer service chatbot for banking"
      />

      <Select
        id="gen-taxonomy-ai-system-type"
        label="AI System Type"
        placeholder="None"
        value={aiSystemType}
        items={toItems(aiSystemTypes)}
        onChange={(e: SelectChangeEvent<string | number>) =>
          setAiSystemType(e.target.value as string)
        }
        sx={{ width: "100%" }}
      />

      <Select
        id="gen-taxonomy-lifecycle-phase"
        label="Lifecycle Phase"
        placeholder="Any"
        value={lifecyclePhase}
        items={toItems(lifecyclePhases, "Any")}
        onChange={(e: SelectChangeEvent<string | number>) =>
          setLifecyclePhase(e.target.value as string)
        }
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
