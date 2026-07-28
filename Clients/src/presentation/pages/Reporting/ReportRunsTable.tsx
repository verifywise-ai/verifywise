/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * One table for both report lists. The Generate tab renders it with
 * variant="live" (archived_at IS NULL), the Archive tab with variant="archived".
 * Keeping them one component is what stops the two lists drifting apart the way
 * the files-based list and the runs list did.
 */
import { useEffect, useState } from "react";
import {
  Box,
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
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { Archive, ArchiveRestore, Download, Trash2, FileText, Sparkles } from "lucide-react";
import singleTheme from "../../themes/v1SingleTheme";
import { text as textColors } from "../../themes/palette";
import Chip from "../../components/Chip";
import { EmptyState } from "../../components/EmptyState";
import StandardTablePagination from "../../components/Table/StandardTablePagination";
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

// Spec §Frontend: report name, template name, status, scope, date, triggered by,
// and the row actions.
const COLUMNS = ["Report", "Template", "Status", "Scope", "Created", "Triggered by", "Actions"];

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  success: "Success",
  partial_success: "Partial success",
  failed: "Failed",
};

// partial_success is a success with a delivery caveat — the file exists and is
// downloadable, so it must not read as an error.
const STATUS_VARIANT: Record<string, "default" | "info" | "success" | "warning" | "error"> = {
  queued: "default",
  running: "info",
  success: "success",
  partial_success: "warning",
  failed: "error",
};

const CHANNEL_LABEL: Record<string, string> = {
  storage: "storage",
  emailLink: "email link",
  attachment: "attachment",
};

/**
 * What to show on hover over the status.
 *
 * error_message is only written on the failed path; a partial_success has a
 * NULL one and records which channel broke in delivery_status instead. Without
 * the second branch "Partial success" is a dead end for the user.
 */
const statusDetail = (r: any): string => {
  if (r.error_message) return r.error_message;
  const delivery = r.delivery_status;
  if (!delivery || typeof delivery !== "object") return "";
  const failed = Object.keys(CHANNEL_LABEL)
    .filter((k) => delivery[k]?.status === "failed")
    .map((k) => CHANNEL_LABEL[k]);
  return failed.length ? `Delivery failed: ${failed.join(", ")}` : "";
};

/**
 * A run has no output_filename until it succeeds — createRunQuery never sets
 * one and the failed path writes NULL — so a queued, running or failed row
 * would otherwise render as a bare dash. Those are exactly the rows Decision 3
 * of the spec exists to surface, so give them the run id. The template they
 * came from is the adjacent column; repeating it here would say nothing new.
 */
const reportName = (r: any): string => r.output_filename ?? `Run #${r.id}`;

/**
 * scope_project_id is the run's project (from config_snapshot, falling back to
 * the schedule); NULL means the report covers the whole organization. The title
 * can be missing if the project has since been deleted.
 */
const scopeLabel = (r: any): string => {
  if (r.scope_project_id == null) return "Organization";
  return r.scope_project_title ?? `Project #${r.scope_project_id}`;
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

  const rows: any[] = data?.rows ?? [];
  // Gate on the server total, not the page length: an empty page 2 means "you
  // paged past the end", not "there is nothing here".
  const total = data?.total ?? rows.length;
  const lastPage = Math.max(0, Math.ceil(total / rowsPerPage) - 1);

  // Archiving or deleting the last row of the last page shrinks the total out
  // from under `page`, leaving the user on an offset the server has nothing for.
  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

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

  const rangeStart = page * rowsPerPage + 1;
  const rangeEnd = Math.min(page * rowsPerPage + rowsPerPage, total);
  const bodyCell = singleTheme.tableStyles.primary.body.cell;

  return (
    <>
      <TableContainer sx={singleTheme.tableStyles.primary.frame}>
        <Table>
          <TableHead>
            <TableRow sx={singleTheme.tableStyles.primary.header.row}>
              {COLUMNS.map((h) => (
                <TableCell
                  key={h}
                  sx={singleTheme.tableStyles.primary.header.cell}
                  align={h === "Actions" ? "right" : "left"}
                >
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} sx={singleTheme.tableStyles.primary.body.row}>
                <TableCell sx={{ ...bodyCell, color: textColors.primary }}>
                  {reportName(r)}
                </TableCell>
                <TableCell sx={{ ...bodyCell, color: textColors.secondary }}>
                  {r.template_name ?? "—"}
                </TableCell>
                <TableCell sx={bodyCell}>
                  {(() => {
                    const detail = statusDetail(r);
                    return (
                      <Tooltip title={detail} disableHoverListener={!detail}>
                        <span>
                          <Chip
                            label={STATUS_LABEL[r.status] ?? r.status}
                            variant={STATUS_VARIANT[r.status] ?? "default"}
                            size="small"
                            uppercase={false}
                          />
                        </span>
                      </Tooltip>
                    );
                  })()}
                </TableCell>
                <TableCell sx={{ ...bodyCell, color: textColors.secondary }}>
                  {scopeLabel(r)}
                </TableCell>
                <TableCell sx={{ ...bodyCell, color: textColors.secondary }}>
                  {new Date(r.created_at).toLocaleString()}
                </TableCell>
                <TableCell sx={{ ...bodyCell, color: textColors.secondary }}>
                  {r.triggered_by}
                </TableCell>
                <TableCell sx={bodyCell} align="right">
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
            entityLabel="report"
            colSpan={COLUMNS.length}
          />
        </Table>
      </TableContainer>

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
