/**
 * @fileoverview "Option 3: templates" list for the Dataset wizard step.
 *
 * @module pages/EvalsDashboard/NewExperiment/TemplateDatasetsSection
 */

import { Box, Stack, Typography } from "@mui/material";
import { Database } from "lucide-react";
import SelectableCard from "../../../components/SelectableCard";
import { palette } from "../../../themes/palette";
import { readDataset } from "../../../../application/repository/deepEval.repository";
import { DATASET_TEMPLATES, type DatasetPrompt, type TaskType } from "./newExperimentConfig";
import DatasetTypeChip from "./DatasetTypeChip";

export interface TemplateDatasetsSectionProps {
  taskType: TaskType;
  selectedPresetPath: string;
  useBuiltin: boolean;
  datasetPromptCount: number;
  /**
   * `prompts` is null when the dataset read fails (selection still updates;
   * loaded flag is left alone — matches prior modal behavior).
   */
  onSelect: (path: string, prompts: DatasetPrompt[] | null) => void;
}

const TASK_TYPE_LABEL: Record<TaskType, string> = {
  chatbot: "Chatbot",
  rag: "RAG",
  agent: "Agent",
};

export default function TemplateDatasetsSection({
  taskType,
  selectedPresetPath,
  useBuiltin,
  datasetPromptCount,
  onSelect,
}: TemplateDatasetsSectionProps) {
  const templates = DATASET_TEMPLATES.filter((t) => t.taskType === taskType);

  return (
    <Box>
      <Typography
        sx={{
          fontSize: "12px",
          fontWeight: 600,
          color: palette.text.disabled,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          mb: 1,
        }}
      >
        Option 3: {TASK_TYPE_LABEL[taskType]} templates
      </Typography>
      <Stack spacing="8px">
        {templates.map((template) => {
          const isSelected = selectedPresetPath === template.path && useBuiltin;
          return (
            <SelectableCard
              key={template.path}
              isSelected={isSelected}
              onClick={async () => {
                try {
                  const { prompts } = await readDataset(template.path);
                  onSelect(template.path, (prompts || []) as DatasetPrompt[]);
                } catch {
                  onSelect(template.path, null);
                }
              }}
              icon={
                <Database
                  size={14}
                  color={isSelected ? palette.accent.indigo.text : palette.text.disabled}
                />
              }
              title={template.name}
              description={template.desc}
              accentColor={palette.accent.indigo.text}
              chip={
                <DatasetTypeChip
                  turnType={template.type}
                  isSelected={isSelected}
                  promptCount={datasetPromptCount}
                />
              }
            />
          );
        })}
      </Stack>
    </Box>
  );
}
