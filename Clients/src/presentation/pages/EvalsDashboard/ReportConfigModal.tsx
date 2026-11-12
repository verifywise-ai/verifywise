import { useState, useMemo, useEffect } from "react";
import { Box, Stack, Typography } from "@mui/material";
import ModalStandard from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
import Radio from "../../components/Inputs/Radio";
import Checkbox from "../../components/Inputs/Checkbox";
import Chip from "../../components/Chip";
import { palette } from "../../themes/palette";
import type { ReportConfig, ReportSection, ReportFormat } from "./types";
import { DEFAULT_REPORT_SECTIONS } from "./types";

interface ExperimentOption {
  id: string;
  name: string;
  model: string;
  status: string;
}

interface ReportConfigModalProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (config: ReportConfig) => void;
  experiments: ExperimentOption[];
  projectName: string;
  isGenerating?: boolean;
}

export default function ReportConfigModal({
  open,
  onClose,
  onGenerate,
  experiments,
  projectName,
  isGenerating = false,
}: ReportConfigModalProps) {
  const [title, setTitle] = useState(`${projectName} - Evaluation Report`);
  // Reset title when projectName changes or modal reopens
  useEffect(() => {
    if (open && projectName) {
      setTitle(`${projectName} - Evaluation Report`);
    }
  }, [open, projectName]);
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [selectedExperimentIds, setSelectedExperimentIds] = useState<string[]>([]);
  const [sections, setSections] = useState<ReportSection[]>(() =>
    DEFAULT_REPORT_SECTIONS.map((s) => ({ ...s })),
  );

  const completedExperiments = useMemo(
    () => experiments.filter((e) => e.status === "completed"),
    [experiments],
  );

  const toggleExperiment = (id: string) => {
    setSelectedExperimentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAllExperiments = () => {
    if (selectedExperimentIds.length === completedExperiments.length) {
      setSelectedExperimentIds([]);
    } else {
      setSelectedExperimentIds(completedExperiments.map((e) => e.id));
    }
  };

  const toggleSection = (sectionId: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, enabled: !s.enabled } : s)),
    );
  };

  const canGenerate = selectedExperimentIds.length > 0 && title.trim().length > 0;

  const handleSubmit = () => {
    if (!canGenerate) return;
    onGenerate({
      title: title.trim(),
      format,
      experimentIds: selectedExperimentIds,
      sections,
      includeDetailedSamples: sections.find((s) => s.id === "sample-details")?.enabled ?? false,
      includeArena: sections.find((s) => s.id === "arena-comparison")?.enabled ?? false,
    });
  };

  return (
    <ModalStandard
      isOpen={open}
      onClose={onClose}
      title="Generate evaluation report"
      description="Configure report contents and select which experiments to include."
      onSubmit={handleSubmit}
      submitButtonText={isGenerating ? "Generating..." : "Generate report"}
      isSubmitting={isGenerating}
      maxWidth="680px"
    >
      <Stack spacing="6px">
        {/* Title */}
        <Field
          label="Report title"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        />

        {/* Format */}
        <Box>
          <Typography
            sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary, mb: "2px" }}
          >
            Format
          </Typography>
          <Stack direction="row" gap="12px" role="radiogroup" aria-label="Format">
            <Radio
              id="report-format-pdf"
              name="report-format"
              value="pdf"
              size="small"
              checked={format === "pdf"}
              onChange={(e) => setFormat(e.target.value as ReportFormat)}
              title="PDF: structured report with charts and tables"
            />
            <Radio
              id="report-format-csv"
              name="report-format"
              value="csv"
              size="small"
              checked={format === "csv"}
              onChange={(e) => setFormat(e.target.value as ReportFormat)}
              title="CSV: raw metric data for further analysis"
            />
          </Stack>
        </Box>

        {/* Experiment Selection */}
        <Box>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb="2px">
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary }}>
              Experiments to include
            </Typography>
            <Typography
              component="span"
              onClick={selectAllExperiments}
              sx={{
                "fontSize": 12,
                "color": palette.brand.primary,
                "cursor": "pointer",
                "&:hover": { textDecoration: "underline" },
              }}
            >
              {selectedExperimentIds.length === completedExperiments.length
                ? "Deselect all"
                : "Select all"}
            </Typography>
          </Stack>

          {completedExperiments.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: palette.text.tertiary, py: "2px" }}>
              No completed experiments available. Run an experiment first.
            </Typography>
          ) : (
            <Box
              sx={{
                maxHeight: 180,
                overflowY: "auto",
                border: `1px solid ${palette.border.dark}`,
                borderRadius: "4px",
              }}
            >
              {completedExperiments.map((exp) => (
                <Box
                  key={exp.id}
                  onClick={() => toggleExperiment(exp.id)}
                  sx={{
                    "display": "flex",
                    "alignItems": "center",
                    "gap": "2px",
                    "px": "3px",
                    "py": "8px",
                    "cursor": "pointer",
                    "borderBottom": `1px solid ${palette.border.light}`,
                    "&:hover": { backgroundColor: palette.background.accent },
                    "&:last-child": { borderBottom: "none" },
                  }}
                >
                  <Checkbox
                    id={`report-experiment-${exp.id}`}
                    value={exp.id}
                    size="small"
                    isChecked={selectedExperimentIds.includes(exp.id)}
                    ariaLabel={exp.name || exp.id}
                    // The row's onClick toggles the selection; the click bubbles up to it.
                    onChange={() => {}}
                    sx={{ p: "1px" }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: palette.text.primary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {exp.name || exp.id}
                    </Typography>
                  </Box>
                  <Chip label={exp.model} variant="success" size="small" uppercase={false} />
                </Box>
              ))}
            </Box>
          )}

          <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mt: "1px" }}>
            {selectedExperimentIds.length} of {completedExperiments.length} selected
          </Typography>
        </Box>

        {/* Section Selection (only for PDF) */}
        {format === "pdf" && (
          <Box>
            <Typography
              sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary, mb: "2px" }}
            >
              Report sections
            </Typography>
            <Box
              sx={{
                maxHeight: 220,
                overflowY: "auto",
                border: `1px solid ${palette.border.dark}`,
                borderRadius: "4px",
              }}
            >
              {sections.map((section) => (
                <Box
                  key={section.id}
                  onClick={() => toggleSection(section.id)}
                  sx={{
                    "display": "flex",
                    "alignItems": "flex-start",
                    "gap": "2px",
                    "px": "3px",
                    "py": "2px",
                    "cursor": "pointer",
                    "borderBottom": `1px solid ${palette.border.light}`,
                    "&:hover": { backgroundColor: palette.background.accent },
                    "&:last-child": { borderBottom: "none" },
                  }}
                >
                  <Checkbox
                    id={`report-section-${section.id}`}
                    value={section.id}
                    size="small"
                    isChecked={section.enabled}
                    ariaLabel={section.label}
                    // The row's onClick toggles the section; the click bubbles up to it.
                    onChange={() => {}}
                    sx={{ p: "1px", mt: "-0.5px" }}
                  />
                  <Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 500, color: palette.text.primary }}>
                      {section.label}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                      {section.description}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Stack>
    </ModalStandard>
  );
}
