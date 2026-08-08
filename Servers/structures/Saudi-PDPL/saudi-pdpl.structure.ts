import type { FrameworkStructure } from "../types";

export const saudiPdplStructure: FrameworkStructure = {
  id: 18,
  key: "saudi-pdpl",
  framework_type: "saudi_pdpl",
  displayName: "Saudi Arabia Personal Data Protection Law",
  tables: {
    "l1_struct": "saudi_pdpl_chapters_struct",
    "l2_struct": "saudi_pdpl_articles_struct",
    "l2_impl": "saudi_pdpl_articles",
    "l2_risks": "saudi_pdpl_articles__risks"
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
    "article": "Saudi PDPL articles"
  },
  seed: {
    "name": "Saudi Arabia Personal Data Protection Law",
    "description": "Framework for compliance with Saudi PDPL (since September 2023), SDAIA Ethics Principles, and Generative AI Guidelines (2024)",
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
        "description": "Definitions, scope, and applicability of Saudi PDPL",
        "order_no": 1,
        "items": [
          {
            "title": "Article 1 - Definitions",
            "description": "Key definitions including personal data, sensitive data, controller, processor, and explicit consent",
            "order_no": 1,
            "summary": "Establish definitions per Saudi PDPL",
            "questions": [
              "Are personal data types identified per Saudi PDPL?",
              "Is sensitive data categorized correctly?",
              "Are controller/processor roles defined?"
            ],
            "evidence_examples": [
              "Data classification policy",
              "Sensitive data inventory",
              "Role definitions document"
            ]
          },
          {
            "title": "Article 2 - Territorial Scope",
            "description": "Law applies to processing in Saudi Arabia and processing of Saudi residents' data",
            "order_no": 2,
            "summary": "Define territorial application",
            "questions": [
              "Is domestic processing documented?",
              "Are extraterritorial activities identified?",
              "Are exemptions properly applied?"
            ],
            "evidence_examples": [
              "Processing inventory",
              "Territorial scope assessment",
              "Exemption register"
            ]
          },
          {
            "title": "Article 3 - SDAIA Oversight",
            "description": "Saudi Data and AI Authority oversees compliance",
            "order_no": 3,
            "summary": "Understand SDAIA regulatory role",
            "questions": [
              "Is SDAIA registration complete?",
              "Are reporting requirements understood?",
              "Is SDAIA accreditation obtained where required?"
            ],
            "evidence_examples": [
              "SDAIA registration",
              "Reporting schedule",
              "Accreditation certificate"
            ]
          }
        ]
      },
      {
        "title": "Chapter 2: Data Processing Principles",
        "description": "Core principles governing personal data processing",
        "order_no": 2,
        "items": [
          {
            "title": "Article 4 - Lawfulness of Processing",
            "description": "Processing must be based on lawful grounds including explicit consent",
            "order_no": 1,
            "summary": "Ensure lawful processing basis",
            "questions": [
              "Is explicit consent obtained where required?",
              "Are other lawful bases documented?",
              "Is consent withdrawal mechanism available?"
            ],
            "evidence_examples": [
              "Consent management system",
              "Lawful basis register",
              "Consent withdrawal logs"
            ]
          },
          {
            "title": "Article 5 - Purpose Limitation",
            "description": "Data collected for specified, explicit, and legitimate purposes only",
            "order_no": 2,
            "summary": "Limit processing to stated purposes",
            "questions": [
              "Are purposes clearly specified?",
              "Is secondary use restricted?",
              "Are purposes communicated to data subjects?"
            ],
            "evidence_examples": [
              "Purpose specification documents",
              "Secondary use assessments",
              "Privacy notices"
            ]
          },
          {
            "title": "Article 6 - Data Minimization",
            "description": "Collect only data necessary for the specified purpose",
            "order_no": 3,
            "summary": "Minimize data collection",
            "questions": [
              "Is data collection limited to necessity?",
              "Are unnecessary fields eliminated?",
              "Is periodic review conducted?"
            ],
            "evidence_examples": [
              "Data minimization assessment",
              "Field necessity justification",
              "Review records"
            ]
          },
          {
            "title": "Article 7 - Accuracy",
            "description": "Data must be accurate, complete, and up to date",
            "order_no": 4,
            "summary": "Maintain data accuracy",
            "questions": [
              "Are accuracy procedures implemented?",
              "Can data subjects update their data?",
              "Is inaccurate data corrected?"
            ],
            "evidence_examples": [
              "Data quality procedures",
              "Update mechanisms",
              "Correction logs"
            ]
          },
          {
            "title": "Article 8 - Storage Limitation",
            "description": "Data retained only as long as necessary",
            "order_no": 5,
            "summary": "Implement retention limits",
            "questions": [
              "Are retention periods defined?",
              "Is data securely deleted when expired?",
              "Are retention schedules enforced?"
            ],
            "evidence_examples": [
              "Retention policy",
              "Deletion certificates",
              "Retention schedule"
            ]
          },
          {
            "title": "Article 9 - Security",
            "description": "Appropriate security measures to protect personal data",
            "order_no": 6,
            "summary": "Implement security safeguards",
            "questions": [
              "Are technical security measures implemented?",
              "Are organizational measures in place?",
              "Is access controlled?"
            ],
            "evidence_examples": [
              "Security policy",
              "Technical controls",
              "Access control matrix"
            ]
          }
        ]
      },
      {
        "title": "Chapter 3: Data Subject Rights",
        "description": "Rights of individuals under Saudi PDPL",
        "order_no": 3,
        "items": [
          {
            "title": "Article 10 - Right to Know",
            "description": "Data subjects have the right to know how their data is processed",
            "order_no": 1,
            "summary": "Provide processing information",
            "questions": [
              "Are privacy notices provided in Arabic?",
              "Is processing information complete?",
              "Are data subjects informed before collection?"
            ],
            "evidence_examples": [
              "Arabic privacy notices",
              "Information provision records",
              "Pre-collection disclosures"
            ]
          },
          {
            "title": "Article 11 - Right of Access",
            "description": "Data subjects can access their personal data",
            "order_no": 2,
            "summary": "Enable access requests",
            "questions": [
              "Is access request process established?",
              "Are requests handled within 30 days?",
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
            "description": "Data subjects can correct inaccurate data",
            "order_no": 3,
            "summary": "Enable data correction",
            "questions": [
              "Can corrections be requested?",
              "Are corrections processed promptly?",
              "Are third parties notified?"
            ],
            "evidence_examples": [
              "Rectification procedure",
              "Correction logs",
              "Third-party notifications"
            ]
          },
          {
            "title": "Article 13 - Right to Erasure",
            "description": "Data subjects can request deletion of their data",
            "order_no": 4,
            "summary": "Enable data deletion",
            "questions": [
              "Is erasure process established?",
              "Are deletion criteria clear?",
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
            "description": "Data subjects can object to certain processing",
            "order_no": 5,
            "summary": "Handle processing objections",
            "questions": [
              "Can objections be submitted?",
              "Are objections assessed properly?",
              "Is processing stopped when valid?"
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
        "description": "Requirements for international data transfers",
        "order_no": 4,
        "items": [
          {
            "title": "Article 15 - Transfer Restrictions",
            "description": "Transfers outside Saudi Arabia require adequate protection",
            "order_no": 1,
            "summary": "Control international transfers",
            "questions": [
              "Are cross-border transfers identified?",
              "Is adequate protection ensured?",
              "Are transfers documented?"
            ],
            "evidence_examples": [
              "Transfer inventory",
              "Adequacy assessments",
              "Transfer documentation"
            ]
          },
          {
            "title": "Article 16 - Adequacy Determinations",
            "description": "Transfers to countries with adequate protection",
            "order_no": 2,
            "summary": "Assess destination adequacy",
            "questions": [
              "Is SDAIA adequacy list followed?",
              "Are non-adequate transfers justified?",
              "Are alternative safeguards used?"
            ],
            "evidence_examples": [
              "Adequacy assessments",
              "Transfer justifications",
              "Safeguard documentation"
            ]
          },
          {
            "title": "Article 17 - Contractual Safeguards",
            "description": "Standard contractual clauses for transfers",
            "order_no": 3,
            "summary": "Implement transfer contracts",
            "questions": [
              "Are approved SCCs used?",
              "Are contracts comprehensive?",
              "Are contracts reviewed regularly?"
            ],
            "evidence_examples": [
              "Signed SCCs",
              "Data transfer agreements",
              "Contract review records"
            ]
          }
        ]
      },
      {
        "title": "Chapter 5: SDAIA AI Ethics Principles (2023)",
        "description": "SDAIA ethical principles for AI systems",
        "order_no": 5,
        "items": [
          {
            "title": "Article 18 - AI Fairness",
            "description": "AI systems must be fair and avoid discrimination",
            "order_no": 1,
            "summary": "Ensure AI fairness",
            "questions": [
              "Are fairness assessments conducted?",
              "Is bias testing performed?",
              "Are protected groups considered?"
            ],
            "evidence_examples": [
              "Fairness assessment reports",
              "Bias testing results",
              "Protected group analysis"
            ]
          },
          {
            "title": "Article 19 - AI Transparency",
            "description": "AI decision-making must be transparent and explainable",
            "order_no": 2,
            "summary": "Maintain AI transparency",
            "questions": [
              "Are AI decisions explainable?",
              "Is documentation maintained?",
              "Are users informed of AI use?"
            ],
            "evidence_examples": [
              "Explainability documentation",
              "AI system records",
              "User disclosures"
            ]
          },
          {
            "title": "Article 20 - AI Accountability",
            "description": "Clear accountability for AI outcomes",
            "order_no": 3,
            "summary": "Establish AI accountability",
            "questions": [
              "Is accountability assigned?",
              "Is governance structure defined?",
              "Is human oversight maintained?"
            ],
            "evidence_examples": [
              "Accountability matrix",
              "Governance framework",
              "Oversight procedures"
            ]
          },
          {
            "title": "Article 21 - AI Privacy",
            "description": "AI must respect personal data privacy",
            "order_no": 4,
            "summary": "Protect privacy in AI",
            "questions": [
              "Is privacy-by-design implemented?",
              "Is data minimization applied?",
              "Are PETs considered?"
            ],
            "evidence_examples": [
              "Privacy impact assessments",
              "Data minimization for AI",
              "PET implementation"
            ]
          },
          {
            "title": "Article 22 - AI Safety",
            "description": "AI systems must be safe and secure",
            "order_no": 5,
            "summary": "Ensure AI safety",
            "questions": [
              "Are safety assessments conducted?",
              "Are security measures implemented?",
              "Are failure modes addressed?"
            ],
            "evidence_examples": [
              "Safety assessments",
              "Security documentation",
              "Failure mode analysis"
            ]
          }
        ]
      },
      {
        "title": "Chapter 6: Generative AI Guidelines (2024)",
        "description": "SDAIA guidelines for generative AI systems",
        "order_no": 6,
        "items": [
          {
            "title": "Article 23 - GenAI Risk Assessment",
            "description": "Generative AI requires comprehensive risk assessment",
            "order_no": 1,
            "summary": "Assess generative AI risks",
            "questions": [
              "Are GenAI risks identified?",
              "Is risk assessment documented?",
              "Are mitigations implemented?"
            ],
            "evidence_examples": [
              "GenAI risk assessment",
              "Risk register",
              "Mitigation documentation"
            ]
          },
          {
            "title": "Article 24 - Content Authenticity",
            "description": "AI-generated content must be identifiable",
            "order_no": 2,
            "summary": "Mark AI-generated content",
            "questions": [
              "Is AI content labeled?",
              "Are watermarks/markers used?",
              "Is deepfake prevention addressed?"
            ],
            "evidence_examples": [
              "Content labeling policy",
              "Watermarking implementation",
              "Deepfake prevention measures"
            ]
          },
          {
            "title": "Article 25 - Training Data Governance",
            "description": "Proper governance of AI training data",
            "order_no": 3,
            "summary": "Govern training data",
            "questions": [
              "Is training data sourced legally?",
              "Is data quality assured?",
              "Are biases in training data addressed?"
            ],
            "evidence_examples": [
              "Data sourcing documentation",
              "Data quality records",
              "Bias assessment for training data"
            ]
          },
          {
            "title": "Article 26 - Human Oversight",
            "description": "Maintain human oversight of generative AI",
            "order_no": 4,
            "summary": "Ensure human control over GenAI",
            "questions": [
              "Is human review implemented?",
              "Can AI outputs be overridden?",
              "Is escalation process defined?"
            ],
            "evidence_examples": [
              "Human review procedures",
              "Override mechanisms",
              "Escalation protocols"
            ]
          }
        ]
      },
      {
        "title": "Chapter 7: Enforcement and Penalties",
        "description": "SDAIA enforcement and penalties up to SAR 5M",
        "order_no": 7,
        "items": [
          {
            "title": "Article 27 - SDAIA Accreditation",
            "description": "Certain activities require SDAIA accreditation",
            "order_no": 1,
            "summary": "Obtain required accreditation",
            "questions": [
              "Is SDAIA accreditation required?",
              "Is accreditation obtained?",
              "Is accreditation maintained current?"
            ],
            "evidence_examples": [
              "Accreditation certificate",
              "Accreditation requirements checklist",
              "Renewal records"
            ]
          },
          {
            "title": "Article 28 - Breach Notification",
            "description": "Data breaches must be notified to SDAIA",
            "order_no": 2,
            "summary": "Implement breach notification",
            "questions": [
              "Is breach detection in place?",
              "Can notification be made timely?",
              "Are affected individuals notified?"
            ],
            "evidence_examples": [
              "Breach response plan",
              "Notification procedures",
              "Breach register"
            ]
          },
          {
            "title": "Article 29 - Administrative Penalties",
            "description": "Violations may result in fines up to SAR 5 million",
            "order_no": 3,
            "summary": "Understand penalty provisions",
            "questions": [
              "Are penalty provisions understood?",
              "Are high-risk areas addressed?",
              "Is compliance budget adequate?"
            ],
            "evidence_examples": [
              "Penalty risk assessment",
              "Compliance remediation plan",
              "Budget allocation"
            ]
          },
          {
            "title": "Article 30 - Compliance Monitoring",
            "description": "Ongoing compliance monitoring requirements",
            "order_no": 4,
            "summary": "Implement compliance monitoring",
            "questions": [
              "Is compliance monitoring in place?",
              "Are audits conducted regularly?",
              "Are findings remediated?"
            ],
            "evidence_examples": [
              "Monitoring procedures",
              "Audit reports",
              "Remediation records"
            ]
          }
        ]
      }
    ]
  },
};

export default saudiPdplStructure;
