import type { FrameworkStructure } from "../types";

export const qatarPdplStructure: FrameworkStructure = {
  id: 19,
  key: "qatar-pdpl",
  framework_type: "qatar_pdpl",
  displayName: "Qatar Personal Data Privacy Law",
  tables: {
    l1_struct: "qatar_pdpl_chapters_struct",
    l2_struct: "qatar_pdpl_articles_struct",
    l2_impl: "qatar_pdpl_articles",
    l2_risks: "qatar_pdpl_articles__risks",
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
    article: "Qatar PDPL articles",
  },
  seed: {
    name: "Qatar Personal Data Privacy Law",
    description:
      "Framework for compliance with Qatar's Personal Data Privacy Law 13/2016 and national AI policy requirements",
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
        description: "Definitions, scope, and applicability of the law",
        order_no: 1,
        items: [
          {
            title: "Article 1 - Definitions",
            description:
              "Key definitions including personal data, data controller, data processor, and consent",
            order_no: 1,
            summary: "Establish clear definitions for data protection terms",
            questions: [
              "Are all personal data types identified?",
              "Are data controller responsibilities defined?",
              "Is consent clearly defined?",
            ],
            evidence_examples: [
              "Data classification policy",
              "Roles and responsibilities matrix",
              "Consent definition documentation",
            ],
          },
          {
            title: "Article 2 - Scope of Application",
            description:
              "The law applies to processing of personal data within Qatar and by Qatar-based entities",
            order_no: 2,
            summary: "Define territorial and material scope",
            questions: [
              "Is processing scope documented?",
              "Are extraterritorial considerations addressed?",
              "Are exemptions identified?",
            ],
            evidence_examples: [
              "Data processing inventory",
              "Scope assessment documentation",
              "Exemption register",
            ],
          },
        ],
      },
      {
        title: "Chapter 2: Data Processing Principles",
        description: "Core principles governing the processing of personal data",
        order_no: 2,
        items: [
          {
            title: "Article 3 - Lawfulness and Fairness",
            description: "Personal data must be processed lawfully, fairly, and transparently",
            order_no: 1,
            summary: "Ensure lawful and fair data processing",
            questions: [
              "Is lawful basis documented for each processing activity?",
              "Are data subjects informed of processing?",
              "Is processing fair and proportionate?",
            ],
            evidence_examples: [
              "Lawful basis register",
              "Privacy notices",
              "Processing impact assessments",
            ],
          },
          {
            title: "Article 4 - Purpose Limitation",
            description:
              "Personal data must be collected for specified, explicit, and legitimate purposes",
            order_no: 2,
            summary: "Limit data processing to specified purposes",
            questions: [
              "Are processing purposes clearly defined?",
              "Is secondary use of data controlled?",
              "Are purposes communicated to data subjects?",
            ],
            evidence_examples: [
              "Purpose specification documents",
              "Consent records",
              "Processing activity register",
            ],
          },
          {
            title: "Article 5 - Data Minimization",
            description:
              "Personal data collected must be adequate, relevant, and limited to what is necessary",
            order_no: 3,
            summary: "Minimize data collection to necessary scope",
            questions: [
              "Is data collection limited to necessity?",
              "Are data fields reviewed periodically?",
              "Is excessive data collection prevented?",
            ],
            evidence_examples: [
              "Data minimization assessment",
              "Collection justification records",
              "Periodic review documentation",
            ],
          },
          {
            title: "Article 6 - Accuracy",
            description: "Personal data must be accurate and kept up to date",
            order_no: 4,
            summary: "Maintain accurate and current data",
            questions: [
              "Are data accuracy procedures in place?",
              "Can data subjects update their data?",
              "Is inaccurate data corrected promptly?",
            ],
            evidence_examples: [
              "Data quality procedures",
              "Update request process",
              "Correction logs",
            ],
          },
          {
            title: "Article 7 - Storage Limitation",
            description: "Personal data must not be kept longer than necessary",
            order_no: 5,
            summary: "Limit data retention to necessary period",
            questions: [
              "Are retention periods defined?",
              "Is data deleted when no longer needed?",
              "Are retention schedules documented?",
            ],
            evidence_examples: ["Retention policy", "Deletion procedures", "Retention schedule"],
          },
          {
            title: "Article 8 - Security",
            description: "Personal data must be processed with appropriate security measures",
            order_no: 6,
            summary: "Implement appropriate security safeguards",
            questions: [
              "Are security measures implemented?",
              "Is access controlled appropriately?",
              "Are security incidents managed?",
            ],
            evidence_examples: [
              "Security policy",
              "Access control matrix",
              "Incident response plan",
            ],
          },
        ],
      },
      {
        title: "Chapter 3: Data Subject Rights",
        description: "Rights granted to individuals regarding their personal data",
        order_no: 3,
        items: [
          {
            title: "Article 9 - Right to Information",
            description:
              "Data subjects have the right to be informed about processing of their data",
            order_no: 1,
            summary: "Provide transparent information to data subjects",
            questions: [
              "Are privacy notices provided?",
              "Is information clear and accessible?",
              "Are processing details disclosed?",
            ],
            evidence_examples: [
              "Privacy notice templates",
              "Information provision records",
              "Disclosure documentation",
            ],
          },
          {
            title: "Article 10 - Right of Access",
            description: "Data subjects have the right to access their personal data",
            order_no: 2,
            summary: "Enable data subject access requests",
            questions: [
              "Is access request process established?",
              "Are requests handled within timeframe?",
              "Is data provided in accessible format?",
            ],
            evidence_examples: [
              "Access request procedure",
              "Request handling logs",
              "Response templates",
            ],
          },
          {
            title: "Article 11 - Right to Rectification",
            description: "Data subjects have the right to correct inaccurate data",
            order_no: 3,
            summary: "Enable correction of personal data",
            questions: [
              "Can data subjects request corrections?",
              "Are corrections made promptly?",
              "Are third parties notified of corrections?",
            ],
            evidence_examples: [
              "Rectification procedure",
              "Correction request logs",
              "Third-party notification records",
            ],
          },
          {
            title: "Article 12 - Right to Erasure",
            description: "Data subjects have the right to request deletion of their data",
            order_no: 4,
            summary: "Enable data deletion upon request",
            questions: [
              "Is erasure request process established?",
              "Are deletion criteria documented?",
              "Is data actually deleted from all systems?",
            ],
            evidence_examples: [
              "Erasure procedure",
              "Deletion verification records",
              "System deletion logs",
            ],
          },
          {
            title: "Article 13 - Right to Object",
            description: "Data subjects have the right to object to processing",
            order_no: 5,
            summary: "Handle objections to data processing",
            questions: [
              "Can data subjects object to processing?",
              "Are objections assessed appropriately?",
              "Is processing stopped when objection is valid?",
            ],
            evidence_examples: [
              "Objection handling procedure",
              "Assessment documentation",
              "Processing cessation records",
            ],
          },
        ],
      },
      {
        title: "Chapter 4: Cross-Border Transfers",
        description: "Requirements for transferring personal data outside Qatar",
        order_no: 4,
        items: [
          {
            title: "Article 14 - Transfer Restrictions",
            description:
              "Personal data may only be transferred outside Qatar with regulatory approval",
            order_no: 1,
            summary: "Control international data transfers",
            questions: [
              "Are cross-border transfers identified?",
              "Is regulatory approval obtained?",
              "Are adequate safeguards in place?",
            ],
            evidence_examples: [
              "Transfer inventory",
              "Regulatory approval documentation",
              "Safeguard assessments",
            ],
          },
          {
            title: "Article 15 - Adequacy Determinations",
            description: "Transfers allowed to countries with adequate protection levels",
            order_no: 2,
            summary: "Assess destination country adequacy",
            questions: [
              "Are adequacy assessments conducted?",
              "Is destination country protection adequate?",
              "Are alternative safeguards considered?",
            ],
            evidence_examples: [
              "Adequacy assessment reports",
              "Country protection analysis",
              "Alternative safeguard documentation",
            ],
          },
          {
            title: "Article 16 - Standard Contractual Clauses",
            description: "Use of approved contractual clauses for international transfers",
            order_no: 3,
            summary: "Implement contractual safeguards for transfers",
            questions: [
              "Are standard clauses used?",
              "Are contracts with processors adequate?",
              "Are transfer agreements reviewed?",
            ],
            evidence_examples: [
              "Standard contractual clauses",
              "Data processing agreements",
              "Contract review records",
            ],
          },
        ],
      },
      {
        title: "Chapter 5: AI and Automated Processing",
        description:
          "Requirements for AI systems and automated decision-making under national AI policy",
        order_no: 5,
        items: [
          {
            title: "Article 17 - QCB FinTech Sandbox Compliance",
            description:
              "AI systems in financial services must comply with QCB FinTech sandbox guidelines",
            order_no: 1,
            summary: "Ensure AI compliance in financial services",
            questions: [
              "Is AI system registered with QCB sandbox?",
              "Are FinTech guidelines followed?",
              "Is regulatory reporting maintained?",
            ],
            evidence_examples: [
              "Sandbox registration",
              "Compliance assessment",
              "Regulatory reports",
            ],
          },
          {
            title: "Article 18 - Automated Decision Rights",
            description: "Data subjects have rights regarding automated decision-making",
            order_no: 2,
            summary: "Protect rights in automated decisions",
            questions: [
              "Are automated decisions identified?",
              "Can data subjects request human review?",
              "Is logic of decisions explainable?",
            ],
            evidence_examples: [
              "Automated decision inventory",
              "Human review procedure",
              "Explainability documentation",
            ],
          },
          {
            title: "Article 19 - AI Transparency",
            description: "AI systems must be transparent and explainable",
            order_no: 3,
            summary: "Ensure AI system transparency",
            questions: [
              "Are AI systems documented?",
              "Is decision logic explainable?",
              "Are data subjects informed of AI use?",
            ],
            evidence_examples: [
              "AI system documentation",
              "Explainability reports",
              "AI disclosure notices",
            ],
          },
          {
            title: "Article 20 - AI Risk Assessment",
            description: "AI systems must undergo risk assessment before deployment",
            order_no: 4,
            summary: "Assess AI system risks",
            questions: [
              "Are AI risk assessments conducted?",
              "Are high-risk AI systems identified?",
              "Are mitigation measures implemented?",
            ],
            evidence_examples: [
              "AI risk assessment reports",
              "Risk classification records",
              "Mitigation documentation",
            ],
          },
        ],
      },
      {
        title: "Chapter 6: Enforcement and Penalties",
        description: "Regulatory enforcement and penalty provisions",
        order_no: 6,
        items: [
          {
            title: "Article 21 - Regulatory Authority",
            description: "The regulatory authority oversees compliance and enforcement",
            order_no: 1,
            summary: "Understand regulatory oversight structure",
            questions: [
              "Is regulatory authority identified?",
              "Are reporting requirements understood?",
              "Is cooperation with regulator maintained?",
            ],
            evidence_examples: [
              "Regulatory contact records",
              "Reporting schedule",
              "Cooperation documentation",
            ],
          },
          {
            title: "Article 22 - Breach Notification",
            description: "Data breaches must be notified to the regulator and affected individuals",
            order_no: 2,
            summary: "Implement breach notification procedures",
            questions: [
              "Is breach detection capability in place?",
              "Are notification procedures established?",
              "Are notification timelines met?",
            ],
            evidence_examples: [
              "Breach detection procedures",
              "Notification templates",
              "Breach register",
            ],
          },
          {
            title: "Article 23 - Penalties",
            description: "Violations may result in fines and other penalties",
            order_no: 3,
            summary: "Understand penalty provisions",
            questions: [
              "Are penalty provisions understood?",
              "Are compliance measures adequate?",
              "Is legal counsel engaged for compliance?",
            ],
            evidence_examples: [
              "Penalty assessment",
              "Compliance gap analysis",
              "Legal review documentation",
            ],
          },
        ],
      },
    ],
  },
};

export default qatarPdplStructure;
