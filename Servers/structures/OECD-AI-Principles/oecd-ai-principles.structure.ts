import type { FrameworkStructure } from "../types";

export const oecdAiPrinciplesStructure: FrameworkStructure = {
  id: 15,
  key: "oecd-ai-principles",
  framework_type: "oecd_ai_principles",
  displayName: "OECD AI Principles",
  tables: {
    "l1_struct": "oecd_principles_struct",
    "l2_struct": "oecd_requirements_struct",
    "l2_impl": "oecd_requirements",
    "l2_risks": "oecd_requirements__risks"
  },
  cols: {
    "l2_struct_parent": "principle_id",
    "l2_impl_meta": "requirement_meta_id",
    "l2_risks_impl": "requirement_id"
  },
  entity_types: {
    "l2_impl": "requirement"
  },
  source_labels: {
    "requirement": "OECD AI Principles requirements"
  },
  seed: {
    "name": "OECD AI Principles",
    "description": "The OECD Principles on Artificial Intelligence, adopted in May 2019, were the first intergovernmental standard on AI. Endorsed by G20 leaders, these principles promote AI that is innovative and trustworthy while respecting human rights and democratic values. This framework covers the five principles for responsible AI stewardship and implementation guidance.",
    "version": "1.0.0",
    "is_organizational": false,
    "hierarchy": {
      "type": "two_level",
      "level1_name": "Principle",
      "level2_name": "Requirement"
    },
    "structure": [
      {
        "title": "1. Inclusive Growth, Sustainable Development and Well-being",
        "description": "AI should benefit people and the planet by driving inclusive growth, sustainable development and well-being.",
        "order_no": 1,
        "items": [
          {
            "title": "1.1 Beneficial AI Outcomes",
            "description": "Ensure AI systems contribute to beneficial outcomes for people and society.",
            "order_no": 1,
            "summary": "Design AI for beneficial societal impact",
            "questions": [
              "Does the AI system aim to benefit people and contribute to well-being?",
              "Are potential benefits to individuals and society identified and documented?",
              "Is the AI designed to augment human capabilities rather than replace them?",
              "Are the intended beneficiaries of the AI system clearly identified?"
            ],
            "evidence_examples": [
              "Benefit assessment",
              "Societal impact analysis",
              "Human augmentation design",
              "Beneficiary documentation"
            ]
          },
          {
            "title": "1.2 Sustainable Development",
            "description": "Align AI development with sustainable development goals and environmental responsibility.",
            "order_no": 2,
            "summary": "Ensure AI supports sustainability",
            "questions": [
              "Is the AI system's environmental impact assessed and minimized?",
              "Does the AI contribute to or align with sustainable development goals?",
              "Are energy efficiency considerations integrated into AI design?",
              "Is the carbon footprint of AI training and deployment measured?"
            ],
            "evidence_examples": [
              "Environmental impact assessment",
              "SDG alignment mapping",
              "Energy efficiency measures",
              "Carbon footprint analysis"
            ]
          },
          {
            "title": "1.3 Inclusive Growth",
            "description": "Ensure AI contributes to inclusive economic growth and reduces inequalities.",
            "order_no": 3,
            "summary": "Promote inclusive AI benefits",
            "questions": [
              "Does the AI system promote inclusive access to its benefits?",
              "Are potential impacts on economic inequality assessed?",
              "Is the AI accessible to diverse populations and communities?",
              "Are measures in place to prevent AI from exacerbating inequalities?"
            ],
            "evidence_examples": [
              "Inclusivity assessment",
              "Inequality impact analysis",
              "Accessibility evaluation",
              "Equity measures"
            ]
          },
          {
            "title": "1.4 Well-being Enhancement",
            "description": "Design AI to enhance individual and collective well-being.",
            "order_no": 4,
            "summary": "Enhance well-being through AI",
            "questions": [
              "Does the AI system consider impacts on mental and physical well-being?",
              "Are potential negative effects on well-being identified and mitigated?",
              "Is user well-being prioritized in AI design decisions?",
              "Are there mechanisms to monitor well-being impacts over time?"
            ],
            "evidence_examples": [
              "Well-being impact assessment",
              "Negative effect mitigation",
              "User-centric design documentation",
              "Monitoring procedures"
            ]
          }
        ]
      },
      {
        "title": "2. Human-centred Values and Fairness",
        "description": "AI systems should be designed in a way that respects the rule of law, human rights, democratic values and diversity, and should include appropriate safeguards to ensure a fair and just society.",
        "order_no": 2,
        "items": [
          {
            "title": "2.1 Human Rights Respect",
            "description": "Ensure AI systems respect and support human rights.",
            "order_no": 1,
            "summary": "Protect human rights in AI systems",
            "questions": [
              "Is a human rights impact assessment conducted for the AI system?",
              "Are potential human rights risks identified and addressed?",
              "Does the AI respect rights to privacy, freedom, and dignity?",
              "Are human rights considerations integrated throughout the AI lifecycle?"
            ],
            "evidence_examples": [
              "Human rights impact assessment",
              "Risk identification",
              "Privacy protection measures",
              "Lifecycle integration documentation"
            ]
          },
          {
            "title": "2.2 Democratic Values",
            "description": "Support democratic values and institutions through responsible AI.",
            "order_no": 2,
            "summary": "Uphold democratic values in AI",
            "questions": [
              "Does the AI system support democratic participation and values?",
              "Are risks to democratic processes identified and mitigated?",
              "Is the AI designed to prevent manipulation of democratic discourse?",
              "Are safeguards against misuse for political manipulation in place?"
            ],
            "evidence_examples": [
              "Democratic impact assessment",
              "Risk mitigation measures",
              "Anti-manipulation safeguards",
              "Political misuse prevention"
            ]
          },
          {
            "title": "2.3 Diversity and Inclusion",
            "description": "Respect diversity and promote inclusion in AI development and deployment.",
            "order_no": 3,
            "summary": "Embrace diversity in AI systems",
            "questions": [
              "Is diversity considered in AI development teams?",
              "Does the AI system work effectively for diverse populations?",
              "Are cultural and contextual differences considered in AI design?",
              "Is inclusive stakeholder engagement practiced?"
            ],
            "evidence_examples": [
              "Team diversity metrics",
              "Population effectiveness testing",
              "Cultural consideration documentation",
              "Stakeholder engagement records"
            ]
          },
          {
            "title": "2.4 Fairness and Non-discrimination",
            "description": "Ensure AI systems are fair and do not discriminate.",
            "order_no": 4,
            "summary": "Ensure AI fairness and prevent discrimination",
            "questions": [
              "Is the AI system tested for bias and discrimination?",
              "Are fairness metrics defined and monitored?",
              "Is there a process to address identified biases?",
              "Are protected groups safeguarded from discriminatory outcomes?"
            ],
            "evidence_examples": [
              "Bias testing results",
              "Fairness metrics",
              "Bias remediation process",
              "Protected group analysis"
            ]
          },
          {
            "title": "2.5 Rule of Law Compliance",
            "description": "Ensure AI systems comply with applicable laws and regulations.",
            "order_no": 5,
            "summary": "Comply with legal requirements",
            "questions": [
              "Is the AI system compliant with applicable laws and regulations?",
              "Is legal review conducted before AI deployment?",
              "Are regulatory requirements continuously monitored?",
              "Is there a process for addressing legal compliance gaps?"
            ],
            "evidence_examples": [
              "Legal compliance review",
              "Pre-deployment legal assessment",
              "Regulatory monitoring",
              "Compliance gap analysis"
            ]
          }
        ]
      },
      {
        "title": "3. Transparency and Explainability",
        "description": "There should be transparency and responsible disclosure around AI systems to ensure people understand when they are engaging with them and can challenge outcomes.",
        "order_no": 3,
        "items": [
          {
            "title": "3.1 AI System Disclosure",
            "description": "Disclose when AI systems are being used and their general nature.",
            "order_no": 1,
            "summary": "Disclose AI use to stakeholders",
            "questions": [
              "Are people informed when they are interacting with an AI system?",
              "Is the general nature and purpose of the AI system disclosed?",
              "Are AI-generated outputs clearly identified?",
              "Is disclosure provided in an accessible and understandable manner?"
            ],
            "evidence_examples": [
              "Disclosure notices",
              "Purpose statements",
              "Output labeling",
              "Accessibility documentation"
            ]
          },
          {
            "title": "3.2 Explainable AI Decisions",
            "description": "Enable understanding of AI system decisions and outputs.",
            "order_no": 2,
            "summary": "Make AI decisions understandable",
            "questions": [
              "Can the AI system's decisions be explained to affected parties?",
              "Are explanations tailored to the audience's needs?",
              "Is there documentation of the AI system's logic and methodology?",
              "Can individuals obtain meaningful information about decisions affecting them?"
            ],
            "evidence_examples": [
              "Explanation mechanisms",
              "Audience-appropriate documentation",
              "Methodology documentation",
              "Individual information access"
            ]
          },
          {
            "title": "3.3 Outcome Challenging Mechanisms",
            "description": "Enable people to challenge AI outcomes and seek remedy.",
            "order_no": 3,
            "summary": "Allow challenges to AI outcomes",
            "questions": [
              "Can individuals challenge AI system outcomes?",
              "Is there a clear process for submitting challenges?",
              "Are challenges reviewed fairly and in a timely manner?",
              "Is there access to human review of AI decisions?"
            ],
            "evidence_examples": [
              "Challenge process documentation",
              "Submission procedures",
              "Review timelines",
              "Human review availability"
            ]
          },
          {
            "title": "3.4 Information about Data and Models",
            "description": "Provide appropriate information about data sources and AI models.",
            "order_no": 4,
            "summary": "Disclose data and model information",
            "questions": [
              "Is information about training data sources available?",
              "Are model capabilities and limitations documented?",
              "Is information provided about how models are updated?",
              "Is there transparency about data processing practices?"
            ],
            "evidence_examples": [
              "Data source documentation",
              "Model documentation",
              "Update procedures",
              "Data processing transparency"
            ]
          }
        ]
      },
      {
        "title": "4. Robustness, Security and Safety",
        "description": "AI systems should be robust, secure and safe throughout their lifecycle so that they function appropriately and do not pose unreasonable safety risks.",
        "order_no": 4,
        "items": [
          {
            "title": "4.1 Technical Robustness",
            "description": "Ensure AI systems are technically robust and reliable.",
            "order_no": 1,
            "summary": "Build robust AI systems",
            "questions": [
              "Is the AI system tested for robustness under various conditions?",
              "Are edge cases and failure modes identified and addressed?",
              "Is there monitoring for performance degradation?",
              "Are reliability requirements defined and met?"
            ],
            "evidence_examples": [
              "Robustness testing",
              "Edge case analysis",
              "Performance monitoring",
              "Reliability documentation"
            ]
          },
          {
            "title": "4.2 Security Measures",
            "description": "Implement appropriate security measures to protect AI systems.",
            "order_no": 2,
            "summary": "Secure AI systems against threats",
            "questions": [
              "Are AI systems protected against adversarial attacks?",
              "Is security testing conducted regularly?",
              "Are data and model integrity protected?",
              "Is there a security incident response plan?"
            ],
            "evidence_examples": [
              "Adversarial testing",
              "Security assessment reports",
              "Integrity protection measures",
              "Incident response plan"
            ]
          },
          {
            "title": "4.3 Safety Assurance",
            "description": "Ensure AI systems do not pose unreasonable safety risks.",
            "order_no": 3,
            "summary": "Assess and mitigate safety risks",
            "questions": [
              "Is a safety risk assessment conducted for the AI system?",
              "Are potential harms identified and mitigated?",
              "Are safety requirements defined based on the AI application?",
              "Is there ongoing safety monitoring?"
            ],
            "evidence_examples": [
              "Safety risk assessment",
              "Harm mitigation measures",
              "Safety requirements",
              "Monitoring procedures"
            ]
          },
          {
            "title": "4.4 Traceability",
            "description": "Maintain traceability of AI system decisions and data.",
            "order_no": 4,
            "summary": "Enable traceability of AI operations",
            "questions": [
              "Are AI decisions and their inputs traceable?",
              "Is there an audit trail for AI system operations?",
              "Can decisions be reproduced for investigation?",
              "Are data lineage and provenance tracked?"
            ],
            "evidence_examples": [
              "Decision logs",
              "Audit trail",
              "Reproducibility procedures",
              "Data lineage documentation"
            ]
          },
          {
            "title": "4.5 Fallback and Continuity",
            "description": "Plan for AI system failures and ensure continuity.",
            "order_no": 5,
            "summary": "Prepare for AI failures",
            "questions": [
              "Are fallback mechanisms in place for AI system failures?",
              "Is there a business continuity plan for AI-dependent processes?",
              "Can the AI system fail safely without causing harm?",
              "Are manual alternatives available when needed?"
            ],
            "evidence_examples": [
              "Fallback procedures",
              "Business continuity plan",
              "Safe failure design",
              "Manual process documentation"
            ]
          }
        ]
      },
      {
        "title": "5. Accountability",
        "description": "Organizations and individuals developing, deploying or operating AI systems should be held accountable for their proper functioning in line with the above principles.",
        "order_no": 5,
        "items": [
          {
            "title": "5.1 Clear Accountability",
            "description": "Establish clear accountability for AI systems.",
            "order_no": 1,
            "summary": "Define AI accountability structures",
            "questions": [
              "Is there clear accountability for the AI system's proper functioning?",
              "Are roles and responsibilities for AI governance defined?",
              "Is there executive-level oversight of AI systems?",
              "Are accountability structures documented and communicated?"
            ],
            "evidence_examples": [
              "Accountability framework",
              "Role definitions",
              "Executive oversight documentation",
              "Communication records"
            ]
          },
          {
            "title": "5.2 Risk Management",
            "description": "Implement risk management processes for AI systems.",
            "order_no": 2,
            "summary": "Manage AI-related risks",
            "questions": [
              "Is there a risk management framework for AI systems?",
              "Are risks assessed throughout the AI lifecycle?",
              "Are risk mitigation measures implemented and monitored?",
              "Is risk management integrated with organizational processes?"
            ],
            "evidence_examples": [
              "Risk management framework",
              "Lifecycle risk assessment",
              "Mitigation measures",
              "Integration documentation"
            ]
          },
          {
            "title": "5.3 Impact Assessment",
            "description": "Conduct impact assessments for AI systems.",
            "order_no": 3,
            "summary": "Assess AI system impacts",
            "questions": [
              "Are impact assessments conducted before AI deployment?",
              "Do assessments cover social, economic, and environmental impacts?",
              "Are negative impacts identified and addressed?",
              "Are impact assessments updated periodically?"
            ],
            "evidence_examples": [
              "Impact assessment reports",
              "Multi-dimensional analysis",
              "Negative impact mitigation",
              "Assessment updates"
            ]
          },
          {
            "title": "5.4 Redress Mechanisms",
            "description": "Provide mechanisms for redress when AI causes harm.",
            "order_no": 4,
            "summary": "Enable remedy for AI-caused harms",
            "questions": [
              "Are there mechanisms for redress when AI causes harm?",
              "Can affected parties seek compensation or remedy?",
              "Is there a clear process for handling complaints?",
              "Are remedies provided in a timely manner?"
            ],
            "evidence_examples": [
              "Redress procedures",
              "Compensation policy",
              "Complaint handling process",
              "Response time standards"
            ]
          },
          {
            "title": "5.5 Documentation and Record-keeping",
            "description": "Maintain documentation to demonstrate accountability.",
            "order_no": 5,
            "summary": "Document AI governance activities",
            "questions": [
              "Is AI development and deployment documented?",
              "Are governance decisions and rationales recorded?",
              "Is documentation retained for appropriate periods?",
              "Can documentation support audits and investigations?"
            ],
            "evidence_examples": [
              "Development documentation",
              "Decision records",
              "Retention schedule",
              "Audit-ready documentation"
            ]
          }
        ]
      },
      {
        "title": "6. Stakeholder Engagement",
        "description": "Engage with diverse stakeholders throughout the AI lifecycle to ensure AI systems meet societal needs.",
        "order_no": 6,
        "items": [
          {
            "title": "6.1 Multi-stakeholder Engagement",
            "description": "Engage diverse stakeholders in AI development and governance.",
            "order_no": 1,
            "summary": "Involve diverse stakeholders",
            "questions": [
              "Are diverse stakeholders engaged in AI development?",
              "Is input sought from affected communities?",
              "Are civil society perspectives considered?",
              "Is there ongoing dialogue with stakeholders?"
            ],
            "evidence_examples": [
              "Stakeholder engagement plan",
              "Community consultation records",
              "Civil society input",
              "Dialogue documentation"
            ]
          },
          {
            "title": "6.2 Public Participation",
            "description": "Enable public participation in AI governance discussions.",
            "order_no": 2,
            "summary": "Facilitate public involvement",
            "questions": [
              "Are opportunities for public input on AI provided?",
              "Is public feedback incorporated into AI governance?",
              "Are public concerns about AI addressed transparently?",
              "Is there accessible information for public engagement?"
            ],
            "evidence_examples": [
              "Public input mechanisms",
              "Feedback integration",
              "Concern response documentation",
              "Public information materials"
            ]
          },
          {
            "title": "6.3 International Cooperation",
            "description": "Participate in international cooperation on AI governance.",
            "order_no": 3,
            "summary": "Engage in international AI cooperation",
            "questions": [
              "Does the organization participate in international AI discussions?",
              "Are international AI standards and guidelines considered?",
              "Is there collaboration with international partners on AI governance?",
              "Are global best practices for AI incorporated?"
            ],
            "evidence_examples": [
              "International participation records",
              "Standards consideration",
              "Collaboration documentation",
              "Best practice integration"
            ]
          }
        ]
      }
    ]
  },
};

export default oecdAiPrinciplesStructure;
