import { SubClauseISO } from "../../../../domain.layer/frameworks/ISO-42001/subClauseISO.model";
import { SubClauseStructISO } from "../../../../domain.layer/frameworks/ISO-42001/subClauseStructISO.model";

export const Support: Partial<SubClauseStructISO & SubClauseISO>[] = [
  {
    title: "Resources",
    order_no: 1,
    summary: "Determine and provide the resources needed for the AIMS.",
    questions: [
      "What resources (human, financial, technological, infrastructure) are needed?",
      "Have these resources been identified and allocated?",
    ],
    evidence_examples: [
      "Budget approvals",
      "Staffing plans",
      "Technology acquisition records",
      "Facility plans",
    ],
    implementation_description:
      "Resources required for AIMS, including staff, technology, and tools, are identified during annual budgeting and project planning processes.",
    auditor_feedback:
      "Resource planning is adequate. Recommend conducting periodic reviews to ensure AI projects are not under-resourced mid-cycle.",
  },
  {
    title: "Competence",
    order_no: 2,
    summary:
      "Ensure personnel involved in the AIMS are competent based on education, training, or experience.",
    questions: [
      "What competencies are required for different AIMS roles?",
      "How do we ensure individuals possess these competencies?",
      "Are training needs identified and addressed?",
      "Is competence maintained and documented?",
    ],
    evidence_examples: [
      "Job descriptions with competency requirements",
      "Competency matrix",
      "Training plans and records",
      "Performance reviews",
      "Certifications",
    ],
    implementation_description:
      "Competency requirements are defined in job descriptions; staff are trained through internal and external AI-specific programs.",
    auditor_feedback:
      "Competency documentation is robust. Suggest more structured refresher training schedules to maintain AI literacy over time.",
  },
  {
    title: "Awareness",
    order_no: 3,
    summary:
      "Ensure relevant personnel are aware of the AI policy, their contribution, and the implications of non-conformance.",
    questions: [
      "Are staff aware of the AI Policy?",
      "Do they understand how their work contributes to the AIMS and AI ethics?",
      "Are they aware of the benefits of effective AI governance and risks of failure?",
      "How is this awareness created and maintained?",
    ],
    evidence_examples: [
      "Awareness training materials and attendance logs",
      "Internal communications (newsletters, posters)",
      "Onboarding materials",
    ],
    implementation_description:
      "Awareness of AI policy and individual responsibilities is maintained through onboarding, quarterly updates, and mandatory e-learning modules.",
    auditor_feedback:
      "Awareness efforts are well-documented. Consider adding scenario-based training to improve practical understanding of ethical implications.",
  },
  {
    title: "Communication",
    order_no: 4,
    summary: "Determine and implement internal and external communications relevant to the AIMS.",
    questions: [
      "What needs to be communicated about the AIMS?",
      "When, how, and with whom does communication occur (internal & external)?",
      "Who is responsible for communication?",
    ],
    evidence_examples: [
      "Communication plan/matrix",
      "Records of communications (meeting minutes, emails, public statements)",
    ],
    implementation_description:
      "A communication matrix guides internal/external AIMS-related messaging, including roles, frequency, and channels.",
    auditor_feedback:
      "Communication mechanisms are clearly defined. Future audits should validate consistency of execution across departments.",
  },
  {
    title: "Documented information",
    order_no: 5,
    summary:
      "Manage documented information required by the standard and necessary for AIMS effectiveness (creation, update, control, availability, protection).",
    questions: [
      "What documentation is required by ISO 42001?",
      "What other documentation do we need for our AIMS to be effective?",
      "How do we ensure documents are properly identified, formatted, reviewed, approved, version controlled, available, and protected?",
    ],
    evidence_examples: [
      "Document control procedure",
      "Master document list / Document register",
      "Version history in documents",
      "Access control records",
      "Backup procedures",
    ],
    implementation_description:
      "Document control follows a formal procedure ensuring versioning, access control, and periodic review. A master document register is maintained.",
    auditor_feedback:
      "Strong document management observed. Ensure all legacy AI documentation is migrated and version-controlled accordingly.",
  },
];
