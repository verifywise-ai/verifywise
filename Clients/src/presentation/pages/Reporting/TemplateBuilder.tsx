import { useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import StepperModal from "../../components/Modals/StepperModal";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import Checkbox from "../../components/Inputs/Checkbox";
import { text as textColors } from "../../themes/palette";
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

const CATEGORY_ITEMS = [
  { _id: "governance", name: "Governance" },
  { _id: "compliance", name: "Compliance" },
  { _id: "risk", name: "Risk" },
];

const SCOPE_ITEMS = [
  { _id: "project", name: "Project" },
  { _id: "organization", name: "Organization" },
];

// Style guide § Typography: body 13px, hint on text.tertiary. The panels carry
// no heading of their own — the stepper already names each step.
const panelHintSx = {
  fontSize: 13,
  lineHeight: 1.5,
  color: textColors.tertiary,
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
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

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
    <StepperModal
      isOpen
      onClose={onClose}
      title="New report template"
      steps={STEPS}
      activeStep={active}
      onNext={() => setActive(active + 1)}
      onBack={() => setActive(active - 1)}
      onSubmit={submit}
      canProceed={canNext()}
      isSubmitting={create.isPending}
      submitButtonText="Create template"
      maxWidth="700px"
    >
      {active === 0 && (
        <Stack spacing={6}>
          <Field
            id="template-builder-name"
            label="Template name"
            isRequired
            placeholder="e.g. Quarterly board pack"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Field
            id="template-builder-description"
            label="Description"
            isOptional
            multiline
            minRows={2}
            placeholder="What this report covers and who it is for"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Select
            id="template-builder-category"
            label="Category"
            value={category}
            items={CATEGORY_ITEMS}
            onChange={(e) => setCategory(String(e.target.value))}
            getOptionValue={(item) => item._id}
          />
          <Select
            id="template-builder-scope"
            label="Default report level"
            value={scope}
            items={SCOPE_ITEMS}
            onChange={(e) => setScope(e.target.value as ReportScope)}
            getOptionValue={(item) => item._id}
          />
        </Stack>
      )}

      {active === 1 && (
        <Stack spacing="16px">
          {isLoading && <Typography sx={panelHintSx}>Loading sections…</Typography>}
          {Object.entries(groups).map(([group, entries]) => (
            <Box key={group}>
              {/* Group label, not a heading: it names a checkbox cluster. */}
              <Typography sx={{ ...panelHintSx, mb: "4px" }}>{group}</Typography>
              <Stack>
                {entries.map((entry) => (
                  <Checkbox
                    key={entry.key}
                    id={`template-builder-section-${entry.key}`}
                    label={entry.label}
                    value={entry.key}
                    size="small"
                    isChecked={selected.includes(entry.key)}
                    onChange={() => toggleSection(entry.key)}
                  />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      {active === 2 && (
        <Stack spacing="8px">
          <Typography sx={panelHintSx}>
            Each enabled block is one language-model call per report run.
          </Typography>
          <Stack>
            {AI_BLOCKS.map(({ key, label }) => (
              <Checkbox
                key={key}
                id={`template-builder-ai-${key}`}
                label={label}
                value={key}
                size="small"
                isChecked={!!ai[key]}
                onChange={(e) => setAi((prev) => ({ ...prev, [key]: e.target.checked }))}
              />
            ))}
          </Stack>
        </Stack>
      )}
    </StepperModal>
  );
}
