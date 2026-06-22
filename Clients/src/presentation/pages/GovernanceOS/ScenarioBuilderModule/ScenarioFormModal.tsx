import React, { useState, useEffect } from "react";
import { Stack, TextField, Typography, Box } from "@mui/material";
import StandardModal from "../../../components/Modals/StandardModal";
import GovernanceTooltip from "../../../components/GovernanceOS/GovernanceTooltip";
import { IGovernanceScenario } from "../../../../domain/interfaces/i.governanceOs";
import { border as borderPalette, background, text, accent } from "../../../themes/palette";

interface ScenarioFormModalProps {
  open: boolean;
  scenario?: IGovernanceScenario | null;
  onClose: () => void;
  onSubmit: (data: Partial<IGovernanceScenario>) => void;
  isSubmitting?: boolean;
}

const FRAMEWORK_OPTIONS = [
  { id: 1, name: "EU AI Act" },
  { id: 2, name: "ISO 42001" },
  { id: 3, name: "ISO 27001" },
  { id: 4, name: "NIST AI RMF" },
];

const INDUSTRY_OPTIONS = [
  "technology",
  "healthcare",
  "finance",
  "public_sector",
  "manufacturing",
  "education",
  "energy",
  "retail",
];

const REGION_OPTIONS = ["eu", "us", "global", "apac", "uk"];

const ScenarioFormModal: React.FC<ScenarioFormModalProps> = ({
  open,
  scenario,
  onClose,
  onSubmit,
  isSubmitting,
}) => {
  const isEdit = !!scenario;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [region, setRegion] = useState("");
  const [selectedFrameworks, setSelectedFrameworks] = useState<number[]>([]);
  const [primaryFramework, setPrimaryFramework] = useState<number | null>(null);

  useEffect(() => {
    if (scenario) {
      setName(scenario.name || "");
      setDescription(scenario.description || "");
      setIndustry(scenario.industry || "");
      setRegion(scenario.region || "");
      const fwIds = scenario.recommended_framework_ids || [];
      setSelectedFrameworks(fwIds);
      const priority = scenario.priority_order as { primary?: number } | null;
      setPrimaryFramework(priority?.primary || fwIds[0] || null);
    } else {
      setName("");
      setDescription("");
      setIndustry("");
      setRegion("");
      setSelectedFrameworks([]);
      setPrimaryFramework(null);
    }
  }, [scenario, open]);

  const toggleFramework = (id: number) => {
    setSelectedFrameworks((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((fid) => fid !== id) : [...prev, id];
      if (!exists && next.length === 1) {
        setPrimaryFramework(id);
      } else if (exists && primaryFramework === id) {
        setPrimaryFramework(next[0] || null);
      }
      return next;
    });
  };

  const handleSubmit = () => {
    const priorityOrder = {
      primary: primaryFramework,
      secondary: selectedFrameworks.filter((id) => id !== primaryFramework),
      supplementary: [] as number[],
    };

    onSubmit({
      name,
      description,
      industry,
      region,
      recommended_framework_ids: selectedFrameworks,
      priority_order: priorityOrder,
    });
  };

  const isValid = name.trim().length > 0 && selectedFrameworks.length > 0;

  return (
    <StandardModal
      isOpen={open}
      onClose={onClose}
      title={isEdit ? "Edit Scenario" : "New Scenario"}
      description={
        isEdit ? "Update your governance scenario" : "Create a custom governance scenario"
      }
      submitButtonText={isEdit ? "Save Changes" : "Create Scenario"}
      cancelButtonText="Cancel"
      onSubmit={handleSubmit}
      isSubmitting={!isValid || isSubmitting}
      fitContent
    >
      <Stack gap="16px" sx={{ minWidth: 480 }}>
        <GovernanceTooltip
          header="Scenario name"
          description="Short descriptive name for this scenario"
        >
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
            required
          />
        </GovernanceTooltip>
        <GovernanceTooltip header="Description" description="Context and purpose of this scenario">
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            size="small"
            multiline
            rows={2}
          />
        </GovernanceTooltip>

        <Box>
          <GovernanceTooltip header="Industry" description="Sector this scenario applies to">
            <Typography
              sx={{
                fontSize: 12,
                color: text.secondary,
                fontWeight: 500,
                display: "block",
                mb: "8px",
              }}
            >
              Industry
            </Typography>
          </GovernanceTooltip>
          <Stack direction="row" gap="8px" flexWrap="wrap" useFlexGap>
            {INDUSTRY_OPTIONS.map((ind) => (
              <Box
                key={ind}
                component="span"
                onClick={() => setIndustry(industry === ind ? "" : ind)}
                sx={{
                  "display": "inline-flex",
                  "alignItems": "center",
                  "height": 24,
                  "px": "10px",
                  "borderRadius": "4px",
                  "fontSize": 12,
                  "cursor": "pointer",
                  "textTransform": "capitalize",
                  "backgroundColor": industry === ind ? accent.primary.bg : background.hover,
                  "color": industry === ind ? accent.primary.text : text.tertiary,
                  "border": `1px solid ${industry === ind ? accent.primary.border : borderPalette.light}`,
                  "&:hover": {
                    backgroundColor: industry === ind ? accent.primary.bg : background.accent,
                  },
                }}
              >
                {ind.replace(/_/g, " ")}
              </Box>
            ))}
          </Stack>
        </Box>

        <Box>
          <GovernanceTooltip header="Region" description="Regulatory region this scenario targets">
            <Typography
              sx={{
                fontSize: 12,
                color: text.secondary,
                fontWeight: 500,
                display: "block",
                mb: "8px",
              }}
            >
              Region
            </Typography>
          </GovernanceTooltip>
          <Stack direction="row" gap="8px" flexWrap="wrap" useFlexGap>
            {REGION_OPTIONS.map((reg) => (
              <Box
                key={reg}
                component="span"
                onClick={() => setRegion(region === reg ? "" : reg)}
                sx={{
                  "display": "inline-flex",
                  "alignItems": "center",
                  "height": 24,
                  "px": "10px",
                  "borderRadius": "4px",
                  "fontSize": 12,
                  "cursor": "pointer",
                  "backgroundColor": region === reg ? accent.indigo.bg : background.hover,
                  "color": region === reg ? accent.indigo.text : text.tertiary,
                  "border": `1px solid ${region === reg ? accent.indigo.border : borderPalette.light}`,
                  "&:hover": {
                    backgroundColor: region === reg ? accent.indigo.bg : background.accent,
                  },
                }}
              >
                {reg.toUpperCase()}
              </Box>
            ))}
          </Stack>
        </Box>

        <Box>
          <GovernanceTooltip header="Frameworks" description="Frameworks included in this scenario">
            <Typography
              sx={{
                fontSize: 12,
                color: text.secondary,
                fontWeight: 500,
                display: "block",
                mb: "8px",
              }}
            >
              Frameworks *
            </Typography>
          </GovernanceTooltip>
          <Stack direction="row" gap="8px" flexWrap="wrap" useFlexGap>
            {FRAMEWORK_OPTIONS.map((fw) => {
              const isSelected = selectedFrameworks.includes(fw.id);
              const isPrimary = primaryFramework === fw.id;
              return (
                <Box
                  key={fw.id}
                  component="span"
                  onClick={() => toggleFramework(fw.id)}
                  sx={{
                    "display": "inline-flex",
                    "alignItems": "center",
                    "height": 24,
                    "px": "10px",
                    "borderRadius": "4px",
                    "fontSize": 12,
                    "cursor": "pointer",
                    "fontWeight": isPrimary ? 600 : 400,
                    "backgroundColor": isSelected
                      ? isPrimary
                        ? accent.primary.bg
                        : accent.indigo.bg
                      : background.hover,
                    "color": isSelected
                      ? isPrimary
                        ? accent.primary.text
                        : accent.indigo.text
                      : text.tertiary,
                    "border": `1px solid ${
                      isSelected
                        ? isPrimary
                          ? accent.primary.border
                          : accent.indigo.border
                        : borderPalette.light
                    }`,
                    "&:hover": {
                      backgroundColor: isSelected
                        ? isPrimary
                          ? accent.primary.bg
                          : accent.indigo.bg
                        : background.accent,
                    },
                  }}
                >
                  {fw.name}
                </Box>
              );
            })}
          </Stack>
          {selectedFrameworks.length > 1 && (
            <Typography sx={{ fontSize: 12, color: text.muted, mt: "4px", display: "block" }}>
              First selected framework becomes primary. Click a selected framework to set it as
              primary.
            </Typography>
          )}
        </Box>
      </Stack>
    </StandardModal>
  );
};

export default ScenarioFormModal;
