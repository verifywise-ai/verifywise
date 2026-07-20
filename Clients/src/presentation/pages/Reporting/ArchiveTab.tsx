/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  CircularProgress,
  Drawer,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { Archive, Download, Sparkles } from "lucide-react";
import singleTheme from "../../themes/v1SingleTheme";
import { text as textColors } from "../../themes/palette";
import Chip from "../../components/Chip";
import { CustomizableButton } from "../../components/button/customizable-button";
import { EmptyState } from "../../components/EmptyState";
import StandardTablePagination from "../../components/Table/StandardTablePagination";
import ReportAnalysisPanel from "../../components/ReportAnalysisPanel";
import {
  useReportRunsPage,
  useRunAnalyses,
} from "../../../application/hooks/useReporting";
import { downloadReportRun } from "../../../application/repository/reporting.repository";

const statusVariant = (status: string): "success" | "error" | "warning" | "default" => {
  if (status === "completed" || status === "success") return "success";
  if (status === "failed" || status === "error") return "error";
  if (status === "running" || status === "pending") return "warning";
  return "default";
};

// delivery_status is a JSONB object ({storage,emailLink,attachment}); summarize to a string
// so React never tries to render a raw object (which crashes the whole tree).
const formatDelivery = (d: any): string => {
  if (!d || typeof d !== "object") return d ?? "—";
  const parts = ["storage", "emailLink", "attachment"]
    .filter((k) => d[k]?.enabled)
    .map((k) => `${k}: ${d[k].status}`);
  return parts.length ? parts.join(", ") : "—";
};

const ROWS_PER_PAGE_DEFAULT = 10;

export default function ArchiveTab() {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_DEFAULT);
  // Which run's analyses the drawer is showing. null = drawer closed, which also
  // disables the analyses query.
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const { data: runPage, isLoading } = useReportRunsPage({
    limit: rowsPerPage,
    offset: page * rowsPerPage,
  });
  const { data: analyses, isLoading: analysesLoading } = useRunAnalyses(
    selectedRunId ?? undefined,
  );

  const runs = runPage?.rows ?? [];
  // Fall back to the page length so the pager still reads sanely if the
  // envelope ever arrives without a total.
  const total = runPage?.total ?? runs.length;

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  // Gate on the server-side total, not the current page: an empty page 2 means
  // "you paged past the end", not "there are no runs".
  if (!total) {
    return <EmptyState icon={Archive} message="No scheduled report runs yet." showBorder />;
  }

  const rangeStart = page * rowsPerPage + 1;
  const rangeEnd = Math.min(page * rowsPerPage + rowsPerPage, total);

  return (
    <TableContainer sx={singleTheme.tableStyles.primary.frame}>
      <Table>
        <TableHead>
          <TableRow sx={singleTheme.tableStyles.primary.header.row}>
            {["Report", "Run at", "Status", "Delivery", "File", "Analyses"].map((h) => (
              <TableCell key={h} sx={singleTheme.tableStyles.primary.header.cell}>
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {runs.map((r: any) => (
            <TableRow key={r.id} sx={singleTheme.tableStyles.primary.body.row}>
              <TableCell
                sx={{ ...singleTheme.tableStyles.primary.body.cell, color: textColors.primary }}
              >
                {r.name ?? r.scheduled_report_name ?? `Run #${r.id}`}
              </TableCell>
              <TableCell
                sx={{ ...singleTheme.tableStyles.primary.body.cell, color: textColors.secondary }}
              >
                {r.run_at || r.created_at
                  ? new Date(r.run_at ?? r.created_at).toLocaleString()
                  : "—"}
              </TableCell>
              <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                <Chip
                  label={r.status ?? "unknown"}
                  variant={statusVariant(r.status)}
                  size="small"
                  uppercase={false}
                />
              </TableCell>
              <TableCell
                sx={{ ...singleTheme.tableStyles.primary.body.cell, color: textColors.secondary }}
              >
                {formatDelivery(r.delivery_status)}
              </TableCell>
              <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                {r.file_id ? (
                  <CustomizableButton
                    variant="text"
                    text="Download"
                    icon={<Download size={16} />}
                    onClick={async () => {
                      const blob = await downloadReportRun(r.id);
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = r.output_filename ?? `report-${r.id}.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                    }}
                    sx={{ height: 28, fontSize: 13, minWidth: 0 }}
                  />
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                {/* Always offered: whether a run produced analyses is only known
                    after fetching them, and the panel has its own empty state. */}
                <CustomizableButton
                  variant="text"
                  text="View analyses"
                  icon={<Sparkles size={16} />}
                  onClick={() => setSelectedRunId(r.id)}
                  sx={{ height: 28, fontSize: 13, minWidth: 0 }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <StandardTablePagination
          totalCount={total}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
          getRange={`${rangeStart} - ${rangeEnd}`}
          entityLabel="run"
          colSpan={6}
        />
      </Table>

      <Drawer
        anchor="right"
        open={selectedRunId != null}
        onClose={() => setSelectedRunId(null)}
        slotProps={{ paper: { sx: { width: 520, maxWidth: "100%", p: "24px" } } }}
      >
        <Stack spacing="16px">
          <Typography
            sx={{
              fontSize: 16,
              fontWeight: 600,
              lineHeight: 1.4,
              color: theme.palette.text.primary,
            }}
          >
            AI analyses
          </Typography>
          <ReportAnalysisPanel analyses={analyses} isLoading={analysesLoading} />
        </Stack>
      </Drawer>
    </TableContainer>
  );
}
