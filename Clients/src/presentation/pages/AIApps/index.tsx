import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useCan } from "../../../application/hooks/useCan";
import { useNavigate, useParams } from "react-router";
import { Stack, Box, Typography } from "@mui/material";
import CustomizableSkeleton from "../../components/Skeletons";
import { ClipboardCheck, FileUp, Plus } from "lucide-react";

import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { CustomizableButton } from "../../components/button/customizable-button";
import { SearchBox } from "../../components/Search";
import Select from "../../components/Inputs/Select";
import { EmptyState } from "../../components/EmptyState";
import { useAiApps, useDeleteAiApp } from "../../../application/hooks/useAiApps";
import { AiAppStatus } from "../../../domain/enums/aiApp.enum";
import { IAIApp } from "../../../domain/interfaces/i.aiApp";
import Alert from "../../components/Alert";
import NewAIApp from "../../components/Modals/NewAIApp";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import AIAppsTable from "./AIAppsTable";
import AIAppDetail from "./AIAppDetail";
import AIAppImportModal from "./AIAppImportModal";
import AIAppBulkAssessModal from "./AIAppBulkAssessModal";
import BulkActionsToolbar, { type BulkAction } from "../../components/Table/BulkActionsToolbar";
import { useBulkSelection } from "../../../application/hooks/useBulkSelection";
import { useFetchAiAppIds } from "../../../application/hooks/useAiAppBulk";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";
import {
  mainStackStyle,
  toolbarStyle,
  filterRowStyle,
  controlButtonSx,
  controlSearchSx,
  controlSelectSx,
} from "./style";
import { STATUS_FILTER_OPTIONS } from "./utils";
import { MAX_BULK_ROWS } from "./bulkUtils";
import LifecycleTabs from "../../components/LifecycleTabs";
import { useAiAppStageCounts } from "../../../application/hooks/useAiAppLifecycle";
import PendingIntakeSubmissions from "../../components/LifecycleTabs/PendingIntakeSubmissions";
import { LifecycleStage } from "../../../domain/enums/lifecycleStage.enum";
import { useLifecycleTab } from "../../../application/hooks/useLifecycleTab";

const STAGE_STORAGE_KEY = "ai-apps-lifecycle-tab";

const STAGE_TOOLTIPS: Record<LifecycleStage, string> = {
  [LifecycleStage.IN_REVIEW]: "Intake requests and AI apps waiting for an approval decision",
  [LifecycleStage.PLANNED]: "AI apps that are not live yet",
  [LifecycleStage.LIVE]: "AI apps in use today",
  [LifecycleStage.RETIRED]: "AI apps that are no longer in use",
};

const STAGE_EMPTY: Record<LifecycleStage, string> = {
  [LifecycleStage.IN_REVIEW]: "No AI apps are waiting for review.",
  [LifecycleStage.PLANNED]: "No planned AI apps.",
  [LifecycleStage.LIVE]: "No live AI apps. Open a planned AI app and mark it as live.",
  [LifecycleStage.RETIRED]: "No retired AI apps.",
};

const getAppId = (app: IAIApp) => app.id as number;

export default function AIApps() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isCreatingDisabled = !useCan("aiApp.edit");
  const canEdit = useCan("aiApp.edit");
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<AiAppStatus | "all">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  // The app currently being edited; null means the modal is in "create" mode.
  const [editingApp, setEditingApp] = useState<IAIApp | null>(null);
  // The app pending delete confirmation; null means the confirmation is closed.
  const [appPendingDelete, setAppPendingDelete] = useState<IAIApp | null>(null);
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);

  // Auto-dismiss toasts after 3s (matches the pattern used across other pages).
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), 3000);
    return () => clearTimeout(timer);
  }, [alert]);

  // Lifecycle tabs (#5193). The list is paged on the server, so the counts
  // and stale markers come from the lifecycle summary, not from the rows.
  const [stage, handleStageChange] = useLifecycleTab(STAGE_STORAGE_KEY);
  // Pending AI app intake requests: no app exists until a reviewer approves
  // one, so they are counted in In review and listed above its table.
  const {
    summary: { data: lifecycleSummary, isLoading: isSummaryLoading },
    counts: stageCounts,
    pending: pendingSubmissions,
  } = useAiAppStageCounts();
  const pendingTotal = pendingSubmissions?.total ?? 0;
  const staleIds = useMemo(() => new Set(lifecycleSummary?.stale_ids ?? []), [lifecycleSummary]);
  const hasAnyApps = Object.values(lifecycleSummary?.counts ?? {}).some((n) => n > 0);

  // Each tab lists every app in its stage: the server filters, searches,
  // sorts and pages, so the tab count and the list always agree.
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sort, setSort] = useState<{ sortBy?: string; order?: "asc" | "desc" }>({});
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  // A new tab, filter, search or sort starts again on the first page: the
  // page is remembered only for the filters it was chosen under.
  const filterKey = [stage, statusFilter, debouncedSearch, sort.sortBy, sort.order].join("|");
  const [paging, setPaging] = useState({ key: filterKey, page: 0 });
  const page = paging.key === filterKey ? paging.page : 0;
  const setPage = (next: number) => setPaging({ key: filterKey, page: next });
  const handleSortChange = useCallback((key: string, direction: "asc" | "desc" | null) => {
    setSort(key && direction ? { sortBy: key, order: direction } : {});
  }, []);

  const { data, isLoading, error } = useAiApps({
    status: statusFilter === "all" ? undefined : statusFilter,
    lifecycleStage: stage,
    search: debouncedSearch || undefined,
    page: page + 1,
    limit: rowsPerPage,
    ...sort,
  });

  const deleteAiAppMutation = useDeleteAiApp();

  const apps = useMemo(() => data?.ai_apps ?? [], [data]);

  const {
    selectedIds,
    isSelected,
    toggle: toggleSelection,
    toggleAll,
    setAll: setAllSelected,
    clear: clearSelection,
    allSelected,
    someSelected,
    count: selectionCount,
  } = useBulkSelection<IAIApp>({ rows: apps, getId: getAppId });

  // Set when "Select all" matched more apps than one bulk action can take.
  const [cappedTotal, setCappedTotal] = useState<number | null>(null);
  const handleClearSelection = useCallback(() => {
    clearSelection();
    setCappedTotal(null);
  }, [clearSelection]);

  // A selection only means something under the filters it was made with. Sort
  // and page are left out on purpose: they do not change which apps match.
  const selectionKey = [stage, statusFilter, debouncedSearch].join("|");
  const selectionKeyRef = useRef(selectionKey);
  useEffect(() => {
    selectionKeyRef.current = selectionKey;
    handleClearSelection();
  }, [selectionKey, handleClearSelection]);

  const fetchAppIds = useFetchAiAppIds();
  const handleSelectAll = useCallback(async () => {
    const requestedFor = selectionKey;
    try {
      const { ids, total } = await fetchAppIds({
        status: statusFilter === "all" ? undefined : statusFilter,
        lifecycleStage: stage,
        search: debouncedSearch || undefined,
      });
      // The filters moved on while this was loading.
      if (selectionKeyRef.current !== requestedFor) return;
      // Replaces the selection, so a row picked by hand can't push it past the limit.
      clearSelection();
      setAllSelected(ids);
      setCappedTotal(total > MAX_BULK_ROWS ? total : null);
    } catch {
      setAlert({ variant: "error", body: t("Could not select all AI apps. Try again.") });
    }
  }, [
    selectionKey,
    fetchAppIds,
    statusFilter,
    stage,
    debouncedSearch,
    clearSelection,
    setAllSelected,
    t,
  ]);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isBulkAssessOpen, setIsBulkAssessOpen] = useState(false);
  // Kept apart from the selection, which clears once the assessments are requested.
  const [bulkAssessIds, setBulkAssessIds] = useState<number[]>([]);
  const bulkActions: BulkAction[] = [
    {
      id: "assess",
      label: t("Assess"),
      icon: <ClipboardCheck size={14} strokeWidth={1.5} />,
      onClick: () => {
        setBulkAssessIds(selectedIds);
        setIsBulkAssessOpen(true);
      },
    },
  ];

  // Distinguish a genuinely empty inventory from a search/filter that matched nothing,
  // so the explanatory placeholder only shows when there is no data at all.
  const hasNoApps = apps.length === 0 && !hasAnyApps && pendingTotal === 0;
  // Requests have no approval status, so a status filter hides them.
  const showRequests =
    stage === LifecycleStage.IN_REVIEW && statusFilter === "all" && pendingTotal > 0;

  const handleNewApp = useCallback(() => {
    setEditingApp(null);
    setIsModalOpen(true);
  }, []);

  const handleEditApp = useCallback((app: IAIApp) => {
    setEditingApp(app);
    setIsModalOpen(true);
  }, []);

  const handleViewApp = useCallback(
    (app: IAIApp) => {
      navigate(`/ai-apps/${app.id}`);
    },
    [navigate],
  );

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingApp(null);
  }, []);

  const handleRequestDelete = useCallback((app: IAIApp) => {
    setAppPendingDelete(app);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!appPendingDelete?.id) return;
    try {
      await deleteAiAppMutation.mutateAsync(appPendingDelete.id);
      if (isSelected(appPendingDelete.id)) toggleSelection(appPendingDelete.id);
      setAlert({ variant: "success", body: "AI app deleted successfully" });
    } catch {
      setAlert({ variant: "error", body: "Failed to delete AI app" });
    } finally {
      setAppPendingDelete(null);
    }
  }, [appPendingDelete, deleteAiAppMutation, isSelected, toggleSelection]);

  const handleModalSuccess = useCallback(() => {
    const wasEditing = !!editingApp;
    setIsModalOpen(false);
    setEditingApp(null);
    setAlert({
      variant: "success",
      body: wasEditing ? "AI app updated successfully" : "AI app created successfully",
    });
  }, [editingApp]);

  const handleCloseAlert = () => setAlert(null);

  if (id) {
    return <AIAppDetail />;
  }

  return (
    <PageHeaderExtended
      title="AI apps"
      description="Browse, approve and govern the AI applications your employees use."
      helpArticlePath="ai-governance/ai-apps"
    >
      <Stack sx={mainStackStyle}>
        <LifecycleTabs
          value={stage}
          onChange={handleStageChange}
          counts={stageCounts}
          isLoading={isSummaryLoading}
          tooltips={STAGE_TOOLTIPS}
          dataJoyrideId="ai-app-lifecycle-tabs"
        />
        <Box sx={toolbarStyle}>
          <Box sx={filterRowStyle}>
            <SearchBox
              placeholder="Search AI apps"
              value={searchTerm}
              onChange={(value) => setSearchTerm(value)}
              sx={{ ...controlSearchSx, width: 260 }}
            />
            <Select
              id="ai-apps-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AiAppStatus | "all")}
              items={[...STATUS_FILTER_OPTIONS]}
              sx={{ ...controlSelectSx, width: 160 }}
            />
          </Box>
          <Box sx={filterRowStyle}>
            <CustomizableButton
              text="Assessments"
              variant="outlined"
              startIcon={<ClipboardCheck size={16} strokeWidth={1.5} />}
              onClick={() => navigate("/ai-apps/assessments")}
              testId="ai-apps-assessments-link"
              sx={controlButtonSx}
            />
            <CustomizableButton
              text="Import"
              variant="outlined"
              startIcon={<FileUp size={16} strokeWidth={1.5} />}
              onClick={() => setIsImportOpen(true)}
              disabled={!canEdit}
              testId="ai-apps-import-button"
              sx={controlButtonSx}
            />
            <CustomizableButton
              text="New AI app"
              variant="contained"
              startIcon={<Plus size={16} strokeWidth={1.5} />}
              onClick={handleNewApp}
              disabled={isCreatingDisabled}
              sx={controlButtonSx}
            />
          </Box>
        </Box>

        {cappedTotal !== null && (
          <Alert
            variant="info"
            body={fill(
              t(
                "Selected the first {max} of {total} AI apps. Bulk actions handle up to {max} at a time.",
              ),
              { max: MAX_BULK_ROWS, total: cappedTotal },
            )}
            inline
          />
        )}

        {showRequests && (
          <PendingIntakeSubmissions
            pending={pendingSubmissions}
            searchTerm={debouncedSearch}
            description="Submitted through an intake form. The AI app is created when a reviewer approves the request."
          />
        )}

        {isLoading ? (
          <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
        ) : error ? (
          <EmptyState message="Failed to load AI apps. Please try again." showBorder />
        ) : (
          <AIAppsTable
            apps={apps}
            serverPaging={{
              total: data?.total ?? 0,
              page,
              rowsPerPage,
              onPageChange: setPage,
              onRowsPerPageChange: (next) => {
                setRowsPerPage(next);
                setPage(0);
              },
              onSortChange: handleSortChange,
            }}
            onEditApp={handleEditApp}
            onViewApp={handleViewApp}
            onDeleteApp={handleRequestDelete}
            staleIds={staleIds}
            selection={
              canEdit
                ? {
                    isSelected,
                    onToggle: toggleSelection,
                    onToggleAll: toggleAll,
                    allSelected,
                    someSelected,
                  }
                : undefined
            }
            emptyMessage={
              hasNoApps
                ? undefined
                : searchTerm.trim() || statusFilter !== "all"
                  ? "No AI apps match your search or filter criteria."
                  : showRequests
                    ? "No AI apps are waiting for an approval decision."
                    : STAGE_EMPTY[stage]
            }
            showEmptyTips={hasNoApps}
          />
        )}

        <NewAIApp
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSuccess={handleModalSuccess}
          app={editingApp}
        />

        {canEdit && (
          <BulkActionsToolbar
            count={selectionCount}
            onClear={handleClearSelection}
            actions={bulkActions}
            selectAll={{
              totalCount: Math.min(data?.total ?? 0, MAX_BULK_ROWS),
              onSelectAll: handleSelectAll,
            }}
          />
        )}

        {isImportOpen && <AIAppImportModal onClose={() => setIsImportOpen(false)} />}

        {isBulkAssessOpen && (
          <AIAppBulkAssessModal
            appIds={bulkAssessIds}
            onClose={() => setIsBulkAssessOpen(false)}
            onAssessed={handleClearSelection}
            onGoToAssessments={(questionnaireId) =>
              navigate(`/ai-apps/assessments?questionnaire_id=${questionnaireId}`)
            }
          />
        )}

        {appPendingDelete && (
          <ConfirmationModal
            isOpen
            title="Delete AI app"
            body={
              <Typography fontSize={13}>
                Are you sure you want to delete <strong>{appPendingDelete.name}</strong>? This
                action cannot be undone.
              </Typography>
            }
            cancelText="Cancel"
            proceedText="Delete AI app"
            onCancel={() => setAppPendingDelete(null)}
            onProceed={handleConfirmDelete}
            proceedButtonColor="error"
            proceedButtonVariant="contained"
            isLoading={deleteAiAppMutation.isPending}
          />
        )}

        {alert && (
          <Alert
            variant={alert.variant}
            title={alert.title}
            body={alert.body}
            isToast
            onClick={handleCloseAlert}
          />
        )}
      </Stack>
    </PageHeaderExtended>
  );
}
