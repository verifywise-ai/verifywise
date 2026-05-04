import { SubClauseISO } from "../../../../domain.layer/frameworks/ISO-42001/subClauseISO.model";
import { SubClauseStructISO } from "../../../../domain.layer/frameworks/ISO-42001/subClauseStructISO.model";

export const ContextOfOrganization: Partial<SubClauseStructISO & SubClauseISO>[] = [
  {
    title: "Understanding the organization and its context",
    order_no: 1,
    summary:
      "Determine external and internal issues relevant to the organization''s purpose and its AIMS, including AI principles/values and strategic direction.",
    questions: [
      "What internal factors (culture, resources, knowledge) influence our AIMS?",
      "What external factors (legal, ethical, market, social, technological) influence our AIMS?",
      "How does our use/development of AI align with our business strategy?",
      "What are our organization''s guiding principles or values related to AI?",
    ],
    evidence_examples: [
      "Context analysis document (PESTLE, SWOT focused on AI)",
      "Documentation of internal/external issues",
      "Strategic planning documents referencing AI",
      "Documented AI Principles/Ethics Statement",
    ],
    implementation_description:
      "The organization conducted a PESTLE and SWOT analysis focused on AI applications, incorporating input from legal, ethics, and tech innovation teams. A dedicated strategy session aligned these findings with its AI ethics charter.",
    auditor_feedback:
      "Context analysis is well documented. Recommend periodic updates to reflect rapidly evolving AI regulations.",
  },
  {
    title: "Understanding the needs and expectations of interested parties",
    order_no: 2,
    summary:
      "Identify interested parties relevant to the AIMS and their requirements/expectations concerning AI.",
    questions: [
      "Who are the interested parties for our AI systems (customers, users, regulators, employees, public, partners)?",
      "What are their relevant needs, expectations, and requirements (legal, ethical, contractual) regarding our AI?",
      "How do we capture and review these requirements?",
    ],
    evidence_examples: [
      "Stakeholder analysis matrix/register",
      "List of applicable legal/regulatory requirements for AI",
      "Records of communication with stakeholders",
      "Contractual requirements related to AI",
    ],
    implementation_description:
      "Stakeholder interviews and surveys were conducted quarterly. Legal and compliance teams compiled regulatory obligations in a centralized register.",
    auditor_feedback:
      "Stakeholder register is comprehensive. Some stakeholder feedback mechanisms could benefit from structured follow-up actions.",
  },
  {
    title: "Determining the scope of the AI Management System",
    order_no: 3,
    summary: "Define the boundaries and applicability of the AIMS within the organization.",
    questions: [
      "What organizational units, processes, locations are included in the AIMS?",
      "Which specific AI systems or applications are covered by the AIMS?",
      "What stages of the AI lifecycle are included?",
      "Are there any exclusions, and what is the justification?",
    ],
    evidence_examples: ["Documented AIMS Scope Statement"],
    implementation_description:
      "The AIMS was scoped to include R&D and customer-facing AI systems but excluded internal HR tools, with justification documented in the scope statement.",
    auditor_feedback:
      "Scope justification is clear and aligned with the organization's operations. Suggest reviewing excluded systems as part of future scope expansion.",
  },
  {
    title: "AI Management System",
    order_no: 4,
    summary:
      "Establish, implement, maintain, and continually improve the AIMS in accordance with ISO 42001 requirements.",
    questions: [
      "Do we have the necessary processes and documentation established for the AIMS?",
      "Are these processes being followed (implemented)?",
      "Are there mechanisms for maintaining and updating the AIMS?",
      "Is there a process for continual improvement of the AIMS?",
    ],
    evidence_examples: [
      "The AIMS documentation itself (policies, procedures)",
      "Records of implementation activities",
      "Management review records",
      "Audit results",
    ],
    implementation_description:
      "A policy framework and operational procedures were implemented across business units. Quarterly internal audits drive ongoing improvements.",
    auditor_feedback:
      "AIMS is well structured. Evidence of improvement cycles is visible. Recommend enhancing tracking of minor audit findings over time.",
  },
];
