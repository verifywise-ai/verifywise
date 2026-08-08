import type { FrameworkStructure } from "../types";

export const bahrainPdplStructure: FrameworkStructure = {
  id: 20,
  key: "bahrain-pdpl",
  framework_type: "bahrain_pdpl",
  displayName: "Bahrain Personal Data Protection Law",
  tables: {
    "l1_struct": "bahrain_pdpl_chapters_struct",
    "l2_struct": "bahrain_pdpl_articles_struct",
    "l2_impl": "bahrain_pdpl_articles",
    "l2_risks": "bahrain_pdpl_articles__risks"
  },
  cols: {
    "l2_struct_parent": "chapter_id",
    "l2_impl_meta": "article_meta_id",
    "l2_risks_impl": "article_id"
  },
  entity_types: {
    "l2_impl": "article"
  },
  source_labels: {
    "article": "Bahrain PDPL articles"
  },
  seed: {
    "name": "Bahrain Personal Data Protection Law",
    "description": "Framework for compliance with Bahrain PDPL 30/2018, Central Bank of Bahrain AI Notice (2023), and EDB AI Ethics Pledge",
    "version": "1.0.0",
    "is_organizational": true,
    "hierarchy": {
      "type": "two_level",
      "level1_name": "Chapter",
      "level2_name": "Article"
    },
    "structure": [
      {
        "title": "Chapter 1: General Provisions",
        "description": "Definitions, scope, and applicability of Bahrain PDPL 30/2018",
        "order_no": 1,
        "items": [
          {
            "title": "Article 1 - Definitions",
            "description": "Key definitions including personal data, sensitive data, data controller, data processor, and consent under Bahrain PDPL",
            "order_no": 1,
            "summary": "Establish definitions for Bahrain data protection terms",
            "questions": [
              "Are all personal data types identified per Bahrain PDPL?",
              "Is sensitive data clearly categorized?",
              "Are data controller/processor roles defined?"
            ],
            "evidence_examples": [
              "Data classification policy aligned with Bahrain PDPL",
              "Roles and responsibilities matrix",
              "Data inventory documentation"
            ]
          },
          {
            "title": "Article 2 - Territorial Scope",
            "description": "Law applies to processing within Bahrain and to Bahraini residents' data",
            "order_no": 2,
            "summary": "Define territorial and extraterritorial application",
            "questions": [
              "Is data processing within Bahrain documented?",
              "Are extraterritorial processing activities identified?",
              "Are exemptions properly applied?"
            ],
            "evidence_examples": [
              "Data processing inventory",
              "Territorial scope assessment",
              "Exemption justification records"
            ]
          },
          {
            "title": "Article 3 - Personal Data Protection Authority",
            "description": "The Ministry of Interior oversees data protection compliance",
            "order_no": 3,
            "summary": "Understand regulatory oversight structure",
            "questions": [
              "Is relationship with Authority established?",
              "Are reporting requirements understood?",
              "Is registration completed where required?"
            ],
            "evidence_examples": [
              "Authority registration",
              "Reporting schedule",
              "Communication records"
            ]
          }
        ]
      },
      {
        "title": "Chapter 2: Data Processing Principles",
        "description": "Core principles governing personal data processing under Bahrain PDPL",
        "order_no": 2,
        "items": [
          {
            "title": "Article 4 - Lawfulness of Processing",
            "description": "Personal data must be processed based on lawful grounds including consent",
            "order_no": 1,
            "summary": "Ensure lawful basis for all processing",
            "questions": [
              "Is lawful basis documented for each processing activity?",
              "Is consent obtained where required?",
              "Are other lawful bases properly justified?"
            ],
            "evidence_examples": [
              "Lawful basis register",
              "Consent records",
              "Processing justification documents"
            ]
          },
          {
            "title": "Article 5 - Purpose Limitation",
            "description": "Data must be collected for specified, explicit, and legitimate purposes",
            "order_no": 2,
            "summary": "Limit processing to specified purposes",
            "questions": [
              "Are purposes clearly defined and documented?",
              "Is further processing compatible with original purpose?",
              "Are purpose changes communicated to data subjects?"
            ],
            "evidence_examples": [
              "Purpose specification documents",
              "Compatibility assessments",
              "Data subject notifications"
            ]
          },
          {
            "title": "Article 6 - Data Minimization",
            "description": "Only collect data adequate, relevant, and necessary for the purpose",
            "order_no": 3,
            "summary": "Minimize data collection",
            "questions": [
              "Is data collection limited to necessity?",
              "Are unnecessary data fields removed?",
              "Is periodic review conducted?"
            ],
            "evidence_examples": [
              "Data minimization assessment",
              "Data field review records",
              "Collection justification"
            ]
          },
          {
            "title": "Article 7 - Accuracy",
            "description": "Personal data must be accurate and kept up to date",
            "order_no": 4,
            "summary": "Maintain data accuracy",
            "questions": [
              "Are accuracy procedures in place?",
              "Can data subjects update their data?",
              "Is inaccurate data corrected promptly?"
            ],
            "evidence_examples": [
              "Data quality procedures",
              "Update mechanisms",
              "Correction logs"
            ]
          },
          {
            "title": "Article 8 - Storage Limitation",
            "description": "Data must not be kept longer than necessary for the purpose",
            "order_no": 5,
            "summary": "Implement retention limits",
            "questions": [
              "Are retention periods defined?",
              "Is data deleted when no longer needed?",
              "Are retention schedules enforced?"
            ],
            "evidence_examples": [
              "Retention policy",
              "Deletion logs",
              "Retention schedule"
            ]
          },
          {
            "title": "Article 9 - Security Measures",
            "description": "Appropriate technical and organizational security measures required",
            "order_no": 6,
            "summary": "Implement security safeguards",
            "questions": [
              "Are technical security measures implemented?",
              "Are organizational measures in place?",
              "Is access appropriately controlled?"
            ],
            "evidence_examples": [
              "Security policy",
              "Technical controls documentation",
              "Access control matrix"
            ]
          }
        ]
      },
      {
        "title": "Chapter 3: Data Subject Rights",
        "description": "Rights granted to individuals under Bahrain PDPL",
        "order_no": 3,
        "items": [
          {
            "title": "Article 10 - Right to Information",
            "description": "Data subjects must be informed about processing of their data",
            "order_no": 1,
            "summary": "Provide transparent information",
            "questions": [
              "Are privacy notices provided in Arabic and English?",
              "Is information clear and accessible?",
              "Are all required disclosures made?"
            ],
            "evidence_examples": [
              "Privacy notices (Arabic/English)",
              "Information provision procedures",
              "Disclosure checklists"
            ]
          },
          {
            "title": "Article 11 - Right of Access",
            "description": "Data subjects can request access to their personal data",
            "order_no": 2,
            "summary": "Enable access requests",
            "questions": [
              "Is access request process established?",
              "Are requests handled within legal timeframe?",
              "Is data provided in accessible format?"
            ],
            "evidence_examples": [
              "Access request procedure",
              "Request handling logs",
              "Response templates"
            ]
          },
          {
            "title": "Article 12 - Right to Rectification",
            "description": "Data subjects can correct inaccurate or incomplete data",
            "order_no": 3,
            "summary": "Enable data correction",
            "questions": [
              "Can data subjects request corrections?",
              "Are corrections made promptly?",
              "Are third parties notified?"
            ],
            "evidence_examples": [
              "Rectification procedure",
              "Correction logs",
              "Third-party notification records"
            ]
          },
          {
            "title": "Article 13 - Right to Erasure",
            "description": "Data subjects can request deletion of their data",
            "order_no": 4,
            "summary": "Enable data deletion",
            "questions": [
              "Is erasure request process established?",
              "Are deletion criteria documented?",
              "Is data deleted from all systems?"
            ],
            "evidence_examples": [
              "Erasure procedure",
              "Deletion verification",
              "System deletion logs"
            ]
          },
          {
            "title": "Article 14 - Right to Object",
            "description": "Data subjects can object to certain processing activities",
            "order_no": 5,
            "summary": "Handle objection requests",
            "questions": [
              "Can objections be submitted?",
              "Are objections properly assessed?",
              "Is processing stopped when objection is valid?"
            ],
            "evidence_examples": [
              "Objection procedure",
              "Assessment records",
              "Processing cessation logs"
            ]
          }
        ]
      },
      {
        "title": "Chapter 4: Cross-Border Transfers",
        "description": "Requirements for transferring data outside Bahrain",
        "order_no": 4,
        "items": [
          {
            "title": "Article 15 - Transfer Conditions",
            "description": "Data transfers outside Bahrain require adequate protection",
            "order_no": 1,
            "summary": "Control international data transfers",
            "questions": [
              "Are all cross-border transfers identified?",
              "Is adequate protection ensured?",
              "Are transfer mechanisms documented?"
            ],
            "evidence_examples": [
              "Transfer inventory",
              "Adequacy assessments",
              "Transfer mechanism documentation"
            ]
          },
          {
            "title": "Article 16 - Adequate Jurisdictions",
            "description": "Transfers to jurisdictions with adequate protection levels",
            "order_no": 2,
            "summary": "Identify approved transfer destinations",
            "questions": [
              "Are transfers limited to adequate jurisdictions?",
              "Is adequacy list maintained?",
              "Are non-adequate transfers justified?"
            ],
            "evidence_examples": [
              "Approved jurisdiction list",
              "Adequacy determinations",
              "Exception documentation"
            ]
          },
          {
            "title": "Article 17 - Contractual Safeguards",
            "description": "Use of contractual clauses for transfers to non-adequate jurisdictions",
            "order_no": 3,
            "summary": "Implement contractual safeguards",
            "questions": [
              "Are approved contractual clauses used?",
              "Are contracts with processors adequate?",
              "Are transfer agreements reviewed regularly?"
            ],
            "evidence_examples": [
              "Signed contractual clauses",
              "Data processing agreements",
              "Contract reviews"
            ]
          }
        ]
      },
      {
        "title": "Chapter 5: CBB AI Notice (2023)",
        "description": "Central Bank of Bahrain requirements for AI use in financial services",
        "order_no": 5,
        "items": [
          {
            "title": "Article 18 - CBB AI Registration",
            "description": "Financial institutions must register AI systems with CBB",
            "order_no": 1,
            "summary": "Register AI systems with Central Bank",
            "questions": [
              "Are AI systems registered with CBB?",
              "Is registration kept up to date?",
              "Are material changes reported?"
            ],
            "evidence_examples": [
              "CBB AI registration",
              "Registration updates",
              "Change notification records"
            ]
          },
          {
            "title": "Article 19 - AI Risk Assessment",
            "description": "AI systems in financial services require risk assessment",
            "order_no": 2,
            "summary": "Conduct AI risk assessments",
            "questions": [
              "Are AI risks identified and documented?",
              "Is risk assessment methodology applied?",
              "Are mitigations implemented?"
            ],
            "evidence_examples": [
              "AI risk assessment reports",
              "Risk methodology documentation",
              "Mitigation implementation records"
            ]
          },
          {
            "title": "Article 20 - Model Governance",
            "description": "Governance requirements for AI/ML models in financial services",
            "order_no": 3,
            "summary": "Implement AI model governance",
            "questions": [
              "Is model governance framework in place?",
              "Are models validated before deployment?",
              "Is ongoing monitoring conducted?"
            ],
            "evidence_examples": [
              "Model governance framework",
              "Model validation reports",
              "Monitoring procedures"
            ]
          },
          {
            "title": "Article 21 - Consumer Protection",
            "description": "Protecting consumers from AI-related risks in financial services",
            "order_no": 4,
            "summary": "Ensure consumer protection for AI",
            "questions": [
              "Are consumers informed of AI use?",
              "Is human review available for AI decisions?",
              "Are complaint mechanisms in place?"
            ],
            "evidence_examples": [
              "Consumer disclosure notices",
              "Human review procedures",
              "Complaint handling records"
            ]
          },
          {
            "title": "Article 22 - Open Banking AI Requirements",
            "description": "Specific requirements for AI in Open Banking services",
            "order_no": 5,
            "summary": "Comply with Open Banking AI rules",
            "questions": [
              "Are Open Banking AI rules followed?",
              "Is data sharing AI-compliant?",
              "Are third-party AI systems assessed?"
            ],
            "evidence_examples": [
              "Open Banking AI compliance",
              "Data sharing assessments",
              "Third-party AI evaluations"
            ]
          }
        ]
      },
      {
        "title": "Chapter 6: EDB AI Ethics Pledge",
        "description": "Economic Development Board AI Ethics requirements",
        "order_no": 6,
        "items": [
          {
            "title": "Article 23 - AI Ethics Commitment",
            "description": "Organizations should commit to AI ethics principles",
            "order_no": 1,
            "summary": "Commit to AI ethics standards",
            "questions": [
              "Is EDB AI Ethics Pledge signed?",
              "Are ethics principles documented?",
              "Is commitment communicated internally?"
            ],
            "evidence_examples": [
              "Signed AI Ethics Pledge",
              "Ethics principles documentation",
              "Internal communications"
            ]
          },
          {
            "title": "Article 24 - AI Transparency",
            "description": "AI systems must be transparent and explainable",
            "order_no": 2,
            "summary": "Ensure AI system transparency",
            "questions": [
              "Are AI systems documented?",
              "Is decision logic explainable?",
              "Are users informed of AI involvement?"
            ],
            "evidence_examples": [
              "AI system documentation",
              "Explainability reports",
              "AI disclosure notices"
            ]
          },
          {
            "title": "Article 25 - AI Fairness",
            "description": "AI systems must be fair and non-discriminatory",
            "order_no": 3,
            "summary": "Prevent AI bias and discrimination",
            "questions": [
              "Are bias assessments conducted?",
              "Is fairness testing performed?",
              "Are discrimination risks mitigated?"
            ],
            "evidence_examples": [
              "Bias assessment reports",
              "Fairness testing results",
              "Mitigation documentation"
            ]
          },
          {
            "title": "Article 26 - AI Accountability",
            "description": "Clear accountability for AI system outcomes",
            "order_no": 4,
            "summary": "Establish AI accountability",
            "questions": [
              "Is AI governance structure defined?",
              "Are responsibilities assigned?",
              "Is human oversight maintained?"
            ],
            "evidence_examples": [
              "AI governance framework",
              "RACI matrix for AI",
              "Human oversight procedures"
            ]
          },
          {
            "title": "Article 27 - AI Safety and Security",
            "description": "AI systems must be safe and secure",
            "order_no": 5,
            "summary": "Ensure AI safety and security",
            "questions": [
              "Are AI safety assessments conducted?",
              "Are security measures implemented?",
              "Are failure modes addressed?"
            ],
            "evidence_examples": [
              "AI safety assessments",
              "Security controls documentation",
              "Failure mode analysis"
            ]
          }
        ]
      },
      {
        "title": "Chapter 7: Enforcement and Penalties",
        "description": "Regulatory enforcement and penalty provisions",
        "order_no": 7,
        "items": [
          {
            "title": "Article 28 - Breach Notification",
            "description": "Data breaches must be notified to Authority and affected individuals",
            "order_no": 1,
            "summary": "Implement breach notification procedures",
            "questions": [
              "Is breach detection capability in place?",
              "Can notification be made timely?",
              "Are affected individuals notified?"
            ],
            "evidence_examples": [
              "Breach response plan",
              "Notification templates",
              "Breach register"
            ]
          },
          {
            "title": "Article 29 - Regulatory Audits",
            "description": "Authority may conduct compliance audits",
            "order_no": 2,
            "summary": "Prepare for regulatory audits",
            "questions": [
              "Is audit readiness maintained?",
              "Are records available for inspection?",
              "Is cooperation with auditors ensured?"
            ],
            "evidence_examples": [
              "Audit readiness checklist",
              "Document retention policy",
              "Previous audit records"
            ]
          },
          {
            "title": "Article 30 - Administrative Penalties",
            "description": "Violations may result in fines and sanctions under Bahrain PDPL",
            "order_no": 3,
            "summary": "Understand penalty provisions",
            "questions": [
              "Are penalty provisions understood?",
              "Are high-risk areas addressed?",
              "Is legal counsel engaged?"
            ],
            "evidence_examples": [
              "Penalty risk assessment",
              "Compliance gap remediation",
              "Legal review documentation"
            ]
          },
          {
            "title": "Article 31 - CBB Enforcement",
            "description": "Central Bank enforcement for financial sector AI violations",
            "order_no": 4,
            "summary": "Understand CBB enforcement",
            "questions": [
              "Are CBB AI requirements met?",
              "Is CBB reporting completed?",
              "Are CBB audits prepared for?"
            ],
            "evidence_examples": [
              "CBB compliance attestation",
              "CBB reporting records",
              "CBB audit preparation"
            ]
          }
        ]
      }
    ]
  },
};

export default bahrainPdplStructure;
