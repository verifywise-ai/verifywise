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
      "Harmonised European standard for a quality management system for EU AI Act regulatory purposes, supporting providers of high-risk AI systems in meeting Article 17",
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
        title: "AI system realization",
        description:
          "Establish and maintain life cycle processes for each AI system, from inception to retirement",
        order_no: 8,
        items: [
          {
            title: "Processes and procedures",
            description:
              "Establish, document and maintain processes and procedures for the applicable life cycle stages, set their criteria and sequence, and keep documented information showing they were carried out as planned",
            order_no: 1,
            summary: "Define and control AI system life cycle processes",
            questions: [
              "Are processes defined for each applicable life cycle stage?",
              "Do they include methods for data, documentation, supply chain, monitoring and non-compliance?",
              "Are criteria and sequencing set to supervise the processes?",
              "Is there documented information showing the processes followed the plans?",
            ],
            evidence_examples: [
              "AI system life cycle procedure",
              "Stage gate criteria",
              "Life cycle execution records",
            ],
          },
          {
            title: "Risk management system",
            description:
              "Maintain a documented risk management system for each AI system across its entire life cycle, meeting Article 9 of the EU AI Act",
            order_no: 2,
            summary: "Keep a risk management file for each AI system",
            questions: [
              "Is there a documented risk management system for each AI system?",
              "Does it cover the entire life cycle?",
              "How are risks to health, safety and fundamental rights identified and treated?",
            ],
            evidence_examples: [
              "Risk management plan per AI system",
              "Risk management file",
              "Risk assessment and treatment records",
            ],
          },
          {
            title: "Inception, design and development",
            description:
              "Determine the intended purpose, set complete and verifiable requirements, review and approve them, write specifications that describe the design, and verify that the design meets the requirements",
            order_no: 3,
            summary: "Control design from intended purpose to verified specification",
            questions: [
              "Is the intended purpose determined at inception?",
              "Was consultation with affected persons or their representatives considered?",
              "Are requirements complete, clear and verifiable?",
              "Are requirements reviewed and approved at set points?",
              "Do specifications describe the design and meet the requirements?",
            ],
            evidence_examples: [
              "Intended purpose statement",
              "Requirements specification",
              "Design specification",
              "Design review records",
            ],
          },
          {
            title: "Verification and validation",
            description:
              "Treat verification and validation as distinct parts of quality control and quality assurance, verifying against specifications with documented, reproducible tests and validating against intended-purpose requirements before placing on the market or putting into service",
            order_no: 4,
            summary: "Verify against specifications and validate against intended purpose",
            questions: [
              "Are verification and validation planned separately?",
              "Are tests documented and reproducible, with clear acceptance criteria?",
              "Is validation completed before placing on the market or putting into service?",
              "Was consultation of interested parties about risks considered?",
            ],
            evidence_examples: [
              "Verification plan and report",
              "Validation plan and report",
              "Test cases with acceptance criteria",
            ],
          },
          {
            title: "Data management",
            description:
              "Set a data management strategy and processes covering the data used across the AI system life cycle",
            order_no: 5,
            summary: "Manage and document data across the life cycle",
            questions: [
              "Is there a documented data management strategy?",
              "Do the processes cover data used in every life cycle stage?",
              "How is data documented?",
            ],
            evidence_examples: [
              "Data management strategy",
              "Data management procedures",
              "Dataset documentation",
            ],
          },
          {
            title: "Retirement",
            description:
              "Establish retirement processes where applicable and inform deployers of the retirement measures they are responsible for",
            order_no: 6,
            summary: "Plan retirement and inform deployers",
            questions: [
              "Is there a retirement process for the AI system?",
              "Are deployers informed of the retirement measures they are responsible for?",
            ],
            evidence_examples: ["Retirement procedure", "Deployer retirement notices"],
          },
          {
            title: "Identification of the AI system",
            description:
              "Give each AI system and each version subject to conformity assessment a unique reference linked to its documentation",
            order_no: 7,
            summary: "Uniquely identify each AI system and version",
            questions: [
              "Does each AI system have a unique reference?",
              "Does each version subject to conformity assessment have its own reference?",
              "Is the reference linked to the system's documentation?",
            ],
            evidence_examples: ["AI system version register", "Configuration management records"],
          },
          {
            title: "Continuous learning AI systems",
            description:
              "For AI systems that continue to learn after deployment, document, verify, validate and log any predetermined changes",
            order_no: 8,
            summary: "Control predetermined changes in learning systems",
            questions: [
              "Does the AI system continue to learn after deployment?",
              "Are predetermined changes documented?",
              "Are they verified, validated and logged?",
            ],
            evidence_examples: [
              "Predetermined change plan",
              "Change verification and validation records",
              "Learning event logs",
            ],
          },
          {
            title: "Product documentation",
            description:
              "Prepare and keep up to date the technical documentation before placing on the market or putting into service, and maintain the instructions for use for each AI system",
            order_no: 9,
            summary: "Maintain technical documentation and instructions for use",
            questions: [
              "Is technical documentation prepared before placing on the market or putting into service?",
              "Is it kept up to date?",
              "Are there procedures for establishing and maintaining the instructions for use?",
            ],
            evidence_examples: [
              "Technical documentation (Annex IV)",
              "Instructions for use",
              "Documentation change history",
            ],
          },
        ],
      },
      {
        title: "Operations and control",
        description:
          "Control AI systems placed on the market or put into service, including support, supply chain, modifications, post-market monitoring, serious incidents and non-compliance",
        order_no: 9,
        items: [
          {
            title: "Placing on the market and putting into service",
            description:
              "Give each AI system placed on the market or put into service an identifier that no other system has, for distribution traceability",
            order_no: 1,
            summary: "Make each released AI system traceable",
            questions: [
              "Does each AI system placed on the market have a unique identifier?",
              "Can distribution be traced through that identifier?",
            ],
            evidence_examples: ["Release register", "Distribution records"],
          },
          {
            title: "Support services",
            description:
              "Identify, specify and provide support services, and a channel for deployer feedback (recommendation)",
            order_no: 2,
            summary: "Provide support services and a deployer feedback channel",
            questions: [
              "Are support services identified and specified?",
              "Is there a channel for deployers to give feedback?",
            ],
            evidence_examples: ["Support service description", "Deployer feedback records"],
          },
          {
            title: "Supply chain",
            description:
              "Set and apply controls so that externally supplied items, services and tasks meet the requirements needed for compliance, covering supplier selection, monitoring, specifications and verification of supplied items",
            order_no: 3,
            summary: "Select, specify, monitor and verify suppliers",
            questions: [
              "Are supplier selection and evaluation criteria documented and proportionate to risk?",
              "Is supplier monitoring planned with set criteria, frequency and methods?",
              "Are suppliers given the specifications they need?",
              "Are supplied items verified before acceptance?",
            ],
            evidence_examples: [
              "Supplier selection criteria",
              "Approved supplier list",
              "Supplier evaluations",
              "Supplier agreements",
              "Incoming verification records",
            ],
          },
          {
            title: "Modifications to AI systems",
            description:
              "Manage modifications through a process that decides whether each is a substantial modification and documents the rationale",
            order_no: 4,
            summary: "Assess each modification for substantiality",
            questions: [
              "Is there a process to manage modifications?",
              "How is it decided whether a modification is substantial?",
              "Is the rationale for each decision documented?",
            ],
            evidence_examples: [
              "Change control procedure",
              "Substantial modification assessments",
              "Change records",
            ],
          },
          {
            title: "Post-market monitoring",
            description:
              "Establish and document a post-market monitoring system, based on a plan, that runs from placing on the market until retirement and checks whether each AI system continues to meet the essential requirements",
            order_no: 5,
            summary: "Actively monitor AI systems after release",
            questions: [
              "Is there a documented post-market monitoring plan?",
              "Is monitoring active and systematic, covering risks, requirements and performance?",
              "How is usage information collected and kept?",
              "Are logs used to identify emerging hazards and start corrective action?",
              "Where monitoring depends on the deployer, are the requirements in the instructions for use?",
            ],
            evidence_examples: [
              "Post-market monitoring plan",
              "Monitoring reports",
              "Usage data collection procedure",
            ],
          },
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
