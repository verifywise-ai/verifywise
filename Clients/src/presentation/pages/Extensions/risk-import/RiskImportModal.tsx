import React, { useState, useCallback } from "react";
import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Card,
  CardContent,
  Paper,
} from "@mui/material";
import { Download, Upload, CheckCircle, XCircle, X } from "lucide-react";
import * as ExcelJS from "exceljs";
import { apiServices } from "../../../../infrastructure/api/networkServices";

interface RiskImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: Array<{ row: number; field: string; message: string }>;
  importedAt: string;
}

export default function RiskImportModal({ open, onClose, onImportComplete }: RiskImportModalProps) {
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<any[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiServices.get("/extensions/risk-import/template", {
        responseType: "blob",
      });

      const blob = new Blob([response.data as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "risk_import_template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(`Failed to download template: ${err.message || "Unknown error"}`);
    } finally {
      setLoading(false);
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
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        setError("Excel file is empty or invalid");
        setExcelData([]);
        return;
      }

      const data: any[] = [];
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
          const rowData: any = {};
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const key = headers[colNumber - 1];
            if (key) {
              rowData[key] = cell.value;
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

    try {
      setLoading(true);
      setError(null);
      setImportResult(null);

      const response = await apiServices.post("/extensions/risk-import/import", {
        csvData: excelData,
      });

      const payload = (response.data as any)?.data as ImportResult | undefined;
      if (payload) {
        setImportResult(payload);

        if (payload.success && onImportComplete) {
          setTimeout(() => {
            onImportComplete();
            onClose();
          }, 1000);
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to import risks");
    } finally {
      setLoading(false);
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
            Import Risks from Excel
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Download the template, fill it with your risk data, and upload to create risks in bulk
          </Typography>
        </Box>
        <IconButton onClick={handleClose} size="small" sx={{ color: "#98A2B3", mt: -0.5 }}>
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
              Import {importResult.success ? "Completed" : "Completed with Errors"}
            </Typography>
            <Typography variant="body2">
              Successfully imported: {importResult.imported} risk(s)
              {importResult.failed > 0 && ` | Failed: ${importResult.failed} risk(s)`}
            </Typography>

            {importResult.errors && importResult.errors.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Error Details:
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
              Step 1: Download Excel Template
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Download the Excel template with dropdown menus for enum fields and sample data.
            </Typography>
            <Button
              variant="outlined"
              startIcon={<Download size={16} />}
              onClick={handleDownloadTemplate}
              disabled={loading}
            >
              Download Template
            </Button>
          </CardContent>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Step 2: Upload Filled Excel File
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Upload your Excel file with risk data.
            </Typography>

            <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
              <Button variant="outlined" component="label" startIcon={<Upload size={16} />}>
                Choose File
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
                  Preview ({excelData.length} risk(s) found):
                </Typography>
                <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>Risk Name</TableCell>
                        <TableCell>Owner</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell>Lifecycle Phase</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {excelData.slice(0, 5).map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell>{row.risk_name || "-"}</TableCell>
                          <TableCell>{row.risk_owner || "-"}</TableCell>
                          <TableCell
                            sx={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}
                          >
                            {row.risk_description || "-"}
                          </TableCell>
                          <TableCell>{row.ai_lifecycle_phase || "-"}</TableCell>
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
                    Showing first 5 of {excelData.length} risks
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
              Step 3: Import Risks
            </Typography>
            <Typography
              variant="body2"
              sx={{ mb: 2, color: excelData.length > 0 ? "text.secondary" : "text.disabled" }}
            >
              {excelData.length > 0
                ? "Review the preview above and click Import to create the risks."
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
                  "backgroundColor": "#13715B",
                  "&:hover": {
                    backgroundColor: "#0F5A47",
                  },
                }}
              >
                {loading ? "Importing..." : "Import Risks"}
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
