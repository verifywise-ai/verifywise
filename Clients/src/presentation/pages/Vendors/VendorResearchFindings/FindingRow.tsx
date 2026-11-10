import { useId, useState } from "react";
import { Box, ButtonBase, Stack, Typography } from "@mui/material";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import Chip from "../../../components/Chip";
import { VWLink } from "../../../components/Link";
import { CustomizableButton } from "../../../components/button/customizable-button";
import palette, { background, border } from "../../../themes/palette";
import { textStyles } from "../../../themes/typography";
import useTranslation from "../../../../application/hooks/useTranslation";
import {
  credibilityLine,
  readSourceLink,
  recordTag,
  rowCautions,
  scalesLine,
  sourceTag,
} from "../../../../application/utils/vendorResearchPlainText";
import {
  categoryLabel,
  formatResearchDate,
} from "../../../../application/utils/vendorResearchText";
import type {
  FindingSource,
  StoredCredibilityBasis,
  VendorRiskFinding,
} from "../../../../domain/interfaces/i.vendorResearch";
import { controlHeightSx } from "./styles";

/** The decision being sent for a row: "accept" is the save of the preview form. */
export type RowAction = "accept" | "dismiss";

interface FindingRowProps {
  finding: VendorRiskFinding;
  /** Whether the user may decide (`vendor.edit`). Without it the row is read-only. */
  canDecide: boolean;
  /** The decision in flight for this row, if any. It disables both buttons of the row. */
  busy: RowAction | null;
  /**
   * Whether the row names its category. The rows of one vendor stand under the heading of their
   * category; the rows of every vendor stand under the vendor, so each says its category itself.
   */
  showCategory: boolean;
  /** Opens the finding in the vendor risk form; it is accepted only when the person saves it there. */
  onPreview: (finding: VendorRiskFinding) => void;
  onDismiss: (finding: VendorRiskFinding) => void;
  /**
   * Hands the row's element to the list, and takes it back (null) when the row goes. The list
   * uses it to move keyboard focus to a row when the one before it has been decided.
   */
  rowRef?: (element: HTMLLIElement | null) => void;
}

const captionSx = { ...textStyles.caption, color: "text.accent" };
const detailTextSx = { ...textStyles.body, color: "text.secondary", overflowWrap: "anywhere" };
/** What the second line and the details are indented by: the width of the chevron and its gap. */
const INDENT = "24px";

/** Read by a screen reader, not shown: what the asterisk of an earlier estimate stands for. */
const visuallyHiddenSx = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};

/**
 * A small outlined chip next to a source: what kind of source it is, or what became of a record
 * its database no longer stands by. Neutral: neither is a risk colour.
 */
function SourceTag({ label }: { label: string }) {
  return (
    <Chip
      label={label}
      variant="default"
      size="small"
      uppercase={false}
      backgroundColor={background.main}
      borderColor={border.dark}
    />
  );
}

/**
 * What the credibility rule found a source to be: the source's own category, or, for a finding the
 * backfill labelled (it writes the label and its basis, and the sources stay as the run stored
 * them), the category its basis holds for the same address at the same place. None for a finding
 * of another run.
 */
function categoryOf(
  source: FindingSource,
  basis: StoredCredibilityBasis | null,
  index: number,
): FindingSource["category"] {
  if (source.category !== undefined) return source.category;
  const seen =
    basis !== null && "sources" in basis && Array.isArray(basis.sources)
      ? (basis.sources[index] as unknown)
      : undefined;
  if (typeof seen !== "object" || seen === null) return undefined;
  const { url, category } = seen as { url?: unknown; category?: FindingSource["category"] };
  return url === source.url ? category : undefined;
}

function SourceItem({
  source,
  category,
  t,
  lang,
}: {
  source: FindingSource;
  category: FindingSource["category"];
  t: (key: string) => string;
  lang: string;
}) {
  const link = readSourceLink(source.url);
  const date = formatResearchDate(source.published_at, lang);
  // What the credibility rule found the source to be; a finding of another run has neither.
  const kind = sourceTag(category, t);
  const status = recordTag(source.record?.status, t);

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
        {kind !== null && <SourceTag label={kind} />}
        {status !== null && <SourceTag label={status} />}
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

/**
 * One risk candidate on one line: how severe it is, what was found, how well the sources establish
 * it, what to be careful about, and the decision. The rest (why it matters, what to do, why the
 * level is what it is, and the sources with their quotes) opens on a click of the risk.
 *
 * What is on screen before the click is what a person who does not know how the research works can
 * read: no chips of scales side by side, no name of a rule. A caution about the finding is never
 * folded away.
 */
export default function FindingRow({
  finding,
  canDecide,
  busy,
  showCategory,
  onPreview,
  onDismiss,
  rowRef,
}: FindingRowProps) {
  const { t, lang } = useTranslation();
  const [open, setOpen] = useState(false);
  const disabled = busy !== null;
  // The buttons are all named "Preview" and "Dismiss": they are described by the risk they decide on.
  const riskId = useId();
  const detailsId = useId();
  // A list cached before the field existed has none; an empty sentence is no sentence.
  const rationale = finding.rationale?.trim() ?? "";
  // How well the sources establish the finding, in one line worded from what the server's code
  // decided. An open row says the whole of it (that a label was rated again, too). A finding with
  // no label (a list cached before the field existed), or with a label this screen does not know,
  // shows no credibility: there is no other rating to show in its place.
  const credibility = credibilityLine(finding, t, lang, { full: open });
  const basis = credibility === null ? null : (finding.credibility_basis ?? null);
  const cautions = rowCautions(finding, t);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <Box
      component="li"
      ref={rowRef}
      aria-busy={disabled}
      sx={{
        listStyle: "none",
        p: "12px 16px",
        border: "1px solid",
        borderColor: "border.dark",
        borderRadius: "4px",
        backgroundColor: "background.main",
      }}
    >
      {/* The risk is the button: the whole first line opens and closes the row. */}
      <ButtonBase
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((current) => !current)}
        disableRipple
        sx={{
          "display": "flex",
          "width": "100%",
          "alignItems": "flex-start",
          "justifyContent": "flex-start",
          "gap": "8px",
          "textAlign": "left",
          "borderRadius": "4px",
          "&:focus-visible": {
            outline: `2px solid ${palette.brand.primary}`,
            outlineOffset: "2px",
          },
        }}
      >
        <Box
          component="span"
          sx={{ display: "inline-flex", mt: "4px", flexShrink: 0, color: "text.tertiary" }}
        >
          <Chevron size={16} aria-hidden="true" />
        </Box>
        <Box component="span" sx={{ flexShrink: 0 }}>
          <Chip label={finding.risk_level} uppercase={false} size="small" />
        </Box>
        {showCategory && (
          <Box component="span" sx={{ flexShrink: 0 }}>
            <Chip
              label={categoryLabel(finding.category, t)}
              variant="default"
              uppercase={false}
              size="small"
            />
          </Box>
        )}
        {/* The finding's own words: the model wrote them from web sources, so they are data, and
            the page translator leaves them alone. Two lines until the row is opened. */}
        <Typography
          component="span"
          id={riskId}
          data-vw-no-translate="true"
          sx={{
            ...textStyles.body,
            color: "text.primary",
            overflowWrap: "anywhere",
            minWidth: 0,
            mt: "2px",
            ...(open
              ? {}
              : {
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  overflow: "hidden",
                }),
          }}
        >
          {finding.risk_description}
        </Typography>
      </ButtonBase>

      <Stack
        direction="row"
        sx={{
          pl: INDENT,
          mt: "8px",
          gap: "12px",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        {/* Our own words in the screen's language, with the names of the databases and the hosts
            of the sources in them: the page translator leaves the box alone, so its caption is
            translated by hand. */}
        <Stack data-vw-no-translate="true" sx={{ gap: "4px", flex: "1 1 320px", minWidth: 0 }}>
          {credibility !== null && (
            <Typography sx={{ ...textStyles.bodySmall, color: "text.secondary" }}>
              <Box component="span" sx={{ color: "text.accent", mr: "6px" }}>
                {t("Credibility")}
              </Box>
              <Box component="span" sx={{ overflowWrap: "anywhere" }}>
                {credibility.text}
                {credibility.earlier && (
                  <Box component="span" sx={visuallyHiddenSx}>
                    {` (${t("Earlier estimate")})`}
                  </Box>
                )}
              </Box>
            </Typography>
          )}
          {cautions.map((caution) => (
            <Stack
              key={caution}
              direction="row"
              sx={{ alignItems: "flex-start", gap: "6px", color: "status.warning.text" }}
            >
              <Box component="span" sx={{ display: "inline-flex", mt: "2px", flexShrink: 0 }}>
                <AlertTriangle size={14} aria-hidden="true" />
              </Box>
              <Typography sx={{ ...textStyles.bodySmall, color: "inherit" }}>{caution}</Typography>
            </Stack>
          ))}
        </Stack>

        {canDecide && (
          <Stack direction="row" sx={{ gap: "8px", ml: "auto" }}>
            <CustomizableButton
              variant="text"
              isDisabled={disabled}
              ariaDescribedBy={riskId}
              onClick={() => onDismiss(finding)}
              sx={controlHeightSx}
            >
              Dismiss
            </CustomizableButton>
            <CustomizableButton
              variant="outlined"
              isDisabled={disabled}
              ariaDescribedBy={riskId}
              onClick={() => onPreview(finding)}
              sx={controlHeightSx}
            >
              Preview
            </CustomizableButton>
          </Stack>
        )}
      </Stack>

      {open && (
        <Stack id={detailsId} sx={{ pl: INDENT, mt: "12px", gap: "12px" }}>
          {/* The model's texts, so data: shown as written, under captions translated by hand. The
              action plan is the one that saving the risk copies into the register with the other
              two, so the person who adds the risk can read it here first. */}
          <Box data-vw-no-translate="true">
            <Typography sx={captionSx}>{t("Why it matters to you")}</Typography>
            <Typography sx={detailTextSx}>{finding.impact_description}</Typography>
          </Box>
          {finding.action_plan && (
            <Box data-vw-no-translate="true">
              <Typography sx={captionSx}>{t("What to do")}</Typography>
              <Typography sx={detailTextSx}>{finding.action_plan}</Typography>
            </Box>
          )}
          {/* Why the level is what it is: the model's sentence when the finding has one (findings
              stored before the sentence existed have none), then the two scales the level is
              computed from, on one quiet line instead of a chip each. */}
          <Box data-vw-no-translate="true">
            <Typography sx={captionSx}>{t("Why this risk level")}</Typography>
            {rationale !== "" && <Typography sx={detailTextSx}>{rationale}</Typography>}
            <Typography sx={{ ...textStyles.bodySmall, color: "text.tertiary" }}>
              {scalesLine(finding, t)}
            </Typography>
          </Box>
          <Stack sx={{ gap: "8px" }}>
            <Typography sx={captionSx}>Sources</Typography>
            {(finding.sources ?? []).map((source, index) => (
              <SourceItem
                key={index}
                source={source}
                category={categoryOf(source, basis, index)}
                t={t}
                lang={lang}
              />
            ))}
          </Stack>
        </Stack>
      )}
    </Box>
  );
}
