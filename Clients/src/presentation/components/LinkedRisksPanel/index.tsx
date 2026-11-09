import { useState } from "react";
import { Alert, Box, CircularProgress, Stack, Typography } from "@mui/material";
import { Network } from "lucide-react";
import { CustomizableButton } from "../button/customizable-button";
import { EmptyState } from "../EmptyState";
import VWTooltip from "../VWTooltip";
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
import { GROUPING_WINDOW_MS, SCAN_WINDOW_MS } from "./polling";
import { useWatchedLinks } from "./useWatchedLinks";
import { useFormFocus } from "./useFormFocus";
import { groupingNotice } from "./groupingNotice";
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
  { title: "Related risks", match: (l) => l.relationType === "related_to" },
];

export default function LinkedRisksPanel({ riskId }: LinkedRisksPanelProps) {
  const [showDismissed, setShowDismissed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<RiskLink | null>(null);
  const isAdmin = useIsAdmin();
  const { t } = useTranslation();
  const { formRef, openerRef } = useFormFocus(showForm ? "link" : null);

  const { links, isLoading, isError, refetch, isWatching, watchForResult } = useWatchedLinks(
    useRiskLinks,
    riskId,
    showDismissed,
    setNotice,
  );
  const updateStatus = useUpdateRiskLinkStatus(riskId);
  const acknowledge = useAcknowledgeParentLevelChange(riskId);
  const recompute = useRecomputeRiskLinks(riskId);
  const suggestHierarchy = useSuggestRiskHierarchy(riskId);

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

  const handleScan = () => {
    setNotice(null);
    recompute.mutate(undefined, {
      onSuccess: (result) => {
        setNotice(
          fill(
            t(
              result.enqueued === 1
                ? "Scanning {count} risk. Links will appear as the scan completes."
                : "Scanning {count} risks. Links will appear as the scan completes.",
            ),
            { count: result.enqueued },
          ),
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
            : groupingNotice(t, result),
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

  const suggestHierarchyDisabled = suggestHierarchy.isPending || isWatching;
  const suggestHierarchyButton = (
    <CustomizableButton
      size="small"
      variant="text"
      color="secondary"
      onClick={handleSuggestHierarchy}
      isDisabled={suggestHierarchyDisabled}
    >
      Suggest hierarchy
    </CustomizableButton>
  );

  if (isError) {
    return (
      <Alert
        severity="error"
        sx={{ fontSize: "13px" }}
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
    <Stack spacing="16px" sx={{ py: "16px" }}>
      <Typography sx={{ ...textStyles.body, color: "text.secondary" }}>
        Link this risk to others it is connected to. VerifyWise also suggests links from what risks
        have in common, such as category, controls, lifecycle phase or project. Confirm a suggestion
        to keep it, or dismiss it.
      </Typography>

      <Stack direction="row" justifyContent="space-between">
        <Stack direction="row" spacing="8px">
          {/*
            The form has its own Cancel, so this button only opens it. It stays
            in place (disabled) while the form is open: removing it would slide
            "Suggest hierarchy" under the pointer, so a double-click would start
            an AI job.
          */}
          <CustomizableButton
            ref={openerRef("link")}
            size="small"
            variant="text"
            onClick={() => setShowForm(true)}
            isDisabled={showForm}
          >
            Link a risk
          </CustomizableButton>
          {/*
            Here rather than in the empty state below: a hierarchy pass groups
            risks that are ALREADY related, so a button that only appeared when
            there were no links would be unreachable exactly when it is useful.
          */}
          {isAdmin && (
            <VWTooltip
              content="Uses AI to propose parent and child links among risks that are already related. Suggestions appear in this list for you to confirm."
              describeChild
            >
              {/* A disabled button fires no hover events, so a span carries the
                  tooltip then; otherwise the button takes it and is described. */}
              {suggestHierarchyDisabled ? (
                <Box component="span" sx={{ display: "inline-flex" }}>
                  {suggestHierarchyButton}
                </Box>
              ) : (
                suggestHierarchyButton
              )}
            </VWTooltip>
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
        <Box ref={formRef}>
          <LinkRiskForm
            riskId={riskId}
            existingLinks={showDismissed ? [] : links}
            onClose={() => setShowForm(false)}
          />
        </Box>
      )}

      {notice && (
        <Alert severity="info" sx={{ fontSize: "13px" }}>
          {notice}
        </Alert>
      )}

      {isLoading && <CircularProgress size={20} />}

      {!isLoading && links.length === 0 && (
        <Stack spacing="8px" alignItems="center">
          {/* showBorder={false}: this list lives inside a tab panel, not a table. */}
          <EmptyState icon={Network} message="No linked risks yet." showBorder={false} />
          {isAdmin ? (
            <CustomizableButton
              size="small"
              variant="text"
              onClick={handleScan}
              isDisabled={recompute.isPending || isWatching}
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
            <Typography sx={{ ...textStyles.subsectionTitle, color: "text.primary", mb: "8px" }}>
              {title}
            </Typography>
            <Stack spacing="8px">
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
