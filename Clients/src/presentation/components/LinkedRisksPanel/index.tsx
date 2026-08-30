import { useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import {
  useRecomputeRiskLinks,
  useRiskLinks,
  useSuggestRiskHierarchy,
  useUpdateRiskLinkStatus,
} from "../../../application/hooks/useRiskLinks";
import { useIsAdmin } from "../../../application/hooks/useIsAdmin";
import {
  DismissReason,
  ENTITY_TYPE_LABELS,
  RiskLink,
  RiskLinkStatus,
} from "../../../domain/interfaces/i.riskLink";
import LinkRiskForm from "./LinkRiskForm";
import DismissReasonForm, { DISMISS_REASON_LABELS } from "./DismissReasonForm";

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

/**
 * Mirrors ALLOWED_TRANSITIONS in Servers/controllers/riskLinks.ctrl.ts rather
 * than re-deriving it. The dismissed/user row is not a simplification: Restore
 * sets `suggested`, but the recompute prune also requires source = 'derived', so
 * restoring a human link achieves nothing and misdescribes it.
 */
const actionsFor = (link: RiskLink): { label: string; next: RiskLinkStatus }[] => {
  if (link.status === "suggested") {
    return [
      { label: "Confirm", next: "confirmed" },
      { label: "Dismiss", next: "dismissed" },
    ];
  }
  if (link.status === "confirmed") {
    return [{ label: "Dismiss", next: "dismissed" }];
  }
  return link.source === "derived"
    ? [
        { label: "Restore", next: "suggested" },
        { label: "Confirm", next: "confirmed" },
      ]
    : [{ label: "Confirm", next: "confirmed" }];
};

const reasonLabel = (reason: RiskLink["reasons"][number]) =>
  reason.detail ? `${reason.signal}: ${reason.detail}` : reason.signal;

export default function LinkedRisksPanel({ riskId }: LinkedRisksPanelProps) {
  const [showDismissed, setShowDismissed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<RiskLink | null>(null);
  const isAdmin = useIsAdmin();

  const { data: links = [], isLoading, isError, refetch } = useRiskLinks(
    riskId,
    showDismissed ? "dismissed" : undefined,
  );
  const updateStatus = useUpdateRiskLinkStatus(riskId);
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

  const handleScan = () => {
    setNotice(null);
    recompute.mutate(undefined, {
      onSuccess: (result) =>
        setNotice(`Scanning ${result.enqueued} risks. Links will appear as the scan completes.`),
      onError: (error: any) => setNotice(error?.message || "Failed to start the scan"),
    });
  };

  const handleSuggestHierarchy = () => {
    setNotice(null);
    suggestHierarchy.mutate(undefined, {
      onSuccess: (result) =>
        setNotice(
          result.enqueued === 0
            ? "No clusters of related risks to group yet. Run a scan for related risks first."
            : `Grouping ${result.enqueued} clusters of related risks. Suggestions appear here as they finish.` +
              (result.skipped > 0
                ? ` ${result.skipped} clusters were too large to group in one pass.`
                : ""),
        ),
      onError: (error: any) =>
        setNotice(error?.message || "Failed to start the hierarchy suggestions"),
    });
  };

  if (isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button size="small" onClick={() => void refetch()}>
            Retry
          </Button>
        }
      >
        Failed to load linked risks.
      </Alert>
    );
  }

  return (
    <Stack spacing={2} sx={{ py: 2 }}>
      <Stack direction="row" justifyContent="space-between">
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={() => setShowForm((open) => !open)}>
            {showForm ? "Cancel" : "Link a risk"}
          </Button>
          {/*
            Here rather than in the empty state below: a hierarchy pass groups
            risks that are ALREADY related, so a button that only appeared when
            there were no links would be unreachable exactly when it is useful.
          */}
          {isAdmin && (
            <Button
              size="small"
              onClick={handleSuggestHierarchy}
              disabled={suggestHierarchy.isPending}
            >
              Suggest hierarchy
            </Button>
          )}
        </Stack>
        <Button size="small" onClick={() => setShowDismissed((shown) => !shown)}>
          {showDismissed ? "Hide dismissed" : "Show dismissed"}
        </Button>
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
        <Stack spacing={1} alignItems="flex-start">
          <Typography variant="body2">No linked risks yet.</Typography>
          {isAdmin ? (
            <Button size="small" onClick={handleScan} disabled={recompute.isPending}>
              Scan for related risks
            </Button>
          ) : (
            <Typography variant="caption">
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
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {title}
            </Typography>
            <Stack spacing={1}>
              {group.map((link) => (
                <Box key={link.id}>
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Typography variant="body2" sx={{ flexGrow: 1 }}>
                      {link.relatedRisk.name ?? `Risk ${link.relatedRisk.id}`}
                    </Typography>
                    {ENTITY_TYPE_LABELS[link.relatedRisk.entityType] && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={ENTITY_TYPE_LABELS[link.relatedRisk.entityType]}
                      />
                    )}
                    {link.relatedRisk.riskLevel && (
                      <Chip size="small" label={link.relatedRisk.riskLevel} />
                    )}
                    {link.reasons.map((reason, index) => (
                      <Chip key={index} size="small" variant="outlined" label={reasonLabel(reason)} />
                    ))}
                    {/*
                      Only in the dismissed view, since it is null everywhere
                      else. The note rides along as the tooltip rather than
                      stretching the row.
                    */}
                    {link.dismissReason && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={DISMISS_REASON_LABELS[link.dismissReason]}
                        title={link.dismissNote ?? undefined}
                      />
                    )}
                    {/*
                      score is 0 by column default on a user link and on an agent
                      link, and means nothing on either. Only the scoring engine
                      produces a number worth showing.
                    */}
                    {link.source === "derived" && (
                      <Typography variant="caption">{link.score}</Typography>
                    )}
                    {/*
                      Hidden while this row's reason form is open. Two live
                      "Dismiss" buttons for one link is ambiguous on screen and
                      ambiguous to a test — the form owns the decision until
                      it is submitted or cancelled.
                    */}
                    {dismissing?.id !== link.id &&
                      actionsFor(link).map(({ label, next }) => (
                        <Button
                          key={label}
                          size="small"
                          disabled={updateStatus.isPending}
                          onClick={() => handleAction(link, next)}
                        >
                          {label}
                        </Button>
                      ))}
                  </Stack>

                  {dismissing?.id === link.id && (
                    <DismissReasonForm
                      link={link}
                      pending={updateStatus.isPending}
                      onSubmit={(dismissal) => submitDismissal(link, dismissal)}
                      onCancel={() => setDismissing(null)}
                    />
                  )}
                </Box>
              ))}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
