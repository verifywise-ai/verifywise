import { useState, type ReactNode } from "react";
import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { VWLink } from "../../../components/Link";
import CustomizableSkeleton from "../../../components/Skeletons";
import VWTooltip from "../../../components/VWTooltip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { textStyles } from "../../../themes/typography";
import { errorAlertSx, errorTextSx } from "../../RiskInheritanceGraph/DismissalAnalytics/styles";
import useTranslation from "../../../../application/hooks/useTranslation";
import {
  useStartVendorResearch,
  type useLatestVendorResearch,
} from "../../../../application/hooks/useVendorResearch";
import {
  alertForStartFailure,
  alertForStarted,
  type ResearchAlert,
} from "../../../../application/utils/vendorResearchAlerts";
import { uncheckedSentence } from "../../../../application/utils/vendorResearchPlainText";
import {
  coverageLines,
  describeCategoryLine,
  describeCategoryNote,
  describeProgress,
  describeRunError,
  formatResearchDate,
} from "../../../../application/utils/vendorResearchText";
import { fill } from "../../../../i18n/fill";
import InlineError from "./InlineError";
import { controlHeightSx } from "./styles";

const quietTextSx = { ...textStyles.bodySmall, color: "text.tertiary" };
const detailHeadingSx = { ...textStyles.caption, color: "text.accent" };

/**
 * A gap in what the run checked, on screen without a click: a reader who sees no risk must be able
 * to tell "nothing was found" from "it could not be looked up".
 */
function Gap({ children, quiet = false }: { children: ReactNode; quiet?: boolean }) {
  const Icon = quiet ? Info : AlertTriangle;
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: "flex-start",
        gap: "6px",
        color: quiet ? "text.secondary" : "status.warning.text",
      }}
    >
      <Box component="span" sx={{ display: "inline-flex", mt: "2px", flexShrink: 0 }}>
        <Icon size={14} aria-hidden="true" />
      </Box>
      <Typography sx={{ ...textStyles.bodySmall, color: "inherit", overflowWrap: "anywhere" }}>
        {children}
      </Typography>
    </Stack>
  );
}

interface RunSummaryProps {
  /**
   * The vendor's latest run. The section reads it once (`useLatestVendorResearch`) and hands it
   * here and to the credits under the findings, so that one run is followed by one timer.
   */
  latest: ReturnType<typeof useLatestVendorResearch>;
  vendorId: number;
  vendorName: string;
  /** Whether the user may start a run (`vendor.edit`). */
  canStart: boolean;
  /** The organization has no LLM key yet. */
  notConfigured: boolean;
  onNotify: (alert: ResearchAlert) => void;
}

/**
 * The latest research run of one vendor, in the summary above its findings: when it ran, what it
 * could not check, and the button that starts another. The run is a background job, so the state
 * here is whatever the last fetch said; `useLatestVendorResearch` keeps fetching while it is
 * active.
 *
 * What the run found category by category, what it checked and how many searches and pages it
 * took are behind "How it was researched": they are how the research works, not what the reader
 * has to decide. What a reader must not miss stays on screen without a click: that the run failed,
 * what it could not check, a list that was out of date, and that the public databases are off.
 * The credits the sources ask for are under the findings (`ResearchCredits`).
 *
 * Mount it with `key={vendorId}`, so that a start still in flight for one vendor does not
 * disable the button of the next, and the details of one vendor do not stay open on the next.
 */
export default function RunSummary({
  latest,
  vendorId,
  vendorName,
  canStart,
  notConfigured,
  onNotify,
}: RunSummaryProps) {
  const { t, lang } = useTranslation();
  const start = useStartVendorResearch();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const run = latest.data;
  const active = run?.status === "queued" || run?.status === "running";
  const progress = describeProgress(run?.progress, t);
  // Once polling has stopped the run may be stuck: allow another start, and the server decides.
  const researching = active && !latest.pollingStopped;
  const startDisabled = notConfigured || researching || start.isPending;

  const handleStart = async () => {
    try {
      onNotify(alertForStarted(await start.mutateAsync(vendorId), vendorName));
    } catch (error) {
      // The global error toast is off for this call: every failure is answered here.
      onNotify(alertForStartFailure(error));
    }
  };

  const researchAgain = (
    <CustomizableButton
      variant="outlined"
      isDisabled={startDisabled}
      onClick={() => void handleStart()}
      sx={controlHeightSx}
    >
      Research again
    </CustomizableButton>
  );
  const startControl = !canStart ? null : notConfigured ? (
    // A disabled button fires no pointer events, so the span carries the tooltip.
    <VWTooltip content={t("Vendor research is not set up.")}>
      <span>{researchAgain}</span>
    </VWTooltip>
  ) : (
    researchAgain
  );

  // The parts of the summary, by where the research stands. They are laid out once, below, so that
  // the row with the button keeps its place in the tree whatever the run does: a button that is
  // rebuilt as the run is read would drop a click, and the focus of someone who tabbed onto it.
  let above: ReactNode = null;
  let status: ReactNode = null;
  let details: ReactNode = null;

  if (latest.isError) {
    above = (
      <InlineError
        message="Could not load the latest research run."
        onRetry={() => void latest.refetch()}
      />
    );
  } else if (latest.isPending) {
    status = <CustomizableSkeleton variant="rounded" width="100%" height={30} />;
  } else if (!run) {
    status = (
      <Typography sx={{ ...textStyles.body, color: "text.tertiary" }}>
        No research has run for this vendor yet.
      </Typography>
    );
  } else if (active) {
    status = latest.pollingStopped ? (
      // The run may have finished while nothing was reading it (a tab in the background): the
      // button reads it again, and follows it for another window if it is still going. It only
      // reads, so everyone who sees the run gets it, not only those who may start one.
      <Stack direction="row" sx={{ alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <Typography sx={{ ...textStyles.body, color: "text.secondary" }}>
          Still running. Check back later.
        </Typography>
        <CustomizableButton
          size="small"
          variant="text"
          sx={controlHeightSx}
          onClick={() => latest.restartPolling()}
        >
          Check again
        </CustomizableButton>
      </Stack>
    ) : (
      <Stack sx={{ gap: "4px" }}>
        <Stack direction="row" sx={{ alignItems: "center", gap: "8px" }}>
          <CircularProgress size={16} />
          <Typography sx={{ ...textStyles.body, color: "text.secondary" }}>Researching…</Typography>
        </Stack>
        {/* Where the run is, as the server writes it at every step: closed words and counts. */}
        {progress.doing !== null && (
          <Typography sx={{ ...quietTextSx, ml: "24px" }}>{progress.doing}</Typography>
        )}
        {progress.covered !== null && (
          <Typography sx={{ ...textStyles.caption, color: "text.accent", ml: "24px" }}>
            {progress.covered}
          </Typography>
        )}
        {progress.counts !== null && (
          <Typography sx={{ ...textStyles.caption, color: "text.accent", ml: "24px" }}>
            {progress.counts}
          </Typography>
        )}
      </Stack>
    );
  } else {
    const entries = run.category_summary ?? [];
    const lastRun = formatResearchDate(run.finished_at ?? run.created_at, lang);
    // What a run of the vendor risk database checked; a run without it, or cached before it, has none.
    const coverage = run.coverage ? coverageLines(run.coverage, t, lang) : null;
    const unchecked = coverage === null ? null : uncheckedSentence(coverage.unchecked, t);
    // What the run did, also when it failed. A run that did nothing has no line.
    const counted = run.searches_used + run.pages_read > 0;
    // Claude's own search needs no credit, so it is named with what the run did. The GDELT Project
    // is credited under the findings. `openai` is in the list of the table for an engine that no
    // run uses yet, so it has no words either.
    const claudeSearch = run.search_engine === "anthropic";
    const checkedSomething = coverage !== null || counted || claudeSearch;
    const hasDetails = entries.length > 0 || checkedSomething;

    above = (
      <>
        {run.status === "failed" && (
          <Box sx={errorAlertSx}>
            <AlertCircle size={16} />
            <Typography sx={errorTextSx}>{describeRunError(run.error, t)}</Typography>
          </Box>
        )}
        {coverage?.off && <Gap quiet>Public databases turned off</Gap>}
        {unchecked !== null && <Gap>{unchecked}</Gap>}
        {coverage?.stale.map((line, index) => (
          <Gap key={index}>{line}</Gap>
        ))}
      </>
    );
    status = (
      <Stack direction="row" sx={{ alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        {lastRun !== null && (
          <Typography sx={quietTextSx}>
            {fill(t("Last researched: {date}"), { date: lastRun })}
          </Typography>
        )}
        {hasDetails && (
          <VWLink
            onClick={() => setDetailsOpen((open) => !open)}
            ariaExpanded={detailsOpen}
            sx={{ fontSize: 12 }}
          >
            {detailsOpen ? "Hide research details" : "How it was researched"}
          </VWLink>
        )}
      </Stack>
    );
    details = hasDetails && detailsOpen && (
      <Stack sx={{ gap: "12px", pt: "4px" }}>
        {entries.length > 0 && (
          <Stack sx={{ gap: "8px" }}>
            <Typography sx={detailHeadingSx}>What the last research found</Typography>
            <Stack component="ul" sx={{ gap: "8px", m: 0, p: 0, listStyle: "none" }}>
              {entries.map((entry, index) => {
                const note = describeCategoryNote(entry, t);
                return (
                  <Box component="li" key={`${entry.category}-${index}`}>
                    <Typography sx={{ ...textStyles.body, color: "text.primary" }}>
                      {describeCategoryLine(entry, t)}
                    </Typography>
                    {note?.kind === "fixed" && (
                      <Typography sx={quietTextSx}>{note.text}</Typography>
                    )}
                    {/* Text the model wrote: flagged as unverified, and shown as plain text. */}
                    {note?.kind === "model" && (
                      <Box>
                        <Typography sx={{ ...textStyles.caption, color: "text.accent" }}>
                          {note.label}
                        </Typography>
                        <Typography
                          data-vw-no-translate="true"
                          sx={{ ...quietTextSx, overflowWrap: "anywhere" }}
                        >
                          {note.text}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Stack>
          </Stack>
        )}
        {checkedSomething && (
          <Stack sx={{ gap: "4px" }}>
            <Typography sx={detailHeadingSx}>What it checked</Typography>
            {coverage !== null && (
              <>
                {coverage.checked !== null && (
                  <Typography sx={quietTextSx}>{coverage.checked}</Typography>
                )}
                {coverage.none !== null && (
                  <Typography sx={quietTextSx}>{coverage.none}</Typography>
                )}
                {coverage.notChecked !== null && (
                  <Typography sx={quietTextSx}>{coverage.notChecked}</Typography>
                )}
                <Typography sx={quietTextSx}>{coverage.cited}</Typography>
              </>
            )}
            {counted && (
              <Typography sx={quietTextSx}>
                {fill(t("Searches: {searches}, pages read: {pages}"), {
                  searches: run.searches_used,
                  pages: run.pages_read,
                })}
              </Typography>
            )}
            {claudeSearch && (
              <Typography sx={quietTextSx}>{t("Searched with Claude web search")}</Typography>
            )}
          </Stack>
        )}
      </Stack>
    );
  }

  return (
    <Stack sx={{ gap: "8px" }}>
      <Stack sx={{ gap: "8px" }}>{above}</Stack>
      {/* Where the research stands on the left, the button that starts another on the right. */}
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <Box sx={{ flex: "1 1 240px", minWidth: 0 }}>{status}</Box>
        {startControl}
      </Stack>
      {details}
    </Stack>
  );
}
