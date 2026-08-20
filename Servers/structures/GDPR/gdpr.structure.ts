import type { FrameworkStructure } from "../types";

export const gdprStructure: FrameworkStructure = {
  id: 6,
  key: "gdpr",
  framework_type: "gdpr",
  displayName: "GDPR Compliance Framework",
  tables: {
    l1_struct: "gdpr_chapters_struct",
    l2_struct: "gdpr_articles_struct",
    l2_impl: "gdpr_articles",
    l2_risks: "gdpr_articles__risks",
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
    article: "GDPR articles",
  },
  seed: {
    name: "GDPR Compliance Framework",
    description:
      "Framework for ensuring compliance with the EU General Data Protection Regulation (GDPR)",
    version: "1.0.0",
    is_organizational: true,
    hierarchy: {
      type: "two_level",
      level1_name: "Chapter",
      level2_name: "Article",
    },
    structure: [
      {
        title: "Chapter 2: Principles",
        description: "Principles relating to processing of personal data",
        order_no: 1,
        items: [
          {
            title: "Art. 5 - Principles relating to processing",
            description:
              "Personal data shall be processed lawfully, fairly and in a transparent manner",
            order_no: 1,
            summary:
              "Core data protection principles including lawfulness, fairness, transparency, purpose limitation, data minimization, accuracy, storage limitation, integrity and confidentiality",
            questions: [
              "What is the lawful basis for processing?",
              "How is transparency ensured?",
              "Is data collection minimized to what is necessary?",
            ],
            evidence_examples: [
              "Privacy policy documentation",
              "Data processing register",
              "Lawful basis assessment",
            ],
          },
          {
            title: "Art. 6 - Lawfulness of processing",
            description:
              "Processing shall be lawful only if at least one of the specified conditions applies",
            order_no: 2,
            summary: "Establish lawful basis for all processing activities",
            questions: [
              "Which lawful basis applies to each processing activity?",
              "Is consent freely given, specific, informed and unambiguous?",
              "Are legitimate interests documented and balanced?",
            ],
            evidence_examples: [
              "Consent records",
              "Legitimate interest assessments",
              "Contract documentation",
            ],
          },
          {
            title: "Art. 7 - Conditions for consent",
            description: "Conditions for valid consent",
            order_no: 3,
            summary: "Ensure consent meets GDPR requirements",
            questions: [
              "Can consent be demonstrated?",
              "Is consent request clearly distinguishable?",
              "Can consent be easily withdrawn?",
            ],
            evidence_examples: [
              "Consent management system",
              "Consent forms",
              "Withdrawal mechanism documentation",
            ],
          },
        ],
      },
      {
        title: "Chapter 3: Rights of the Data Subject",
        description: "Rights of individuals regarding their personal data",
        order_no: 2,
        items: [
          {
            title: "Art. 12 - Transparent communication",
            description:
              "Transparent information, communication and modalities for exercising rights",
            order_no: 1,
            summary: "Provide clear, accessible information about data processing",
            questions: [
              "Is information provided in clear and plain language?",
              "Are requests responded to within one month?",
              "Is information provided free of charge?",
            ],
            evidence_examples: ["Privacy notices", "Response time logs", "Communication templates"],
          },
          {
            title: "Art. 15 - Right of access",
            description: "Right of access by the data subject",
            order_no: 2,
            summary: "Enable data subjects to access their personal data",
            questions: [
              "Can data subjects request access to their data?",
              "Is a copy of data provided in electronic format?",
              "Are all required details included in the response?",
            ],
            evidence_examples: [
              "Subject access request procedure",
              "SAR response templates",
              "Access request logs",
            ],
          },
          {
            title: "Art. 17 - Right to erasure",
            description: "Right to erasure ('right to be forgotten')",
            order_no: 3,
            summary: "Enable deletion of personal data when requested",
            questions: [
              "Can data be erased upon request?",
              "Are third parties notified of erasure?",
              "Are exceptions properly documented?",
            ],
            evidence_examples: [
              "Erasure procedure",
              "Deletion logs",
              "Third-party notification records",
            ],
          },
        ],
      },
      {
        title: "Chapter 4: Controller and Processor",
        description: "Obligations of controllers and processors",
        order_no: 3,
        items: [
          {
            title: "Art. 25 - Data protection by design and default",
            description: "Implement appropriate technical and organizational measures",
            order_no: 1,
            summary: "Build privacy into systems and processes from the start",
            questions: [
              "Are privacy considerations part of the design process?",
              "Is data minimization applied by default?",
              "Are privacy-enhancing technologies used?",
            ],
            evidence_examples: [
              "Privacy impact assessments",
              "System design documentation",
              "Default settings documentation",
            ],
          },
          {
            title: "Art. 30 - Records of processing activities",
            description: "Maintain a record of processing activities",
            order_no: 2,
            summary: "Document all data processing activities",
            questions: [
              "Is a processing register maintained?",
              "Does it include all required information?",
              "Is it kept up to date?",
            ],
            evidence_examples: [
              "Records of processing activities (ROPA)",
              "Data flow diagrams",
              "Processing activity updates",
            ],
          },
          {
            title: "Art. 32 - Security of processing",
            description: "Implement appropriate security measures",
            order_no: 3,
            summary: "Ensure appropriate security for personal data",
            questions: [
              "Is encryption used where appropriate?",
              "Are systems regularly tested?",
              "Is there a process for restoring data availability?",
            ],
            evidence_examples: [
              "Security policy",
              "Penetration test results",
              "Backup and recovery procedures",
            ],
          },
          {
            title: "Art. 33 - Notification of personal data breach",
            description: "Notify supervisory authority of breaches within 72 hours",
            order_no: 4,
            summary: "Establish breach notification procedures",
            questions: [
              "Is there a breach detection process?",
              "Can notification be made within 72 hours?",
              "Is there a breach register?",
            ],
            evidence_examples: [
              "Breach response procedure",
              "Breach notification templates",
              "Breach register",
            ],
          },
        ],
      },
    ],
  },
};

export default gdprStructure;
