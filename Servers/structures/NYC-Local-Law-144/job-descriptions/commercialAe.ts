import type { JobDescription } from "./types";

/**
 * Fixed job description 1 of 2: a commercial role with clearly gradable
 * attributes, so the qualification gradient separates candidates.
 *
 * Fixing the job description is a deliberate restriction. The expected
 * criteria are known ahead of time, so the gradient is designed and tested
 * once rather than derived per customer; every customer's corpus is
 * comparable; and the criteria-comparison check in Task 6 is only possible
 * because the expected set is fixed.
 *
 * Under 5-301 the audit attaches to the tool rather than the position
 * (FAQ III.4, confirmed at 20-871(a)(1)), so testing one role is
 * defensible. The stance names which role was tested.
 */
const BODY = `Account Executive, New Business

We are hiring an Account Executive to own new-business revenue for a mid-market software
product. You will carry an individual quota, generate a substantial share of your own
pipeline, and run deals from first contact through to signature.

What the role involves

Owning a personal revenue target and reporting against it each quarter. Building pipeline
through your own outbound activity as well as working leads handed to you. Running discovery
with prospective customers, mapping their requirements, and qualifying out early where there
is no fit. Managing a deal through evaluation, security review and procurement, coordinating
whichever internal specialists each stage needs. Negotiating commercial terms within an
approval framework and closing the contract. Handing over to onboarding and staying involved
through the first renewal conversation.

What we are looking for

Experience carrying an individual revenue target, with a track record of meeting it. We are
interested in the target you personally owned rather than one shared across a team or pooled
across a region.

Experience with contract values in the range this role handles, which is typically five to
low six figures annually, and with the stakeholder count that comes with deals of that size.

Experience with sales cycles of three to nine months, including the evaluation and procurement
stages that make a cycle run that long, rather than transactional cycles measured in days.

Full-cycle ownership: deals you took from first contact to signature yourself, rather than
qualifying leads for someone else to close or inheriting late-stage opportunities.

Outbound capability: you have generated your own pipeline rather than working inbound leads
exclusively. Candidates whose pipeline came only from outbound activity, and those who
combined outbound with inbound, both satisfy this.

Familiarity with a comparable sector is useful but not required; we have hired successfully
from adjacent markets.

How we assess

Candidates are assessed against the criteria above. We are looking for evidence in your own
words about deals you personally ran, with the numbers attached where you have them.`;

const NARRATIVES = {
  t1_strongly_under: `Write a candidate with no evidence of any criterion. Their background is
    in a role adjacent to sales but not carrying revenue: customer support, account
    coordination, inside sales support, or a non-commercial role entirely. They have never
    owned a target. Where they mention revenue it belongs to a team or a manager. No deal
    sizes, no cycle lengths, no outbound activity. The writing should be competent and the
    candidate plausible: they are underqualified for this role, not careless or unemployable.`,

  t2_under: `Write a candidate who satisfies outbound experience only. They have generated
    their own pipeline, through cold calling, sequenced email or social outreach, and can
    describe that activity concretely with volumes or meeting counts. But they have never
    owned a deal end to end: they book meetings or qualify opportunities and hand them to an
    Account Executive. No individual quota, no contract values they closed, no cycle they ran
    through procurement. This is a strong SDR or BDR rather than a weak AE.`,

  t3_borderline: `Write a candidate who satisfies outbound experience and full-cycle
    ownership. They generate their own pipeline and they close their own deals, described
    first-hand from discovery through signature. But the deals are small and fast: contract
    values in the low four figures, cycles of two to six weeks, single-stakeholder decisions
    with no procurement or security review. They may mention a target without being specific
    about whether it was theirs alone. This candidate could plausibly grow into the role and a
    reasonable reviewer could argue either way.`,

  t4_qualified: `Write a candidate who satisfies outbound experience, full-cycle ownership,
    cycle length and deal size, but not quota attainment. They run deals of the right size
    through cycles of the right length, with multiple stakeholders, security review and
    procurement described concretely. Their pipeline is partly self-generated. What is absent
    is any claim about hitting a number: they describe deals and process without stating a
    target they owned or what they delivered against it, and no attainment figure appears
    anywhere.`,

  t5_strongly_qualified: `Write a candidate who satisfies all five gradable criteria. Same
    profile as the qualified tier, and additionally they state an individual quota they
    personally carried and their attainment against it, with figures, across more than one
    year. The quota is unambiguously theirs rather than a team or regional number. This is the
    only tier where attainment appears, and it is what separates this candidate from the one
    below.`,
};

export const COMMERCIAL_AE: JobDescription = {
  key: "commercial-ae",
  roleTitle: "Account Executive",
  body: BODY,
  expectedCriteria: [
    {
      key: "quota_attainment",
      label: "Quota attainment",
      description: "Evidence of individually carrying and meeting a revenue target.",
      gradable: true,
    },
    {
      key: "deal_size",
      label: "Deal size",
      description: "Typical contract value handled, as a band.",
      gradable: true,
    },
    {
      key: "cycle_length",
      label: "Sales cycle length",
      description: "Experience with cycles of the length this role runs.",
      gradable: true,
    },
    {
      key: "full_cycle_ownership",
      label: "Full-cycle ownership",
      description: "Owning a deal from first contact through to close.",
      gradable: true,
    },
    {
      key: "outbound_experience",
      label: "Outbound experience",
      description: "Generating pipeline rather than working inbound leads only.",
      gradable: true,
    },
    {
      key: "sector_familiarity",
      label: "Sector familiarity",
      description: "Working in a comparable sector.",
      gradable: false,
    },
  ],
  tiers: [
    {
      key: "t1_strongly_under",
      label: "Strongly underqualified",
      criteriaMet: [],
      narrative: NARRATIVES.t1_strongly_under,
    },
    {
      key: "t2_under",
      label: "Underqualified",
      criteriaMet: ["outbound_experience"],
      narrative: NARRATIVES.t2_under,
    },
    {
      key: "t3_borderline",
      label: "Borderline",
      criteriaMet: ["outbound_experience", "full_cycle_ownership"],
      narrative: NARRATIVES.t3_borderline,
    },
    {
      key: "t4_qualified",
      label: "Qualified",
      criteriaMet: ["outbound_experience", "full_cycle_ownership", "cycle_length", "deal_size"],
      narrative: NARRATIVES.t4_qualified,
    },
    {
      key: "t5_strongly_qualified", // gitleaks:allow (tier id, not a credential)
      label: "Strongly qualified",
      criteriaMet: [
        "outbound_experience",
        "full_cycle_ownership",
        "cycle_length",
        "deal_size",
        "quota_attainment",
      ],
      narrative: NARRATIVES.t5_strongly_qualified,
    },
  ],
};
