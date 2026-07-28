/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * One table for both report lists. The Generate tab renders it with
 * variant="live" (archived_at IS NULL), the Archive tab with variant="archived".
 * Keeping them one component is what stops the two lists drifting apart the way
 * the files-based list and the runs list did.
 */
import { useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { Archive, ArchiveRestore, Download, Trash2, FileText, Sparkles } from "lucide-react";
import singleTheme from "../../themes/v1SingleTheme";
import { EmptyState } from "../../components/EmptyState";
import ReportAnalysisPanel from "../../components/ReportAnalysisPanel";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import {
  useReportRunsPage,
  useArchiveRun,
  useRestoreRun,
  useDeleteRun,
  useRunAnalyses,
} from "../../../application/hooks/useReporting";
import { downloadReportRun } from "../../../application/repository/reporting.repository";

const ROWS_PER_PAGE_DEFAULT = 10;

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  success: "Success",
  partial_success: "Partial success",
  failed: "Failed",
};

// partial_success is a success with a delivery caveat — the file exists and is
// downloadable, so it must not read as an error.
const STATUS_COLOR: Record<string, "default" | "info" | "success" | "warning" | "error"> = {
  queued: "default",
  running: "info",
  success: "success",
  partial_success: "warning",
  failed: "error",
};

export default function ReportRunsTable({ variant }: { variant: "live" | "archived" }) {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_DEFAULT);
  // Which run's analyses the drawer is showing. null = drawer closed, which also
  // disables the analyses query.
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  // Delete is permanent (unlike archive, which can be undone with restore), so
  // it is gated behind an explicit confirmation instead of firing on click.
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useReportRunsPage({
    archived: variant === "archived",
    limit: rowsPerPage,
    offset: page * rowsPerPage,
  });
  const { data: analyses, isLoading: analysesLoading } = useRunAnalyses(
    selectedRunId ?? undefined,
  );

  const archive = useArchiveRun();
  const restore = useRestoreRun();
  const remove = useDeleteRun();

  // Mirrors ArchiveTab's original handler: turn the Blob into an object URL,
  // trigger a save via a throwaway anchor, then revoke the URL. Without this
  // the returned Blob is discarded and clicking Download does nothing.
  const handleDownload = async (id: number, filename: string | null) => {
    try {
      const blob = await downloadReportRun(id);
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename ?? `report-${id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Failed to download report run:", error);
    }
  };

  const rows: any[] = data?.rows ?? [];
  // Gate on the server total, not the page length: an empty page 2 means "you
  // paged past the end", not "there is nothing here".
  const total = data?.total ?? rows.length;

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  if (!total) {
    return (
      <EmptyState
        icon={variant === "archived" ? Archive : FileText}
        message={
          variant === "archived"
            ? "No archived reports yet."
            : "No reports yet. Generate one, or run a template."
        }
        showBorder
      />
    );
  }

  return (
    <>
      <TableContainer sx={singleTheme.tableStyles.primary.frame}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Report</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Triggered by</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.output_filename ?? "—"}</TableCell>
                <TableCell>
                  <Tooltip title={r.error_message ?? ""} disableHoverListener={!r.error_message}>
                    <Chip
                      size="small"
                      label={STATUS_LABEL[r.status] ?? r.status}
                      color={STATUS_COLOR[r.status] ?? "default"}
                    />
                  </Tooltip>
                </TableCell>
                <TableCell>{r.triggered_by}</TableCell>
                <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Download">
                    <span>
                      <IconButton
                        aria-label="Download"
                        size="small"
                        disabled={!r.file_id}
                        onClick={() => handleDownload(r.id, r.output_filename ?? null)}
                      >
                        <Download size={16} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  {/* Always offered: whether a run produced analyses is only known
                      after fetching them, and the panel has its own empty state. */}
                  <Tooltip title="View analyses">
                    <IconButton
                      aria-label="View analyses"
                      size="small"
                      onClick={() => setSelectedRunId(r.id)}
                    >
                      <Sparkles size={16} />
                    </IconButton>
                  </Tooltip>
                  {variant === "live" ? (
                    <Tooltip title="Archive">
                      <IconButton
                        aria-label="Archive"
                        size="small"
                        onClick={() => archive.mutate(r.id)}
                      >
                        <Archive size={16} />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title="Restore">
                      <IconButton
                        aria-label="Restore"
                        size="small"
                        onClick={() => restore.mutate(r.id)}
                      >
                        <ArchiveRestore size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Delete">
                    <IconButton
                      aria-label="Delete"
                      size="small"
                      onClick={() => setPendingDeleteId(r.id)}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50]}
      />

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

      {pendingDeleteId != null && (
        <ConfirmationModal
          isOpen
          title="Delete report run permanently?"
          body={
            <Typography fontSize={13} color={theme.palette.text.primary}>
              This permanently deletes the report file and run record. This
              cannot be undone.
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Delete permanently"
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          onCancel={() => setPendingDeleteId(null)}
          onProceed={() => {
            remove.mutate(pendingDeleteId);
            setPendingDeleteId(null);
          }}
        />
      )}
    </>
  );
}
