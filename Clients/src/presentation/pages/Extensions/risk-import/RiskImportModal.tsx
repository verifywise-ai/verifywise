import React, { type ReactNode, useState, useCallback } from "react";
import {
  Box,
  Typography,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Card,
  CardContent,
  Paper,
} from "@mui/material";
import { Download, Upload, CheckCircle, XCircle } from "lucide-react";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import StandardModal from "../../../components/Modals/StandardModal";
import { CustomizableButton } from "../../../components/button/customizable-button";

/**
 * Most rows one import may hold. Mirrors MAX_IMPORT_ROWS in
 * Servers/extensions/importLimits.ts, which stays the backstop; a larger file
 * is refused here without a request.
 */
export const MAX_RISK_IMPORT_ROWS = 5000;

// A full static sentence for the DOM translator; the number matches
// MAX_RISK_IMPORT_ROWS (a test checks it).
export const TOO_MANY_ROWS_MESSAGE =
  "This file has more than 5000 rows. Split it into smaller files and import each one.";

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

/**
 * The import result the server sends with a 400 when rows fail validation or
 * insert (`riskImport.ctrl.ts`: STATUS_CODE[400](result)), or with the
 * row-cap error. `apiServices` throws a CustomException whose `response` is
 * the `{ message, data }` envelope, so the result is `response.data`; a raw
 * axios error has it one level deeper, under `response.data.data`.
 */
/**
 * A server error about the whole file (the row cap) comes as row 0, field
 * "file". It is a message for the file, not a row in the error table.
 */
const isFileError = (e: { row: number; field: string }) => e.row === 0 && e.field === "file";

function importResultFromError(err: any): ImportResult | null {
  const candidates = [err?.response?.data, err?.response?.data?.data];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && Array.isArray(candidate.errors)) {
      return candidate as ImportResult;
    }
  }
  return null;
}

export default function RiskImportModal({ open, onClose, onImportComplete }: RiskImportModalProps) {
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<any[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  // A cause from the parser or server is its own text node, apart from the
  // static prefix, so the prefix translates.
  const [error, setError] = useState<ReactNode>(null);
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
      setError(
        <>
          {"Failed to download template: "}
          {err.message || "Unknown error"}
        </>,
      );
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
      // Loaded on demand: exceljs is ~280 KiB gz, only needed to parse an upload.
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
      setError(
        <>
          {"Error parsing Excel file: "}
          {err.message}
        </>,
      );
      setExcelData([]);
    }
  }, []);

  const handleImport = async () => {
    if (excelData.length === 0) {
      setError("No data to import. Please upload a valid Excel file.");
      return;
    }
    if (excelData.length > MAX_RISK_IMPORT_ROWS) {
      setImportResult(null);
      setError(TOO_MANY_ROWS_MESSAGE);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setImportResult(null);

      // This modal shows the server's answer itself (row errors or message),
      // so the global error toast would repeat it.
      const response = await apiServices.post(
        "/extensions/risk-import/import",
        { csvData: excelData },
        { suppressGlobalErrorToast: true },
      );

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
      const rowResult = importResultFromError(err);
      const fileErrors = rowResult?.errors.filter(isFileError) ?? [];
      if (fileErrors.length > 0) {
        setError(fileErrors.map((e) => e.message).join(" "));
      } else if (rowResult) {
        setImportResult(rowResult);
      } else {
        setError(err?.message || "Failed to import risks");
      }
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
    // Cancel, the close icon and Escape wait for an import in flight, so the
    // outcome is not lost.
    if (loading) return;
    handleReset();
    onClose();
  };

  return (
    <StandardModal
      isOpen={open}
      onClose={handleClose}
      title="Import risks from Excel"
      description="Download the template, fill it with your risk data, and upload to create risks in bulk"
      onSubmit={handleImport}
      submitButtonText={loading ? "Importing..." : "Import risks"}
      isSubmitting={loading}
      isSubmitDisabled={excelData.length === 0}
      maxWidth="900px"
    >
      {error && (
        <Alert severity="error" sx={{ mb: "6px" }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {importResult && (
        <Alert
          severity={importResult.success ? "success" : "warning"}
          sx={{ mb: "6px" }}
          icon={importResult.success ? <CheckCircle /> : <XCircle />}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, mb: "2px" }}>
            {importResult.success ? "Import completed" : "Import completed with errors"}
          </Typography>
          <Typography variant="body2">
            {"Successfully imported: "}
            {importResult.imported} risk(s)
            {importResult.failed > 0 && (
              <>
                {" | "}
                {"Failed: "}
                {importResult.failed} risk(s)
              </>
            )}
          </Typography>

          {importResult.errors && importResult.errors.length > 0 && (
            <Box sx={{ mt: "4px" }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: "2px" }}>
                Error details
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
                <Typography variant="caption" color="text.secondary" sx={{ mt: "2px" }}>
                  Showing first 10 of {importResult.errors.length} errors
                </Typography>
              )}
            </Box>
          )}
        </Alert>
      )}

      <Card sx={{ mb: "6px" }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: "4px" }}>
            Step 1: Download the Excel template
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: "4px" }}>
            Download the Excel template with dropdown menus for enum fields and sample data.
          </Typography>
          <CustomizableButton
            variant="outlined"
            icon={<Download size={16} />}
            text="Download template"
            onClick={handleDownloadTemplate}
            isDisabled={loading}
            testId="risk-import-download-template"
          />
        </CardContent>
      </Card>

      <Card sx={{ mb: "6px" }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: "4px" }}>
            Step 2: Upload the filled Excel file
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: "4px" }}>
            Upload your Excel file with risk data.
          </Typography>

          <Box sx={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <CustomizableButton
              variant="outlined"
              icon={<Upload size={16} />}
              text="Choose file"
              onClick={() => fileInputRef.current?.click()}
              isDisabled={loading}
              testId="risk-import-choose-file"
            />
            <input
              type="file"
              hidden
              accept=".xlsx"
              onChange={handleFileUpload}
              ref={fileInputRef}
              data-testid="risk-import-file-input"
            />

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
            <Box sx={{ mt: "6px" }}>
              <Typography variant="body2" sx={{ mb: "2px", fontWeight: 600 }}>
                Preview ({excelData.length} risk(s) found):
              </Typography>
              <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Risk name</TableCell>
                      <TableCell>Owner</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell>Lifecycle phase</TableCell>
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
                  sx={{ mt: "2px", display: "block" }}
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
            sx={{ mb: "4px", color: excelData.length > 0 ? "inherit" : "text.disabled" }}
          >
            Step 3: Import risks
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: excelData.length > 0 ? "text.secondary" : "text.disabled" }}
          >
            {excelData.length > 0
              ? "Review the preview above, then select Import risks to create them."
              : "Upload an Excel file first to enable import."}
          </Typography>
        </CardContent>
      </Card>
    </StandardModal>
  );
}
