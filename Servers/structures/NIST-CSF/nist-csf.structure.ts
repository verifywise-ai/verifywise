import type { FrameworkStructure } from "../types";

export const nistCsfStructure: FrameworkStructure = {
  id: 25,
  key: "nist-csf",
  framework_type: "nist_csf",
  displayName: "NIST Cybersecurity Framework",
  tables: {
    l1_struct: "nist_csf_functions_struct",
    l2_struct: "nist_csf_categories_struct",
    l3_struct: "nist_csf_subcategories_struct",
    l2_impl: "nist_csf_categories",
    l3_impl: "nist_csf_subcategories",
    l2_risks: "nist_csf_categories__risks",
    l3_risks: "nist_csf_subcategories__risks",
  },
  cols: {
    l2_struct_parent: "function_id",
    l3_struct_parent: "category_id",
    l2_impl_meta: "category_meta_id",
    l3_impl_meta: "subcategory_meta_id",
    l3_impl_parent: "category_id",
    l2_risks_impl: "category_id",
    l3_risks_impl: "subcategory_id",
  },
  entity_types: {
    l2_impl: "category",
    l3_impl: "subcategory",
  },
  source_labels: {
    category: "NIST CSF categories",
    subcategory: "NIST CSF subcategories",
  },
  seed: {
    name: "NIST Cybersecurity Framework",
    description: "Framework for improving critical infrastructure cybersecurity",
    version: "1.1",
    is_organizational: true,
    hierarchy: {
      type: "three_level",
      level1_name: "Function",
      level2_name: "Category",
      level3_name: "Subcategory",
    },
    structure: [
      {
        title: "IDENTIFY (ID)",
        description:
          "Develop organizational understanding to manage cybersecurity risk to systems, people, assets, data, and capabilities",
        order_no: 1,
        items: [
          {
            title: "ID.AM - Asset Management",
            description:
              "The data, personnel, devices, systems, and facilities that enable the organization to achieve business purposes are identified and managed",
            order_no: 1,
            summary: "Identify and manage organizational assets",
            questions: [
              "Is there a complete inventory of physical devices?",
              "Is there an inventory of software platforms and applications?",
              "Are data flows mapped?",
            ],
            evidence_examples: ["Asset inventory", "Software inventory", "Data flow diagrams"],
            items: [
              {
                title: "ID.AM-1: Physical devices and systems are inventoried",
                order_no: 1,
              },
              {
                title: "ID.AM-2: Software platforms and applications are inventoried",
                order_no: 2,
              },
              {
                title: "ID.AM-3: Organizational communication and data flows are mapped",
                order_no: 3,
              },
              {
                title: "ID.AM-4: External information systems are catalogued",
                order_no: 4,
              },
              {
                title: "ID.AM-5: Resources are prioritized based on criticality",
                order_no: 5,
              },
            ],
          },
          {
            title: "ID.RA - Risk Assessment",
            description:
              "The organization understands the cybersecurity risk to organizational operations, assets, and individuals",
            order_no: 2,
            summary: "Assess cybersecurity risks",
            questions: [
              "Are asset vulnerabilities identified and documented?",
              "Is threat intelligence received from information sharing forums?",
              "Are risks determined and prioritized?",
            ],
            evidence_examples: [
              "Vulnerability assessments",
              "Threat intelligence reports",
              "Risk register",
            ],
            items: [
              {
                title: "ID.RA-1: Asset vulnerabilities are identified and documented",
                order_no: 1,
              },
              {
                title:
                  "ID.RA-2: Cyber threat intelligence is received from information sharing forums",
                order_no: 2,
              },
              {
                title: "ID.RA-3: Threats are identified and documented",
                order_no: 3,
              },
              {
                title: "ID.RA-4: Potential business impacts and likelihoods are identified",
                order_no: 4,
              },
              {
                title: "ID.RA-5: Threats, vulnerabilities, likelihoods, and impacts determine risk",
                order_no: 5,
              },
            ],
          },
          {
            title: "ID.GV - Governance",
            description:
              "Policies, procedures, and processes to manage and monitor regulatory, legal, risk, environmental, and operational requirements",
            order_no: 3,
            summary: "Establish cybersecurity governance",
            questions: [
              "Is there an organizational cybersecurity policy?",
              "Are roles and responsibilities coordinated?",
              "Are legal and regulatory requirements understood?",
            ],
            evidence_examples: [
              "Cybersecurity policy",
              "Governance structure",
              "Compliance requirements",
            ],
            items: [
              {
                title: "ID.GV-1: Organizational cybersecurity policy is established",
                order_no: 1,
              },
              {
                title: "ID.GV-2: Cybersecurity roles and responsibilities are coordinated",
                order_no: 2,
              },
              {
                title: "ID.GV-3: Legal and regulatory requirements are understood",
                order_no: 3,
              },
              {
                title: "ID.GV-4: Governance and risk management processes address cybersecurity",
                order_no: 4,
              },
            ],
          },
        ],
      },
      {
        title: "PROTECT (PR)",
        description:
          "Develop and implement appropriate safeguards to ensure delivery of critical services",
        order_no: 2,
        items: [
          {
            title: "PR.AC - Access Control",
            description:
              "Access to physical and logical assets and associated facilities is limited to authorized users, processes, and devices",
            order_no: 1,
            summary: "Manage access to assets",
            questions: [
              "Are identities and credentials managed?",
              "Is physical access to assets managed and protected?",
              "Is remote access managed?",
            ],
            evidence_examples: [
              "Identity management system",
              "Physical access controls",
              "Remote access policy",
            ],
            items: [
              {
                title: "PR.AC-1: Identities and credentials are issued, managed, verified, revoked",
                order_no: 1,
              },
              {
                title: "PR.AC-2: Physical access to assets is managed and protected",
                order_no: 2,
              },
              {
                title: "PR.AC-3: Remote access is managed",
                order_no: 3,
              },
              {
                title: "PR.AC-4: Access permissions and authorizations are managed",
                order_no: 4,
              },
              {
                title: "PR.AC-5: Network integrity is protected (segregation, segmentation)",
                order_no: 5,
              },
            ],
          },
          {
            title: "PR.AT - Awareness and Training",
            description:
              "Organization's personnel and partners are provided cybersecurity awareness education",
            order_no: 2,
            summary: "Security awareness training",
            questions: [
              "Are all users informed and trained?",
              "Do privileged users understand their responsibilities?",
              "Do third parties understand their responsibilities?",
            ],
            evidence_examples: ["Training records", "Awareness program", "Third-party agreements"],
            items: [
              {
                title: "PR.AT-1: All users are informed and trained",
                order_no: 1,
              },
              {
                title: "PR.AT-2: Privileged users understand their responsibilities",
                order_no: 2,
              },
              {
                title: "PR.AT-3: Third-party stakeholders understand their responsibilities",
                order_no: 3,
              },
              {
                title: "PR.AT-4: Senior executives understand their responsibilities",
                order_no: 4,
              },
              {
                title:
                  "PR.AT-5: Physical and cybersecurity personnel understand their responsibilities",
                order_no: 5,
              },
            ],
          },
          {
            title: "PR.DS - Data Security",
            description:
              "Information and records are managed consistent with risk strategy to protect confidentiality, integrity, and availability",
            order_no: 3,
            summary: "Protect data at rest and in transit",
            questions: [
              "Is data-at-rest protected?",
              "Is data-in-transit protected?",
              "Is data disposed of securely?",
            ],
            evidence_examples: [
              "Encryption standards",
              "Data handling procedures",
              "Disposal records",
            ],
            items: [
              {
                title: "PR.DS-1: Data-at-rest is protected",
                order_no: 1,
              },
              {
                title: "PR.DS-2: Data-in-transit is protected",
                order_no: 2,
              },
              {
                title:
                  "PR.DS-3: Assets are formally managed throughout removal, transfers, disposition",
                order_no: 3,
              },
              {
                title: "PR.DS-4: Adequate capacity to ensure availability is maintained",
                order_no: 4,
              },
              {
                title: "PR.DS-5: Protections against data leaks are implemented",
                order_no: 5,
              },
            ],
          },
        ],
      },
      {
        title: "DETECT (DE)",
        description:
          "Develop and implement appropriate activities to identify the occurrence of a cybersecurity event",
        order_no: 3,
        items: [
          {
            title: "DE.AE - Anomalies and Events",
            description:
              "Anomalous activity is detected and the potential impact of events is understood",
            order_no: 1,
            summary: "Detect anomalous activity",
            questions: [
              "Is a baseline of network operations established?",
              "Are detected events analyzed?",
              "Is event data collected and correlated?",
            ],
            evidence_examples: [
              "Network baselines",
              "Event analysis reports",
              "SIEM configuration",
            ],
            items: [
              {
                title: "DE.AE-1: A baseline of network operations is established and managed",
                order_no: 1,
              },
              {
                title:
                  "DE.AE-2: Detected events are analyzed to understand attack targets and methods",
                order_no: 2,
              },
              {
                title: "DE.AE-3: Event data are collected and correlated from multiple sources",
                order_no: 3,
              },
              {
                title: "DE.AE-4: Impact of events is determined",
                order_no: 4,
              },
              {
                title: "DE.AE-5: Incident alert thresholds are established",
                order_no: 5,
              },
            ],
          },
          {
            title: "DE.CM - Security Continuous Monitoring",
            description:
              "The information system and assets are monitored to identify cybersecurity events and verify effectiveness of protective measures",
            order_no: 2,
            summary: "Continuous security monitoring",
            questions: [
              "Is the network monitored to detect potential cybersecurity events?",
              "Is the physical environment monitored?",
              "Are vulnerability scans performed?",
            ],
            evidence_examples: ["Monitoring tools", "Scan reports", "Alert logs"],
            items: [
              {
                title: "DE.CM-1: The network is monitored to detect potential cybersecurity events",
                order_no: 1,
              },
              {
                title: "DE.CM-2: The physical environment is monitored to detect potential events",
                order_no: 2,
              },
              {
                title: "DE.CM-3: Personnel activity is monitored to detect potential events",
                order_no: 3,
              },
              {
                title: "DE.CM-4: Malicious code is detected",
                order_no: 4,
              },
              {
                title: "DE.CM-5: Unauthorized mobile code is detected",
                order_no: 5,
              },
            ],
          },
        ],
      },
      {
        title: "RESPOND (RS)",
        description:
          "Develop and implement appropriate activities to take action regarding a detected cybersecurity incident",
        order_no: 4,
        items: [
          {
            title: "RS.RP - Response Planning",
            description: "Response processes and procedures are executed and maintained",
            order_no: 1,
            summary: "Execute incident response plan",
            questions: [
              "Is there a response plan that is executed during or after an incident?",
              "Are response plans tested?",
            ],
            evidence_examples: [
              "Incident response plan",
              "Response exercises",
              "After-action reports",
            ],
            items: [
              {
                title: "RS.RP-1: Response plan is executed during or after an incident",
                order_no: 1,
              },
            ],
          },
          {
            title: "RS.CO - Communications",
            description:
              "Response activities are coordinated with internal and external stakeholders",
            order_no: 2,
            summary: "Coordinate incident response communications",
            questions: [
              "Do personnel know their roles and order of operations during response?",
              "Are events reported consistent with established criteria?",
              "Is information shared consistent with response plans?",
            ],
            evidence_examples: ["Communication plan", "Reporting procedures", "Contact lists"],
            items: [
              {
                title: "RS.CO-1: Personnel know their roles and order of operations",
                order_no: 1,
              },
              {
                title: "RS.CO-2: Incidents are reported consistent with established criteria",
                order_no: 2,
              },
              {
                title: "RS.CO-3: Information is shared consistent with response plans",
                order_no: 3,
              },
              {
                title:
                  "RS.CO-4: Coordination with stakeholders occurs consistent with response plans",
                order_no: 4,
              },
              {
                title: "RS.CO-5: Voluntary information sharing occurs with external stakeholders",
                order_no: 5,
              },
            ],
          },
        ],
      },
      {
        title: "RECOVER (RC)",
        description:
          "Develop and implement appropriate activities to maintain plans for resilience and to restore capabilities or services impaired due to a cybersecurity incident",
        order_no: 5,
        items: [
          {
            title: "RC.RP - Recovery Planning",
            description: "Recovery processes and procedures are executed and maintained",
            order_no: 1,
            summary: "Execute recovery plans",
            questions: [
              "Is there a recovery plan that is executed during or after a cybersecurity incident?",
              "Are recovery plans tested?",
            ],
            evidence_examples: ["Recovery plan", "BCP/DR documentation", "Recovery test results"],
            items: [
              {
                title:
                  "RC.RP-1: Recovery plan is executed during or after a cybersecurity incident",
                order_no: 1,
              },
            ],
          },
          {
            title: "RC.IM - Improvements",
            description:
              "Recovery planning and processes are improved by incorporating lessons learned",
            order_no: 2,
            summary: "Improve recovery capabilities",
            questions: [
              "Are recovery plans updated based on lessons learned?",
              "Are recovery strategies updated?",
            ],
            evidence_examples: [
              "Lessons learned reports",
              "Updated recovery plans",
              "Improvement tracking",
            ],
            items: [
              {
                title: "RC.IM-1: Recovery plans incorporate lessons learned",
                order_no: 1,
              },
              {
                title: "RC.IM-2: Recovery strategies are updated",
                order_no: 2,
              },
            ],
          },
        ],
      },
    ],
  },
};

export default nistCsfStructure;
