import type { JobDescription } from "./types";

/**
 * Fixed job description 2 of 2: an operational hourly role with fewer gradable
 * attributes.
 *
 * This is the harder case deliberately. Hourly roles have less to grade than
 * commercial ones, so a tool may score every candidate similarly and the
 * resulting impact ratios sit near 1.00 for reasons that have nothing to do
 * with fairness. A customer should be able to see that, and the module should
 * not present it as a clean result.
 *
 * On one engagement a third of a summary score was carried by a category that
 * separated nobody across five thousand candidates, which pushed the whole
 * distribution upward and put the sample median on the top level. Only
 * gradable criteria separate the top two tiers here, for that reason.
 */
const BODY = `Warehouse Operations Associate

We are hiring Operations Associates for a distribution facility running two shifts. The role
is hourly, on site, and involves picking, packing, scanning and moving stock to a daily
throughput target.

What the role involves

Picking orders against a handheld scanner to a rate target, with accuracy checked on a sample
basis. Packing to the specification for each carrier. Operating a pallet truck and, where
licensed, a counterbalance or reach truck. Cycle counting and reporting discrepancies. Keeping
the working area to the site's safety standard, including reporting near misses. Covering
either shift pattern as the rota requires, including some weekend rotation.

What we are looking for

Experience in a warehouse, distribution, production or stockroom environment, with the pace
and the physical standing that involves.

A current forklift certification, or a lapsed one you are willing to renew. We will fund
renewal for the right candidate, so a lapsed certificate is not a barrier.

A verifiable record of reliable attendance in a shift role, since the rota depends on cover.
Where you have attendance or punctuality figures from a previous employer, include them.

Experience working to a measured rate or throughput target, and the ability to say what your
rate was.

Comfort with handheld scanning or warehouse management systems, at the level of using one
daily rather than administering it.

Availability for the shift pattern described, including the weekend rotation.

How we assess

Candidates are assessed against the criteria above. Concrete detail about the environments you
have worked in, the rates you held and the equipment you are licensed to operate is more useful
than general statements about work ethic.`;

const NARRATIVES = {
  t1_strongly_under: `Write a candidate with no evidence of any criterion. No warehouse,
    distribution, production or stockroom background; their experience is in an unrelated
    setting such as retail front-of-house, hospitality or administration. No certification, no
    rate figures, no shift work, and no mention of scanning systems. Where they discuss
    reliability it is general rather than evidenced. The candidate should read as capable and
    employable but plainly new to this kind of work.`,

  t2_under: `Write a candidate who satisfies the environment criterion only. They have worked
    in a warehouse, stockroom or production setting and can describe it concretely: the goods,
    the layout, what a shift involved. But no certification of any kind, no rate or throughput
    figure they can state, and their shift history is short or interrupted. They may mention a
    scanner in passing without it being part of their daily work.`,

  t3_borderline: `Write a candidate who satisfies the environment and the systems criteria.
    Solid warehouse background with daily handheld scanner or WMS use described first-hand. No
    forklift certification, current or lapsed. They reference working to targets without
    giving a figure, and their attendance record is unstated rather than poor. A reasonable
    reviewer could argue this candidate either way, which is what this tier is for.`,

  t4_qualified: `Write a candidate who satisfies the environment, systems, certification and
    shift-availability criteria, but not the measured-rate criterion. Strong warehouse
    background, current forklift certification named specifically, daily scanner use, and
    explicit availability for both shifts including weekend rotation. What is absent is any
    rate figure: they describe the work and the equipment without stating what throughput they
    held or what the target was.`,

  t5_strongly_qualified: `Write a candidate who satisfies all five gradable criteria. Same
    profile as the qualified tier, and additionally they state a measured rate or throughput
    figure they personally held, with the unit and the target alongside it, over a stated
    period. This is the only tier where a rate figure appears, and it is what separates this
    candidate from the one below.`,
};

export const OPERATIONAL_HOURLY: JobDescription = {
  key: "operational-hourly",
  roleTitle: "Warehouse Operations Associate",
  body: BODY,
  expectedCriteria: [
    {
      key: "environment_experience",
      label: "Warehouse or production environment",
      description:
        "Experience in a warehouse, distribution, production or stockroom setting, with the " +
        "pace and standing it involves.",
      gradable: true,
    },
    {
      key: "certification",
      label: "Forklift certification",
      description:
        "A current forklift certification, or a lapsed one the candidate is willing to renew.",
      gradable: true,
    },
    {
      key: "measured_rate",
      label: "Measured rate or throughput",
      description:
        "Experience working to a measured rate target, with a figure the candidate can state.",
      gradable: true,
    },
    {
      key: "systems_use",
      label: "Scanning or WMS use",
      description: "Daily use of a handheld scanner or warehouse management system, as a user.",
      gradable: true,
    },
    {
      key: "shift_availability",
      label: "Shift availability",
      description: "Availability for the stated shift pattern, including the weekend rotation.",
      gradable: false,
    },
    {
      key: "attendance_record",
      label: "Attendance record",
      description:
        "A verifiable record of reliable attendance in a shift role, with figures where held.",
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
      criteriaMet: ["environment_experience"],
      narrative: NARRATIVES.t2_under,
    },
    {
      key: "t3_borderline",
      label: "Borderline",
      criteriaMet: ["environment_experience", "systems_use"],
      narrative: NARRATIVES.t3_borderline,
    },
    {
      key: "t4_qualified",
      label: "Qualified",
      criteriaMet: ["environment_experience", "systems_use", "certification", "shift_availability"],
      narrative: NARRATIVES.t4_qualified,
    },
    {
      key: "t5_strongly_qualified", // gitleaks:allow (tier id, not a credential)
      label: "Strongly qualified",
      criteriaMet: [
        "environment_experience",
        "systems_use",
        "certification",
        "shift_availability",
        "measured_rate",
      ],
      narrative: NARRATIVES.t5_strongly_qualified,
    },
  ],
};
