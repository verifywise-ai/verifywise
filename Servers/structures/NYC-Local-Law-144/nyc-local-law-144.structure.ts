import type { FrameworkStructure } from "../types";

export const nycLocalLaw144Structure: FrameworkStructure = {
  id: 12,
  key: "nyc-local-law-144",
  framework_type: "nyc_local_law_144",
  displayName: "NYC Local Law 144 - Automated Employment Decision Tools",
  tables: {
    l1_struct: "nyc_local_law_144_compliance_areas_struct",
    l2_struct: "nyc_local_law_144_requirements_struct",
    l2_impl: "nyc_local_law_144_requirements",
    l2_risks: "nyc_local_law_144_requirements__risks",
  },
  cols: {
    l2_struct_parent: "compliance_area_id",
    l2_impl_meta: "requirement_meta_id",
    l2_risks_impl: "requirement_id",
  },
  entity_types: {
    l2_impl: "requirement",
  },
  source_labels: {
    requirement: "NYC Local Law 144 requirements",
  },
  seed: {
    name: "NYC Local Law 144 - Automated Employment Decision Tools",
    description:
      "New York City Local Law 144 compliance framework for automated employment decision tools (AEDTs) requiring bias audits and candidate notifications.",
    version: "1.0.0",
    is_organizational: false,
    hierarchy: {
      type: "two_level",
      level1_name: "Compliance Area",
      level2_name: "Requirement",
    },
    structure: [
      {
        title: "AEDT Classification & Scope",
        description: "Requirements for determining AEDT applicability under NYC Local Law 144",
        order_no: 1,
        items: [
          {
            title: "AEDT Applicability Determination",
            order_no: 1,
            summary:
              "The organization must determine whether any tool used in hiring or promotion qualifies as an Automated Employment Decision Tool (AEDT) under NYC Local Law 144.",
            questions: [
              "Is the tool a computational process derived from machine learning, statistical modeling, data analytics, or AI?",
              "Does the tool issue a simplified output (score, classification, or recommendation)?",
              "Is the output used to substantially assist or replace discretionary decision making in hiring or promotion?",
            ],
            evidence_examples: [
              "Internal AEDT classification register",
              "Tool assessment documentation",
              "Vendor capability statements",
            ],
          },
        ],
      },
      {
        title: "Bias Audit Requirements",
        description: "Independent bias audit requirements for AEDTs",
        order_no: 2,
        items: [
          {
            title: "Independent Annual Bias Audit",
            order_no: 1,
            summary:
              "Each AEDT must undergo an independent bias audit before use and at least once annually.",
            questions: [
              "Is the audit conducted by an independent third party?",
              "Is the auditor uninvolved in developing or distributing the tool?",
              "Does the audit evaluate disparate impact across legally protected categories?",
              "Does the audit calculate selection rates and impact ratios?",
              "Does the audit use historical or test data consistent with DCWP rules?",
            ],
            evidence_examples: [
              "Signed bias audit report",
              "Auditor independence declaration",
              "Audit methodology documentation",
            ],
          },
          {
            title: "Bias Audit Publication",
            order_no: 2,
            summary:
              "A summary of the most recent bias audit must be publicly available prior to AEDT use.",
            questions: [
              "Is the summary posted on the employer or vendor website?",
              "Does the summary include the audit date?",
              "Does the summary include the distribution date of the AEDT?",
              "Does the summary include selection rates and impact ratios?",
              "Will the summary remain publicly accessible for at least 6 months?",
            ],
            evidence_examples: [
              "Public audit summary URL",
              "Website archive snapshot",
              "Publication timestamp records",
            ],
          },
        ],
      },
      {
        title: "Candidate Notice & Transparency",
        description: "Requirements for notifying candidates about AEDT use",
        order_no: 3,
        items: [
          {
            title: "Advance Candidate Notice",
            order_no: 1,
            summary:
              "Candidates and employees must receive notice at least 10 business days before AEDT use.",
            questions: [
              "Does the notice inform that an AEDT will be used?",
              "Does the notice describe job qualifications assessed?",
              "Does the notice describe characteristics evaluated?",
              "Does the notice provide instructions for requesting an alternative process or accommodation?",
            ],
            evidence_examples: [
              "Notice templates",
              "Candidate notification logs",
              "HR communication records",
            ],
          },
          {
            title: "Data Use Disclosure",
            order_no: 2,
            summary:
              "The organization must disclose the type of data collected and the source of that data.",
            questions: [
              "Does the disclosure describe input data categories?",
              "Does the disclosure identify data sources?",
              "Is the disclosure accessible to candidates upon request?",
              "Is the disclosure available publicly if not provided individually?",
            ],
            evidence_examples: [
              "Data transparency policy",
              "Candidate disclosure documents",
              "Public privacy statement",
            ],
          },
          {
            title: "Data Retention Disclosure",
            order_no: 3,
            summary: "The organization must disclose its AEDT data retention policy.",
            questions: [
              "Is the retention duration stated?",
              "Are deletion practices described?",
              "Is the retention policy available to candidates?",
            ],
            evidence_examples: [
              "Data retention policy",
              "Internal retention schedules",
              "Privacy governance documentation",
            ],
          },
        ],
      },
      {
        title: "Alternative Selection & Accommodations",
        description: "Requirements for providing alternative evaluation processes",
        order_no: 4,
        items: [
          {
            title: "Alternative Selection Process",
            order_no: 1,
            summary:
              "Candidates must be allowed to request an alternative evaluation process or reasonable accommodation.",
            questions: [
              "Are clear instructions provided for requesting alternatives?",
              "Are requests processed in a timely manner?",
              "Is there protection against retaliation or disadvantage for requesting alternatives?",
            ],
            evidence_examples: [
              "Accommodation request workflow",
              "Case handling logs",
              "HR escalation procedures",
            ],
          },
        ],
      },
      {
        title: "Documentation & Record Keeping",
        description: "Record retention requirements for compliance demonstration",
        order_no: 5,
        items: [
          {
            title: "Record Retention",
            order_no: 1,
            summary: "The organization must retain documentation demonstrating compliance.",
            questions: [
              "Are bias audits retained?",
              "Are notice records retained?",
              "Is disclosure evidence retained?",
              "Does retention support regulatory inspection?",
            ],
            evidence_examples: [
              "Compliance archive repository",
              "Audit document storage",
              "Retention logs",
            ],
          },
        ],
      },
      {
        title: "Vendor Management",
        description: "Requirements for vendor-supplied AEDTs",
        order_no: 6,
        items: [
          {
            title: "Vendor Responsibility Allocation",
            order_no: 1,
            summary:
              "Responsibility for compliance must be defined when AEDTs are vendor supplied.",
            questions: [
              "Do contracts allocate audit responsibility?",
              "Is audit publication responsibility assigned?",
              "Does the employer retain responsibility for candidate notice?",
            ],
            evidence_examples: [
              "Vendor contracts",
              "Service level agreements",
              "Compliance responsibility matrix",
            ],
          },
        ],
      },
      {
        title: "Pre-Deployment Compliance",
        description: "Verification requirements before AEDT deployment",
        order_no: 7,
        items: [
          {
            title: "Pre-Use Compliance Verification",
            order_no: 1,
            summary: "No AEDT may be used unless all Local Law 144 obligations are satisfied.",
            questions: [
              "Is the bias audit completed?",
              "Is the audit summary published?",
              "Is the candidate notice process operational?",
            ],
            evidence_examples: [
              "Compliance checklist",
              "Deployment approval records",
              "Legal sign-off",
            ],
          },
        ],
      },
    ],
  },
};

export default nycLocalLaw144Structure;
