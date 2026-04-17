/**
 * Controls Hub — Unified Cross-Framework Controls Library.
 *
 * Page shell: handles data fetching (via React Query), loading/empty/error
 * states, and top-of-page header/CTA. The actual matrix table lives in
 * `ControlsMatrix.tsx` (T-024).
 *
 * Clicking a matrix row opens the `MasterControlDrawer` (T-029). The drawer's
 * Details tab lets the user edit core fields; Mappings/Evidence/History tabs
 * land in T-030–T-032.
 *
 * Empty state invites the user to seed the recommended mappings (T-027/T-035)
 * or create a master control from scratch.
 */

import { useCallback, useState } from "react";
import { Box, Stack, Alert as MuiAlert } from "@mui/material";
import { Plus, Library, Download, Sparkles, Link2, GitBranchPlus, ShieldCheck } from "lucide-react";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { CustomizableButton } from "../../../components/button/customizable-button";
import CustomizableSkeleton from "../../../components/Skeletons";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import {
  useImportRecommendedMasterControls,
  useMasterControls,
} from "../../../../application/hooks/useMasterControls";
import type { SeedImportResult } from "../../../../application/repository/masterControl.repository";
import { ControlsMatrix } from "./ControlsMatrix";
import MasterControlDrawer from "../components/MasterControlDrawer";
import BulkEditBar from "../components/BulkEditBar";
import CsvExportModal from "../components/CsvExportModal";
import CreateMasterControlDialog from "../components/CreateMasterControlDialog";

export default function ControlsHub() {
  // Create-dialog visibility. On successful create we open the drawer on
  // the new master's id so the user can fill in the remaining fields.
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Drawer state: selected master control id + open flag.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Bulk-edit selection set, keyed by master control id.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // CSV export confirmation modal.
  const [isExportOpen, setIsExportOpen] = useState(false);

  const { data: masterControls, isLoading, error, refetch } = useMasterControls();

  const handleSelectionChange = useCallback((next: Set<number>) => {
    setSelectedIds(next);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isEmpty =
    !isLoading && !error && Array.isArray(masterControls) && masterControls.length === 0;

  const handleRowClick = (row: { id?: number }) => {
    if (!row.id) return;
    setSelectedId(row.id);
    setIsDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setIsDrawerOpen(false);
    // Keep `selectedId` until the drawer finishes its close animation so the
    // current master's data stays visible during the slide-out.
  };

  return (
    <Stack gap={3} sx={{ p: 4 }}>
      <PageHeaderExtended
        title="Controls"
        description="Manage a single library of controls and map each one to requirements across EU AI Act, ISO 42001, ISO 27001, and NIST AI RMF. Updates to status, owner, evidence, and due date automatically propagate to every mapped framework row."
        actionButton={
          <Stack direction="row" gap={1.5}>
            <CustomizableButton
              variant="outlined"
              text="Export CSV"
              icon={<Download size={16} strokeWidth={2} />}
              onClick={() => setIsExportOpen(true)}
              isDisabled={
                Array.isArray(masterControls) && masterControls.length === 0
              }
            />
            <CustomizableButton
              variant="contained"
              text="New master control"
              icon={<Plus size={16} strokeWidth={2} />}
              onClick={() => setIsCreateOpen(true)}
            />
          </Stack>
        }
      />

      {error ? (
        <MuiAlert
          severity="error"
          action={
            <CustomizableButton
              variant="text"
              text="Retry"
              onClick={() => refetch()}
            />
          }
        >
          Failed to load master controls:{" "}
          {error instanceof Error ? error.message : "unknown error"}
        </MuiAlert>
      ) : isLoading ? (
        <Stack gap={1}>
          <CustomizableSkeleton variant="rectangular" height={48} />
          <CustomizableSkeleton variant="rectangular" height={48} />
          <CustomizableSkeleton variant="rectangular" height={48} />
          <CustomizableSkeleton variant="rectangular" height={48} />
        </Stack>
      ) : isEmpty ? (
        <ControlsEmptyState
          onCreate={() => setIsCreateOpen(true)}
          onImported={refetch}
        />
      ) : (
        <>
          <ControlsMatrix
            masterControls={masterControls ?? []}
            onRowClick={handleRowClick}
            selectedIds={selectedIds}
            onSelectionChange={handleSelectionChange}
          />
          {selectedIds.size > 0 && (
            <BulkEditBar
              selectedIds={Array.from(selectedIds)}
              onClearSelection={handleClearSelection}
            />
          )}
        </>
      )}

      <MasterControlDrawer
        open={isDrawerOpen}
        onClose={handleDrawerClose}
        masterControlId={selectedId}
      />

      <CsvExportModal
        open={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        totalControls={masterControls?.length}
      />

      <CreateMasterControlDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(id) => {
          setSelectedId(id);
          setIsDrawerOpen(true);
        }}
      />
    </Stack>
  );
}

// ---------- Empty state ----------

function ControlsEmptyState({
  onCreate,
  onImported,
}: {
  onCreate: () => void;
  onImported: () => void;
}) {
  const importSeeds = useImportRecommendedMasterControls();
  const [summary, setSummary] = useState<SeedImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImport = async () => {
    setImportError(null);
    setSummary(null);
    try {
      const result = await importSeeds.mutateAsync();
      setSummary(result);
      onImported();
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : "Failed to import recommended mappings."
      );
    }
  };

  return (
    <EmptyState
      icon={Library}
      message="No master controls yet. Create one to unify requirements across frameworks, or import recommended mappings to get started."
      showBorder
    >
      <EmptyStateTip
        icon={Link2}
        title="Map across frameworks"
        description="Each master control can be linked to requirements in EU AI Act, ISO 42001, ISO 27001, and NIST AI RMF. Changes to status, owner, and due date propagate automatically."
      />
      <EmptyStateTip
        icon={GitBranchPlus}
        title="Import recommended mappings"
        description="Bootstrap 25 common controls already wired to cross-framework requirements. You can customise, add, or remove mappings afterwards."
      />
      <EmptyStateTip
        icon={ShieldCheck}
        title="Track evidence and history"
        description="Attach evidence files to each control and review a full change history so your audit trail is always complete."
      />
      <Box sx={{ display: "flex", gap: "8px", mt: "16px" }}>
        <CustomizableButton
          variant="outlined"
          text={
            importSeeds.isPending ? "Importing…" : "Import recommended mappings"
          }
          icon={<Sparkles size={16} strokeWidth={2} />}
          onClick={handleImport}
          isDisabled={importSeeds.isPending}
        />
        <CustomizableButton
          variant="contained"
          text="New master control"
          icon={<Plus size={16} strokeWidth={2} />}
          onClick={onCreate}
          isDisabled={importSeeds.isPending}
        />
      </Box>

      {importError && (
        <MuiAlert
          severity="error"
          sx={{ marginTop: 2, textAlign: "left" }}
        >
          {importError}
        </MuiAlert>
      )}

      {summary && !importError && (
        <MuiAlert
          severity={summary.mappingsSkipped > 0 ? "info" : "success"}
          sx={{ marginTop: 2, textAlign: "left" }}
        >
          Imported {summary.mastersCreated} master control
          {summary.mastersCreated === 1 ? "" : "s"} and{" "}
          {summary.mappingsCreated} framework mapping
          {summary.mappingsCreated === 1 ? "" : "s"}.
          {summary.mappingsSkipped > 0 && (
            <>
              {" "}
              {summary.mappingsSkipped} mapping
              {summary.mappingsSkipped === 1 ? "" : "s"} skipped (framework
              entity codes that could not be resolved). You can wire them
              manually from the Mappings tab.
            </>
          )}
        </MuiAlert>
      )}
    </EmptyState>
  );
}
