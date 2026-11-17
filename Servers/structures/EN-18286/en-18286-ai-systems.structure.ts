import type { FrameworkStructure } from "../types";

export const en18286AiSystemsStructure: FrameworkStructure = {
  id: 27,
  key: "en-18286-ai-systems",
  framework_type: "en_18286_ai_systems",
  displayName: "EN 18286 AI systems",
  tables: {
    l1_struct: "en_18286_ai_systems_clauses_struct",
    l2_struct: "en_18286_ai_systems_requirements_struct",
    l2_impl: "en_18286_ai_systems_requirements",
    l2_risks: "en_18286_ai_systems_requirements__risks",
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
    requirement: "EN 18286 AI systems requirements",
  },
  seed: {
    name: "EN 18286 AI systems",
    description:
      "AI system-level clauses of EN 18286:2026 (life cycle, operations and post-market monitoring), applied to each high-risk AI system in the QMS scope",
    version: "2026",
    is_organizational: false,
    hierarchy: {
      type: "two_level",
      level1_name: "Clause",
      level2_name: "Requirement",
    },
    structure: [
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
          "Control AI systems placed on the market or put into service, including support, supply chain, modifications and post-market monitoring",
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
        ],
      },
    ],
  },
};

export default en18286AiSystemsStructure;
