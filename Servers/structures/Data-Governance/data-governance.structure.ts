import type { FrameworkStructure } from "../types";

export const dataGovernanceStructure: FrameworkStructure = {
  id: 16,
  key: "data-governance",
  framework_type: "data_governance",
  displayName: "Data Governance Framework",
  tables: {
    l1_struct: "data_governance_domains_struct",
    l2_struct: "data_governance_practices_struct",
    l2_impl: "data_governance_practices",
    l2_risks: "data_governance_practices__risks",
  },
  cols: {
    l2_struct_parent: "domain_id",
    l2_impl_meta: "practice_meta_id",
    l2_risks_impl: "practice_id",
  },
  entity_types: {
    l2_impl: "practice",
  },
  source_labels: {
    practice: "Data Governance practices",
  },
  demo: {
    "Data Governance Council": {
      implementation_description:
        "A data governance council with representation from legal, security, data engineering and the business lines meets monthly, approves standards and records its decisions.",
      auditor_feedback: "Council is chartered and meeting; decisions are minuted.",
    },
    "Data Stewardship": {
      implementation_description:
        "Data stewards are named per domain with documented duties covering definitions, quality thresholds and access decisions for their datasets.",
      auditor_feedback: "Stewards are named for every domain in scope.",
    },
    "Data Ownership": {
      implementation_description:
        "Every registered dataset has an accountable owner recorded in the catalog, and ownership transfers on a documented handover.",
      auditor_feedback: "Ownership is unambiguous; keep it current as teams reorganise.",
    },
    "Data Quality Standards": {
      implementation_description:
        "Quality dimensions and acceptance thresholds — completeness, validity, timeliness and uniqueness — are defined for each critical dataset.",
      auditor_feedback: "Standards are defined with measurable thresholds.",
    },
    "Data Quality Measurement": {
      implementation_description:
        "Automated profiling runs on a schedule against the defined thresholds, and results are published to the owning teams.",
      auditor_feedback: "Measurement is automated; extend coverage beyond the critical datasets.",
    },
    "Data Quality Remediation": {
      implementation_description:
        "Threshold breaches raise tracked remediation tickets with an owner and a response time, and repeat breaches trigger a root-cause review.",
      auditor_feedback: "Remediation is tracked to closure; review the ageing backlog.",
    },
    "Business Glossary": {
      implementation_description:
        "A business glossary holds agreed definitions for shared terms and metrics, each with a steward, and is linked to the matching catalog entries.",
      auditor_feedback: "Glossary is maintained and linked to the catalog.",
    },
    "Data Catalog": {
      implementation_description:
        "The catalog covers critical datasets with ownership, classification, source and refresh metadata, populated by automated harvesting plus steward review.",
      auditor_feedback: "Catalog coverage is good for critical data.",
    },
    "Data Lineage": {
      implementation_description:
        "Lineage is captured from source system through transformation to the consuming model or report, so the inputs behind an AI output can be traced.",
      auditor_feedback: "Lineage is traceable end to end for the flagship pipelines.",
    },
    "Data Retention": {
      implementation_description:
        "A retention schedule sets a period per data category, approved by legal and enforced by policy on the storage platforms.",
      auditor_feedback: "Retention schedule is approved; confirm enforcement on every platform.",
    },
    "Data Archival": {
      implementation_description:
        "Data past its active window moves to an archival tier that preserves classification and access controls, with restores tested periodically.",
      auditor_feedback: "Archival tier preserves controls; restore testing is evidenced.",
    },
    "Data Disposal": {
      implementation_description:
        "Disposal at end of retention is verified and recorded, including disposal by processors, with certificates retained as evidence.",
      auditor_feedback: "Disposal is evidenced; obtain certificates from every processor.",
    },
  },
  seed: {
    name: "Data Governance Framework",
    description: "Framework for implementing enterprise data governance",
    version: "1.0.0",
    is_organizational: true,
    hierarchy: {
      type: "two_level",
      level1_name: "Domain",
      level2_name: "Practice",
    },
    structure: [
      {
        title: "Governance Structure",
        description: "Establish organizational structure for data governance",
        order_no: 1,
        items: [
          {
            title: "Data Governance Council",
            description: "Establish a cross-functional data governance council",
            order_no: 1,
            summary: "Create governance oversight body",
            questions: [
              "Is there a data governance council?",
              "Are key stakeholders represented?",
              "Does the council meet regularly?",
            ],
            evidence_examples: ["Council charter", "Membership list", "Meeting minutes"],
          },
          {
            title: "Data Stewardship",
            description: "Assign data stewards for key data domains",
            order_no: 2,
            summary: "Designate data stewards",
            questions: [
              "Are data stewards assigned?",
              "Are responsibilities documented?",
              "Is there a stewardship community?",
            ],
            evidence_examples: ["Steward assignments", "Role descriptions", "Community records"],
          },
          {
            title: "Data Ownership",
            description: "Define data ownership with clear accountability",
            order_no: 3,
            summary: "Establish data ownership",
            questions: [
              "Are data owners identified?",
              "Are ownership responsibilities clear?",
              "Is ownership aligned with business?",
            ],
            evidence_examples: [
              "Ownership assignments",
              "Responsibility matrix",
              "Business alignment",
            ],
          },
        ],
      },
      {
        title: "Data Quality",
        description: "Establish practices to ensure and improve data quality",
        order_no: 2,
        items: [
          {
            title: "Data Quality Standards",
            description: "Define data quality dimensions and standards",
            order_no: 1,
            summary: "Set data quality expectations",
            questions: [
              "Are quality dimensions defined?",
              "Are quality thresholds set?",
              "Are standards documented?",
            ],
            evidence_examples: ["Quality standards", "Threshold definitions", "Documentation"],
          },
          {
            title: "Data Quality Measurement",
            description: "Implement data quality measurement and monitoring",
            order_no: 2,
            summary: "Measure data quality continuously",
            questions: [
              "Is data quality measured?",
              "Are quality scorecards maintained?",
              "Are trends tracked?",
            ],
            evidence_examples: ["Quality metrics", "Scorecards", "Trend reports"],
          },
          {
            title: "Data Quality Remediation",
            description: "Establish processes to remediate data quality issues",
            order_no: 3,
            summary: "Fix data quality problems",
            questions: [
              "Is there a remediation process?",
              "Are root causes addressed?",
              "Are improvements tracked?",
            ],
            evidence_examples: ["Remediation procedures", "Issue tracking", "Improvement records"],
          },
        ],
      },
      {
        title: "Metadata Management",
        description: "Manage metadata to enable data understanding and use",
        order_no: 3,
        items: [
          {
            title: "Business Glossary",
            description: "Maintain a business glossary with agreed definitions",
            order_no: 1,
            summary: "Define business terms consistently",
            questions: [
              "Is there a business glossary?",
              "Are terms defined clearly?",
              "Is the glossary maintained?",
            ],
            evidence_examples: ["Business glossary", "Term definitions", "Update records"],
          },
          {
            title: "Data Catalog",
            description: "Implement a data catalog for data discovery",
            order_no: 2,
            summary: "Enable data discovery",
            questions: [
              "Is there a data catalog?",
              "Can users discover data?",
              "Is the catalog comprehensive?",
            ],
            evidence_examples: ["Data catalog", "Usage metrics", "Coverage reports"],
          },
          {
            title: "Data Lineage",
            description: "Track data lineage from source to consumption",
            order_no: 3,
            summary: "Understand data flow and transformation",
            questions: [
              "Is data lineage tracked?",
              "Can lineage be visualized?",
              "Is lineage used for impact analysis?",
            ],
            evidence_examples: ["Lineage documentation", "Lineage tools", "Impact analysis"],
          },
        ],
      },
      {
        title: "Data Lifecycle",
        description: "Manage data throughout its lifecycle",
        order_no: 4,
        items: [
          {
            title: "Data Retention",
            description: "Define and enforce data retention policies",
            order_no: 1,
            summary: "Manage data retention appropriately",
            questions: [
              "Are retention policies defined?",
              "Is retention enforced technically?",
              "Are regulatory requirements met?",
            ],
            evidence_examples: ["Retention policy", "Technical controls", "Compliance evidence"],
          },
          {
            title: "Data Archival",
            description: "Archive data appropriately based on access needs",
            order_no: 2,
            summary: "Archive data cost-effectively",
            questions: [
              "Is archival policy defined?",
              "Can archived data be retrieved?",
              "Are costs optimized?",
            ],
            evidence_examples: ["Archival policy", "Retrieval procedures", "Cost analysis"],
          },
          {
            title: "Data Disposal",
            description: "Securely dispose of data when no longer needed",
            order_no: 3,
            summary: "Dispose of data securely",
            questions: [
              "Is disposal policy defined?",
              "Is disposal secure and verified?",
              "Are disposal records maintained?",
            ],
            evidence_examples: ["Disposal policy", "Verification records", "Disposal certificates"],
          },
        ],
      },
    ],
  },
};

export default dataGovernanceStructure;
