import {
  Box,
  Typography,
  Stack,
  LinearProgress,
  Chip,
} from "@mui/material";
import { keyframes } from "@mui/system";
import { CheckCircle2, XCircle, Loader2, FileSpreadsheet } from "lucide-react";
import { brand, text } from "../../../themes/palette";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

export type FileUploadStatus = "pending" | "uploading" | "success" | "error";

export interface FileUploadResult {
  fileName: string;
  status: FileUploadStatus;
  error?: string;
  datasetId?: number;
  fileId?: number;
}

interface UploadProgressProps {
  results: FileUploadResult[];
  totalFiles: number;
}

export default function UploadProgress({
  results,
  totalFiles,
}: UploadProgressProps) {
  const completed = results.filter(
    (r) => r.status === "success" || r.status === "error"
  ).length;
  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const progress = totalFiles > 0 ? (completed / totalFiles) * 100 : 0;
  const isComplete = completed === totalFiles;

  return (
    <Stack spacing={2}>
      {/* Overall progress */}
      <Box>
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 500, color: "text.secondary" }}>
            {isComplete
              ? "Upload complete"
              : `Uploading ${completed + 1} of ${totalFiles}...`}
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.tertiary" }}>
            {completed}/{totalFiles}
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 6,
            borderRadius: "3px",
            backgroundColor: "#E0E4E9",
            "& .MuiLinearProgress-bar": {
              backgroundColor: errorCount > 0 ? "#DC6803" : "brand.primary",
              borderRadius: "3px",
            },
          }}
        />
      </Box>

      {/* Summary chips */}
      {isComplete && (
        <Stack direction="row" spacing={1}>
          <Chip
            icon={<CheckCircle2 size={14} />}
            label={`${successCount} succeeded`}
            size="small"
            variant="outlined"
            sx={{
              color: "#079455",
              borderColor: "#17B26A",
              backgroundColor: "#ECFDF3",
              "& .MuiChip-icon": { color: "#079455" },
            }}
          />
          {errorCount > 0 && (
            <Chip
              icon={<XCircle size={14} />}
              label={`${errorCount} failed`}
              size="small"
              variant="outlined"
              sx={{
                color: "#F04438",
                borderColor: "#FDA29B",
                backgroundColor: "#F9ECED",
                "& .MuiChip-icon": { color: "#F04438" },
              }}
            />
          )}
        </Stack>
      )}

      {/* Per-file status */}
      <Stack spacing="6px">
        {results.map((result) => (
          <Stack
            key={result.fileName}
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              p: "10px 12px",
              borderRadius: "6px",
              backgroundColor:
                result.status === "error"
                  ? "#F9ECED"
                  : result.status === "success"
                    ? "#ECFDF3"
                    : "background.accent",
            }}
          >
            <FileSpreadsheet size={16} color={text.icon} />
            <Typography sx={{ flex: 1, fontSize: 13, color: "text.secondary" }}>
              {result.fileName}
            </Typography>
            {result.status === "pending" && (
              <Typography sx={{ fontSize: 12, color: "text.tertiary" }}>
                Waiting...
              </Typography>
            )}
            {result.status === "uploading" && (
              <Loader2
                size={16}
                color={brand.primary}
                style={{ animation: `${spin} 1s linear infinite` }}
              />
            )}
            {result.status === "success" && (
              <CheckCircle2 size={16} color="#079455" />
            )}
            {result.status === "error" && (
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <XCircle size={16} color="#F04438" />
                <Typography sx={{ fontSize: 12, color: "#F04438" }}>
                  {result.error || "Failed"}
                </Typography>
              </Stack>
            )}
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
