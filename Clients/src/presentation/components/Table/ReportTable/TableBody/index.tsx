import React, { useCallback } from "react";
import { TableBody, TableCell, TableRow, Chip, Box } from "@mui/material";
import { Sparkles } from "lucide-react";
import IconButton from "../../../IconButton";
import { displayFormattedDate } from "../../../../tools/isoDateToString";
import singleTheme from "../../../../themes/v1SingleTheme";
import { styles } from "./styles";
import { handleDownload } from "../../../../../application/tools/fileDownload";
import { IReportTableProps } from "../../../../types/interfaces/i.table";
import { brand, background } from "../../../../themes/palette";

const ReportTableBody: React.FC<IReportTableProps> = ({
  rows,
  onRemoveReport,
  page,
  rowsPerPage,
  sortConfig,
  visibleColumns,
}) => {
  const cellStyle = singleTheme.tableStyles.primary.body.cell;

  const isColumnVisible = useCallback(
    (key: string): boolean => {
      if (!visibleColumns || visibleColumns.size === 0) return true;
      return visibleColumns.has(key);
    },
    [visibleColumns]
  );

  const handleRemoveReport = async (reportId: number) => {
    onRemoveReport(reportId);
  };

  // row onclick function
  const handleEditRisk = () => {};

  const formatSource = (source: string) => {
    if (!source) return "-";
    if (source.trim().toLowerCase() === "all reports") return "All Reports";
    const cleaned = source
      .replace(/\breport\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return cleaned.length ? cleaned : source;
  };

  return (
    <TableBody>
      {rows &&
        rows
          .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
          .map((row, index: number) => (
            <TableRow
              key={index}
              sx={{
                ...singleTheme.tableStyles.primary.body.row,
                "&:hover": {
                  backgroundColor: "#fafafa",
                  cursor: "default",
                },
              }}
            >
              {isColumnVisible("reportName") && (
                <TableCell
                  sx={{
                    ...cellStyle,
                    backgroundColor: sortConfig?.key && (sortConfig.key.toLowerCase().includes("file") || sortConfig.key.toLowerCase().includes("name")) ? "#e8e8e8" : "#fafafa",
                  }}
                >
                  {row.filename ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {row.filename}
                    {row.filename.includes("_AI_") && (
                      <Chip
                        label="AI"
                        size="small"
                        icon={
                          <Sparkles
                            size={10}
                            color={brand.primary}
                            style={{ marginLeft: 6 }}
                          />
                        }
                        sx={{
                          fontSize: "10px",
                          height: "20px",
                          backgroundColor: `${brand.primaryLight}`,
                          color: `${brand.primary}`,
                          fontWeight: 600,
                          "& .MuiChip-label": { px: 0.5 },
                          "& .MuiChip-icon": { marginRight: "-2px" },
                        }}
                      />
                    )}
                  </Box>
                ) : (
                  "-"
                )}
                </TableCell>
              )}
              {isColumnVisible("typeOfReport") && (
                <TableCell
                  sx={{
                    ...cellStyle,
                    backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("source") ? `${background.surface}` : "inherit",
                  }}
                >
                  {row.source ? formatSource(row.source) : "-"}
                </TableCell>
              )}
              {isColumnVisible("project") && (
                <TableCell
                  sx={{
                    ...cellStyle,
                    backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("project") ? `${background.surface}` : "inherit",
                  }}
                >
                  {row.project_title ? row.project_title : "-"}
                </TableCell>
              )}
              {isColumnVisible("dateGenerated") && (
                <TableCell
                  sx={{
                    ...cellStyle,
                    backgroundColor: sortConfig?.key && (sortConfig.key.toLowerCase().includes("date") || sortConfig.key.toLowerCase().includes("upload") || sortConfig.key.toLowerCase().includes("time")) ? `${background.surface}` : "inherit",
                  }}
                >
                  {row.uploaded_time
                    ? displayFormattedDate(row.uploaded_time.toString())
                    : "NA"}
                </TableCell>
              )}
              {isColumnVisible("generatedBy") && (
                <TableCell
                  sx={{
                    ...cellStyle,
                    backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("uploader") ? `${background.surface}` : "inherit",
                  }}
                >
                  {row.uploader_name ? row.uploader_name : "-"}{" "}
                  {row.uploader_surname ? row.uploader_surname : "-"}
                </TableCell>
              )}
              {isColumnVisible("action") && (
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.body.cell,
                    ...styles.setting,
                    backgroundColor: sortConfig?.key && (sortConfig.key.toLowerCase().includes("action") || sortConfig.key.toLowerCase().includes("setting")) ? `${background.surface}` : "inherit",
                  }}
                >
                  <IconButton
                    id={row.id}
                    type="report"
                    onMouseEvent={() => handleEditRisk()}
                    onDelete={() => { handleRemoveReport(row.id); }}
                    onEdit={() => {}}
                    onDownload={() => handleDownload(row.id, row.filename)}
                    warningTitle="Remove this report?"
                    warningMessage={`Are you sure you want to remove this report? This action is non-recoverable.`}
                  ></IconButton>
                </TableCell>
              )}
            </TableRow>
          ))}
    </TableBody>
  );
};

export default ReportTableBody;
