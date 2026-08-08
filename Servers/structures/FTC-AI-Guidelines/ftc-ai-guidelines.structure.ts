import type { FrameworkStructure } from "../types";

export const ftcAiGuidelinesStructure: FrameworkStructure = {
  id: 11,
  key: "ftc-ai-guidelines",
  framework_type: "ftc_ai_guidelines",
  displayName: "FTC AI Guidelines",
  tables: {
    l1_struct: "ftc_ai_guidelines_principles_struct",
    l2_struct: "ftc_ai_guidelines_requirements_struct",
    l2_impl: "ftc_ai_guidelines_requirements",
    l2_risks: "ftc_ai_guidelines_requirements__risks",
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
    requirement: "FTC AI Guidelines requirements",
  },
  seed: {
    name: "FTC AI Guidelines",
    description:
      "The Federal Trade Commission's guidance on artificial intelligence addresses consumer protection, truth in advertising, algorithmic fairness, and accountability. This framework helps organizations ensure their AI practices comply with FTC regulations and enforcement priorities.",
    version: "1.0.0",
    is_organizational: false,
    hierarchy: {
      type: "two_level",
      level1_name: "Principle",
      level2_name: "Requirement",
    },
    structure: [
      {
        title: "1. Truth in AI Advertising",
        description:
          "Ensure all claims about AI products and services are truthful, substantiated, and not misleading to consumers.",
        order_no: 1,
        items: [
          {
            title: "1.1 Substantiated AI Claims",
            description:
              "All claims about AI capabilities must be truthful and backed by evidence.",
            order_no: 1,
            summary: "Back up AI claims with evidence",
            questions: [
              "Are all marketing claims about AI capabilities substantiated with evidence?",
              "Is there documentation proving the AI performs as advertised?",
              "Are performance metrics accurately represented to consumers?",
              "Have exaggerated or unsubstantiated claims been identified and removed?",
            ],
            evidence_examples: [
              "Performance test results",
              "Accuracy documentation",
              "Marketing claim review",
              "Substantiation files",
            ],
          },
          {
            title: "1.2 No Deceptive AI Representations",
            description: "Avoid making false or misleading representations about AI systems.",
            order_no: 2,
            summary: "Prevent deceptive AI representations",
            questions: [
              "Are AI capabilities described accurately without exaggeration?",
              "Is it clear what the AI can and cannot do?",
              "Are limitations and potential errors disclosed?",
              "Is 'AI washing' (false AI claims) avoided?",
            ],
            evidence_examples: [
              "Capability documentation",
              "Limitation disclosures",
              "Marketing review process",
              "AI washing audit",
            ],
          },
          {
            title: "1.3 Clear AI Disclosure",
            description: "Clearly disclose when AI or automated systems are being used.",
            order_no: 3,
            summary: "Disclose AI use to consumers",
            questions: [
              "Are consumers informed when interacting with AI systems?",
              "Is AI-generated content clearly labeled?",
              "Are chatbots and virtual assistants identified as non-human?",
              "Is the role of AI in decision-making disclosed?",
            ],
            evidence_examples: [
              "AI disclosure statements",
              "Chatbot identification",
              "Content labeling policy",
              "Decision disclosure notices",
            ],
          },
          {
            title: "1.4 Testimonials and Endorsements",
            description:
              "Ensure AI-related testimonials and endorsements are genuine and not misleading.",
            order_no: 4,
            summary: "Verify authenticity of AI endorsements",
            questions: [
              "Are testimonials about AI products genuine?",
              "Are paid endorsements properly disclosed?",
              "Are AI-generated reviews or testimonials identified as such?",
              "Are fake reviews or manufactured endorsements prohibited?",
            ],
            evidence_examples: [
              "Testimonial verification",
              "Endorsement disclosures",
              "Review authenticity policy",
              "Fake review prevention",
            ],
          },
        ],
      },
      {
        title: "2. Algorithmic Fairness and Non-Discrimination",
        description:
          "Ensure AI systems do not discriminate against protected classes and comply with civil rights laws.",
        order_no: 2,
        items: [
          {
            title: "2.1 Equal Credit Opportunity Act (ECOA) Compliance",
            description:
              "AI systems used in credit decisions must not discriminate based on protected characteristics.",
            order_no: 1,
            summary: "Prevent discrimination in AI credit decisions",
            questions: [
              "Do AI credit decision systems avoid discrimination based on race, color, religion, national origin, sex, marital status, or age?",
              "Are adverse action notices provided when AI denies credit?",
              "Is the AI system tested for disparate impact?",
              "Are proxy variables that correlate with protected classes identified and addressed?",
            ],
            evidence_examples: [
              "Disparate impact analysis",
              "Adverse action procedures",
              "Proxy variable assessment",
              "Fair lending testing",
            ],
          },
          {
            title: "2.2 Fair Credit Reporting Act (FCRA) Compliance",
            description: "AI systems using consumer reports must comply with FCRA requirements.",
            order_no: 2,
            summary: "Comply with FCRA for AI using consumer data",
            questions: [
              "Does the AI system use consumer report information appropriately?",
              "Are consumers notified when AI uses their credit information?",
              "Can consumers dispute AI decisions based on credit reports?",
              "Is accuracy of consumer report data verified before AI use?",
            ],
            evidence_examples: [
              "Permissible purpose documentation",
              "Consumer notification process",
              "Dispute resolution procedures",
              "Data accuracy verification",
            ],
          },
          {
            title: "2.3 Bias Testing and Mitigation",
            description: "Regularly test AI systems for bias and implement mitigation measures.",
            order_no: 3,
            summary: "Test and mitigate AI bias",
            questions: [
              "Is the AI system regularly tested for bias across protected groups?",
              "Are bias testing results documented and reviewed?",
              "Are mitigation measures implemented when bias is detected?",
              "Is there ongoing monitoring for emerging bias patterns?",
            ],
            evidence_examples: [
              "Bias testing reports",
              "Mitigation documentation",
              "Monitoring procedures",
              "Remediation records",
            ],
          },
          {
            title: "2.4 Fair Housing Act Compliance",
            description: "AI systems in housing-related decisions must not discriminate.",
            order_no: 4,
            summary: "Ensure fair AI in housing decisions",
            questions: [
              "Do AI systems in housing avoid discrimination based on protected classes?",
              "Are targeted housing advertisements reviewed for discriminatory patterns?",
              "Is AI used in tenant screening tested for disparate impact?",
              "Are fair housing compliance measures documented?",
            ],
            evidence_examples: [
              "Fair housing analysis",
              "Ad targeting review",
              "Tenant screening audit",
              "Compliance documentation",
            ],
          },
        ],
      },
      {
        title: "3. Data Privacy and Security",
        description:
          "Protect consumer data used in AI systems and maintain appropriate security measures.",
        order_no: 3,
        items: [
          {
            title: "3.1 Data Collection Practices",
            description: "Collect only necessary data and obtain appropriate consent.",
            order_no: 1,
            summary: "Practice responsible data collection",
            questions: [
              "Is data collection limited to what is necessary for the AI system?",
              "Is consumer consent obtained before data collection?",
              "Are data collection practices clearly disclosed?",
              "Is sensitive data collection minimized and justified?",
            ],
            evidence_examples: [
              "Data minimization policy",
              "Consent mechanisms",
              "Privacy disclosures",
              "Sensitive data justification",
            ],
          },
          {
            title: "3.2 Data Security",
            description: "Implement reasonable security measures to protect consumer data.",
            order_no: 2,
            summary: "Secure consumer data in AI systems",
            questions: [
              "Are reasonable security measures implemented for AI training data?",
              "Is access to consumer data appropriately restricted?",
              "Are data breaches detected and responded to promptly?",
              "Is data encrypted in transit and at rest?",
            ],
            evidence_examples: [
              "Security assessment",
              "Access controls",
              "Breach response plan",
              "Encryption documentation",
            ],
          },
          {
            title: "3.3 Children's Privacy (COPPA)",
            description:
              "Comply with Children's Online Privacy Protection Act when AI systems interact with children.",
            order_no: 3,
            summary: "Protect children's data in AI systems",
            questions: [
              "Does the AI system interact with children under 13?",
              "Is verifiable parental consent obtained before collecting children's data?",
              "Are children's data retention practices compliant with COPPA?",
              "Is children's data used in AI training with appropriate consent?",
            ],
            evidence_examples: [
              "COPPA compliance assessment",
              "Parental consent process",
              "Data retention policy",
              "Training data audit",
            ],
          },
          {
            title: "3.4 Health Data Protection",
            description: "Protect health-related data used in AI systems.",
            order_no: 4,
            summary: "Safeguard health data in AI",
            questions: [
              "Is health data used in AI systems appropriately protected?",
              "Are Health Breach Notification Rules followed?",
              "Is sensitive health information used only with consent?",
              "Are health data sharing practices transparent?",
            ],
            evidence_examples: [
              "Health data protection policy",
              "Breach notification procedures",
              "Consent documentation",
              "Data sharing disclosures",
            ],
          },
        ],
      },
      {
        title: "4. Transparency and Explainability",
        description:
          "Provide transparency about AI systems and enable consumers to understand automated decisions.",
        order_no: 4,
        items: [
          {
            title: "4.1 Algorithmic Transparency",
            description: "Be transparent about how AI systems make decisions affecting consumers.",
            order_no: 1,
            summary: "Explain AI decision-making processes",
            questions: [
              "Can the AI system's decision-making process be explained to consumers?",
              "Are the key factors in AI decisions disclosed?",
              "Is information about AI systems accessible to affected consumers?",
              "Are explanations provided in understandable language?",
            ],
            evidence_examples: [
              "Explainability documentation",
              "Consumer-facing explanations",
              "Key factor disclosures",
              "Plain language policies",
            ],
          },
          {
            title: "4.2 Automated Decision Notices",
            description:
              "Notify consumers when significant decisions are made by automated systems.",
            order_no: 2,
            summary: "Inform consumers of automated decisions",
            questions: [
              "Are consumers notified when AI makes decisions affecting them?",
              "Is the notification timely and clear?",
              "Does the notice explain the consumer's rights?",
              "Are opt-out options provided where applicable?",
            ],
            evidence_examples: [
              "Decision notification templates",
              "Timing procedures",
              "Rights disclosures",
              "Opt-out mechanisms",
            ],
          },
          {
            title: "4.3 Right to Explanation",
            description: "Provide meaningful explanations for AI decisions when requested.",
            order_no: 3,
            summary: "Enable consumers to understand AI decisions",
            questions: [
              "Can consumers request explanations of AI decisions?",
              "Are explanations meaningful and actionable?",
              "Is there a process to handle explanation requests?",
              "Are explanations provided within reasonable timeframes?",
            ],
            evidence_examples: [
              "Explanation request process",
              "Explanation templates",
              "Response time standards",
              "Request handling procedures",
            ],
          },
        ],
      },
      {
        title: "5. Accountability and Governance",
        description: "Establish accountability structures and governance processes for AI systems.",
        order_no: 5,
        items: [
          {
            title: "5.1 AI Governance Structure",
            description: "Establish clear governance and accountability for AI systems.",
            order_no: 1,
            summary: "Define AI governance and responsibility",
            questions: [
              "Is there clear ownership and accountability for AI systems?",
              "Are roles and responsibilities for AI governance defined?",
              "Is there executive-level oversight of AI practices?",
              "Are governance processes documented and followed?",
            ],
            evidence_examples: [
              "Governance charter",
              "Role definitions",
              "Executive oversight records",
              "Process documentation",
            ],
          },
          {
            title: "5.2 AI Risk Assessment",
            description: "Assess and manage risks associated with AI systems.",
            order_no: 2,
            summary: "Evaluate and mitigate AI risks",
            questions: [
              "Are AI systems assessed for consumer harm risks?",
              "Are risk assessments performed before deployment?",
              "Is there ongoing risk monitoring?",
              "Are high-risk AI applications identified and managed?",
            ],
            evidence_examples: [
              "Risk assessment reports",
              "Pre-deployment reviews",
              "Monitoring procedures",
              "High-risk inventory",
            ],
          },
          {
            title: "5.3 Third-Party AI Accountability",
            description: "Ensure accountability for AI systems provided by third parties.",
            order_no: 3,
            summary: "Manage third-party AI risks",
            questions: [
              "Are third-party AI providers vetted for compliance?",
              "Are contracts with AI vendors adequate for accountability?",
              "Is due diligence performed on third-party AI systems?",
              "Can third-party AI decisions be explained and justified?",
            ],
            evidence_examples: [
              "Vendor vetting process",
              "Contract provisions",
              "Due diligence reports",
              "Third-party documentation",
            ],
          },
          {
            title: "5.4 Record Keeping",
            description: "Maintain records to demonstrate AI compliance.",
            order_no: 4,
            summary: "Document AI compliance efforts",
            questions: [
              "Are AI development and deployment decisions documented?",
              "Are testing and validation records maintained?",
              "Is there an audit trail for AI system changes?",
              "Are compliance records retained appropriately?",
            ],
            evidence_examples: [
              "Development documentation",
              "Testing records",
              "Change logs",
              "Retention schedules",
            ],
          },
        ],
      },
      {
        title: "6. Consumer Rights and Redress",
        description:
          "Respect consumer rights and provide mechanisms for redress when AI causes harm.",
        order_no: 6,
        items: [
          {
            title: "6.1 Consumer Dispute Resolution",
            description: "Provide mechanisms for consumers to dispute AI decisions.",
            order_no: 1,
            summary: "Enable consumers to challenge AI decisions",
            questions: [
              "Can consumers dispute decisions made by AI systems?",
              "Is there a clear process for submitting disputes?",
              "Are disputes reviewed by humans, not just AI?",
              "Are dispute resolutions communicated to consumers?",
            ],
            evidence_examples: [
              "Dispute process documentation",
              "Submission procedures",
              "Human review policy",
              "Resolution communications",
            ],
          },
          {
            title: "6.2 Human Review Option",
            description: "Provide the option for human review of significant AI decisions.",
            order_no: 2,
            summary: "Allow human review of AI decisions",
            questions: [
              "Can consumers request human review of AI decisions?",
              "Are human reviewers adequately trained?",
              "Is human review available in a timely manner?",
              "Are human review outcomes documented?",
            ],
            evidence_examples: [
              "Human review process",
              "Training documentation",
              "Response time standards",
              "Outcome records",
            ],
          },
          {
            title: "6.3 Correction of Errors",
            description: "Correct errors in AI systems and their outputs promptly.",
            order_no: 3,
            summary: "Fix AI errors and compensate consumers",
            questions: [
              "Is there a process to identify and correct AI errors?",
              "Are affected consumers notified of errors?",
              "Is compensation provided when AI errors cause harm?",
              "Are systemic errors addressed to prevent recurrence?",
            ],
            evidence_examples: [
              "Error correction process",
              "Consumer notification",
              "Compensation policy",
              "Root cause analysis",
            ],
          },
          {
            title: "6.4 Data Access and Deletion",
            description: "Allow consumers to access and delete their data used by AI systems.",
            order_no: 4,
            summary: "Honor consumer data rights",
            questions: [
              "Can consumers access their data used in AI systems?",
              "Can consumers request deletion of their data?",
              "Are data access requests fulfilled promptly?",
              "Is data actually deleted when requested?",
            ],
            evidence_examples: [
              "Data access process",
              "Deletion procedures",
              "Response time records",
              "Deletion verification",
            ],
          },
        ],
      },
      {
        title: "7. AI in Marketing and Sales",
        description: "Ensure AI used in marketing and sales practices is fair and not deceptive.",
        order_no: 7,
        items: [
          {
            title: "7.1 AI-Powered Pricing",
            description: "Ensure AI pricing algorithms are fair and not discriminatory.",
            order_no: 1,
            summary: "Prevent discriminatory AI pricing",
            questions: [
              "Are AI pricing algorithms tested for discrimination?",
              "Is dynamic pricing transparent to consumers?",
              "Are price differences based on legitimate factors?",
              "Is personalized pricing disclosed to consumers?",
            ],
            evidence_examples: [
              "Pricing algorithm audit",
              "Transparency disclosures",
              "Factor documentation",
              "Personalization notices",
            ],
          },
          {
            title: "7.2 Targeted Advertising",
            description: "Ensure AI-powered ad targeting does not discriminate or deceive.",
            order_no: 2,
            summary: "Ensure fair AI ad targeting",
            questions: [
              "Does AI ad targeting avoid discriminatory exclusion?",
              "Are targeting criteria reviewed for potential discrimination?",
              "Is sensitive category targeting appropriately restricted?",
              "Are ad targeting practices disclosed to consumers?",
            ],
            evidence_examples: [
              "Targeting audit",
              "Criteria review",
              "Sensitive category policy",
              "Targeting disclosures",
            ],
          },
          {
            title: "7.3 Dark Patterns Prevention",
            description:
              "Avoid using AI to create deceptive user interfaces or manipulate consumers.",
            order_no: 3,
            summary: "Prevent AI-enabled dark patterns",
            questions: [
              "Are AI-driven interfaces designed without dark patterns?",
              "Is consumer consent obtained without manipulation?",
              "Are subscription and cancellation processes fair?",
              "Is AI not used to obscure material information?",
            ],
            evidence_examples: [
              "UI/UX review",
              "Consent flow audit",
              "Subscription process review",
              "Information disclosure audit",
            ],
          },
        ],
      },
    ],
  },
};

export default ftcAiGuidelinesStructure;
