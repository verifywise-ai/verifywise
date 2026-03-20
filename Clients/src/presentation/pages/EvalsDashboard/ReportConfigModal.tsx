import { useState, useMemo, useEffect } from "react";
import {
  Box,
  Stack,
  Typography,
  Checkbox,
  FormControlLabel,
  RadioGroup,
  Radio,
  Chip,
} from "@mui/material";
import ModalStandard from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
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
    DEFAULT_REPORT_SECTIONS.map(s => ({ ...s })),
  );

  const completedExperiments = useMemo(
    () => experiments.filter(e => e.status === "completed"),
    [experiments],
  );

  const toggleExperiment = (id: string) => {
    setSelectedExperimentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const selectAllExperiments = () => {
    if (selectedExperimentIds.length === completedExperiments.length) {
      setSelectedExperimentIds([]);
    } else {
      setSelectedExperimentIds(completedExperiments.map(e => e.id));
    }
  };

  const toggleSection = (sectionId: string) => {
    setSections(prev =>
      prev.map(s => (s.id === sectionId ? { ...s, enabled: !s.enabled } : s)),
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
      includeDetailedSamples: sections.find(s => s.id === "sample-details")?.enabled ?? false,
      includeArena: sections.find(s => s.id === "arena-comparison")?.enabled ?? false,
    });
  };

  return (
    <ModalStandard
      isOpen={open}
      onClose={onClose}
      title="Generate Evaluation Report"
      description="Configure report contents and select which experiments to include."
      onSubmit={handleSubmit}
      submitButtonText={isGenerating ? "Generating..." : "Generate Report"}
      isSubmitting={isGenerating}
      maxWidth="680px"
    >
      <Stack spacing={3}>
        {/* Title */}
        <Field
          label="Report title"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        />

        {/* Format */}
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#344054", mb: 1 }}>
            Format
          </Typography>
          <RadioGroup
            row
            value={format}
            onChange={(e) => setFormat(e.target.value as ReportFormat)}
          >
            <FormControlLabel
              value="pdf"
              control={<Radio size="small" />}
              label={
                <Typography sx={{ fontSize: 13 }}>
                  PDF — Structured report with charts and tables
                </Typography>
              }
            />
            <FormControlLabel
              value="csv"
              control={<Radio size="small" />}
              label={
                <Typography sx={{ fontSize: 13 }}>
                  CSV — Raw metric data for further analysis
                </Typography>
              }
            />
          </RadioGroup>
        </Box>

        {/* Experiment Selection */}
        <Box>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#344054" }}>
              Experiments to include
            </Typography>
            <Typography
              component="span"
              onClick={selectAllExperiments}
              sx={{
                fontSize: 12,
                color: "#13715B",
                cursor: "pointer",
                "&:hover": { textDecoration: "underline" },
              }}
            >
              {selectedExperimentIds.length === completedExperiments.length
                ? "Deselect all"
                : "Select all"}
            </Typography>
          </Stack>

          {completedExperiments.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: "#6B7280", fontStyle: "italic", py: 1 }}>
              No completed experiments available. Run an experiment first.
            </Typography>
          ) : (
            <Box
              sx={{
                maxHeight: 180,
                overflowY: "auto",
                border: "1px solid #E5E7EB",
                borderRadius: "6px",
              }}
            >
              {completedExperiments.map(exp => (
                <Box
                  key={exp.id}
                  onClick={() => toggleExperiment(exp.id)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1.5,
                    py: "8px",
                    cursor: "pointer",
                    borderBottom: "1px solid #F3F4F6",
                    "&:hover": { backgroundColor: "#F9FAFB" },
                    "&:last-child": { borderBottom: "none" },
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={selectedExperimentIds.includes(exp.id)}
                    sx={{ p: 0.5 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "#111827",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {exp.name || exp.id}
                    </Typography>
                  </Box>
                  <Chip
                    label={exp.model}
                    size="small"
                    sx={{
                      fontSize: 10,
                      height: 20,
                      backgroundColor: "#ECFDF5",
                      color: "#13715B",
                    }}
                  />
                </Box>
              ))}
            </Box>
          )}

          <Typography sx={{ fontSize: 11, color: "#9CA3AF", mt: 0.5 }}>
            {selectedExperimentIds.length} of {completedExperiments.length} selected
          </Typography>
        </Box>

        {/* Section Selection (only for PDF) */}
        {format === "pdf" && (
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#344054", mb: 1 }}>
              Report sections
            </Typography>
            <Box
              sx={{
                maxHeight: 220,
                overflowY: "auto",
                border: "1px solid #E5E7EB",
                borderRadius: "6px",
              }}
            >
              {sections.map(section => (
                <Box
                  key={section.id}
                  onClick={() => toggleSection(section.id)}
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 1,
                    px: 1.5,
                    py: 1,
                    cursor: "pointer",
                    borderBottom: "1px solid #F3F4F6",
                    "&:hover": { backgroundColor: "#F9FAFB" },
                    "&:last-child": { borderBottom: "none" },
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={section.enabled}
                    sx={{ p: 0.5, mt: -0.25 }}
                  />
                  <Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 500, color: "#111827" }}>
                      {section.label}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: "#6B7280" }}>
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
