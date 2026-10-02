import { useEffect, useState } from "react";
import { Alert, Box, CircularProgress, Stack, Typography } from "@mui/material";
import { Network } from "lucide-react";
import { CustomizableButton } from "../button/customizable-button";
import { EmptyState } from "../EmptyState";
import { textStyles } from "../../themes/typography";
import {
  useAcknowledgeParentLevelChange,
  useRecomputeRiskLinks,
  useRiskLinks,
  useSuggestRiskHierarchy,
  useUpdateRiskLinkStatus,
} from "../../../application/hooks/useRiskLinks";
import { useIsAdmin } from "../../../application/hooks/useIsAdmin";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { DismissReason, RiskLink, RiskLinkStatus } from "../../../domain/interfaces/i.riskLink";
import LinkRiskForm from "./LinkRiskForm";
import LinkRow from "./LinkRow";
import {
  fingerprint,
  GROUPING_WINDOW_MS,
  PendingJob,
  POLL_INTERVAL_MS,
  SCAN_WINDOW_MS,
} from "./polling";
import { fill } from "../../../i18n/fill";

// Moved to LinkRow with the row that uses it; re-exported for existing callers.
export { translateDetail } from "./LinkRow";

interface LinkedRisksPanelProps {
  riskId: number;
}

const GROUPS: { title: string; match: (link: RiskLink) => boolean }[] = [
  {
    // Position in the grouping, not a relation — and singular, because the rule
    // permits at most one confirmed parent. See the C1 design doc.
    title: "Parent risk",
    match: (l) => l.relationType === "inherits_from" && l.direction === "outgoing",
  },
  {
    title: "Child risks",
    match: (l) => l.relationType === "inherits_from" && l.direction === "incoming",
  },
  { title: "Relates to", match: (l) => l.relationType === "related_to" },
];

export default function LinkedRisksPanel({ riskId }: LinkedRisksPanelProps) {
  const [showDismissed, setShowDismissed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<RiskLink | null>(null);
  const [pending, setPending] = useState<PendingJob | null>(null);
  const isAdmin = useIsAdmin();
  const { t } = useTranslation();

  const {
    data: links = [],
    isLoading,
    isError,
    refetch,
  } = useRiskLinks(
    riskId,
    showDismissed ? "dismissed" : undefined,
    pending ? POLL_INTERVAL_MS : false,
  );
  const updateStatus = useUpdateRiskLinkStatus(riskId);
  const acknowledge = useAcknowledgeParentLevelChange(riskId);
  const recompute = useRecomputeRiskLinks(riskId);
  const suggestHierarchy = useSuggestRiskHierarchy(riskId);

  // The worker landed: drop the notice, the links themselves are the answer.
  // Skipped while the dismissed view is open, since the fingerprint was taken
  // from the other list and any difference would be the toggle, not the job.
  useEffect(() => {
    if (!pending || showDismissed !== pending.dismissedView) return;
    if (fingerprint(links) === pending.before) return;
    setNotice(null);
    setPending(null);
  }, [pending, links, showDismissed]);

  // Or it did not, within the window we promised to watch.
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setNotice(pending.timedOut);
      setPending(null);
    }, pending.window);
    return () => clearTimeout(timer);
  }, [pending]);

  const onMutationError = (error: any) =>
    setNotice(
      error?.status === 404
        ? "One of these risks no longer exists"
        : error?.message || "Failed to update the link",
    );

  const handleAction = (link: RiskLink, next: RiskLinkStatus) => {
    setNotice(null);
    // Dismissing a SUGGESTION is feedback about the engine, so ask why first.
    // Dismissing a CONFIRMED link is a human un-linking a pair they already
    // accepted — a content edit, no reason, no form. See C3 §3.1.
    if (next === "dismissed" && link.status === "suggested") {
      setDismissing(link);
      return;
    }
    setDismissing(null);
    updateStatus.mutate({ id: link.id, status: next }, { onError: onMutationError });
  };

  const submitDismissal = (
    link: RiskLink,
    dismissal?: { dismissReason: DismissReason; dismissNote?: string },
  ) => {
    setNotice(null);
    setDismissing(null);
    updateStatus.mutate(
      { id: link.id, status: "dismissed", dismissal },
      { onError: onMutationError },
    );
  };

  /** Human confirmed the inherited level is still correct. */
  const handleAcknowledge = (link: RiskLink) => {
    setNotice(null);
    acknowledge.mutate(link.id, { onError: onMutationError });
  };

  const watchForResult = (timedOut: string, window: number) =>
    setPending({ before: fingerprint(links), dismissedView: showDismissed, timedOut, window });

  const handleScan = () => {
    setNotice(null);
    recompute.mutate(undefined, {
      onSuccess: (result) => {
        setNotice(
          fill(t("Scanning {count} risks. Links will appear as the scan completes."), {
            count: result.enqueued,
          }),
        );
        watchForResult("Scan finished. No related risks found.", SCAN_WINDOW_MS);
      },
      onError: (error: any) => setNotice(error?.message || "Failed to start the scan"),
    });
  };

  const handleSuggestHierarchy = () => {
    setNotice(null);
    suggestHierarchy.mutate(undefined, {
      onSuccess: (result) => {
        setNotice(
          result.enqueued === 0
            ? "No clusters of related risks to group yet. Run a scan for related risks first."
            : fill(
                t(
                  "Grouping {count} clusters of related risks. Suggestions appear here as they finish.",
                ),
                { count: result.enqueued },
              ) +
                (result.skipped > 0
                  ? ` ${fill(t("{count} clusters were too large to group in one pass."), {
                      count: result.skipped,
                    })}`
                  : ""),
        );
        // Nothing was queued, so there is nothing to wait for. The grouping
        // calls out to a model, so its window can close while the job is still
        // running — say that rather than claim it finished.
        if (result.enqueued > 0) {
          watchForResult(
            "Still grouping. Reopen this tab to check for new suggestions.",
            GROUPING_WINDOW_MS,
          );
        }
      },
      onError: (error: any) =>
        setNotice(error?.message || "Failed to start the hierarchy suggestions"),
    });
  };

  if (isError) {
    return (
      <Alert
        severity="error"
        action={
          <CustomizableButton size="small" variant="text" onClick={() => void refetch()}>
            Retry
          </CustomizableButton>
        }
      >
        Failed to load linked risks.
      </Alert>
    );
  }

  return (
    <Stack spacing={8} sx={{ py: 8 }}>
      <Stack direction="row" justifyContent="space-between">
        <Stack direction="row" spacing={4}>
          <CustomizableButton
            size="small"
            variant="text"
            onClick={() => setShowForm((open) => !open)}
          >
            {showForm ? "Cancel" : "Link a risk"}
          </CustomizableButton>
          {/*
            Here rather than in the empty state below: a hierarchy pass groups
            risks that are ALREADY related, so a button that only appeared when
            there were no links would be unreachable exactly when it is useful.
          */}
          {isAdmin && (
            <CustomizableButton
              size="small"
              variant="text"
              color="secondary"
              onClick={handleSuggestHierarchy}
              isDisabled={suggestHierarchy.isPending || pending !== null}
            >
              Suggest hierarchy
            </CustomizableButton>
          )}
        </Stack>
        <CustomizableButton
          size="small"
          variant="text"
          color="secondary"
          onClick={() => setShowDismissed((shown) => !shown)}
        >
          {showDismissed ? "Hide dismissed" : "Show dismissed"}
        </CustomizableButton>
      </Stack>

      {/*
        With the dismissed view open, `links` holds dismissed rows, not the
        active ones the form's exclusions are defined over. Passing them would
        invert the rule: it would hide the dismissed partners §6.4 keeps
        selectable and stop excluding the actively-linked ones. Pass nothing
        instead and let the server's 409 do the explaining.
      */}
      {showForm && (
        <LinkRiskForm
          riskId={riskId}
          existingLinks={showDismissed ? [] : links}
          onClose={() => setShowForm(false)}
        />
      )}

      {notice && <Alert severity="info">{notice}</Alert>}

      {isLoading && <CircularProgress size={20} />}

      {!isLoading && links.length === 0 && (
        <Stack spacing={4} alignItems="center">
          {/* showBorder={false}: this list lives inside a tab panel, not a table. */}
          <EmptyState icon={Network} message="No linked risks yet." showBorder={false} />
          {isAdmin ? (
            <CustomizableButton
              size="small"
              variant="text"
              onClick={handleScan}
              isDisabled={recompute.isPending || pending !== null}
            >
              Scan for related risks
            </CustomizableButton>
          ) : (
            <Typography sx={{ ...textStyles.caption, color: "text.accent" }}>
              Links appear as risks are saved, or after an administrator runs a scan.
            </Typography>
          )}
        </Stack>
      )}

      {GROUPS.map(({ title, match }) => {
        const group = links.filter(match);
        if (group.length === 0) return null;
        return (
          <Box key={title}>
            <Typography sx={{ ...textStyles.subsectionTitle, color: "text.primary", mb: 4 }}>
              {title}
            </Typography>
            <Stack spacing={4}>
              {group.map((link) => (
                <LinkRow
                  key={link.id}
                  link={link}
                  dismissing={dismissing?.id === link.id}
                  statusPending={updateStatus.isPending}
                  onAction={handleAction}
                  onSubmitDismissal={(dismissal) => submitDismissal(link, dismissal)}
                  onCancelDismissal={() => setDismissing(null)}
                  onAcknowledge={handleAcknowledge}
                  acknowledgePending={acknowledge.isPending}
                />
              ))}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
