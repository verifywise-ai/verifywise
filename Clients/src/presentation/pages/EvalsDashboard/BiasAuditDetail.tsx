import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Stack, Typography, CircularProgress, useTheme } from "@mui/material";
import Chip from "../../components/Chip";
import {
  ArrowLeft,
  XCircle,
  Users,
  UserCheck,
  Percent,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { StatCard } from "../../components/Cards/StatCard";
import { CustomizableButton } from "../../components/button/customizable-button";
import { getStatusChip, getModeChip } from "./biasAuditHelpers";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import { triggerBrowserDownload } from "../../utils/browserDownload.utils";
import { palette } from "../../themes/palette";
import {
  getBiasAuditResults,
  getBiasAuditStatus,
  deleteBiasAudit,
  downloadBiasAuditReport,
  updateBiasAuditName,
  type BiasAuditDetailResponse,
  type CategoryTableResult,
  type FairnessMetricsTable,
  type ScoreDistributionTable,
} from "../../../application/repository/deepEval.repository";
import EditableText from "../../components/EditableText";

interface BiasAuditDetailProps {
  auditId: string;
  onBack: () => void;
}

function ResultsTable({
  table,
  threshold: _threshold,
}: {
  table: CategoryTableResult;
  threshold: number;
}) {
  const theme = useTheme();
  const headerCellSx = {
    fontSize: 12,
    fontWeight: 600,
    color: theme.palette.text.secondary,
    textAlign: "right" as const,
    padding: "8px",
  };

  return (
    <Box
      sx={{
        border: `1px solid ${theme.palette.border.dark}`,
        borderRadius: "4px",
        mb: "16px",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          padding: "8px",
          backgroundColor: palette.background.accent,
          borderBottom: `1px solid ${theme.palette.border.dark}`,
        }}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.palette.text.primary }}>
          {table.title}
        </Typography>
        {table.highest_group && (
          <Typography sx={{ fontSize: 11, color: theme.palette.text.secondary }}>
            Highest rate: {table.highest_group} ({((table.highest_rate || 0) * 100).toFixed(1)}%)
          </Typography>
        )}
      </Box>

      <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
        <Box component="thead">
          <Box component="tr" sx={{ borderBottom: `1px solid ${theme.palette.border.light}` }}>
            <Box component="th" sx={{ ...headerCellSx, textAlign: "left", width: "25%" }}>
              Group
            </Box>
            <Box component="th" sx={{ ...headerCellSx, width: "15%" }}>
              Applicants
            </Box>
            <Box component="th" sx={{ ...headerCellSx, width: "15%" }}>
              Selected
            </Box>
            <Box component="th" sx={{ ...headerCellSx, width: "15%" }}>
              Selection rate
            </Box>
            <Box component="th" sx={{ ...headerCellSx, width: "15%" }}>
              Impact ratio
            </Box>
            <Box component="th" sx={{ ...headerCellSx, width: "15%" }}>
              Status
            </Box>
          </Box>
        </Box>
        <Box component="tbody">
          {table.rows.map((row, idx) => (
            <Box
              component="tr"
              key={idx}
              sx={{
                borderBottom:
                  idx < table.rows.length - 1 ? `1px solid ${theme.palette.border.light}` : "none",
                backgroundColor: row.flagged
                  ? palette.status.error.bg
                  : theme.palette.background.paper,
              }}
            >
              <Box component="td" sx={{ padding: "8px" }}>
                <Typography sx={{ fontSize: 13, color: theme.palette.text.primary }}>
                  {row.category_name}
                </Typography>
              </Box>
              <Box component="td" sx={{ padding: "8px", textAlign: "right" }}>
                <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                  {row.applicant_count.toLocaleString()}
                </Typography>
              </Box>
              <Box component="td" sx={{ padding: "8px", textAlign: "right" }}>
                <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                  {row.selected_count.toLocaleString()}
                </Typography>
              </Box>
              <Box component="td" sx={{ padding: "8px", textAlign: "right" }}>
                <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                  {(row.selection_rate * 100).toFixed(1)}%
                </Typography>
              </Box>
              <Box component="td" sx={{ padding: "8px", textAlign: "right" }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    color: row.excluded
                      ? palette.text.disabled
                      : row.flagged
                        ? palette.status.error.text
                        : theme.palette.text.secondary,
                    fontWeight: row.flagged ? 600 : 400,
                  }}
                >
                  {row.excluded
                    ? "Excluded (<2%)"
                    : row.impact_ratio != null
                      ? row.impact_ratio.toFixed(3)
                      : "—"}
                </Typography>
              </Box>
              <Box component="td" sx={{ padding: "8px", textAlign: "right" }}>
                {row.excluded ? (
                  <Chip
                    label="N/A"
                    size="small"
                    uppercase={false}
                    backgroundColor={palette.status.default.bg}
                    textColor={palette.status.default.text}
                  />
                ) : row.flagged ? (
                  <Chip
                    label="Flag"
                    size="small"
                    uppercase={false}
                    backgroundColor={palette.status.error.bg}
                    textColor={palette.status.error.text}
                  />
                ) : (
                  <Chip label="Pass" size="small" uppercase={false} variant="success" />
                )}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function FairnessMetricsTableView({ table }: { table: FairnessMetricsTable }) {
  const theme = useTheme();
  const headerCellSx = {
    fontSize: 12,
    fontWeight: 600,
    color: theme.palette.text.secondary,
    textAlign: "right" as const,
    padding: "8px",
  };

  return (
    <Box
      sx={{
        border: `1px solid ${theme.palette.border.dark}`,
        borderRadius: "4px",
        mb: "16px",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          padding: "8px",
          backgroundColor: palette.background.accent,
          borderBottom: `1px solid ${theme.palette.border.dark}`,
        }}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.palette.text.primary }}>
          {table.title}
        </Typography>
        {(table.equal_opportunity_difference != null ||
          table.equalized_odds_difference != null ||
          table.predictive_parity_difference != null) && (
          <Typography sx={{ fontSize: 11, color: theme.palette.text.secondary, mt: "2px" }}>
            {table.equal_opportunity_difference != null && (
              <>
                Equal opportunity diff:{" "}
                <strong>{table.equal_opportunity_difference.toFixed(3)}</strong>
                {table.tpr_max_group && table.tpr_min_group
                  ? ` (${table.tpr_max_group} vs ${table.tpr_min_group})`
                  : ""}
                {" · "}
              </>
            )}
            {table.equalized_odds_difference != null && (
              <>
                Equalized odds diff: <strong>{table.equalized_odds_difference.toFixed(3)}</strong>
                {" · "}
              </>
            )}
            {table.predictive_parity_difference != null && (
              <>
                Predictive parity diff:{" "}
                <strong>{table.predictive_parity_difference.toFixed(3)}</strong>
              </>
            )}
          </Typography>
        )}
      </Box>

      <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
        <Box component="thead">
          <Box component="tr" sx={{ borderBottom: `1px solid ${theme.palette.border.light}` }}>
            <Box component="th" sx={{ ...headerCellSx, textAlign: "left", width: "18%" }}>
              Group
            </Box>
            <Box component="th" sx={{ ...headerCellSx, width: "10%" }}>
              Count
            </Box>
            <Box component="th" sx={{ ...headerCellSx, width: "12%" }}>
              TPR
            </Box>
            <Box component="th" sx={{ ...headerCellSx, width: "12%" }}>
              FPR
            </Box>
            <Box component="th" sx={{ ...headerCellSx, width: "12%" }}>
              FNR
            </Box>
            <Box component="th" sx={{ ...headerCellSx, width: "12%" }}>
              Precision
            </Box>
            <Box component="th" sx={{ ...headerCellSx, width: "12%" }}>
              Accuracy
            </Box>
            <Box component="th" sx={{ ...headerCellSx, width: "12%" }}>
              Confusion (TP/FP/TN/FN)
            </Box>
          </Box>
        </Box>
        <Box component="tbody">
          {table.groups.map((g, idx) => (
            <Box
              component="tr"
              key={idx}
              sx={{
                borderBottom:
                  idx < table.groups.length - 1
                    ? `1px solid ${theme.palette.border.light}`
                    : "none",
                opacity: g.excluded ? 0.5 : 1,
              }}
            >
              <Box component="td" sx={{ padding: "8px" }}>
                <Typography sx={{ fontSize: 13, color: theme.palette.text.primary }}>
                  {g.category_name}
                </Typography>
              </Box>
              <Box component="td" sx={{ padding: "8px", textAlign: "right" }}>
                <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                  {g.count.toLocaleString()}
                </Typography>
              </Box>
              <Box component="td" sx={{ padding: "8px", textAlign: "right" }}>
                <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                  {(g.true_positive_rate * 100).toFixed(1)}%
                </Typography>
              </Box>
              <Box component="td" sx={{ padding: "8px", textAlign: "right" }}>
                <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                  {(g.false_positive_rate * 100).toFixed(1)}%
                </Typography>
              </Box>
              <Box component="td" sx={{ padding: "8px", textAlign: "right" }}>
                <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                  {(g.false_negative_rate * 100).toFixed(1)}%
                </Typography>
              </Box>
              <Box component="td" sx={{ padding: "8px", textAlign: "right" }}>
                <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                  {(g.precision * 100).toFixed(1)}%
                </Typography>
              </Box>
              <Box component="td" sx={{ padding: "8px", textAlign: "right" }}>
                <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                  {(g.accuracy * 100).toFixed(1)}%
                </Typography>
              </Box>
              <Box component="td" sx={{ padding: "8px", textAlign: "right" }}>
                <Typography
                  sx={{ fontSize: 12, color: theme.palette.text.tertiary, fontFamily: "monospace" }}
                >
                  {g.true_positive}/{g.false_positive}/{g.true_negative}/{g.false_negative}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function ScoreDistributionView({ table }: { table: ScoreDistributionTable }) {
  const theme = useTheme();
  const maxCount = Math.max(1, ...table.groups.flatMap((g) => g.bins.map((b) => b.count)));

  return (
    <Box
      sx={{
        border: `1px solid ${theme.palette.border.dark}`,
        borderRadius: "4px",
        mb: "16px",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          padding: "8px",
          backgroundColor: palette.background.accent,
          borderBottom: `1px solid ${theme.palette.border.dark}`,
        }}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.palette.text.primary }}>
          {table.title}
        </Typography>
        <Typography sx={{ fontSize: 11, color: theme.palette.text.secondary }}>
          Overall mean: {table.overall_mean.toFixed(3)} · Overall median:{" "}
          {table.overall_median.toFixed(3)}
        </Typography>
      </Box>
      <Box sx={{ p: 2 }}>
        <Stack spacing={2}>
          {table.groups.map((g, idx) => (
            <Box key={idx}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
                <Typography
                  sx={{ fontSize: 13, fontWeight: 500, color: theme.palette.text.primary }}
                >
                  {g.category_name}
                </Typography>
                <Typography sx={{ fontSize: 11, color: theme.palette.text.secondary }}>
                  n={g.count} · mean={g.mean.toFixed(3)} · median={g.median.toFixed(3)} · std=
                  {g.std.toFixed(3)}
                  {g.ks_statistic != null && (
                    <>
                      {" "}
                      · K-S={g.ks_statistic.toFixed(3)}
                      {g.ks_pvalue != null ? ` (p=${g.ks_pvalue.toFixed(3)})` : ""}
                    </>
                  )}
                </Typography>
              </Stack>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: "1px",
                  height: 60,
                  background: palette.background.accent,
                  p: "4px",
                  borderRadius: "2px",
                }}
              >
                {g.bins.map((bin, bidx) => {
                  const h = (bin.count / maxCount) * 100;
                  return (
                    <Box
                      key={bidx}
                      title={`[${bin.lower.toFixed(2)}, ${bin.upper.toFixed(2)}): ${bin.count}`}
                      sx={{
                        flex: 1,
                        height: `${h}%`,
                        backgroundColor: palette.brand.primary,
                        minHeight: bin.count > 0 ? "2px" : 0,
                      }}
                    />
                  );
                })}
              </Box>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

export default function BiasAuditDetail({ auditId, onBack }: BiasAuditDetailProps) {
  const theme = useTheme();
  const [audit, setAudit] = useState<BiasAuditDetailResponse | null>(null);
  const [status, setStatus] = useState<string>("pending");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const networkRetryCount = useRef(0);
  const MAX_NETWORK_RETRIES = 3;

  const fetchResults = useCallback(async () => {
    try {
      const data = await getBiasAuditResults(auditId);
      setAudit(data);
      setStatus(data.status);
      setLoading(false);
      networkRetryCount.current = 0;
    } catch (err: any) {
      if (err?.response?.status === 202) {
        const statusData = await getBiasAuditStatus(auditId);
        setStatus(statusData.status);
        setLoading(false);
        networkRetryCount.current = 0;
      } else if (err?.response?.status === 500) {
        setError(err.response?.data?.detail || "Audit failed");
        setStatus("failed");
        setLoading(false);
      } else if (!err?.response) {
        // Network error (no response) — retry silently up to MAX_NETWORK_RETRIES
        networkRetryCount.current += 1;
        if (networkRetryCount.current >= MAX_NETWORK_RETRIES) {
          setError("Network error. Please check your connection and try again.");
          setLoading(false);
        }
        // Otherwise let polling retry on next interval
      } else {
        setError("Failed to load audit results");
        setLoading(false);
      }
    }
  }, [auditId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // Polling while pending/running (ref-based to avoid interval churn)
  // Stop polling on error to prevent infinite retry loops
  useEffect(() => {
    const shouldPoll = (status === "pending" || status === "running") && !error;

    if (shouldPoll && !pollingRef.current) {
      pollingRef.current = setInterval(fetchResults, 3000);
    } else if (!shouldPoll && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [status, error, fetchResults]);

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleDownload = () => {
    if (!audit?.results) return;
    try {
      const json = JSON.stringify(audit.results, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      triggerBrowserDownload(blob, `bias-audit-${auditId}.json`);
    } catch (err) {
      console.error("Failed to download results:", err);
    }
  };

  const handleSaveName = async (next: string) => {
    try {
      await updateBiasAuditName(auditId, next);
      setAudit((prev) =>
        prev ? { ...prev, config: { ...(prev.config || {}), systemName: next } } : prev,
      );
    } catch (err) {
      console.error("Failed to update audit name:", err);
    }
  };

  const handleDownloadPdf = async () => {
    if (isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    try {
      const blob = await downloadBiasAuditReport(auditId);
      triggerBrowserDownload(blob, `bias-audit-${auditId}.pdf`);
    } catch (err) {
      console.error("Failed to download PDF report:", err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteBiasAudit(auditId);
      onBack();
    } catch (err) {
      console.error("Failed to delete audit:", err);
      setError("Failed to delete audit. Please try again.");
      setIsDeleting(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={2} mb={3}>
        <Box
          onClick={onBack}
          sx={{
            "cursor": "pointer",
            "display": "flex",
            "alignItems": "center",
            "p": 0.5,
            "borderRadius": "4px",
            "&:hover": { backgroundColor: theme.palette.action.hover },
          }}
        >
          <ArrowLeft size={18} color={theme.palette.text.secondary} strokeWidth={1.5} />
        </Box>
        <Stack spacing={0.5} flex={1}>
          <Stack direction="row" alignItems="center" sx={{ gap: "8px" }}>
            <EditableText
              value={
                (audit?.config?.systemName as string | undefined) ||
                audit?.presetName ||
                "Bias audit"
              }
              onSave={handleSaveName}
              placeholder="Untitled audit"
              editAriaLabel="Edit audit name"
              textSx={{ fontSize: 15, fontWeight: 600, color: theme.palette.text.primary }}
              inputMinWidth={360}
            />
            {audit?.mode && getModeChip(audit.mode)}
            {getStatusChip(status)}
          </Stack>
          {audit?.createdAt && (
            <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
              {audit.presetName} · Created{" "}
              {new Date(audit.createdAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" sx={{ gap: "8px" }}>
          {audit?.results && status === "completed" && (
            <CustomizableButton
              variant="contained"
              text={isDownloadingPdf ? "Generating..." : "Download PDF report"}
              onClick={handleDownloadPdf}
              isDisabled={isDownloadingPdf}
              sx={{ height: 34, fontSize: 13 }}
            />
          )}
          {audit?.results && (
            <CustomizableButton
              variant="outlined"
              text="Download JSON"
              onClick={handleDownload}
              sx={{
                height: 34,
                fontSize: 13,
                border: `1px solid ${theme.palette.border.dark}`,
                color: theme.palette.text.primary,
              }}
            />
          )}
          <CustomizableButton
            variant="outlined"
            text={isDeleting ? "Deleting..." : "Delete"}
            onClick={() => setShowDeleteConfirm(true)}
            isDisabled={isDeleting}
            sx={{
              "height": 34,
              "fontSize": 13,
              "border": `1px solid ${theme.palette.border.dark}`,
              "color": palette.status.error.text,
              "&:hover": {
                backgroundColor: palette.status.error.bg,
                border: `1px solid ${palette.status.error.border}`,
              },
            }}
          />
        </Stack>
      </Stack>

      {/* Loading/pending/running state */}
      {(loading || status === "pending" || status === "running") && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 10,
            gap: 2,
          }}
        >
          <CircularProgress size={32} sx={{ color: theme.palette.primary.main }} />
          <Typography sx={{ fontSize: 14, color: theme.palette.text.secondary }}>
            {status === "running" ? "Audit is running..." : "Waiting to start..."}
          </Typography>
        </Box>
      )}

      {/* Failed state */}
      {status === "failed" && (
        <Box
          sx={{
            border: `1px solid ${palette.status.error.border}`,
            borderRadius: "4px",
            p: 3,
            backgroundColor: palette.status.error.bg,
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <XCircle size={18} color={palette.status.error.text} strokeWidth={1.5} />
            <Stack spacing={0.5}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.status.error.text }}>
                Audit failed
              </Typography>
              <Typography sx={{ fontSize: 13, color: palette.status.error.text }}>
                {error || "An unknown error occurred"}
              </Typography>
            </Stack>
          </Stack>
        </Box>
      )}

      {/* Completed state */}
      {status === "completed" && audit?.results && (
        <>
          {/* Summary cards */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: `repeat(${audit.results.unknown_count > 0 ? 5 : 4}, 1fr)`,
              gap: "16px",
              mb: "16px",
            }}
          >
            <StatCard
              title="Total applicants"
              value={audit.results.total_applicants.toLocaleString()}
              Icon={Users}
            />
            <StatCard
              title={
                audit.results.metric === "scoring_rate"
                  ? "Above median"
                  : audit.results.metric === "fairness_metrics"
                    ? "Predicted positive"
                    : "Total selected"
              }
              value={audit.results.total_selected.toLocaleString()}
              Icon={UserCheck}
            />
            <StatCard
              title={
                audit.results.metric === "scoring_rate"
                  ? "Scoring rate"
                  : audit.results.metric === "fairness_metrics"
                    ? "Positive rate"
                    : "Selection rate"
              }
              value={`${(audit.results.overall_selection_rate * 100).toFixed(1)}%`}
              Icon={Percent}
            />
            <StatCard
              title="Flags"
              value={audit.results.flags_count.toString()}
              Icon={AlertTriangle}
              highlight={audit.results.flags_count > 0}
            />
            {audit.results.unknown_count > 0 && (
              <StatCard
                title="Unknown"
                value={audit.results.unknown_count.toLocaleString()}
                Icon={HelpCircle}
              />
            )}
          </Box>

          {/* Summary text */}
          <Box
            sx={{
              border: `1px solid ${theme.palette.border.dark}`,
              borderRadius: "4px",
              p: 2,
              mb: "16px",
              backgroundColor: palette.background.accent,
            }}
          >
            <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary, lineHeight: 1.6 }}>
              {audit.results.summary}
            </Typography>
          </Box>

          {/* Results tables (selection rate / scoring rate) */}
          {audit.results.tables.map((table, index) => (
            <ResultsTable key={index} table={table} threshold={audit.config?.threshold ?? 0.8} />
          ))}

          {/* Fairness metrics tables (confusion-matrix mode) */}
          {audit.results.fairness_metrics_tables?.map((table, index) => (
            <FairnessMetricsTableView key={`fm-${index}`} table={table} />
          ))}

          {/* Score distributions */}
          {audit.results.score_distribution_tables?.map((table, index) => (
            <ScoreDistributionView key={`sd-${index}`} table={table} />
          ))}
        </>
      )}

      {showDeleteConfirm && (
        <ConfirmationModal
          isOpen={showDeleteConfirm}
          title="Delete bias audit"
          body="Are you sure you want to delete this bias audit? This action cannot be undone."
          proceedText="Delete"
          cancelText="Cancel"
          onProceed={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          proceedButtonVariant="contained"
          proceedButtonColor="error"
        />
      )}
    </Box>
  );
}
