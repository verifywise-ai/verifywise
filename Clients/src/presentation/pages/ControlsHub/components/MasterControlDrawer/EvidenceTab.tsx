/**
 * Controls Hub — Master Control Drawer, Evidence tab.
 *
 * Lets users attach real files (upload from device) and already-uploaded
 * files go through two steps under the hood:
 *
 *   1. POST /file-manager            → stores the file, returns id
 *   2. POST /files/attach-bulk       → links file_id ↔ master_control
 *
 * Listing uses GET /files/entity/master_control/master_control/:id and
 * removal uses DELETE /files/detach. The same framework_type/entity_type
 * strings are used throughout so the generic file-entity-links system can
 * treat master controls the same as any other entity.
 *
 * Propagation intentionally does NOT copy files to mapped framework rows.
 * Master-level evidence lives on the master; framework-level evidence
 * still goes on the individual requirement row.
 */
import { useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { Download, Plus, Trash2 } from "lucide-react";

import { CustomizableButton } from "../../../../components/button/customizable-button";
import {
  attachFilesToEntity,
  detachFileFromEntity,
  downloadFileFromManager,
  getEntityFiles,
  uploadFileToManager,
} from "../../../../../application/repository/file.repository";
import type { MasterControlModel } from "../../../../../domain/models/Common/masterControl/masterControl.model";

interface EvidenceTabProps {
  master: MasterControlModel;
}

const FRAMEWORK_KEY = "master_control" as const;
const ENTITY_KEY = "master_control" as const;

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

export default function EvidenceTab({ master }: EvidenceTabProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const filesQueryKey = ["masterControls", "evidence", master.id] as const;

  const {
    data: files,
    isLoading,
    error,
  } = useQuery({
    queryKey: filesQueryKey,
    enabled: typeof master.id === "number" && master.id > 0,
    queryFn: async () => {
      if (!master.id) return [];
      return getEntityFiles(FRAMEWORK_KEY, ENTITY_KEY, master.id);
    },
    staleTime: 30 * 1000,
  });

  const upload = useMutation({
    mutationFn: async (picked: File[]) => {
      if (!master.id) throw new Error("Master control id is missing.");
      const uploaded: number[] = [];
      for (const file of picked) {
        const response = await uploadFileToManager({
          file,
          source: "evidence",
        });
        const id = Number((response as any)?.data?.id ?? (response as any)?.id);
        if (Number.isFinite(id) && id > 0) uploaded.push(id);
      }
      if (uploaded.length === 0) return { attached: 0 };
      await attachFilesToEntity({
        file_ids: uploaded,
        framework_type: FRAMEWORK_KEY,
        entity_type: ENTITY_KEY,
        entity_id: master.id,
        link_type: "evidence",
      });
      return { attached: uploaded.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: filesQueryKey });
      setUploadError(null);
    },
    onError: (err) => {
      setUploadError(
        err instanceof Error ? err.message : "Failed to upload file."
      );
    },
  });

  const detach = useMutation({
    mutationFn: async (fileId: number) => {
      if (!master.id) throw new Error("Master control id is missing.");
      return detachFileFromEntity({
        file_id: fileId,
        framework_type: FRAMEWORK_KEY,
        entity_type: ENTITY_KEY,
        entity_id: master.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: filesQueryKey });
    },
  });

  const handlePick = () => inputRef.current?.click();

  const handleFilesChosen = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setUploadError(null);
    const picked = Array.from(event.target.files ?? []);
    // Reset the input so the same file can be re-selected after a failed
    // upload without needing to close and reopen the picker.
    event.target.value = "";
    if (picked.length === 0) return;
    await upload.mutateAsync(picked).catch(() => {
      /* error surfaced via mutation's onError handler */
    });
  };

  const handleDownload = async (fileId: string, filename: string) => {
    try {
      const blob = await downloadFileFromManager({ id: fileId });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Failed to download file."
      );
    }
  };

  if (isLoading) {
    return (
      <Stack alignItems="center" sx={{ padding: 4 }}>
        <CircularProgress size={20} />
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ fontSize: 13 }}>
        Failed to load evidence.
      </Alert>
    );
  }

  const rows = files ?? [];
  const disabled = master.is_demo;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography fontSize={13} fontWeight={600}>
          Evidence files
        </Typography>
        <Typography
          fontSize={12}
          color={theme.palette.text.tertiary}
          sx={{ marginTop: 0.5 }}
        >
          Attach documents, screenshots, or audit artefacts that support this
          master control. Files live on the master — they do not auto-copy to
          mapped framework rows.
        </Typography>
      </Box>

      {uploadError && (
        <Alert severity="error" sx={{ fontSize: 12 }}>
          {uploadError}
        </Alert>
      )}

      <Stack direction="row" spacing={1.5}>
        <CustomizableButton
          variant="contained"
          text={upload.isPending ? "Uploading…" : "Upload files"}
          icon={<Plus size={14} />}
          onClick={handlePick}
          isDisabled={disabled || upload.isPending}
          sx={{ height: 34, minWidth: 150 }}
        />
        <Typography
          fontSize={12}
          color={theme.palette.text.tertiary}
          alignSelf="center"
        >
          {rows.length === 0
            ? "No evidence attached yet."
            : `${rows.length} file${rows.length === 1 ? "" : "s"} attached.`}
        </Typography>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={handleFilesChosen}
        />
      </Stack>

      {rows.length > 0 && (
        <Stack
          divider={
            <Box
              sx={{
                height: "1px",
                backgroundColor: theme.palette.border.light,
              }}
            />
          }
          sx={{
            border: `1px solid ${theme.palette.border.light}`,
            borderRadius: 1,
          }}
        >
          {rows.map((file) => {
            const idNum = Number(file.id);
            return (
              <Stack
                key={file.id}
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ padding: "10px 14px" }}
              >
                <Stack sx={{ minWidth: 0 }}>
                  <Typography
                    fontSize={13}
                    fontWeight={500}
                    sx={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {file.filename}
                  </Typography>
                  <Typography
                    fontSize={11}
                    color={theme.palette.text.tertiary}
                    sx={{ marginTop: 0.25 }}
                  >
                    {file.uploader_name
                      ? `Uploaded by ${file.uploader_name}`
                      : file.uploader
                      ? `Uploaded by ${file.uploader}`
                      : "Uploaded"}
                    {file.size ? ` · ${formatBytes(file.size)}` : ""}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Download">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => handleDownload(file.id, file.filename)}
                        aria-label={`Download ${file.filename}`}
                      >
                        <Download size={16} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip
                    title={disabled ? "Cannot modify" : "Remove evidence"}
                  >
                    <span>
                      <IconButton
                        size="small"
                        disabled={
                          disabled ||
                          detach.isPending ||
                          !Number.isFinite(idNum)
                        }
                        onClick={() => detach.mutate(idNum)}
                        aria-label={`Remove ${file.filename}`}
                      >
                        <Trash2
                          size={16}
                          color={theme.palette.status.error.text}
                        />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Stack>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
