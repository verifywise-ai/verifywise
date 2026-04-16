/**
 * Master Controls — Recommended Cross-Framework Mapping Seeds.
 *
 * This file powers the "Import recommended mappings" action on the Controls
 * Hub empty state. Each entry represents a **master control** owned by an
 * organisation plus the list of framework requirements it typically satisfies.
 *
 * At seed time, the loader (`POST /master-controls/seed-recommended`, T-027)
 * resolves every `framework_code` below to the actual
 * `framework_entity_id` in the current organisation's framework tables
 * (controls_eu, subcontrols_eu, subclause_struct_iso, annex_categories_iso,
 *  subcategory_nist, iso27001_subclauses, iso27001_annex_categories).
 *
 * Codes are intentionally human-readable so they match what the framework
 * seed files already expose (e.g. EU AI Act Article numbers, ISO clause
 * numbers, NIST function-subcategory IDs). Unresolved codes are logged as
 * warnings and skipped — the seed action still succeeds.
 *
 * Source of overlaps: Enzai competitive analysis, NIST AI RMF ⇄ ISO 42001
 * crosswalk (NIST AI 600-1 Appendix A), and the official EU AI Act ⇄
 * ISO 42001 mapping published alongside the standard.
 */

import type {
  Framework,
  FrameworkEntityType,
} from "../../domain.layer/interfaces/i.masterControlMapping";
import type { MasterControlStatus } from "../../domain.layer/interfaces/i.masterControl";

export interface MasterControlSeedMapping {
  framework: Framework;
  framework_entity_type: FrameworkEntityType;
  /**
   * Human-readable identifier resolved to an ID by the seed loader.
   * Examples:
   *   - "EU AI Act Article 9"             (framework = eu_ai_act,  entity = control_eu)
   *   - "EU AI Act Article 15.3"          (framework = eu_ai_act,  entity = subcontrol_eu)
   *   - "ISO 42001 Clause 6.1.2"          (framework = iso_42001,  entity = subclause_struct_iso)
   *   - "ISO 42001 Annex A.7.4"           (framework = iso_42001,  entity = annex_category_iso)
   *   - "NIST GOVERN-1.1"                 (framework = nist_ai_rmf, entity = subcategory_nist)
   *   - "ISO 27001 Clause 9.2"            (framework = iso_27001,  entity = iso27001_subclause)
   *   - "ISO 27001 Annex A.5.15"          (framework = iso_27001,  entity = iso27001_annex_category)
   */
  framework_code: string;
}

export interface MasterControlSeed {
  title: string;
  description: string;
  status?: MasterControlStatus;
  mappings: MasterControlSeedMapping[];
}

export const RECOMMENDED_MASTER_CONTROLS: MasterControlSeed[] = [
  {
    title: "Risk Management System",
    description:
      "Establish, implement, document and maintain a continuous risk management process that identifies, evaluates, and mitigates risks of AI systems throughout their lifecycle.",
    status: "Waiting",
    mappings: [
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 9" },
      { framework: "iso_42001", framework_entity_type: "subclause_struct_iso", framework_code: "ISO 42001 Clause 6.1.2" },
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.5.2" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST GOVERN-1.1" },
      { framework: "iso_27001", framework_entity_type: "iso27001_subclause", framework_code: "ISO 27001 Clause 6.1.2" },
    ],
  },
  {
    title: "Data Governance",
    description:
      "Define and enforce rules for the collection, quality, labelling, retention, and use of data powering AI systems, covering bias detection and data-subject rights.",
    mappings: [
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 10" },
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.7.3" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST MAP-4.1" },
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.5.12" },
    ],
  },
  {
    title: "Access Control — Principle of Least Privilege",
    description:
      "Ensure only authorised individuals and services access AI systems, model artefacts, training data, and deployment infrastructure.",
    mappings: [
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.5.15" },
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.8.3" },
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.7.4" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST GOVERN-6.1" },
    ],
  },
  {
    title: "Human Oversight",
    description:
      "Design AI systems so natural persons can effectively oversee their operation, detect anomalies, and intervene or stop the system when needed.",
    mappings: [
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 14" },
      { framework: "iso_42001", framework_entity_type: "subclause_struct_iso", framework_code: "ISO 42001 Clause 9.1" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST MANAGE-2.3" },
    ],
  },
  {
    title: "Transparency & Information to Users",
    description:
      "Provide clear, accessible information to users of AI systems about capabilities, limitations, intended purpose, and known risks.",
    mappings: [
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 13" },
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 50" },
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.8.2" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST GOVERN-1.4" },
    ],
  },
  {
    title: "Technical Documentation",
    description:
      "Produce and maintain technical documentation describing the design, development, testing, and deployment of high-risk AI systems.",
    mappings: [
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 11" },
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.6.2.4" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST MAP-3.1" },
    ],
  },
  {
    title: "Record Keeping & Logging",
    description:
      "Automatically log events produced by AI systems so incidents can be reconstructed and post-market monitoring obligations met.",
    mappings: [
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 12" },
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.6.2.8" },
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.8.15" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST MEASURE-2.4" },
    ],
  },
  {
    title: "Post-Market Monitoring",
    description:
      "Define and operate a post-market monitoring plan to proactively collect and analyse data about AI system performance once deployed.",
    mappings: [
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 72" },
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.6.2.6" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST MEASURE-2.4" },
    ],
  },
  {
    title: "Incident Reporting & Response",
    description:
      "Detect, document, respond to, and — where required — notify authorities of serious incidents involving AI systems.",
    mappings: [
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 73" },
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.5.24" },
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.5.25" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST MANAGE-4.1" },
    ],
  },
  {
    title: "Supplier & Third-Party Management",
    description:
      "Evaluate, onboard, and continuously monitor providers of AI components, datasets, models, and services to ensure contractual and regulatory alignment.",
    mappings: [
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.10.3" },
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.5.19" },
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.5.20" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST MANAGE-3.1" },
    ],
  },
  {
    title: "AI Policy & Governance",
    description:
      "Publish and maintain an AI-specific policy aligned with organisational objectives, roles, and risk appetite.",
    mappings: [
      { framework: "iso_42001", framework_entity_type: "subclause_struct_iso", framework_code: "ISO 42001 Clause 5.2" },
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.2.2" },
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.5.1" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST GOVERN-1.2" },
    ],
  },
  {
    title: "AI Literacy & Training",
    description:
      "Ensure staff, contractors, and affected parties have sufficient AI literacy — proportional to their role — to use AI systems responsibly.",
    mappings: [
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 4" },
      { framework: "iso_42001", framework_entity_type: "subclause_struct_iso", framework_code: "ISO 42001 Clause 7.2" },
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.6.3" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST GOVERN-4.1" },
    ],
  },
  {
    title: "Internal Audit",
    description:
      "Conduct planned internal audits to verify conformance with the AI management system and identify opportunities for improvement.",
    mappings: [
      { framework: "iso_42001", framework_entity_type: "subclause_struct_iso", framework_code: "ISO 42001 Clause 9.2" },
      { framework: "iso_27001", framework_entity_type: "iso27001_subclause", framework_code: "ISO 27001 Clause 9.2" },
    ],
  },
  {
    title: "Management Review",
    description:
      "Top management reviews the AI management system at planned intervals to ensure continuing suitability, adequacy, and effectiveness.",
    mappings: [
      { framework: "iso_42001", framework_entity_type: "subclause_struct_iso", framework_code: "ISO 42001 Clause 9.3" },
      { framework: "iso_27001", framework_entity_type: "iso27001_subclause", framework_code: "ISO 27001 Clause 9.3" },
    ],
  },
  {
    title: "Corrective Action & Continuous Improvement",
    description:
      "React to non-conformities, analyse root causes, implement corrective actions, and continually improve the AI management system.",
    mappings: [
      { framework: "iso_42001", framework_entity_type: "subclause_struct_iso", framework_code: "ISO 42001 Clause 10.2" },
      { framework: "iso_27001", framework_entity_type: "iso27001_subclause", framework_code: "ISO 27001 Clause 10.1" },
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 20" },
    ],
  },
  {
    title: "AI System Classification & Impact Assessment",
    description:
      "Classify AI systems by risk and intended purpose; perform impact assessments for high-risk or consequential systems.",
    mappings: [
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 6" },
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.5.3" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST MAP-1.1" },
    ],
  },
  {
    title: "Accuracy, Robustness & Cybersecurity",
    description:
      "Design, test, and monitor AI systems for appropriate levels of accuracy, robustness to adversarial input, and cybersecurity throughout the lifecycle.",
    mappings: [
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 15" },
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.6.2.2" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST MEASURE-2.7" },
    ],
  },
  {
    title: "Bias & Fairness Evaluation",
    description:
      "Identify, measure, document, and mitigate potential bias in training data, models, and AI outcomes.",
    mappings: [
      { framework: "eu_ai_act", framework_entity_type: "subcontrol_eu", framework_code: "EU AI Act Article 10.3" },
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.7.2" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST MEASURE-2.11" },
    ],
  },
  {
    title: "Conformity Assessment",
    description:
      "Before placing a high-risk AI system on the market, carry out the conformity assessment procedures required by the applicable regulation.",
    mappings: [
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 43" },
      { framework: "iso_42001", framework_entity_type: "subclause_struct_iso", framework_code: "ISO 42001 Clause 9.2" },
    ],
  },
  {
    title: "Registration of High-Risk AI Systems",
    description:
      "Register high-risk AI systems in the EU database before placing them on the market or putting them into service.",
    mappings: [
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 49" },
      { framework: "eu_ai_act", framework_entity_type: "control_eu", framework_code: "EU AI Act Article 71" },
    ],
  },
  {
    title: "Asset Management",
    description:
      "Identify and manage information assets — including datasets, models, and infrastructure — associated with AI systems, with assigned owners and protection levels.",
    mappings: [
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.5.9" },
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.4.2" },
    ],
  },
  {
    title: "Cryptography & Secure Communications",
    description:
      "Protect data at rest and in transit — including model weights and inference payloads — using cryptographic controls aligned with organisational policy.",
    mappings: [
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.8.24" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST GOVERN-6.2" },
    ],
  },
  {
    title: "Change Management",
    description:
      "Plan, test, and control changes to AI systems, models, and supporting infrastructure to avoid unintended consequences.",
    mappings: [
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.8.32" },
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.6.2.5" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST MANAGE-2.2" },
    ],
  },
  {
    title: "Business Continuity for AI Systems",
    description:
      "Maintain recovery, redundancy, and backup capabilities so critical AI services can be restored within agreed objectives after disruption.",
    mappings: [
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.5.29" },
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.5.30" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST MANAGE-4.3" },
    ],
  },
  {
    title: "Privacy & Protection of Personal Data",
    description:
      "Process personal data used by AI systems in line with privacy principles, legal bases, and data subject rights.",
    mappings: [
      { framework: "iso_27001", framework_entity_type: "iso27001_annex_category", framework_code: "ISO 27001 Annex A.5.34" },
      { framework: "iso_42001", framework_entity_type: "annex_category_iso", framework_code: "ISO 42001 Annex A.7.5" },
      { framework: "nist_ai_rmf", framework_entity_type: "subcategory_nist", framework_code: "NIST GOVERN-1.6" },
    ],
  },
];

/** Total count exposed for tests / UI telemetry. */
export const RECOMMENDED_MASTER_CONTROLS_COUNT =
  RECOMMENDED_MASTER_CONTROLS.length;
