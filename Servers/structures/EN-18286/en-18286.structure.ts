import type { FrameworkStructure } from "../types";

export const en18286Structure: FrameworkStructure = {
  id: 26,
  key: "en-18286",
  framework_type: "en_18286",
  displayName: "EN 18286",
  tables: {
    l1_struct: "en_18286_clauses_struct",
    l2_struct: "en_18286_requirements_struct",
    l2_impl: "en_18286_requirements",
    l2_risks: "en_18286_requirements__risks",
  },
  cols: {
    l2_struct_parent: "clause_id",
    l2_impl_meta: "requirement_meta_id",
    l2_risks_impl: "requirement_id",
  },
  entity_types: {
    l2_impl: "requirement",
  },
  source_labels: {
    requirement: "EN 18286 requirements",
  },
  seed: {
    name: "EN 18286",
    description:
      "Organization-level clauses of EN 18286:2026, the harmonised standard for an AI quality management system supporting Article 17 of the EU AI Act",
    version: "2026",
    is_organizational: true,
    hierarchy: {
      type: "two_level",
      level1_name: "Clause",
      level2_name: "Requirement",
    },
    structure: [
      {
        title: "Quality management system",
        description:
          "Establish and maintain a quality management system that protects health, safety and fundamental rights across the AI system life cycle",
        order_no: 4,
        items: [
          {
            title: "General",
            description:
              "Establish and maintain the QMS and every process needed for its effectiveness across the AI system life cycle",
            order_no: 1,
            summary: "Run one QMS that covers all life cycle processes",
            questions: [
              "Is the QMS established, documented and maintained?",
              "Are all processes needed for its effectiveness identified?",
              "Do the processes cover the whole AI system life cycle?",
            ],
            evidence_examples: [
              "QMS manual",
              "Process map covering the AI system life cycle",
              "QMS process ownership register",
            ],
          },
          {
            title: "Regulatory requirements",
            description:
              "Identify the regulatory requirements that apply to each AI system and review them systematically",
            order_no: 2,
            summary: "Keep a reviewed register of applicable regulatory requirements",
            questions: [
              "Have the regulatory requirements applicable to each AI system been identified?",
              "Is there a defined trigger and interval for reviewing them?",
              "Who is responsible for tracking regulatory changes?",
            ],
            evidence_examples: [
              "Regulatory requirements register per AI system",
              "Regulatory review records",
              "Regulatory change log",
            ],
          },
          {
            title: "Scope",
            description:
              "Define which AI systems the QMS covers, considering the regulatory requirements and their intended purpose",
            order_no: 3,
            summary: "Document the AI systems in scope of the QMS",
            questions: [
              "Is the scope of the QMS documented?",
              "Does the scope list every AI system it covers?",
              "Were regulatory requirements and intended purpose considered when setting the scope?",
            ],
            evidence_examples: ["QMS scope statement", "Inventory of AI systems in scope"],
          },
          {
            title: "Strategy for regulatory compliance",
            description:
              "Determine and apply a strategy for regulatory compliance, covering the essential requirements, the conformity assessment procedure and the method chosen to meet each requirement (harmonised standards, common specifications or other specifications)",
            order_no: 4,
            summary: "Document how each essential requirement is met and by which route",
            questions: [
              "Is there a documented compliance strategy for each AI system or family of systems?",
              "Does it consider intended purpose, deployment areas and the required conformity assessment procedure?",
              "Is a method selected for each essential requirement?",
              "Does the technical documentation record which requirements are met by harmonised standards or common specifications, and what extra measures apply?",
            ],
            evidence_examples: [
              "Regulatory compliance strategy",
              "Essential requirements matrix with selected standards and specifications",
              "Conformity assessment route decision",
            ],
          },
          {
            title: "Documented information",
            description:
              "Establish and maintain documented information that is complete, clear, version-controlled, accessible to authorities and available in an official EU language, and control its approval, change, retention and disposal",
            order_no: 5,
            summary: "Control QMS documents and records under a documented procedure",
            questions: [
              "Is there a documented procedure for approval, review, change and versioning of documented information?",
              "Are changes reviewed and approved by competent personnel?",
              "Is external documented information identified and controlled?",
              "Can documented information be made available to authorities in an official EU language?",
            ],
            evidence_examples: [
              "Document control procedure",
              "Document register with versions and approvals",
              "Retention schedule",
              "External document register",
            ],
          },
        ],
      },
      {
        title: "Leadership",
        description:
          "Top management shows leadership and commitment to the quality management system",
        order_no: 5,
        items: [
          {
            title: "General",
            description:
              "Top management establishes the policy, objectives, resources and management reviews, and keeps the QMS effective",
            order_no: 1,
            summary: "Demonstrate top management commitment to the QMS",
            questions: [
              "How does top management demonstrate commitment to the QMS?",
              "Does top management ensure resources for the QMS are available?",
              "Does top management take part in management reviews?",
            ],
            evidence_examples: [
              "Top management commitment statement",
              "Board or executive meeting minutes on the QMS",
            ],
          },
          {
            title: "Quality policy",
            description:
              "Top management establishes a quality policy that commits to regulatory compliance, aligns with the compliance strategy and is communicated to personnel",
            order_no: 2,
            summary: "Publish a quality policy aligned with the compliance strategy",
            questions: [
              "Is there an approved quality policy?",
              "Does it commit to compliance with regulatory requirements?",
              "Is it aligned with the strategy for regulatory compliance?",
              "How is it communicated to personnel?",
            ],
            evidence_examples: [
              "Approved quality policy",
              "Policy communication records",
              "Policy acknowledgement records",
            ],
          },
          {
            title: "Roles, responsibilities, and authorities",
            description:
              "Assign supervision of the QMS to personnel with suitable expertise and define roles, responsibilities, decision authorities and accountabilities for monitoring and risk management",
            order_no: 3,
            summary: "Define an accountability framework for the QMS",
            questions: [
              "Who is accountable for supervising the QMS?",
              "Are roles, responsibilities and decision authorities documented?",
              "Are accountabilities for monitoring and risk management assigned?",
            ],
            evidence_examples: [
              "Accountability framework",
              "RACI matrix",
              "Role descriptions",
              "Appointment letters for QMS roles",
            ],
          },
        ],
      },
      {
        title: "Planning",
        description:
          "Plan the quality management system by addressing its risks and setting quality objectives",
        order_no: 6,
        items: [
          {
            title: "Risks to the QMS",
            description:
              "Determine and plan actions for risks to the operation of the QMS, distinct from AI system risks, considering the compliance strategy, AI technologies used, external support, and available resources and competence",
            order_no: 1,
            summary: "Identify and treat risks to the QMS itself",
            questions: [
              "Have risks to the operation of the QMS been identified from the regulatory requirements?",
              "Are actions planned, integrated into QMS processes and implemented?",
              "Is the effectiveness of those actions evaluated?",
            ],
            evidence_examples: [
              "QMS risk register",
              "QMS risk treatment plan",
              "Action effectiveness reviews",
            ],
          },
          {
            title: "Quality objectives",
            description:
              "Establish verifiable quality objectives aligned with the quality policy and regulatory requirements, plan how to achieve them, and review them regularly",
            order_no: 2,
            summary: "Set, plan and review measurable quality objectives",
            questions: [
              "Are quality objectives set for the relevant functions, levels, products and processes?",
              "Are the objectives verifiable?",
              "Is there a plan stating the work, actions and responsible persons for each objective?",
              "How often are objectives reviewed?",
            ],
            evidence_examples: [
              "Quality objectives register",
              "Objective action plans",
              "Objective progress reports",
            ],
          },
        ],
      },
      {
        title: "Support",
        description:
          "Provide the resources, competence, communication and awareness the quality management system needs",
        order_no: 7,
        items: [
          {
            title: "Resources",
            description:
              "Determine and provide the personnel, knowledge, infrastructure and security-of-supply measures the QMS needs",
            order_no: 1,
            summary: "Provide resources, including security of supply",
            questions: [
              "Have the personnel, knowledge and infrastructure needed for the QMS been determined?",
              "Are security-of-supply measures in place?",
              "How are resource gaps identified and addressed?",
            ],
            evidence_examples: [
              "Resource plan",
              "Infrastructure inventory",
              "Security-of-supply measures",
            ],
          },
          {
            title: "Competence",
            description:
              "Determine, verify, maintain and document the competence of personnel whose work affects the QMS, taking into account intended purpose, misuse, technology, risks and accessibility",
            order_no: 2,
            summary: "Ensure and record personnel competence",
            questions: [
              "Are competence requirements defined for QMS roles?",
              "How is competence verified and maintained?",
              "Do personnel know their QMS duties and the relevant regulatory requirements?",
              "What action is taken when competence gaps exist?",
            ],
            evidence_examples: ["Competence matrix", "Training records", "Qualification records"],
          },
          {
            title: "Communication",
            description:
              "Plan internal and external communication required by regulation, including procedures for communicating with competent authorities, notified bodies, operators and customers, responding to reasoned requests and providing compliance information",
            order_no: 3,
            summary: "Maintain regulatory communication procedures",
            questions: [
              "Is it determined what is communicated, when, to whom and how?",
              "Are there procedures for communicating with competent authorities, notified bodies, operators and customers?",
              "How are interested parties informed about non-compliance, AI systems presenting a risk and serious incidents?",
              "How are reasoned requests from competent authorities answered?",
              "How is evidence of compliance, including automatically generated logs, collected and provided?",
            ],
            evidence_examples: [
              "Communication plan",
              "Regulatory communication procedure",
              "Authority request log and responses",
              "Compliance evidence pack",
            ],
          },
          {
            title: "Awareness",
            description:
              "Ensure personnel are aware of the quality policy, how their work supports the QMS and the consequences of not conforming",
            order_no: 4,
            summary: "Make personnel aware of the policy and their contribution",
            questions: [
              "Are personnel aware of the quality policy?",
              "Do they understand how their work contributes to the QMS?",
              "Do they understand the consequences of not conforming?",
            ],
            evidence_examples: ["Awareness training records", "Internal communications"],
          },
        ],
      },
      {
        title: "Operations and control",
        description:
          "Report serious incidents and handle non-compliance of AI systems on the market or in service",
        order_no: 9,
        items: [
          {
            title: "Reporting serious incidents",
            description:
              "Investigate serious incidents and report them to competent authorities within the set time scales, under documented procedures that also cover deployer reporting",
            order_no: 6,
            summary: "Investigate and report serious incidents on time",
            questions: [
              "Is there a documented serious incident reporting procedure?",
              "Does it meet the reporting time scales (2, 10 and 15 days by incident type)?",
              "How is a causal link with the AI system investigated?",
              "Does the procedure cover reporting by deployers to the provider?",
            ],
            evidence_examples: [
              "Serious incident procedure",
              "Incident investigation reports",
              "Authority notifications",
            ],
          },
          {
            title: "Non-compliance",
            description:
              "Detect, assess and correct non-compliance of AI systems on the market or in service, handle AI systems presenting a risk, inform competent market surveillance authorities and keep documented evidence of each corrective action",
            order_no: 7,
            summary: "Correct non-compliance and inform authorities",
            questions: [
              "Is there a documented procedure to detect and correct non-compliance?",
              "How are AI systems presenting a risk identified and investigated?",
              "Are market surveillance authorities, and the notified body where applicable, informed?",
              "Is evidence kept of each non-compliance, the steps taken and the results?",
            ],
            evidence_examples: [
              "Non-compliance procedure",
              "Corrective action records",
              "Withdrawal or recall records",
              "Authority notifications",
            ],
          },
        ],
      },
      {
        title: "Performance evaluation",
        description:
          "Review the quality management system and plan changes to keep it suitable, adequate and effective",
        order_no: 10,
        items: [
          {
            title: "Management review",
            description:
              "Review the QMS at planned intervals with top management, and after serious incidents, considering inputs such as feedback, complaints, audits, monitoring data and regulatory changes, and document the outputs",
            order_no: 1,
            summary: "Review QMS effectiveness at planned intervals",
            questions: [
              "Are management reviews held at planned intervals?",
              "Does top management take part?",
              "Are extra reviews held after serious incidents?",
              "Do inputs include feedback, complaints, audits, monitoring data and regulatory changes?",
              "Are review outputs documented?",
            ],
            evidence_examples: [
              "Management review schedule",
              "Management review minutes",
              "Management review action log",
            ],
          },
          {
            title: "Planning of changes",
            description:
              "Document, plan, control and record changes to the QMS, review QMS processes when an AI system is added or substantially modified, and assess the effect of each change before making it",
            order_no: 2,
            summary: "Plan and control changes to the QMS",
            questions: [
              "Is there a documented procedure for changes to the QMS?",
              "Is a process review considered when an AI system is added or substantially modified?",
              "Is the effect of a change on the QMS and each AI system assessed first?",
            ],
            evidence_examples: [
              "QMS change procedure",
              "QMS change records",
              "Change impact assessments",
            ],
          },
        ],
      },
    ],
  },
};

export default en18286Structure;
