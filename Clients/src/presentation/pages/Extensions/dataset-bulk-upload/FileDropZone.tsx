import { Fragment, useCallback, useRef, useState } from "react";
import { Box, Typography, Stack, IconButton, Alert } from "@mui/material";
import { Upload, X, FileSpreadsheet } from "lucide-react";
import { brand, text, palette as vwPalette, radiusPx } from "../../../themes/palette";

const MAX_FILES = 20;
const MAX_SIZE = 30 * 1024 * 1024; // 30MB
const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(name: string): string {
  return name.substring(name.lastIndexOf(".")).toLowerCase();
}

interface FileDropZoneProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

export default function FileDropZone({ files, onFilesChange }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  // Each problem keeps the file name apart from the static message, so the
  // message translates as a whole.
  const [validationErrors, setValidationErrors] = useState<
    { fileName?: string; message: string }[] | null
  >(null);

  const validateAndAdd = useCallback(
    (incoming: File[]) => {
      setValidationErrors(null);
      const errors: { fileName?: string; message: string }[] = [];
      const valid: File[] = [];

      for (const file of incoming) {
        const ext = getExtension(file.name);
        if (!ACCEPTED_EXTENSIONS.includes(ext)) {
          errors.push({ fileName: file.name, message: "unsupported type (only CSV, XLSX, XLS)" });
          continue;
        }
        if (file.size > MAX_SIZE) {
          errors.push({ fileName: file.name, message: "exceeds 30MB limit" });
          continue;
        }
        valid.push(file);
      }

      const total = files.length + valid.length;
      if (total > MAX_FILES) {
        // Static text: keep the number in step with MAX_FILES.
        errors.push({ message: "Maximum 20 files allowed. Extra files were not added." });
        valid.splice(MAX_FILES - files.length);
      }

      if (errors.length > 0) {
        setValidationErrors(errors);
      }

      if (valid.length > 0) {
        const existingNames = new Set(files.map((f) => f.name));
        const newFiles = valid.filter((f) => !existingNames.has(f.name));
        onFilesChange([...files, ...newFiles]);
      }
    },
    [files, onFilesChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      validateAndAdd(droppedFiles);
    },
    [validateAndAdd],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        validateAndAdd(Array.from(e.target.files));
        e.target.value = "";
      }
    },
    [validateAndAdd],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onFilesChange(files.filter((_, i) => i !== index));
    },
    [files, onFilesChange],
  );

  return (
    <Stack spacing={2}>
      {/* Drop zone */}
      <Box
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        sx={{
          "border": "1.5px dashed",
          "borderColor": dragOver ? "brand.primary" : "border.dark",
          "borderRadius": radiusPx.lg,
          "p": "32px",
          "textAlign": "center",
          "cursor": "pointer",
          "backgroundColor": dragOver ? vwPalette.background.hover : vwPalette.background.main,
          "transition": "all 0.2s",
          "&:hover": { borderColor: "brand.primary", backgroundColor: vwPalette.background.hover },
        }}
      >
        <Upload size={32} color={text.icon} />
        <Typography
          sx={{
            mt: 1,
            fontSize: 13,
            fontWeight: 500,
            color: "text.secondary",
          }}
        >
          Drag & drop files here, or click to browse
        </Typography>
        <Typography
          sx={{
            fontSize: 12,
            color: "text.tertiary",
          }}
        >
          CSV, XLSX, XLS — max {MAX_FILES} files, {formatSize(MAX_SIZE)} each
        </Typography>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          onChange={handleInputChange}
          style={{ display: "none" }}
        />
      </Box>

      {validationErrors && (
        <Alert severity="warning" onClose={() => setValidationErrors(null)}>
          {validationErrors.map((e, i) => (
            <Fragment key={i}>
              {i > 0 && "; "}
              {e.fileName && `${e.fileName}: `}
              {e.message}
            </Fragment>
          ))}
        </Alert>
      )}

      {/* File list */}
      {files.length > 0 && (
        <Stack spacing="8px">
          <Typography sx={{ fontSize: 13, fontWeight: 500, color: "text.secondary" }}>
            {files.length} file{files.length !== 1 ? "s" : ""} selected
          </Typography>
          {files.map((file, index) => (
            <Stack
              key={file.name}
              direction="row"
              alignItems="center"
              sx={{
                p: "8px 12px",
                borderRadius: radiusPx.md,
                backgroundColor: "background.accent",
                gap: "8px",
              }}
            >
              <FileSpreadsheet size={18} color={brand.primary} />
              <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 400, color: "text.secondary" }}>
                {file.name}
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.tertiary" }}>
                {formatSize(file.size)}
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.tertiary" }}>
                {getExtension(file.name).replace(".", "").toUpperCase()}
              </Typography>
              <IconButton size="small" onClick={() => handleRemove(index)}>
                <X size={14} />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
