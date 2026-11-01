import type { ReactNode } from "react";
import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import { AlertCircle } from "lucide-react";
import { VWLink } from "../../../components/Link";
import CustomizableSkeleton from "../../../components/Skeletons";
import VWTooltip from "../../../components/VWTooltip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { textStyles } from "../../../themes/typography";
import { errorAlertSx, errorTextSx } from "../../RiskInheritanceGraph/DismissalAnalytics/styles";
import useTranslation from "../../../../application/hooks/useTranslation";
import {
  useLatestVendorResearch,
  useStartVendorResearch,
} from "../../../../application/hooks/useVendorResearch";
import {
  alertForStartFailure,
  alertForStarted,
  type ResearchAlert,
} from "../../../../application/utils/vendorResearchAlerts";
import {
  coverageLines,
  describeCategoryLine,
  describeCategoryNote,
  describeProgress,
  describeRunError,
  formatResearchDate,
  joinAttributions,
} from "../../../../application/utils/vendorResearchText";
import type { RunSearchEngine } from "../../../../domain/interfaces/i.vendorResearch";
import { fill } from "../../../../i18n/fill";
import InlineError from "./InlineError";
import { controlHeightSx } from "./styles";

const coverageTextSx = { ...textStyles.bodySmall, color: "text.tertiary" };
const engineLineSx = { ...textStyles.caption, color: "text.accent" };

/** The GDELT Project's own site. Its terms allow the news to be used if the project is cited with a link. */
const GDELT_URL = "https://www.gdeltproject.org/";
/** The project's name, which is the same in every language: a translation of the line keeps it. */
const GDELT_NAME = "GDELT Project";

/**
 * The sentence that credits the GDELT Project, with the project's name turned into the link that
 * its terms ask for. The name is found in the translation, so the words around it can be placed as
 * the language needs. A translation that lost the name still gets the link, after the sentence: the
 * credit must not depend on a translator.
 */
function creditedSentence(sentence: string): ReactNode {
  const link = (
    // A name, not text to translate. The link takes the size and weight of the line it is in.
    <Box component="span" data-vw-no-translate="true">
      <VWLink url={GDELT_URL} openInNewTab sx={{ fontSize: "inherit", fontWeight: "inherit" }}>
        {GDELT_NAME}
      </VWLink>
    </Box>
  );
  const at = sentence.indexOf(GDELT_NAME);
  if (at === -1) {
    return (
      <>
        {sentence} {link}
      </>
    );
  }
  return (
    <>
      {sentence.slice(0, at)}
      {link}
      {sentence.slice(at + GDELT_NAME.length)}
    </>
  );
}

/**
 * Which search the run used, under the line of what it did. A run from before the engine was
 * recorded, a run that searched nothing and a run none of whose searches was answered have none
 * and say nothing: the server records an engine only when a search was answered. `openai` is in the list of
 * the table for an engine that no run uses yet, so it has no words either.
 */
function SearchEngineLine({
  engine,
  t,
}: {
  engine: RunSearchEngine | null | undefined;
  t: (key: string) => string;
}) {
  if (engine === "anthropic") {
    return <Typography sx={engineLineSx}>{t("Searched with Claude web search")}</Typography>;
  }
  if (engine === "gdelt") {
    return (
      <Typography sx={engineLineSx}>
        {creditedSentence(t("News searched with the GDELT Project (last 3 months)"))}
      </Typography>
    );
  }
  return null;
}

interface RunSummaryProps {
  vendorId: number;
  vendorName: string;
  /** Whether the user may start a run (`vendor.edit`). */
  canStart: boolean;
  /** The organization has no LLM key yet. */
  notConfigured: boolean;
  onNotify: (alert: ResearchAlert) => void;
}

/**
 * What the latest research run of one vendor found, category by category, how many searches
 * and pages it took, and the button that starts another. The run is a background job, so the
 * state here is whatever the last fetch said; `useLatestVendorResearch` keeps fetching while it
 * is active.
 *
 * Mount it with `key={vendorId}`, so that a start still in flight for one vendor does not
 * disable the button of the next.
 */
export default function RunSummary({
  vendorId,
  vendorName,
  canStart,
  notConfigured,
  onNotify,
}: RunSummaryProps) {
  const { t, lang } = useTranslation();
  const latest = useLatestVendorResearch(vendorId);
  const start = useStartVendorResearch();

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

  const renderBody = () => {
    if (latest.isError) {
      return (
        <InlineError
          message="Could not load the latest research run."
          onRetry={() => void latest.refetch()}
        />
      );
    }
    if (latest.isPending) {
      return <CustomizableSkeleton variant="rounded" width="100%" height={40} />;
    }
    if (!run) {
      return (
        <Typography sx={{ ...textStyles.body, color: "text.tertiary" }}>
          No research has run for this vendor yet.
        </Typography>
      );
    }
    if (active) {
      return latest.pollingStopped ? (
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
            <Typography sx={{ ...textStyles.body, color: "text.secondary" }}>
              Researching…
            </Typography>
          </Stack>
          {/* Where the run is, as the server writes it at every step: closed words and counts. */}
          {progress.doing !== null && (
            <Typography sx={{ ...textStyles.bodySmall, color: "text.tertiary", ml: "24px" }}>
              {progress.doing}
            </Typography>
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
    }

    const entries = run.category_summary ?? [];
    const lastRun = formatResearchDate(run.finished_at ?? run.created_at, lang);
    // What a run of the vendor risk database checked; a run without it, or cached before it, has none.
    const coverage = run.coverage ? coverageLines(run.coverage, t, lang) : null;
    return (
      <Stack sx={{ gap: "8px" }}>
        {run.status === "failed" && (
          <Box sx={errorAlertSx}>
            <AlertCircle size={16} />
            <Typography sx={errorTextSx}>{describeRunError(run.error, t)}</Typography>
          </Box>
        )}
        {entries.length > 0 && (
          <Stack component="ul" sx={{ gap: "8px", m: 0, p: 0, listStyle: "none" }}>
            {entries.map((entry, index) => {
              const note = describeCategoryNote(entry, t);
              return (
                <Box component="li" key={`${entry.category}-${index}`}>
                  <Typography sx={{ ...textStyles.body, fontWeight: 500, color: "text.primary" }}>
                    {describeCategoryLine(entry, t)}
                  </Typography>
                  {note?.kind === "fixed" && (
                    <Typography sx={{ ...textStyles.bodySmall, color: "text.tertiary" }}>
                      {note.text}
                    </Typography>
                  )}
                  {/* Text the model wrote: flagged as unverified, and shown as plain text. */}
                  {note?.kind === "model" && (
                    <Box>
                      <Typography sx={{ ...textStyles.caption, color: "text.accent" }}>
                        {note.label}
                      </Typography>
                      <Typography
                        data-vw-no-translate="true"
                        sx={{
                          ...textStyles.bodySmall,
                          color: "text.tertiary",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {note.text}
                      </Typography>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}
        {coverage !== null && (
          <Stack sx={{ gap: "4px" }}>
            {coverage.off && (
              <Typography sx={coverageTextSx}>Public databases turned off</Typography>
            )}
            {coverage.checked !== null && (
              <Typography sx={coverageTextSx}>{coverage.checked}</Typography>
            )}
            {coverage.notChecked !== null && (
              <Typography sx={coverageTextSx}>{coverage.notChecked}</Typography>
            )}
            {coverage.none !== null && <Typography sx={coverageTextSx}>{coverage.none}</Typography>}
            {coverage.stale.map((line, index) => (
              <Typography key={index} sx={{ ...textStyles.bodySmall, color: "text.secondary" }}>
                {line}
              </Typography>
            ))}
            <Typography sx={coverageTextSx}>{coverage.cited}</Typography>
            {/* The lists' own words, as their terms ask: the label is ours, the credits are not. */}
            {coverage.attributions.length > 0 && (
              <Typography
                data-vw-no-translate="true"
                sx={{ ...textStyles.caption, color: "text.accent", overflowWrap: "anywhere" }}
              >
                {fill(t("Data sources: {attributions}"), {
                  attributions: joinAttributions(coverage.attributions),
                })}
              </Typography>
            )}
          </Stack>
        )}
        {/* What the run did, also when it failed. A run that did nothing has no line. */}
        {run.searches_used + run.pages_read > 0 && (
          <Typography sx={{ ...textStyles.caption, color: "text.accent" }}>
            {fill(t("Searches: {searches}, pages read: {pages}"), {
              searches: run.searches_used,
              pages: run.pages_read,
            })}
          </Typography>
        )}
        {/* Which search it was, and the credit that the GDELT Project's terms ask for. */}
        <SearchEngineLine engine={run.search_engine} t={t} />
        {lastRun !== null && (
          <Typography sx={{ ...textStyles.caption, color: "text.accent" }}>
            {fill(t("Last run: {date}"), { date: lastRun })}
          </Typography>
        )}
      </Stack>
    );
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

  return (
    <Box
      sx={{
        p: "16px",
        border: "1px solid",
        borderColor: "border.dark",
        borderRadius: "4px",
        backgroundColor: "background.accent",
      }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          mb: "12px",
        }}
      >
        <Typography sx={{ ...textStyles.subsectionTitle, color: "text.primary" }}>
          Latest research
        </Typography>
        {canStart &&
          (notConfigured ? (
            // A disabled button fires no pointer events, so the span carries the tooltip.
            <VWTooltip content={t("Vendor research is not set up.")}>
              <span>{researchAgain}</span>
            </VWTooltip>
          ) : (
            researchAgain
          ))}
      </Stack>
      {renderBody()}
    </Box>
  );
}
