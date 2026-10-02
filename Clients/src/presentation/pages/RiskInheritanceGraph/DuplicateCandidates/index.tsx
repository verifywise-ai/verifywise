/**
 * @fileoverview F7 — duplicate risk candidates.
 *
 * Read-only: the backend scores pairs of risks in the same category by the
 * overlap of their name and description words and reports the pairs above the
 * threshold. It writes nothing and merges nothing — a pair here is a prompt to
 * go and look, not a decision. The columns exist so a reader can judge that
 * prompt without leaving the page: the score, the words the two risks actually
 * share, and what else they have in common.
 *
 * Owns its own fetch and loading/error/empty state, like the sibling sections:
 * a failed graph fetch must never hide a report that renders fine.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  CircularProgress,
  Typography,
} from "@mui/material";
import { AlertCircle, ChevronDown, CopyCheck, Info } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import Alert from "../../../components/Alert";
import type { AlertProps } from "../../../types/alert.types";
import { getDuplicateCandidates } from "../../../../application/repository/riskLink.repository";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import type { DuplicateCandidate, DuplicateReport } from "../../../../domain/interfaces/i.riskLink";
import { useOwnerName } from "../useOwnerName";
import ReportTable, { type ReportColumn } from "../ReportTable";
import DuplicateRowActions from "./DuplicateRowActions";
import { fill } from "../../../../i18n/fill";
import {
  sectionSx,
  summaryHeaderSx,
  summaryTitleSx,
  summaryDescriptionSx,
  captionSx,
  stateContainerSx,
  errorAlertSx,
  errorTextSx,
  rateCellSx,
  barTrackSx,
  barFillSx,
} from "../DismissalAnalytics/styles";
import {
  wrapCellSx,
  riskNameSx,
  riskMetaSx,
  metricLabelSx,
  infoAlertSx,
  alertTextSx,
} from "../reportStyles";

/**
 * A pair can share dozens of words. Past a handful the list stops being read
 * and starts being scrolled, so the rest is counted instead.
 */
const MAX_SHOWN_TERMS = 6;

export function summariseTerms(items: string[], more = "more"): string {
  if (items.length === 0) return "—";
  if (items.length <= MAX_SHOWN_TERMS) return items.join(", ");
  return `${items.slice(0, MAX_SHOWN_TERMS).join(", ")} +${items.length - MAX_SHOWN_TERMS} ${more}`;
}

/**
 * The server describes what a pair also shares as English text built from
 * values it owns: "project", "category: <category>", "lifecycle: <phase>". The
 * words around the value are translated here; the value itself is looked up in
 * the same dictionary the Risk Management page uses for categories and phases.
 */
export function translateShared(item: string, t: (key: string) => string): string {
  const labelled = /^(category|lifecycle): (.+)$/.exec(item);
  return labelled ? `${t(labelled[1])}: ${t(labelled[2])}` : t(item);
}

/** The API sends a 0–1 ratio; the column is read as a percentage. */
export function similarityPercent(similarity: number): number {
  return Math.round(similarity * 100);
}

const DuplicateCandidates: React.FC = () => {
  const [data, setData] = useState<DuplicateReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ownerName = useOwnerName();
  const { t } = useTranslation();

  // Bumped after a row action deletes a risk: the report is recomputed on the
  // server, so the pair (and any other pair that risk was in) drops out.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  const [alert, setAlert] = useState<AlertProps | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const payload = await getDuplicateCandidates();
        if (mounted) setData(payload);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to fetch duplicate candidates");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  const columns = useMemo<ReportColumn<DuplicateCandidate>[]>(
    () => [
      {
        id: "risk",
        label: "Risk",
        sortable: true,
        sortValue: (c) => c.risk_a.risk_name,
        render: (c) => (
          <>
            <Typography sx={riskNameSx}>{c.risk_a.risk_name}</Typography>
            <Typography sx={riskMetaSx}>
              #{c.risk_a.id} · {ownerName(c.risk_a.risk_owner)}
            </Typography>
          </>
        ),
      },
      {
        id: "duplicateOf",
        label: "Possible duplicate of",
        sortable: true,
        sortValue: (c) => c.risk_b.risk_name,
        render: (c) => (
          <>
            <Typography sx={riskNameSx}>{c.risk_b.risk_name}</Typography>
            <Typography sx={riskMetaSx}>
              #{c.risk_b.id} · {ownerName(c.risk_b.risk_owner)}
            </Typography>
          </>
        ),
      },
      {
        id: "similarity",
        label: "Similarity",
        sortable: true,
        sortValue: (c) => c.similarity,
        render: (c) => {
          const percent = similarityPercent(c.similarity);
          return (
            <Box sx={rateCellSx}>
              <Box sx={barTrackSx}>
                <Box sx={barFillSx(percent)} />
              </Box>
              <Typography
                sx={metricLabelSx}
                aria-label={fill(t("{percent} percent similar"), { percent })}
              >
                {percent}%
              </Typography>
            </Box>
          );
        },
      },
      {
        id: "sharedTokens",
        label: "Words in common",
        sortable: true,
        sortValue: (c) => c.shared_tokens.length,
        cellSx: wrapCellSx,
        render: (c) => summariseTerms(c.shared_tokens, t("more")),
      },
      {
        id: "alsoShares",
        label: "Also shares",
        sortable: true,
        sortValue: (c) => c.also_shares.length,
        cellSx: wrapCellSx,
        render: (c) =>
          summariseTerms(
            c.also_shares.map((item) => translateShared(item, t)),
            t("more"),
          ),
      },
      {
        id: "actions",
        label: "Actions",
        sortable: false,
        align: "center",
        render: (c) => (
          <DuplicateRowActions candidate={c} onRiskDeleted={reload} onNotify={setAlert} />
        ),
      },
    ],
    [ownerName, reload, t],
  );

  const renderBody = () => {
    // A reload after a row action keeps the current table on screen instead of
    // flashing the spinner; only the first load has nothing to show yet.
    if (loading && !data) {
      return (
        <Box sx={stateContainerSx}>
          <CircularProgress size={24} />
        </Box>
      );
    }

    if (error) {
      return (
        <Box sx={errorAlertSx} role="alert">
          <AlertCircle size={16} />
          <Typography sx={errorTextSx}>{error}</Typography>
        </Box>
      );
    }

    if (!data || data.candidates.length === 0) {
      // No pairs is the good outcome, not a missing report — but it only means
      // anything once something was actually scanned.
      return (
        <EmptyState
          icon={CopyCheck}
          message={
            !data || data.scanned === 0
              ? "No risks to scan yet."
              : fill(
                  t(
                    "No likely duplicates. {compared} pairs compared and none scored above the threshold.",
                  ),
                  { compared: data.compared.toLocaleString() },
                )
          }
          showBorder={false}
        />
      );
    }

    return (
      <>
        <Typography sx={captionSx}>
          {fill(
            t(
              "{scanned} risks scanned, {compared} pairs compared in the same category. Scores are the share of words the two risks have in common — a prompt to compare them, not a merge.",
            ),
            {
              scanned: data.scanned.toLocaleString(),
              compared: data.compared.toLocaleString(),
            },
          )}
        </Typography>

        {data.truncated ? (
          <Box sx={infoAlertSx} role="status">
            <Info size={16} />
            <Typography sx={alertTextSx}>
              This scan hit its size limit, so the list below is a sample rather than every pair in
              the organization.
            </Typography>
          </Box>
        ) : (
          data.matched > data.candidates.length && (
            <Box sx={infoAlertSx} role="status">
              <Info size={16} />
              <Typography sx={alertTextSx}>
                {fill(t("Showing the {shown} closest of {matched} matching pairs."), {
                  shown: data.candidates.length,
                  matched: data.matched.toLocaleString(),
                })}
              </Typography>
            </Box>
          )
        )}

        <ReportTable
          columns={columns}
          rows={data.candidates}
          getRowKey={(candidate) => `${candidate.risk_a.id}-${candidate.risk_b.id}`}
          storageKey="risk-inheritance-duplicates"
          defaultSortColumn="similarity"
          entityLabel="pair"
        />
      </>
    );
  };

  return (
    <Accordion defaultExpanded={false} sx={sectionSx}>
      <AccordionSummary expandIcon={<ChevronDown size={18} />}>
        <Box sx={summaryHeaderSx}>
          <Typography sx={summaryTitleSx}>Duplicate candidates</Typography>
          <Typography sx={summaryDescriptionSx}>
            Pairs of risks worded so alike that they may be the same risk entered twice.
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 8 }}>{renderBody()}</AccordionDetails>
      {alert && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={true}
          onClick={() => setAlert(null)}
        />
      )}
    </Accordion>
  );
};

export default DuplicateCandidates;
