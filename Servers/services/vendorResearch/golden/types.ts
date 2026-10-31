/**
 * The golden set of the vendor risk database (spec D6.4): 24 real vendors, one per profile, that a
 * person labels by hand, and the two research runs of each, one with the VENDOR_RESEARCH_VRDB flag
 * off and one with it on, each on a vendor row of its own: a run is compared with every earlier
 * finding and risk of its vendor row and drops what repeats them, so two runs on one row would
 * measure that, not the flag. The person's labels are a file (see
 * docs/superpowers/golden-set/labels.template.json); the runs are ordinary runs of the
 * organization, read from the database by scripts/vendorResearchGoldenSet.ts.
 */
import type {
  CredibilityLabel,
  IVendorRiskFinding,
  ResearchCategory,
  RunCoverage,
  VrdbSourceId,
} from "../../../domain.layer/interfaces/i.vendorResearch";

/**
 * A risk the labeller expects of a vendor: a finding of its category whose risk description holds
 * any of the words (case ignored) matches it, and the label is the one the labeller gives under
 * the credibility rules (spec D5).
 */
export interface GoldenExpectation {
  category: ResearchCategory;
  anyOf: string[];
  label: CredibilityLabel;
}

/**
 * A finding that must not appear: another company of the vendor's name, a delisted entry, a
 * rejected CVE, an old event. A finding that matches a trap is a false positive, whatever else it
 * matches. Without a category, the trap holds in every category.
 */
export interface GoldenTrap {
  category?: ResearchCategory;
  anyOf: string[];
}

export interface GoldenVendor {
  /** The profile of D6.4, 1 to 24. */
  profile: number;
  /** The profile in words, for the person who labels; the scorer does not read it. */
  about?: string;
  /** The vendor's two rows in the labelled organization: one researched with each flag. */
  vendorIds: { off: number; on: number };
  name: string;
  expected: GoldenExpectation[];
  traps: GoldenTrap[];
}

/** The file a person fills in. */
export interface GoldenLabels {
  /** The organization whose vendors were researched. */
  organizationId: number;
  labelledBy: string;
  /** The day the labels were written, YYYY-MM-DD: what a run older than the event can miss. */
  labelledOn: string;
  vendors: GoldenVendor[];
}

export type GoldenFinding = Pick<
  IVendorRiskFinding,
  "category" | "risk_description" | "credibility" | "confidence" | "sources"
>;

/** The first completed run of a vendor row with one prompt version, and its findings. */
export interface GoldenRun {
  vendorId: number;
  /**
   * The findings of other runs and the active risks the vendor row had when the run started: what
   * the run's deduplication compared its candidates with. Anything but 0 hides what it found.
   */
  earlier: number;
  promptVersion: string;
  findings: GoldenFinding[];
  /** What a run of the vendor risk database checked; null for any other run. */
  coverage: RunCoverage | null;
}

/** What one run, or the runs of one flag, found against the labels. */
export interface RunScore {
  findings: number;
  /** Findings that match an expected risk and no trap. */
  matched: number;
  /** Findings that match a trap. */
  traps: number;
  expected: number;
  /** Expected risks that a matched finding matches. */
  recalled: number;
}

export interface RunTotals extends RunScore {
  /** matched over findings; null when there was none. */
  precision: number | null;
  /** recalled over expected; null when nothing was expected. */
  recall: number | null;
}

export interface GoldenVendorLine {
  vendorIds: { off: number; on: number };
  name: string;
  profile: number;
  /** Null when the vendor has no run with that flag. */
  off: RunScore | null;
  on: RunScore | null;
  /** The matched findings of the run with the flag on, and those whose label is the labeller's. */
  compared: number;
  agreed: number;
}

/** A finding of a vendor, by its risk description; `vendorId` is the row of the run. */
export interface VendorFinding {
  vendorId: number;
  name: string;
  finding: string;
}

export interface VendorRef {
  vendorId: number;
  name: string;
}

export interface GoldenReport {
  /** The labelled vendors. */
  vendors: number;
  /** The runs with the flag off and on, summed over the vendors that have one. */
  off: RunTotals;
  on: RunTotals;
  /** The matched findings of the runs with the flag on, and how many have the labeller's label. */
  compared: number;
  agreed: number;
  /** agreed over compared; null when no finding was matched. */
  agreement: number | null;
  /** The same for the confidence of the runs with the flag off, for the record only. */
  baselineAgreement: number | null;
  /** Findings of the runs with the flag on labelled High that the labeller rates Low. */
  highRatedLow: VendorFinding[];
  /**
   * Findings of the runs with the flag on that cite the entry of a sanctions list matched by name
   * only and do not say "An entity named … is on …", the words the credibility prompt asks for
   * since vr-9 (spec, risk A). A match by the vendor's verified website or one of its identifiers
   * is about the vendor and is not checked.
   */
  sanctionsAsFact: VendorFinding[];
  /** Vendors whose run with the flag on has no coverage. */
  coverageMissing: VendorRef[];
  /** Vendors whose run with the flag on could not check a list: its lookup or its copy failed. */
  coverageFailed: Array<VendorRef & { sources: VrdbSourceId[] }>;
  /** Vendors without a completed run with a flag, by the row of that flag. */
  missingRuns: Array<VendorRef & { flag: "off" | "on" }>;
  /** Runs that started after findings or risks of their vendor row, which their deduplication hid. */
  afterEarlier: Array<VendorRef & { flag: "off" | "on"; earlier: number }>;
  lines: GoldenVendorLine[];
}

export interface GoldenVerdict {
  ok: boolean;
  /** One line for each bar that is missed. */
  reasons: string[];
}
