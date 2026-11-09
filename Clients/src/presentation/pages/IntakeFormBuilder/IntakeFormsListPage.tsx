import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableFooter,
  TablePagination,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Snackbar,
  Alert,
  Stack,
  useTheme,
} from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import TabBar from "../../components/TabBar";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import {
  Plus,
  Settings,
  Edit,
  Trash2,
  Archive,
  Eye,
  Copy,
  FolderTree,
  Bot,
  ListIcon,
  ChevronsUpDown,
  ClipboardList,
  Inbox,
} from "lucide-react";
import {
  getAllIntakeForms,
  deleteIntakeForm,
  archiveIntakeForm,
  getPendingSubmissions,
  getSubmissionPreview,
  IntakeForm,
  IntakeSubmission,
  IntakeFormStatus,
  IntakeEntityType,
} from "../../../application/repository/intakeForm.repository";
import { SubmissionPreviewModal } from "./SubmissionPreviewModal";
import RiskTierChip from "./assessment/RiskTierChip";
import { LaneChip } from "./routing/LaneSection";
import {
  LANE_FILTER_ITEMS,
  hasPendingSecondReview,
  matchesLaneFilter,
  type LaneFilter,
} from "./routing/laneFilter";
import { useAuth } from "../../../application/hooks/useAuth";
import { useHasPermission } from "../../../application/hooks/useMyPermissions";
import { OversightTab } from "./oversight/OversightTab";
import { CustomizableButton } from "../../components/button/customizable-button";
import StandardModal from "../../components/Modals/StandardModal";
import Chip from "../../components/Chip";
import Select from "../../components/Inputs/Select";
import { EmptyState } from "../../components/EmptyState";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import SearchBox from "../../components/Search/SearchBox";
import TablePaginationActions from "../../components/TablePagination";
import singleTheme from "../../themes/v1SingleTheme";
import {
  tableFooterRowStyle,
  showingTextCellStyle,
  paginationStyle,
  paginationMenuProps,
  paginationSelectStyle,
} from "../ModelInventory/style";
import { pageOfLabel } from "../../components/Table/pageOfLabel";
import { PreviewRoleBanner } from "./preview/PreviewRoleBanner";
import {
  parsePreviewRole,
  PUBLIC_PREVIEW_QUERY,
  SIMULATE_ROLE_PARAM,
  SIMULATED_USER_ID,
  simulatedLaneRow,
  type PreviewRole,
} from "../../../application/utils/intakeRouting/previewRole";
import { usePollWhileVisible } from "../../../application/hooks/usePollWhileVisible";

// ============================================================================
// Helpers
// ============================================================================

function formatIntakeDate(
  date: Date | string,
  formatDate: ReturnType<typeof useFormattedDate>,
): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return formatDate(d);
}

const ENTITY_LABELS: Record<string, string> = {
  [IntakeEntityType.MODEL]: "Model inventory",
  [IntakeEntityType.USE_CASE]: "Use case",
  [IntakeEntityType.AI_APP]: "AI app",
};

// ============================================================================
// Table header cell style
// ============================================================================

// headerCellSx is defined inside the component to access theme

// ============================================================================
// Pagination helpers
// ============================================================================

const INTAKE_FORMS_ROWS_PER_PAGE_KEY = "verifywise_intake_forms_rows_per_page";

// How long a reviewed submission row stays green, as on other tables
const FLASH_DURATION_MS = 3000;

// How often an open page checks for new submissions while the browser tab is visible
const SUBMISSIONS_POLL_MS = 30_000;

const SelectorVertical = (props: React.SVGAttributes<SVGSVGElement>) => (
  <ChevronsUpDown size={16} {...props} />
);

// ============================================================================
// Main component
// ============================================================================

export function IntakeFormsListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const theme = useTheme();
  const formatDate = useFormattedDate();
  const { userId } = useAuth();

  // Main tab derived from URL path
  const canSeeOversight = useHasPermission("intakeForm.edit");
  const mainTab = location.pathname.includes("/intake-forms/submissions")
    ? "submissions"
    : location.pathname.includes("/intake-forms/oversight") && canSeeOversight
      ? "oversight"
      : "forms";

  // --- Forms state ---
  const [forms, setForms] = useState<IntakeForm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // --- Pagination state ---
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = localStorage.getItem(INTAKE_FORMS_ROWS_PER_PAGE_KEY);
    return saved ? parseInt(saved, 10) : 10;
  });
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedForm, setSelectedForm] = useState<IntakeForm | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({ open: false, message: "", severity: "info" });

  // --- Create form dialog state ---
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedEntityType, setSelectedEntityType] = useState<IntakeEntityType>(
    IntakeEntityType.USE_CASE,
  );

  // --- Submissions state ---
  const [submissions, setSubmissions] = useState<IntakeSubmission[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [submissionsSearch, setSubmissionsSearch] = useState("");
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<string>("all");
  const [laneFilter, setLaneFilter] = useState<LaneFilter>("all");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [oversightRefresh, setOversightRefresh] = useState(0);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<number | null>(null);
  const [flashSubmissionId, setFlashSubmissionId] = useState<number | null>(null);

  // Green row flash after a successful review. A new flash cancels the previous
  // timer so it cannot cut the new one short.
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flashSubmissionRow = useCallback((submissionId: number) => {
    clearTimeout(flashTimerRef.current);
    setFlashSubmissionId(submissionId);
    flashTimerRef.current = setTimeout(() => setFlashSubmissionId(null), FLASH_DURATION_MS);
  }, []);
  useEffect(() => () => clearTimeout(flashTimerRef.current), []);

  // ============================================================================
  // Data loading
  // ============================================================================

  const loadForms = useCallback(async () => {
    setIsLoading(true);
    try {
      // Always load all forms so status tab counts remain accurate
      const response = await getAllIntakeForms({});
      const data = response.data;
      setForms(Array.isArray(data) ? data : (data as { forms?: IntakeForm[] })?.forms || []);
    } catch {
      setSnackbar({ open: true, message: "Failed to load forms", severity: "error" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  // Only the latest request may set the list or clear the spinner, so a slow load
  // can't overwrite a newer one, for example one for a changed status filter.
  // A background refresh never replaces a load already in flight.
  const submissionsRequestRef = useRef(0);
  const submissionsInFlightRef = useRef(false);
  const loadSubmissions = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      if (quiet && submissionsInFlightRef.current) return;
      const requestId = ++submissionsRequestRef.current;
      submissionsInFlightRef.current = true;
      if (!quiet) setIsLoadingSubmissions(true);
      try {
        const params: { status?: string } = {};
        if (submissionStatusFilter !== "all") {
          params.status = submissionStatusFilter;
        }
        const response = await getPendingSubmissions(params);
        if (requestId !== submissionsRequestRef.current) return;
        setSubmissions(Array.isArray(response.data) ? response.data : []);
      } catch {
        // A failed background refresh keeps the list as it is; the next one retries.
        if (!quiet && requestId === submissionsRequestRef.current) {
          setSnackbar({ open: true, message: "Failed to load submissions", severity: "error" });
        }
      } finally {
        if (requestId === submissionsRequestRef.current) {
          submissionsInFlightRef.current = false;
          setIsLoadingSubmissions(false);
        }
      }
    },
    [submissionStatusFilter],
  );

  // The list chips and the Oversight tab both read what the review modal changes
  const refreshAfterReview = () => {
    loadSubmissions();
    setOversightRefresh((n) => n + 1);
  };

  const handleSubmissionDecided = (message: string) => {
    if (selectedSubmissionId !== null) flashSubmissionRow(selectedSubmissionId);
    refreshAfterReview();
    setSnackbar({ open: true, message, severity: "success" });
  };

  // Deep link from the second-review email: /intake-forms/submissions?submission=<id>.
  // Opens that submission whatever the list filters show, then drops the param
  // so a refresh or closing the modal does not reopen it.
  const deepLinkParam = searchParams.get("submission");
  useEffect(() => {
    if (deepLinkParam === null) return;
    const next = new URLSearchParams(searchParams);
    next.delete("submission");
    setSearchParams(next, { replace: true });
    const id = Number(deepLinkParam);
    if (!Number.isSafeInteger(id) || id <= 0 || !/^\d+$/.test(deepLinkParam)) {
      setSnackbar({ open: true, message: "That submission could not be found", severity: "error" });
      return;
    }
    getSubmissionPreview(id)
      .then(() => {
        setSelectedSubmissionId(id);
        setPreviewOpen(true);
      })
      .catch(() => {
        setSnackbar({
          open: true,
          message: "That submission could not be found",
          severity: "error",
        });
      });
    // Runs once per param value; searchParams is read to keep other params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkParam]);

  // Always load submissions so the tab badge count is accurate
  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  // New submissions from public forms show up without a reload. Paused while the
  // review modal is open; closing the modal refreshes the list.
  usePollWhileVisible(() => loadSubmissions({ quiet: true }), SUBMISSIONS_POLL_MS, !previewOpen);

  // "Preview as" simulation, entered from the builder's Preview menu. It lives
  // only in the URL and only on the Submissions tab, so it never carries over.
  const simulatedRole =
    mainTab === "submissions" ? parsePreviewRole(searchParams.get(SIMULATE_ROLE_PARAM)) : null;
  const setSimulatedRole = (role: PreviewRole | null) => {
    const next = new URLSearchParams(searchParams);
    if (role) next.set(SIMULATE_ROLE_PARAM, role);
    else next.delete(SIMULATE_ROLE_PARAM);
    setSearchParams(next, { replace: true });
  };

  // Filter forms by search query
  const filteredForms = forms.filter((form) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return form.name.toLowerCase().includes(q) || form.description.toLowerCase().includes(q);
    }
    return true;
  });

  // Pagination helpers
  const paginatedForms = filteredForms.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleChangePage = (
    _event: React.MouseEvent<HTMLButtonElement> | null,
    newPage: number,
  ) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const newVal = parseInt(event.target.value, 10);
    setRowsPerPage(newVal);
    setPage(0);
    localStorage.setItem(INTAKE_FORMS_ROWS_PER_PAGE_KEY, newVal.toString());
  };

  // Reset page when search changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(0);
  };

  const getRange = () => {
    if (filteredForms.length === 0) return "0 - 0";
    const start = page * rowsPerPage + 1;
    const end = Math.min((page + 1) * rowsPerPage, filteredForms.length);
    return `${start} - ${end}`;
  };

  // Filter submissions by search
  const filteredSubmissions = submissions.filter(
    (s) =>
      (simulatedRole
        ? matchesLaneFilter(simulatedLaneRow(s, simulatedRole), laneFilter, SIMULATED_USER_ID)
        : matchesLaneFilter(s, laneFilter, userId)) &&
      (!submissionsSearch ||
        (s.submitterName || "").toLowerCase().includes(submissionsSearch.toLowerCase()) ||
        (s.submitterEmail || "").toLowerCase().includes(submissionsSearch.toLowerCase())),
  );

  // ============================================================================
  // Form action handlers
  // ============================================================================

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, form: IntakeForm) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setSelectedForm(form);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleEdit = () => {
    if (selectedForm) {
      navigate(`/intake-forms/${selectedForm.id}/edit`);
    }
    handleMenuClose();
  };

  const handlePreview = () => {
    if (selectedForm?.publicId) {
      window.open(
        `/${selectedForm.publicId}/use-case-form-intake?${PUBLIC_PREVIEW_QUERY}`,
        "_blank",
      );
    } else {
      setSnackbar({
        open: true,
        message: "Publish the form first to generate a preview link",
        severity: "error",
      });
    }
    handleMenuClose();
  };

  const handleCopyLink = () => {
    if (selectedForm?.publicId) {
      const link = `${window.location.origin}/${selectedForm.publicId}/use-case-form-intake`;
      navigator.clipboard
        .writeText(link)
        .then(() =>
          setSnackbar({ open: true, message: "Link copied to clipboard", severity: "success" }),
        )
        .catch(() =>
          setSnackbar({ open: true, message: "Failed to copy link", severity: "error" }),
        );
    } else {
      setSnackbar({
        open: true,
        message: "Publish the form first to generate a shareable link",
        severity: "error",
      });
    }
    handleMenuClose();
  };

  const handleArchiveClick = () => {
    setArchiveModalOpen(true);
    handleMenuClose();
  };

  const handleArchiveConfirm = async () => {
    if (selectedForm) {
      setIsArchiving(true);
      try {
        await archiveIntakeForm(selectedForm.id);
        loadForms();
        setSnackbar({ open: true, message: "Form archived", severity: "success" });
      } catch {
        setSnackbar({ open: true, message: "Failed to archive form", severity: "error" });
      } finally {
        setIsArchiving(false);
        setArchiveModalOpen(false);
        setSelectedForm(null);
      }
    }
  };

  const handleDeleteClick = () => {
    setDeleteModalOpen(true);
    handleMenuClose();
  };

  const handleDeleteConfirm = async () => {
    if (selectedForm) {
      setIsDeleting(true);
      try {
        await deleteIntakeForm(selectedForm.id);
        loadForms();
        setSnackbar({ open: true, message: "Form deleted", severity: "success" });
      } catch (err: any) {
        const msg =
          err?.response?.data?.data?.message ||
          err?.response?.data?.message ||
          "Failed to delete form";
        setSnackbar({ open: true, message: msg, severity: "error" });
      } finally {
        setIsDeleting(false);
        setDeleteModalOpen(false);
        setSelectedForm(null);
      }
    }
  };

  const handleRowClick = (form: IntakeForm) => {
    navigate(`/intake-forms/${form.id}/edit`);
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <PageHeaderExtended
      title="Intake forms"
      description="Create and manage intake forms for external submissions"
      helpArticlePath="ai-governance/intake-forms"
    >
      {/* Main tabs: Forms / Submissions */}
      <TabContext value={mainTab}>
        <TabBar
          tabs={[
            {
              label: "Forms",
              value: "forms",
              icon: "FileText",
              count: forms.length,
              isLoading: isLoading,
            },
            {
              label: "Submissions",
              value: "submissions",
              icon: "Inbox",
              count: submissions.length,
              isLoading: isLoadingSubmissions,
            },
            ...(canSeeOversight
              ? [{ label: "Oversight", value: "oversight", icon: "Activity" as const }]
              : []),
          ]}
          activeTab={mainTab}
          onChange={(_, value) =>
            navigate(
              value === "submissions"
                ? "/intake-forms/submissions"
                : value === "oversight"
                  ? "/intake-forms/oversight"
                  : "/intake-forms",
            )
          }
        />
      </TabContext>

      {/* ================================================================ */}
      {/* Forms tab                                                        */}
      {/* ================================================================ */}
      {mainTab === "forms" && (
        <>
          {/* Search + Create form button */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: "8px" }}
          >
            <SearchBox
              placeholder="Search forms..."
              value={searchQuery}
              onChange={handleSearchChange}
              fullWidth={false}
            />
            <CustomizableButton
              variant="contained"
              onClick={() => setCreateDialogOpen(true)}
              sx={{
                "height": 34,
                "fontSize": "13px",
                "backgroundColor": theme.palette.primary.main,
                "&:hover": { backgroundColor: "brand.primaryHover" },
                "display": "flex",
                "alignItems": "center",
                "gap": "6px",
              }}
            >
              <Plus size={14} /> Create form
            </CustomizableButton>
          </Stack>

          {/* Table */}
          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress sx={{ color: theme.palette.primary.main }} />
            </Box>
          ) : filteredForms.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              message={
                searchQuery
                  ? "No forms match your search. Try adjusting your query."
                  : "Create your first intake form to get started."
              }
              showBorder
            />
          ) : (
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table sx={singleTheme.tableStyles.primary.frame}>
                <TableHead>
                  <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                    <TableCell sx={singleTheme.tableStyles.primary.header.cell}>
                      Form name
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.header.cell}>
                      Entity type
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.header.cell}>Status</TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.header.cell}>Fields</TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.header.cell}>Created</TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.header.cell}>Updated</TableCell>
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.header.cell,
                        width: 48,
                        minWidth: 48,
                      }}
                    />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedForms.map((form) => (
                    <TableRow
                      key={form.id}
                      onClick={() => handleRowClick(form)}
                      sx={singleTheme.tableStyles.primary.body.row}
                    >
                      <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                        <Box>
                          <Typography
                            sx={{
                              fontWeight: 500,
                              fontSize: "13px",
                              color: theme.palette.text.primary,
                            }}
                          >
                            {form.name}
                          </Typography>
                          {form.description && (
                            <Typography
                              sx={{
                                fontSize: "12px",
                                color: theme.palette.text.accent,
                                maxWidth: 300,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {form.description}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                        <Typography sx={{ fontSize: "13px", color: theme.palette.text.primary }}>
                          {ENTITY_LABELS[form.entityType] || form.entityType}
                        </Typography>
                      </TableCell>
                      <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                        <Chip label={form.status} />
                      </TableCell>
                      <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                        <Typography sx={{ fontSize: "13px", color: theme.palette.text.primary }}>
                          {form.schema?.fields?.length || 0}
                        </Typography>
                      </TableCell>
                      <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                        <Typography sx={{ fontSize: "13px", color: theme.palette.text.accent }}>
                          {formatIntakeDate(form.createdAt, formatDate)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                        <Typography sx={{ fontSize: "13px", color: theme.palette.text.accent }}>
                          {form.updatedAt ? formatIntakeDate(form.updatedAt, formatDate) : "\u2014"}
                        </Typography>
                      </TableCell>
                      <TableCell
                        sx={singleTheme.tableStyles.primary.body.cell}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IconButton
                          disableRipple={
                            theme.components?.MuiIconButton?.defaultProps?.disableRipple
                          }
                          sx={singleTheme.iconButtons}
                          onClick={(e) => handleMenuOpen(e, form)}
                        >
                          <Settings size={20} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow sx={tableFooterRowStyle(theme)}>
                    <TableCell sx={showingTextCellStyle(theme)}>
                      Showing {getRange()} of {filteredForms.length} form(s)
                    </TableCell>
                    <TablePagination
                      count={filteredForms.length}
                      page={page}
                      onPageChange={handleChangePage}
                      rowsPerPage={rowsPerPage}
                      rowsPerPageOptions={[5, 10, 15, 25]}
                      onRowsPerPageChange={handleChangeRowsPerPage}
                      ActionsComponent={(props) => <TablePaginationActions {...props} />}
                      labelRowsPerPage="Rows per page"
                      labelDisplayedRows={({ page: p, count }) =>
                        pageOfLabel(p + 1, Math.max(0, Math.ceil(count / rowsPerPage)))
                      }
                      slotProps={{
                        select: {
                          MenuProps: paginationMenuProps(theme),
                          inputProps: { id: "pagination-dropdown" },
                          IconComponent: SelectorVertical,
                          sx: paginationSelectStyle(theme),
                        },
                      }}
                      sx={paginationStyle(theme)}
                    />
                  </TableRow>
                </TableFooter>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* ================================================================ */}
      {/* Submissions tab                                                  */}
      {/* ================================================================ */}
      {mainTab === "oversight" && (
        <OversightTab
          forms={forms}
          refreshKey={oversightRefresh}
          onOpenSubmission={(id) => {
            setSelectedSubmissionId(id);
            setPreviewOpen(true);
          }}
          onOpenForm={(id) => navigate(`/intake-forms/${id}/edit`)}
        />
      )}

      {mainTab === "submissions" && (
        <>
          {simulatedRole && (
            <Box sx={{ mb: "8px" }}>
              <PreviewRoleBanner
                role={simulatedRole}
                onRoleChange={setSimulatedRole}
                onExit={() => setSimulatedRole(null)}
              />
            </Box>
          )}
          {/* Filter + Search */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: "8px" }}
          >
            <Stack direction="row" gap="8px">
              <Select
                id="submission-status-filter"
                value={submissionStatusFilter}
                onChange={(e) => setSubmissionStatusFilter(e.target.value as string)}
                items={[
                  { _id: "all", name: "All submissions" },
                  { _id: "pending", name: "Pending" },
                  { _id: "approved", name: "Approved" },
                  { _id: "rejected", name: "Rejected" },
                  { _id: "superseded", name: "Superseded" },
                ]}
                sx={{ width: 180, backgroundColor: theme.palette.background.main }}
              />
              <Select
                id="submission-lane-filter"
                value={laneFilter}
                onChange={(e) => {
                  const next = e.target.value as LaneFilter;
                  setLaneFilter(next);
                  // Second reviews sit on approved rows, so a pending-only,
                  // rejected-only or superseded-only view would always be empty.
                  if (
                    next === "second_review" &&
                    submissionStatusFilter !== "all" &&
                    submissionStatusFilter !== "approved"
                  ) {
                    setSubmissionStatusFilter("all");
                  }
                }}
                items={LANE_FILTER_ITEMS}
                sx={{ width: 180, backgroundColor: theme.palette.background.main }}
              />
            </Stack>
            <SearchBox
              placeholder="Search submissions..."
              value={submissionsSearch}
              onChange={setSubmissionsSearch}
              fullWidth={false}
            />
          </Stack>

          {/* Submissions table */}
          {isLoadingSubmissions ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress sx={{ color: theme.palette.primary.main }} />
            </Box>
          ) : filteredSubmissions.length === 0 ? (
            <EmptyState
              icon={Inbox}
              message="Submissions will appear here when external users fill in your published forms."
              showBorder
            />
          ) : (
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table sx={singleTheme.tableStyles.primary.frame}>
                <TableHead>
                  <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                    <TableCell sx={singleTheme.tableStyles.primary.header.cell}>
                      Submitter
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.header.cell}>Form</TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.header.cell}>Status</TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.header.cell}>
                      Risk tier
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.header.cell}>
                      Review level
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.header.cell}>
                      Submitted
                    </TableCell>
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.header.cell,
                        width: 100,
                        minWidth: 100,
                      }}
                    />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSubmissions.map((submission) => {
                    const matchingForm = forms.find((f) => f.id === submission.formId);
                    return (
                      <TableRow
                        key={submission.id}
                        onClick={() => {
                          if (submission.status === "superseded") return;
                          setSelectedSubmissionId(submission.id);
                          setPreviewOpen(true);
                        }}
                        sx={{
                          ...singleTheme.tableStyles.primary.body.row,
                          // The base row stripes even rows and greys cells on hover,
                          // so the flash overrides both selectors as well
                          ...(flashSubmissionId === submission.id && {
                            "backgroundColor": singleTheme.flashColors.background,
                            "&:nth-of-type(even)": {
                              backgroundColor: singleTheme.flashColors.background,
                            },
                            "&:hover": {
                              backgroundColor: singleTheme.flashColors.backgroundHover,
                            },
                            "&:hover td": {
                              backgroundColor: "transparent",
                            },
                          }),
                          cursor: submission.status === "superseded" ? "default" : "pointer",
                          ...(submission.status === "superseded" && { opacity: 0.5 }),
                        }}
                      >
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          <Typography
                            sx={{
                              fontWeight: 500,
                              fontSize: "13px",
                              color: theme.palette.text.primary,
                            }}
                          >
                            {submission.submitterName || submission.submitterEmail || "Anonymous"}
                          </Typography>
                          {submission.submitterName && submission.submitterEmail && (
                            <Typography sx={{ fontSize: "12px", color: theme.palette.text.accent }}>
                              {submission.submitterEmail}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          <Typography sx={{ fontSize: "13px", color: theme.palette.text.primary }}>
                            {matchingForm?.name || `Form #${submission.formId}`}
                          </Typography>
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          <Stack direction="row" alignItems="center" gap="8px">
                            <Chip label={submission.status} />
                            {submission.resubmissionCount > 0 &&
                              submission.status !== "superseded" && <Chip label="resubmitted" />}
                            {hasPendingSecondReview(submission) && (
                              <Chip label="Second review" variant="info" uppercase={false} />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          <RiskTierChip submission={submission} />
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          <LaneChip
                            routing={submission.routing}
                            routingEnabled={submission.routingEnabled}
                          />
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          <Typography sx={{ fontSize: "13px", color: theme.palette.text.accent }}>
                            {formatIntakeDate(submission.createdAt, formatDate)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          {submission.status !== "superseded" && (
                            <CustomizableButton
                              variant="outlined"
                              onClick={() => {
                                setSelectedSubmissionId(submission.id);
                                setPreviewOpen(true);
                              }}
                              sx={{
                                "height": 28,
                                "fontSize": "12px",
                                "borderColor": theme.palette.border.dark,
                                "color": theme.palette.text.secondary,
                                "&:hover": {
                                  borderColor: theme.palette.primary.main,
                                  backgroundColor: theme.palette.background.fill,
                                },
                              }}
                            >
                              Review
                            </CustomizableButton>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* Actions menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: {
            minWidth: 160,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
          },
        }}
      >
        <MenuItem onClick={handleEdit}>
          <ListItemIcon>
            <Edit size={18} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: "13px" }}>Edit</ListItemText>
        </MenuItem>
        {selectedForm?.status === IntakeFormStatus.ACTIVE && [
          <MenuItem key="preview" onClick={handlePreview}>
            <ListItemIcon>
              <Eye size={18} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: "13px" }}>Preview</ListItemText>
          </MenuItem>,
          <MenuItem key="copy" onClick={handleCopyLink}>
            <ListItemIcon>
              <Copy size={18} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: "13px" }}>Copy link</ListItemText>
          </MenuItem>,
          <MenuItem key="archive" onClick={handleArchiveClick}>
            <ListItemIcon>
              <Archive size={18} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: "13px" }}>Archive</ListItemText>
          </MenuItem>,
        ]}
        {(selectedForm?.status === IntakeFormStatus.DRAFT ||
          selectedForm?.status === IntakeFormStatus.ARCHIVED) && (
          <MenuItem onClick={handleDeleteClick} sx={{ color: theme.palette.status.error.text }}>
            <ListItemIcon>
              <Trash2 size={18} color={theme.palette.status.error.text} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: "13px" }}>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Create form dialog — choose entity type */}
      <StandardModal
        title="Create new form"
        description="What type of entity will this form create?"
        isOpen={createDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false);
          setSelectedEntityType(IntakeEntityType.USE_CASE);
        }}
        onSubmit={() => {
          setCreateDialogOpen(false);
          navigate(`/intake-forms/new/edit?entityType=${selectedEntityType}`);
          setSelectedEntityType(IntakeEntityType.USE_CASE);
        }}
        submitButtonText="Continue"
        maxWidth="440px"
        fitContent
      >
        <Stack gap="12px">
          {[
            {
              type: IntakeEntityType.USE_CASE,
              label: "Use case",
              description: "Collect information about an AI use case or project",
              icon: (
                <FolderTree
                  size={20}
                  strokeWidth={1.5}
                  color={
                    selectedEntityType === IntakeEntityType.USE_CASE
                      ? theme.palette.primary.main
                      : theme.palette.other.icon
                  }
                />
              ),
            },
            {
              type: IntakeEntityType.AI_APP,
              label: "AI app",
              description: "Collect requests to use an AI app",
              icon: (
                <Bot
                  size={20}
                  strokeWidth={1.5}
                  color={
                    selectedEntityType === IntakeEntityType.AI_APP
                      ? theme.palette.primary.main
                      : theme.palette.other.icon
                  }
                />
              ),
            },
            {
              type: IntakeEntityType.MODEL,
              label: "Model inventory",
              description: "Collect information about an AI model",
              icon: (
                <ListIcon
                  size={20}
                  strokeWidth={1.5}
                  color={
                    selectedEntityType === IntakeEntityType.MODEL
                      ? theme.palette.primary.main
                      : theme.palette.other.icon
                  }
                />
              ),
            },
          ].map((option) => (
            <Box
              key={option.type}
              onClick={() => setSelectedEntityType(option.type)}
              sx={{
                "display": "flex",
                "alignItems": "center",
                "gap": "12px",
                "p": "12px",
                "border":
                  selectedEntityType === option.type
                    ? `1px solid ${theme.palette.primary.main}`
                    : `1px solid ${theme.palette.border.dark}`,
                "borderRadius": "4px",
                "cursor": "pointer",
                "backgroundColor":
                  selectedEntityType === option.type
                    ? theme.palette.background.fill
                    : theme.palette.background.main,
                "transition": "all 0.15s ease",
                "&:hover": {
                  borderColor:
                    selectedEntityType === option.type
                      ? theme.palette.primary.main
                      : theme.palette.text.accent,
                },
              }}
            >
              <Box sx={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{option.icon}</Box>
              <Box>
                <Typography
                  sx={{ fontSize: "13px", fontWeight: 600, color: theme.palette.text.secondary }}
                >
                  {option.label}
                </Typography>
                <Typography sx={{ fontSize: "12px", color: theme.palette.other.icon }}>
                  {option.description}
                </Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      </StandardModal>

      {/* Archive confirmation modal */}
      <StandardModal
        title="Archive form"
        description={`Are you sure you want to archive "${selectedForm?.name}"? The public link will stop accepting new submissions.`}
        isOpen={archiveModalOpen}
        onClose={() => {
          setArchiveModalOpen(false);
          setSelectedForm(null);
        }}
        onSubmit={handleArchiveConfirm}
        submitButtonText={isArchiving ? "Archiving..." : "Archive"}
        isSubmitting={isArchiving}
        maxWidth="440px"
        fitContent
      />

      {/* Delete confirmation modal */}
      <StandardModal
        title="Delete form"
        description={`Are you sure you want to delete "${selectedForm?.name}"? This action cannot be undone and all submissions will be lost.`}
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSelectedForm(null);
        }}
        onSubmit={handleDeleteConfirm}
        submitButtonText={isDeleting ? "Deleting..." : "Delete"}
        submitButtonColor="#c62828"
        isSubmitting={isDeleting}
        maxWidth="440px"
        fitContent
      />

      {/* Submission preview modal */}
      <SubmissionPreviewModal
        isOpen={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          setSelectedSubmissionId(null);
          loadSubmissions({ quiet: true });
        }}
        submissionId={selectedSubmissionId}
        onApproved={() => handleSubmissionDecided("Submission approved")}
        onRejected={() => handleSubmissionDecided("Submission rejected")}
        onChanged={refreshAfterReview}
        simulatedRole={simulatedRole}
        onSimulatedRoleChange={setSimulatedRole}
        onExitSimulation={() => setSimulatedRole(null)}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </PageHeaderExtended>
  );
}

export default IntakeFormsListPage;
