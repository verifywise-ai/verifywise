/**
 * Shallowness gate primitive (design §6).
 *
 * Character trigrams, not word sets: the observed failure re-cased and
 * re-worded ("comprises" -> "consists of") while leaving 791 contiguous
 * characters identical. Character n-grams survive that edit; a word-overlap
 * measure cannot separate it from a genuine analysis that cites the same nouns.
 *
 * Pure. No LLM, no database, no dependencies.
 */

/** Calibration knob. Run 2's failure measured 86.8% character overlap, so 0.5
 *  catches it with margin. Expect to retune against real corpora. */
export const NOVELTY_THRESHOLD = 0.5;

/** Case-folded and whitespace-collapsed — the observed failure re-cased the
 *  first word and reflowed the paragraph, and neither is a real edit. */
function trigrams(s: string): Set<string> {
  const t = s.toLowerCase().replace(/\s+/g, " ").trim();
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

/**
 * |A ∩ B| / |A ∪ B| over character trigrams. 1 for identical strings, 0 for
 * disjoint ones, 0 when either side is shorter than a single trigram.
 */
export function trigramJaccard(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return shared / (A.size + B.size - shared);
}

/**
 * True when `output` reads as a restatement of `input` rather than an analysis
 * of it.
 *
 * Scored block by block (blank-line separated), never against the whole input
 * at once. Distinct trigrams saturate, so the union grows with the prompt while
 * the intersection does not. Measured on the fixtures in novelty.test.ts, the
 * same 870-character copy of one 829-character block scores 0.847 against that
 * block, 0.793 once a header is prepended, 0.648 with one more section and
 * 0.455 against the whole 2,144-character prompt — monotonically decreasing,
 * and already under the threshold at the smallest realistic prompt size.
 * Whole-prompt Jaccard therefore cannot detect the one failure this gate exists
 * for; the test named "still catches the restatement when its source is one
 * block of a long prompt" asserts exactly that.
 *
 * But blank-line blocks alone are not enough, because a section summary is
 * ITSELF multi-paragraph prose. Splitting one summary into its own paragraphs
 * shrinks every candidate block, so a copy of the WHOLE summary is measured
 * against a quarter of itself and the score falls with the paragraph count:
 * measured on a real stored summary (report_run_analyses id=28, 2,039 chars) a
 * 100% verbatim copy scores 1.000 at one paragraph, 0.678 at two, 0.535 at
 * three and 0.460 at four — a perfect copy evading the detector at exactly the
 * shape a real summary has, i.e. the detector getting LESS sensitive the more
 * of the input was copied.
 *
 * So the whole LABELLED ENTRY is scored too, and the higher of the two wins.
 * That is the boundary the prompt builders actually use: registry.ts's
 * renderSummaries and prompts.ts's renderSections both emit `[Label]\nbody`
 * entries and `.join("\n\n")`, so one section summary is one entry however
 * many paragraphs its body runs to. Adding candidates can only raise the
 * maximum, so this is strictly more sensitive than blank lines alone and no
 * previously-passing analysis starts failing.
 *
 * ponytail: most sensitive where the input block is prose — which is where the
 * observed failure was (the Stage 2 summary consumers). Against a block that is
 * pretty-printed JSON, a narrative rarely scores near the threshold, so for the
 * three raw-section analyzers this gate is a backstop rather than a live check.
 */
export function isRestatement(
  output: string,
  input: string,
  threshold: number = NOVELTY_THRESHOLD,
): boolean {
  if (!output.trim() || !input.trim()) return false;
  return candidateBlocks(input).some((block) => trigramJaccard(output, block) >= threshold);
}

/**
 * Every paragraph, plus every whole `[Label]\n…` entry. The lookahead keeps
 * the label attached to the body it introduces; a prompt with no labelled
 * entries just yields its paragraphs twice, which costs a few trigram sets and
 * changes no verdict.
 */
function candidateBlocks(input: string): string[] {
  return [...input.split(/\n{2,}/), ...input.split(/\n{2,}(?=\[[^\]\n]+\]\n)/)];
}
