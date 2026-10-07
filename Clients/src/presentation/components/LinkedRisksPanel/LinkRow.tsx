import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { Info } from "lucide-react";
import Chip from "../Chip";
import { CustomizableButton } from "../button/customizable-button";
import { textStyles } from "../../themes/typography";
import { useTranslation } from "../../../application/hooks/useTranslation";
import {
  DismissReason,
  ENTITY_TYPE_LABELS,
  RiskLink,
  RiskLinkStatus,
} from "../../../domain/interfaces/i.riskLink";
import DismissReasonForm, { DISMISS_REASON_LABELS } from "./DismissReasonForm";
import { fill } from "../../../i18n/fill";
import { signalLabel } from "./signalLabel";

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
  // Same transition as dismissing a suggestion, but on a link someone already
  // accepted it reads as taking the link away, not rejecting an idea.
  if (link.status === "confirmed") {
    return [{ label: "Remove link", next: "dismissed" }];
  }
  return link.source === "derived"
    ? [
        { label: "Restore", next: "suggested" },
        { label: "Confirm", next: "confirmed" },
      ]
    : [{ label: "Confirm", next: "confirmed" }];
};

type Translate = (key: string) => string;

/**
 * The engine stores a reason's detail as English text, so it is translated here
 * rather than on the server (a background scan has no request language).
 * Categories and phases come from the same fixed lists the risk form offers;
 * the structural signal writes "2 EU AI Act controls, 1 ISO 42001 subclause".
 * Anything else — a control mapping, an assessment answer — is the user's own
 * text and stays as written.
 */
export function translateDetail(signal: string, detail: string, t: Translate): string {
  switch (signal) {
    case "shared_category":
      return detail.split(", ").map(t).join(", ");
    case "same_lifecycle_phase":
      return t(detail);
    case "shared_framework_element":
      return detail
        .split(", ")
        .map((part) => {
          const counted = /^(\d+) (.+)$/.exec(part);
          return counted ? `${counted[1]} ${t(counted[2])}` : part;
        })
        .join(", ");
    default:
      return detail;
  }
}

const reasonLabel = (reason: RiskLink["reasons"][number], t: Translate) =>
  reason.detail
    ? `${t(signalLabel(reason.signal))}: ${translateDetail(reason.signal, reason.detail, t)}`
    : t(signalLabel(reason.signal));

/**
 * Why the engine offered this link, as one tooltip line. Three bordered chips
 * per row buried the risk names they were describing; the same text one hover
 * away keeps the explanation without paying for it on every row.
 *
 * score is 0 by column default on a user link and on an agent link, and means
 * nothing on either — only the scoring engine produces a number worth showing.
 */
const detailsFor = (link: RiskLink, t: Translate) =>
  [
    ...(link.source === "derived" ? [fill(t("Score {score}"), { score: link.score })] : []),
    ...link.reasons.map((reason) => reasonLabel(reason, t)),
  ].join(" · ");

interface LinkRowProps {
  link: RiskLink;
  /** This row's dismiss-reason form is open. */
  dismissing: boolean;
  statusPending: boolean;
  onAction: (link: RiskLink, next: RiskLinkStatus) => void;
  onSubmitDismissal: (dismissal?: { dismissReason: DismissReason; dismissNote?: string }) => void;
  onCancelDismissal: () => void;
  /**
   * Clears a stale-inheritance warning. Only the child's own view passes it;
   * the warning is about the child, so a parent's panel never shows it.
   */
  onAcknowledge?: (link: RiskLink) => void;
  acknowledgePending?: boolean;
}

/**
 * One linked risk: name, labels, why it was linked, and the status actions.
 * Shared by the project risk panel and the vendor risk panel, which differ in
 * which links they load and how they create one, not in how a link reads.
 */
export default function LinkRow({
  link,
  dismissing,
  statusPending,
  onAction,
  onSubmitDismissal,
  onCancelDismissal,
  onAcknowledge,
  acknowledgePending = false,
}: LinkRowProps) {
  const { t } = useTranslation();
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={4} flexWrap="wrap">
        <Typography sx={{ ...textStyles.body, color: "text.secondary", flexGrow: 1 }}>
          {link.relatedRisk.name ?? fill(t("Risk {id}"), { id: link.relatedRisk.id })}
        </Typography>
        {/* A related vendor risk's vendor: which supplier carries the same exposure. */}
        {link.relatedRisk.vendorName && (
          <Chip
            size="small"
            variant="default"
            uppercase={false}
            label={link.relatedRisk.vendorName}
          />
        )}
        {ENTITY_TYPE_LABELS[link.relatedRisk.entityType] && (
          <Chip
            size="small"
            variant="default"
            uppercase={false}
            label={ENTITY_TYPE_LABELS[link.relatedRisk.entityType]}
          />
        )}
        {link.relatedRisk.riskLevel && <Chip size="small" label={link.relatedRisk.riskLevel} />}
        {/* A suggestion carries Confirm; without this an accepted link looked like one. */}
        {link.status === "confirmed" && (
          <Chip size="small" variant="success" uppercase={false} label="Confirmed" />
        )}
        {/*
          Only in the dismissed view, since it is null everywhere
          else. The note rides along as the tooltip rather than
          stretching the row.
        */}
        {link.dismissReason && (
          <Box
            component="span"
            sx={{ display: "inline-flex" }}
            title={link.dismissNote ?? undefined}
          >
            <Chip
              size="small"
              variant="default"
              uppercase={false}
              label={DISMISS_REASON_LABELS[link.dismissReason]}
            />
          </Box>
        )}
        {/*
          Only on the child's own view. The same link row appears in the parent's
          panel as an incoming link, where "parent level changed" would read as a
          statement about the child.
        */}
        {onAcknowledge && link.direction === "outgoing" && link.parentLevelChangedAt && (
          <>
            <Box
              component="span"
              sx={{ display: "inline-flex" }}
              title={new Date(link.parentLevelChangedAt).toLocaleString()}
            >
              <Chip size="small" variant="warning" label="Parent level changed" />
            </Box>
            <CustomizableButton
              size="small"
              variant="text"
              color="primary"
              isDisabled={acknowledgePending}
              onClick={() => onAcknowledge(link)}
            >
              Mark reviewed
            </CustomizableButton>
          </>
        )}
        {detailsFor(link, t) && (
          <Tooltip title={detailsFor(link, t)} arrow>
            <CustomizableButton
              iconOnly
              size="small"
              variant="text"
              color="secondary"
              ariaLabel={fill(t("Why {name} is linked"), {
                name: link.relatedRisk.name ?? fill(t("risk {id}"), { id: link.relatedRisk.id }),
              })}
            >
              <Info size={16} />
            </CustomizableButton>
          </Tooltip>
        )}
        {/*
          Hidden while this row's reason form is open. Two live
          "Dismiss" buttons for one link is ambiguous on screen and
          ambiguous to a test — the form owns the decision until
          it is submitted or cancelled.
        */}
        {!dismissing &&
          actionsFor(link).map(({ label, next }) => (
            <CustomizableButton
              key={label}
              size="small"
              variant="text"
              // Confirm is the affirmative action; Dismiss must not
              // compete with it for primary.
              color={next === "dismissed" ? "secondary" : "primary"}
              isDisabled={statusPending}
              onClick={() => onAction(link, next)}
            >
              {label}
            </CustomizableButton>
          ))}
      </Stack>

      {dismissing && (
        <DismissReasonForm
          link={link}
          pending={statusPending}
          onSubmit={onSubmitDismissal}
          onCancel={onCancelDismissal}
        />
      )}
    </Box>
  );
}
