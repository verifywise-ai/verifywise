import { useId } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Info } from "lucide-react";
import Chip from "../../../components/Chip";
import { VWLink } from "../../../components/Link";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { background, border } from "../../../themes/palette";
import { textStyles } from "../../../themes/typography";
import useTranslation from "../../../../application/hooks/useTranslation";
import {
  categoryLabel,
  confidenceLabel,
  credibilityLabel,
  credibilityRationale,
  formatResearchDate,
  nameOnlyNote,
  recordStatusLabel,
  sourceCategoryLabel,
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
  /** Whether the user may decide (`risks.edit`). Without it the row is read-only. */
  canDecide: boolean;
  /** The decision in flight for this row, if any. It disables both buttons of the row. */
  busy: RowAction | null;
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
const scaleSx = { gap: "4px", alignItems: "flex-start" };

/**
 * A small outlined chip next to a source: its category, or the status of a record its database no
 * longer stands by. Neutral, like the credibility chip: neither is a risk colour.
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
  const link = readLink(source.url);
  const date = formatResearchDate(source.published_at, lang);
  // What the credibility rule found the source to be; a finding of another run has neither.
  const badge = sourceCategoryLabel(category, t);
  const status = recordStatusLabel(source.record?.status, t);

  return (
    <Stack sx={{ gap: "4px" }}>
      <Stack direction="row" sx={{ alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {badge !== null && <SourceTag label={badge} />}
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

/** One risk candidate: what was found, how it scores, where it comes from, and the decision. */
export default function FindingRow({
  finding,
  canDecide,
  busy,
  onPreview,
  onDismiss,
  rowRef,
}: FindingRowProps) {
  const { t, lang } = useTranslation();
  const disabled = busy !== null;
  // The buttons are all named "Preview" and "Dismiss": they are described by the risk they decide on.
  const riskId = useId();
  // A list cached before the field existed has none; an empty sentence is no sentence.
  const rationale = finding.rationale?.trim() ?? "";
  // A finding of a run of the vendor risk database shows its credibility instead of its confidence,
  // with a line worded here from the basis; one of another run, or with a label this screen does
  // not know, keeps its confidence.
  const credibility = credibilityLabel(finding.credibility, t);
  const basis = credibility === null ? null : (finding.credibility_basis ?? null);
  const credibilityWords = credibilityRationale(basis, t, lang);
  const credibilityLine = [credibilityWords.sentence, credibilityWords.stale ?? ""]
    .filter((sentence) => sentence !== "")
    .join(" ");
  const note = nameOnlyNote(basis, t);

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
            action plan is one of them, and the one that saving the risk copies into the register
            with the other two: it is shown here so that the person who adds the risk has read it.
            The page translator leaves everything in this box alone, caption included, so the
            caption is translated by hand. */}
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
          {credibility === null ? (
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
          ) : (
            <Stack sx={scaleSx}>
              <Typography sx={captionSx}>Credibility</Typography>
              {/* Not a risk colour either: it says how well the sources establish the facts. */}
              <Chip label={credibility} variant="default" uppercase={false} size="small" />
            </Stack>
          )}
        </Stack>

        {/* Why the credibility is what it is, worded from what the server's code decided: our own
            words in the screen's language, with the names of the databases and hosts of the
            sources in them. Under the row of the ratings, so that a long line does not widen the
            column of its chip. */}
        {(credibilityLine !== "" || note !== null) && (
          <Stack sx={{ gap: "4px" }}>
            {credibilityLine !== "" && (
              <Typography
                sx={{ ...textStyles.bodySmall, color: "text.secondary", overflowWrap: "anywhere" }}
              >
                {credibilityLine}
              </Typography>
            )}
            {note !== null && (
              <Stack
                direction="row"
                sx={{ alignItems: "center", gap: "6px", color: "status.info.text" }}
              >
                <Info size={14} aria-hidden="true" />
                <Typography sx={{ ...textStyles.bodySmall, color: "inherit" }}>{note}</Typography>
              </Stack>
            )}
          </Stack>
        )}

        {/* Why the likelihood and the severity are what they are: the model's sentence, so data.
            Findings stored before the sentence existed have none. The caption is translated by
            hand, like the action plan's, because the page translator leaves this box alone. */}
        {rationale !== "" && (
          <Box data-vw-no-translate="true">
            <Typography sx={captionSx}>{t("Why this rating")}</Typography>
            <Typography
              sx={{ ...textStyles.body, color: "text.secondary", overflowWrap: "anywhere" }}
            >
              {rationale}
            </Typography>
          </Box>
        )}

        <Stack sx={{ gap: "8px" }}>
          <Typography sx={captionSx}>Sources</Typography>
          {/* The search results were the only place the quotes were found: the page was read after
              the analysis and did not hold them, or could not be read. Our own text, so it is
              translated by the page translator like the captions around it. */}
          {finding.snippet_only === true && (
            <Typography sx={{ ...textStyles.body, color: "text.secondary" }}>
              Not confirmed on the page. The quotes come from search results.
            </Typography>
          )}
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
    </Box>
  );
}
