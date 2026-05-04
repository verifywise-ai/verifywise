import { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Button,
  useTheme,
} from "@mui/material";
import { ChevronDown, FileSpreadsheet, AlertTriangle } from "lucide-react";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import Toggle from "../../../components/Inputs/Toggle";
import { FileAnalysis, DatasetMetadata } from "./useFileAnalysis";

const DATASET_TYPES = [
  { _id: "Training", name: "Training" },
  { _id: "Validation", name: "Validation" },
  { _id: "Testing", name: "Testing" },
  { _id: "Production", name: "Production" },
  { _id: "Evaluation", name: "Evaluation" },
];

const CLASSIFICATIONS = [
  { _id: "Public", name: "Public" },
  { _id: "Internal", name: "Internal" },
  { _id: "Confidential", name: "Confidential" },
  { _id: "Restricted", name: "Restricted" },
];

interface FilePreviewAndMetadataProps {
  analyses: FileAnalysis[];
  onUpdateMetadata: (index: number, updates: Partial<DatasetMetadata>) => void;
  onToggleSkip: (index: number) => void;
  onApplyBatchDefaults: (defaults: Partial<DatasetMetadata>) => void;
}

export default function FilePreviewAndMetadata({
  analyses,
  onUpdateMetadata,
  onToggleSkip,
  onApplyBatchDefaults,
}: FilePreviewAndMetadataProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<number | false>(0);
  const [batchType, setBatchType] = useState("");
  const [batchClassification, setBatchClassification] = useState("");
  const [batchOwner, setBatchOwner] = useState("");

  const fieldStyle = useMemo(
    () => ({
      backgroundColor: theme.palette.background.main,
      "& input": {
        padding: "0 14px",
      },
    }),
    [theme.palette.background.main],
  );

  const handleApplyBatch = () => {
    const defaults: Partial<DatasetMetadata> = {};
    if (batchType) defaults.type = batchType;
    if (batchClassification) defaults.classification = batchClassification;
    if (batchOwner) defaults.owner = batchOwner;
    if (Object.keys(defaults).length > 0) {
      onApplyBatchDefaults(defaults);
    }
  };

  return (
    <Stack spacing={2}>
      {/* Batch defaults */}
      <Box
        sx={{
          border: `1px solid ${theme.palette.border.light}`,
          borderRadius: "4px",
          p: 2,
          backgroundColor: theme.palette.background.accent,
        }}
      >
        <Typography
          sx={{
            mb: 1.5,
            fontSize: 13,
            fontWeight: 600,
            color: theme.palette.text.secondary,
          }}
        >
          Batch defaults (apply to all files)
        </Typography>
        <Stack direction="row" spacing={3} alignItems="flex-end">
          <Select
            id="batch-type"
            label="Type"
            placeholder="Select type"
            value={batchType}
            items={[{ _id: "", name: "—" }, ...DATASET_TYPES]}
            onChange={(e) => setBatchType(e.target.value as string)}
            sx={{ minWidth: 140 }}
          />
          <Select
            id="batch-classification"
            label="Classification"
            placeholder="Select classification"
            value={batchClassification}
            items={[{ _id: "", name: "—" }, ...CLASSIFICATIONS]}
            onChange={(e) => setBatchClassification(e.target.value as string)}
            sx={{ minWidth: 140 }}
          />
          <Field
            id="batch-owner"
            label="Owner"
            placeholder="Owner name"
            value={batchOwner}
            onChange={(e) => setBatchOwner(e.target.value)}
            width="140px"
            sx={fieldStyle}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={handleApplyBatch}
            sx={{
              border: `1px solid ${theme.palette.border.dark}`,
              color: theme.palette.text.secondary,
              height: 34,
              fontSize: 13,
              fontWeight: 500,
              textTransform: "none",
              borderRadius: `${theme.shape.borderRadius}px`,
              "&:hover": {
                backgroundColor: theme.palette.background.accent,
                border: `1px solid ${theme.palette.border.dark}`,
              },
            }}
          >
            Apply
          </Button>
        </Stack>
      </Box>

      {/* Per-file accordions */}
      {analyses.map((analysis, index) => (
        <Accordion
          key={analysis.fileName}
          expanded={expanded === index}
          onChange={(_, isExpanded) => setExpanded(isExpanded ? index : false)}
          sx={{
            opacity: analysis.skipped ? 0.5 : 1,
            border: `1px solid ${theme.palette.border.light}`,
            borderRadius: "4px !important",
            overflow: "hidden",
            boxShadow: "none",
            "&:before": { display: "none" },
            "&.Mui-expanded": { margin: 0 },
          }}
        >
          <AccordionSummary
            expandIcon={<ChevronDown size={18} color={theme.palette.text.tertiary} />}
            sx={{ padding: "8px 16px" }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1 }}>
              <FileSpreadsheet size={18} color={theme.palette.primary.main} />
              <Typography
                sx={{
                  fontWeight: 500,
                  fontSize: 13,
                  color: theme.palette.text.secondary,
                }}
              >
                {analysis.fileName}
              </Typography>
              <Chip
                label={analysis.format}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: 12,
                  height: 24,
                  borderColor: theme.palette.border.dark,
                }}
              />
              <Chip
                label={`${analysis.rowCount} rows`}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: 12,
                  height: 24,
                  borderColor: theme.palette.border.dark,
                }}
              />
              <Chip
                label={`${analysis.headers.length} cols`}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: 12,
                  height: 24,
                  borderColor: theme.palette.border.dark,
                }}
              />
              {analysis.pii.containsPii && (
                <Chip
                  icon={<AlertTriangle size={12} />}
                  label="PII detected"
                  size="small"
                  sx={{
                    fontSize: 12,
                    height: 24,
                    backgroundColor: theme.palette.status.warning.bg,
                    borderColor: theme.palette.status.warning.border,
                    color: theme.palette.status.warning.text,
                    border: `1px solid ${theme.palette.status.warning.border}`,
                  }}
                />
              )}
              {analysis.skipped && (
                <Chip
                  label="Skipped"
                  size="small"
                  variant="outlined"
                  sx={{
                    fontSize: 12,
                    height: 24,
                    borderColor: theme.palette.border.dark,
                  }}
                />
              )}
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              {/* Skip toggle */}
              <FormControlLabel
                control={<Toggle checked={analysis.skipped} onChange={() => onToggleSkip(index)} />}
                label={
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 400,
                      color: theme.palette.text.primary,
                    }}
                  >
                    Skip this file
                  </Typography>
                }
                sx={{ marginLeft: 0, marginRight: 0 }}
              />

              {!analysis.skipped && (
                <>
                  {/* Data preview */}
                  {analysis.previewRows.length > 0 && (
                    <Box>
                      <Typography
                        sx={{
                          mb: 1,
                          fontSize: 13,
                          fontWeight: 600,
                          color: theme.palette.text.secondary,
                        }}
                      >
                        Data preview (first {Math.min(10, analysis.previewRows.length)} rows)
                      </Typography>
                      <TableContainer
                        sx={{
                          maxHeight: 300,
                          overflow: "auto",
                          border: `1px solid ${theme.palette.border.light}`,
                          borderRadius: "4px",
                        }}
                      >
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              {analysis.headers.map((header) => {
                                const isPiiCol = analysis.pii.piiColumns.includes(header);
                                return (
                                  <TableCell
                                    key={header}
                                    sx={{
                                      fontSize: 12,
                                      fontWeight: 500,
                                      color: theme.palette.text.tertiary,
                                      padding: "10px 12px",
                                      whiteSpace: "nowrap",
                                      background: isPiiCol
                                        ? theme.palette.status.warning.bg
                                        : theme.palette.background.accent,
                                      borderBottom: `1px solid ${theme.palette.border.light}`,
                                    }}
                                  >
                                    {header}
                                    {isPiiCol && (
                                      <AlertTriangle
                                        size={12}
                                        style={{ marginLeft: 4, verticalAlign: "middle" }}
                                        color={theme.palette.status.warning.text}
                                      />
                                    )}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {analysis.previewRows.map((row, rowIndex) => (
                              <TableRow key={rowIndex}>
                                {analysis.headers.map((header) => (
                                  <TableCell
                                    key={header}
                                    sx={{
                                      fontSize: 13,
                                      padding: "10px 12px",
                                      whiteSpace: "nowrap",
                                      borderBottom: `1px solid ${theme.palette.border.light}`,
                                      color: theme.palette.text.secondary,
                                    }}
                                  >
                                    {String(row[header] ?? "")}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  )}

                  <Divider sx={{ borderColor: theme.palette.border.light }} />

                  {/* Metadata form */}
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: theme.palette.text.secondary,
                    }}
                  >
                    Dataset metadata
                  </Typography>
                  <Stack spacing={3}>
                    {/* Row 1: Name, Version */}
                    <Stack direction="row" justifyContent="space-between" spacing={6}>
                      <Field
                        id={`name-${index}`}
                        label="Name"
                        placeholder="Dataset name"
                        value={analysis.metadata.name}
                        onChange={(e) => onUpdateMetadata(index, { name: e.target.value })}
                        width="50%"
                        sx={fieldStyle}
                      />
                      <Field
                        id={`version-${index}`}
                        label="Version"
                        placeholder="e.g., 1.0"
                        value={analysis.metadata.version}
                        onChange={(e) => onUpdateMetadata(index, { version: e.target.value })}
                        width="50%"
                        sx={fieldStyle}
                      />
                    </Stack>

                    {/* Description */}
                    <Field
                      id={`description-${index}`}
                      label="Description"
                      type="description"
                      placeholder="Describe the dataset and its purpose"
                      value={analysis.metadata.description}
                      onChange={(e) => onUpdateMetadata(index, { description: e.target.value })}
                      width="100%"
                      sx={fieldStyle}
                      rows={2}
                    />

                    {/* Row 2: Type, Classification, Format */}
                    <Stack direction="row" justifyContent="space-between" spacing={6}>
                      <Select
                        id={`type-${index}`}
                        label="Type"
                        placeholder="Select type"
                        value={analysis.metadata.type}
                        items={DATASET_TYPES}
                        onChange={(e) =>
                          onUpdateMetadata(index, { type: e.target.value as string })
                        }
                        sx={{ width: "33%" }}
                      />
                      <Select
                        id={`classification-${index}`}
                        label="Classification"
                        placeholder="Select classification"
                        value={analysis.metadata.classification}
                        items={CLASSIFICATIONS}
                        onChange={(e) =>
                          onUpdateMetadata(index, {
                            classification: e.target.value as string,
                          })
                        }
                        sx={{ width: "33%" }}
                      />
                      <Field
                        id={`format-${index}`}
                        label="Format"
                        value={analysis.metadata.format}
                        width="33%"
                        sx={fieldStyle}
                        disabled
                      />
                    </Stack>

                    {/* Row 3: Owner, Source */}
                    <Stack direction="row" justifyContent="space-between" spacing={6}>
                      <Field
                        id={`owner-${index}`}
                        label="Owner"
                        placeholder="e.g., Data Science Team"
                        value={analysis.metadata.owner}
                        onChange={(e) => onUpdateMetadata(index, { owner: e.target.value })}
                        width="50%"
                        sx={fieldStyle}
                      />
                      <Field
                        id={`source-${index}`}
                        label="Source"
                        placeholder="e.g., Internal CRM"
                        value={analysis.metadata.source}
                        onChange={(e) => onUpdateMetadata(index, { source: e.target.value })}
                        width="50%"
                        sx={fieldStyle}
                      />
                    </Stack>

                    {/* PII Section */}
                    <Stack>
                      <FormControlLabel
                        control={
                          <Toggle
                            checked={analysis.metadata.contains_pii}
                            onChange={(e) =>
                              onUpdateMetadata(index, {
                                contains_pii: (e.target as HTMLInputElement).checked,
                              })
                            }
                          />
                        }
                        label={
                          <Typography
                            sx={{
                              fontSize: 13,
                              fontWeight: 400,
                              color: theme.palette.text.primary,
                            }}
                          >
                            Dataset contains personally identifiable information (PII)
                          </Typography>
                        }
                        sx={{ marginLeft: 0, marginRight: 0 }}
                      />
                    </Stack>

                    {analysis.metadata.contains_pii && (
                      <Field
                        id={`pii-types-${index}`}
                        label="PII types"
                        placeholder="e.g., Names, Email addresses, Phone numbers"
                        value={analysis.metadata.pii_types}
                        onChange={(e) => onUpdateMetadata(index, { pii_types: e.target.value })}
                        width="100%"
                        sx={fieldStyle}
                        helperText="Comma-separated column names containing PII"
                      />
                    )}
                  </Stack>
                </>
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
    </Stack>
  );
}
