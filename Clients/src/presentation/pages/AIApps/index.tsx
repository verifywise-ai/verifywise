import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Stack, Box, Skeleton, Typography } from "@mui/material";
import { Plus, Bot, ShieldCheck, ScanSearch, ClipboardCheck } from "lucide-react";

import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { CustomizableButton } from "../../components/button/customizable-button";
import { SearchBox } from "../../components/Search";
import Select from "../../components/Inputs/Select";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { useAiApps, useDeleteAiApp } from "../../../application/hooks/useAiApps";
import { AiAppStatus } from "../../../domain/enums/aiApp.enum";
import { IAIApp } from "../../../domain/interfaces/i.aiApp";
import { useAuth } from "../../../application/hooks/useAuth";
import Alert from "../../components/Alert";
import NewAIApp from "../../components/Modals/NewAIApp";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import AIAppsTable from "./AIAppsTable";
import AIAppDetail from "./AIAppDetail";
import { mainStackStyle, toolbarStyle, filterRowStyle } from "./style";
import { STATUS_FILTER_OPTIONS } from "./utils";

export default function AIApps() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { userRoleName } = useAuth();
  const isCreatingDisabled = !userRoleName || !["Admin", "Editor"].includes(userRoleName);

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

  const { data, isLoading, error } = useAiApps({
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const deleteAiAppMutation = useDeleteAiApp();

  const filteredApps = useMemo(() => {
    const apps = data?.ai_apps || [];
    if (!searchTerm.trim()) return apps;
    const term = searchTerm.toLowerCase();
    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(term) ||
        (app.description && app.description.toLowerCase().includes(term)),
    );
  }, [data, searchTerm]);

  // Distinguish a genuinely empty inventory from a search/filter that matched nothing,
  // so the explanatory placeholder only shows when there is no data at all.
  const hasNoApps = (data?.ai_apps || []).length === 0;

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
      setAlert({ variant: "success", body: "AI app deleted successfully" });
    } catch (err) {
      setAlert({ variant: "error", body: "Failed to delete AI app" });
    } finally {
      setAppPendingDelete(null);
    }
  }, [appPendingDelete, deleteAiAppMutation]);

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
        <Box sx={toolbarStyle}>
          <Box sx={filterRowStyle}>
            <SearchBox
              placeholder="Search AI apps"
              value={searchTerm}
              onChange={(value) => setSearchTerm(value)}
              sx={{ width: 260 }}
            />
            <Select
              id="ai-apps-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AiAppStatus | "all")}
              items={[...STATUS_FILTER_OPTIONS]}
              sx={{ width: 160 }}
            />
          </Box>
          <CustomizableButton
            text="New AI app"
            variant="contained"
            startIcon={<Plus size={16} strokeWidth={1.5} />}
            onClick={handleNewApp}
            disabled={isCreatingDisabled}
          />
        </Box>

        {isLoading ? (
          <Skeleton variant="rectangular" height={300} sx={{ borderRadius: "4px" }} />
        ) : error ? (
          <EmptyState message="Failed to load AI apps. Please try again." showBorder />
        ) : filteredApps.length === 0 ? (
          <EmptyState
            icon={Bot}
            message={
              hasNoApps
                ? "This is your inventory of the AI apps your teams use. Record who owns each one and how it was found, then manage it from here. Add your first AI app to get started."
                : "No AI apps match your search or filter criteria."
            }
            showBorder
          >
            {hasNoApps && (
              <>
                <EmptyStateTip
                  icon={ScanSearch}
                  title="Keep one list of every AI app"
                  description="Record the AI tools your teams use, including shadow AI you promote from a discovered tool, with its owner, vendor and how you found it."
                />
                <EmptyStateTip
                  icon={ShieldCheck}
                  title="Map models, policies and data access"
                  description="Link each app to the models it runs on, the policies that apply to it and the data types it is allowed to touch, so you have a clear record for every tool."
                />
                <EmptyStateTip
                  icon={ClipboardCheck}
                  title="Run approvals and risk assessments"
                  description="Take an app from draft to approved, score its risk and assign the training people need before they use it."
                />
              </>
            )}
          </EmptyState>
        ) : (
          <AIAppsTable
            apps={filteredApps}
            onEditApp={handleEditApp}
            onViewApp={handleViewApp}
            onDeleteApp={handleRequestDelete}
          />
        )}

        <NewAIApp
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSuccess={handleModalSuccess}
          app={editingApp}
        />

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
