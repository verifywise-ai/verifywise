import { NOVELTY_THRESHOLD, isRestatement, trigramJaccard } from "../novelty";

/** A section summary of the shape sectionSummaries actually produces. */
const SECTION_SUMMARY = `[Policy Manager]
The Policy Manager section comprises 14 policies, of which 9 remain in draft status and 5 have been approved. Ownership is recorded for 11 of the 14 policies; the remaining 3 carry no assigned owner at all. The most recent approval was recorded on 12 March 2026, and 6 of the approved policies list a review date that has already passed. Tagging is inconsistent: 4 policies carry no tag, while the Data Protection tag is applied to 5 separate documents that differ in scope. Two policies share the same title under different identifiers, which suggests a duplicate that was never retired. No policy in the section records an approver other than its own author, so the separation between drafting and approval is not evidenced anywhere in the supplied data. Review cadence is not stated for any of the 14 records.`;

/**
 * The observed run-2 failure, reproduced: the input block copied through with
 * one verb swapped ("comprises" -> "consists of") and one generic sentence
 * appended, so the output is slightly LONGER than its input and still says
 * nothing the input did not.
 */
const RESTATEMENT = `The Policy Manager section consists of 14 policies, of which 9 remain in draft status and 5 have been approved. Ownership is recorded for 11 of the 14 policies; the remaining 3 carry no assigned owner at all. The most recent approval was recorded on 12 March 2026, and 6 of the approved policies list a review date that has already passed. Tagging is inconsistent: 4 policies carry no tag, while the Data Protection tag is applied to 5 separate documents that differ in scope. Two policies share the same title under different identifiers, which suggests a duplicate that was never retired. No policy in the section records an approver other than its own author, so the separation between drafting and approval is not evidenced anywhere in the supplied data. Overall the organization maintains a policy set that requires continued attention from governance stakeholders.`;

/**
 * The target behaviour: same nouns, same numbers, same 12 March 2026 date —
 * but ratios, a ranking and a causal claim the input never states. The gate
 * must not punish this, or "deeper" costs a second call on every good run.
 */
const ANALYSIS = `Sixty-four percent of the policy set has never cleared approval, and the five that did are already ageing: six carry a review date behind the 12 March 2026 reference point, which means the approved population is smaller than the raw count of five suggests. Single-author approval compounds this. Every record names the drafter as its own approver, so the control that would normally catch a stale or duplicated document does not operate at all, which is the most economical explanation for the duplicated title surviving unretired. The three ownerless records are the ones to escalate first, because an unowned draft has nobody to trigger its review, and the reused Data Protection tag across five documents of differing scope means a reviewer searching by tag cannot tell which of them is authoritative.`;

/** The other sections a real prompt carries alongside the one being copied. */
const OTHER_BLOCKS = [
  `[AI Models]\nTwenty-five models are registered. Every one of them lists Priya Raman as its accountable owner, which concentrates the entire inventory on a single individual. Nine models have no documented evaluation, and the capability column is blank for the four newest entries.`,
  `[Vendors]\nEleven suppliers are on file. Four have no security questionnaire attached, and the renewal date has lapsed for two of those four. Contract value is unrecorded for six suppliers, so exposure cannot be ranked by spend.`,
  `[Training Registry]\nTwenty-two learning records exist; twenty carry the demonstration seed marker and were created within the same minute, so the register describes fixture data rather than delivered training. Completion percentages therefore mean nothing.`,
  `[Incident Management]\nThree incidents are logged over the reporting window. None has a closure date, and severity is recorded only for the oldest. Root-cause text is absent throughout, which prevents any trend statement about recurrence.`,
  `[Compliance Controls]\nOne hundred and forty controls span nine families. Access management sits lowest at 31 percent completion, while documentation reaches 88 percent. Forty-one controls have neither an owner nor a due date recorded against them.`,
].join("\n\n");

/**
 * A real stored section summary: report_run_analyses id=28, the policyManager
 * entry produced by this branch, 2,039 characters, re-flowed onto four evenly
 * sized paragraph breaks (the stored copy breaks the third paragraph one
 * sentence later; nothing else differs).
 *
 * Section summaries ARE multi-paragraph prose, which is the whole of defect 3:
 * splitting the prompt on every blank line shreds one labelled entry into four
 * small blocks, so a copy of the WHOLE entry is measured against a quarter of
 * itself each time. Measured on this text, a 100% verbatim copy scores 1.000
 * against the entry at one paragraph, 0.678 at two, 0.535 at three and 0.460
 * at four — the detector gets LESS sensitive the more of the input was copied,
 * and a perfect copy stops being detectable at exactly the paragraph count a
 * real summary has.
 */
const MULTI_PARAGRAPH_SUMMARY = `Of the 26 total policies in the AI Recruitment Screening Platform library, the ratio of draft to approved policies is 7 to 7, which reduces to a 1:1 ratio. There are exactly 7 policies in Draft status and 7 in Approved status. No policy in the dataset carries a missing review date; every one of the 26 policies has a reviewDate string populated. Conversely, no policy carries an owner field — the dataset contains no owner attribute for any policy, meaning that all 26 policies lack an assigned owner.

The work is not dominated by a single status; instead it is spread nearly evenly across four states. Draft and Approved each account for 7 policies, representing 26.9 percent of the library each. Under Review holds 6 policies, or 23.1 percent, and Published also holds 6 policies, or 23.1 percent. The library is thus balanced among the four statuses with no majority status.

The policies that need attention first are those with review dates that have already passed relative to today, 2026-07-24. Two policies are overdue: [demo-seed] Data Retention Policy #15, which has status Approved and a review date of 7/23/2026, meaning its review was due yesterday; and [demo-seed] Transparency & Disclosure Policy #20, which has status Under Review and a review date of 7/22/2026, meaning it became overdue two days ago. These two are the most immediate candidates for action because their scheduled review windows have already closed. Additionally, [demo-seed] Data Retention Policy #3 has a review date of 7/25/2026, which is tomorrow, making it the next policy that will become overdue within one day.

However, the policies that have already passed their review dates take precedence. Both overdue policies lack an owner in the dataset, compounding the urgency, as there is no responsible party explicitly assigned to complete the overdue review. Immediate steps should include assigning an owner to each of these two policies and conducting the scheduled review to bring them into compliance with the EU AI Act's governance requirements.`;

/** The prompt renderSummaries actually builds around that entry. */
const MULTI_PARAGRAPH_PROMPT = `Framework: EU AI Act\nSubject: AI Recruitment Screening Platform\n\nSection analyses:\n[Policy Manager]\n${MULTI_PARAGRAPH_SUMMARY}\n\n${OTHER_BLOCKS}`;

describe("trigramJaccard", () => {
  it("scores identical strings 1", () => {
    expect(trigramJaccard(SECTION_SUMMARY, SECTION_SUMMARY)).toBe(1);
  });

  it("scores strings with no shared trigram 0", () => {
    expect(trigramJaccard("aaaaaaaa", "bbbbbbbb")).toBe(0);
  });

  it("scores 0 when either side is shorter than one trigram", () => {
    expect(trigramJaccard("", SECTION_SUMMARY)).toBe(0);
    expect(trigramJaccard(SECTION_SUMMARY, "ok")).toBe(0);
  });

  it("ignores casing and whitespace reflow", () => {
    expect(trigramJaccard("The  POLICY\nset", "the policy set")).toBe(1);
  });
});

describe("isRestatement", () => {
  it("catches a verbatim block re-emitted inside a slightly longer paraphrase", () => {
    // Measured: 0.847.
    expect(trigramJaccard(RESTATEMENT, SECTION_SUMMARY)).toBeGreaterThan(0.8);
    expect(isRestatement(RESTATEMENT, SECTION_SUMMARY)).toBe(true);
  });

  it("passes an analysis that cites the same nouns, numbers and dates", () => {
    // Measured: 0.375 — a 0.13 margin under the threshold.
    expect(trigramJaccard(ANALYSIS, SECTION_SUMMARY)).toBeLessThan(NOVELTY_THRESHOLD);
    expect(isRestatement(ANALYSIS, SECTION_SUMMARY)).toBe(false);
  });

  it("still catches the restatement when its source is one block of a long prompt", () => {
    // Mutation guard, and the reason the comparison is per block: the union
    // grows with the prompt while the intersection does not, so the same
    // verbatim copy measures 0.847 against its source block but only 0.455
    // against this 2,144-character prompt — already under the threshold at the
    // smallest realistic prompt size, and falling as the prompt grows. A
    // whole-prompt implementation returns false here and the gate can never
    // fire in production. The two assertions below are that claim, executable.
    const prompt = `Framework: ISO 42001\nSubject: Acme\n\nSection analyses:\n${SECTION_SUMMARY}\n\n${OTHER_BLOCKS}`;

    expect(trigramJaccard(RESTATEMENT, prompt)).toBeLessThan(NOVELTY_THRESHOLD);
    expect(isRestatement(RESTATEMENT, prompt)).toBe(true);
    expect(isRestatement(ANALYSIS, prompt)).toBe(false);
  });

  it("catches a 100% verbatim copy of a multi-paragraph summary entry", () => {
    // The detector must not get LESS sensitive the more of the input was
    // copied. Every blank-line block of the copied entry is a fraction of the
    // copy, so the best per-paragraph score is under the threshold — the two
    // assertions below are the defect, executable: the first says blank-line
    // blocks cannot see this, the second says the gate fires anyway.
    const perParagraphMax = Math.max(
      ...MULTI_PARAGRAPH_PROMPT.split(/\n{2,}/).map((b) =>
        trigramJaccard(MULTI_PARAGRAPH_SUMMARY, b),
      ),
    );
    expect(perParagraphMax).toBeLessThan(NOVELTY_THRESHOLD);
    expect(isRestatement(MULTI_PARAGRAPH_SUMMARY, MULTI_PARAGRAPH_PROMPT)).toBe(true);
  });

  it("still passes an analysis when the labelled entry it analyses is multi-paragraph", () => {
    // The wider block must buy sensitivity to copies, not false positives.
    expect(isRestatement(ANALYSIS, MULTI_PARAGRAPH_PROMPT)).toBe(false);
  });

  it("returns false for empty prose, so an abstention never costs a second call", () => {
    expect(isRestatement("", SECTION_SUMMARY)).toBe(false);
    expect(isRestatement("   ", SECTION_SUMMARY)).toBe(false);
    expect(isRestatement(RESTATEMENT, "")).toBe(false);
  });

  it("honours an explicit threshold", () => {
    expect(isRestatement(ANALYSIS, SECTION_SUMMARY, 0.3)).toBe(true);
    expect(isRestatement(RESTATEMENT, SECTION_SUMMARY, 0.9)).toBe(false);
  });

  it("pins the calibrated threshold", () => {
    expect(NOVELTY_THRESHOLD).toBe(0.5);
  });
});
