import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { VWLink } from "../../../components/Link";
import { textStyles } from "../../../themes/typography";
import useTranslation from "../../../../application/hooks/useTranslation";
import { coverageLines, joinAttributions } from "../../../../application/utils/vendorResearchText";
import type { VendorResearchRun } from "../../../../domain/interfaces/i.vendorResearch";
import { fill } from "../../../../i18n/fill";

const creditSx = { ...textStyles.caption, color: "text.accent" };

/** The GDELT Project's own site. Its terms allow the news to be used if the project is cited with a link. */
const GDELT_URL = "https://www.gdeltproject.org/";
/** The project's name, which is the same in every language: a translation of the line keeps it. */
const GDELT_NAME = "GDELT Project";

/**
 * The sentence that credits the GDELT Project, with the project's name turned into the link that
 * its terms ask for. The name is found in the translation, so the words around it can be placed as
 * the language needs. A translation that lost the name still gets the link, after the sentence: the
 * credit must not depend on a translator.
 */
function creditedSentence(sentence: string): ReactNode {
  const link = (
    // A name, not text to translate. The link takes the size and weight of the line it is in.
    <Box component="span" data-vw-no-translate="true">
      <VWLink url={GDELT_URL} openInNewTab sx={{ fontSize: "inherit", fontWeight: "inherit" }}>
        {GDELT_NAME}
      </VWLink>
    </Box>
  );
  const at = sentence.indexOf(GDELT_NAME);
  if (at === -1) {
    return (
      <>
        {sentence} {link}
      </>
    );
  }
  return (
    <>
      {sentence.slice(0, at)}
      {link}
      {sentence.slice(at + GDELT_NAME.length)}
    </>
  );
}

interface ResearchCreditsProps {
  /** The latest run of the vendor on screen; nothing is credited without one. */
  run: VendorResearchRun | null | undefined;
}

/**
 * What the terms of the sources ask this screen to say, as a quiet footnote under the findings:
 * the GDELT Project, with the link its terms ask for, when the run searched the news with it, and
 * each list the run asked, in its owner's words.
 *
 * It is on screen without a click, whatever is folded away above it and whether or not a finding
 * is pending: a credit that sits behind a button is not the credit the terms ask for. A run that
 * is still going shows none of its lines yet, so nothing is credited until it has ended.
 */
export default function ResearchCredits({ run }: ResearchCreditsProps) {
  const { t, lang } = useTranslation();
  if (!run || run.status === "queued" || run.status === "running") return null;

  const gdelt = run.search_engine === "gdelt";
  const attributions = run.coverage ? coverageLines(run.coverage, t, lang).attributions : [];
  if (!gdelt && attributions.length === 0) return null;

  return (
    <Stack sx={{ gap: "4px" }}>
      {gdelt && (
        <Typography sx={creditSx}>
          {creditedSentence(t("News searched with the GDELT Project (last 3 months)"))}
        </Typography>
      )}
      {/* The lists' own words, as their terms ask: the label is ours, the credits are not. */}
      {attributions.length > 0 && (
        <Typography data-vw-no-translate="true" sx={{ ...creditSx, overflowWrap: "anywhere" }}>
          {fill(t("Data sources: {attributions}"), {
            attributions: joinAttributions(attributions),
          })}
        </Typography>
      )}
    </Stack>
  );
}
