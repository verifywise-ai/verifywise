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
import { Box, Stack, Typography, Alert as MuiAlert } from "@mui/material";
import { Plus, Library, Download } from "lucide-react";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { CustomizableButton } from "../../../components/button/customizable-button";
import CustomizableSkeleton from "../../../components/Skeletons";
import { useMasterControls } from "../../../../application/hooks/useMasterControls";
import { ControlsMatrix } from "./ControlsMatrix";
import MasterControlDrawer from "../components/MasterControlDrawer";
import BulkEditBar from "../components/BulkEditBar";
import CsvExportModal from "../components/CsvExportModal";

export default function ControlsHub() {
  // Placeholder state for the create-drawer toggle. "New master control"
  // creation flow lands in a later task; for now it's a no-op until wired.
  const [_isCreateOpen, setIsCreateOpen] = useState(false);

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
        title="Controls Hub"
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
        <EmptyState onCreate={() => setIsCreateOpen(true)} />
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
    </Stack>
  );
}

// ---------- Empty state ----------

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Box
      sx={{
        border: (t) => `1px dashed ${t.palette.divider}`,
        borderRadius: 2,
        p: 8,
        textAlign: "center",
      }}
    >
      <Box sx={{ display: "inline-flex", mb: 2, color: "text.secondary" }}>
        <Library size={48} strokeWidth={1.5} />
      </Box>
      <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
        No master controls yet
      </Typography>
      <Typography
        variant="body2"
        sx={{ color: "text.secondary", mb: 3, maxWidth: 520, mx: "auto" }}
      >
        Create a master control to unify requirements across frameworks, or
        import the recommended mappings to bootstrap 25 common controls
        already wired to EU AI Act, ISO 42001, ISO 27001, and NIST AI RMF.
      </Typography>
      <Stack direction="row" gap={2} justifyContent="center">
        <CustomizableButton
          variant="contained"
          text="New master control"
          icon={<Plus size={16} strokeWidth={2} />}
          onClick={onCreate}
        />
      </Stack>
    </Box>
  );
}
