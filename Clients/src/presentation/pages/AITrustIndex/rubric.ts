// Ported from the public website (website/verifywise/lib/ai-trust-index-rubric.ts),
// the source of truth for the AI Trust Index rubric. Keep labels in sync if the
// website rubric changes. AWARD_LABELS.half is "Partial" (not "Disclosed") — do
// not regress the fix made upstream.

// Human-facing labels for the 7 scoring domains and 30 indicators of rubric v1.2.
//
// These power the per-app score breakdown on the detail page. The labels are
// plain-language versions of the rubric questions (ai-safety-index/methodology/
// scoring-rubric.md), written to read clearly on the card. Domain names match the
// methodology page. Keep these in sync with the rubric if it changes.

export interface DomainMeta {
  id: string; // "D1".."D7"
  name: string;
  weight: number; // points the domain contributes to the 10-point scale
}

// Weights from rubric v1.2 (sum to 10).
export const RUBRIC_DOMAINS: DomainMeta[] = [
  { id: "D1", name: "Training-data use", weight: 2.0 },
  { id: "D2", name: "Data-subject rights", weight: 2.2 },
  { id: "D3", name: "Retention and deletion", weight: 1.5 },
  { id: "D4", name: "Third-party sharing", weight: 1.5 },
  { id: "D5", name: "Transparency", weight: 1.5 },
  { id: "D6", name: "Sensitive data and children", weight: 0.7 },
  { id: "D7", name: "Security and accountability", weight: 0.6 },
];

// Short, accurate label per indicator id. Phrased as the thing the policy is
// checked for, so a "full" reads as "the policy does this."
export const INDICATOR_LABELS: Record<string, string> = {
  "D1.1": "Keeps user inputs out of model training, or makes training opt-in",
  "D1.2": "Names a way to opt out of or into training",
  "D1.3": "Says whether training use differs by plan or tier",
  "D1.4": "Lets the user keep ownership of generated outputs",
  "D2.1": "Grants a right to access your data",
  "D2.2": "Grants a right to delete your data",
  "D2.3": "Offers data portability in a usable format",
  "D2.4": "Grants a right to correct your data",
  "D2.5": "Grants a way to object to or opt out of processing",
  "D3.1": "States a retention period for your data",
  "D3.2": "States a deletion timeline after closure or request",
  "D3.3": "Sets a shorter retention for AI conversation logs",
  "D3.4": "Commits to collecting only the data it needs",
  "D4.1": "Lists the categories of third parties it shares with",
  "D4.2": "References a sub-processor list or data processing agreement",
  "D4.3": "Does not sell or share data for advertising, or offers opt-out",
  "D4.4": "Names a safeguard for international data transfers",
  "D4.5": "States a standard for government and law-enforcement access",
  "D5.1": "Discloses that you are interacting with AI",
  "D5.2": "Marks AI-generated or synthetic output",
  "D5.3": "Enumerates the categories of data it collects",
  "D5.4": "Maps processing purposes to legal bases",
  "D5.5": "Is versioned and dated, with change notice",
  "D6.1": "Discloses automated decisions and a human-review path",
  "D6.2": "Limits the use of special-category data",
  "D6.3": "Governs biometric data specifically",
  "D6.4": "States protections for children's data",
  "D7.1": "Describes its security safeguards",
  "D7.2": "Commits to breach notification",
  "D7.3": "Names a certification or a privacy contact",
};

// Neutral topic phrases for the same 30 indicators, used by the watch-outs block.
// The labels above are affirmative ("the policy does X") and read as nonsense
// when negated ("Doesn't clearly: keeps user inputs out of training"). These are
// bare noun phrases, so a prefix like "Not stated:" or "Only partial:" reads as
// clean English. Keep keys in sync with INDICATOR_LABELS.
export const INDICATOR_GAP_LABELS: Record<string, string> = {
  "D1.1": "keeping user inputs out of model training",
  "D1.2": "a way to opt out of training",
  "D1.3": "whether training use differs by plan",
  "D1.4": "your ownership of generated outputs",
  "D2.1": "a right to access your data",
  "D2.2": "a right to delete your data",
  "D2.3": "data portability",
  "D2.4": "a right to correct your data",
  "D2.5": "a way to object to or opt out of processing",
  "D3.1": "a retention period for your data",
  "D3.2": "a deletion timeline after closure or request",
  "D3.3": "shorter retention for AI conversation logs",
  "D3.4": "a data-minimisation commitment",
  "D4.1": "the categories of third parties it shares with",
  "D4.2": "a sub-processor list or data processing agreement",
  "D4.3": "whether it sells or shares data for advertising",
  "D4.4": "a safeguard for international data transfers",
  "D4.5": "a standard for government and law-enforcement access",
  "D5.1": "disclosure that you are interacting with AI",
  "D5.2": "marking of AI-generated output",
  "D5.3": "the categories of data it collects",
  "D5.4": "a mapping of processing purposes to legal bases",
  "D5.5": "policy versioning and change notice",
  "D6.1": "automated decisions and a human-review path",
  "D6.2": "limits on special-category data",
  "D6.3": "biometric-data handling",
  "D6.4": "protections for children's data",
  "D7.1": "its security safeguards",
  "D7.2": "breach notification",
  "D7.3": "a certification or privacy contact",
};

// What an award means, for the small legend.
export const AWARD_LABELS = {
  full: "Disclosed",
  half: "Partial",
  zero: "Not disclosed",
} as const;

// subFlag meanings shown as a chip next to a zero/half indicator.
export const SUBFLAG_LABELS = {
  OK: "Disclosed",
  SILENT: "Silent",
  ADVERSE: "Adverse",
  NA: "Not applicable",
} as const;

export type Award = "full" | "half" | "zero";
export type SubFlag = "OK" | "SILENT" | "ADVERSE" | "NA";

export interface IndicatorAward {
  award: Award;
  subFlag?: SubFlag;
}

export type IndicatorMap = Record<string, IndicatorAward>;

// Roll a full indicator map up into per-domain tallies for the breakdown bars.
export function summarizeDomains(indicators: IndicatorMap) {
  return RUBRIC_DOMAINS.map((d) => {
    const ids = Object.keys(indicators).filter((k) => k.startsWith(d.id + "."));
    let earned = 0;
    let applicable = 0;
    let full = 0;
    let half = 0;
    let zero = 0;
    let na = 0;
    for (const id of ids) {
      const a = indicators[id];
      if (a.subFlag === "NA") {
        na++;
        continue;
      }
      applicable++;
      if (a.award === "full") {
        earned += 1;
        full++;
      } else if (a.award === "half") {
        earned += 0.5;
        half++;
      } else {
        zero++;
      }
    }
    // ratio of credit earned across applicable indicators in this domain (0..1)
    const ratio = applicable > 0 ? earned / applicable : null;
    return { ...d, applicable, full, half, zero, na, ratio };
  });
}
