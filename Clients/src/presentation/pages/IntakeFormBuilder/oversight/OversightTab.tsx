import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Clock, FileText, RefreshCw, ShieldAlert } from "lucide-react";
import { StatCard } from "../../../components/Cards/StatCard";
import Chip from "../../../components/Chip";
import Select from "../../../components/Inputs/Select";
import { EmptyState } from "../../../components/EmptyState";
import singleTheme from "../../../themes/v1SingleTheme";
import palette, { chart as chartPalette } from "../../../themes/palette";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import {
  getIntakeOversight,
  type IntakeForm,
} from "../../../../application/repository/intakeForm.repository";
import type { IntakeOversight, NeedsAttentionKind } from "../types";
import { hoursToDays, percent } from "./format";

type Weeks = 4 | 8 | 12;

const PERIOD_ITEMS: Array<{ _id: string; name: string }> = [
  { _id: "4", name: "Last 4 weeks" },
  { _id: "8", name: "Last 8 weeks" },
  { _id: "12", name: "Last 12 weeks" },
];

const ALL_FORMS = "all";

const ATTENTION_LABELS: Record<NeedsAttentionKind, string> = {
  second_review_open: "Second review open",
  second_review_missed: "Second review missed",
  prohibited_pending: "Prohibited, pending",
  pending_old: "Pending too long",
  lane_empty: "No active reviewer",
};

const SERIES: Array<{ key: keyof IntakeOversight["byWeek"][number]; name: string; color: string }> =
  [
    { key: "senior", name: "Expert", color: chartPalette[1] },
    { key: "closeCall", name: "Close call", color: chartPalette[6] },
    { key: "standard", name: "Regular", color: chartPalette[0] },
    { key: "notRouted", name: "Not assigned", color: chartPalette[2] },
    { key: "routingOff", name: "Assignment off", color: palette.border.dark },
  ];

interface OversightTabProps {
  forms: IntakeForm[];
  onOpenSubmission: (submissionId: number) => void;
  onOpenForm: (formId: number) => void;
  /** Change to reload the figures, for example after a decision in the review modal. */
  refreshKey?: number;
}

/** Median hours shown as days; the unit is a static fragment so it can be translated. */
const Days = ({ hours }: { hours: number | null }) => {
  const days = hoursToDays(hours);
  if (days === null) return <>—</>;
  return (
    <>
      {days} <span>days</span>
    </>
  );
};

/** "N of M (x%)", or a dash when there is nothing to divide by. */
const Rate = ({ part, whole }: { part: number; whole: number }) => {
  const pct = percent(part, whole);
  if (pct === null) return <>—</>;
  return (
    <>
      {part} <span>of</span> {whole} ({pct}%)
    </>
  );
};

const weekLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

export function OversightTab({
  forms,
  onOpenSubmission,
  onOpenForm,
  refreshKey = 0,
}: OversightTabProps) {
  const theme = useTheme();
  const formatDate = useFormattedDate();
  const [weeks, setWeeks] = useState<Weeks>(8);
  const [formId, setFormId] = useState<string>(ALL_FORMS);
  const [data, setData] = useState<IntakeOversight | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setHasError(false);
    getIntakeOversight(weeks, formId === ALL_FORMS ? undefined : Number(formId), controller.signal)
      .then((res) => {
        setData(res.data);
        setIsLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setData(null);
        setHasError(true);
        setIsLoading(false);
      });
    return () => controller.abort();
  }, [weeks, formId, refreshKey]);

  const cardSx = {
    background: theme.palette.background.paper,
    border: `1px solid ${theme.palette.border.light}`,
    borderRadius: "4px",
    p: "16px",
  };
  const headerCell = singleTheme.tableStyles.primary.header.cell;
  const bodyCell = singleTheme.tableStyles.primary.body.cell;

  const formItems = [
    { _id: ALL_FORMS, name: "All forms" },
    ...forms.map((f) => ({ _id: String(f.id), name: f.name })),
  ];

  const filters = (
    <Stack direction="row" gap="8px">
      <Select
        id="oversight-period"
        value={String(weeks)}
        items={PERIOD_ITEMS}
        onChange={(e) => setWeeks(Number(e.target.value) as Weeks)}
        sx={{ width: 160, backgroundColor: theme.palette.background.main }}
      />
      <Select
        id="oversight-form"
        value={formId}
        items={formItems}
        onChange={(e) => setFormId(String(e.target.value))}
        sx={{ width: 200, backgroundColor: theme.palette.background.main }}
      />
    </Stack>
  );

  const body = (d: IntakeOversight): ReactNode => (
    <>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        <Box data-testid="kpi-submissions">
          <StatCard
            title="Submissions"
            Icon={FileText}
            value={d.totals.submissions}
            subtitle={
              <>
                {d.totals.senior} <span>expert</span> · {d.totals.standard} <span>regular</span> ·{" "}
                {d.totals.closeCalls} <span>close calls</span> · {d.totals.notRouted}{" "}
                <span>not assigned</span> · {d.totals.routingOff} <span>assignment off</span>
              </>
            }
          />
        </Box>
        <Box data-testid="kpi-median">
          <StatCard
            title="Median time to decision"
            Icon={Clock}
            value={<Days hours={d.medianDecisionHours.all} />}
            subtitle={
              <>
                <span>Expert</span> <Days hours={d.medianDecisionHours.senior} /> ·{" "}
                <span>Regular</span> <Days hours={d.medianDecisionHours.standard} />
              </>
            }
          />
        </Box>
        <Box data-testid="kpi-redlines">
          <StatCard
            title="Redlines caught"
            Icon={ShieldAlert}
            value={d.redlines.prohibited + d.redlines.highRisk}
            subtitle={
              <>
                {d.redlines.prohibited} <span>prohibited</span> · {d.redlines.highRisk}{" "}
                <span>high risk</span>
              </>
            }
          />
        </Box>
        <Box data-testid="kpi-second-reviews">
          <StatCard
            title="Second reviews"
            Icon={RefreshCw}
            value={
              <>
                {d.secondReviews.missed} <span>of</span> {d.secondReviews.completed}
              </>
            }
            subtitle={
              <>
                <span>missed of completed</span> · {d.secondReviews.open} <span>open</span>
              </>
            }
          />
        </Box>
      </Box>

      <Box sx={cardSx}>
        <Typography sx={{ fontWeight: 600, fontSize: 16, mb: "12px" }}>
          Submissions by review level
        </Typography>
        <ResponsiveContainer width="100%" height={260} minWidth={0} style={{ outline: "none" }}>
          <BarChart data={d.byWeek.map((w) => ({ ...w, label: weekLabel(w.weekStart) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke={palette.border.light} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: palette.text.tertiary }}
              axisLine={{ stroke: palette.border.light }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: palette.text.tertiary }}
              axisLine={{ stroke: palette.border.light }}
            />
            <ChartTooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} stackId="lane" fill={s.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Box>

      <Box sx={cardSx}>
        <Typography sx={{ fontWeight: 600, fontSize: 16, mb: "12px" }}>Reviewers</Typography>
        {d.reviewers.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
            No decisions in this period.
          </Typography>
        ) : (
          <TableContainer>
            <Table sx={singleTheme.tableStyles.primary.frame}>
              <TableHead>
                <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                  <TableCell sx={headerCell}>Reviewer</TableCell>
                  <TableCell sx={headerCell}>Decisions</TableCell>
                  <TableCell sx={headerCell}>Band changed</TableCell>
                  <TableCell sx={headerCell}>Median time</TableCell>
                  <TableCell sx={headerCell} />
                </TableRow>
              </TableHead>
              <TableBody>
                {d.reviewers.map((r) => (
                  <TableRow key={r.userId} sx={singleTheme.tableStyles.primary.body.row}>
                    <TableCell sx={bodyCell}>{r.name}</TableCell>
                    <TableCell sx={bodyCell}>{r.decisions}</TableCell>
                    <TableCell sx={bodyCell}>
                      {r.bandChanged} ({percent(r.bandChanged, r.decisions) ?? 0}%)
                    </TableCell>
                    <TableCell sx={bodyCell}>
                      <Days hours={r.medianDecisionHours} />
                    </TableCell>
                    <TableCell sx={bodyCell}>
                      {r.check && (
                        <Tooltip
                          arrow
                          title={
                            <>
                              <span>Never changed a band in</span> {r.decisions}{" "}
                              <span>decisions</span>
                            </>
                          }
                        >
                          <span>
                            <Chip label="Check" variant="warning" uppercase={false} />
                          </span>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mt: "8px" }}>
          Counts the band in force at decision
        </Typography>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
        <Box sx={cardSx} data-testid="band-kept">
          <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>Band kept</Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>
            <Rate part={d.bandKept.kept} whole={d.bandKept.decided} />
          </Typography>
        </Box>
        <Box sx={cardSx} data-testid="band-kept-senior">
          <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
            Band kept, expert review
          </Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>
            <Rate part={d.bandKept.seniorKept} whole={d.bandKept.seniorDecided} />
          </Typography>
        </Box>
        <Box sx={cardSx} data-testid="suggestions-accepted">
          <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
            Suggested risks accepted
          </Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>
            <Rate part={d.suggestions.accepted} whole={d.suggestions.suggested} />
          </Typography>
        </Box>
      </Box>
    </>
  );

  const attention = (d: IntakeOversight) =>
    d.needsAttention.length > 0 && (
      <Box sx={cardSx}>
        <Stack direction="row" alignItems="center" gap="6px" sx={{ mb: "12px" }}>
          <AlertTriangle size={16} strokeWidth={1.5} color={palette.status.warning.text} />
          <Typography sx={{ fontWeight: 600, fontSize: 16 }}>Needs attention</Typography>
        </Stack>
        <Stack gap="8px">
          {d.needsAttention.map((item) => (
            <Stack
              key={`${item.kind}-${item.submissionId ?? "f"}-${item.formId}`}
              direction="row"
              alignItems="center"
              gap="12px"
            >
              <Chip label={ATTENTION_LABELS[item.kind]} variant="warning" uppercase={false} />
              <Typography
                component="button"
                type="button"
                onClick={() =>
                  item.submissionId !== null
                    ? onOpenSubmission(item.submissionId)
                    : onOpenForm(item.formId)
                }
                sx={{
                  "background": "none",
                  "border": "none",
                  "p": 0,
                  "cursor": "pointer",
                  "fontSize": 13,
                  "color": theme.palette.primary.main,
                  "textAlign": "left",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                {item.title}
              </Typography>
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary, ml: "auto" }}>
                {formatDate(new Date(item.at))}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
    );

  return (
    <Stack gap="16px" sx={{ mt: "16px" }}>
      {filters}
      {hasError && <Alert severity="error">Failed to load the oversight figures.</Alert>}
      {isLoading && !data && (
        <Box sx={{ display: "flex", justifyContent: "center", py: "64px" }}>
          <CircularProgress sx={{ color: theme.palette.primary.main }} />
        </Box>
      )}
      {data &&
        (data.totals.submissions === 0 ? (
          <>
            <EmptyState icon={FileText} message="No submissions in this period." showBorder />
            {attention(data)}
          </>
        ) : (
          <>
            {body(data)}
            {attention(data)}
          </>
        ))}
    </Stack>
  );
}
