import type { FrameworkStructure } from "../types";

export const uaePdplStructure: FrameworkStructure = {
  id: 17,
  key: "uae-pdpl",
  framework_type: "uae_pdpl",
  displayName: "UAE Personal Data Protection Law",
  tables: {
    l1_struct: "uae_pdpl_chapters_struct",
    l2_struct: "uae_pdpl_articles_struct",
    l2_impl: "uae_pdpl_articles",
    l2_risks: "uae_pdpl_articles__risks",
  },
  cols: {
    l2_struct_parent: "chapter_id",
    l2_impl_meta: "article_meta_id",
    l2_risks_impl: "article_id",
  },
  entity_types: {
    l2_impl: "article",
  },
  source_labels: {
    article: "UAE PDPL articles",
  },
  seed: {
    name: "UAE Personal Data Protection Law",
    description:
      "Framework for compliance with UAE PDPL 45/2021, DIFC Regulation 10, and AI Ethics Charter (2024)",
    version: "1.0.0",
    is_organizational: true,
    hierarchy: {
      type: "two_level",
      level1_name: "Chapter",
      level2_name: "Article",
    },
    structure: [
      {
        title: "Chapter 1: General Provisions",
        description: "Definitions, scope, and applicability of PDPL 45/2021",
        order_no: 1,
        items: [
          {
            title: "Article 1 - Definitions",
            description:
              "Key definitions including personal data, sensitive data, data controller, data processor, and consent",
            order_no: 1,
            summary: "Establish clear definitions for UAE data protection terms",
            questions: [
              "Are all personal data types identified per UAE PDPL?",
              "Is sensitive data clearly categorized?",
              "Are data controller/processor roles defined?",
            ],
            evidence_examples: [
              "Data classification policy aligned with UAE PDPL",
              "Roles and responsibilities matrix",
              "Data inventory documentation",
            ],
          },
          {
            title: "Article 2 - Territorial Scope",
            description:
              "Law applies to processing within UAE and to UAE residents' data processed abroad",
            order_no: 2,
            summary: "Define territorial and extraterritorial application",
            questions: [
              "Is data processing within UAE documented?",
              "Are extraterritorial processing activities identified?",
              "Are exemptions properly applied?",
            ],
            evidence_examples: [
              "Data processing inventory",
              "Territorial scope assessment",
              "Exemption justification records",
            ],
          },
          {
            title: "Article 3 - Data Office Authority",
            description: "The UAE Data Office oversees compliance and enforcement",
            order_no: 3,
            summary: "Understand regulatory oversight structure",
            questions: [
              "Is the Data Office relationship established?",
              "Are reporting requirements understood?",
              "Is communication channel maintained?",
            ],
            evidence_examples: [
              "Data Office registration",
              "Reporting schedule",
              "Communication records",
            ],
          },
        ],
      },
      {
        title: "Chapter 2: Data Processing Principles",
        description: "Core principles governing personal data processing under UAE PDPL",
        order_no: 2,
        items: [
          {
            title: "Article 4 - Lawfulness of Processing",
            description:
              "Personal data must be processed based on lawful grounds including consent",
            order_no: 1,
            summary: "Ensure lawful basis for all processing",
            questions: [
              "Is lawful basis documented for each processing activity?",
              "Is consent obtained where required?",
              "Are legitimate interest assessments conducted?",
            ],
            evidence_examples: [
              "Lawful basis register",
              "Consent records",
              "Legitimate interest assessments",
            ],
          },
          {
            title: "Article 5 - Purpose Limitation",
            description: "Data must be collected for specified, explicit, and legitimate purposes",
            order_no: 2,
            summary: "Limit processing to specified purposes",
            questions: [
              "Are purposes clearly defined and documented?",
              "Is further processing compatible with original purpose?",
              "Are purpose changes communicated to data subjects?",
            ],
            evidence_examples: [
              "Purpose specification documents",
              "Compatibility assessments",
              "Data subject notifications",
            ],
          },
          {
            title: "Article 6 - Data Minimization",
            description: "Only collect data adequate, relevant, and necessary for the purpose",
            order_no: 3,
            summary: "Minimize data collection",
            questions: [
              "Is data collection limited to necessity?",
              "Are unnecessary data fields removed?",
              "Is periodic review conducted?",
            ],
            evidence_examples: [
              "Data minimization assessment",
              "Data field review records",
              "Collection justification",
            ],
          },
          {
            title: "Article 7 - Accuracy",
            description: "Personal data must be accurate and kept up to date",
            order_no: 4,
            summary: "Maintain data accuracy",
            questions: [
              "Are accuracy procedures in place?",
              "Can data subjects update their data?",
              "Is inaccurate data corrected promptly?",
            ],
            evidence_examples: ["Data quality procedures", "Update mechanisms", "Correction logs"],
          },
          {
            title: "Article 8 - Storage Limitation",
            description: "Data must not be kept longer than necessary for the purpose",
            order_no: 5,
            summary: "Implement retention limits",
            questions: [
              "Are retention periods defined?",
              "Is data deleted when no longer needed?",
              "Are retention schedules enforced?",
            ],
            evidence_examples: ["Retention policy", "Deletion logs", "Retention schedule"],
          },
          {
            title: "Article 9 - Security Measures",
            description: "Appropriate technical and organizational security measures required",
            order_no: 6,
            summary: "Implement security safeguards",
            questions: [
              "Are technical security measures implemented?",
              "Are organizational measures in place?",
              "Is access appropriately controlled?",
            ],
            evidence_examples: [
              "Security policy",
              "Technical controls documentation",
              "Access control matrix",
            ],
          },
        ],
      },
      {
        title: "Chapter 3: Data Subject Rights",
        description: "Rights granted to individuals under UAE PDPL",
        order_no: 3,
        items: [
          {
            title: "Article 10 - Right to Information",
            description: "Data subjects must be informed about processing of their data",
            order_no: 1,
            summary: "Provide transparent information",
            questions: [
              "Are privacy notices provided in Arabic and English?",
              "Is information clear and accessible?",
              "Are all required disclosures made?",
            ],
            evidence_examples: [
              "Privacy notices (Arabic/English)",
              "Information provision procedures",
              "Disclosure checklists",
            ],
          },
          {
            title: "Article 11 - Right of Access",
            description: "Data subjects can request access to their personal data",
            order_no: 2,
            summary: "Enable access requests",
            questions: [
              "Is access request process established?",
              "Are requests handled within legal timeframe?",
              "Is data provided in accessible format?",
            ],
            evidence_examples: [
              "Access request procedure",
              "Request handling logs",
              "Response templates",
            ],
          },
          {
            title: "Article 12 - Right to Rectification",
            description: "Data subjects can correct inaccurate or incomplete data",
            order_no: 3,
            summary: "Enable data correction",
            questions: [
              "Can data subjects request corrections?",
              "Are corrections made promptly?",
              "Are third parties notified?",
            ],
            evidence_examples: [
              "Rectification procedure",
              "Correction logs",
              "Third-party notification records",
            ],
          },
          {
            title: "Article 13 - Right to Erasure",
            description: "Data subjects can request deletion of their data",
            order_no: 4,
            summary: "Enable data deletion",
            questions: [
              "Is erasure request process established?",
              "Are deletion criteria documented?",
              "Is data deleted from all systems?",
            ],
            evidence_examples: [
              "Erasure procedure",
              "Deletion verification",
              "System deletion logs",
            ],
          },
          {
            title: "Article 14 - Right to Restrict Processing",
            description: "Data subjects can request restriction of processing",
            order_no: 5,
            summary: "Handle restriction requests",
            questions: [
              "Can processing be restricted on request?",
              "Are restriction criteria understood?",
              "Is restricted data properly marked?",
            ],
            evidence_examples: [
              "Restriction procedure",
              "Restricted data register",
              "Processing limitation records",
            ],
          },
          {
            title: "Article 15 - Right to Data Portability",
            description: "Data subjects can receive their data in portable format",
            order_no: 6,
            summary: "Enable data portability",
            questions: [
              "Can data be exported in machine-readable format?",
              "Is direct transfer to other controllers supported?",
              "Are portability requests handled timely?",
            ],
            evidence_examples: [
              "Portability procedure",
              "Export format documentation",
              "Transfer records",
            ],
          },
        ],
      },
      {
        title: "Chapter 4: DIFC Regulation 10",
        description: "Additional requirements for DIFC-regulated entities",
        order_no: 4,
        items: [
          {
            title: "Article 16 - DIFC Data Protection Officer",
            description: "DIFC entities must appoint a Data Protection Officer",
            order_no: 1,
            summary: "Appoint and register DPO with DIFC",
            questions: [
              "Is DPO appointed for DIFC operations?",
              "Is DPO registered with Commissioner?",
              "Does DPO have adequate resources?",
            ],
            evidence_examples: [
              "DPO appointment letter",
              "DIFC registration confirmation",
              "DPO resource allocation",
            ],
          },
          {
            title: "Article 17 - DIFC Registration",
            description: "Controllers must register with DIFC Commissioner of Data Protection",
            order_no: 2,
            summary: "Register data processing with DIFC",
            questions: [
              "Is registration with Commissioner complete?",
              "Are processing activities disclosed?",
              "Is registration kept up to date?",
            ],
            evidence_examples: [
              "DIFC registration certificate",
              "Processing notification",
              "Registration updates",
            ],
          },
          {
            title: "Article 18 - DIFC Cross-Border Transfers",
            description: "Special requirements for transfers from DIFC",
            order_no: 3,
            summary: "Comply with DIFC transfer requirements",
            questions: [
              "Are DIFC-specific transfer rules followed?",
              "Are adequate safeguards implemented?",
              "Is Commissioner approval obtained where required?",
            ],
            evidence_examples: [
              "Transfer impact assessments",
              "DIFC-approved contracts",
              "Commissioner approvals",
            ],
          },
        ],
      },
      {
        title: "Chapter 5: Cross-Border Transfers",
        description: "Requirements for transferring data outside UAE",
        order_no: 5,
        items: [
          {
            title: "Article 19 - Transfer Conditions",
            description: "Data transfers outside UAE require adequate protection",
            order_no: 1,
            summary: "Control international data transfers",
            questions: [
              "Are all cross-border transfers identified?",
              "Is adequate protection ensured?",
              "Are transfer mechanisms documented?",
            ],
            evidence_examples: [
              "Transfer inventory",
              "Adequacy assessments",
              "Transfer mechanism documentation",
            ],
          },
          {
            title: "Article 20 - Approved Jurisdictions",
            description: "Transfers to jurisdictions with adequate protection levels",
            order_no: 2,
            summary: "Identify approved transfer destinations",
            questions: [
              "Are transfers limited to adequate jurisdictions?",
              "Is adequacy list maintained?",
              "Are non-adequate transfers justified?",
            ],
            evidence_examples: [
              "Approved jurisdiction list",
              "Adequacy determinations",
              "Exception documentation",
            ],
          },
          {
            title: "Article 21 - Standard Contractual Clauses",
            description: "Use of approved contractual clauses for transfers",
            order_no: 3,
            summary: "Implement contractual safeguards",
            questions: [
              "Are UAE-approved SCCs used?",
              "Are contracts with processors adequate?",
              "Are transfer agreements reviewed?",
            ],
            evidence_examples: ["Signed SCCs", "Data processing agreements", "Contract reviews"],
          },
        ],
      },
      {
        title: "Chapter 6: AI Ethics Charter (2024)",
        description: "UAE AI Ethics requirements for responsible AI deployment",
        order_no: 6,
        items: [
          {
            title: "Article 22 - AI Transparency",
            description: "AI systems must be transparent and explainable",
            order_no: 1,
            summary: "Ensure AI system transparency",
            questions: [
              "Are AI systems documented?",
              "Is decision logic explainable?",
              "Are users informed of AI involvement?",
            ],
            evidence_examples: [
              "AI system documentation",
              "Explainability reports",
              "AI disclosure notices",
            ],
          },
          {
            title: "Article 23 - AI Fairness",
            description: "AI systems must be fair and non-discriminatory",
            order_no: 2,
            summary: "Prevent AI bias and discrimination",
            questions: [
              "Are bias assessments conducted?",
              "Is fairness testing performed?",
              "Are discrimination risks mitigated?",
            ],
            evidence_examples: [
              "Bias assessment reports",
              "Fairness testing results",
              "Mitigation documentation",
            ],
          },
          {
            title: "Article 24 - AI Accountability",
            description: "Clear accountability for AI system outcomes",
            order_no: 3,
            summary: "Establish AI accountability",
            questions: [
              "Is AI governance structure defined?",
              "Are responsibilities assigned?",
              "Is human oversight maintained?",
            ],
            evidence_examples: [
              "AI governance framework",
              "RACI matrix for AI",
              "Human oversight procedures",
            ],
          },
          {
            title: "Article 25 - AI Safety",
            description: "AI systems must be safe and secure",
            order_no: 4,
            summary: "Ensure AI safety and security",
            questions: [
              "Are AI safety assessments conducted?",
              "Are security measures implemented?",
              "Are failure modes addressed?",
            ],
            evidence_examples: [
              "AI safety assessments",
              "Security controls documentation",
              "Failure mode analysis",
            ],
          },
          {
            title: "Article 26 - AI Privacy",
            description: "AI systems must protect personal data privacy",
            order_no: 5,
            summary: "Protect privacy in AI systems",
            questions: [
              "Is data minimization applied to AI training?",
              "Are privacy-enhancing technologies used?",
              "Is AI processing PDPL-compliant?",
            ],
            evidence_examples: [
              "AI privacy assessment",
              "PET implementation records",
              "PDPL compliance for AI",
            ],
          },
        ],
      },
      {
        title: "Chapter 7: Enforcement and Penalties",
        description: "Regulatory enforcement and penalty provisions",
        order_no: 7,
        items: [
          {
            title: "Article 27 - Breach Notification",
            description: "Data breaches must be notified to Data Office and affected individuals",
            order_no: 1,
            summary: "Implement breach notification procedures",
            questions: [
              "Is breach detection capability in place?",
              "Can notification be made within 72 hours?",
              "Are affected individuals notified?",
            ],
            evidence_examples: [
              "Breach response plan",
              "Notification templates",
              "Breach register",
            ],
          },
          {
            title: "Article 28 - Data Office Audits",
            description: "Data Office may conduct compliance audits",
            order_no: 2,
            summary: "Prepare for regulatory audits",
            questions: [
              "Is audit readiness maintained?",
              "Are records available for inspection?",
              "Is cooperation with auditors ensured?",
            ],
            evidence_examples: [
              "Audit readiness checklist",
              "Document retention policy",
              "Previous audit records",
            ],
          },
          {
            title: "Article 29 - Public Tender Exclusions",
            description: "Non-compliance may result in exclusion from public tenders",
            order_no: 3,
            summary: "Understand tender exclusion risks",
            questions: [
              "Is compliance status documented?",
              "Are public tender requirements understood?",
              "Is compliance certificate available?",
            ],
            evidence_examples: [
              "Compliance attestation",
              "Tender compliance records",
              "Data Office certification",
            ],
          },
          {
            title: "Article 30 - Administrative Penalties",
            description: "Violations may result in fines and sanctions",
            order_no: 4,
            summary: "Understand penalty provisions",
            questions: [
              "Are penalty provisions understood?",
              "Are high-risk areas addressed?",
              "Is legal counsel engaged?",
            ],
            evidence_examples: [
              "Penalty risk assessment",
              "Compliance gap remediation",
              "Legal review documentation",
            ],
          },
        ],
      },
    ],
  },
};

export default uaePdplStructure;
