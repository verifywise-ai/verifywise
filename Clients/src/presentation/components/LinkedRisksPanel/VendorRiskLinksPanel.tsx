import { useState } from "react";
import { Alert, Box, CircularProgress, Divider, Stack, Typography } from "@mui/material";
import { Link2, Network, Plus } from "lucide-react";
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
import { useFormFocus } from "./useFormFocus";
import { groupingNotice } from "./groupingNotice";

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
  const { formRef, openerRef } = useFormFocus(form);

  const { links, isLoading, isError, refetch, isWatching, watchForResult } = useWatchedLinks(
    useVendorRiskLinks,
    vendorRiskId,
    showDismissed,
    setNotice,
  );
  const updateStatus = useUpdateVendorRiskLinkStatus();
  const suggestChildren = useSuggestVendorRiskHierarchy(vendorRiskId);
  const scan = useRecomputeVendorRiskLinks();

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
        setNotice(groupingNotice(t, result));
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
              result.enqueued === 1
                ? "Scanning {count} vendor risk. Related vendor risks appear here as the scan completes."
                : "Scanning {count} vendor risks. Related vendor risks appear here as the scan completes.",
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

  // Dismissed rows are not the active list the forms exclude; see LinkedRisksPanel.
  const activeLinks = showDismissed ? [] : links;

  return (
    <Stack spacing="16px" sx={{ py: "16px" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack direction="row" spacing="8px" alignItems="center">
          {/*
            Each form has its own Cancel, so these buttons only open a form, and
            stay in place (disabled while theirs is open) so nothing shifts
            under the pointer. Same as the project risk panel.
          */}
          <CustomizableButton
            ref={openerRef("child")}
            size="small"
            variant="text"
            startIcon={<Link2 size={16} />}
            onClick={() => setForm("child")}
            isDisabled={form === "child"}
          >
            Link a project risk
          </CustomizableButton>
          <CustomizableButton
            ref={openerRef("related")}
            size="small"
            variant="text"
            startIcon={<Plus size={16} />}
            onClick={() => setForm("related")}
            isDisabled={form === "related"}
          >
            Relate a vendor risk
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

      {form && (
        <Box ref={formRef}>
          {form === "child" ? (
            <LinkChildRiskForm
              vendorRiskId={vendorRiskId}
              existingLinks={activeLinks}
              onClose={() => setForm(null)}
            />
          ) : (
            <RelateVendorRiskForm
              vendorRiskId={vendorRiskId}
              existingLinks={activeLinks}
              onClose={() => setForm(null)}
            />
          )}
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
            <Stack direction="row" spacing="8px" alignItems="baseline">
              <Typography sx={{ ...textStyles.subsectionTitle, color: "text.primary" }}>
                {title}
              </Typography>
              <Typography sx={{ ...textStyles.bodySmall, color: "text.tertiary" }}>
                {group.length}
              </Typography>
            </Stack>
            <Typography sx={{ ...textStyles.body, color: "text.tertiary", mb: "8px" }}>
              {caption}
            </Typography>
            {/* One bordered list per group, a divider between rows, so each
                link's chips and actions read as one line. */}
            <Stack
              divider={<Divider flexItem />}
              sx={{
                "border": 1,
                "borderColor": "border.light",
                "borderRadius": "4px",
                "bgcolor": "background.main",
                "& > :not(hr)": { px: "14px", py: "10px" },
              }}
            >
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
