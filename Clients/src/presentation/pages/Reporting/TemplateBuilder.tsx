import { useState } from "react";
import {
  Stepper,
  Step,
  StepLabel,
  Box,
  Button,
  MenuItem,
  TextField,
  FormControlLabel,
  Checkbox,
  Typography,
  Stack,
} from "@mui/material";
import { useSectionCatalog, useCreateTemplate } from "../../../application/hooks/useReporting";
import { showAlert } from "../../../infrastructure/api/customAxios";
import type {
  AiBlocksConfig,
  ReportScope,
  ReportSectionCatalogEntry,
} from "../../../domain/interfaces/i.reporting";

const STEPS = ["Details", "Sections", "AI insights"];

// All seven Phase 2 blocks, listed explicitly. The defaults mirror the
// behaviour-preserving manual-run set: the two project-scoped analyzers
// (complianceGap, vendorRisk) stay off because they add LLM spend to every
// run of the template.
const AI_BLOCKS: Array<{ key: keyof AiBlocksConfig; label: string }> = [
  { key: "sectionSummaries", label: "Per-section summaries" },
  { key: "executiveSummary", label: "Executive summary" },
  { key: "keyFindings", label: "Key findings" },
  { key: "recommendedActions", label: "Recommended actions" },
  { key: "riskAnalysis", label: "Risk analysis" },
  { key: "complianceGap", label: "Compliance gap analysis" },
  { key: "vendorRisk", label: "Third-party risk analysis" },
];

const DEFAULT_AI_BLOCKS: AiBlocksConfig = {
  sectionSummaries: true,
  executiveSummary: true,
  keyFindings: true,
  recommendedActions: true,
  riskAnalysis: true,
  complianceGap: false,
  vendorRisk: false,
};

export default function TemplateBuilder({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("governance");
  const [scope, setScope] = useState<ReportScope>("project");
  const [selected, setSelected] = useState<string[]>([]);
  const [ai, setAi] = useState<AiBlocksConfig>(DEFAULT_AI_BLOCKS);

  const { data: catalog = [], isLoading } = useSectionCatalog();
  const create = useCreateTemplate();

  const groups = catalog.reduce<Record<string, ReportSectionCatalogEntry[]>>((acc, entry) => {
    (acc[entry.group] ??= []).push(entry);
    return acc;
  }, {});

  const canNext = () => {
    if (active === 0) return name.trim().length > 0;
    if (active === 1) return selected.length > 0;
    return true;
  };

  const toggleSection = (key: string) =>
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const submit = () => {
    create.mutate(
      {
        name: name.trim(),
        description: description.trim() || null,
        category,
        default_scope: scope,
        supported_scopes: ["project", "organization"],
        sections_config: {
          sections: selected.map((key) => {
            const entry = catalog.find((c) => c.key === key);
            return {
              key,
              reportSectionKey: key,
              label: entry?.label ?? key,
              core: false,
              defaultEnabled: true,
              supportedScopes: ["project", "organization"] as ReportScope[],
            };
          }),
        },
        ai_blocks_config: ai,
      },
      {
        onSuccess: onClose,
        onError: () =>
          showAlert({
            variant: "error",
            body: "Failed to create template",
            isToast: true,
          }),
      },
    );
  };

  return (
    <Box sx={{ p: 3, minWidth: 600 }}>
      <Stepper activeStep={active} sx={{ mb: 3 }}>
        {STEPS.map((s) => (
          <Step key={s}>
            <StepLabel>{s}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {active === 0 && (
        <Stack spacing={2}>
          <TextField
            label="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          <TextField
            select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <MenuItem value="governance">Governance</MenuItem>
            <MenuItem value="compliance">Compliance</MenuItem>
            <MenuItem value="risk">Risk</MenuItem>
          </TextField>
          <TextField
            select
            label="Default report level"
            value={scope}
            onChange={(e) => setScope(e.target.value as ReportScope)}
          >
            <MenuItem value="project">Project</MenuItem>
            <MenuItem value="organization">Organization</MenuItem>
          </TextField>
        </Stack>
      )}

      {active === 1 && (
        <Stack spacing={1}>
          <Typography variant="h6">Sections</Typography>
          {isLoading && (
            <Typography variant="body2" color="text.secondary">
              Loading sections…
            </Typography>
          )}
          {Object.entries(groups).map(([group, entries]) => (
            <Box key={group} sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {group}
              </Typography>
              {entries.map((entry) => (
                <FormControlLabel
                  key={entry.key}
                  control={
                    <Checkbox
                      checked={selected.includes(entry.key)}
                      onChange={() => toggleSection(entry.key)}
                    />
                  }
                  label={entry.label}
                />
              ))}
            </Box>
          ))}
        </Stack>
      )}

      {active === 2 && (
        <Stack spacing={1}>
          <Typography variant="h6">AI insights</Typography>
          <Typography variant="body2" color="text.secondary">
            Each enabled block is one language-model call per report run.
          </Typography>
          {AI_BLOCKS.map(({ key, label }) => (
            <FormControlLabel
              key={key}
              control={
                <Checkbox
                  checked={!!ai[key]}
                  onChange={(e) => setAi((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
              }
              label={label}
            />
          ))}
        </Stack>
      )}

      <Box sx={{ mt: 3, display: "flex", justifyContent: "space-between" }}>
        <Button disabled={active === 0} onClick={() => setActive(active - 1)}>
          Back
        </Button>
        {active < STEPS.length - 1 ? (
          <Button variant="contained" disabled={!canNext()} onClick={() => setActive(active + 1)}>
            Next
          </Button>
        ) : (
          <Button variant="contained" disabled={create.isPending} onClick={submit}>
            Create template
          </Button>
        )}
      </Box>
    </Box>
  );
}
