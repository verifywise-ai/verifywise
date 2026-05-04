import { SubClauseISO } from "../../../../domain.layer/frameworks/ISO-42001/subClauseISO.model";
import { SubClauseStructISO } from "../../../../domain.layer/frameworks/ISO-42001/subClauseStructISO.model";

export const PerformanceEvaluation: Partial<SubClauseStructISO & SubClauseISO>[] = [
  {
    title: "Monitoring, measurement, analysis, and evaluation",
    order_no: 1,
    summary:
      "Determine what needs monitoring/measuring, the methods, frequency, and how results are analyzed/evaluated.",
    questions: [
      "What aspects of the AIMS and AI systems are monitored/measured?",
      "What methods are used?",
      "How often is data collected and analyzed?",
      "Who analyzes/evaluates?",
      "How are results used?",
    ],
    evidence_examples: [
      "Monitoring procedure",
      "Defined metrics/KPIs",
      "Monitoring logs/reports",
      "Performance dashboards",
      "Analysis reports",
    ],
    implementation_description:
      "Key AI system metrics (accuracy, fairness, latency) are monitored monthly using automated dashboards. Results are reviewed by the AI governance committee.",
    auditor_feedback:
      "Monitoring is thorough. Consider increasing frequency for high-risk AI systems and documenting anomaly thresholds more clearly.",
  },
  {
    title: "Internal audit",
    order_no: 2,
    summary:
      "Conduct internal audits at planned intervals to ensure the AIMS conforms to requirements and is effectively implemented.",
    questions: [
      "Is there an audit program?",
      "Are audits conducted by objective auditors?",
      "Are criteria/scope defined?",
      "Are results reported?",
      "Are nonconformities addressed?",
    ],
    evidence_examples: [
      "Internal audit procedure",
      "Audit programme/schedule",
      "Audit plans/reports",
      "Auditor competence records",
      "Nonconformity reports",
    ],
    implementation_description:
      "Internal audits are scheduled bi-annually with criteria aligned to ISO 42001. Audits are conducted by independent trained personnel.",
    auditor_feedback:
      "Audit process is sound. Encourage rotating auditors across projects to enhance objectivity.",
  },
  {
    title: "Management review",
    order_no: 3,
    summary:
      "Top management must review the AIMS at planned intervals to ensure its continuing suitability, adequacy, and effectiveness.",
    questions: [
      "Are reviews conducted regularly?",
      "Does review cover required inputs?",
      "Are decisions made regarding improvements/changes?",
      "Are minutes documented?",
    ],
    evidence_examples: [
      "Management review procedure",
      "Review schedule/agendas/minutes",
      "Action items tracker",
    ],
    implementation_description:
      "Management reviews occur annually, covering AIMS performance, audit outcomes, and improvement opportunities. Actions are tracked to closure.",
    auditor_feedback:
      "Reviews are well-documented. Recommend increasing frequency to bi-annually as system usage scales.",
  },
];
