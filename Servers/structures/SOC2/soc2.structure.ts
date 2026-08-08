import type { FrameworkStructure } from "../types";

export const soc2Structure: FrameworkStructure = {
  id: 5,
  key: "soc2",
  framework_type: "soc2",
  displayName: "SOC 2 Type II Framework",
  tables: {
    l1_struct: "soc2_trust_service_categories_struct",
    l2_struct: "soc2_controls_struct",
    l2_impl: "soc2_controls",
    l2_risks: "soc2_controls__risks",
  },
  cols: {
    l2_struct_parent: "trust_service_category_id",
    l2_impl_meta: "control_meta_id",
    l2_risks_impl: "control_id",
  },
  entity_types: {
    l2_impl: "control",
  },
  source_labels: {
    control: "SOC 2 controls",
  },
  seed: {
    name: "SOC 2 Type II Framework",
    description: "Framework based on AICPA Trust Services Criteria for SOC 2 compliance",
    version: "1.0.0",
    is_organizational: true,
    hierarchy: {
      type: "two_level",
      level1_name: "Trust Service Category",
      level2_name: "Control",
    },
    structure: [
      {
        title: "CC1: Control Environment",
        description:
          "The set of standards, processes, and structures that provide the basis for carrying out internal control",
        order_no: 1,
        items: [
          {
            title: "CC1.1 - Commitment to Integrity and Ethics",
            description: "The entity demonstrates a commitment to integrity and ethical values",
            order_no: 1,
            summary: "Establish and communicate ethical standards",
            questions: [
              "Is there a code of conduct?",
              "How are ethical standards communicated?",
              "How are violations handled?",
            ],
            evidence_examples: [
              "Code of conduct",
              "Ethics training records",
              "Disciplinary action records",
            ],
          },
          {
            title: "CC1.2 - Board Independence and Oversight",
            description: "The board of directors demonstrates independence and exercises oversight",
            order_no: 2,
            summary: "Ensure board provides effective oversight",
            questions: [
              "Does the board have independent members?",
              "How often does the board meet?",
              "What is the scope of board oversight?",
            ],
            evidence_examples: [
              "Board charter",
              "Board meeting minutes",
              "Independence declarations",
            ],
          },
          {
            title: "CC1.3 - Management Structure and Authority",
            description: "Management establishes structures, reporting lines, and authorities",
            order_no: 3,
            summary: "Define clear organizational structure",
            questions: [
              "Is the org structure documented?",
              "Are roles and responsibilities clear?",
              "Are reporting lines defined?",
            ],
            evidence_examples: ["Organization chart", "Job descriptions", "RACI matrix"],
          },
        ],
      },
      {
        title: "CC2: Communication and Information",
        description: "Information necessary to support the functioning of internal control",
        order_no: 2,
        items: [
          {
            title: "CC2.1 - Internal Communication",
            description:
              "The entity internally communicates information necessary to support internal control",
            order_no: 1,
            summary: "Ensure effective internal communication",
            questions: [
              "How is control information communicated internally?",
              "Are policies accessible to employees?",
              "Is there a process for reporting issues?",
            ],
            evidence_examples: [
              "Internal communication records",
              "Policy distribution logs",
              "Whistleblower program",
            ],
          },
          {
            title: "CC2.2 - External Communication",
            description: "The entity communicates with external parties",
            order_no: 2,
            summary: "Manage external communications effectively",
            questions: [
              "How are commitments communicated to customers?",
              "Is there external reporting on controls?",
              "How are third parties informed of requirements?",
            ],
            evidence_examples: [
              "Customer contracts",
              "Service level agreements",
              "External audit reports",
            ],
          },
        ],
      },
      {
        title: "CC3: Risk Assessment",
        description: "The process of identifying, analyzing, and managing risks",
        order_no: 3,
        items: [
          {
            title: "CC3.1 - Risk Identification",
            description:
              "The entity identifies and assesses risks to the achievement of objectives",
            order_no: 1,
            summary: "Identify risks that could impact objectives",
            questions: [
              "Is there a formal risk assessment process?",
              "How often are risks reassessed?",
              "Are emerging risks considered?",
            ],
            evidence_examples: [
              "Risk assessment methodology",
              "Risk register",
              "Risk assessment reports",
            ],
          },
          {
            title: "CC3.2 - Fraud Risk Assessment",
            description: "The entity considers the potential for fraud",
            order_no: 2,
            summary: "Assess and address fraud risks",
            questions: [
              "Is fraud risk specifically assessed?",
              "Are fraud scenarios documented?",
              "What anti-fraud controls exist?",
            ],
            evidence_examples: [
              "Fraud risk assessment",
              "Anti-fraud policy",
              "Fraud detection controls",
            ],
          },
          {
            title: "CC3.3 - Change Management Risk",
            description:
              "The entity identifies and assesses changes that could impact internal control",
            order_no: 3,
            summary: "Manage risks from organizational changes",
            questions: [
              "How are changes assessed for risk?",
              "Is there a change management process?",
              "Are control impacts evaluated?",
            ],
            evidence_examples: [
              "Change management policy",
              "Change risk assessments",
              "Change approval records",
            ],
          },
        ],
      },
      {
        title: "CC6: Logical and Physical Access Controls",
        description: "Controls over logical and physical access to systems and facilities",
        order_no: 4,
        items: [
          {
            title: "CC6.1 - Logical Access Security",
            description: "The entity implements logical access security software and policies",
            order_no: 1,
            summary: "Control access to systems and data",
            questions: [
              "Is access based on least privilege?",
              "Is multi-factor authentication used?",
              "How is access provisioned and revoked?",
            ],
            evidence_examples: [
              "Access control policy",
              "MFA configuration",
              "Access provisioning procedures",
            ],
          },
          {
            title: "CC6.2 - Access Registration and Authorization",
            description: "The entity registers and authorizes users prior to granting access",
            order_no: 2,
            summary: "Ensure proper access authorization",
            questions: [
              "Is there an access request process?",
              "Who approves access requests?",
              "Is access reviewed periodically?",
            ],
            evidence_examples: [
              "Access request forms",
              "Access approval records",
              "Access review reports",
            ],
          },
          {
            title: "CC6.3 - Access Removal",
            description: "The entity removes access when no longer needed",
            order_no: 3,
            summary: "Timely removal of access",
            questions: [
              "Is access removed upon termination?",
              "How quickly is access revoked?",
              "Is there a process for role changes?",
            ],
            evidence_examples: [
              "Termination checklist",
              "Access removal logs",
              "Role change procedures",
            ],
          },
        ],
      },
      {
        title: "CC7: System Operations",
        description: "Controls over system operations and monitoring",
        order_no: 5,
        items: [
          {
            title: "CC7.1 - Vulnerability Management",
            description: "The entity detects and monitors vulnerabilities",
            order_no: 1,
            summary: "Identify and address system vulnerabilities",
            questions: [
              "Are vulnerability scans performed regularly?",
              "How are vulnerabilities prioritized?",
              "What is the remediation timeline?",
            ],
            evidence_examples: [
              "Vulnerability scan reports",
              "Remediation tracking",
              "Patch management records",
            ],
          },
          {
            title: "CC7.2 - Security Monitoring",
            description: "The entity monitors system components for anomalies and security events",
            order_no: 2,
            summary: "Monitor for security incidents",
            questions: [
              "Is there continuous monitoring?",
              "What events trigger alerts?",
              "How are alerts investigated?",
            ],
            evidence_examples: ["SIEM configuration", "Alert rules", "Incident logs"],
          },
          {
            title: "CC7.3 - Incident Response",
            description: "The entity responds to identified security incidents",
            order_no: 3,
            summary: "Effectively respond to security incidents",
            questions: [
              "Is there an incident response plan?",
              "Are roles defined for incident response?",
              "Are incidents documented and reviewed?",
            ],
            evidence_examples: [
              "Incident response plan",
              "Incident reports",
              "Post-incident reviews",
            ],
          },
        ],
      },
    ],
  },
};

export default soc2Structure;
