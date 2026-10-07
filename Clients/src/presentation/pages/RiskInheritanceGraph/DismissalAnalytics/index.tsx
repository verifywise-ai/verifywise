/**
 * @fileoverview Dismissal analytics for tuning the suggestion engine.
 *
 * Read-only aggregates over decided links: which engine signal humans throw
 * away (Block A), why per relation/source group (Block B), and what they
 * wrote about it (Block C). Owns its own fetch and loading/error/empty state
 * — a failed graph fetch must never hide analytics that render fine.
 *
 * Deliberately no charts: these tables are a handful of rows and a chart
 * earns nothing. Deliberately no score: inherits_from agent rows all carry
 * score 0 and related_to scores are unbounded, so there is no range to band.
 */

import React, { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  CircularProgress,
  Typography,
} from "@mui/material";
import { AlertCircle, BarChart, ChevronDown } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import { getDismissalAnalytics } from "../../../../application/repository/riskLink.repository";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import type {
  DismissalAnalytics as DismissalAnalyticsPayload,
  DismissReason,
  DismissalReasonRow,
  DismissalSignalRow,
} from "../../../../domain/interfaces/i.riskLink";
import { DISMISS_REASON_LABELS } from "../../../components/LinkedRisksPanel/DismissReasonForm";
import ReportTable, { type ReportColumn } from "../ReportTable";
import { fill } from "../../../../i18n/fill";
import {
  sectionSx,
  summaryHeaderSx,
  summaryTitleSx,
  summaryDescriptionSx,
  blockHeadingSx,
  captionSx,
  notesFrameSx,
  rateCellSx,
  barTrackSx,
  barFillSx,
  groupHeaderSx,
  noteItemSx,
  noteMetaSx,
  noteTextSx,
  stateContainerSx,
  errorAlertSx,
  errorTextSx,
} from "./styles";
import { signalLabel } from "../../../components/LinkedRisksPanel/signalLabel";

/** Three cases, not two: mode() returns SQL NULL for a signal with decided
 * links but zero dismissals — the healthiest row in the table. */
export const topReasonLabel = (topReason: string | null): string => {
  if (topReason === null) return "—";
  if (topReason === "none") return "No reason given";
  return DISMISS_REASON_LABELS[topReason as DismissReason] ?? topReason;
};

/** dismiss_reason = NULL is a legitimate expected state, not missing data. */
export const reasonLabel = (dismissReason: DismissReason | null): string =>
  dismissReason === null
    ? "No reason given"
    : (DISMISS_REASON_LABELS[dismissReason] ?? dismissReason);

/** Percent text for a dismiss rate. decided === 0 renders a dash, never NaN. */
export const rateText = (decided: number, dismissed: number): string =>
  decided === 0 ? "—" : `${Math.round((dismissed / decided) * 100)}%`;

export const ratePercent = (decided: number, dismissed: number): number =>
  decided === 0 ? 0 : (dismissed / decided) * 100;

export interface ReasonGroup {
  relationType: string;
  source: string;
  decided: number;
  dismissed: number;
  rows: { key: string; label: string; count: number }[];
}

/**
 * Group reason rows by relationType, then source. Rates are never pooled
 * across either: the reason vocabulary is relation-scoped
 * (wrong_direction never co-occurs with not_related), and source = 'user'
 * links were confirmed by construction and never dismissible.
 */
export function groupReasons(rows: DismissalReasonRow[]): ReasonGroup[] {
  const groups = new Map<string, ReasonGroup>();
  for (const row of rows) {
    const key = `${row.relationType} · ${row.source}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        relationType: row.relationType,
        source: row.source,
        decided: 0,
        dismissed: 0,
        rows: [],
      };
      groups.set(key, group);
    }
    group.decided += row.count;
    // Confirmed links contribute to `decided` but carry no reason, so listing
    // them here would render them as "No reason given" dismissals.
    if (row.status === "dismissed") {
      group.dismissed += row.count;
      group.rows.push({
        key: `${row.status}:${row.dismissReason ?? "null"}`,
        label: reasonLabel(row.dismissReason),
        count: row.count,
      });
    }
  }
  return [...groups.values()];
}

type ReasonRow = ReasonGroup["rows"][number];

// Module-level: nothing in a cell depends on component state, so the column
// arrays (and the comparator derived from them) never change identity.
const SIGNAL_COLUMNS: ReportColumn<DismissalSignalRow>[] = [
  {
    id: "signal",
    label: "Signal",
    sortable: true,
    sortValue: (row) => signalLabel(row.signal),
    render: (row) => signalLabel(row.signal),
  },
  {
    id: "decided",
    label: "Decided",
    sortable: true,
    align: "right",
    sortValue: (row) => row.decided,
    render: (row) => row.decided,
  },
  {
    id: "dismissed",
    label: "Dismissed",
    sortable: true,
    align: "right",
    sortValue: (row) => row.dismissed,
    render: (row) => row.dismissed,
  },
  {
    id: "rate",
    label: "Dismiss rate",
    sortable: true,
    // decided === 0 renders a dash; it sorts with the unrated rows, not as 0%.
    sortValue: (row) => (row.decided === 0 ? null : ratePercent(row.decided, row.dismissed)),
    render: (row) => (
      <Box sx={rateCellSx}>
        <Box sx={barTrackSx} aria-hidden="true">
          <Box sx={barFillSx(ratePercent(row.decided, row.dismissed))} />
        </Box>
        <span>{rateText(row.decided, row.dismissed)}</span>
      </Box>
    ),
  },
  {
    id: "topReason",
    label: "Top reason",
    sortable: true,
    sortValue: (row) => (row.topReason === null ? null : topReasonLabel(row.topReason)),
    render: (row) => topReasonLabel(row.topReason),
  },
];

const REASON_COLUMNS: ReportColumn<ReasonRow>[] = [
  {
    id: "reason",
    label: "Reason",
    sortable: true,
    sortValue: (row) => row.label,
    render: (row) => row.label,
  },
  {
    id: "count",
    label: "Count",
    sortable: true,
    align: "right",
    sortValue: (row) => row.count,
    render: (row) => row.count,
  },
];

const DismissalAnalytics: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<DismissalAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const payload = await getDismissalAnalytics();
        if (mounted) setData(payload);
      } catch (err) {
        if (mounted)
          setError(err instanceof Error ? err.message : "Failed to fetch dismissal analytics");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  // Confirmed-only groups have no reasons to explain; drop them so the block
  // never renders a heading over an empty table.
  const reasonGroups = data
    ? groupReasons(data.reasons).filter((group) => group.rows.length > 0)
    : [];

  return (
    <Accordion defaultExpanded={false} sx={sectionSx}>
      <AccordionSummary expandIcon={<ChevronDown size={18} />}>
        <Box sx={summaryHeaderSx}>
          <Typography sx={summaryTitleSx}>Dismissal analytics</Typography>
          <Typography sx={summaryDescriptionSx}>
            Which suggested links people reject, and why, so the suggestions can be tuned.
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 8 }}>
        {loading ? (
          <Box sx={stateContainerSx}>
            <CircularProgress size={24} />
          </Box>
        ) : error ? (
          <Box sx={errorAlertSx} role="alert">
            <AlertCircle size={16} />
            <Typography sx={errorTextSx}>{error}</Typography>
          </Box>
        ) : !data ||
          (data.signals.length === 0 && reasonGroups.length === 0 && data.notes.length === 0) ? (
          <EmptyState
            icon={BarChart}
            message="No decided links yet — numbers appear once suggestions are confirmed or dismissed."
            showBorder={false}
          />
        ) : (
          <>
            {data.signals.length > 0 && (
              <>
                <Typography sx={blockHeadingSx}>Current signals on decided links</Typography>
                <Typography sx={captionSx}>
                  Signals are recomputed on every save, so they describe the pair today, not the
                  moment of the decision.
                </Typography>
                <ReportTable
                  columns={SIGNAL_COLUMNS}
                  rows={data.signals}
                  getRowKey={(row) => row.signal}
                  storageKey="risk-inheritance-dismissal-signals"
                  defaultSortColumn="dismissed"
                  entityLabel="signal"
                />
              </>
            )}

            {reasonGroups.length > 0 && (
              <>
                <Typography sx={blockHeadingSx}>Why suggestions get dismissed</Typography>
                <Typography sx={captionSx}>
                  The &ldquo;No reason given&rdquo; bucket also holds links that were un-linked
                  after being accepted: confirming then dismissing a pair necessarily writes a NULL
                  reason, and no column records the prior status — so that bucket is not pure
                  suggester feedback.
                </Typography>
                {reasonGroups.map((group) => (
                  <Box key={`${group.relationType} · ${group.source}`}>
                    <Typography sx={groupHeaderSx}>
                      {/* Raw column values ("related_to", "agent") are not sentence case;
                          signalLabel is already the file's underscore-to-words helper. */}
                      {fill(
                        t("{relation} · {source} — {dismissed} of {decided} dismissed ({rate})"),
                        {
                          relation: t(signalLabel(group.relationType)),
                          source: t(signalLabel(group.source)),
                          dismissed: group.dismissed,
                          decided: group.decided,
                          rate: rateText(group.decided, group.dismissed),
                        },
                      )}
                    </Typography>
                    <ReportTable
                      columns={REASON_COLUMNS}
                      rows={group.rows}
                      getRowKey={(row) => row.key}
                      storageKey="risk-inheritance-dismissal-reasons"
                      defaultSortColumn="count"
                      entityLabel="reason"
                    />
                  </Box>
                ))}
              </>
            )}

            {data.notes.length > 0 && (
              <>
                <Typography sx={blockHeadingSx}>Recent notes</Typography>
                <Box sx={notesFrameSx}>
                  {data.notes.map((note) => (
                    <Box key={note.id} sx={noteItemSx}>
                      <Typography sx={noteMetaSx}>
                        {[
                          note.sourceName,
                          t(signalLabel(note.relationType)),
                          t(reasonLabel(note.dismissReason)),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        {note.decidedAt
                          ? ` · ${new Date(note.decidedAt).toLocaleDateString()}`
                          : ""}
                      </Typography>
                      <Typography sx={noteTextSx}>{note.dismissNote}</Typography>
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
};

export default DismissalAnalytics;
