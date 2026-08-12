import type { FrameworkStructure } from "../types";

export const ccpaStructure: FrameworkStructure = {
  id: 8,
  key: "ccpa",
  framework_type: "ccpa",
  displayName: "CCPA Compliance Framework",
  tables: {
    l1_struct: "ccpa_categories_struct",
    l2_struct: "ccpa_requirements_struct",
    l2_impl: "ccpa_requirements",
    l2_risks: "ccpa_requirements__risks",
  },
  cols: {
    l2_struct_parent: "category_id",
    l2_impl_meta: "requirement_meta_id",
    l2_risks_impl: "requirement_id",
  },
  entity_types: {
    l2_impl: "requirement",
  },
  source_labels: {
    requirement: "CCPA requirements",
  },
  seed: {
    name: "CCPA Compliance Framework",
    description: "Framework for California Consumer Privacy Act compliance",
    version: "1.0.0",
    is_organizational: true,
    hierarchy: {
      type: "two_level",
      level1_name: "Category",
      level2_name: "Requirement",
    },
    structure: [
      {
        title: "Consumer Rights",
        description: "Rights granted to California consumers under CCPA",
        order_no: 1,
        items: [
          {
            title: "Right to Know",
            description:
              "Consumers have the right to know what personal information is collected about them",
            order_no: 1,
            summary: "Enable consumers to know what data is collected",
            questions: [
              "Can consumers request their data?",
              "Is there a process to respond to requests?",
              "Is the response provided within 45 days?",
            ],
            evidence_examples: [
              "Request intake process",
              "Response templates",
              "Timeline tracking",
            ],
          },
          {
            title: "Right to Delete",
            description:
              "Consumers have the right to request deletion of their personal information",
            order_no: 2,
            summary: "Enable consumers to delete their data",
            questions: [
              "Can consumers request deletion?",
              "Are exceptions documented?",
              "Is deletion verified?",
            ],
            evidence_examples: [
              "Deletion request process",
              "Exception documentation",
              "Deletion logs",
            ],
          },
          {
            title: "Right to Opt-Out",
            description:
              "Consumers have the right to opt-out of the sale of their personal information",
            order_no: 3,
            summary: "Provide opt-out mechanism for data sales",
            questions: [
              "Is there a 'Do Not Sell My Personal Information' link?",
              "Is the opt-out easy to use?",
              "Are opt-outs honored?",
            ],
            evidence_examples: ["Opt-out mechanism", "Website compliance", "Opt-out records"],
          },
          {
            title: "Right to Non-Discrimination",
            description:
              "Consumers cannot be discriminated against for exercising their CCPA rights",
            order_no: 4,
            summary: "Ensure no discrimination for rights exercise",
            questions: [
              "Are consumers treated equally regardless of rights exercise?",
              "Are financial incentives disclosed?",
            ],
            evidence_examples: ["Non-discrimination policy", "Incentive disclosures"],
          },
        ],
      },
      {
        title: "Business Obligations",
        description: "Requirements businesses must fulfill under CCPA",
        order_no: 2,
        items: [
          {
            title: "Privacy Notice",
            description: "Provide consumers with notice of data collection practices",
            order_no: 1,
            summary: "Publish comprehensive privacy notice",
            questions: [
              "Does the privacy policy describe data categories collected?",
              "Are purposes of collection disclosed?",
              "Is the notice updated annually?",
            ],
            evidence_examples: ["Privacy policy", "Update records", "Notice at collection"],
          },
          {
            title: "Data Inventory",
            description: "Maintain inventory of personal information collected, sold, or disclosed",
            order_no: 2,
            summary: "Catalog personal information handling",
            questions: [
              "Is there a data inventory?",
              "Are data categories mapped?",
              "Are third-party disclosures tracked?",
            ],
            evidence_examples: ["Data inventory", "Data mapping", "Third-party records"],
          },
          {
            title: "Service Provider Contracts",
            description: "Ensure contracts with service providers include required CCPA provisions",
            order_no: 3,
            summary: "Update vendor contracts for CCPA",
            questions: [
              "Do contracts restrict data use?",
              "Are service providers certified as such?",
              "Are data processing terms included?",
            ],
            evidence_examples: ["Contract templates", "Vendor agreements", "DPA addendums"],
          },
          {
            title: "Employee Training",
            description: "Train employees who handle consumer inquiries about CCPA requirements",
            order_no: 4,
            summary: "Train staff on CCPA obligations",
            questions: [
              "Are relevant employees trained?",
              "Is training documented?",
              "Is training refreshed annually?",
            ],
            evidence_examples: ["Training materials", "Training records", "Competency assessments"],
          },
        ],
      },
      {
        title: "Security Requirements",
        description: "Reasonable security measures to protect personal information",
        order_no: 3,
        items: [
          {
            title: "Reasonable Security",
            description: "Implement and maintain reasonable security procedures and practices",
            order_no: 1,
            summary: "Maintain appropriate security measures",
            questions: [
              "Are security measures appropriate to the data?",
              "Is there a security program?",
              "Are security incidents addressed?",
            ],
            evidence_examples: ["Security policy", "Security controls", "Incident response plan"],
          },
          {
            title: "Breach Notification",
            description:
              "Notify consumers of security breaches involving their personal information",
            order_no: 2,
            summary: "Prepare for breach notification",
            questions: [
              "Is there a breach response plan?",
              "Are notification templates ready?",
              "Is there a process to assess breach scope?",
            ],
            evidence_examples: [
              "Breach response plan",
              "Notification templates",
              "Assessment procedures",
            ],
          },
        ],
      },
    ],
  },
};

export default ccpaStructure;
