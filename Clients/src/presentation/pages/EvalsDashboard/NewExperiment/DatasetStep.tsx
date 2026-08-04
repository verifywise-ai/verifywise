/**
 * @fileoverview Dataset wizard step — upload, my datasets, and templates.
 *
 * Parent owns all dataset state; this step only renders and fires callbacks.
 *
 * @module pages/EvalsDashboard/NewExperiment/DatasetStep
 */

import { Stack, Typography } from "@mui/material";
import { palette } from "../../../themes/palette";
import type { DatasetPrompt, TaskType, UserDataset } from "./newExperimentConfig";
import DatasetUploadZone from "./DatasetUploadZone";
import MyDatasetsSection from "./MyDatasetsSection";
import TemplateDatasetsSection from "./TemplateDatasetsSection";

export interface DatasetStepProps {
  taskType: TaskType;
  useBuiltin: boolean;
  userDatasets: UserDataset[];
  selectedUserDataset: UserDataset | null;
  loadingUserDatasets: boolean;
  uploadingDataset: boolean;
  selectedPresetPath: string;
  datasetPromptCount: number;
  orgId?: string | null;
  projectId: string;
  onUploadingChange: (uploading: boolean) => void;
  onAlert: (alert: {
    variant: "success" | "error" | "info" | "warning";
    title: string;
    body: string;
    autoHideMs: number;
  }) => void;
  onUploadComplete: (dataset: UserDataset, prompts: DatasetPrompt[] | null) => void;
  onUserDatasetSelect: (dataset: UserDataset, prompts: DatasetPrompt[] | null) => void;
  onPresetSelect: (path: string, prompts: DatasetPrompt[] | null) => void;
}

export default function DatasetStep({
  taskType,
  useBuiltin,
  userDatasets,
  selectedUserDataset,
  loadingUserDatasets,
  uploadingDataset,
  selectedPresetPath,
  datasetPromptCount,
  orgId,
  projectId,
  onUploadingChange,
  onAlert,
  onUploadComplete,
  onUserDatasetSelect,
  onPresetSelect,
}: DatasetStepProps) {
  return (
    <Stack spacing="16px">
      <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, lineHeight: 1.5 }}>
        Choose a dataset containing prompts and expected outputs. Upload your own JSON file, select
        from saved datasets, or use a template.
      </Typography>

      <DatasetUploadZone
        uploading={uploadingDataset}
        orgId={orgId}
        onUploadingChange={onUploadingChange}
        onAlert={onAlert}
        onUploadComplete={onUploadComplete}
      />

      <MyDatasetsSection
        projectId={projectId}
        loading={loadingUserDatasets}
        userDatasets={userDatasets}
        selectedUserDataset={selectedUserDataset}
        useBuiltin={useBuiltin}
        datasetPromptCount={datasetPromptCount}
        onSelect={onUserDatasetSelect}
      />

      <TemplateDatasetsSection
        taskType={taskType}
        selectedPresetPath={selectedPresetPath}
        useBuiltin={useBuiltin}
        datasetPromptCount={datasetPromptCount}
        onSelect={onPresetSelect}
      />
    </Stack>
  );
}
