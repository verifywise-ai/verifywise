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
  Button,
  Card,
  CardContent,
  Tabs,
  Tab,
} from "@mui/material";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { FileText, Download, Eye, Shield, Activity, Clock, XCircle } from "lucide-react";
import {
  text as textColors,
  background,
  border as borderPalette,
  brand,
  status,
  accent,
} from "../../themes/palette";
import Chip from "../../components/Chip";
import { useAuditLog, useAuditAnalytics } from "../../../application/hooks/useAIAudit";
import {
  exportAuditLog,
  getActionAuditTrail,
} from "../../../application/repository/aiAudit.repository";

// Consistent card style matching DashboardCard / DashboardHeaderCard
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

function getStateColor(state: string | undefined): string {
  switch (state) {
    case "completed":
    case "approved":
    case "auto_approve":
      return status.success.text;
    case "pending_approval":
    case "idle":
    case "evaluate":
      return accent.primary.text;
    case "executing":
      return brand.primary;
    case "rejected":
    case "auto_reject":
    case "failed":
      return status.error.text;
    default:
      return textColors.accent;
  }
}

function getStateBg(state: string | undefined): string {
  switch (state) {
    case "completed":
    case "approved":
    case "auto_approve":
      return status.success.bg;
    case "pending_approval":
    case "idle":
    case "evaluate":
      return accent.primary.bg;
    case "executing":
      return brand.primaryLight;
    case "rejected":
    case "auto_reject":
    case "failed":
      return status.error.bg;
    default:
      return background.accent;
  }
}

function formatStateLabel(state: string | undefined): string {
  if (!state) return "—";
  return state.replace(/_/g, " ");
}

const ACTOR_TYPE_OPTIONS = [
  { value: "all", label: "All actors" },
  { value: "user", label: "User" },
  { value: "system", label: "System" },
  { value: "rule_engine", label: "Rule engine" },
];

export default function AIAuditDashboard() {
  const [period, setPeriod] = useState("30d");
  const [actorType, setActorType] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTrail, setDetailTrail] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const selectedPeriod = PERIOD_OPTIONS.find((p) => p.value === period)!;
  const dateFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - selectedPeriod.days);
    return d.toISOString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const { data: analytics, isLoading: analyticsLoading } = useAuditAnalytics(dateFrom);
  const { data: logData, isLoading: logLoading } = useAuditLog({
    dateFrom,
    actorType: actorType === "all" ? undefined : actorType,
    limit: rowsPerPage,
    offset: page * rowsPerPage,
  });

  const summary = analytics?.summary || {};
  const byState = analytics?.byState || [];
  const byCategory = analytics?.byCategory || [];
  const dailyVolume = analytics?.dailyVolume || [];

  const handleViewDetail = async (actionId: string) => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const trail = await getActionAuditTrail(actionId);
      setDetailTrail(Array.isArray(trail) ? trail : []);
    } catch {
      setDetailTrail([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      await exportAuditLog("csv", dateFrom);
    } catch {
      // Silent fail
    }
  };

  const statCards = [
    {
      label: "Total actions",
      value: summary.total_actions ?? 0,
      icon: <Activity size={13} />,
    },
    {
      label: "Auto-approve rate",
      value: `${summary.auto_approve_pct ?? 0}%`,
      icon: <Shield size={13} />,
    },
    {
      label: "Avg wait time",
      value: `${Math.round(summary.avg_wait_seconds ?? 0)}s`,
      icon: <Clock size={13} />,
    },
    {
      label: "Rejection rate",
      value: `${summary.rejection_rate_pct ?? 0}%`,
      icon: <XCircle size={13} />,
    },
  ];

  return (
    <Box>
      {/* Header — matches Readiness / AI content review style */}
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
            AI audit
          </Typography>
          <Typography sx={{ fontSize: 13, color: textColors.secondary, mt: 0.25 }}>
            Complete audit trail for every AI action. EU AI Act Article 12 compliance.
          </Typography>
        </Box>

        <Stack direction="row" alignItems="center" spacing={1.5}>
          {/* Period chips — same pattern as VisibilityChips */}
          <Stack direction="row" spacing={1}>
            {PERIOD_OPTIONS.map((opt) => {
              const isSelected = period === opt.value;
              return (
                <Box
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  sx={{ cursor: "pointer" }}
                >
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

          <Button
            variant="contained"
            size="small"
            onClick={handleExport}
            startIcon={<Download size={14} />}
            sx={{
              "textTransform": "none",
              "minWidth": 120,
              "backgroundColor": brand.primary,
              "borderRadius": "4px",
              "fontSize": 13,
              "fontWeight": 500,
              "boxShadow": "none",
              "&:hover": {
                backgroundColor: brand.primaryHover,
                boxShadow: "none",
              },
            }}
          >
            Export CSV
          </Button>
        </Stack>
      </Stack>

      {/* Stat cards — matches AI Content Review DashboardHeaderCard pattern */}
      <Box
        sx={{
          "display": "flex",
          "flexWrap": "wrap",
          "gap": "8px",
          "mb": "8px",
          "& > *": { flex: "1 1 0", minWidth: "120px" },
        }}
      >
        {analyticsLoading ? (
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
                <Typography
                  sx={{
                    fontSize: 12,
                    color: textColors.secondary,
                    fontWeight: 500,
                  }}
                >
                  {card.label}
                </Typography>
              </Stack>
              <Typography
                sx={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: textColors.primary,
                  lineHeight: 1.2,
                }}
              >
                {card.value}
              </Typography>
            </Stack>
          ))
        )}
      </Box>

      {/* Charts row — Card/CardContent pattern like ReadinessDashboard */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
          gap: "8px",
          mb: "8px",
        }}
      >
        <Card elevation={0} sx={cardSx}>
          <CardContent sx={{ "p": "16px", "&:last-child": { pb: "16px" } }}>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: textColors.primary,
                mb: 1,
              }}
            >
              Actions by state
            </Typography>
            {byState.length === 0 ? (
              <Box sx={{ py: 4, textAlign: "center" }}>
                <Typography sx={{ fontSize: 12, color: textColors.accent }}>No data</Typography>
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={byState}
                    dataKey="count"
                    nameKey="state"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {byState.map((entry: any, i: number) => (
                      <Cell key={i} fill={getStateColor(entry.state)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 4,
                      border: `1px solid ${borderPalette.dark}`,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card elevation={0} sx={cardSx}>
          <CardContent sx={{ "p": "16px", "&:last-child": { pb: "16px" } }}>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: textColors.primary,
                mb: 1,
              }}
            >
              Actions by category
            </Typography>
            {byCategory.length === 0 ? (
              <Box sx={{ py: 4, textAlign: "center" }}>
                <Typography sx={{ fontSize: 12, color: textColors.accent }}>No data</Typography>
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byCategory}>
                  <CartesianGrid strokeDasharray="3 3" stroke={borderPalette.light} />
                  <XAxis dataKey="category" tick={{ fontSize: 11, fill: textColors.secondary }} />
                  <YAxis tick={{ fontSize: 11, fill: textColors.secondary }} />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 4,
                      border: `1px solid ${borderPalette.dark}`,
                    }}
                  />
                  <Bar dataKey="count" fill={brand.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card elevation={0} sx={cardSx}>
          <CardContent sx={{ "p": "16px", "&:last-child": { pb: "16px" } }}>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: textColors.primary,
                mb: 1,
              }}
            >
              Daily volume
            </Typography>
            {dailyVolume.length === 0 ? (
              <Box sx={{ py: 4, textAlign: "center" }}>
                <Typography sx={{ fontSize: 12, color: textColors.accent }}>No data</Typography>
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={dailyVolume}>
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
                    dataKey="count"
                    stroke={brand.primary}
                    strokeWidth={2}
                    dot={{ r: 3, fill: brand.primary }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Tab header — same style as AI content review */}
      <Tabs
        value={0}
        TabIndicatorProps={{ style: { backgroundColor: brand.primary } }}
        sx={{
          "mb": "8px",
          "minHeight": "20px",
          "& .MuiTab-root": {
            textTransform: "none",
            fontWeight: 400,
            minHeight: "20px",
            padding: "16px 0 7px",
            fontSize: 13,
          },
          "& .Mui-selected": { color: brand.primary },
          "& .MuiTabs-flexContainer": { columnGap: "34px" },
        }}
      >
        <Tab
          label={
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <FileText size={14} />
              <span>Audit log</span>
              {logData?.total ? (
                <Chip
                  label={String(logData.total)}
                  size="small"
                  uppercase={false}
                  backgroundColor={background.hover}
                />
              ) : null}
            </Stack>
          }
        />
      </Tabs>

      {/* Actor type filter chips */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: "8px" }}>
        <Typography
          sx={{
            fontSize: 12,
            color: textColors.secondary,
            fontWeight: 500,
          }}
        >
          Filter by actor:
        </Typography>
        {ACTOR_TYPE_OPTIONS.map((opt) => {
          const isSelected = actorType === opt.value;
          return (
            <Box
              key={opt.value}
              onClick={() => {
                setActorType(opt.value);
                setPage(0);
              }}
              sx={{ cursor: "pointer" }}
            >
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

      {/* Audit log table */}
      <Card elevation={0} sx={cardSx}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: background.accent }}>
                {["Timestamp", "Tool", "State", "Actor", "Risk", "Action"].map((h) => (
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
              {logLoading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, border: "none" }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : (logData?.rows || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, border: "none" }}>
                    <Typography sx={{ fontSize: 12, color: textColors.accent }}>
                      No audit entries found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                (logData?.rows || []).map((row: any, i: number) => (
                  <TableRow
                    key={row.id || i}
                    hover
                    sx={{
                      "&:hover": { backgroundColor: background.hover },
                    }}
                  >
                    <TableCell
                      sx={{
                        fontSize: 12,
                        color: textColors.secondary,
                        borderBottom: `1px solid ${borderPalette.light}`,
                      }}
                    >
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: 12,
                        fontFamily: "monospace",
                        color: textColors.primary,
                        borderBottom: `1px solid ${borderPalette.light}`,
                      }}
                    >
                      {row.tool_name || "—"}
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${borderPalette.light}` }}>
                      <Chip
                        label={formatStateLabel(row.to_state)}
                        size="small"
                        uppercase={false}
                        backgroundColor={getStateBg(row.to_state)}
                        textColor={getStateColor(row.to_state)}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: 12,
                        color: textColors.secondary,
                        borderBottom: `1px solid ${borderPalette.light}`,
                      }}
                    >
                      {row.actor_name
                        ? `${row.actor_name} ${row.actor_surname || ""}`.trim()
                        : row.actor_type}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: 12,
                        color: textColors.secondary,
                        borderBottom: `1px solid ${borderPalette.light}`,
                      }}
                    >
                      {row.risk_level || "—"}
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${borderPalette.light}` }}>
                      <IconButton
                        size="small"
                        onClick={() => handleViewDetail(row.action_approval_id)}
                        sx={{
                          "color": textColors.icon,
                          "&:hover": {
                            color: brand.primary,
                            backgroundColor: brand.primaryLight,
                          },
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
          count={logData?.total || 0}
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

      {/* Detail dialog */}
      <Dialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "4px",
            border: `1px solid ${borderPalette.dark}`,
          },
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
          Action audit trail
        </DialogTitle>
        <DialogContent sx={{ py: 2 }}>
          {detailLoading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress size={24} />
            </Box>
          ) : detailTrail.length === 0 ? (
            <Alert severity="info" sx={{ fontSize: 13 }}>
              No audit trail entries found
            </Alert>
          ) : (
            <Stack spacing={1.5} sx={{ py: 1 }}>
              {detailTrail.map((entry: any, i: number) => (
                <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: getStateColor(entry.to_state),
                      mt: 0.8,
                      flexShrink: 0,
                    }}
                  />
                  <Stack spacing={0.25} flex={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        label={formatStateLabel(entry.to_state)}
                        size="small"
                        uppercase={false}
                        backgroundColor={getStateBg(entry.to_state)}
                        textColor={getStateColor(entry.to_state)}
                      />
                      {entry.from_state && (
                        <Typography sx={{ fontSize: 11, color: textColors.accent }}>
                          from {formatStateLabel(entry.from_state)}
                        </Typography>
                      )}
                    </Stack>
                    <Typography sx={{ fontSize: 11, color: textColors.secondary }}>
                      {new Date(entry.created_at).toLocaleString()} — {entry.actor_type}
                      {entry.rule_name && ` (rule: ${entry.rule_name})`}
                    </Typography>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
