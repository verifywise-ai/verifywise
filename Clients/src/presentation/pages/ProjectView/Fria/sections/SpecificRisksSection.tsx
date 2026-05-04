import { useState, useEffect } from "react";
import { Box, IconButton, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { SelectChangeEvent } from "@mui/material/Select";
import { Plus, Trash2, Download } from "lucide-react";
import Field from "../../../../components/Inputs/Field";
import Select from "../../../../components/Inputs/Select";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import { FriaAssessment, FriaRiskItem } from "../../../../../application/hooks/useFria";
import FriaEvidenceButton from "../FriaEvidenceButton";
import FriaRiskImportModal from "../FriaRiskImportModal";
import FriaSectionCard from "../FriaSectionCard";
import { EU_ACT_LINK } from "../friaConstants";
import { brand } from "../../../../themes/palette";
import { getAllProjectRisksByProjectId } from "../../../../../application/repository/projectRisk.repository";

interface SpecificRisksSectionProps {
  assessment: FriaAssessment;
  riskItems: FriaRiskItem[];
  projectId: string;
  onUpdate: (data: Partial<FriaAssessment>) => void;
  onAddRiskItem: (data: Partial<FriaRiskItem>) => void;
  onUpdateRiskItem: (itemId: number, data: Partial<FriaRiskItem>) => void;
  onDeleteRiskItem: (itemId: number) => void;
  isSaving: boolean;
}

const LIKELIHOOD_OPTIONS = [
  { _id: "Low", name: "Low" },
  { _id: "Medium", name: "Medium" },
  { _id: "High", name: "High" },
];

const SEVERITY_OPTIONS = [
  { _id: "Low", name: "Low" },
  { _id: "Medium", name: "Medium" },
  { _id: "High", name: "High" },
];

interface ProjectRiskOption {
  _id: string;
  name: string;
}

function RiskRow({
  item,
  onUpdateRiskItem,
  onDeleteRiskItem,
  isSaving,
  projectRiskOptions,
}: {
  item: FriaRiskItem;
  onUpdateRiskItem: (itemId: number, data: Partial<FriaRiskItem>) => void;
  onDeleteRiskItem: (itemId: number) => void;
  isSaving: boolean;
  projectRiskOptions: ProjectRiskOption[];
}) {
  const [riskDescription, setRiskDescription] = useState(item.risk_description ?? "");
  const [existingControls, setExistingControls] = useState(item.existing_controls ?? "");
  const [furtherAction, setFurtherAction] = useState(item.further_action ?? "");

  const handleTextBlur =
    (field: keyof FriaRiskItem, currentVal: string, originalVal: string | null) => () => {
      if (currentVal !== (originalVal ?? "")) {
        onUpdateRiskItem(item.id, { [field]: currentVal });
      }
    };

  const handleSelectChange =
    (field: keyof FriaRiskItem) => (e: SelectChangeEvent<string | number>) => {
      onUpdateRiskItem(item.id, { [field]: e.target.value as string });
    };

  return (
    <Box
      sx={{
        border: "1px solid #d0d5dd",
        borderRadius: "4px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <Box sx={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
        <Box sx={{ flex: 1 }}>
          <Field
            id={`risk-desc-${item.id}`}
            value={riskDescription}
            type="description"
            rows={2}
            placeholder="Describe risk…"
            onChange={(e) => setRiskDescription(e.target.value)}
            onBlur={handleTextBlur("risk_description", riskDescription, item.risk_description)}
            disabled={isSaving}
          />
        </Box>
        <IconButton
          size="small"
          onClick={() => onDeleteRiskItem(item.id)}
          disabled={isSaving}
          aria-label="Delete risk item"
          sx={{
            color: "text.secondary",
            "&:hover": { color: "error.main" },
            mt: "2px",
            flexShrink: 0,
          }}
        >
          <Trash2 size={14} strokeWidth={1.5} />
        </IconButton>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "8px",
        }}
      >
        <Select
          id={`likelihood-${item.id}`}
          label="Likelihood"
          placeholder="Select…"
          value={item.likelihood ?? ""}
          items={LIKELIHOOD_OPTIONS}
          onChange={handleSelectChange("likelihood")}
          disabled={isSaving}
        />
        <Select
          id={`severity-${item.id}`}
          label="Severity"
          placeholder="Select…"
          value={item.severity ?? ""}
          items={SEVERITY_OPTIONS}
          onChange={handleSelectChange("severity")}
          disabled={isSaving}
        />
        <Select
          id={`linked-risk-${item.id}`}
          label="Linked risk"
          placeholder="Select risk…"
          value={item.linked_project_risk_id ? String(item.linked_project_risk_id) : ""}
          items={[{ _id: "", name: "None" }, ...projectRiskOptions]}
          onChange={(e: SelectChangeEvent<string | number>) => {
            const val = e.target.value as string;
            if (val === "") {
              onUpdateRiskItem(item.id, { linked_project_risk_id: null, linked_risk_name: null });
            } else {
              const selected = projectRiskOptions.find((r) => r._id === val);
              onUpdateRiskItem(item.id, {
                linked_project_risk_id: parseInt(val),
                linked_risk_name: selected?.name ?? null,
              });
            }
          }}
          disabled={isSaving}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
        }}
      >
        <Field
          id={`existing-controls-${item.id}`}
          label="Existing controls"
          value={existingControls}
          type="description"
          rows={2}
          placeholder="Existing controls…"
          onChange={(e) => setExistingControls(e.target.value)}
          onBlur={handleTextBlur("existing_controls", existingControls, item.existing_controls)}
          disabled={isSaving}
        />
        <Field
          id={`further-action-${item.id}`}
          label="Further action"
          value={furtherAction}
          type="description"
          rows={2}
          placeholder="Further action…"
          onChange={(e) => setFurtherAction(e.target.value)}
          onBlur={handleTextBlur("further_action", furtherAction, item.further_action)}
          disabled={isSaving}
        />
      </Box>
    </Box>
  );
}

function SpecificRisksSection({
  assessment,
  riskItems,
  projectId,
  onUpdate,
  onAddRiskItem,
  onUpdateRiskItem,
  onDeleteRiskItem,
  isSaving,
}: SpecificRisksSectionProps) {
  const theme = useTheme();
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [projectRiskOptions, setProjectRiskOptions] = useState<ProjectRiskOption[]>([]);

  useEffect(() => {
    const fetchRisks = async () => {
      try {
        const response = await getAllProjectRisksByProjectId({
          projectId: String(assessment.project_id),
          filter: "active",
        });
        const risks = response.data || response || [];
        setProjectRiskOptions(
          Array.isArray(risks)
            ? risks.map((r: { id: number; risk_name?: string; title?: string }) => ({
                _id: String(r.id),
                name: r.risk_name || r.title || `Risk #${r.id}`,
              }))
            : [],
        );
      } catch {
        setProjectRiskOptions([]);
      }
    };
    fetchRisks();
  }, [assessment.project_id]);

  const [riskScenarios, setRiskScenarios] = useState(assessment.risk_scenarios ?? "");
  const [providerInfoUsed, setProviderInfoUsed] = useState(assessment.provider_info_used ?? "");

  const handleRiskScenariosBlur = () => {
    if (riskScenarios !== (assessment.risk_scenarios ?? "")) {
      onUpdate({ risk_scenarios: riskScenarios });
    }
  };

  const handleProviderInfoBlur = () => {
    if (providerInfoUsed !== (assessment.provider_info_used ?? "")) {
      onUpdate({ provider_info_used: providerInfoUsed });
    }
  };

  return (
    <FriaSectionCard
      title="5. Specific risks of harm"
      subtitle="Identify specific risks of harm that the AI system may pose to fundamental rights."
      euActContent={
        <>
          <strong>EU AI Act reference:</strong>{" "}
          <a
            href={`${EU_ACT_LINK}#art_27`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: brand.primary }}
          >
            Article 27(1)(e)–(f)
          </a>{" "}
          requires identifying specific risks to health, safety, and fundamental rights, and
          describing measures to mitigate those risks.{" "}
          <a
            href={`${EU_ACT_LINK}#art_9`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: brand.primary }}
          >
            Article 9
          </a>{" "}
          (risk management system) provides the broader framework for identifying and addressing
          AI-related risks.
        </>
      }
    >
      <Field
        id="risk-scenarios"
        label="Risk scenarios"
        placeholder="Describe the specific risk scenarios and how fundamental rights may be affected…"
        type="description"
        rows={4}
        value={riskScenarios}
        onChange={(e) => setRiskScenarios(e.target.value)}
        onBlur={handleRiskScenariosBlur}
        disabled={isSaving}
      />

      <Field
        id="provider-info-used"
        label="Provider information used"
        placeholder="Describe what technical documentation, conformity assessments or other provider information was used in this analysis…"
        type="description"
        rows={3}
        value={providerInfoUsed}
        onChange={(e) => setProviderInfoUsed(e.target.value)}
        onBlur={handleProviderInfoBlur}
        disabled={isSaving}
      />

      <Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 600,
              color: theme.palette.text.primary,
            }}
          >
            Risk register
          </Typography>
        </Box>

        {riskItems.length === 0 ? (
          <Box
            sx={{
              border: "1px solid #d0d5dd",
              borderRadius: "4px",
              padding: "24px",
              textAlign: "center",
              fontSize: 13,
              color: theme.palette.text.secondary,
            }}
          >
            No risk items yet. Add a risk to get started.
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {riskItems.map((item) => (
              <RiskRow
                key={item.id}
                item={item}
                onUpdateRiskItem={onUpdateRiskItem}
                onDeleteRiskItem={onDeleteRiskItem}
                isSaving={isSaving}
                projectRiskOptions={projectRiskOptions}
              />
            ))}
          </Box>
        )}

        <Box sx={{ marginTop: "8px", display: "flex", gap: "8px" }}>
          <CustomizableButton
            text="Add risk"
            variant="outlined"
            startIcon={<Plus size={14} strokeWidth={1.5} />}
            onClick={() => onAddRiskItem({ risk_description: "New risk" })}
            disabled={isSaving}
            sx={{ height: 34, fontSize: 13 }}
          />
          <CustomizableButton
            text="Import from project risks"
            variant="outlined"
            startIcon={<Download size={14} strokeWidth={1.5} />}
            onClick={() => setImportModalOpen(true)}
            disabled={isSaving}
            sx={{ height: 34, fontSize: 13 }}
          />
        </Box>
      </Box>

      <FriaEvidenceButton friaId={assessment.id} entityType="section_5" />

      <FriaRiskImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        projectId={projectId}
        existingLinkedRiskIds={riskItems
          .filter((r) => r.linked_project_risk_id)
          .map((r) => r.linked_project_risk_id as number)}
        onImport={(risks) => {
          for (const risk of risks) {
            onAddRiskItem(risk);
          }
        }}
      />
    </FriaSectionCard>
  );
}

export default SpecificRisksSection;
