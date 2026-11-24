import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { VWLink } from "../../../components/Link";
import { textStyles } from "../../../themes/typography";
import useTranslation from "../../../../application/hooks/useTranslation";
import { coverageLines, joinAttributions } from "../../../../application/utils/vendorResearchText";
import type {
  CoverageSource,
  RecordSourceId,
  RunCoverage,
  VendorResearchRun,
  VendorRiskFinding,
  VrdbSourceId,
} from "../../../../domain/interfaces/i.vendorResearch";
import { fill } from "../../../../i18n/fill";

const creditSx = { ...textStyles.body, color: "text.tertiary" };

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

type Translate = (key: string) => string;

/** A record's database that is a list of the vendor risk database; the other two are asked on the web. */
const isListId = (id: RecordSourceId): id is VrdbSourceId => id !== "hibp" && id !== "statuspage";

/** The lists whose records the findings cite, each once, in the order they are first cited. */
function citedLists(findings: readonly VendorRiskFinding[]): VrdbSourceId[] {
  const ids = new Set<VrdbSourceId>();
  for (const finding of findings) {
    for (const source of Array.isArray(finding.sources) ? finding.sources : []) {
      const id = source?.record?.source_id;
      if (typeof id === "string" && isListId(id)) ids.add(id);
    }
    const basis = finding.credibility_basis;
    const basisSources =
      basis && "sources" in basis && Array.isArray(basis.sources) ? basis.sources : [];
    for (const source of basisSources) {
      const id = source?.record?.source;
      if (typeof id === "string" && isListId(id)) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * The attributions of the lists the findings cite. The words are those of the coverage lines, so
 * the lists are handed to them as a coverage in which each of them offered a record: a list that
 * line does not know is left out there, as it is for a run.
 */
function findingAttributions(
  findings: readonly VendorRiskFinding[],
  t: Translate,
  lang: string,
): string[] {
  const ids = citedLists(findings);
  if (ids.length === 0) return [];
  const coverage: RunCoverage = {
    registry_version: "",
    sources: ids.map((id): CoverageSource => ({
      id,
      name: "",
      attribution: "",
      mode: "mirror",
      checked: true,
      outcome: "found",
      strong: 1,
      weak: 0,
      last_success_at: null,
      stale: false,
    })),
    lookups: [],
    cited: { official: 0, trusted_press: 0, vendor: 0, unverified: 0 },
  };
  return coverageLines(coverage, t, lang).attributions;
}

interface ResearchCreditsProps {
  /** The latest run of the vendor on screen, when one vendor is shown. */
  run: VendorResearchRun | null | undefined;
  /** The findings on screen: the lists they cite are credited whatever the run did. */
  findings?: readonly VendorRiskFinding[];
}

/**
 * What the terms of the sources ask this screen to say, as a quiet footnote under the findings:
 * the GDELT Project, with the link its terms ask for, when the run searched the news with it, and
 * each list the run asked or a finding on screen cites, in its owner's words.
 *
 * It is on screen without a click, whatever is folded away above it and whether or not a finding
 * is pending: a credit that sits behind a button is not the credit the terms ask for. A run that
 * is still going shows none of its lines yet, so nothing of it is credited until it has ended. The
 * findings on screen can come from earlier runs, though, and a later run may have failed, still be
 * going, or not have asked the list a finding cites: the records of those findings are on screen,
 * so their lists are credited from the findings themselves.
 */
export default function ResearchCredits({ run, findings = [] }: ResearchCreditsProps) {
  const { t, lang } = useTranslation();
  // The run's own lines, only once it has ended.
  const ended = run && run.status !== "queued" && run.status !== "running" ? run : null;

  const gdelt = ended?.search_engine === "gdelt";
  const attributions = [
    ...new Set([
      ...(ended?.coverage ? coverageLines(ended.coverage, t, lang).attributions : []),
      ...findingAttributions(findings, t, lang),
    ]),
  ];
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
