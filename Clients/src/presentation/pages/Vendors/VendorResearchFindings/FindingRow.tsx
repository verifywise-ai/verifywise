import { useId } from "react";
import { Box, Stack, Typography } from "@mui/material";
import Chip from "../../../components/Chip";
import { VWLink } from "../../../components/Link";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { textStyles } from "../../../themes/typography";
import useTranslation from "../../../../application/hooks/useTranslation";
import {
  categoryLabel,
  confidenceLabel,
  formatResearchDate,
} from "../../../../application/utils/vendorResearchText";
import type {
  FindingSource,
  VendorRiskFinding,
} from "../../../../domain/interfaces/i.vendorResearch";
import { controlHeightSx } from "./styles";

/** The decision being sent for a row. */
export type RowAction = "accept" | "dismiss";

interface FindingRowProps {
  finding: VendorRiskFinding;
  /** Whether the user may decide (`risks.edit`). Without it the row is read-only. */
  canDecide: boolean;
  /** The decision in flight for this row, if any. It disables both buttons of the row. */
  busy: RowAction | null;
  onAccept: (finding: VendorRiskFinding) => void;
  onDismiss: (finding: VendorRiskFinding) => void;
  /**
   * Hands the row's element to the list, and takes it back (null) when the row goes. The list
   * uses it to move keyboard focus to a row when the one before it has been decided.
   */
  rowRef?: (element: HTMLLIElement | null) => void;
}

const captionSx = { ...textStyles.caption, color: "text.accent" };
const scaleSx = { gap: "4px", alignItems: "flex-start" };

/**
 * Where a source points, when it points somewhere safe. A source URL is text from the open
 * web: only http and https become a link, so `javascript:`, `data:` and the like never do.
 * `parsed.href` is the normalized address, and the hostname is what the link says.
 */
function readLink(url: string): { href: string; host: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.hostname === "") return null;
    return { href: parsed.href, host: parsed.hostname };
  } catch {
    return null;
  }
}

function SourceItem({ source, lang }: { source: FindingSource; lang: string }) {
  const link = readLink(source.url);
  const date = formatResearchDate(source.published_at, lang);

  return (
    <Stack sx={{ gap: "4px" }}>
      <Stack direction="row" sx={{ alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {link ? (
          <Box component="span" data-vw-no-translate="true">
            <VWLink url={link.href} openInNewTab>
              {link.host}
            </VWLink>
          </Box>
        ) : (
          <Typography sx={{ ...textStyles.body, color: "text.tertiary" }}>
            Unknown source
          </Typography>
        )}
        {date !== null && (
          <Typography data-vw-no-translate="true" sx={captionSx}>
            {date}
          </Typography>
        )}
      </Stack>
      {/* The quote is the web's text through a model: plain text, never markup. */}
      {source.quote && (
        <Box
          component="blockquote"
          data-vw-no-translate="true"
          sx={{
            ...textStyles.body,
            m: 0,
            pl: "12px",
            borderLeft: "2px solid",
            borderColor: "border.dark",
            color: "text.secondary",
            overflowWrap: "anywhere",
          }}
        >
          {source.quote}
        </Box>
      )}
    </Stack>
  );
}

/** One risk candidate: what was found, how it scores, where it comes from, and the decision. */
export default function FindingRow({
  finding,
  canDecide,
  busy,
  onAccept,
  onDismiss,
  rowRef,
}: FindingRowProps) {
  const { t, lang } = useTranslation();
  const disabled = busy !== null;
  // The buttons are all named "Accept" and "Dismiss": they are described by the risk they decide on.
  const riskId = useId();

  return (
    <Box
      component="li"
      ref={rowRef}
      aria-busy={disabled}
      sx={{
        listStyle: "none",
        p: "16px",
        border: "1px solid",
        borderColor: "border.dark",
        borderRadius: "4px",
        backgroundColor: "background.main",
      }}
    >
      <Stack sx={{ gap: "12px" }}>
        <Stack direction="row" sx={{ alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <Chip
            label={categoryLabel(finding.category, t)}
            variant="default"
            uppercase={false}
            size="small"
          />
          {finding.vendor_name && (
            <Typography
              data-vw-no-translate="true"
              sx={{ ...textStyles.bodySmall, color: "text.tertiary" }}
            >
              {finding.vendor_name}
            </Typography>
          )}
        </Stack>

        {/* The finding's own words: the model wrote them from web sources, so they are data. The
            action plan is one of them, and the one that accepting copies into the register with
            the other two: it is shown here so that the person who accepts has read it. The page
            translator leaves everything in this box alone, caption included, so the caption is
            translated by hand. */}
        <Box data-vw-no-translate="true">
          <Typography
            id={riskId}
            sx={{ ...textStyles.subsectionTitle, color: "text.primary", overflowWrap: "anywhere" }}
          >
            {finding.risk_description}
          </Typography>
          <Typography
            sx={{
              ...textStyles.body,
              color: "text.secondary",
              mt: "4px",
              overflowWrap: "anywhere",
            }}
          >
            {finding.impact_description}
          </Typography>
          {finding.action_plan && (
            <Box sx={{ mt: "8px" }}>
              <Typography sx={captionSx}>{t("Action plan")}</Typography>
              <Typography
                sx={{ ...textStyles.body, color: "text.secondary", overflowWrap: "anywhere" }}
              >
                {finding.action_plan}
              </Typography>
            </Box>
          )}
        </Box>

        <Stack direction="row" sx={{ gap: "24px", flexWrap: "wrap" }}>
          <Stack sx={scaleSx}>
            <Typography sx={captionSx}>Risk level</Typography>
            <Chip label={finding.risk_level} uppercase={false} size="small" />
          </Stack>
          <Stack sx={scaleSx}>
            <Typography sx={captionSx}>Severity</Typography>
            <Chip label={finding.risk_severity} uppercase={false} size="small" />
          </Stack>
          <Stack sx={scaleSx}>
            <Typography sx={captionSx}>Likelihood</Typography>
            <Chip label={finding.likelihood} uppercase={false} size="small" />
          </Stack>
          <Stack sx={scaleSx}>
            <Typography sx={captionSx}>Confidence</Typography>
            {/* Not a risk colour: high confidence is not a high risk. */}
            <Chip
              label={confidenceLabel(finding.confidence, t)}
              variant="default"
              uppercase={false}
              size="small"
            />
          </Stack>
        </Stack>

        <Stack sx={{ gap: "8px" }}>
          <Typography sx={captionSx}>Sources</Typography>
          {(finding.sources ?? []).map((source, index) => (
            <SourceItem key={index} source={source} lang={lang} />
          ))}
        </Stack>

        {canDecide && (
          <Stack direction="row" sx={{ gap: "8px", justifyContent: "flex-end" }}>
            <CustomizableButton
              variant="outlined"
              isDisabled={disabled}
              ariaDescribedBy={riskId}
              onClick={() => onDismiss(finding)}
              sx={controlHeightSx}
            >
              Dismiss
            </CustomizableButton>
            <CustomizableButton
              variant="contained"
              loading={busy === "accept"}
              isDisabled={disabled}
              ariaDescribedBy={riskId}
              onClick={() => onAccept(finding)}
              sx={controlHeightSx}
            >
              Accept
            </CustomizableButton>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
