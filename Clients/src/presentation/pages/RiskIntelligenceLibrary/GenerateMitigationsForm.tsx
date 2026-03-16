import { useState } from "react";
import { Box, Button, TextField } from "@mui/material";
import { SelectChangeEvent } from "@mui/material";
import Select from "../../components/Inputs/Select";
import { LLMKeysModel } from "../../../domain/models/Common/llmKeys/llmKeys.model";

interface Props {
  llmKeys: LLMKeysModel[];
  onSubmit: (params: {
    risk_summary: string;
    risk_description: string;
    risk_category?: string;
    severity?: string;
    industry?: string;
    llm_key_id: number;
  }) => void;
  isLoading: boolean;
}

const severities = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"];

const toItems = (options: string[], emptyLabel = "Any") => [
  { _id: "", name: emptyLabel },
  ...options.map((opt) => ({ _id: opt, name: opt })),
];

const GenerateMitigationsForm = ({ llmKeys, onSubmit, isLoading }: Props) => {
  const [riskSummary, setRiskSummary] = useState("");
  const [riskDescription, setRiskDescription] = useState("");
  const [riskCategory, setRiskCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [industry, setIndustry] = useState("");
  const [llmKeyId, setLlmKeyId] = useState<number>(llmKeys[0]?.id || 0);

  const canSubmit = riskSummary && riskDescription && llmKeyId;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      risk_summary: riskSummary,
      risk_description: riskDescription,
      risk_category: riskCategory || undefined,
      severity: severity || undefined,
      industry: industry || undefined,
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
        id="gen-mitigations-llm-key"
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
        label="Risk Summary *"
        value={riskSummary}
        onChange={(e) => setRiskSummary(e.target.value)}
        placeholder="e.g., Bias in hiring algorithm"
      />

      <TextField
        size="small"
        fullWidth
        multiline
        rows={3}
        label="Risk Description *"
        value={riskDescription}
        onChange={(e) => setRiskDescription(e.target.value)}
        placeholder="Describe the risk scenario in detail..."
      />

      <TextField
        size="small"
        fullWidth
        label="Risk Category"
        value={riskCategory}
        onChange={(e) => setRiskCategory(e.target.value)}
        placeholder="e.g., Discrimination & Toxicity"
      />

      <Select
        id="gen-mitigations-severity"
        label="Severity"
        placeholder="Any"
        value={severity}
        items={toItems(severities)}
        onChange={(e: SelectChangeEvent<string | number>) =>
          setSeverity(e.target.value as string)
        }
        sx={{ width: "100%" }}
      />

      <TextField
        size="small"
        fullWidth
        label="Industry"
        value={industry}
        onChange={(e) => setIndustry(e.target.value)}
        placeholder="e.g., Healthcare, Finance"
      />

      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={!canSubmit || isLoading}
      >
        {isLoading ? "Generating..." : "Generate Mitigations"}
      </Button>
    </Box>
  );
};

export default GenerateMitigationsForm;
