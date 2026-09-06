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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { ChevronDown } from "lucide-react";
import { getDismissalAnalytics } from "../../../../application/repository/riskLink.repository";
import type {
  DismissalAnalytics as DismissalAnalyticsPayload,
  DismissReason,
  DismissalReasonRow,
} from "../../../../domain/interfaces/i.riskLink";
import { DISMISS_REASON_LABELS } from "../../../components/LinkedRisksPanel/DismissReasonForm";
import {
  sectionSx,
  blockHeadingSx,
  captionSx,
  tableSx,
  rateCellSx,
  barTrackSx,
  barFillSx,
  groupHeaderSx,
  noteItemSx,
  noteMetaSx,
  noteTextSx,
  stateContainerSx,
  stateTextSx,
} from "./styles";

/** Human label for a machine signal key. Derived, never hardcoded: providers
 * emit keys no static map knows about. */
export const signalLabel = (signal: string): string => {
  const spaced = signal.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

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
    if (row.status === "dismissed") group.dismissed += row.count;
    group.rows.push({
      key: `${row.status}:${row.dismissReason ?? "null"}`,
      label: reasonLabel(row.dismissReason),
      count: row.count,
    });
  }
  return [...groups.values()];
}

const DismissalAnalytics: React.FC = () => {
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
        if (mounted) setError(err instanceof Error ? err.message : "Failed to fetch dismissal analytics");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Accordion defaultExpanded={false} sx={sectionSx}>
      <AccordionSummary expandIcon={<ChevronDown size={18} />}>
        <Typography variant="subtitle2">Dismissal analytics</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {loading ? (
          <Box sx={stateContainerSx}>
            <CircularProgress size={24} />
          </Box>
        ) : error ? (
          <Box sx={stateContainerSx}>
            <Typography sx={stateTextSx}>{error}</Typography>
          </Box>
        ) : !data ||
          (data.signals.length === 0 && data.reasons.length === 0 && data.notes.length === 0) ? (
          <Box sx={stateContainerSx}>
            <Typography sx={stateTextSx}>
              No decided links yet — numbers appear once suggestions are confirmed or dismissed.
            </Typography>
          </Box>
        ) : (
          <>
            {data.signals.length > 0 && (
              <>
                <Typography sx={blockHeadingSx}>Current signals on decided links</Typography>
                <Typography sx={captionSx}>
                  Signals are recomputed on every save, so they describe the pair today, not the
                  moment of the decision.
                </Typography>
                <Table size="small" sx={tableSx}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Signal</TableCell>
                      <TableCell align="right">Decided</TableCell>
                      <TableCell align="right">Dismissed</TableCell>
                      <TableCell>Dismiss rate</TableCell>
                      <TableCell>Top reason</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.signals.map((row) => (
                      <TableRow key={row.signal}>
                        <TableCell>{signalLabel(row.signal)}</TableCell>
                        <TableCell align="right">{row.decided}</TableCell>
                        <TableCell align="right">{row.dismissed}</TableCell>
                        <TableCell>
                          <Box sx={rateCellSx}>
                            <Box sx={barTrackSx} aria-hidden="true">
                              <Box sx={barFillSx(ratePercent(row.decided, row.dismissed))} />
                            </Box>
                            <span>{rateText(row.decided, row.dismissed)}</span>
                          </Box>
                        </TableCell>
                        <TableCell>{topReasonLabel(row.topReason)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}

            {data.reasons.length > 0 && (
              <>
                <Typography sx={blockHeadingSx}>Why suggestions get dismissed</Typography>
                <Typography sx={captionSx}>
                  The &ldquo;No reason given&rdquo; bucket also holds links that were un-linked
                  after being accepted: confirming then dismissing a pair necessarily writes a
                  NULL reason, and no column records the prior status — so that bucket is not
                  pure suggester feedback.
                </Typography>
                {groupReasons(data.reasons).map((group) => (
                  <Box key={`${group.relationType} · ${group.source}`}>
                    <Typography sx={groupHeaderSx}>
                      {group.relationType} · {group.source} — {group.dismissed} of{" "}
                      {group.decided} dismissed ({rateText(group.decided, group.dismissed)})
                    </Typography>
                    <Table size="small" sx={tableSx}>
                      <TableBody>
                        {group.rows.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell>{row.label}</TableCell>
                            <TableCell align="right">{row.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                ))}
              </>
            )}

            {data.notes.length > 0 && (
              <>
                <Typography sx={blockHeadingSx}>Recent notes</Typography>
                <Box>
                  {data.notes.map((note) => (
                    <Box key={note.id} sx={noteItemSx}>
                      <Typography sx={noteMetaSx}>
                        {[note.sourceName, note.relationType, reasonLabel(note.dismissReason)]
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
