import type { FrameworkStructure } from "../types";

export const altaiStructure: FrameworkStructure = {
  id: 10,
  key: "altai",
  framework_type: "altai",
  displayName: "ALTAI - Assessment List for Trustworthy AI",
  tables: {
    l1_struct: "altai_requirements_struct",
    l2_struct: "altai_assessment_areas_struct",
    l2_impl: "altai_assessment_areas",
    l2_risks: "altai_assessment_areas__risks",
  },
  cols: {
    l2_struct_parent: "requirement_id",
    l2_impl_meta: "assessment_area_meta_id",
    l2_risks_impl: "assessment_area_id",
  },
  entity_types: {
    l2_impl: "assessment_area",
  },
  source_labels: {
    assessment_area: "ALTAI assessment areas",
  },
  seed: {
    name: "ALTAI - Assessment List for Trustworthy AI",
    description:
      "The Assessment List for Trustworthy Artificial Intelligence (ALTAI) is a practical tool developed by the High-Level Expert Group on AI to help organizations self-assess their AI systems against the requirements of Trustworthy AI.",
    version: "1.0.0",
    is_organizational: false,
    hierarchy: {
      type: "two_level",
      level1_name: "Requirement",
      level2_name: "Assessment Area",
    },
    structure: [
      {
        title: "1. Human Agency and Oversight",
        description:
          "AI systems should support human autonomy and decision-making. This includes the right not to be subject to a decision based solely on automated processing when this produces legal effects or significantly affects users.",
        order_no: 1,
        items: [
          {
            title: "1.1 Human Agency and Autonomy",
            description:
              "Respect human autonomy and ensure AI systems do not subordinate, coerce, deceive, or manipulate users.",
            order_no: 1,
            summary: "Protect human autonomy and self-determination",
            questions: [
              "Is the AI system designed to interact with, guide, or make decisions for end-users?",
              "Could the AI system affect human autonomy by interfering with decision-making?",
              "Are measures in place to ensure the AI system does not manipulate users?",
              "Is there risk of over-reliance or attachment to the AI system?",
            ],
            evidence_examples: [
              "Human autonomy assessment",
              "User interaction design",
              "Manipulation prevention controls",
              "Over-reliance mitigation measures",
            ],
          },
          {
            title: "1.2 Human Oversight",
            description:
              "Enable human oversight through governance mechanisms such as human-in-the-loop, human-on-the-loop, or human-in-command approaches.",
            order_no: 2,
            summary: "Ensure appropriate human control over AI decisions",
            questions: [
              "Is human oversight ensured through human-in-the-loop, on-the-loop, or in-command approaches?",
              "Can humans decide not to use the AI system or override its decisions?",
              "Are there mechanisms to stop the AI system if needed?",
              "Is there capability to intervene in real-time during AI system operation?",
            ],
            evidence_examples: [
              "Human oversight procedures",
              "Override mechanisms",
              "Stop/intervention capabilities",
              "Governance documentation",
            ],
          },
        ],
      },
      {
        title: "2. Technical Robustness and Safety",
        description:
          "AI systems should be resilient, secure, safe, and reliable, with fallback plans to prevent unintended adverse impacts.",
        order_no: 2,
        items: [
          {
            title: "2.1 Resilience to Attack and Security",
            description:
              "Protect AI systems against vulnerabilities that could be exploited by adversaries.",
            order_no: 1,
            summary: "Secure AI systems against attacks and vulnerabilities",
            questions: [
              "Are potential vulnerabilities assessed including data poisoning, model evasion, and model inversion?",
              "Is the AI system certified for cybersecurity or adversarial robustness?",
              "Are measures in place to ensure data and model integrity?",
              "Is there a process to continuously assess and address security risks?",
            ],
            evidence_examples: [
              "Vulnerability assessment",
              "Security certifications",
              "Integrity verification",
              "Security risk process",
            ],
          },
          {
            title: "2.2 General Safety",
            description: "Ensure the AI system operates safely and does not cause harm.",
            order_no: 2,
            summary: "Maintain operational safety of AI systems",
            questions: [
              "Have risks, risk metrics, and risk levels been defined for the AI system?",
              "Is the AI system certified for safety?",
              "Are there safeguards to prevent safety risks from materializing?",
              "Is potential misuse of the AI system assessed and mitigated?",
            ],
            evidence_examples: [
              "Risk assessment",
              "Safety certifications",
              "Safeguard documentation",
              "Misuse prevention measures",
            ],
          },
          {
            title: "2.3 Accuracy",
            description:
              "Ensure AI systems achieve appropriate levels of accuracy for their intended purpose.",
            order_no: 3,
            summary: "Validate and maintain AI system accuracy",
            questions: [
              "Is the level of accuracy required for the AI system's purpose assessed?",
              "Are accuracy metrics measured and documented?",
              "Is accuracy communicated to users appropriately?",
              "Is there a process to ensure accuracy is maintained over time?",
            ],
            evidence_examples: [
              "Accuracy requirements",
              "Performance metrics",
              "User communications",
              "Monitoring procedures",
            ],
          },
          {
            title: "2.4 Reliability and Reproducibility",
            description: "Ensure AI system outputs are reliable, reproducible, and consistent.",
            order_no: 4,
            summary: "Ensure consistent and reproducible AI behavior",
            questions: [
              "Are mechanisms in place to ensure reliability and reproducibility of AI outputs?",
              "Is there a strategy for handling low-confidence outputs?",
              "Is performance monitored across different conditions and over time?",
              "Are there processes to address performance degradation?",
            ],
            evidence_examples: [
              "Reliability testing",
              "Confidence handling procedures",
              "Performance monitoring",
              "Degradation response plans",
            ],
          },
          {
            title: "2.5 Fallback Plans and Reproducibility",
            description:
              "Establish fallback mechanisms when AI systems fail or produce uncertain results.",
            order_no: 5,
            summary: "Plan for AI system failures and edge cases",
            questions: [
              "Is there a fallback plan if the AI system fails?",
              "Are there mechanisms to ensure safe system shutdown?",
              "Can the system gracefully degrade while maintaining safety?",
              "Are there alternative processes if AI is unavailable?",
            ],
            evidence_examples: [
              "Fallback procedures",
              "Safe shutdown mechanisms",
              "Graceful degradation design",
              "Alternative process documentation",
            ],
          },
        ],
      },
      {
        title: "3. Privacy and Data Governance",
        description:
          "AI systems must ensure privacy protection and proper data governance throughout the AI lifecycle.",
        order_no: 3,
        items: [
          {
            title: "3.1 Privacy and Data Protection",
            description:
              "Protect personal data and privacy rights of individuals affected by AI systems.",
            order_no: 1,
            summary: "Safeguard privacy in AI system operations",
            questions: [
              "Is the AI system designed with privacy by design and by default principles?",
              "Is a Data Protection Impact Assessment (DPIA) performed where required?",
              "Are there processes to handle data subject rights requests?",
              "Is data anonymization or pseudonymization applied where appropriate?",
            ],
            evidence_examples: [
              "Privacy by design documentation",
              "DPIA reports",
              "Data subject rights procedures",
              "Anonymization techniques",
            ],
          },
          {
            title: "3.2 Quality and Integrity of Data",
            description:
              "Ensure training and operational data is of high quality, relevant, and representative.",
            order_no: 2,
            summary: "Maintain data quality for AI systems",
            questions: [
              "Is data quality assessed before use in AI systems?",
              "Are there processes to identify and address data quality issues?",
              "Is data bias assessed and mitigated?",
              "Are data lineage and provenance tracked?",
            ],
            evidence_examples: [
              "Data quality assessments",
              "Data cleaning procedures",
              "Bias assessments",
              "Data lineage documentation",
            ],
          },
          {
            title: "3.3 Access to Data",
            description: "Control access to data used in AI systems appropriately.",
            order_no: 3,
            summary: "Implement proper data access controls",
            questions: [
              "Are there protocols governing data access within the AI system?",
              "Is access limited to those with legitimate need?",
              "Are access logs maintained and reviewed?",
              "Is third-party data access appropriately controlled?",
            ],
            evidence_examples: [
              "Access control policies",
              "Need-to-know procedures",
              "Access logs",
              "Third-party agreements",
            ],
          },
        ],
      },
      {
        title: "4. Transparency",
        description:
          "AI systems should be transparent in terms of data, system, and business models. Traceability mechanisms should be established.",
        order_no: 4,
        items: [
          {
            title: "4.1 Traceability",
            description: "Enable traceability of AI system decisions and data flows.",
            order_no: 1,
            summary: "Track AI decisions and data throughout lifecycle",
            questions: [
              "Are the data and processes that yield the AI system's decision documented?",
              "Is there traceability from input data to model decisions?",
              "Can decisions be traced back to the training data and algorithms used?",
              "Are model versions and changes tracked?",
            ],
            evidence_examples: [
              "Decision logging",
              "Data flow documentation",
              "Training data records",
              "Version control",
            ],
          },
          {
            title: "4.2 Explainability",
            description:
              "Make AI system decisions and processes understandable to relevant stakeholders.",
            order_no: 2,
            summary: "Enable understanding of AI decisions",
            questions: [
              "Can the AI system's decision-making process be explained?",
              "Are explanations provided appropriate to the audience?",
              "Is there a trade-off between explainability and accuracy considered?",
              "Can the system explain why a particular decision was reached?",
            ],
            evidence_examples: [
              "Explainability methods",
              "Stakeholder-appropriate explanations",
              "Trade-off analysis",
              "Decision explanation capabilities",
            ],
          },
          {
            title: "4.3 Communication",
            description:
              "Communicate clearly to users that they are interacting with an AI system.",
            order_no: 3,
            summary: "Ensure transparent AI system communication",
            questions: [
              "Are users informed that they are interacting with an AI system?",
              "Are the AI system's capabilities and limitations communicated?",
              "Is the purpose of the AI system communicated to users?",
              "Is there clear information about the AI system's decision-making process?",
            ],
            evidence_examples: [
              "User notifications",
              "Capability documentation",
              "Purpose statements",
              "Process descriptions",
            ],
          },
        ],
      },
      {
        title: "5. Diversity, Non-discrimination and Fairness",
        description:
          "AI systems should avoid unfair bias and ensure accessibility, stakeholder participation, and equitable outcomes.",
        order_no: 5,
        items: [
          {
            title: "5.1 Avoidance of Unfair Bias",
            description:
              "Prevent and mitigate unfair bias in AI systems that could lead to discrimination.",
            order_no: 1,
            summary: "Identify and mitigate bias in AI systems",
            questions: [
              "Is there a strategy to identify, assess, and mitigate unfair bias?",
              "Are data sets assessed for potential biases?",
              "Are there mechanisms to flag and address biased outcomes?",
              "Is bias testing performed before deployment and ongoing?",
            ],
            evidence_examples: [
              "Bias mitigation strategy",
              "Data bias assessments",
              "Bias flagging mechanisms",
              "Bias testing results",
            ],
          },
          {
            title: "5.2 Accessibility and Universal Design",
            description:
              "Ensure AI systems are accessible to users with disabilities and diverse needs.",
            order_no: 2,
            summary: "Design AI systems for accessibility",
            questions: [
              "Does the AI system accommodate users with disabilities?",
              "Were accessibility standards considered in design?",
              "Is the AI system usable by people with diverse abilities?",
              "Are there alternative interfaces for users who cannot use standard interfaces?",
            ],
            evidence_examples: [
              "Accessibility assessment",
              "Standards compliance",
              "Universal design documentation",
              "Alternative interfaces",
            ],
          },
          {
            title: "5.3 Stakeholder Participation",
            description:
              "Include diverse stakeholders in AI system design and deployment processes.",
            order_no: 3,
            summary: "Engage stakeholders in AI development",
            questions: [
              "Were diverse stakeholders consulted during AI system development?",
              "Is there ongoing engagement with affected communities?",
              "Are stakeholder concerns addressed and documented?",
              "Is there a feedback mechanism for stakeholders?",
            ],
            evidence_examples: [
              "Stakeholder consultation records",
              "Community engagement",
              "Concern resolution",
              "Feedback mechanisms",
            ],
          },
        ],
      },
      {
        title: "6. Societal and Environmental Well-being",
        description:
          "AI systems should benefit society, be sustainable, and environmentally responsible.",
        order_no: 6,
        items: [
          {
            title: "6.1 Environmental Well-being",
            description: "Consider and minimize the environmental impact of AI systems.",
            order_no: 1,
            summary: "Assess and reduce AI environmental impact",
            questions: [
              "Is the environmental impact of the AI system assessed?",
              "Are measures taken to reduce energy consumption?",
              "Is the carbon footprint of training and inference considered?",
              "Are there strategies to minimize resource usage?",
            ],
            evidence_examples: [
              "Environmental impact assessment",
              "Energy efficiency measures",
              "Carbon footprint analysis",
              "Resource optimization",
            ],
          },
          {
            title: "6.2 Impact on Work and Skills",
            description: "Assess how AI systems affect work, jobs, and required skills.",
            order_no: 2,
            summary: "Evaluate AI impact on workforce",
            questions: [
              "Is the impact on work and workers assessed?",
              "Are there measures to support affected workers?",
              "Is reskilling or upskilling provided where needed?",
              "Does the AI system support rather than replace human work?",
            ],
            evidence_examples: [
              "Work impact assessment",
              "Worker support programs",
              "Training initiatives",
              "Human augmentation design",
            ],
          },
          {
            title: "6.3 Impact on Society at Large",
            description: "Consider broader societal impacts of AI system deployment.",
            order_no: 3,
            summary: "Assess broader societal implications",
            questions: [
              "Is the broader societal impact of the AI system assessed?",
              "Are there measures to prevent societal harms?",
              "Is the AI system's impact on democracy and institutions considered?",
              "Are there safeguards against misuse for social manipulation?",
            ],
            evidence_examples: [
              "Societal impact assessment",
              "Harm prevention measures",
              "Democratic impact analysis",
              "Misuse safeguards",
            ],
          },
        ],
      },
      {
        title: "7. Accountability",
        description:
          "Establish mechanisms to ensure responsibility and accountability for AI systems and their outcomes.",
        order_no: 7,
        items: [
          {
            title: "7.1 Auditability",
            description: "Enable auditing of AI systems by internal and external auditors.",
            order_no: 1,
            summary: "Ensure AI systems can be audited",
            questions: [
              "Is the AI system designed to be auditable?",
              "Are algorithms, data, and design processes documented for audit?",
              "Is there independent audit capability?",
              "Are audit trails maintained for AI decisions?",
            ],
            evidence_examples: [
              "Audit design documentation",
              "Algorithm documentation",
              "Independent audit reports",
              "Audit trail logs",
            ],
          },
          {
            title: "7.2 Minimization and Reporting of Negative Impacts",
            description:
              "Minimize negative impacts and establish reporting mechanisms when they occur.",
            order_no: 2,
            summary: "Track and address negative AI impacts",
            questions: [
              "Are there mechanisms to identify and report negative impacts?",
              "Is there a process to minimize and address negative impacts?",
              "Are incidents documented and learned from?",
              "Is there a responsible disclosure process?",
            ],
            evidence_examples: [
              "Impact identification mechanisms",
              "Mitigation procedures",
              "Incident documentation",
              "Disclosure process",
            ],
          },
          {
            title: "7.3 Trade-offs",
            description: "Document and manage trade-offs between different requirements.",
            order_no: 3,
            summary: "Balance competing requirements transparently",
            questions: [
              "Are trade-offs between requirements documented?",
              "Is there a process for making trade-off decisions?",
              "Are trade-off decisions reviewed by appropriate stakeholders?",
              "Is the rationale for trade-offs communicated?",
            ],
            evidence_examples: [
              "Trade-off documentation",
              "Decision process",
              "Stakeholder review records",
              "Communication records",
            ],
          },
          {
            title: "7.4 Redress",
            description: "Ensure mechanisms exist for redress when AI systems cause harm.",
            order_no: 4,
            summary: "Provide remedy for AI-caused harms",
            questions: [
              "Are there mechanisms for redress when the AI system causes harm?",
              "Is there a clear process for individuals to seek remedy?",
              "Are complaints handled promptly and fairly?",
              "Is compensation provided where appropriate?",
            ],
            evidence_examples: [
              "Redress mechanisms",
              "Remedy process",
              "Complaint handling procedures",
              "Compensation policy",
            ],
          },
        ],
      },
    ],
  },
};

export default altaiStructure;
