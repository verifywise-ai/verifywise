/**
 * The demo data loader's cast and script.
 *
 * Every line refers to something the seeder really creates
 * (Servers/infrastructure.layer/driver/autoDriver.driver.ts), so keep them in
 * step when the seeder changes. Each line and name needs a de/fr/es entry in
 * src/i18n/modules/common.ts.
 *
 * Animal art: Microsoft Fluent Emoji 3D, MIT licence
 * (src/presentation/assets/imgs/demo-committee/LICENSE).
 */
import owl from "../../assets/imgs/demo-committee/owl.png";
import beaver from "../../assets/imgs/demo-committee/beaver.png";
import raccoon from "../../assets/imgs/demo-committee/raccoon.png";
import tortoise from "../../assets/imgs/demo-committee/turtle.png";

export type CastId = "owl" | "beaver" | "raccoon" | "tortoise";

export interface CastMember {
  id: CastId;
  name: string;
  image: string;
  /** Which way this animal leans when it turns to listen. */
  leanDeg: number;
}

export const CAST: readonly CastMember[] = [
  { id: "owl", name: "Auditor owl", image: owl, leanDeg: -7 },
  { id: "beaver", name: "Builder beaver", image: beaver, leanDeg: 6 },
  { id: "raccoon", name: "Vendor raccoon", image: raccoon, leanDeg: -8 },
  { id: "tortoise", name: "Legal tortoise", image: tortoise, leanDeg: -5 },
];

export interface CommitteeLine {
  who: CastId;
  text: string;
}

export const LINES: readonly CommitteeLine[] = [
  { who: "owl", text: "Who approved this model? Asking for an auditor." },
  { who: "beaver", text: "Building the risk register. One more risk and it holds water." },
  {
    who: "raccoon",
    text: "Found a vendor called TalentAI Solutions. Going through their paperwork.",
  },
  { who: "tortoise", text: "Reading the EU AI Act. On article 3. Go on without me." },
  { who: "owl", text: "Algorithmic bias in candidate screening. Writing that one down." },
  { who: "beaver", text: "Two policies drafted. Nobody will read them. Beautiful, though." },
  { who: "raccoon", text: "Rummaging through 90 days of AI gateway traffic." },
  { who: "tortoise", text: "Still on article 3." },
  { who: "owl", text: "New task: complete the bias audit. Not it." },
  { who: "beaver", text: "Training plans ready. Attendance mandatory, snacks optional." },
  { who: "raccoon", text: "Spotted some shadow AI tools. Nobody admits to installing them." },
  { who: "tortoise", text: "Article 4. Picking up speed now." },
  { who: "owl", text: "Model inventory checked. Zero excuses." },
];

/**
 * Played on a loop once LINES has run out, so a slow run never restarts the
 * script (and the tortoise never goes back to article 3).
 */
export const FILLER_LINES: readonly CommitteeLine[] = [
  { who: "owl", text: "Double-checking the double checks." },
  { who: "beaver", text: "Stacking the last few records into place." },
  { who: "raccoon", text: "One more box of receipts back here." },
  { who: "tortoise", text: "Article 5. Nearly at the good part." },
];

/** The script followed by the filler; lineIndexAt indexes into this. */
export const ALL_LINES: readonly CommitteeLine[] = [...LINES, ...FILLER_LINES];

export const FINAL_LINE = "All approved. Unanimously, for once.";

/** Time each line stays up. */
export const STEP_MS = 3200;
/** Pause before the first line, while the cast rises into view. */
export const FIRST_LINE_DELAY_MS = 1200;
/** One pass: the cast rises and each of the four animals speaks once (about 14 s). */
export const ONE_PASS_MS = FIRST_LINE_DELAY_MS + CAST.length * STEP_MS;

/**
 * Index into ALL_LINES of the line showing after `elapsedMs`; -1 before the
 * first line. Plays LINES once, then loops FILLER_LINES.
 */
export function lineIndexAt(elapsedMs: number): number {
  if (!(elapsedMs >= FIRST_LINE_DELAY_MS)) return -1;
  const step = Math.floor((elapsedMs - FIRST_LINE_DELAY_MS) / STEP_MS);
  if (step < LINES.length) return step;
  return LINES.length + ((step - LINES.length) % FILLER_LINES.length);
}
