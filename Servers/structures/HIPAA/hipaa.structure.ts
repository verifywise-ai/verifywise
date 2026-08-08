import type { FrameworkStructure } from "../types";

export const hipaaStructure: FrameworkStructure = {
  id: 24,
  key: "hipaa",
  framework_type: "hipaa",
  displayName: "HIPAA Security Rule Framework",
  tables: {
    l1_struct: "hipaa_safeguard_categories_struct",
    l2_struct: "hipaa_standards_struct",
    l3_struct: "hipaa_implementation_specifications_struct",
    l2_impl: "hipaa_standards",
    l3_impl: "hipaa_implementation_specifications",
    l2_risks: "hipaa_standards__risks",
    l3_risks: "hipaa_implementation_specifications__risks",
  },
  cols: {
    l2_struct_parent: "safeguard_category_id",
    l3_struct_parent: "standard_id",
    l2_impl_meta: "standard_meta_id",
    l3_impl_meta: "implementation_specification_meta_id",
    l3_impl_parent: "standard_id",
    l2_risks_impl: "standard_id",
    l3_risks_impl: "implementation_specification_id",
  },
  entity_types: {
    l2_impl: "standard",
    l3_impl: "implementation_specification",
  },
  source_labels: {
    standard: "HIPAA standards",
    implementation_specification: "HIPAA implementation specifications",
  },
  seed: {
    name: "HIPAA Security Rule Framework",
    description:
      "Framework for HIPAA Security Rule compliance covering Administrative, Physical, and Technical Safeguards",
    version: "1.0.0",
    is_organizational: false,
    hierarchy: {
      type: "three_level",
      level1_name: "Safeguard Category",
      level2_name: "Standard",
      level3_name: "Implementation Specification",
    },
    structure: [
      {
        title: "Administrative Safeguards",
        description: "Administrative actions, policies, and procedures to manage security measures",
        order_no: 1,
        items: [
          {
            title: "Security Management Process",
            description:
              "Implement policies and procedures to prevent, detect, contain, and correct security violations",
            order_no: 1,
            summary: "Establish comprehensive security management",
            questions: [
              "Is there a formal security management process?",
              "Are policies regularly reviewed and updated?",
            ],
            evidence_examples: ["Security policies", "Risk management program"],
            items: [
              {
                title: "Risk Analysis (Required)",
                description:
                  "Conduct an accurate and thorough assessment of potential risks and vulnerabilities",
                order_no: 1,
              },
              {
                title: "Risk Management (Required)",
                description: "Implement security measures to reduce risks and vulnerabilities",
                order_no: 2,
              },
              {
                title: "Sanction Policy (Required)",
                description:
                  "Apply appropriate sanctions against workforce members who fail to comply",
                order_no: 3,
              },
              {
                title: "Information System Activity Review (Required)",
                description: "Implement procedures to regularly review system activity",
                order_no: 4,
              },
            ],
          },
          {
            title: "Assigned Security Responsibility",
            description:
              "Identify the security official responsible for developing and implementing security policies",
            order_no: 2,
            summary: "Designate a security officer",
            questions: [
              "Is there a designated security official?",
              "Are responsibilities clearly defined?",
            ],
            evidence_examples: ["Security officer designation", "Job description"],
            items: [],
          },
          {
            title: "Workforce Security",
            description: "Implement policies and procedures to ensure appropriate access to ePHI",
            order_no: 3,
            summary: "Manage workforce access to ePHI",
            questions: ["How is workforce access determined?", "Are background checks performed?"],
            evidence_examples: ["Access authorization policy", "Background check records"],
            items: [
              {
                title: "Authorization and/or Supervision (Addressable)",
                description:
                  "Implement procedures for authorization and supervision of workforce members",
                order_no: 1,
              },
              {
                title: "Workforce Clearance Procedure (Addressable)",
                description: "Implement procedures to determine appropriate access levels",
                order_no: 2,
              },
              {
                title: "Termination Procedures (Addressable)",
                description: "Implement procedures for terminating access when employment ends",
                order_no: 3,
              },
            ],
          },
          {
            title: "Security Awareness and Training",
            description:
              "Implement a security awareness and training program for all workforce members",
            order_no: 4,
            summary: "Train workforce on security",
            questions: [
              "Is security training provided to all staff?",
              "How often is training updated?",
            ],
            evidence_examples: ["Training materials", "Training completion records"],
            items: [
              {
                title: "Security Reminders (Addressable)",
                description: "Periodic security updates",
                order_no: 1,
              },
              {
                title: "Protection from Malicious Software (Addressable)",
                description: "Procedures for guarding against and detecting malicious software",
                order_no: 2,
              },
              {
                title: "Log-in Monitoring (Addressable)",
                description: "Procedures for monitoring log-in attempts",
                order_no: 3,
              },
              {
                title: "Password Management (Addressable)",
                description: "Procedures for creating, changing, and safeguarding passwords",
                order_no: 4,
              },
            ],
          },
        ],
      },
      {
        title: "Physical Safeguards",
        description:
          "Physical measures, policies, and procedures to protect electronic systems and buildings",
        order_no: 2,
        items: [
          {
            title: "Facility Access Controls",
            description:
              "Implement policies to limit physical access to electronic information systems",
            order_no: 1,
            summary: "Control physical access to facilities",
            questions: ["How is facility access controlled?", "Are access logs maintained?"],
            evidence_examples: ["Facility access policy", "Access logs"],
            items: [
              {
                title: "Contingency Operations (Addressable)",
                description: "Procedures for facility access during emergencies",
                order_no: 1,
              },
              {
                title: "Facility Security Plan (Addressable)",
                description: "Policies to safeguard facility and equipment",
                order_no: 2,
              },
              {
                title: "Access Control and Validation (Addressable)",
                description: "Procedures to control and validate access based on role",
                order_no: 3,
              },
              {
                title: "Maintenance Records (Addressable)",
                description: "Document repairs and modifications to physical security",
                order_no: 4,
              },
            ],
          },
          {
            title: "Workstation Use",
            description: "Implement policies for proper workstation use",
            order_no: 2,
            summary: "Define acceptable workstation use",
            questions: [
              "Are workstation use policies defined?",
              "Is physical access to workstations controlled?",
            ],
            evidence_examples: ["Workstation use policy", "Physical security measures"],
            items: [],
          },
          {
            title: "Device and Media Controls",
            description:
              "Implement policies for the receipt and removal of hardware and electronic media",
            order_no: 3,
            summary: "Control devices and media containing ePHI",
            questions: ["How are devices tracked?", "How is media disposed of?"],
            evidence_examples: ["Asset inventory", "Media disposal records"],
            items: [
              {
                title: "Disposal (Required)",
                description: "Policies for final disposition of ePHI and hardware",
                order_no: 1,
              },
              {
                title: "Media Re-use (Required)",
                description: "Procedures for removal of ePHI before media reuse",
                order_no: 2,
              },
              {
                title: "Accountability (Addressable)",
                description: "Maintain record of hardware and media movements",
                order_no: 3,
              },
              {
                title: "Data Backup and Storage (Addressable)",
                description: "Create retrievable exact copy of ePHI before movement",
                order_no: 4,
              },
            ],
          },
        ],
      },
      {
        title: "Technical Safeguards",
        description: "Technology and policies for controlling access to ePHI",
        order_no: 3,
        items: [
          {
            title: "Access Control",
            description: "Implement technical policies to allow only authorized access to ePHI",
            order_no: 1,
            summary: "Control technical access to ePHI",
            questions: ["How is system access controlled?", "Are unique user IDs assigned?"],
            evidence_examples: ["Access control configuration", "User account list"],
            items: [
              {
                title: "Unique User Identification (Required)",
                description: "Assign unique name/number for tracking user identity",
                order_no: 1,
              },
              {
                title: "Emergency Access Procedure (Required)",
                description: "Procedures for obtaining necessary ePHI during emergencies",
                order_no: 2,
              },
              {
                title: "Automatic Logoff (Addressable)",
                description:
                  "Implement electronic procedures to terminate sessions after inactivity",
                order_no: 3,
              },
              {
                title: "Encryption and Decryption (Addressable)",
                description: "Implement mechanism to encrypt and decrypt ePHI",
                order_no: 4,
              },
            ],
          },
          {
            title: "Audit Controls",
            description:
              "Implement hardware, software, and procedures to record and examine system activity",
            order_no: 2,
            summary: "Monitor and audit system access",
            questions: ["Are audit logs maintained?", "How often are logs reviewed?"],
            evidence_examples: ["Audit log configuration", "Log review records"],
            items: [],
          },
          {
            title: "Transmission Security",
            description:
              "Implement technical security measures to guard against unauthorized access during transmission",
            order_no: 3,
            summary: "Protect ePHI during transmission",
            questions: ["Is ePHI encrypted in transit?", "How is transmission integrity verified?"],
            evidence_examples: ["Encryption configuration", "Network security documentation"],
            items: [
              {
                title: "Integrity Controls (Addressable)",
                description:
                  "Implement security measures to ensure ePHI is not improperly modified",
                order_no: 1,
              },
              {
                title: "Encryption (Addressable)",
                description: "Implement mechanism to encrypt ePHI when transmitted",
                order_no: 2,
              },
            ],
          },
        ],
      },
    ],
  },
};

export default hipaaStructure;
