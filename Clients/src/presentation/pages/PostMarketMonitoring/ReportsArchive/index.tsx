/**
 * Reports Archive Page
 *
 * Page for viewing and downloading past monitoring reports.
 * Includes filtering by use case, date range, and flagged status.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box,
  Stack,
  Typography,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TablePagination,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  useTheme,
} from "@mui/material";
import { Download, Flag, Calendar } from "lucide-react";
import { PageBreadcrumbs } from "../../../components/breadcrumbs/PageBreadcrumbs";
import { CustomizableButton } from "../../../components/button/customizable-button";
import DatePicker from "../../../components/Inputs/Datepicker";
import Alert from "../../../components/Alert";
import { pmmService } from "../../../../infrastructure/api/postMarketMonitoringService";
import {
  PMMReportWithDetails,
  PMMReportsFilterRequest,
} from "../../../../domain/types/PostMarketMonitoring";
import { useSearchParams } from "react-router";
import dayjs, { Dayjs } from "dayjs";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import { AlertState } from "../../../../application/interfaces/appStates";
import useProjectData from "../../../../application/hooks/useProjectData";
import { radiusPx } from "../../../themes/palette";

interface LocalAlertState extends AlertState {
  isToast: boolean;
  visible: boolean;
}

/** Reads `?projectId=` as a positive integer; anything else means "all use cases". */
const parseProjectId = (raw: string | null): number | undefined => {
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};

const ReportsArchive: React.FC = () => {
  const formatDate = useFormattedDate();
  const theme = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = parseProjectId(searchParams.get("projectId"));
  const { project: scopedProject } = useProjectData({ projectId: projectId?.toString() ?? "" });

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [reports, setReports] = useState<PMMReportWithDetails[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [alert, setAlert] = useState<LocalAlertState | null>(null);

  // Filters
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  // A new use case scope starts from the first page, however the URL changed
  useEffect(() => {
    setPage(0);
  }, [projectId]);

  // Only the latest request may write to state; an older one can finish later
  const latestRequestRef = useRef(0);

  // Show alert helper - defined before loadReports to avoid ESLint warning
  const showAlert = useCallback(
    (variant: LocalAlertState["variant"], body: string, title?: string) => {
      setAlert({ variant, body, title, isToast: true, visible: true });
      setTimeout(() => setAlert(null), 3000);
    },
    [],
  );

  // Load reports
  const loadReports = useCallback(async () => {
    // Validate date range before API call
    if (startDate && endDate && dayjs(startDate).isAfter(dayjs(endDate))) {
      showAlert("error", "Start date cannot be after end date");
      return;
    }

    const requestId = ++latestRequestRef.current;
    setIsLoading(true);
    try {
      const filters: PMMReportsFilterRequest = {
        page: page + 1, // API uses 1-based pagination
        limit: rowsPerPage,
        flagged_only: flaggedOnly,
      };

      if (projectId) {
        filters.project_id = projectId;
      }

      if (startDate) {
        filters.start_date = startDate;
      }
      if (endDate) {
        filters.end_date = endDate;
      }

      const response = await pmmService.getReports(filters);
      if (requestId !== latestRequestRef.current) return;
      setReports(response.reports);
      setTotal(response.total);
    } catch (error) {
      if (requestId !== latestRequestRef.current) return;
      console.error("Error loading reports:", error);
      showAlert("error", "Failed to load reports");
    } finally {
      if (requestId === latestRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [page, rowsPerPage, startDate, endDate, flaggedOnly, projectId, showAlert]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Handle page change
  const handleChangePage = useCallback((_: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  // Handle rows per page change
  const handleChangeRowsPerPage = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  // Handle download
  const handleDownload = useCallback(
    async (reportId: number) => {
      try {
        await pmmService.downloadReport(reportId);
      } catch (error) {
        console.error("Error downloading report:", error);
        showAlert("error", "Failed to download report. Please try again.");
      }
    },
    [showAlert],
  );

  // Reset filters
  const handleResetFilters = useCallback(() => {
    setStartDate("");
    setEndDate("");
    setFlaggedOnly(false);
    setPage(0);
  }, []);

  // Drop the use case scope and list reports for every use case
  const handleShowAllUseCases = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("projectId");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return startDate || endDate || flaggedOnly;
  }, [startDate, endDate, flaggedOnly]);

  // Styles
  const cardStyle = {
    backgroundColor: theme.palette.background.main,
    border: `1px solid ${theme.palette.border.dark}`,
    borderRadius: radiusPx.sm,
    padding: "24px",
  };

  const tableHeaderStyle = {
    fontSize: 12,
    fontWeight: 600,
    color: theme.palette.other.icon,
    backgroundColor: theme.palette.background.accent,
    borderBottom: `1px solid ${theme.palette.border.light}`,
    padding: "12px 16px",
  };

  const textButtonStyle = {
    "height": "30px",
    "fontSize": 13,
    "&:hover": {
      backgroundColor: theme.palette.background.accent,
    },
  };

  const tableCellStyle = {
    fontSize: 13,
    color: theme.palette.text.primary,
    borderBottom: `1px solid ${theme.palette.border.light}`,
    padding: "16px",
  };

  return (
    <Stack>
      <PageBreadcrumbs showDivider={false} />

      {alert && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={true}
          onClick={() => setAlert(null)}
        />
      )}

      {/* Header */}
      <Stack spacing={1} mb={4}>
        <Typography sx={{ fontSize: 16, fontWeight: 600, color: theme.palette.text.primary }}>
          Monitoring reports
        </Typography>
        {projectId ? (
          <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
            <Typography sx={{ fontSize: 13, color: theme.palette.other.icon }}>Use case</Typography>
            <Typography
              data-testid="pmm-reports-scope"
              sx={{ fontSize: 13, fontWeight: 500, color: theme.palette.text.primary }}
            >
              {scopedProject?.project_title ?? `#${projectId}`}
            </Typography>
            <CustomizableButton
              variant="text"
              text="Show all use cases"
              onClick={handleShowAllUseCases}
              testId="pmm-reports-show-all"
              sx={{ ...textButtonStyle, color: theme.palette.primary.main }}
            />
          </Stack>
        ) : (
          <Typography sx={{ fontSize: 13, color: theme.palette.other.icon }}>
            View and download past monitoring cycle reports
          </Typography>
        )}
      </Stack>

      {/* Filters */}
      <Box sx={{ ...cardStyle, mb: 3 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          gap={2}
        >
          <Stack direction="row" alignItems="center" spacing={3} flexWrap="wrap">
            {/* Date range */}
            <Stack direction="row" alignItems="center" spacing={1}>
              <Calendar size={16} color={theme.palette.other.icon} />
              <Typography sx={{ fontSize: 13, color: theme.palette.other.icon }}>From:</Typography>
              <DatePicker
                label=""
                date={startDate ? dayjs(startDate) : null}
                handleDateChange={(date: Dayjs | null) => setStartDate(date?.toISOString() || "")}
                sx={{ width: 140 }}
                disabled={isLoading}
              />
              <Typography sx={{ fontSize: 13, color: theme.palette.other.icon }}>To:</Typography>
              <DatePicker
                label=""
                date={endDate ? dayjs(endDate) : null}
                handleDateChange={(date: Dayjs | null) => setEndDate(date?.toISOString() || "")}
                sx={{ width: 140 }}
                disabled={isLoading}
              />
            </Stack>

            {/* Flagged only */}
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={flaggedOnly}
                  onChange={(e) => setFlaggedOnly(e.target.checked)}
                  disabled={isLoading}
                  sx={{
                    "&.Mui-checked": { color: theme.palette.primary.main },
                  }}
                />
              }
              label={
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Flag size={14} color={theme.palette.status.error.text} />
                  <Typography sx={{ fontSize: 13 }}>Flagged only</Typography>
                </Stack>
              }
            />
          </Stack>

          {/* Reset button */}
          {hasActiveFilters && (
            <CustomizableButton
              variant="text"
              text="Reset filters"
              onClick={handleResetFilters}
              sx={{ ...textButtonStyle, color: theme.palette.other.icon }}
            />
          )}
        </Stack>
      </Box>

      {/* Reports table */}
      <Box sx={cardStyle}>
        {isLoading ? (
          <Stack alignItems="center" justifyContent="center" py={8}>
            <CircularProgress size={32} />
          </Stack>
        ) : reports.length === 0 ? (
          <Stack alignItems="center" justifyContent="center" py={8}>
            <Typography sx={{ fontSize: 13, color: theme.palette.other.icon }}>
              No reports found
              {hasActiveFilters && ". Try adjusting your filters."}
            </Typography>
          </Stack>
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    {!projectId && <TableCell sx={tableHeaderStyle}>Use case</TableCell>}
                    <TableCell sx={tableHeaderStyle}>Cycle</TableCell>
                    <TableCell sx={tableHeaderStyle}>Completed</TableCell>
                    <TableCell sx={tableHeaderStyle}>By</TableCell>
                    <TableCell sx={tableHeaderStyle} align="center">
                      Flagged
                    </TableCell>
                    <TableCell sx={tableHeaderStyle} align="right">
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow
                      key={report.id}
                      sx={{
                        "&:hover": { backgroundColor: theme.palette.background.accent },
                      }}
                    >
                      {!projectId && (
                        <TableCell sx={tableCellStyle}>
                          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                            {report.project_title}
                          </Typography>
                        </TableCell>
                      )}
                      <TableCell sx={tableCellStyle}>#{report.cycle_number}</TableCell>
                      <TableCell sx={tableCellStyle}>
                        {report.completed_at ? formatDate(report.completed_at) : "-"}
                      </TableCell>
                      <TableCell sx={tableCellStyle}>{report.completed_by_name || "-"}</TableCell>
                      <TableCell sx={tableCellStyle} align="center">
                        {report.has_flagged_concerns ? (
                          <Flag size={16} color={theme.palette.status.error.text} />
                        ) : (
                          <Typography sx={{ fontSize: 13, color: theme.palette.other.icon }}>
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={tableCellStyle} align="right">
                        <CustomizableButton
                          variant="text"
                          text="Download"
                          icon={<Download size={14} />}
                          onClick={() => report.id && handleDownload(report.id)}
                          sx={{
                            "height": "30px",
                            "color": theme.palette.primary.main,
                            "fontSize": 13,
                            "&:hover": {
                              backgroundColor: theme.palette.status.success.bg,
                            },
                          }}
                        />
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
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[5, 10, 25, 50]}
              sx={{
                "borderTop": `1px solid ${theme.palette.border.light}`,
                "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
                  fontSize: 13,
                },
              }}
            />
          </>
        )}
      </Box>
    </Stack>
  );
};

export default ReportsArchive;
