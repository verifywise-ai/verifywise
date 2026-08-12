import type { FrameworkStructure } from "../types";

export const pciDssStructure: FrameworkStructure = {
  id: 7,
  key: "pci-dss",
  framework_type: "pci_dss",
  displayName: "PCI-DSS Lite Framework",
  tables: {
    l1_struct: "pci_dss_requirement_groups_struct",
    l2_struct: "pci_dss_requirements_struct",
    l2_impl: "pci_dss_requirements",
    l2_risks: "pci_dss_requirements__risks",
  },
  cols: {
    l2_struct_parent: "requirement_group_id",
    l2_impl_meta: "requirement_meta_id",
    l2_risks_impl: "requirement_id",
  },
  entity_types: {
    l2_impl: "requirement",
  },
  source_labels: {
    requirement: "PCI DSS requirements",
  },
  seed: {
    name: "PCI-DSS Lite Framework",
    description: "Essential PCI-DSS requirements for payment card data protection",
    version: "1.0.0",
    is_organizational: false,
    hierarchy: {
      type: "two_level",
      level1_name: "Requirement Group",
      level2_name: "Requirement",
    },
    structure: [
      {
        title: "Build and Maintain a Secure Network",
        description: "Requirements for network security infrastructure",
        order_no: 1,
        items: [
          {
            title: "Req 1: Install and maintain firewall configuration",
            description: "Install and maintain a firewall configuration to protect cardholder data",
            order_no: 1,
            summary: "Protect network boundaries with firewalls",
            questions: [
              "Are firewalls deployed at all network boundaries?",
              "Is there a firewall rule review process?",
              "Are default passwords changed?",
            ],
            evidence_examples: ["Firewall configuration", "Network diagram", "Rule review records"],
          },
          {
            title: "Req 2: Do not use vendor-supplied defaults",
            description:
              "Do not use vendor-supplied defaults for passwords and security parameters",
            order_no: 2,
            summary: "Change all default credentials and settings",
            questions: [
              "Are default passwords changed?",
              "Are unnecessary services disabled?",
              "Is there a hardening standard?",
            ],
            evidence_examples: [
              "Hardening standards",
              "Configuration baselines",
              "Password policy",
            ],
          },
        ],
      },
      {
        title: "Protect Cardholder Data",
        description: "Requirements for protecting stored and transmitted cardholder data",
        order_no: 2,
        items: [
          {
            title: "Req 3: Protect stored cardholder data",
            description:
              "Protect stored cardholder data using encryption, truncation, masking, and hashing",
            order_no: 1,
            summary: "Minimize and protect stored card data",
            questions: [
              "Is cardholder data encrypted at rest?",
              "Is data retention minimized?",
              "Are PANs masked when displayed?",
            ],
            evidence_examples: [
              "Encryption configuration",
              "Data retention policy",
              "Data flow diagram",
            ],
          },
          {
            title: "Req 4: Encrypt transmission of cardholder data",
            description: "Encrypt transmission of cardholder data across open, public networks",
            order_no: 2,
            summary: "Protect card data in transit",
            questions: [
              "Is TLS 1.2+ used for transmission?",
              "Are wireless networks secured?",
              "Is email transmission of PANs prohibited?",
            ],
            evidence_examples: [
              "TLS configuration",
              "Wireless security config",
              "Data handling procedures",
            ],
          },
        ],
      },
      {
        title: "Maintain a Vulnerability Management Program",
        description: "Requirements for managing system vulnerabilities",
        order_no: 3,
        items: [
          {
            title: "Req 5: Use and update anti-virus software",
            description: "Use and regularly update anti-virus software or programs",
            order_no: 1,
            summary: "Deploy and maintain anti-malware protection",
            questions: [
              "Is anti-virus deployed on all systems?",
              "Are virus definitions current?",
              "Are scans performed regularly?",
            ],
            evidence_examples: ["AV deployment report", "Definition update logs", "Scan schedules"],
          },
          {
            title: "Req 6: Develop and maintain secure systems",
            description: "Develop and maintain secure systems and applications",
            order_no: 2,
            summary: "Build security into development processes",
            questions: [
              "Are security patches applied promptly?",
              "Is there a secure development lifecycle?",
              "Are code reviews performed?",
            ],
            evidence_examples: [
              "Patch management records",
              "SDLC documentation",
              "Code review logs",
            ],
          },
        ],
      },
      {
        title: "Implement Strong Access Control Measures",
        description: "Requirements for restricting access to cardholder data",
        order_no: 4,
        items: [
          {
            title: "Req 7: Restrict access to cardholder data",
            description: "Restrict access to cardholder data by business need to know",
            order_no: 1,
            summary: "Limit access to those who need it",
            questions: [
              "Is access based on job function?",
              "Is there a least privilege policy?",
              "How is access approved?",
            ],
            evidence_examples: [
              "Access control policy",
              "Role definitions",
              "Access approval records",
            ],
          },
          {
            title: "Req 8: Assign unique ID to each person",
            description: "Assign a unique ID to each person with computer access",
            order_no: 2,
            summary: "Ensure individual accountability",
            questions: [
              "Does everyone have a unique ID?",
              "Is MFA implemented?",
              "How are passwords managed?",
            ],
            evidence_examples: ["User account list", "MFA configuration", "Password policy"],
          },
        ],
      },
      {
        title: "Monitor and Test Networks",
        description: "Requirements for monitoring access and testing security",
        order_no: 5,
        items: [
          {
            title: "Req 10: Track and monitor access",
            description: "Track and monitor all access to network resources and cardholder data",
            order_no: 1,
            summary: "Maintain audit trails",
            questions: [
              "Are all access attempts logged?",
              "Are logs protected from modification?",
              "How long are logs retained?",
            ],
            evidence_examples: [
              "Logging configuration",
              "Log retention policy",
              "Log review records",
            ],
          },
          {
            title: "Req 11: Test security systems regularly",
            description: "Regularly test security systems and processes",
            order_no: 2,
            summary: "Validate security controls through testing",
            questions: [
              "Are vulnerability scans performed quarterly?",
              "Are penetration tests performed annually?",
              "Is wireless scanning performed?",
            ],
            evidence_examples: [
              "Vulnerability scan reports",
              "Penetration test reports",
              "Remediation tracking",
            ],
          },
        ],
      },
    ],
  },
};

export default pciDssStructure;
