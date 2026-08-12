/**
 * @fileoverview "Option 2: Your datasets" list for the Dataset wizard step.
 *
 * @module pages/EvalsDashboard/NewExperiment/MyDatasetsSection
 */

import { Box, Button, Stack, Typography } from "@mui/material";
import { Database, ExternalLink } from "lucide-react";
import SelectableCard from "../../../components/SelectableCard";
import { palette } from "../../../themes/palette";
import { readDataset } from "../../../../application/repository/deepEval.repository";
import type { DatasetPrompt, UserDataset } from "./newExperimentConfig";
import DatasetTypeChip from "./DatasetTypeChip";

export interface MyDatasetsSectionProps {
  projectId: string;
  loading: boolean;
  userDatasets: UserDataset[];
  selectedUserDataset: UserDataset | null;
  useBuiltin: boolean;
  datasetPromptCount: number;
  /**
   * `prompts` is null when the dataset read fails (selection still updates;
   * loaded flag is left alone — matches prior modal behavior).
   */
  onSelect: (dataset: UserDataset, prompts: DatasetPrompt[] | null) => void;
}

export default function MyDatasetsSection({
  projectId,
  loading,
  userDatasets,
  selectedUserDataset,
  useBuiltin,
  datasetPromptCount,
  onSelect,
}: MyDatasetsSectionProps) {
  if (loading) {
    return (
      <Box sx={{ py: 2, textAlign: "center" }}>
        <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
          Loading your datasets...
        </Typography>
      </Box>
    );
  }

  if (userDatasets.length === 0) return null;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography
          sx={{
            fontSize: "12px",
            fontWeight: 600,
            color: palette.text.disabled,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Option 2: Your datasets
        </Typography>
        <Button
          size="small"
          variant="text"
          startIcon={<ExternalLink size={12} />}
          onClick={() => window.open(`/evals/${projectId}#datasets`, "_blank")}
          sx={{
            "textTransform": "none",
            "fontSize": "11px",
            "color": palette.text.tertiary,
            "p": 0.5,
            "minWidth": "auto",
            "&:hover": { color: palette.brand.primary },
          }}
        >
          Manage
        </Button>
      </Stack>
      <Stack spacing="8px">
        {userDatasets.slice(0, 4).map((dataset) => {
          const isSelected = selectedUserDataset?.id === dataset.id && !useBuiltin;
          const isEmpty = dataset.promptCount === 0;
          return (
            <SelectableCard
              key={dataset.id}
              isSelected={isSelected}
              disabled={isEmpty}
              onClick={async () => {
                if (isEmpty) return;
                try {
                  const { prompts } = await readDataset(dataset.path);
                  onSelect(dataset, (prompts || []) as DatasetPrompt[]);
                } catch {
                  onSelect(dataset, null);
                }
              }}
              icon={
                <Database
                  size={14}
                  color={
                    isEmpty
                      ? palette.status.error.text
                      : isSelected
                        ? palette.brand.primary
                        : palette.text.disabled
                  }
                />
              }
              title={dataset.name}
              description={isEmpty ? "Cannot use empty dataset" : "Custom uploaded dataset"}
              chip={
                <DatasetTypeChip
                  turnType={dataset.turnType}
                  isSelected={isSelected}
                  promptCount={datasetPromptCount}
                  isEmpty={isEmpty}
                />
              }
            />
          );
        })}
      </Stack>
    </Box>
  );
}
