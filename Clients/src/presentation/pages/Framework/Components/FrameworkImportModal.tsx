import React, { useCallback, useRef, useState } from "react";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Download, Upload } from "lucide-react";
import StandardModal from "../../../components/Modals/StandardModal";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Alert from "../../../components/Alert";
import { border } from "../../../themes/palette";
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

const sectionSx = {
  border: `1px solid ${border.dark}`,
  borderRadius: "4px",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
} as const;

const tableSx = {
  "border": `1px solid ${border.dark}`,
  "borderRadius": "4px",
  "& th, & td": { fontSize: 13, padding: "6px 12px" },
} as const;

/**
 * A first import only adds rows; an upload that changed an existing framework
 * reports what it added, updated, retired and removed.
 */
function importSuccessMessage(result: FrameworkImportResult): string {
  const { added = 0, updated = 0, retired = 0, removed = 0 } = result;
  if (updated + retired + removed > 0) {
    return `Framework updated: ${added} added, ${updated} updated, ${retired} retired, ${removed} removed.`;
  }
  return `Framework imported: ${result.imported_topics} topic(s) and ${result.imported_subtopics} subtopic(s).`;
}

/**
 * Self-service framework import (#5254): download the template, upload a
 * filled sheet, and import it. A rejected import lists every failing row.
 * Re-importing the same framework name updates its structure in place;
 * topics and subtopics that already hold assessment data are retired, not deleted.
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
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    } catch {
      setError("Could not download the template. Try again.");
    }
  };

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
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
        setError("The Excel file is empty or invalid");
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
    } catch {
      setError("Could not read the Excel file. Check that it is a valid .xlsx file.");
      setExcelData([]);
    }
  }, []);

  const handleImport = async () => {
    if (excelData.length === 0) {
      setError("No data to import. Upload a filled Excel file first.");
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
    } catch (err: unknown) {
      setError((err as Error)?.message || "Failed to import framework");
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

  const rowErrors = importResult?.errors ?? [];

  return (
    <StandardModal
      isOpen={open}
      onClose={handleClose}
      title="Import a framework from Excel"
      description="Store your own framework, such as an internal policy, as topics and subtopics. Once imported, add it to a use case from the Frameworks tab of that use case. Uploading a file with the same framework name again updates the existing framework."
      onSubmit={handleImport}
      submitButtonText={loading ? "Importing..." : "Import framework"}
      isSubmitting={loading}
      isSubmitDisabled={loading || excelData.length === 0}
      maxWidth="800px"
    >
      <Stack sx={{ gap: "16px" }}>
        {error && <Alert variant="error" body={error} inline hasIcon={false} />}

        {importResult?.success && (
          <Alert
            variant="success"
            inline
            hasIcon={false}
            body={importSuccessMessage(importResult)}
          />
        )}

        {importResult && !importResult.success && (
          <Stack sx={{ gap: "8px" }}>
            <Alert
              variant="error"
              inline
              hasIcon={false}
              body="Nothing was imported. Fix the rows below in your file and upload it again."
            />
            {rowErrors.length > 0 && (
              <TableContainer sx={{ ...tableSx, maxHeight: "240px" }}>
                <Table size="small" stickyHeader aria-label="Import errors">
                  <TableHead>
                    <TableRow>
                      <TableCell>Row</TableCell>
                      <TableCell>Field</TableCell>
                      <TableCell>Error</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rowErrors.map((err, idx) => (
                      <TableRow key={`${err.row}-${err.field}-${idx}`}>
                        <TableCell>{err.row > 0 ? err.row : "-"}</TableCell>
                        <TableCell>{err.field}</TableCell>
                        <TableCell>{err.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Stack>
        )}

        <Box sx={sectionSx}>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            Step 1: Download the Excel template
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            One row per subtopic. Leave the subtopic columns empty on a row to create a topic
            without subtopics.
          </Typography>
          <Box>
            <CustomizableButton
              variant="outlined"
              text="Download template"
              startIcon={<Download size={16} />}
              onClick={handleDownloadTemplate}
              isDisabled={loading}
            />
          </Box>
        </Box>

        <Box sx={sectionSx}>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            Step 2: Upload the filled Excel file
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            All rows must describe the same framework. Re-uploading a framework name replaces its
            previous structure. A file can have at most 5,000 rows.
          </Typography>
          <Stack direction="row" sx={{ gap: "8px", alignItems: "center" }}>
            <CustomizableButton
              variant="outlined"
              text="Choose file"
              startIcon={<Upload size={16} />}
              onClick={() => fileInputRef.current?.click()}
              isDisabled={loading}
            />
            <input
              type="file"
              hidden
              accept=".xlsx"
              onChange={handleFileUpload}
              ref={fileInputRef}
              data-testid="framework-import-file-input"
            />
            {uploadedFile && (
              <>
                <Typography sx={{ fontSize: 13 }}>{uploadedFile.name}</Typography>
                <CustomizableButton
                  variant="text"
                  text="Remove file"
                  onClick={handleReset}
                  isDisabled={loading}
                />
              </>
            )}
          </Stack>

          {excelData.length > 0 && (
            <Stack sx={{ gap: "8px", marginTop: "8px" }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                Preview ({excelData.length} row(s) found)
              </Typography>
              <TableContainer sx={{ ...tableSx, maxHeight: "300px" }}>
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
                        <TableCell>{cellText(row.framework_name) || "-"}</TableCell>
                        <TableCell>
                          {row.topic_number
                            ? `${cellText(row.topic_number)} ${cellText(row.topic_name)}`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {row.subtopic_number
                            ? `${cellText(row.subtopic_number)} ${cellText(row.subtopic_name)}`
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {excelData.length > 5 && (
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                  Showing first 5 of {excelData.length} rows
                </Typography>
              )}
            </Stack>
          )}
        </Box>
      </Stack>
    </StandardModal>
  );
}

/** Preview text for an ExcelJS cell value (rich text, formula, hyperlink or primitive). */
function cellText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "object") return String(value);
  const cell = value as { richText?: Array<{ text?: string }>; result?: unknown; text?: unknown };
  if (Array.isArray(cell.richText)) return cell.richText.map((r) => r.text ?? "").join("");
  if ("result" in cell) return cellText(cell.result);
  if (cell.text !== undefined) return cellText(cell.text);
  return "";
}
