import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import { AlertCircle } from "lucide-react";
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
  describeCategoryLine,
  describeCategoryNote,
  describeRunError,
  formatResearchDate,
} from "../../../../application/utils/vendorResearchText";
import { fill } from "../../../../i18n/fill";
import InlineError from "./InlineError";
import { controlHeightSx } from "./styles";

interface RunSummaryProps {
  vendorId: number;
  vendorName: string;
  /** Whether the user may start a run (`risks.edit`). */
  canStart: boolean;
  /** The organization has no search provider or no LLM key yet. */
  notConfigured: boolean;
  onNotify: (alert: ResearchAlert) => void;
}

/**
 * What the latest research run of one vendor found, category by category, and the button
 * that starts another. The run is a background job, so the state here is whatever the last
 * fetch said; `useLatestVendorResearch` keeps fetching while it is active.
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
        <Stack direction="row" sx={{ alignItems: "center", gap: "8px" }}>
          <CircularProgress size={16} />
          <Typography sx={{ ...textStyles.body, color: "text.secondary" }}>Researching…</Typography>
        </Stack>
      );
    }

    const entries = run.category_summary ?? [];
    const lastRun = formatResearchDate(run.finished_at ?? run.created_at, lang);
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
