import {
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";
import { RiskLibraryEntry } from "../../../domain/types/RiskLibrary";

interface Props {
  entries: RiskLibraryEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (limit: number) => void;
  onRowClick: (entry: RiskLibraryEntry) => void;
}

const severityColorMap: Record<string, string> = {
  Catastrophic: "#d32f2f",
  Major: "#f57c00",
  Moderate: "#fbc02d",
  Minor: "#4caf50",
  Negligible: "#90a4ae",
};

const tierColorMap: Record<string, string> = {
  prohibited: "#d32f2f",
  high: "#f57c00",
  limited: "#fbc02d",
  minimal: "#4caf50",
};

const sourceColorMap: Record<string, string> = {
  MIT: "#1565c0",
  IBM: "#6a1b9a",
  AIID: "#00838f",
  AI_GENERATED: "#2e7d32",
  CUSTOM: "#546e7a",
};

const RiskLibraryTable = ({
  entries,
  pagination,
  onPageChange,
  onRowsPerPageChange,
  onRowClick,
}: Props) => {
  const theme = useTheme();

  return (
    <Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow
              sx={{
                backgroundColor:
                  theme.palette.mode === "dark" ? "#1e1e2e" : "#f5f5f5",
              }}
            >
              <TableCell sx={{ fontWeight: 600, width: 90 }}>Source</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Summary</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 130 }}>Risk Type</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 140 }}>Domain</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 100 }}>EU AI Act</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 100 }}>Severity</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 100 }}>Likelihood</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 80, textAlign: "center" }}>
                Mitigations
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: "center", py: 6 }}>
                  <Typography variant="body2" color="text.secondary">
                    No risk library entries found. Try adjusting your filters or
                    use AI generation to create new entries.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow
                  key={entry.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => onRowClick(entry)}
                >
                  <TableCell>
                    <Chip
                      label={entry.source}
                      size="small"
                      sx={{
                        backgroundColor: sourceColorMap[entry.source] || "#757575",
                        color: "#fff",
                        fontWeight: 500,
                        fontSize: "0.7rem",
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 350 }}>
                      {entry.summary}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {entry.risk_type || "-"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 130 }}>
                      {entry.domain || "-"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {entry.eu_ai_act_tier ? (
                      <Chip
                        label={entry.eu_ai_act_tier}
                        size="small"
                        sx={{
                          backgroundColor:
                            tierColorMap[entry.eu_ai_act_tier] || "#757575",
                          color: "#fff",
                          fontWeight: 500,
                          fontSize: "0.7rem",
                        }}
                      />
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.severity ? (
                      <Chip
                        label={entry.severity}
                        size="small"
                        variant="outlined"
                        sx={{
                          borderColor:
                            severityColorMap[entry.severity] || "#757575",
                          color: severityColorMap[entry.severity] || "#757575",
                          fontWeight: 500,
                          fontSize: "0.7rem",
                        }}
                      />
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {entry.likelihood || "-"}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ textAlign: "center" }}>
                    <Typography variant="caption">
                      {entry.mitigation_count ?? 0}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={pagination.total}
        page={pagination.page - 1}
        onPageChange={(_e, newPage) => onPageChange(newPage + 1)}
        rowsPerPage={pagination.limit}
        onRowsPerPageChange={(e) =>
          onRowsPerPageChange(parseInt(e.target.value, 10))
        }
        rowsPerPageOptions={[10, 25, 50]}
      />
    </Box>
  );
};

export default RiskLibraryTable;
