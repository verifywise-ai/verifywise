/**
 * Controls Hub — Propagation preview modal.
 *
 * Given a master control id + the sparse patch the user is about to save,
 * this modal calls `/master-controls/:id/propagation-preview` and lists
 * exactly which framework rows will be touched when that patch is applied.
 *
 * Read-only — no writes happen here. The user still has to press "Save
 * changes" in the Details tab (or equivalent) to commit the update.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { AlertTriangle, GitBranchPlus } from "lucide-react";

import { usePropagationPreview } from "../../../../../application/hooks/useMasterControls";
import type {
  PropagationPreviewPayload,
  PropagationResult,
} from "../../../../../application/repository/masterControl.repository";
import type { Framework } from "../../../../../domain/models/Common/masterControl/masterControl.model";

const FRAMEWORK_LABELS: Record<Framework, string> = {
  eu_ai_act: "EU AI Act",
  iso_42001: "ISO 42001",
  iso_27001: "ISO 27001",
  nist_ai_rmf: "NIST AI RMF",
};

const FIELD_LABELS: Record<keyof PropagationPreviewPayload, string> = {
  status: "Status",
  owner: "Owner",
  reviewer: "Reviewer",
  approver: "Approver",
  due_date: "Due date",
  implementation_details: "Implementation details",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  control_eu: "Control",
  subcontrol_eu: "Sub-control",
  subclause_struct_iso: "Sub-clause",
  annex_category_iso: "Annex category",
  iso27001_subclause: "Sub-clause",
  iso27001_annex_category: "Annex control",
  subcategory_nist: "Sub-category",
};

interface PropagationPreviewModalProps {
  open: boolean;
  onClose: () => void;
  masterControlId: number | null;
  payload: PropagationPreviewPayload;
}

export default function PropagationPreviewModal({
  open,
  onClose,
  masterControlId,
  payload,
}: PropagationPreviewModalProps) {
  const theme = useTheme();
  const preview = usePropagationPreview();
  const [results, setResults] = useState<PropagationResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state each time the modal is opened, and fire the preview request.
  useEffect(() => {
    if (!open || masterControlId == null) {
      setResults(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);
    setResults(null);
    preview
      .mutateAsync({ id: masterControlId, body: payload })
      .then((response) => {
        if (cancelled) return;
        // apiServices wraps responses in { data: { message, data } } —
        // unwrap to the raw array the UI wants.
        const rows: any =
          (response as any)?.data?.data ??
          (response as any)?.data ??
          response;
        setResults(Array.isArray(rows) ? (rows as PropagationResult[]) : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to compute propagation preview."
        );
      });

    return () => {
      cancelled = true;
    };
    // `preview` is stable (a mutation object); payload/masterControlId drive
    // re-computation. We intentionally exclude `preview` to avoid re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, masterControlId, JSON.stringify(payload)]);

  const fieldsInPatch = useMemo(
    () =>
      (Object.keys(payload) as (keyof PropagationPreviewPayload)[]).filter(
        (k) => payload[k] !== undefined
      ),
    [payload]
  );

  const totalRowsAffected = useMemo(() => {
    if (!results) return 0;
    return results.reduce(
      (sum, r) => (r.skipped ? sum : sum + r.rowsUpdated),
      0
    );
  }, [results]);

  const skipped = useMemo(
    () => (results ?? []).filter((r) => r.skipped),
    [results]
  );
  const active = useMemo(
    () => (results ?? []).filter((r) => !r.skipped),
    [results]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="propagation-preview-title"
      PaperProps={{ sx: { width: 560, maxWidth: "95vw", padding: "28px" } }}
    >
      <DialogTitle
        id="propagation-preview-title"
        sx={{ fontSize: 16, padding: 0, paddingBottom: 2 }}
      >
        <Stack direction="row" alignItems="center" gap={1}>
          <GitBranchPlus size={18} color={theme.palette.primary.main} />
          <span>Propagation preview</span>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ padding: 0 }}>
        {fieldsInPatch.length === 0 ? (
          <Alert severity="info" sx={{ fontSize: 13 }}>
            No propagatable fields have changed yet. Change status, owner,
            reviewer, approver, due date, or implementation details to see
            what would be updated.
          </Alert>
        ) : (
          <Stack spacing={2.5}>
            <Box>
              <Typography
                fontSize={12}
                fontWeight={600}
                sx={{
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: theme.palette.text.tertiary,
                  marginBottom: 1,
                }}
              >
                Fields that will propagate
              </Typography>
              <Stack direction="row" gap={0.75} flexWrap="wrap">
                {fieldsInPatch.map((field) => (
                  <Box
                    key={field}
                    sx={{
                      padding: "3px 10px",
                      borderRadius: 1,
                      backgroundColor: theme.palette.background.accent,
                      color: theme.palette.primary.main,
                      fontSize: 12,
                      fontWeight: 500,
                      border: `1px solid ${theme.palette.border.light}`,
                    }}
                  >
                    {FIELD_LABELS[field] ?? field}
                  </Box>
                ))}
              </Stack>
            </Box>

            {preview.isPending && !results ? (
              <Stack alignItems="center" sx={{ padding: 3 }}>
                <CircularProgress size={24} />
              </Stack>
            ) : error ? (
              <Alert severity="error" sx={{ fontSize: 13 }}>
                {error}
              </Alert>
            ) : results ? (
              <>
                <Alert
                  severity={
                    active.length > 0
                      ? "info"
                      : skipped.length > 0
                      ? "warning"
                      : "info"
                  }
                  sx={{ fontSize: 13 }}
                >
                  {active.length === 0 && skipped.length === 0 ? (
                    <>No framework mappings attached — nothing will propagate.</>
                  ) : active.length === 0 ? (
                    <>
                      Every mapping was skipped — no rows will be touched.
                      See details below.
                    </>
                  ) : (
                    <>
                      {active.length} framework row
                      {active.length === 1 ? "" : "s"} across{" "}
                      {new Set(active.map((r) => r.framework)).size} framework
                      {new Set(active.map((r) => r.framework)).size === 1
                        ? ""
                        : "s"}{" "}
                      will be updated
                      {totalRowsAffected > active.length
                        ? ` (${totalRowsAffected} rows total)`
                        : ""}
                      .
                    </>
                  )}
                </Alert>

                {results.length > 0 && (
                  <Box>
                    <Typography
                      fontSize={12}
                      fontWeight={600}
                      sx={{
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: theme.palette.text.tertiary,
                        marginBottom: 1,
                      }}
                    >
                      Affected framework rows
                    </Typography>
                    <Stack
                      divider={
                        <Box
                          sx={{
                            height: "1px",
                            backgroundColor: theme.palette.border.light,
                          }}
                        />
                      }
                      sx={{
                        border: `1px solid ${theme.palette.border.light}`,
                        borderRadius: 1,
                        maxHeight: 240,
                        overflowY: "auto",
                      }}
                    >
                      {results.map((row) => (
                        <Stack
                          key={row.mappingId}
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          spacing={2}
                          sx={{ padding: "10px 14px" }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              fontSize={11}
                              fontWeight={600}
                              sx={{
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                color: theme.palette.text.tertiary,
                              }}
                            >
                              {FRAMEWORK_LABELS[row.framework] ??
                                row.framework}
                            </Typography>
                            <Typography fontSize={13} fontWeight={500}>
                              {ENTITY_TYPE_LABELS[row.framework_entity_type] ??
                                row.framework_entity_type}{" "}
                              #{row.framework_entity_id}
                            </Typography>
                            {row.skipped && row.reason && (
                              <Stack
                                direction="row"
                                gap={0.5}
                                alignItems="center"
                                sx={{ marginTop: 0.5 }}
                              >
                                <AlertTriangle
                                  size={12}
                                  color={theme.palette.warning.text}
                                />
                                <Typography
                                  fontSize={11}
                                  color={theme.palette.warning.text}
                                >
                                  {row.reason}
                                </Typography>
                              </Stack>
                            )}
                          </Box>
                          <Box
                            sx={{
                              textAlign: "right",
                              minWidth: 72,
                              flexShrink: 0,
                            }}
                          >
                            <Typography
                              fontSize={10}
                              fontWeight={600}
                              sx={{
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                color: theme.palette.text.tertiary,
                              }}
                            >
                              {row.skipped ? "Skipped" : "Rows"}
                            </Typography>
                            <Typography
                              fontSize={16}
                              fontWeight={600}
                              color={
                                row.skipped
                                  ? theme.palette.text.tertiary
                                  : theme.palette.text.primary
                              }
                            >
                              {row.skipped ? "—" : row.rowsUpdated}
                            </Typography>
                          </Box>
                        </Stack>
                      ))}
                    </Stack>
                  </Box>
                )}
              </>
            ) : null}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ padding: 0, paddingTop: 3 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
