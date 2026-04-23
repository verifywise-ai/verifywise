import { SubClauseISO } from "../../../../domain.layer/frameworks/ISO-42001/subClauseISO.model";
import { SubClauseStructISO } from "../../../../domain.layer/frameworks/ISO-42001/subClauseStructISO.model";

// NOTE: ISO 42001 Clause 6 in the standard uses a three-level hierarchy —
// 6.1.1 General, 6.1.2 AI risk assessment, 6.1.3 AI risk treatment,
// 6.1.4 AI system impact assessment, 6.2 AI objectives, 6.3 Planning of
// changes. The three-level children (6.1.1-6.1.4) and 6.3 are populated by
// dedicated migrations (20260420105041, 20260420105042) rather than this
// struct file. The old 2-level "6.1 Actions to address risks and
// opportunities" merged entry was removed to match the standard shape; its
// companion cleanup lives in 20260421170142-iso42001-remove-old-merged-6-1.js.
export const Planning: Partial<SubClauseStructISO & SubClauseISO>[] = [
  {
    title: "AI objectives and planning to achieve them",
    order_no: 2,
    summary:
      "Establish measurable AIMS objectives aligned with the AI policy and plan how to achieve them.",
    questions: [
      "What are the specific, measurable objectives for our AIMS?",
      "Are they consistent with the AI policy and organizational goals?",
      "What actions, resources, responsibilities, and timelines are defined to achieve these objectives?",
      "How will the achievement of objectives be evaluated?",
    ],
    evidence_examples: [
      "Documented AIMS Objectives",
      "Action plans linked to objectives",
      "Performance indicators (KPIs) for objectives",
      "Management review records discussing objectives progress",
    ],
    implementation_description:
      "Measurable AIMS objectives are defined annually, aligned with the AI policy, and tracked using KPIs reviewed in monthly management meetings.",
    auditor_feedback:
      "Objectives are clear and measurable. Evidence of consistent tracking found. Consider formalizing responsibility assignments for each objective.",
  },
];
