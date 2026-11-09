import React, { useCallback, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { CheckCircle, Download, Upload, X, XCircle } from "lucide-react";
import { brand, icon } from "../../../themes/palette";
import { downloadFrameworkImportTemplate } from "../../../../application/repository/frameworkImport.repository";
import { useImportFramework } from "../../../../application/hooks/useFrameworkImport";
import type {
  FrameworkImportResult,
  FrameworkImportRow,
} from "../../../../domain/interfaces/i.frameworkImport";

interface FrameworkImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

/**
 * Self-service framework import (#5254) — three-step flow cloned from the
 * risk-import modal: download template → upload + preview → import with
 * per-row error reporting. Re-importing the same framework name replaces its
 * structure (the contract is idempotent).
 */
export default function FrameworkImportModal({
  open,
  onClose,
  onImportComplete,
}: FrameworkImportModalProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<FrameworkImportRow[]>([]);
  const [importResult, setImportResult] = useState<FrameworkImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const importMutation = useImportFramework();
  const loading = importMutation.isPending;

  const handleDownloadTemplate = async () => {
    try {
      setError(null);
      const blob = await downloadFrameworkImportTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "framework_import_template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(`Failed to download template: ${err.message || "Unknown error"}`);
    }
  };

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".xlsx")) {
      setError("Please upload an Excel file (.xlsx)");
      return;
    }

    setUploadedFile(file);
    setError(null);
    setImportResult(null);

    try {
      // Loaded on demand: exceljs is only needed to parse an upload.
      const ExcelJS = await import("exceljs");
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        setError("Excel file is empty or invalid");
        setExcelData([]);
        return;
      }

      const data: FrameworkImportRow[] = [];
      const headers: string[] = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell({ includeEmpty: true }, (cell) => {
            const headerText = cell.value?.toString() || "";
            const key = headerText
              .replace(/\s*\([^)]*\)/g, "")
              .replace(/\s*\*/g, "")
              .toLowerCase()
              .trim()
              .replace(/\s+/g, "_");
            headers.push(key);
          });
        } else {
          const rowData: FrameworkImportRow = {};
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const key = headers[colNumber - 1];
            if (key) {
              (rowData as Record<string, unknown>)[key] = cell.value;
            }
          });

          const hasData = Object.values(rowData).some(
            (val) => val !== null && val !== undefined && val !== "",
          );
          if (hasData) {
            data.push(rowData);
          }
        }
      });

      setExcelData(data);
    } catch (err: any) {
      setError(`Error parsing Excel file: ${err.message}`);
      setExcelData([]);
    }
  }, []);

  const handleImport = async () => {
    if (excelData.length === 0) {
      setError("No data to import. Please upload a valid Excel file.");
      return;
    }
    setError(null);
    setImportResult(null);
    try {
      const payload = await importMutation.mutateAsync(excelData);
      setImportResult(payload);
      if (payload.success && onImportComplete) {
        setTimeout(() => {
          onImportComplete();
          onClose();
        }, 1000);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to import framework");
    }
  };

  const handleReset = () => {
    setUploadedFile(null);
    setExcelData([]);
    setImportResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: "4px",
          maxHeight: "90vh",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          pb: 1,
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Import a framework from Excel
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Download the template, describe your framework as topics and subtopics, and upload to
            add it to your organization's framework library.
          </Typography>
        </Box>
        <IconButton onClick={handleClose} size="small" sx={{ color: icon.default, mt: -0.5 }}>
          <X size={20} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {importResult && (
          <Alert
            severity={importResult.success ? "success" : "warning"}
            sx={{ mb: 3 }}
            icon={importResult.success ? <CheckCircle /> : <XCircle />}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Import {importResult.success ? "completed" : "completed with errors"}
            </Typography>
            <Typography variant="body2">
              Topics imported: {importResult.imported_topics} | Subtopics imported:{" "}
              {importResult.imported_subtopics}
              {importResult.failed > 0 && ` | Failed rows: ${importResult.failed}`}
            </Typography>

            {importResult.errors && importResult.errors.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Error details:
                </Typography>
                <TableContainer component={Paper} sx={{ maxHeight: 200 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Row</TableCell>
                        <TableCell>Field</TableCell>
                        <TableCell>Error</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {importResult.errors.slice(0, 10).map((err, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{err.row}</TableCell>
                          <TableCell>{err.field}</TableCell>
                          <TableCell>{err.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {importResult.errors.length > 10 && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                    Showing first 10 of {importResult.errors.length} errors
                  </Typography>
                )}
              </Box>
            )}
          </Alert>
        )}

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Step 1: Download the Excel template
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              One row per subtopic. Leave the subtopic columns empty on a row to create a topic
              without subtopics.
            </Typography>
            <Button
              variant="outlined"
              startIcon={<Download size={16} />}
              onClick={handleDownloadTemplate}
              disabled={loading}
            >
              Download template
            </Button>
          </CardContent>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Step 2: Upload the filled Excel file
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              All rows must describe the same framework. Re-uploading a framework name replaces its
              previous structure.
            </Typography>

            <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
              <Button variant="outlined" component="label" startIcon={<Upload size={16} />}>
                Choose file
                <input
                  type="file"
                  hidden
                  accept=".xlsx"
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                />
              </Button>

              {uploadedFile && (
                <Chip
                  label={uploadedFile.name}
                  onDelete={handleReset}
                  color="primary"
                  variant="outlined"
                />
              )}
            </Box>

            {excelData.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                  Preview ({excelData.length} row(s) found):
                </Typography>
                <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>Framework</TableCell>
                        <TableCell>Topic</TableCell>
                        <TableCell>Subtopic</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {excelData.slice(0, 5).map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell>{row.framework_name || "-"}</TableCell>
                          <TableCell>
                            {row.topic_number ? `${row.topic_number} ${row.topic_name || ""}` : "-"}
                          </TableCell>
                          <TableCell>
                            {row.subtopic_number
                              ? `${row.subtopic_number} ${row.subtopic_name || ""}`
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {excelData.length > 5 && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1, display: "block" }}
                  >
                    Showing first 5 of {excelData.length} rows
                  </Typography>
                )}
              </Box>
            )}
          </CardContent>
        </Card>

        <Card sx={{ opacity: excelData.length > 0 ? 1 : 0.5 }}>
          <CardContent>
            <Typography
              variant="h6"
              sx={{ mb: 2, color: excelData.length > 0 ? "inherit" : "text.disabled" }}
            >
              Step 3: Import framework
            </Typography>
            <Typography
              variant="body2"
              sx={{ mb: 2, color: excelData.length > 0 ? "text.secondary" : "text.disabled" }}
            >
              {excelData.length > 0
                ? "Review the preview above and click Import to add the framework to your library."
                : "Upload an Excel file first to enable import."}
            </Typography>

            <Box sx={{ display: "flex", gap: 2 }}>
              <Button
                variant="contained"
                onClick={handleImport}
                disabled={loading || excelData.length === 0}
                startIcon={
                  loading ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <CheckCircle size={16} />
                  )
                }
                sx={{
                  "backgroundColor": brand.primary,
                  "&:hover": {
                    backgroundColor: brand.primaryHover,
                  },
                }}
              >
                {loading ? "Importing..." : "Import framework"}
              </Button>

              <Button
                variant="outlined"
                onClick={handleReset}
                disabled={loading || excelData.length === 0}
              >
                Reset
              </Button>
            </Box>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
