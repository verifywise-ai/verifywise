/**
 * @fileoverview AI Detection Repositories Page
 *
 * Page for managing registered repositories and their scan schedules.
 * Shows a table with repo info, schedule status, last scan, and actions.
 *
 * @module pages/AIDetection/RepositoriesPage
 */

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableFooter,
  TablePagination,
  useTheme,
} from "@mui/material";
import Chip from "../../components/Chip";
import Alert from "../../components/Alert";
import { CustomizableButton } from "../../components/button/customizable-button";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import TablePaginationActions from "../../components/TablePagination";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { Play, Pencil, Trash2, Loader2, GitBranch, Github, Shield, RefreshCw } from "lucide-react";
import axios from "axios";
import {
  getRepositories,
  createRepository,
  updateRepository,
  deleteRepository,
  triggerRepositoryScan,
} from "../../../application/repository/aiDetectionRepository.repository";
import {
  AIDetectionRepository,
  CreateRepositoryInput,
  UpdateRepositoryInput,
  RepositoriesResponse,
} from "../../../domain/ai-detection/repositoryTypes";
import { useAIDetectionSidebarContext } from "../../../application/contexts/AIDetectionSidebar.context";
import AddRepositoryModal from "./AddRepositoryModal";
import { palette } from "../../themes/palette";
import singleTheme from "../../themes/v1SingleTheme";
import { keyframes } from "@mui/system";

const spin = keyframes`from { transform: rotate(0deg); } to { transform: rotate(360deg); }`;

const ROWS_PER_PAGE_KEY = "verifywise_ai_detection_repos_rows_per_page";

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.data?.message ?? err.message ?? fallback;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return fallback;
}

function formatSchedule(repo: AIDetectionRepository): string {
  if (!repo.schedule_enabled) return "Disabled";

  const hourStr = String(repo.schedule_hour).padStart(2, "0");
  const minuteStr = String(repo.schedule_minute).padStart(2, "0");
  const time = `${hourStr}:${minuteStr} UTC`;

  switch (repo.schedule_frequency) {
    case "daily":
      return `Daily at ${time}`;
    case "weekly": {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return `Weekly ${days[repo.schedule_day_of_week ?? 0]} at ${time}`;
    }
    case "monthly":
      return `Monthly day ${repo.schedule_day_of_month ?? 1} at ${time}`;
    default:
      return "Disabled";
  }
}

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatNextScan(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getStatusChipColor(status: string | null | undefined): "success" | "error" | "info" | "default" {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "pending":
    case "cloning":
    case "scanning":
      return "info";
    default:
      return "default";
  }
}

const TABLE_COLUMNS = [
  { id: "repository", label: "REPOSITORY" },
  { id: "schedule", label: "SCHEDULE" },
  { id: "last_scan", label: "LAST SCAN" },
  { id: "next_scan", label: "NEXT SCAN" },
  { id: "actions", label: "", align: "right" as const },
];

export default function RepositoriesPage() {
  const theme = useTheme();
  const { startTrackingScan, refreshRecentScans, refreshRepositoryCount } = useAIDetectionSidebarContext();

  const [repositories, setRepositories] = useState<AIDetectionRepository[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = localStorage.getItem(ROWS_PER_PAGE_KEY);
    return saved ? parseInt(saved, 10) : 10;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRepo, setEditingRepo] = useState<AIDetectionRepository | null>(null);
  const [focusSchedule, setFocusSchedule] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AIDetectionRepository | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Alert state (toast pattern matching HistoryPage)
  const [alert, setAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);

  // Track repos with active scans for polling
  const [scanningRepoIds, setScanningRepoIds] = useState<Set<number>>(new Set());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevScanningIdsRef = useRef<Set<number>>(new Set());

  const fetchRepositories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response: RepositoriesResponse = await getRepositories(page + 1, rowsPerPage);
      setRepositories(response.repositories);
      setTotal(response.pagination.total);

      // Detect repos with active scans (status is pending/cloning/scanning)
      const activeIds = new Set<number>();
      for (const repo of response.repositories) {
        if (repo.last_scan_status && ["pending", "cloning", "scanning"].includes(repo.last_scan_status)) {
          activeIds.add(repo.id);
        }
      }

      // Detect repos that just finished scanning (were active, now aren't)
      const prevIds = prevScanningIdsRef.current;
      if (prevIds.size > 0) {
        for (const repo of response.repositories) {
          if (prevIds.has(repo.id) && !activeIds.has(repo.id)) {
            const name = `${repo.repository_owner}/${repo.repository_name}`;
            if (repo.last_scan_status === "completed") {
              showAlert("success", `Scan completed for ${name}`);
            } else if (repo.last_scan_status === "failed") {
              showAlert("error", `Scan failed for ${name}`);
            }
          }
        }
      }

      prevScanningIdsRef.current = activeIds;
      setScanningRepoIds(activeIds);
    } catch (err) {
      setError("Failed to load repositories.");
    } finally {
      setIsLoading(false);
    }
  }, [page, rowsPerPage]);

  useEffect(() => {
    fetchRepositories();
  }, [fetchRepositories]);

  // Poll for scan progress when repos are actively scanning
  useEffect(() => {
    if (scanningRepoIds.size > 0) {
      pollIntervalRef.current = setInterval(() => {
        fetchRepositories();
      }, 5000);
    } else if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [scanningRepoIds.size, fetchRepositories]);

  const handleCreate = () => {
    setEditingRepo(null);
    setModalOpen(true);
  };

  const handleEdit = (repo: AIDetectionRepository) => {
    setEditingRepo(repo);
    setFocusSchedule(false);
    setModalOpen(true);
  };

  const handleEditSchedule = (repo: AIDetectionRepository) => {
    setEditingRepo(repo);
    setFocusSchedule(true);
    setModalOpen(true);
  };

  const handleModalSubmit = async (data: CreateRepositoryInput | UpdateRepositoryInput) => {
    setIsSubmitting(true);
    try {
      if (editingRepo) {
        await updateRepository(editingRepo.id, data as UpdateRepositoryInput);
        showAlert("success", "Repository updated successfully.");
      } else {
        await createRepository(data as CreateRepositoryInput);
        showAlert("success", "Repository added successfully.");
        refreshRepositoryCount();
      }
      setModalOpen(false);
      setEditingRepo(null);
      await fetchRepositories();
    } catch (err: unknown) {
      const message = extractErrorMessage(err, "Operation failed.");
      showAlert("error", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    // Block deletion if a scan is actively running for this repo
    if (scanningRepoIds.has(deleteTarget.id)) {
      showAlert("error", "Cannot delete repository while a scan is in progress.");
      setDeleteTarget(null);
      return;
    }

    setIsDeleting(true);
    try {
      await deleteRepository(deleteTarget.id);
      showAlert("success", "Repository deleted successfully.");
      setDeleteTarget(null);
      await fetchRepositories();
      refreshRepositoryCount();
    } catch (err: unknown) {
      const message = extractErrorMessage(err, "Failed to delete repository.");
      showAlert("error", message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleScanNow = async (repo: AIDetectionRepository) => {
    try {
      const scan = await triggerRepositoryScan(repo.id);
      startTrackingScan(scan.id, `${repo.repository_owner}/${repo.repository_name}`);
      showAlert("success", `Scan started for ${repo.repository_owner}/${repo.repository_name}`);

      // Mark as scanning immediately for UI feedback
      setScanningRepoIds((prev) => new Set(prev).add(repo.id));

      refreshRecentScans();
      await fetchRepositories();
    } catch (err: unknown) {
      const message = extractErrorMessage(err, "Failed to start scan.");
      showAlert("error", message);
    }
  };

  const showAlert = (variant: "success" | "error", body: string) => {
    setAlert({ variant, body });
    setTimeout(() => setAlert(null), 3000);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(event.target.value, 10);
    setRowsPerPage(newValue);
    setPage(0);
    localStorage.setItem(ROWS_PER_PAGE_KEY, String(newValue));
  };

  const headerCellStyle = singleTheme.tableStyles.primary.header.cell;
  const bodyCellStyle = singleTheme.tableStyles.primary.body.cell;

  // Loading state
  if (isLoading && repositories.length === 0) {
    return (
      <PageHeaderExtended
        title="Repositories"
        description="Register repositories and configure automated scan schedules."
        helpArticlePath="ai-detection/repositories"
        actionButton={
          <CustomizableButton
            text="Add repository"
            variant="contained"
            onClick={handleCreate}
            sx={{ height: 34 }}
          />
        }
      >
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="body1" sx={{ color: palette.text.tertiary }}>
            Loading repositories...
          </Typography>
        </Box>
      </PageHeaderExtended>
    );
  }

  return (
    <PageHeaderExtended
      title="Repositories"
      description="Register repositories and configure automated scan schedules."
      helpArticlePath="ai-detection/repositories"
      actionButton={
        <CustomizableButton
          text="Add repository"
          variant="contained"
          onClick={handleCreate}
          sx={{ height: 34 }}
        />
      }
      alert={
        alert ? (
          <Suspense fallback={null}>
            <Alert
              variant={alert.variant}
              body={alert.body}
              isToast={true}
              onClick={() => setAlert(null)}
            />
          </Suspense>
        ) : undefined
      }
    >
      {/* Error state */}
      {error && (
        <Alert variant="error" title="Error" body={error} />
      )}

      {/* Table — always shown, with empty state inside when no repos */}
      {!error && (
        <TableContainer
          sx={{
            backgroundColor: palette.background.main,
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <Table sx={singleTheme.tableStyles.primary.frame}>
            <TableHead
              sx={{
                backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
              }}
            >
              <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                {TABLE_COLUMNS.map((col) => (
                  <TableCell
                    key={col.id}
                    sx={headerCellStyle}
                    align={col.align}
                  >
                    {col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {repositories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={TABLE_COLUMNS.length} sx={{ p: 0, border: 0 }}>
                    <EmptyState
                      icon={GitBranch}
                      message="No repositories added yet. Add a repository to start detecting AI components."
                    >
                      <EmptyStateTip
                        icon={Github}
                        title="Connect your GitHub repositories"
                        description="Paste a GitHub repository URL and the system will scan its codebase for AI/ML libraries, model files, and inference endpoints."
                      />
                      <EmptyStateTip
                        icon={Shield}
                        title="Detect shadow AI"
                        description="Find undocumented AI usage in your codebase. Identify libraries and models that haven't been registered in your AI inventory."
                      />
                      <EmptyStateTip
                        icon={RefreshCw}
                        title="Schedule recurring scans"
                        description="Set up automatic scans to run on a schedule. Get notified when new AI components are detected in your repositories."
                      />
                    </EmptyState>
                  </TableCell>
                </TableRow>
              ) : (
                repositories.map((repo) => (
                  <TableRow
                    key={repo.id}
                    onClick={() => handleEdit(repo)}
                    sx={{
                      ...singleTheme.tableStyles.primary.body.row,
                      cursor: "pointer",
                    }}
                  >
                    {/* Repository */}
                    <TableCell sx={bodyCellStyle}>
                      <Stack>
                        <Typography
                          sx={{
                            fontWeight: 600,
                            fontSize: "13px",
                            color: theme.palette.text.primary,
                          }}
                        >
                          {repo.repository_owner}/{repo.repository_name}
                        </Typography>
                        {repo.display_name && (
                          <Typography
                            sx={{
                              fontSize: "12px",
                              color: palette.text.accent,
                            }}
                          >
                            {repo.display_name}
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>

                    {/* Schedule */}
                    <TableCell sx={bodyCellStyle}>
                      <Box
                        component="span"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleEditSchedule(repo);
                        }}
                        sx={{ cursor: "pointer" }}
                      >
                        <Chip
                          label={formatSchedule(repo)}
                          variant={repo.schedule_enabled ? "info" : "default"}
                        />
                      </Box>
                    </TableCell>

                    {/* Last scan */}
                    <TableCell sx={bodyCellStyle}>
                      {repo.last_scan_at ? (
                        <Stack direction="row" alignItems="center" gap="8px">
                          <Typography sx={{ fontSize: "13px" }}>
                            {formatRelativeTime(repo.last_scan_at)}
                          </Typography>
                          {repo.last_scan_status && (
                            <Chip
                              label={repo.last_scan_status}
                              variant={getStatusChipColor(repo.last_scan_status)}
                            />
                          )}
                        </Stack>
                      ) : (
                        <Typography sx={{ fontSize: "13px", color: palette.text.accent }}>
                          Never
                        </Typography>
                      )}
                    </TableCell>

                    {/* Next scan */}
                    <TableCell sx={bodyCellStyle}>
                      <Typography sx={{ fontSize: "13px", color: palette.text.accent }}>
                        {repo.schedule_enabled ? formatNextScan(repo.next_scan_at) : "—"}
                      </Typography>
                    </TableCell>

                    {/* Actions */}
                    <TableCell sx={bodyCellStyle} align="right" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const isScanning = scanningRepoIds.has(repo.id);
                        return (
                          <Stack direction="row" justifyContent="flex-end" spacing={0.5}>
                            <Tooltip title={isScanning ? "Scanning..." : "Scan now"}>
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => handleScanNow(repo)}
                                  disabled={isScanning}
                                  sx={{ color: isScanning ? palette.text.accent : palette.brand.primary }}
                                >
                                  {isScanning ? (
                                    <Loader2 size={15} strokeWidth={1.5} style={{ animation: `${spin} 1s linear infinite` }} />
                                  ) : (
                                    <Play size={15} strokeWidth={1.5} />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Edit">
                              <IconButton
                                size="small"
                                onClick={() => handleEdit(repo)}
                                sx={{ color: palette.text.accent }}
                              >
                                <Pencil size={15} strokeWidth={1.5} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={isScanning ? "Cannot delete during scan" : "Delete"}>
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => setDeleteTarget(repo)}
                                  disabled={isScanning}
                                  sx={{ color: isScanning ? palette.text.accent : palette.status.error.text }}
                                >
                                  <Trash2 size={15} strokeWidth={1.5} />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Stack>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {repositories.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TablePagination
                    rowsPerPageOptions={[5, 10, 20]}
                    colSpan={TABLE_COLUMNS.length}
                    count={total}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                    ActionsComponent={TablePaginationActions}
                    sx={{
                      borderBottom: 0,
                      "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
                        fontSize: "13px",
                      },
                    }}
                  />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </TableContainer>
      )}

      {/* Add/Edit Modal */}
      <AddRepositoryModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingRepo(null);
          setFocusSchedule(false);
        }}
        onSubmit={handleModalSubmit}
        editingRepository={editingRepo}
        isSubmitting={isSubmitting}
        focusSchedule={focusSchedule}
      />

      {/* Delete Confirmation */}
      <ConfirmationModal
        isOpen={!!deleteTarget && !scanningRepoIds.has(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
        onProceed={handleDelete}
        title={`Delete "${deleteTarget?.repository_owner}/${deleteTarget?.repository_name}"?`}
        body={
          <Typography fontSize={13}>
            This will remove the repository from monitoring. Existing scan history will not be deleted.
          </Typography>
        }
        cancelText="Cancel"
        proceedText="Delete"
        proceedButtonColor="error"
        proceedButtonVariant="contained"
        isLoading={isDeleting}
      />
    </PageHeaderExtended>
  );
}
