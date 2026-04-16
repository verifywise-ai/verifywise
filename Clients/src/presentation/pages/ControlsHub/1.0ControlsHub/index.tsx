/**
 * Controls Hub — Unified Cross-Framework Controls Library.
 *
 * Page shell: handles data fetching (via React Query), loading/empty/error
 * states, and top-of-page header/CTA. The actual matrix table lives in
 * `ControlsMatrix.tsx` (T-024).
 *
 * Empty state invites the user to seed the recommended mappings (T-027/T-035)
 * or create a master control from scratch. Both CTAs are wired as placeholders
 * until the create drawer (T-029) is in place.
 */

import { useState } from "react";
import { Box, Stack, Typography, Alert as MuiAlert } from "@mui/material";
import { Plus, Library } from "lucide-react";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { CustomizableButton } from "../../../components/button/customizable-button";
import CustomizableSkeleton from "../../../components/Skeletons";
import { useMasterControls } from "../../../../application/hooks/useMasterControls";
import { ControlsMatrix } from "./ControlsMatrix";

export default function ControlsHub() {
  // Placeholder state for the create-drawer toggle; wired to the real drawer
  // in T-029.
  const [_isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: masterControls, isLoading, error, refetch } = useMasterControls();

  const isEmpty =
    !isLoading && !error && Array.isArray(masterControls) && masterControls.length === 0;

  return (
    <Stack gap={3} sx={{ p: 4 }}>
      <PageHeaderExtended
        title="Controls Hub"
        description="Manage a single library of controls and map each one to requirements across EU AI Act, ISO 42001, ISO 27001, and NIST AI RMF. Updates to status, owner, evidence, and due date automatically propagate to every mapped framework row."
        actionButton={
          <CustomizableButton
            variant="contained"
            text="New master control"
            icon={<Plus size={16} strokeWidth={2} />}
            onClick={() => setIsCreateOpen(true)}
          />
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
        <ControlsMatrix masterControls={masterControls ?? []} />
      )}
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
