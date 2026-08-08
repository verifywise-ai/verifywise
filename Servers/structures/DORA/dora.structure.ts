import type { FrameworkStructure } from "../types";

export const doraStructure: FrameworkStructure = {
  id: 9,
  key: "dora",
  framework_type: "dora",
  displayName: "DORA Compliance Framework",
  tables: {
    l1_struct: "dora_pillars_struct",
    l2_struct: "dora_requirements_struct",
    l2_impl: "dora_requirements",
    l2_risks: "dora_requirements__risks",
  },
  cols: {
    l2_struct_parent: "pillar_id",
    l2_impl_meta: "requirement_meta_id",
    l2_risks_impl: "requirement_id",
  },
  entity_types: {
    l2_impl: "requirement",
  },
  source_labels: {
    requirement: "DORA requirements",
  },
  seed: {
    name: "DORA Compliance Framework",
    description: "Framework for Digital Operational Resilience Act compliance",
    version: "1.0.0",
    is_organizational: true,
    hierarchy: {
      type: "two_level",
      level1_name: "Pillar",
      level2_name: "Requirement",
    },
    structure: [
      {
        title: "ICT Risk Management",
        description: "Establish comprehensive ICT risk management framework",
        order_no: 1,
        items: [
          {
            title: "ICT Risk Management Framework",
            description: "Implement a comprehensive ICT risk management framework",
            order_no: 1,
            summary: "Establish ICT risk management governance",
            questions: [
              "Is there an ICT risk management policy?",
              "Is ICT risk integrated into enterprise risk management?",
              "Are ICT risks reported to the management body?",
            ],
            evidence_examples: ["ICT risk policy", "ERM integration", "Board reports"],
          },
          {
            title: "ICT Asset Management",
            description: "Identify, classify, and document all ICT assets and their dependencies",
            order_no: 2,
            summary: "Maintain ICT asset inventory",
            questions: [
              "Are all ICT assets inventoried?",
              "Are dependencies mapped?",
              "Are critical assets identified?",
            ],
            evidence_examples: ["Asset inventory", "Dependency mapping", "Criticality assessment"],
          },
          {
            title: "ICT Business Continuity",
            description: "Establish ICT business continuity policy and plans",
            order_no: 3,
            summary: "Plan for ICT continuity",
            questions: [
              "Is there an ICT BCP?",
              "Are recovery objectives defined?",
              "Are plans tested annually?",
            ],
            evidence_examples: ["BCP documentation", "RTO/RPO definitions", "Test results"],
          },
        ],
      },
      {
        title: "ICT Incident Management",
        description:
          "Establish processes for detecting, managing, and reporting ICT-related incidents",
        order_no: 2,
        items: [
          {
            title: "Incident Detection",
            description: "Implement mechanisms to promptly detect anomalous activities",
            order_no: 1,
            summary: "Detect ICT incidents promptly",
            questions: [
              "Are monitoring systems in place?",
              "Are anomalies detected automatically?",
              "Is 24/7 monitoring available for critical systems?",
            ],
            evidence_examples: [
              "Monitoring tools",
              "Alert configuration",
              "Coverage documentation",
            ],
          },
          {
            title: "Incident Classification",
            description: "Classify ICT-related incidents based on severity and impact",
            order_no: 2,
            summary: "Classify incidents consistently",
            questions: [
              "Is there an incident classification scheme?",
              "Are major incidents clearly defined?",
              "Is classification aligned with regulatory requirements?",
            ],
            evidence_examples: [
              "Classification criteria",
              "Major incident definition",
              "Regulatory mapping",
            ],
          },
          {
            title: "Incident Reporting",
            description: "Report major ICT-related incidents to competent authorities",
            order_no: 3,
            summary: "Report incidents to regulators",
            questions: [
              "Is there a regulatory reporting process?",
              "Are reporting timelines met?",
              "Are root cause analyses performed?",
            ],
            evidence_examples: ["Reporting procedures", "Submission records", "RCA reports"],
          },
        ],
      },
      {
        title: "Digital Operational Resilience Testing",
        description: "Conduct testing of ICT systems to assess resilience capabilities",
        order_no: 3,
        items: [
          {
            title: "Vulnerability Assessments",
            description: "Conduct regular vulnerability assessments of ICT systems",
            order_no: 1,
            summary: "Assess vulnerabilities regularly",
            questions: [
              "Are vulnerability scans performed?",
              "Are findings remediated?",
              "Is scanning scope comprehensive?",
            ],
            evidence_examples: ["Scan reports", "Remediation tracking", "Scope documentation"],
          },
          {
            title: "Penetration Testing",
            description: "Conduct penetration testing based on risk assessment",
            order_no: 2,
            summary: "Test security through penetration testing",
            questions: [
              "Is penetration testing performed?",
              "Are critical systems in scope?",
              "Are findings addressed?",
            ],
            evidence_examples: [
              "Penetration test reports",
              "Scope documentation",
              "Remediation evidence",
            ],
          },
          {
            title: "Threat-Led Penetration Testing",
            description: "Conduct advanced threat-led penetration testing (TLPT) as required",
            order_no: 3,
            summary: "Perform advanced resilience testing",
            questions: [
              "Is TLPT required for your entity?",
              "Are qualified testers engaged?",
              "Are results reported to authorities?",
            ],
            evidence_examples: ["TLPT reports", "Tester qualifications", "Regulatory submissions"],
          },
        ],
      },
      {
        title: "Third-Party ICT Risk",
        description: "Manage risks arising from ICT third-party service providers",
        order_no: 4,
        items: [
          {
            title: "Third-Party Strategy",
            description: "Adopt a strategy on ICT third-party risk",
            order_no: 1,
            summary: "Define third-party ICT risk strategy",
            questions: [
              "Is there a third-party ICT strategy?",
              "Are concentration risks assessed?",
              "Is cloud strategy defined?",
            ],
            evidence_examples: ["Third-party strategy", "Concentration analysis", "Cloud policy"],
          },
          {
            title: "Due Diligence",
            description: "Conduct due diligence before engaging ICT third-party providers",
            order_no: 2,
            summary: "Assess third parties before engagement",
            questions: [
              "Is due diligence performed?",
              "Are security capabilities assessed?",
              "Are risks documented?",
            ],
            evidence_examples: [
              "Due diligence reports",
              "Assessment criteria",
              "Risk documentation",
            ],
          },
          {
            title: "Contractual Requirements",
            description: "Include required contractual provisions in ICT third-party contracts",
            order_no: 3,
            summary: "Ensure contracts meet DORA requirements",
            questions: [
              "Do contracts include required provisions?",
              "Are audit rights included?",
              "Are exit strategies defined?",
            ],
            evidence_examples: ["Contract templates", "Clause checklist", "Exit plans"],
          },
          {
            title: "Ongoing Monitoring",
            description: "Monitor ICT third-party providers on an ongoing basis",
            order_no: 4,
            summary: "Continuously monitor third parties",
            questions: [
              "Is third-party performance monitored?",
              "Are incidents tracked?",
              "Are reviews conducted periodically?",
            ],
            evidence_examples: ["Monitoring dashboards", "Incident tracking", "Review records"],
          },
        ],
      },
      {
        title: "Information Sharing",
        description: "Participate in information sharing arrangements on cyber threats",
        order_no: 5,
        items: [
          {
            title: "Threat Intelligence",
            description: "Exchange cyber threat information with other financial entities",
            order_no: 1,
            summary: "Share and receive threat intelligence",
            questions: [
              "Is threat intelligence shared?",
              "Are sharing arrangements in place?",
              "Is received intelligence actionable?",
            ],
            evidence_examples: ["Sharing agreements", "Intelligence reports", "Action records"],
          },
        ],
      },
    ],
  },
};

export default doraStructure;
