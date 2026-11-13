/**
 * @fileoverview Compact drop-zone for uploading a custom dataset JSON file.
 *
 * @module pages/EvalsDashboard/NewExperiment/DatasetUploadZone
 */

import { Box, Typography } from "@mui/material";
import SectionLabel from "./SectionLabel";
import { Upload } from "lucide-react";
import { palette, radiusPx } from "../../../themes/palette";
import { readDataset, uploadDataset } from "../../../../application/repository/deepEval.repository";
import type { DatasetPrompt, UserDataset } from "./newExperimentConfig";
import { validateDatasetFileContent } from "./datasetUpload";

export interface DatasetUploadZoneProps {
  uploading: boolean;
  orgId?: string | null;
  onUploadingChange: (uploading: boolean) => void;
  onAlert: (alert: {
    variant: "success" | "error" | "info" | "warning";
    title: string;
    body: string;
    autoHideMs: number;
  }) => void;
  /**
   * Called after a successful upload. `prompts` is null when the follow-up
   * read fails (selection still updates; loaded flag is left alone).
   */
  onUploadComplete: (dataset: UserDataset, prompts: DatasetPrompt[] | null) => void;
}

export default function DatasetUploadZone({
  uploading,
  orgId,
  onUploadingChange,
  onAlert,
  onUploadComplete,
}: DatasetUploadZoneProps) {
  return (
    <Box>
      <SectionLabel>Upload a dataset</SectionLabel>
      <Box
        component="label"
        sx={{
          "display": "flex",
          "alignItems": "center",
          "gap": "8px",
          "p": "8px",
          "border": "1px dashed",
          "borderColor": uploading ? palette.brand.primary : palette.border.dark,
          "borderRadius": radiusPx.sm,
          "backgroundColor": palette.background.accent,
          "cursor": uploading ? "wait" : "pointer",
          "transition": "all 0.15s ease",
          "&:hover": {
            borderColor: palette.brand.primary,
            backgroundColor: palette.status.success.bg,
          },
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: "6px",
            backgroundColor: palette.brand.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Upload size={16} color={palette.background.main} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary }}>
            {uploading ? "Uploading..." : "Upload dataset"}
          </Typography>
          <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
            JSON file with prompts and expected outputs
          </Typography>
        </Box>
        <input
          type="file"
          accept="application/json"
          hidden
          disabled={uploading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              onUploadingChange(true);
              const fileContent = await file.text();
              const validation = validateDatasetFileContent(fileContent);
              if (!validation.ok) {
                onAlert({
                  variant: "error",
                  title: validation.title,
                  body: validation.body,
                  autoHideMs: 15000,
                });
                return;
              }
              const resp = await uploadDataset(file, "chatbot", "single-turn", orgId || undefined);
              const newDataset: UserDataset = {
                id: resp.path,
                name: file.name.replace(/\.json$/i, ""),
                path: resp.path,
                promptCount: validation.validPromptCount,
              };
              try {
                const { prompts } = await readDataset(resp.path);
                onUploadComplete(newDataset, (prompts || []) as DatasetPrompt[]);
              } catch {
                onUploadComplete(newDataset, null);
              }
              onAlert({
                variant: "success",
                title: "Uploaded!",
                body: `${file.name} is ready to use`,
                autoHideMs: 5000,
              });
            } catch (err) {
              onAlert({
                variant: "error",
                title: "Upload failed",
                body: err instanceof Error ? err.message : "Failed to upload",
                autoHideMs: 15000,
              });
            } finally {
              onUploadingChange(false);
              e.target.value = "";
            }
          }}
        />
      </Box>
    </Box>
  );
}
