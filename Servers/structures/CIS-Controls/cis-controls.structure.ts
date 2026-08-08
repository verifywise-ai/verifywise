import type { FrameworkStructure } from "../types";

export const cisControlsStructure: FrameworkStructure = {
  id: 13,
  key: "cis-controls",
  framework_type: "cis_controls",
  displayName: "CIS Controls v8",
  tables: {
    l1_struct: "cis_controls_struct",
    l2_struct: "cis_safeguards_struct",
    l2_impl: "cis_safeguards",
    l2_risks: "cis_safeguards__risks",
  },
  cols: {
    l2_struct_parent: "control_id",
    l2_impl_meta: "safeguard_meta_id",
    l2_risks_impl: "safeguard_id",
  },
  entity_types: {
    l2_impl: "safeguard",
  },
  source_labels: {
    safeguard: "CIS Controls safeguards",
  },
  seed: {
    name: "CIS Controls v8",
    description: "Center for Internet Security Critical Security Controls Version 8",
    version: "8.0",
    is_organizational: true,
    hierarchy: {
      type: "two_level",
      level1_name: "Control",
      level2_name: "Safeguard",
    },
    structure: [
      {
        title: "Control 1: Inventory and Control of Enterprise Assets",
        description: "Actively manage all enterprise assets connected to the infrastructure",
        order_no: 1,
        items: [
          {
            title: "1.1 Establish and Maintain Detailed Enterprise Asset Inventory",
            description:
              "Establish and maintain an accurate, detailed, and up-to-date inventory of all enterprise assets",
            order_no: 1,
            summary: "Maintain comprehensive asset inventory",
            questions: ["Is there a complete asset inventory?", "How often is it updated?"],
            evidence_examples: ["Asset inventory database", "Update logs"],
          },
          {
            title: "1.2 Address Unauthorized Assets",
            description:
              "Ensure that a process exists to address unauthorized assets on a weekly basis",
            order_no: 2,
            summary: "Remove or quarantine unauthorized assets",
            questions: [
              "How are unauthorized assets detected?",
              "What is the remediation process?",
            ],
            evidence_examples: ["Unauthorized asset reports", "Remediation records"],
          },
          {
            title: "1.3 Utilize an Active Discovery Tool",
            description:
              "Utilize an active discovery tool to identify assets connected to the enterprise's network",
            order_no: 3,
            summary: "Use automated asset discovery",
            questions: ["What discovery tools are used?", "How frequently are scans run?"],
            evidence_examples: ["Discovery tool configuration", "Scan schedules"],
          },
        ],
      },
      {
        title: "Control 2: Inventory and Control of Software Assets",
        description:
          "Actively manage all software on the network so only authorized software is installed and can execute",
        order_no: 2,
        items: [
          {
            title: "2.1 Establish and Maintain a Software Inventory",
            description:
              "Establish and maintain a detailed inventory of all licensed software installed on enterprise assets",
            order_no: 1,
            summary: "Maintain software inventory",
            questions: ["Is all software inventoried?", "Are licenses tracked?"],
            evidence_examples: ["Software inventory", "License management records"],
          },
          {
            title: "2.2 Ensure Authorized Software is Currently Supported",
            description:
              "Ensure that only currently supported software is designated as authorized",
            order_no: 2,
            summary: "Use only supported software",
            questions: ["Is end-of-life software tracked?", "What is the upgrade process?"],
            evidence_examples: ["EOL tracking", "Upgrade plans"],
          },
          {
            title: "2.3 Address Unauthorized Software",
            description:
              "Ensure that unauthorized software is either removed or the inventory is updated",
            order_no: 3,
            summary: "Remove unauthorized software",
            questions: ["How is unauthorized software detected?", "What is the removal process?"],
            evidence_examples: ["Software audit reports", "Removal logs"],
          },
        ],
      },
      {
        title: "Control 3: Data Protection",
        description:
          "Develop processes and technical controls to identify, classify, securely handle, retain, and dispose of data",
        order_no: 3,
        items: [
          {
            title: "3.1 Establish and Maintain a Data Management Process",
            description: "Establish and maintain a data management process",
            order_no: 1,
            summary: "Implement data management practices",
            questions: ["Is there a data management policy?", "Are data owners assigned?"],
            evidence_examples: ["Data management policy", "Data ownership records"],
          },
          {
            title: "3.2 Establish and Maintain a Data Inventory",
            description:
              "Establish and maintain a data inventory based on the enterprise's data management process",
            order_no: 2,
            summary: "Catalog enterprise data",
            questions: ["Is sensitive data inventoried?", "Is data classified?"],
            evidence_examples: ["Data inventory", "Data classification records"],
          },
          {
            title: "3.3 Configure Data Access Control Lists",
            description: "Configure data access control lists based on a user's need to know",
            order_no: 3,
            summary: "Implement need-to-know access controls",
            questions: [
              "Are ACLs configured based on need-to-know?",
              "How often are ACLs reviewed?",
            ],
            evidence_examples: ["ACL configuration", "Access review records"],
          },
        ],
      },
      {
        title: "Control 4: Secure Configuration of Enterprise Assets and Software",
        description:
          "Establish and maintain the secure configuration of enterprise assets and software",
        order_no: 4,
        items: [
          {
            title: "4.1 Establish and Maintain a Secure Configuration Process",
            description:
              "Establish and maintain a secure configuration process for enterprise assets and software",
            order_no: 1,
            summary: "Define secure configuration standards",
            questions: ["Are secure baselines defined?", "How are configurations validated?"],
            evidence_examples: ["Configuration standards", "Validation procedures"],
          },
          {
            title:
              "4.2 Establish and Maintain a Secure Configuration Process for Network Infrastructure",
            description:
              "Establish and maintain a secure configuration process for network devices",
            order_no: 2,
            summary: "Secure network device configurations",
            questions: ["Are network devices hardened?", "Are configurations backed up?"],
            evidence_examples: ["Network hardening standards", "Configuration backups"],
          },
        ],
      },
      {
        title: "Control 5: Account Management",
        description:
          "Use processes and tools to assign and manage authorization to credentials for user accounts",
        order_no: 5,
        items: [
          {
            title: "5.1 Establish and Maintain an Inventory of Accounts",
            description:
              "Establish and maintain an inventory of all accounts managed in the enterprise",
            order_no: 1,
            summary: "Maintain account inventory",
            questions: ["Are all accounts inventoried?", "Are service accounts tracked?"],
            evidence_examples: ["Account inventory", "Service account list"],
          },
          {
            title: "5.2 Use Unique Passwords",
            description: "Use unique passwords for all enterprise assets",
            order_no: 2,
            summary: "Enforce unique password policy",
            questions: ["Are unique passwords required?", "Is password reuse prevented?"],
            evidence_examples: ["Password policy", "Technical controls"],
          },
          {
            title: "5.3 Disable Dormant Accounts",
            description:
              "Delete or disable any dormant accounts after a period of 45 days of inactivity",
            order_no: 3,
            summary: "Remove inactive accounts",
            questions: [
              "How are dormant accounts identified?",
              "What is the inactivity threshold?",
            ],
            evidence_examples: ["Dormant account reports", "Disablement logs"],
          },
        ],
      },
      {
        title: "Control 6: Access Control Management",
        description:
          "Use processes and tools to create, assign, manage, and revoke access credentials and privileges",
        order_no: 6,
        items: [
          {
            title: "6.1 Establish an Access Granting Process",
            description:
              "Establish and follow a process to grant access to enterprise assets and software",
            order_no: 1,
            summary: "Define access request process",
            questions: ["Is there an access request process?", "Who approves access?"],
            evidence_examples: ["Access request forms", "Approval records"],
          },
          {
            title: "6.2 Establish an Access Revoking Process",
            description:
              "Establish and follow a process to revoke access to enterprise assets and software",
            order_no: 2,
            summary: "Define access revocation process",
            questions: ["How quickly is access revoked?", "Is there a termination checklist?"],
            evidence_examples: ["Revocation process", "Termination checklists"],
          },
        ],
      },
    ],
  },
};

export default cisControlsStructure;
