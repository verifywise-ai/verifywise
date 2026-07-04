import React, { useState, useCallback } from "react";
import {
  Stack,
  Typography,
  Box,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Alert,
} from "@mui/material";
import { Upload, Check, X } from "lucide-react";
import StandardModal from "../../../components/Modals/StandardModal";
import GovernanceTooltip from "../../../components/GovernanceOS/GovernanceTooltip";
import {
  IGovernanceControlMapping,
  MappingStrength,
} from "../../../../domain/interfaces/i.governanceOs";
import { border as borderPalette, background, text, accent, status } from "../../../themes/palette";

interface BulkImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (mappings: Partial<IGovernanceControlMapping>[]) => void;
  isSubmitting?: boolean;
}

interface ParsedRow {
  source_framework_id: number;
  source_control_identifier: string;
  target_framework_id: number;
  target_control_identifier: string;
  mapping_strength: string;
  domain_tag?: string;
  rationale?: string;
  confidence_score?: number;
  valid: boolean;
  errors: string[];
}

const BulkImportModal: React.FC<BulkImportModalProps> = ({
  open,
  onClose,
  onImport,
  isSubmitting,
}) => {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split("\n").filter((line) => line.trim());
        if (lines.length < 2) {
          setParseError("CSV must have a header row and at least one data row");
          return;
        }

        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const requiredCols = [
          "source_framework_id",
          "source_control_identifier",
          "target_framework_id",
          "target_control_identifier",
        ];
        const missing = requiredCols.filter((c) => !headers.includes(c));
        if (missing.length > 0) {
          setParseError(`Missing required columns: ${missing.join(", ")}`);
          return;
        }

        const rows: ParsedRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map((v) => v.trim());
          if (values.length < requiredCols.length) continue;

          const getValue = (name: string) => values[headers.indexOf(name)] || "";

          const sourceFw = parseInt(getValue("source_framework_id"), 10);
          const targetFw = parseInt(getValue("target_framework_id"), 10);
          const sourceCtrl = getValue("source_control_identifier");
          const targetCtrl = getValue("target_control_identifier");
          const strength = getValue("mapping_strength") || "related";

          const errors: string[] = [];
          if (!sourceFw || sourceFw < 1 || sourceFw > 4) errors.push("Invalid source_framework_id");
          if (!targetFw || targetFw < 1 || targetFw > 4) errors.push("Invalid target_framework_id");
          if (!sourceCtrl) errors.push("Missing source_control_identifier");
          if (!targetCtrl) errors.push("Missing target_control_identifier");
          if (!["direct", "partial", "related"].includes(strength))
            errors.push("Invalid mapping_strength");

          rows.push({
            source_framework_id: sourceFw,
            source_control_identifier: sourceCtrl,
            target_framework_id: targetFw,
            target_control_identifier: targetCtrl,
            mapping_strength: strength,
            domain_tag: getValue("domain_tag") || undefined,
            rationale: getValue("rationale") || undefined,
            confidence_score: parseFloat(getValue("confidence_score")) || 0.8,
            valid: errors.length === 0,
            errors,
          });
        }

        setParsedRows(rows);
        setParseError(null);
      } catch (err) {
        setParseError("Failed to parse CSV. Please check the format.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }, []);

  const handleImport = () => {
    const validRows = parsedRows
      .filter((r) => r.valid)
      .map((r) => ({
        source_framework_id: r.source_framework_id,
        source_control_identifier: r.source_control_identifier,
        target_framework_id: r.target_framework_id,
        target_control_identifier: r.target_control_identifier,
        mapping_strength: r.mapping_strength as MappingStrength,
        domain_tag: r.domain_tag,
        rationale: r.rationale,
        confidence_score: r.confidence_score,
      }));
    onImport(validRows);
  };

  const validCount = parsedRows.filter((r) => r.valid).length;
  const invalidCount = parsedRows.filter((r) => !r.valid).length;

  return (
    <StandardModal
      isOpen={open}
      onClose={onClose}
      title="Bulk Import Mappings"
      description="Upload a CSV file to import multiple mappings at once"
      submitButtonText={validCount > 0 ? `Import ${validCount} Mappings` : "Import"}
      cancelButtonText="Cancel"
      onSubmit={handleImport}
      isSubmitting={validCount === 0 || isSubmitting}
      fitContent
    >
      <Stack spacing={3} sx={{ minWidth: 600, maxWidth: 800 }}>
        {/* Upload area */}
        <GovernanceTooltip
          header="Upload CSV"
          description="Select a CSV file containing mapping rows to import"
        >
          <Box
            component="label"
            sx={{
              "display": "flex",
              "flexDirection": "column",
              "alignItems": "center",
              "justifyContent": "center",
              "p": 4,
              "border": `2px dashed ${borderPalette.dark}`,
              "borderRadius": "4px",
              "backgroundColor": background.accent,
              "cursor": "pointer",
              "transition": "all 150ms ease",
              "&:hover": {
                borderColor: accent.primary.border,
                backgroundColor: accent.primary.bg,
              },
            }}
          >
            <input type="file" accept=".csv" hidden onChange={handleFileUpload} />
            <Upload size={24} color={text.muted} />
            <Typography sx={{ mt: 1, fontSize: 13, color: text.secondary }}>
              Click to upload CSV file
            </Typography>
            <Typography sx={{ fontSize: 11, color: text.muted }}>
              Required columns: source_framework_id, source_control_identifier, target_framework_id,
              target_control_identifier
            </Typography>
          </Box>
        </GovernanceTooltip>

        {parseError && <Alert severity="error">{parseError}</Alert>}

        {parsedRows.length > 0 && (
          <>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Preview</Typography>
              {validCount > 0 && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    color: accent.primary.text,
                  }}
                >
                  <Check size={14} />
                  <Typography sx={{ fontSize: 12 }}>{validCount} valid</Typography>
                </Box>
              )}
              {invalidCount > 0 && (
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 0.5, color: status.error.text }}
                >
                  <X size={14} />
                  <Typography sx={{ fontSize: 12 }}>{invalidCount} invalid</Typography>
                </Box>
              )}
            </Stack>

            <Box
              sx={{
                maxHeight: 300,
                overflow: "auto",
                border: `1px solid ${borderPalette.light}`,
                borderRadius: "4px",
              }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: background.accent }}>
                    <TableCell sx={{ fontSize: 11, fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 600 }}>Source</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 600 }}>Target</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 600 }}>Strength</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 600 }}>Errors</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {parsedRows.map((row, i) => (
                    <TableRow
                      key={i}
                      sx={{ backgroundColor: row.valid ? "transparent" : status.error.bg }}
                    >
                      <TableCell>
                        {row.valid ? (
                          <Check size={14} color={accent.primary.text} />
                        ) : (
                          <X size={14} color={status.error.text} />
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>
                        {row.source_framework_id}: {row.source_control_identifier}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>
                        {row.target_framework_id}: {row.target_control_identifier}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, textTransform: "capitalize" }}>
                        {row.mapping_strength}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: status.error.text }}>
                        {row.errors.join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </>
        )}
      </Stack>
    </StandardModal>
  );
};

export default BulkImportModal;
