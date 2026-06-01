/**
 * @fileoverview AI Detection Scan Comparison Page
 *
 * Side-by-side diff view between two completed scans of the same repository.
 * Shows new findings (appeared), fixed findings (removed), and unchanged findings.
 *
 * @module pages/AIDetection/ScanComparisonPage
 */

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Typography,
  Stack,
  useTheme,
} from "@mui/material";
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { TabContext } from "@mui/lab";
import { CustomizableButton } from "../../components/button/customizable-button";
import Alert from "../../components/Alert";
import Chip from "../../components/Chip";
import TabBar from "../../components/TabBar";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { EmptyState } from "../../components/EmptyState";
import { compareScans } from "../../../application/repository/aiDetection.repository";
import { ScanComparison, Finding } from "../../../domain/ai-detection/types";
import { palette } from "../../themes/palette";

type ComparisonTab = "new" | "fixed" | "unchanged";

const TABS = [
  { label: "New", value: "new" as ComparisonTab },
  { label: "Fixed", value: "fixed" as ComparisonTab },
  { label: "Unchanged", value: "unchanged" as ComparisonTab },
];

// ============================================================================
// Sub-components
// ============================================================================

function ScoreDeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;

  const isPositive = delta > 0;
  const isNeutral = delta === 0;

  const color = isNeutral
    ? palette.text.secondary
    : isPositive
      ? "#d32f2f"
      : "#2e7d32";

  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  const label = isNeutral ? "No change" : `${isPositive ? "+" : ""}${delta.toFixed(1)} pts`;

  return (
    <Stack direction="row" alignItems="center" gap={0.5} sx={{ color }}>
      <Icon size={16} />
      <Typography variant="body2" fontWeight={600} color="inherit">
        {label}
      </Typography>
    </Stack>
  );
}

function FindingRow({ finding, status }: { finding: Finding; status: ComparisonTab }) {
  const theme = useTheme();

  const borderColor =
    status === "new"
      ? theme.palette.error.main
      : status === "fixed"
        ? theme.palette.success.main
        : theme.palette.divider;

  return (
    <Box
      sx={{
        border: `1px solid ${borderColor}`,
        borderRadius: "8px",
        p: 2,
        mb: 1.5,
        background: theme.palette.background.paper,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {finding.name}
            {finding.provider ? ` (${finding.provider})` : ""}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {finding.category} · {finding.finding_type}
          </Typography>
        </Box>
        <Chip label={finding.confidence} variant={finding.confidence} size="S" />
      </Stack>
      {finding.description && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
          {finding.description}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
        {finding.file_count} file{finding.file_count !== 1 ? "s" : ""}
      </Typography>
    </Box>
  );
}

function FindingsList({ findings, status }: { findings: Finding[]; status: ComparisonTab }) {
  if (findings.length === 0) {
    const messages: Record<ComparisonTab, string> = {
      new: "No new findings — nothing appeared since the baseline scan.",
      fixed: "No fixed findings — nothing was resolved since the baseline scan.",
      unchanged: "No unchanged findings.",
    };
    return <EmptyState message={messages[status]} />;
  }

  return (
    <Box>
      {findings.map((f) => (
        <FindingRow key={f.id} finding={f} status={status} />
      ))}
    </Box>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function ScanComparisonPage() {
  const { scanId, baselineScanId } = useParams<{
    scanId: string;
    baselineScanId: string;
  }>();
  const navigate = useNavigate();

  const [comparison, setComparison] = useState<ScanComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ComparisonTab>("new");

  useEffect(() => {
    if (!scanId || !baselineScanId) return;

    const abortController = new AbortController();
    setLoading(true);
    setError(null);

    compareScans(parseInt(scanId, 10), parseInt(baselineScanId, 10), abortController.signal)
      .then(setComparison)
      .catch((err) => {
        if (!abortController.signal.aborted) {
          setError(err?.response?.data?.message ?? "Failed to load comparison.");
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) setLoading(false);
      });

    return () => abortController.abort();
  }, [scanId, baselineScanId]);

  const tabCounts: Record<ComparisonTab, number> = {
    new: comparison?.summary.new_count ?? 0,
    fixed: comparison?.summary.fixed_count ?? 0,
    unchanged: comparison?.summary.unchanged_count ?? 0,
  };

  const tabs = TABS.map((t) => ({
    ...t,
    label: `${t.label} (${tabCounts[t.value]})`,
  }));

  const activeFindings: Finding[] = comparison?.[activeTab] ?? [];

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: "auto" }}>
      <PageHeaderExtended
        title="Scan Comparison"
        subtitle={
          comparison
            ? `Scan #${scanId} vs Baseline #${baselineScanId}`
            : "Loading comparison…"
        }
        actions={
          <CustomizableButton
            variant="text"
            label="Back to scan"
            startIcon={<ArrowLeft size={16} />}
            onClick={() => navigate(`/ai-detection/scans/${scanId}`)}
          />
        }
      />

      {error && (
        <Alert
          variant="error"
          title="Could not load comparison"
          body={error}
          sx={{ mb: 2 }}
        />
      )}

      {!loading && comparison && (
        <>
          {/* Summary row */}
          <Stack
            direction="row"
            gap={2}
            flexWrap="wrap"
            sx={{
              mb: 3,
              p: 2,
              borderRadius: "8px",
              border: `1px solid`,
              borderColor: "divider",
              background: "background.paper",
            }}
          >
            <Stack alignItems="center" sx={{ minWidth: 80 }}>
              <Typography variant="h5" fontWeight={700} color="error.main">
                {comparison.summary.new_count}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                New
              </Typography>
            </Stack>
            <Stack alignItems="center" sx={{ minWidth: 80 }}>
              <Typography variant="h5" fontWeight={700} color="success.main">
                {comparison.summary.fixed_count}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Fixed
              </Typography>
            </Stack>
            <Stack alignItems="center" sx={{ minWidth: 80 }}>
              <Typography variant="h5" fontWeight={700} color="text.secondary">
                {comparison.summary.unchanged_count}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Unchanged
              </Typography>
            </Stack>
            <Stack justifyContent="center" sx={{ ml: "auto" }}>
              <Typography variant="caption" color="text.secondary" mb={0.5}>
                Risk score delta
              </Typography>
              <ScoreDeltaBadge delta={comparison.summary.score_delta} />
            </Stack>
          </Stack>

          {/* Findings tabs */}
          <TabContext value={activeTab}>
            <TabBar
              tabs={tabs}
              value={activeTab}
              onChange={(_e, val) => setActiveTab(val as ComparisonTab)}
            />
            <Box sx={{ mt: 2 }}>
              <FindingsList findings={activeFindings} status={activeTab} />
            </Box>
          </TabContext>
        </>
      )}

      {loading && (
        <Typography color="text.secondary" sx={{ mt: 4, textAlign: "center" }}>
          Loading comparison…
        </Typography>
      )}
    </Box>
  );
}
