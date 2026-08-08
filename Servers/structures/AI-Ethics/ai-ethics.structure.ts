import type { FrameworkStructure } from "../types";

export const aiEthicsStructure: FrameworkStructure = {
  id: 14,
  key: "ai-ethics",
  framework_type: "ai_ethics",
  displayName: "AI Ethics & Governance Framework",
  tables: {
    l1_struct: "ai_ethics_principles_struct",
    l2_struct: "ai_ethics_requirements_struct",
    l2_impl: "ai_ethics_requirements",
    l2_risks: "ai_ethics_requirements__risks",
  },
  cols: {
    l2_struct_parent: "principle_id",
    l2_impl_meta: "requirement_meta_id",
    l2_risks_impl: "requirement_id",
  },
  entity_types: {
    l2_impl: "requirement",
  },
  source_labels: {
    requirement: "AI Ethics requirements",
  },
  seed: {
    name: "AI Ethics & Governance Framework",
    description: "Framework for responsible AI development, deployment, and governance",
    version: "1.0.0",
    is_organizational: false,
    hierarchy: {
      type: "two_level",
      level1_name: "Principle",
      level2_name: "Requirement",
    },
    structure: [
      {
        title: "Fairness & Non-Discrimination",
        description:
          "Ensure AI systems treat all individuals and groups fairly without discrimination",
        order_no: 1,
        items: [
          {
            title: "Bias Assessment",
            description: "Assess AI systems for potential biases in data, algorithms, and outcomes",
            order_no: 1,
            summary: "Identify and mitigate bias in AI systems",
            questions: [
              "Are training datasets assessed for bias?",
              "Is algorithmic fairness measured?",
              "Are outcomes monitored for disparate impact?",
            ],
            evidence_examples: [
              "Bias assessment reports",
              "Fairness metrics",
              "Monitoring dashboards",
            ],
          },
          {
            title: "Inclusive Design",
            description: "Design AI systems to work effectively for diverse populations",
            order_no: 2,
            summary: "Ensure AI systems are inclusive by design",
            questions: [
              "Are diverse stakeholders involved in design?",
              "Is accessibility considered?",
              "Are edge cases tested?",
            ],
            evidence_examples: [
              "Design documentation",
              "Stakeholder input",
              "Accessibility testing",
            ],
          },
          {
            title: "Fairness Monitoring",
            description: "Continuously monitor AI systems for fairness in production",
            order_no: 3,
            summary: "Track fairness metrics over time",
            questions: [
              "Are fairness metrics tracked in production?",
              "Are alerts configured for fairness drift?",
              "Is there a remediation process?",
            ],
            evidence_examples: ["Monitoring setup", "Alert configuration", "Remediation records"],
          },
        ],
      },
      {
        title: "Transparency & Explainability",
        description: "Ensure AI systems are transparent and their decisions can be explained",
        order_no: 2,
        items: [
          {
            title: "Model Documentation",
            description:
              "Document AI models including purpose, training data, limitations, and intended use",
            order_no: 1,
            summary: "Maintain comprehensive model documentation",
            questions: [
              "Are model cards maintained?",
              "Is training data documented?",
              "Are limitations clearly stated?",
            ],
            evidence_examples: ["Model cards", "Data sheets", "Technical documentation"],
          },
          {
            title: "Decision Explainability",
            description: "Provide explanations for AI-driven decisions when needed",
            order_no: 2,
            summary: "Enable explanation of AI decisions",
            questions: [
              "Can individual decisions be explained?",
              "Are explanations understandable to users?",
              "Is explainability appropriate to the risk level?",
            ],
            evidence_examples: ["Explanation mechanisms", "User testing", "Risk-based approach"],
          },
          {
            title: "Disclosure Requirements",
            description: "Disclose when AI systems are being used to make or assist decisions",
            order_no: 3,
            summary: "Be transparent about AI use",
            questions: [
              "Are users informed when AI is used?",
              "Is disclosure clear and prominent?",
              "Are disclosure requirements documented?",
            ],
            evidence_examples: ["Disclosure policy", "User notifications", "Compliance records"],
          },
        ],
      },
      {
        title: "Accountability & Governance",
        description: "Establish clear accountability structures for AI systems",
        order_no: 3,
        items: [
          {
            title: "AI Governance Structure",
            description:
              "Establish governance structure with clear roles and responsibilities for AI oversight",
            order_no: 1,
            summary: "Define AI governance organization",
            questions: [
              "Is there an AI ethics committee or board?",
              "Are roles and responsibilities defined?",
              "Is there executive sponsorship?",
            ],
            evidence_examples: ["Governance charter", "RACI matrix", "Committee records"],
          },
          {
            title: "AI Risk Management",
            description: "Implement risk management processes specific to AI systems",
            order_no: 2,
            summary: "Manage AI-specific risks",
            questions: [
              "Are AI risks identified and assessed?",
              "Is there an AI risk register?",
              "Are high-risk AI systems subject to additional controls?",
            ],
            evidence_examples: ["AI risk framework", "Risk register", "Control documentation"],
          },
          {
            title: "Audit & Compliance",
            description:
              "Conduct regular audits of AI systems for compliance with policies and regulations",
            order_no: 3,
            summary: "Audit AI systems regularly",
            questions: [
              "Are AI audits conducted?",
              "Are audit findings tracked?",
              "Is there regulatory compliance monitoring?",
            ],
            evidence_examples: ["Audit reports", "Finding remediation", "Compliance tracking"],
          },
        ],
      },
      {
        title: "Human Oversight",
        description: "Maintain appropriate human oversight of AI systems",
        order_no: 4,
        items: [
          {
            title: "Human-in-the-Loop",
            description: "Ensure human involvement in high-stakes AI decisions",
            order_no: 1,
            summary: "Require human review for critical decisions",
            questions: [
              "Are high-stakes decisions reviewed by humans?",
              "Can humans override AI decisions?",
              "Is the level of automation appropriate?",
            ],
            evidence_examples: ["Review processes", "Override mechanisms", "Automation assessment"],
          },
          {
            title: "Contestability",
            description: "Enable individuals to contest AI-driven decisions that affect them",
            order_no: 2,
            summary: "Provide appeal mechanisms",
            questions: [
              "Can affected individuals appeal decisions?",
              "Is there a review process?",
              "Are appeals tracked and analyzed?",
            ],
            evidence_examples: ["Appeal process", "Review records", "Appeal analytics"],
          },
          {
            title: "Kill Switch",
            description: "Maintain ability to disable or override AI systems when necessary",
            order_no: 3,
            summary: "Enable rapid AI system shutdown if needed",
            questions: [
              "Can AI systems be quickly disabled?",
              "Are shutdown procedures documented?",
              "Is there a rollback capability?",
            ],
            evidence_examples: ["Shutdown procedures", "Rollback plans", "Testing records"],
          },
        ],
      },
      {
        title: "Privacy & Security",
        description: "Protect data used in AI systems and secure AI infrastructure",
        order_no: 5,
        items: [
          {
            title: "Data Privacy",
            description: "Ensure AI training and inference respects data privacy requirements",
            order_no: 1,
            summary: "Protect privacy in AI data usage",
            questions: [
              "Is consent obtained for AI training data?",
              "Are privacy-enhancing technologies used?",
              "Is data minimization practiced?",
            ],
            evidence_examples: [
              "Consent records",
              "PET implementation",
              "Data minimization evidence",
            ],
          },
          {
            title: "Model Security",
            description: "Protect AI models from adversarial attacks and unauthorized access",
            order_no: 2,
            summary: "Secure AI models and infrastructure",
            questions: [
              "Are models protected from extraction?",
              "Is adversarial robustness tested?",
              "Are model access controls in place?",
            ],
            evidence_examples: ["Security controls", "Adversarial testing", "Access logs"],
          },
        ],
      },
    ],
  },
};

export default aiEthicsStructure;
