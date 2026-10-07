/**
 * @fileoverview F8 — control coverage gaps.
 *
 * Read-only. The backend puts every active risk in exactly one of three
 * states, and only one of them is a finding:
 *
 *   covered       — at least one link to a control
 *   gap           — no control link, but a project with a framework attached,
 *                   so there was something to map to and nobody did
 *   no_framework  — nothing to map to yet; not a finding
 *
 * The two lists are kept apart on purpose, because merging them would report
 * unstarted projects as audit failures. `assessment_link_count` is shown as
 * context and never moves a risk between lists: a risk linked only to a
 * questionnaire answer is still uncovered.
 *
 * Owns its own fetch and loading/error/empty state, like the sibling sections.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  CircularProgress,
  Typography,
} from "@mui/material";
import { AlertCircle, ChevronDown, Info, ShieldCheck } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import Chip from "../../../components/Chip";
import { getControlCoverage } from "../../../../application/repository/riskLink.repository";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import type { CoverageGapRisk, CoverageReport } from "../../../../domain/interfaces/i.riskLink";
import { useOwnerName } from "../useOwnerName";
import ReportTable, { type ReportColumn } from "../ReportTable";
import {
  sectionSx,
  summaryHeaderSx,
  summaryTitleSx,
  summaryDescriptionSx,
  blockHeadingSx,
  captionSx,
  stateContainerSx,
  errorAlertSx,
  errorTextSx,
} from "../DismissalAnalytics/styles";
import {
  wrapCellSx,
  numericCellSx,
  riskNameSx,
  riskMetaSx,
  infoAlertSx,
  successAlertSx,
  alertTextSx,
  summaryGridSx,
  summaryTileSx,
  summaryLabelSx,
  summaryValueSx,
} from "../reportStyles";

/**
 * A risk can sit in several projects at once, only some of which have a
 * framework. In the gaps list that difference is the reason the risk is a
 * finding, so it is spelled out; in the no-framework list every project lacks
 * one and repeating it on every row is noise.
 */
export function projectsText(
  projects: CoverageGapRisk["projects"],
  markFrameworks: boolean,
  noFrameworkLabel = "no framework",
): string {
  if (projects.length === 0) return "—";
  return projects
    .map((project) =>
      markFrameworks && !project.has_framework
        ? `${project.name} (${noFrameworkLabel})`
        : project.name,
    )
    .join(", ");
}

/**
 * The server lists each state worst-first; the Level column sorts by the same
 * severity order rather than alphabetically ("High" < "Low" < "Medium").
 */
const RISK_LEVEL_ORDER = [
  "No risk",
  "Very low risk",
  "Low risk",
  "Medium risk",
  "High risk",
  "Very high risk",
];

export function riskLevelRank(level: string | null): number | null {
  if (level === null) return null;
  const rank = RISK_LEVEL_ORDER.findIndex((l) => l.toLowerCase() === level.toLowerCase());
  return rank === -1 ? null : rank;
}

/** Each list is capped server-side, so the heading says what is on screen. */
export function listHeading(label: string, shown: number, total: number, of = "of"): string {
  return shown < total
    ? `${label} (${shown.toLocaleString()} ${of} ${total.toLocaleString()})`
    : `${label} (${total.toLocaleString()})`;
}

const ControlCoverage: React.FC = () => {
  const [data, setData] = useState<CoverageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ownerName = useOwnerName();
  const { t } = useTranslation();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const payload = await getControlCoverage();
        if (mounted) setData(payload);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to fetch control coverage");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const [gapColumns, noFrameworkColumns] = useMemo(() => {
    const columnsFor = (markFrameworks: boolean): ReportColumn<CoverageGapRisk>[] => [
      {
        id: "risk",
        label: "Risk",
        sortable: true,
        sortValue: (row) => row.risk_name,
        render: (row) => (
          <>
            <Typography sx={riskNameSx}>{row.risk_name}</Typography>
            <Typography sx={riskMetaSx}>
              #{row.id} · {ownerName(row.risk_owner)}
            </Typography>
          </>
        ),
      },
      {
        id: "level",
        label: "Level",
        sortable: true,
        sortValue: (row) => riskLevelRank(row.risk_level),
        render: (row) => (row.risk_level ? <Chip label={row.risk_level} size="small" /> : "—"),
      },
      {
        id: "mitigationStatus",
        label: "Mitigation status",
        sortable: true,
        sortValue: (row) => row.mitigation_status,
        render: (row) =>
          row.mitigation_status ? <Chip label={row.mitigation_status} size="small" /> : "—",
      },
      {
        id: "projects",
        label: "Projects",
        sortable: true,
        sortValue: (row) => projectsText(row.projects, markFrameworks, t("no framework")),
        cellSx: wrapCellSx,
        render: (row) => projectsText(row.projects, markFrameworks, t("no framework")),
      },
      {
        id: "assessmentLinks",
        label: "Assessment links",
        sortable: true,
        sortValue: (row) => row.assessment_link_count,
        cellSx: numericCellSx,
        render: (row) => row.assessment_link_count,
      },
    ];
    return [columnsFor(true), columnsFor(false)];
  }, [ownerName, t]);

  const renderTable = (
    rows: CoverageGapRisk[],
    columns: ReportColumn<CoverageGapRisk>[],
    storageKey: string,
  ) => (
    <ReportTable
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
      storageKey={storageKey}
      defaultSortColumn="level"
      entityLabel="risk"
    />
  );

  const renderBody = () => {
    if (loading) {
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

    if (!data || data.summary.total_active_risks === 0) {
      return (
        <EmptyState
          icon={ShieldCheck}
          message="No active risks to check for control coverage yet."
          showBorder={false}
        />
      );
    }

    const { summary, gaps, no_framework: noFramework } = data;

    return (
      <>
        <Box sx={summaryGridSx}>
          <Box sx={summaryTileSx}>
            <Typography sx={summaryLabelSx}>Active risks</Typography>
            <Typography sx={summaryValueSx}>
              {summary.total_active_risks.toLocaleString()}
            </Typography>
          </Box>
          <Box sx={summaryTileSx}>
            <Typography sx={summaryLabelSx}>Covered by a control</Typography>
            <Typography sx={summaryValueSx}>{summary.covered.toLocaleString()}</Typography>
          </Box>
          <Box sx={summaryTileSx}>
            <Typography sx={summaryLabelSx}>Coverage gaps</Typography>
            <Typography sx={summaryValueSx}>{summary.gap.toLocaleString()}</Typography>
          </Box>
          <Box sx={summaryTileSx}>
            <Typography sx={summaryLabelSx}>No framework yet</Typography>
            <Typography sx={summaryValueSx}>{summary.no_framework.toLocaleString()}</Typography>
          </Box>
        </Box>

        {data.truncated && (
          <Box sx={infoAlertSx} role="status">
            <Info size={16} />
            <Typography sx={alertTextSx}>
              More risks matched than a single report lists. The counts above are complete; the
              tables below show the worst of each list.
            </Typography>
          </Box>
        )}

        {summary.gap === 0 && summary.no_framework === 0 ? (
          <Box sx={successAlertSx} role="status">
            <ShieldCheck size={16} />
            <Typography sx={alertTextSx}>
              Every active risk is linked to at least one control.
            </Typography>
          </Box>
        ) : (
          <>
            {gaps.length > 0 && (
              <>
                <Typography sx={blockHeadingSx}>
                  {listHeading(t("Coverage gaps"), gaps.length, summary.gap, t("of"))}
                </Typography>
                <Typography sx={captionSx}>
                  These risks sit in a project that has a framework attached but are not linked to
                  any control. Assessment links are shown for context and do not count as coverage.
                </Typography>
                {renderTable(gaps, gapColumns, "risk-inheritance-coverage-gaps")}
              </>
            )}

            {noFramework.length > 0 && (
              <>
                <Typography sx={blockHeadingSx}>
                  {listHeading(
                    t("No framework yet"),
                    noFramework.length,
                    summary.no_framework,
                    t("of"),
                  )}
                </Typography>
                <Typography sx={captionSx}>
                  None of these risks' projects has a framework attached, so there are no controls
                  to map to. Not a finding — attach a framework first.
                </Typography>
                {renderTable(
                  noFramework,
                  noFrameworkColumns,
                  "risk-inheritance-coverage-no-framework",
                )}
              </>
            )}
          </>
        )}
      </>
    );
  };

  return (
    <Accordion defaultExpanded={false} sx={sectionSx}>
      <AccordionSummary expandIcon={<ChevronDown size={18} />}>
        <Box sx={summaryHeaderSx}>
          <Typography sx={summaryTitleSx}>Control coverage</Typography>
          <Typography sx={summaryDescriptionSx}>
            Which active risks are not mitigated by any control yet.
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 8 }}>{renderBody()}</AccordionDetails>
    </Accordion>
  );
};

export default ControlCoverage;
