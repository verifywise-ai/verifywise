import { SubClauseISO } from "../../../../domain.layer/frameworks/ISO-42001/subClauseISO.model";
import { SubClauseStructISO } from "../../../../domain.layer/frameworks/ISO-42001/subClauseStructISO.model";

export const Improvement: Partial<SubClauseStructISO & SubClauseISO>[] = [
  {
    title: "Nonconformity and corrective action",
    order_no: 1,
    summary:
      "React to nonconformities, evaluate need for action, implement corrective actions, review effectiveness, and update AIMS if needed.",
    questions: [
      "Is there a process for nonconformities?",
      "How is correction handled?",
      "Is root cause analysis performed?",
      "How are corrective actions tracked and verified?",
      "Are changes made to AIMS?",
    ],
    evidence_examples: [
      "Corrective action procedure",
      "Nonconformity register",
      "Root cause analysis records",
      "Corrective action plans/verification",
    ],
    implementation_description:
      "Nonconformities are logged in a centralized system. Root cause analysis is performed using the '5 Whys' method, and corrective actions are tracked through to verification.",
    auditor_feedback:
      "Robust handling of nonconformities. Suggest automating alerts for overdue corrective actions.",
  },
  {
    title: "Continual improvement",
    order_no: 2,
    summary: "Continually improve the suitability, adequacy, and effectiveness of the AIMS.",
    questions: [
      "How does the organization use results to drive improvement?",
      "Is there evidence of ongoing efforts?",
    ],
    evidence_examples: [
      "Management review outputs",
      "Updated policies/procedures",
      "Improvement project records",
      "Trend analysis",
    ],
    implementation_description:
      "Continuous improvement is driven by trend analysis of AI performance, stakeholder feedback, and audit results. Improvement initiatives are formally scoped and tracked.",
    auditor_feedback:
      "Evidence of active improvement projects. Consider integrating user feedback more systematically into improvement planning.",
  },
];
