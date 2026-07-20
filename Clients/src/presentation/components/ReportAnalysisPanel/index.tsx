import type { ReactNode } from "react";
import { Box, Card, Skeleton, Stack, Typography, useTheme } from "@mui/material";
import { AlertTriangle, Sparkles } from "lucide-react";
import Chip from "../Chip";
import { EmptyState } from "../EmptyState";
import { cardStyles } from "../../themes/components";
import type {
  AnalysisPayload,
  ComplianceGapPayload,
  ExecutiveSummaryPayload,
  KeyFindingsPayload,
  RecommendedActionsPayload,
  ReportRunAnalysis,
  RiskAnalysisPayload,
  SectionSummariesPayload,
  VendorRiskPayload,
} from "../../../domain/interfaces/i.reporting";

interface ReportAnalysisPanelProps {
  /** Rows from GET /reporting/runs/:id/analyses. The caller owns the hook. */
  analyses: ReportRunAnalysis[] | undefined;
  isLoading?: boolean;
}

/**
 * Readable heading per section key. `section_key` is typed as a plain string on
 * the row, so an unmapped key falls back to the raw key rather than rendering
 * nothing — a new backend analyzer must never disappear from this panel.
 */
const SECTION_LABELS: Record<string, string> = {
  executiveSummary: "Executive summary",
  keyFindings: "Key findings",
  recommendedActions: "Recommended actions",
  riskAnalysis: "Risk analysis",
  complianceGap: "Compliance gap analysis",
  vendorRisk: "Third-party risk analysis",
  sectionSummaries: "Per-section summaries",
};

/**
 * Every analyzer payload except sectionSummaries carries abstain_reason. The
 * `in` check narrows the union, so no cast is needed and no field is invented.
 */
function abstainReasonOf(payload: AnalysisPayload): string | null {
  if (!payload || !("abstain_reason" in payload)) return null;
  return payload.abstain_reason;
}

function Prose({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Typography
      sx={{
        fontSize: 13,
        color: theme.palette.text.secondary,
        lineHeight: 1.5,
        whiteSpace: "pre-line",
      }}
    >
      {text}
    </Typography>
  );
}

/** One list row: primary sentence, an optional severity/level chip, an optional caption. */
function ListItem({
  primary,
  chipLabel,
  secondary,
}: {
  primary: string;
  chipLabel?: string;
  secondary?: string | null;
}) {
  const theme = useTheme();
  return (
    <Stack spacing="4px">
      <Stack direction="row" spacing="8px" alignItems="flex-start">
        <Typography
          sx={{
            fontSize: 13,
            color: theme.palette.text.secondary,
            lineHeight: 1.5,
            flex: 1,
            minWidth: 0,
          }}
        >
          {primary}
        </Typography>
        {chipLabel && <Chip label={chipLabel} size="small" uppercase={false} />}
      </Stack>
      {secondary && (
        <Typography sx={{ fontSize: 11, color: theme.palette.text.accent, lineHeight: 1.4 }}>
          {secondary}
        </Typography>
      )}
    </Stack>
  );
}

function Caveat({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Typography
      sx={{ fontSize: 12, color: theme.palette.status.warning.text, lineHeight: 1.5 }}
    >
      {text}
    </Typography>
  );
}

/**
 * Narrow on section_key and render only the fields the analyzer schemas
 * actually produce (mirrored in i.reporting.ts). Returns null when there is
 * nothing to show, so the caller can decide what quiet state to render.
 */
function sectionBody(sectionKey: string, payload: AnalysisPayload): ReactNode {
  if (!payload) return null;

  switch (sectionKey) {
    case "executiveSummary": {
      const p = payload as ExecutiveSummaryPayload;
      return p.summary ? <Prose text={p.summary} /> : null;
    }

    case "keyFindings": {
      const p = payload as KeyFindingsPayload;
      if (!p.findings?.length) return null;
      return (
        <Stack spacing="12px">
          {p.findings.map((f, i) => (
            <ListItem key={i} primary={f.text} chipLabel={f.severity} secondary={f.section} />
          ))}
        </Stack>
      );
    }

    case "recommendedActions": {
      const p = payload as RecommendedActionsPayload;
      if (!p.actions?.length) return null;
      return (
        <Stack spacing="12px">
          {p.actions.map((a, i) => (
            <ListItem
              key={i}
              primary={a.action}
              chipLabel={a.priority}
              secondary={
                a.suggestedOwner ? `${a.rationale} — Owner: ${a.suggestedOwner}` : a.rationale
              }
            />
          ))}
        </Stack>
      );
    }

    case "riskAnalysis": {
      const p = payload as RiskAnalysisPayload;
      const risks = p.top_risks ?? [];
      if (!p.narrative && !risks.length) return null;
      return (
        <Stack spacing="12px">
          {p.narrative && <Prose text={p.narrative} />}
          {risks.map((r, i) => (
            <ListItem key={i} primary={r.name} chipLabel={r.level} secondary={r.why} />
          ))}
        </Stack>
      );
    }

    case "complianceGap": {
      const p = payload as ComplianceGapPayload;
      const gaps = p.gaps ?? [];
      if (!p.narrative && !gaps.length && !p.scores_caveat) return null;
      return (
        <Stack spacing="12px">
          {p.narrative && <Prose text={p.narrative} />}
          {p.scores_caveat && <Caveat text={p.scores_caveat} />}
          {gaps.map((g, i) => (
            <ListItem key={i} primary={g.control} chipLabel={g.priority} secondary={g.gap} />
          ))}
        </Stack>
      );
    }

    case "vendorRisk": {
      const p = payload as VendorRiskPayload;
      const concerns = p.concerns ?? [];
      if (!p.narrative && !concerns.length) return null;
      return (
        <Stack spacing="12px">
          {p.narrative && <Prose text={p.narrative} />}
          {concerns.map((c, i) => (
            <ListItem key={i} primary={c.vendor} chipLabel={c.severity} secondary={c.concern} />
          ))}
        </Stack>
      );
    }

    case "sectionSummaries": {
      const p = payload as SectionSummariesPayload;
      const entries = Object.entries(p.summaries ?? {});
      if (!entries.length) return null;
      return <SummaryList entries={entries} />;
    }

    default:
      return null;
  }
}

function SummaryList({ entries }: { entries: Array<[string, string]> }) {
  const theme = useTheme();
  return (
    <Stack spacing="12px">
      {entries.map(([key, summary]) => (
        <Stack key={key} spacing="4px">
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: theme.palette.text.tertiary }}>
            {key}
          </Typography>
          <Prose text={summary} />
        </Stack>
      ))}
    </Stack>
  );
}

function AnalysisCard({ analysis }: { analysis: ReportRunAnalysis }) {
  const theme = useTheme();
  const label = SECTION_LABELS[analysis.section_key] ?? analysis.section_key;
  const abstainReason = abstainReasonOf(analysis.payload);
  const body = sectionBody(analysis.section_key, analysis.payload);

  return (
    <Card elevation={0} sx={cardStyles.base(theme)}>
      {/* Card title: 16px / 600 / 1.4 / text.primary */}
      <Typography
        sx={{
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1.4,
          color: theme.palette.text.primary,
          mb: "12px",
        }}
      >
        {label}
      </Typography>

      {abstainReason && (
        <Stack direction="row" spacing="8px" alignItems="flex-start" sx={{ mb: "12px" }}>
          <Box sx={{ color: theme.palette.status.warning.text, mt: "2px", flexShrink: 0 }}>
            <AlertTriangle size={16} />
          </Box>
          <Typography
            sx={{ fontSize: 13, color: theme.palette.status.warning.text, lineHeight: 1.5 }}
          >
            The analyzer abstained: {abstainReason}
          </Typography>
        </Stack>
      )}

      {body}

      {/* Quiet fallback — a null payload (abstained or failed analyzer) or an
          empty result. Suppressed when an abstain reason already explains it. */}
      {!body && !abstainReason && (
        <Typography sx={{ fontSize: 12, color: theme.palette.text.tertiary, lineHeight: 1.5 }}>
          This section was not generated.
        </Typography>
      )}

      <Box
        sx={{
          mt: "12px",
          pt: "12px",
          borderTop: `1px solid ${theme.palette.border.light}`,
        }}
      >
        <Typography sx={{ fontSize: 11, color: theme.palette.text.accent }}>
          {analysis.analysis_model ?? "Model not recorded"} ·{" "}
          {new Date(analysis.analyzed_at).toLocaleString()}
        </Typography>
      </Box>
    </Card>
  );
}

export default function ReportAnalysisPanel({ analyses, isLoading }: ReportAnalysisPanelProps) {
  if (isLoading) {
    // Shape is known (a stack of section cards), so skeletons rather than a spinner.
    return (
      <Stack spacing="16px">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={140} />
        ))}
      </Stack>
    );
  }

  if (!analyses?.length) {
    return (
      <EmptyState
        icon={Sparkles}
        message="No AI analyses were generated for this report run."
        showBorder
      />
    );
  }

  return (
    <Stack spacing="16px">
      {analyses.map((analysis) => (
        <AnalysisCard key={analysis.id} analysis={analysis} />
      ))}
    </Stack>
  );
}
