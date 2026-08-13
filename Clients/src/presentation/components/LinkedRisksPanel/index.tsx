import { useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import {
  useRecomputeRiskLinks,
  useRiskLinks,
  useUpdateRiskLinkStatus,
} from "../../../application/hooks/useRiskLinks";
import { useIsAdmin } from "../../../application/hooks/useIsAdmin";
import { RiskLink, RiskLinkStatus } from "../../../domain/interfaces/i.riskLink";
import LinkRiskForm from "./LinkRiskForm";

interface LinkedRisksPanelProps {
  riskId: number;
}

const GROUPS: { title: string; match: (link: RiskLink) => boolean }[] = [
  {
    title: "Inherits from",
    match: (l) => l.relationType === "inherits_from" && l.direction === "outgoing",
  },
  {
    title: "Inherited by",
    match: (l) => l.relationType === "inherits_from" && l.direction === "incoming",
  },
  { title: "Related risks", match: (l) => l.relationType === "related_to" },
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
  const isAdmin = useIsAdmin();

  const { data: links = [], isLoading, isError, refetch } = useRiskLinks(
    riskId,
    showDismissed ? "dismissed" : undefined,
  );
  const updateStatus = useUpdateRiskLinkStatus(riskId);
  const recompute = useRecomputeRiskLinks(riskId);

  const handleAction = (link: RiskLink, next: RiskLinkStatus) => {
    setNotice(null);
    updateStatus.mutate(
      { id: link.id, status: next },
      {
        onError: (error: any) =>
          setNotice(
            error?.status === 404
              ? "One of these risks no longer exists"
              : error?.message || "Failed to update the link",
          ),
      },
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
        <Button size="small" onClick={() => setShowForm((open) => !open)}>
          {showForm ? "Cancel" : "Link a risk"}
        </Button>
        <Button size="small" onClick={() => setShowDismissed((shown) => !shown)}>
          {showDismissed ? "Hide dismissed" : "Show dismissed"}
        </Button>
      </Stack>

      {showForm && (
        <LinkRiskForm riskId={riskId} existingLinks={links} onClose={() => setShowForm(false)} />
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
                <Stack
                  key={link.id}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  flexWrap="wrap"
                >
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>
                    {link.relatedRisk.name ?? `Risk ${link.relatedRisk.id}`}
                  </Typography>
                  {link.relatedRisk.riskLevel && (
                    <Chip size="small" label={link.relatedRisk.riskLevel} />
                  )}
                  {link.reasons.map((reason, index) => (
                    <Chip key={index} size="small" variant="outlined" label={reasonLabel(reason)} />
                  ))}
                  {/* score is 0 by column default on a user link and means nothing there */}
                  {link.source !== "user" && (
                    <Typography variant="caption">{link.score}</Typography>
                  )}
                  {actionsFor(link).map(({ label, next }) => (
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
              ))}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
