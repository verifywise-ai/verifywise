import { useState, useMemo } from "react";
import {
  Box,
  Stack,
  Typography,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  Card,
  CardContent,
} from "@mui/material";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Activity, Clock, DollarSign, XCircle, Eye } from "lucide-react";
import {
  text as textColors,
  background,
  border as borderPalette,
  brand,
  status,
} from "../../themes/palette";
import Chip from "../../components/Chip";
import {
  useTraces,
  useObservabilityMetrics,
} from "../../../application/hooks/useObservability";
import { getTraceDetail } from "../../../application/repository/observability.repository";

// Consistent card style matching AIAuditDashboard / DashboardCard
const cardSx = {
  border: `1px solid ${borderPalette.dark}`,
  borderRadius: "4px",
  background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
};

const PERIOD_OPTIONS = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
];

function getStatusColor(traceStatus: string | undefined): string {
  switch (traceStatus) {
    case "ok":
    case "success":
      return status.success.text;
    case "error":
    case "failed":
      return status.error.text;
    default:
      return textColors.accent;
  }
}

function getStatusBg(traceStatus: string | undefined): string {
  switch (traceStatus) {
    case "ok":
    case "success":
      return status.success.bg;
    case "error":
    case "failed":
      return status.error.bg;
    default:
      return background.accent;
  }
}

export default function AIObservability() {
  const [period, setPeriod] = useState("30d");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSpans, setDetailSpans] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const selectedPeriod = PERIOD_OPTIONS.find((p) => p.value === period)!;
  const dateFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - selectedPeriod.days);
    return d.toISOString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const { data: metrics, isLoading: metricsLoading } = useObservabilityMetrics(dateFrom);
  const { data: traceData, isLoading: tracesLoading } = useTraces({
    dateFrom,
    limit: rowsPerPage,
    offset: page * rowsPerPage,
  });

  const summary = metrics?.summary || {};
  const latencyTrend = metrics?.latencyTrend || [];

  const handleViewDetail = async (traceId: string) => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const detail = await getTraceDetail(traceId);
      setDetailSpans(Array.isArray(detail?.spans) ? detail.spans : []);
    } catch {
      setDetailSpans([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const statCards = [
    {
      label: "Total traces",
      value: summary.total_traces ?? 0,
      icon: <Activity size={13} />,
    },
    {
      label: "Total cost",
      value: `$${(summary.total_cost ?? 0).toFixed(2)}`,
      icon: <DollarSign size={13} />,
    },
    {
      label: "Avg latency",
      value: `${Math.round(summary.avg_latency_ms ?? 0)}ms`,
      icon: <Clock size={13} />,
    },
    {
      label: "Error rate",
      value: `${summary.error_rate_pct ?? 0}%`,
      icon: <XCircle size={13} />,
    },
  ];

  const maxSpanDuration = detailSpans.reduce(
    (max: number, s: any) => Math.max(max, s.duration_ms ?? 0),
    0,
  );

  return (
    <Box>
      {/* Header — matches AI audit style */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb="8px">
        <Box>
          <Typography
            sx={{
              fontWeight: 600,
              fontSize: 20,
              fontFamily: "'Red Hat Display', 'Geist', sans-serif",
              color: textColors.primary,
            }}
          >
            AI observability
          </Typography>
          <Typography sx={{ fontSize: 13, color: textColors.secondary, mt: 0.25 }}>
            Traces, cost tracking, and latency & error metrics for every AI request.
          </Typography>
        </Box>

        {/* Period chips — same pattern as AI audit */}
        <Stack direction="row" spacing={1}>
          {PERIOD_OPTIONS.map((opt) => {
            const isSelected = period === opt.value;
            return (
              <Box key={opt.value} onClick={() => setPeriod(opt.value)} sx={{ cursor: "pointer" }}>
                <Chip
                  label={opt.label}
                  size="small"
                  uppercase={false}
                  backgroundColor={isSelected ? brand.primaryLight : background.hover}
                  textColor={isSelected ? brand.primary : undefined}
                />
              </Box>
            );
          })}
        </Stack>
      </Stack>

      {/* Stat cards */}
      <Box
        sx={{
          "display": "flex",
          "flexWrap": "wrap",
          "gap": "8px",
          "mb": "8px",
          "& > *": { flex: "1 1 0", minWidth: "120px" },
        }}
      >
        {metricsLoading ? (
          <Box sx={{ p: 2, textAlign: "center", width: "100%" }}>
            <CircularProgress size={20} />
          </Box>
        ) : (
          statCards.map((card) => (
            <Stack
              key={card.label}
              sx={{
                ...cardSx,
                borderRadius: 2,
                padding: "8px 14px 14px 14px",
              }}
            >
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Box sx={{ color: textColors.icon, display: "flex" }}>{card.icon}</Box>
                <Typography sx={{ fontSize: 12, color: textColors.secondary, fontWeight: 500 }}>
                  {card.label}
                </Typography>
              </Stack>
              <Typography
                sx={{ fontSize: 28, fontWeight: 700, color: textColors.primary, lineHeight: 1.2 }}
              >
                {card.value}
              </Typography>
            </Stack>
          ))
        )}
      </Box>

      {/* Latency trend chart */}
      <Card elevation={0} sx={{ ...cardSx, mb: "8px" }}>
        <CardContent sx={{ "p": "16px", "&:last-child": { pb: "16px" } }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: textColors.primary, mb: 1 }}>
            Latency over time
          </Typography>
          {latencyTrend.length === 0 ? (
            <Box sx={{ py: 4, textAlign: "center" }}>
              <Typography sx={{ fontSize: 12, color: textColors.accent }}>No data</Typography>
            </Box>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={latencyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={borderPalette.light} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: textColors.secondary }} />
                <YAxis tick={{ fontSize: 11, fill: textColors.secondary }} />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 4,
                    border: `1px solid ${borderPalette.dark}`,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="avg_latency_ms"
                  stroke={brand.primary}
                  strokeWidth={2}
                  dot={{ r: 3, fill: brand.primary }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Section heading */}
      <Typography
        sx={{ fontSize: 13, fontWeight: 600, color: textColors.primary, mb: "8px", mt: "4px" }}
      >
        Traces
      </Typography>

      {/* Traces table */}
      <Card elevation={0} sx={cardSx}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: background.accent }}>
                {["Timestamp", "Trace", "Status", "Latency", "Cost", "Action"].map((h) => (
                  <TableCell
                    key={h}
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: textColors.secondary,
                      textTransform: "uppercase",
                      letterSpacing: 0.3,
                      borderBottom: `1px solid ${borderPalette.dark}`,
                    }}
                  >
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {tracesLoading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, border: "none" }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : (traceData?.rows || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, border: "none" }}>
                    <Typography sx={{ fontSize: 12, color: textColors.accent }}>
                      No traces found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                (traceData?.rows || []).map((row: any, i: number) => (
                  <TableRow
                    key={row.id || row.trace_id || i}
                    hover
                    sx={{ "&:hover": { backgroundColor: background.hover } }}
                  >
                    <TableCell
                      sx={{
                        fontSize: 12,
                        color: textColors.secondary,
                        borderBottom: `1px solid ${borderPalette.light}`,
                      }}
                    >
                      {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: 12,
                        fontFamily: "monospace",
                        color: textColors.primary,
                        borderBottom: `1px solid ${borderPalette.light}`,
                      }}
                    >
                      {row.name || row.trace_id || "—"}
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${borderPalette.light}` }}>
                      <Chip
                        label={row.status || "—"}
                        size="small"
                        uppercase={false}
                        backgroundColor={getStatusBg(row.status)}
                        textColor={getStatusColor(row.status)}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: 12,
                        color: textColors.secondary,
                        borderBottom: `1px solid ${borderPalette.light}`,
                      }}
                    >
                      {row.latency_ms != null ? `${Math.round(row.latency_ms)}ms` : "—"}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: 12,
                        color: textColors.secondary,
                        borderBottom: `1px solid ${borderPalette.light}`,
                      }}
                    >
                      {row.cost != null ? `$${Number(row.cost).toFixed(4)}` : "—"}
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${borderPalette.light}` }}>
                      <IconButton
                        size="small"
                        onClick={() => handleViewDetail(row.trace_id || row.id)}
                        sx={{
                          "color": textColors.icon,
                          "&:hover": { color: brand.primary, backgroundColor: brand.primaryLight },
                        }}
                      >
                        <Eye size={14} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={traceData?.total || 0}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          sx={{
            fontSize: 12,
            color: textColors.secondary,
            borderTop: `1px solid ${borderPalette.light}`,
          }}
        />
      </Card>

      {/* Trace detail waterfall dialog */}
      <Dialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: "4px", border: `1px solid ${borderPalette.dark}` },
        }}
      >
        <DialogTitle
          sx={{
            fontSize: 16,
            fontWeight: 600,
            color: textColors.primary,
            fontFamily: "'Red Hat Display', 'Geist', sans-serif",
            borderBottom: `1px solid ${borderPalette.light}`,
          }}
        >
          Trace waterfall
        </DialogTitle>
        <DialogContent sx={{ py: 2 }}>
          {detailLoading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress size={24} />
            </Box>
          ) : detailSpans.length === 0 ? (
            <Alert severity="info" sx={{ fontSize: 13 }}>
              No spans found for this trace
            </Alert>
          ) : (
            <Stack spacing={1} sx={{ py: 1 }}>
              {detailSpans.map((span: any, i: number) => {
                const duration = span.duration_ms ?? 0;
                const widthPct = maxSpanDuration > 0 ? (duration / maxSpanDuration) * 100 : 0;
                return (
                  <Stack key={span.span_id || i} spacing={0.5}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography sx={{ fontSize: 12, color: textColors.primary }}>
                        {span.name || "span"}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: textColors.secondary }}>
                        {Math.round(duration)}ms
                      </Typography>
                    </Stack>
                    <Box
                      sx={{
                        height: 8,
                        borderRadius: "4px",
                        backgroundColor: background.hover,
                        overflow: "hidden",
                      }}
                    >
                      <Box
                        sx={{
                          height: "100%",
                          width: `${widthPct}%`,
                          backgroundColor: getStatusColor(span.status) || brand.primary,
                        }}
                      />
                    </Box>
                  </Stack>
                );
              })}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
