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

      <FormControl size="small" fullWidth>
        <InputLabel>Severity</InputLabel>
        <Select
          value={severity}
          label="Severity"
          onChange={(e) => setSeverity(e.target.value)}
        >
          <MenuItem value="">Any</MenuItem>
          {severities.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

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
