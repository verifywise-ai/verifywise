import { useState } from "react";
import { Alert, Box, CircularProgress, Stack, Typography } from "@mui/material";
import { Network } from "lucide-react";
import { CustomizableButton } from "../button/customizable-button";
import { EmptyState } from "../EmptyState";
import { textStyles } from "../../themes/typography";
import {
  useRecomputeVendorRiskLinks,
  useSuggestVendorRiskHierarchy,
  useUpdateVendorRiskLinkStatus,
  useVendorRiskLinks,
} from "../../../application/hooks/useRiskLinks";
import { useIsAdmin } from "../../../application/hooks/useIsAdmin";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";
import { DismissReason, RiskLink, RiskLinkStatus } from "../../../domain/interfaces/i.riskLink";
import LinkChildRiskForm from "./LinkChildRiskForm";
import RelateVendorRiskForm from "./RelateVendorRiskForm";
import LinkRow from "./LinkRow";
import { GROUPING_WINDOW_MS, SCAN_WINDOW_MS } from "./polling";
import { useWatchedLinks } from "./useWatchedLinks";

interface VendorRiskLinksPanelProps {
  vendorRiskId: number;
}

const GROUPS: { title: string; caption: string; match: (link: RiskLink) => boolean }[] = [
  {
    title: "Child risks",
    caption: "When the level of this risk changes, each child is flagged for review.",
    match: (l) => l.relationType === "inherits_from",
  },
  {
    title: "Related vendor risks",
    caption: "Vendor risks that describe the same exposure, at this vendor or another one.",
    match: (l) => l.relationType === "related_to",
  },
];

/**
 * Everything linked to one vendor risk. Two kinds of link, one group each:
 * the project risks that inherit from it (a vendor risk is only ever a parent)
 * and the vendor risks related to it. Children come from the hierarchy pass
 * or by hand; related vendor risks are scored as vendor risks are saved, or by
 * an administrator's scan, or by hand.
 */
export default function VendorRiskLinksPanel({ vendorRiskId }: VendorRiskLinksPanelProps) {
  const [showDismissed, setShowDismissed] = useState(false);
  const [form, setForm] = useState<"child" | "related" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<RiskLink | null>(null);
  const isAdmin = useIsAdmin();
  const { t } = useTranslation();

  const { links, isLoading, isError, refetch, isWatching, watchForResult } = useWatchedLinks(
    useVendorRiskLinks,
    vendorRiskId,
    showDismissed,
    setNotice,
  );
  const updateStatus = useUpdateVendorRiskLinkStatus();
  const suggestChildren = useSuggestVendorRiskHierarchy(vendorRiskId);
  const scan = useRecomputeVendorRiskLinks();

  const toggleForm = (which: "child" | "related") =>
    setForm((open) => (open === which ? null : which));

  const handleSuggestChildren = () => {
    setNotice(null);
    suggestChildren.mutate(undefined, {
      onSuccess: (result) => {
        if (result.enqueued === 0) {
          setNotice(
            "No clusters of related risks in the use cases of this vendor yet. Related risks are grouped once a scan has linked them.",
          );
          return;
        }
        setNotice(
          fill(
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
        watchForResult(
          "Still grouping. Reopen this tab to check for new suggestions.",
          GROUPING_WINDOW_MS,
        );
      },
      onError: (error: any) =>
        setNotice(error?.message || "Failed to start the hierarchy suggestions"),
    });
  };

  const handleScan = () => {
    setNotice(null);
    scan.mutate(undefined, {
      onSuccess: (result) => {
        setNotice(
          fill(
            t(
              "Scanning {count} vendor risks. Related vendor risks appear here as the scan completes.",
            ),
            { count: result.enqueued },
          ),
        );
        watchForResult("Scan finished. No related vendor risks found.", SCAN_WINDOW_MS);
      },
      onError: (error: any) => setNotice(error?.message || "Failed to start the scan"),
    });
  };

  const onMutationError = (error: any) =>
    setNotice(
      error?.status === 404
        ? "One of these risks no longer exists"
        : error?.message || "Failed to update the link",
    );

  // Same rule as the project risk panel: dismissing a suggestion asks why,
  // un-linking a confirmed link does not.
  const handleAction = (link: RiskLink, next: RiskLinkStatus) => {
    setNotice(null);
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

  // Dismissed rows are not the active list the forms exclude; see LinkedRisksPanel.
  const activeLinks = showDismissed ? [] : links;

  return (
    <Stack spacing={8} sx={{ py: 8 }}>
      <Stack direction="row" justifyContent="space-between">
        <Stack direction="row" spacing={4}>
          <CustomizableButton size="small" variant="text" onClick={() => toggleForm("child")}>
            {form === "child" ? "Cancel" : "Link a project risk"}
          </CustomizableButton>
          <CustomizableButton size="small" variant="text" onClick={() => toggleForm("related")}>
            {form === "related" ? "Cancel" : "Relate a vendor risk"}
          </CustomizableButton>
          {isAdmin && (
            <CustomizableButton
              size="small"
              variant="text"
              color="secondary"
              onClick={handleSuggestChildren}
              isDisabled={suggestChildren.isPending || isWatching}
            >
              Suggest children
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

      {form === "child" && (
        <LinkChildRiskForm
          vendorRiskId={vendorRiskId}
          existingLinks={activeLinks}
          onClose={() => setForm(null)}
        />
      )}
      {form === "related" && (
        <RelateVendorRiskForm
          vendorRiskId={vendorRiskId}
          existingLinks={activeLinks}
          onClose={() => setForm(null)}
        />
      )}

      {notice && <Alert severity="info">{notice}</Alert>}

      {isLoading && <CircularProgress size={20} />}

      {!isLoading && links.length === 0 && (
        <Stack spacing={4} alignItems="center">
          <EmptyState icon={Network} message="No linked risks yet." showBorder={false} />
          <Typography sx={{ ...textStyles.caption, color: "text.accent" }}>
            Link a project risk that this vendor risk applies to, or relate another vendor risk.
            Suggestions appear here too.
          </Typography>
          {isAdmin ? (
            <CustomizableButton
              size="small"
              variant="text"
              onClick={handleScan}
              isDisabled={scan.isPending || isWatching}
            >
              Scan for related vendor risks
            </CustomizableButton>
          ) : (
            <Typography sx={{ ...textStyles.caption, color: "text.accent" }}>
              Related vendor risks appear as vendor risks are saved, or after an administrator runs
              a scan.
            </Typography>
          )}
        </Stack>
      )}

      {GROUPS.map(({ title, caption, match }) => {
        const group = links.filter(match);
        if (group.length === 0) return null;
        return (
          <Box key={title}>
            <Typography sx={{ ...textStyles.subsectionTitle, color: "text.primary", mb: 2 }}>
              {title}
            </Typography>
            <Typography sx={{ ...textStyles.caption, color: "text.accent", mb: 4 }}>
              {caption}
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
                />
              ))}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
