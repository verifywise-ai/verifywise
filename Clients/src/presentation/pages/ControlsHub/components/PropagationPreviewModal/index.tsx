/**
 * Controls Hub — Propagation preview modal.
 *
 * Given a master control id + the sparse patch the user is about to save,
 * this modal calls `/master-controls/:id/propagation-preview` and shows a
 * plain-language summary of exactly what will happen when the patch is
 * applied: which framework rows are affected, grouped by framework, with
 * requirement titles and before→after field descriptions.
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

import {
  useFrameworkCatalog,
  usePropagationPreview,
} from "../../../../../application/hooks/useMasterControls";
import type {
  PropagationPreviewPayload,
  PropagationResult,
  FrameworkCatalogEntry,
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
  control_eu: "control",
  subcontrol_eu: "sub-control",
  subclause_struct_iso: "sub-clause",
  annex_category_iso: "annex category",
  iso27001_subclause: "sub-clause",
  iso27001_annex_category: "annex control",
  subcategory_nist: "sub-category",
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
  const { data: catalog } = useFrameworkCatalog();
  const [results, setResults] = useState<PropagationResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build a catalog lookup for requirement titles
  const catalogLookup = useMemo(() => {
    if (!catalog) return new Map<string, FrameworkCatalogEntry>();
    const map = new Map<string, FrameworkCatalogEntry>();
    for (const [entityType, entries] of Object.entries(catalog)) {
      for (const entry of entries) {
        map.set(`${entityType}:${entry.id}`, entry);
      }
    }
    return map;
  }, [catalog]);

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

  const active = useMemo(
    () => (results ?? []).filter((r) => !r.skipped),
    [results]
  );
  const skipped = useMemo(
    () => (results ?? []).filter((r) => r.skipped),
    [results]
  );

  // Group active results by framework for the summary
  const groupedByFramework = useMemo(() => {
    const map = new Map<Framework, PropagationResult[]>();
    for (const r of active) {
      const list = map.get(r.framework) ?? [];
      list.push(r);
      map.set(r.framework, list);
    }
    return map;
  }, [active]);

  // Build the plain-language summary
  const plainSummary = useMemo(() => {
    if (active.length === 0) return null;
    const fieldNames = fieldsInPatch.map((f) => FIELD_LABELS[f]).join(", ");
    const parts: string[] = [];
    for (const [fw, rows] of groupedByFramework) {
      const fwLabel = FRAMEWORK_LABELS[fw] ?? fw;
      const entityTypes = new Set(rows.map((r) => ENTITY_TYPE_LABELS[r.framework_entity_type] ?? r.framework_entity_type));
      const typeSummary = Array.from(entityTypes).join(" and ");
      parts.push(`${rows.length} ${fwLabel} ${typeSummary}${rows.length === 1 ? "" : "s"}`);
    }
    return `This will update ${fieldNames.toLowerCase()} on ${parts.join(", ")}.`;
  }, [active, fieldsInPatch, groupedByFramework]);

  function getRequirementTitle(row: PropagationResult): string {
    const entry = catalogLookup.get(`${row.framework_entity_type}:${row.framework_entity_id}`);
    if (entry) return `${entry.code} — ${entry.title}`;
    const typeLabel = ENTITY_TYPE_LABELS[row.framework_entity_type] ?? row.framework_entity_type;
    return `${typeLabel} #${row.framework_entity_id}`;
  }

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
                    {payload[field] !== null && payload[field] !== undefined && (
                      <Typography
                        component="span"
                        sx={{
                          ml: 0.75,
                          fontSize: 11,
                          color: theme.palette.text.tertiary,
                        }}
                      >
                        → {String(payload[field])}
                      </Typography>
                    )}
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
                  ) : plainSummary ? (
                    <>{plainSummary}</>
                  ) : null}
                </Alert>

                {/* Grouped detail list */}
                {Array.from(groupedByFramework).map(([fw, rows]) => (
                  <Box key={fw}>
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
                      {FRAMEWORK_LABELS[fw] ?? fw}
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
                      }}
                    >
                      {rows.map((row) => (
                        <Stack
                          key={row.mappingId}
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          spacing={2}
                          sx={{ padding: "10px 14px" }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography fontSize={13} fontWeight={500}>
                              {getRequirementTitle(row)}
                            </Typography>
                            <Typography
                              fontSize={11}
                              color={theme.palette.text.tertiary}
                              sx={{ fontStyle: "italic" }}
                            >
                              {ENTITY_TYPE_LABELS[row.framework_entity_type] ?? row.framework_entity_type}
                            </Typography>
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
                              Rows
                            </Typography>
                            <Typography
                              fontSize={16}
                              fontWeight={600}
                              color={theme.palette.text.primary}
                            >
                              {row.rowsUpdated}
                            </Typography>
                          </Box>
                        </Stack>
                      ))}
                    </Stack>
                  </Box>
                ))}

                {/* Skipped mappings */}
                {skipped.length > 0 && (
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
                      Skipped ({skipped.length})
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
                      }}
                    >
                      {skipped.map((row) => (
                        <Stack
                          key={row.mappingId}
                          sx={{ padding: "10px 14px" }}
                        >
                          <Typography fontSize={13} fontWeight={500} color={theme.palette.text.tertiary}>
                            {getRequirementTitle(row)}
                          </Typography>
                          {row.reason && (
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
