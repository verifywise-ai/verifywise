import type { FrameworkStructure } from "../types";

export const texasAiActStructure: FrameworkStructure = {
  id: 22,
  key: "texas-ai-act",
  framework_type: "texas_ai_act",
  displayName: "Texas Responsible AI Governance Act Framework",
  tables: {
    l1_struct: "texas_ai_act_chapters_struct",
    l2_struct: "texas_ai_act_sections_struct",
    l2_impl: "texas_ai_act_sections",
    l2_risks: "texas_ai_act_sections__risks",
  },
  cols: {
    l2_struct_parent: "chapter_id",
    l2_impl_meta: "section_meta_id",
    l2_risks_impl: "section_id",
  },
  entity_types: {
    l2_impl: "section",
  },
  source_labels: {
    section: "Texas AI Act sections",
  },
  seed: {
    name: "Texas Responsible AI Governance Act Framework",
    description:
      "Framework for ensuring compliance with the Texas Responsible AI Governance Act (TRAIGA) which regulates the development, deployment, and use of high-risk artificial intelligence systems in Texas",
    version: "1.0.0",
    is_organizational: false,
    hierarchy: {
      type: "two_level",
      level1_name: "Chapter",
      level2_name: "Section",
    },
    structure: [
      {
        title: "Chapter 1: Definitions and Scope",
        description:
          "Key definitions, scope of application, and determination of high-risk AI systems under TRAIGA",
        order_no: 1,
        items: [
          {
            title: "Sec. 1.1 - High-Risk AI System Identification",
            description:
              "Determine whether AI systems qualify as high-risk under TRAIGA based on their use and impact",
            order_no: 1,
            summary:
              "High-risk AI systems include those used in: employment decisions, educational opportunities, financial services, healthcare, housing, insurance, legal services, and essential government services. Systems making consequential decisions about individuals require compliance",
            questions: [
              "Does the AI system make or substantially contribute to consequential decisions?",
              "Is the AI used in employment, education, financial, healthcare, or housing contexts?",
              "Does the system affect access to essential services?",
              "Is there human oversight of AI-generated decisions?",
            ],
            evidence_examples: [
              "AI system inventory with risk classification",
              "Use case documentation",
              "Decision impact assessment",
              "High-risk determination analysis",
            ],
          },
          {
            title: "Sec. 1.2 - Deployer vs Developer Responsibilities",
            description: "Understand and document roles as AI deployer, developer, or both",
            order_no: 2,
            summary:
              "Deployers (organizations using AI) and developers (organizations creating AI) have distinct obligations. Many organizations serve both roles. Document which obligations apply based on your role",
            questions: [
              "Is your organization a deployer, developer, or both?",
              "Are developer obligations contractually addressed?",
              "Is there clear allocation of compliance responsibilities?",
              "Are third-party AI vendors properly vetted?",
            ],
            evidence_examples: [
              "Role determination documentation",
              "Vendor contracts with compliance provisions",
              "Responsibility allocation matrix",
              "Third-party AI vendor assessments",
            ],
          },
          {
            title: "Sec. 1.3 - Exemptions Assessment",
            description: "Determine if any statutory exemptions apply to your AI systems",
            order_no: 3,
            summary:
              "Certain AI systems may be exempt, including: federally regulated AI, national security applications, anti-fraud systems in certain contexts, and AI used solely for internal research. Document exemption basis if claimed",
            questions: [
              "Are any AI systems federally regulated?",
              "Are exemptions properly documented and justified?",
              "Is the exemption analysis reviewed periodically?",
              "Are exempt systems still subject to voluntary best practices?",
            ],
            evidence_examples: [
              "Exemption analysis documentation",
              "Federal regulation mapping",
              "Legal opinion on exemptions",
              "Periodic exemption review records",
            ],
          },
          {
            title: "Sec. 1.4 - AI System Inventory",
            description: "Maintain comprehensive inventory of all AI systems subject to TRAIGA",
            order_no: 4,
            summary:
              "Create and maintain a complete inventory of AI systems including their purpose, risk classification, deployment status, and compliance requirements",
            questions: [
              "Is there a complete inventory of AI systems?",
              "Are systems classified by risk level?",
              "Is the inventory kept current?",
              "Are new AI systems added to inventory before deployment?",
            ],
            evidence_examples: [
              "AI system inventory/register",
              "Risk classification records",
              "Inventory update procedures",
              "New system onboarding checklist",
            ],
          },
        ],
      },
      {
        title: "Chapter 2: Impact Assessments",
        description:
          "Requirements for conducting algorithmic impact assessments before deploying high-risk AI systems",
        order_no: 2,
        items: [
          {
            title: "Sec. 2.1 - Impact Assessment Requirements",
            description: "Conduct algorithmic impact assessments for all high-risk AI systems",
            order_no: 1,
            summary:
              "Before deploying high-risk AI, complete an impact assessment covering: purpose and intended use, data requirements, potential harms, bias analysis, and mitigation measures. Assessments must be documented and retained",
            questions: [
              "Are impact assessments completed before deployment?",
              "Do assessments cover all required elements?",
              "Is there a standardized assessment methodology?",
              "Are assessments documented and retained?",
            ],
            evidence_examples: [
              "Impact assessment templates",
              "Completed assessment documentation",
              "Assessment methodology guide",
              "Retention policy for assessments",
            ],
          },
          {
            title: "Sec. 2.2 - Bias and Discrimination Analysis",
            description:
              "Assess AI systems for potential discriminatory impacts on protected classes",
            order_no: 2,
            summary:
              "Evaluate whether AI systems may have disparate impact based on race, color, religion, sex, national origin, disability, age, or other protected characteristics. Document analysis methodology and findings",
            questions: [
              "Is bias testing conducted before deployment?",
              "Are all protected classes considered?",
              "Is there ongoing bias monitoring?",
              "Are mitigation measures documented when bias is found?",
            ],
            evidence_examples: [
              "Bias testing methodology",
              "Disparate impact analysis",
              "Protected class impact assessment",
              "Bias mitigation documentation",
            ],
          },
          {
            title: "Sec. 2.3 - Data Assessment",
            description:
              "Assess training data and input data for quality, representativeness, and potential biases",
            order_no: 3,
            summary:
              "Evaluate data sources, quality, representativeness, and potential embedded biases. Document data lineage, preprocessing steps, and quality assurance measures",
            questions: [
              "Is training data assessed for representativeness?",
              "Are data quality measures documented?",
              "Is data lineage tracked?",
              "Are data biases identified and addressed?",
            ],
            evidence_examples: [
              "Data quality assessment",
              "Data lineage documentation",
              "Representativeness analysis",
              "Data bias evaluation",
            ],
          },
          {
            title: "Sec. 2.4 - Periodic Reassessment",
            description: "Conduct periodic reassessments of deployed high-risk AI systems",
            order_no: 4,
            summary:
              "Impact assessments must be updated periodically and when significant changes occur. Establish reassessment schedule based on risk level and system changes",
            questions: [
              "Is there a reassessment schedule?",
              "Are reassessments triggered by significant changes?",
              "Are reassessment findings documented?",
              "Are corrective actions implemented when needed?",
            ],
            evidence_examples: [
              "Reassessment schedule",
              "Change trigger criteria",
              "Reassessment reports",
              "Corrective action records",
            ],
          },
          {
            title: "Sec. 2.5 - Third-Party Assessment",
            description: "Consider independent third-party assessments for highest-risk AI systems",
            order_no: 5,
            summary:
              "For AI systems with significant potential impact, consider engaging independent third parties to validate impact assessments and bias analyses",
            questions: [
              "Are third-party assessments conducted for highest-risk systems?",
              "Are assessors independent and qualified?",
              "Are third-party findings addressed?",
              "Is there a process for selecting assessors?",
            ],
            evidence_examples: [
              "Third-party assessment reports",
              "Assessor qualification verification",
              "Remediation of third-party findings",
              "Assessor selection criteria",
            ],
          },
        ],
      },
      {
        title: "Chapter 3: Transparency and Disclosure",
        description:
          "Requirements for transparency about AI use and disclosure to affected individuals",
        order_no: 3,
        items: [
          {
            title: "Sec. 3.1 - Consumer Disclosure Requirements",
            description:
              "Disclose to consumers when AI is used to make consequential decisions about them",
            order_no: 1,
            summary:
              "Consumers must be informed when high-risk AI makes or substantially contributes to decisions affecting them. Disclosure must be clear, conspicuous, and provided before or at the time of the decision",
            questions: [
              "Are consumers notified of AI use in decisions?",
              "Is disclosure clear and conspicuous?",
              "Is disclosure provided timely (before or at decision)?",
              "Are disclosure methods documented?",
            ],
            evidence_examples: [
              "Consumer disclosure notices",
              "Disclosure timing procedures",
              "Sample disclosure language",
              "Disclosure delivery records",
            ],
          },
          {
            title: "Sec. 3.2 - Statement of AI Use",
            description: "Provide statement describing how AI is used in consequential decisions",
            order_no: 2,
            summary:
              "Upon request, provide consumers with a statement describing: the AI system's role in the decision, key factors considered, data types used, and how to contest the decision",
            questions: [
              "Can statements be provided upon request?",
              "Do statements include all required information?",
              "Is there a process for handling requests?",
              "Are statements provided in accessible format?",
            ],
            evidence_examples: [
              "Statement of AI use template",
              "Request handling procedures",
              "Sample statements",
              "Accessibility accommodations",
            ],
          },
          {
            title: "Sec. 3.3 - Public Transparency",
            description: "Maintain public-facing transparency about high-risk AI use",
            order_no: 3,
            summary:
              "Make publicly available information about high-risk AI systems used, including general description, purpose, and contact information for questions or concerns",
            questions: [
              "Is AI use information publicly available?",
              "Is the information easy to find and understand?",
              "Is contact information provided?",
              "Is public information kept current?",
            ],
            evidence_examples: [
              "Public AI disclosure page",
              "Website AI information section",
              "Contact information for AI inquiries",
              "Public disclosure update records",
            ],
          },
          {
            title: "Sec. 3.4 - Explainability Requirements",
            description: "Ensure AI decisions can be explained to affected individuals",
            order_no: 4,
            summary:
              "Maintain ability to explain AI-driven decisions in understandable terms. Include principal factors, data elements, and logic contributing to decisions",
            questions: [
              "Can AI decisions be explained to consumers?",
              "Are explanations in plain language?",
              "Are key factors and data elements identified?",
              "Is there a process for providing explanations?",
            ],
            evidence_examples: [
              "Explanation generation capability",
              "Sample decision explanations",
              "Plain language guidelines",
              "Explanation request procedures",
            ],
          },
        ],
      },
      {
        title: "Chapter 4: Human Oversight",
        description: "Requirements for human oversight of high-risk AI systems and decisions",
        order_no: 4,
        items: [
          {
            title: "Sec. 4.1 - Human Review Process",
            description:
              "Establish processes for human review of AI-driven consequential decisions",
            order_no: 1,
            summary:
              "Implement meaningful human oversight of high-risk AI decisions. Humans must have ability to review, understand, and override AI recommendations when appropriate",
            questions: [
              "Is there human review of AI decisions?",
              "Can humans override AI recommendations?",
              "Do reviewers understand the AI system?",
              "Is human review documented?",
            ],
            evidence_examples: [
              "Human review procedures",
              "Override documentation",
              "Reviewer training records",
              "Review activity logs",
            ],
          },
          {
            title: "Sec. 4.2 - Appeal and Contest Rights",
            description:
              "Provide mechanisms for consumers to appeal or contest AI-driven decisions",
            order_no: 2,
            summary:
              "Consumers must be able to appeal consequential decisions made or influenced by AI. Appeals must include human review and consideration of additional information",
            questions: [
              "Is there an appeal process for AI decisions?",
              "Are appeals reviewed by humans?",
              "Can consumers provide additional information?",
              "Are appeal outcomes documented?",
            ],
            evidence_examples: [
              "Appeal procedures",
              "Appeal form/process",
              "Human review of appeals",
              "Appeal outcome records",
            ],
          },
          {
            title: "Sec. 4.3 - Opt-Out Rights",
            description: "Provide opt-out mechanisms where feasible for AI-driven decisions",
            order_no: 3,
            summary:
              "Where feasible, allow consumers to opt out of AI-driven decision-making and request human-only review. Document when opt-out is not feasible and why",
            questions: [
              "Can consumers opt out of AI decisions?",
              "Is the opt-out process accessible?",
              "Is human alternative available?",
              "Are opt-out limitations documented?",
            ],
            evidence_examples: [
              "Opt-out procedures",
              "Opt-out request handling",
              "Human alternative process",
              "Opt-out limitation justification",
            ],
          },
          {
            title: "Sec. 4.4 - Oversight Personnel Training",
            description: "Train personnel who oversee or review AI system outputs",
            order_no: 4,
            summary:
              "Personnel responsible for human oversight must receive adequate training on the AI system, its limitations, potential biases, and their oversight responsibilities",
            questions: [
              "Are oversight personnel trained?",
              "Does training cover AI limitations and biases?",
              "Is training documented and refreshed?",
              "Are competency requirements defined?",
            ],
            evidence_examples: [
              "Training program materials",
              "Training completion records",
              "Competency assessments",
              "Training refresh schedule",
            ],
          },
        ],
      },
      {
        title: "Chapter 5: Risk Management",
        description: "Requirements for managing risks associated with high-risk AI systems",
        order_no: 5,
        items: [
          {
            title: "Sec. 5.1 - Risk Management Program",
            description: "Establish and maintain an AI risk management program",
            order_no: 1,
            summary:
              "Implement a risk management program covering identification, assessment, mitigation, and monitoring of AI-related risks. Program should be proportionate to risk level",
            questions: [
              "Is there a documented AI risk management program?",
              "Does program cover full risk lifecycle?",
              "Is the program proportionate to risk?",
              "Is the program regularly reviewed?",
            ],
            evidence_examples: [
              "Risk management program documentation",
              "Risk identification procedures",
              "Risk assessment methodology",
              "Program review records",
            ],
          },
          {
            title: "Sec. 5.2 - Continuous Monitoring",
            description: "Implement continuous monitoring of high-risk AI system performance",
            order_no: 2,
            summary:
              "Monitor AI systems for performance degradation, drift, emerging biases, and unintended consequences. Establish monitoring metrics and alert thresholds",
            questions: [
              "Is AI performance continuously monitored?",
              "Are monitoring metrics defined?",
              "Are alert thresholds established?",
              "Is drift and bias monitored?",
            ],
            evidence_examples: [
              "Monitoring procedures",
              "Performance metrics dashboard",
              "Alert and escalation procedures",
              "Monitoring reports",
            ],
          },
          {
            title: "Sec. 5.3 - Incident Response",
            description: "Establish procedures for responding to AI-related incidents",
            order_no: 3,
            summary:
              "Define and implement procedures for identifying, reporting, investigating, and remediating AI system incidents including bias discoveries, errors, and harms",
            questions: [
              "Is there an AI incident response plan?",
              "Are incidents tracked and documented?",
              "Are root cause analyses conducted?",
              "Are corrective actions implemented?",
            ],
            evidence_examples: [
              "Incident response plan",
              "Incident tracking system",
              "Root cause analysis reports",
              "Corrective action records",
            ],
          },
          {
            title: "Sec. 5.4 - Model Governance",
            description: "Implement governance controls for AI model lifecycle",
            order_no: 4,
            summary:
              "Establish governance over the AI model lifecycle including development, validation, deployment, monitoring, and retirement. Control model changes and maintain version history",
            questions: [
              "Is there model governance framework?",
              "Are model changes controlled?",
              "Is version history maintained?",
              "Is there model validation process?",
            ],
            evidence_examples: [
              "Model governance framework",
              "Change control procedures",
              "Version control records",
              "Model validation documentation",
            ],
          },
        ],
      },
      {
        title: "Chapter 6: Data Governance",
        description: "Requirements for governing data used in high-risk AI systems",
        order_no: 6,
        items: [
          {
            title: "Sec. 6.1 - Training Data Requirements",
            description: "Ensure training data meets quality and representativeness requirements",
            order_no: 1,
            summary:
              "Training data must be relevant, representative, and appropriately assessed for bias. Document data sources, collection methods, and quality measures",
            questions: [
              "Is training data documented?",
              "Is data representativeness assessed?",
              "Are data sources vetted?",
              "Is data quality measured?",
            ],
            evidence_examples: [
              "Training data documentation",
              "Representativeness assessment",
              "Data source vetting records",
              "Data quality metrics",
            ],
          },
          {
            title: "Sec. 6.2 - Data Minimization",
            description: "Ensure data collection and use is limited to what is necessary",
            order_no: 2,
            summary:
              "Collect and use only data that is necessary for the AI system's purpose. Avoid collecting sensitive data unless required and justified",
            questions: [
              "Is data collection minimized?",
              "Is sensitive data use justified?",
              "Are data retention limits enforced?",
              "Is unnecessary data deleted?",
            ],
            evidence_examples: [
              "Data minimization assessment",
              "Sensitive data justification",
              "Retention policy compliance",
              "Data deletion records",
            ],
          },
          {
            title: "Sec. 6.3 - Protected Class Data Handling",
            description: "Appropriately handle data related to protected characteristics",
            order_no: 3,
            summary:
              "Implement appropriate safeguards for data related to protected characteristics. Such data may be needed for bias testing but requires additional protections",
            questions: [
              "Is protected class data identified?",
              "Are additional safeguards implemented?",
              "Is use limited to legitimate purposes?",
              "Is access restricted appropriately?",
            ],
            evidence_examples: [
              "Protected data inventory",
              "Additional safeguards documentation",
              "Use limitation policies",
              "Access control records",
            ],
          },
          {
            title: "Sec. 6.4 - Data Security",
            description:
              "Implement appropriate security measures for AI training and operational data",
            order_no: 4,
            summary:
              "Protect AI-related data with appropriate technical and organizational security measures. Security should be proportionate to data sensitivity",
            questions: [
              "Are AI data assets secured?",
              "Is security proportionate to sensitivity?",
              "Are access controls implemented?",
              "Is data encrypted appropriately?",
            ],
            evidence_examples: [
              "Security measures documentation",
              "Access control records",
              "Encryption implementation",
              "Security assessment results",
            ],
          },
        ],
      },
      {
        title: "Chapter 7: Documentation and Records",
        description: "Requirements for maintaining documentation and records related to AI systems",
        order_no: 7,
        items: [
          {
            title: "Sec. 7.1 - Technical Documentation",
            description: "Maintain technical documentation for high-risk AI systems",
            order_no: 1,
            summary:
              "Document AI system architecture, algorithms, training procedures, validation methods, and performance metrics. Documentation should enable understanding of system behavior",
            questions: [
              "Is technical documentation maintained?",
              "Does documentation cover system architecture?",
              "Are algorithms and methods documented?",
              "Is documentation kept current?",
            ],
            evidence_examples: [
              "System architecture documentation",
              "Algorithm documentation",
              "Training procedure documentation",
              "Documentation update records",
            ],
          },
          {
            title: "Sec. 7.2 - Decision Records",
            description: "Maintain records of consequential AI-driven decisions",
            order_no: 2,
            summary:
              "Keep records of consequential decisions made or influenced by AI, including inputs, outputs, and any human review or override. Enable reconstruction of decision basis",
            questions: [
              "Are decision records maintained?",
              "Do records include inputs and outputs?",
              "Is human review documented?",
              "Can decisions be reconstructed?",
            ],
            evidence_examples: [
              "Decision logging system",
              "Input/output records",
              "Human review documentation",
              "Decision audit trail",
            ],
          },
          {
            title: "Sec. 7.3 - Compliance Documentation",
            description: "Maintain documentation demonstrating TRAIGA compliance",
            order_no: 3,
            summary:
              "Compile and maintain documentation demonstrating compliance with all applicable TRAIGA requirements. Be prepared to provide documentation to regulators upon request",
            questions: [
              "Is compliance documentation organized?",
              "Can compliance be demonstrated?",
              "Is documentation accessible for review?",
              "Is documentation complete and current?",
            ],
            evidence_examples: [
              "Compliance documentation package",
              "Requirement mapping",
              "Evidence organization system",
              "Completeness assessment",
            ],
          },
          {
            title: "Sec. 7.4 - Record Retention",
            description: "Retain AI-related records for required periods",
            order_no: 4,
            summary:
              "Retain impact assessments, decision records, and compliance documentation for at least three years after the AI system is retired or the decision is made",
            questions: [
              "Is there a retention policy?",
              "Does retention meet minimum requirements?",
              "Are records securely stored?",
              "Is there a retention schedule?",
            ],
            evidence_examples: [
              "Retention policy",
              "Retention schedule",
              "Secure storage procedures",
              "Destruction records (when applicable)",
            ],
          },
        ],
      },
      {
        title: "Chapter 8: Vendor Management",
        description: "Requirements for managing third-party AI vendors and systems",
        order_no: 8,
        items: [
          {
            title: "Sec. 8.1 - Vendor Due Diligence",
            description: "Conduct due diligence on AI vendors before engagement",
            order_no: 1,
            summary:
              "Before using third-party AI systems, assess vendor compliance capabilities, system documentation, and ability to support your compliance obligations",
            questions: [
              "Is vendor due diligence conducted?",
              "Are vendor compliance capabilities assessed?",
              "Is vendor documentation adequate?",
              "Can vendor support your compliance needs?",
            ],
            evidence_examples: [
              "Vendor assessment questionnaire",
              "Due diligence reports",
              "Vendor documentation review",
              "Compliance support assessment",
            ],
          },
          {
            title: "Sec. 8.2 - Contractual Requirements",
            description: "Include appropriate provisions in AI vendor contracts",
            order_no: 2,
            summary:
              "Contracts with AI vendors should address: compliance obligations, documentation requirements, audit rights, incident notification, and liability allocation",
            questions: [
              "Do contracts address compliance obligations?",
              "Are documentation requirements included?",
              "Are audit rights secured?",
              "Is incident notification required?",
            ],
            evidence_examples: [
              "Contract compliance provisions",
              "Documentation requirements in contracts",
              "Audit right provisions",
              "Incident notification clauses",
            ],
          },
          {
            title: "Sec. 8.3 - Ongoing Vendor Monitoring",
            description: "Monitor vendor compliance and AI system performance",
            order_no: 3,
            summary:
              "Implement ongoing monitoring of AI vendors including periodic assessments, performance monitoring, and compliance verification",
            questions: [
              "Is vendor compliance monitored?",
              "Are periodic assessments conducted?",
              "Is vendor performance tracked?",
              "Are issues escalated and addressed?",
            ],
            evidence_examples: [
              "Vendor monitoring procedures",
              "Periodic assessment records",
              "Performance tracking reports",
              "Issue resolution records",
            ],
          },
          {
            title: "Sec. 8.4 - Vendor Incident Management",
            description: "Manage incidents involving third-party AI systems",
            order_no: 4,
            summary:
              "Establish procedures for receiving, assessing, and responding to incidents reported by or discovered in third-party AI systems",
            questions: [
              "Are vendor incident procedures established?",
              "Is there prompt notification from vendors?",
              "Are vendor incidents assessed?",
              "Is there coordinated response process?",
            ],
            evidence_examples: [
              "Vendor incident procedures",
              "Notification requirements",
              "Incident assessment records",
              "Response coordination documentation",
            ],
          },
        ],
      },
      {
        title: "Chapter 9: Enforcement Preparedness",
        description: "Preparation for regulatory enforcement and private actions under TRAIGA",
        order_no: 9,
        items: [
          {
            title: "Sec. 9.1 - Attorney General Cooperation",
            description: "Prepare for potential Attorney General inquiries and investigations",
            order_no: 1,
            summary:
              "Be prepared to respond to Attorney General requests for information, documentation, or access. Establish procedures for prompt and complete responses",
            questions: [
              "Is there a process for AG inquiries?",
              "Can documentation be produced promptly?",
              "Is there a designated contact?",
              "Are response procedures documented?",
            ],
            evidence_examples: [
              "AG inquiry response procedures",
              "Document production capability",
              "Designated contact information",
              "Response timeline procedures",
            ],
          },
          {
            title: "Sec. 9.2 - Cure Period Utilization",
            description: "Understand and prepare to use the cure period for violations",
            order_no: 2,
            summary:
              "TRAIGA provides a cure period for certain violations. Understand which violations are curable and maintain capability to implement cures promptly",
            questions: [
              "Is the cure period understood?",
              "Which violations are curable?",
              "Can cures be implemented promptly?",
              "Is cure documentation prepared?",
            ],
            evidence_examples: [
              "Cure period analysis",
              "Curable violation inventory",
              "Rapid response procedures",
              "Cure documentation templates",
            ],
          },
          {
            title: "Sec. 9.3 - Civil Penalty Avoidance",
            description: "Implement measures to avoid civil penalties",
            order_no: 3,
            summary:
              "Understand penalty structure and factors considered in penalty determination. Implement compliance measures and document good faith efforts to minimize potential penalties",
            questions: [
              "Is penalty structure understood?",
              "Are compliance measures documented?",
              "Is there evidence of good faith?",
              "Are high-risk areas prioritized?",
            ],
            evidence_examples: [
              "Penalty risk assessment",
              "Compliance measure documentation",
              "Good faith compliance evidence",
              "Prioritization records",
            ],
          },
          {
            title: "Sec. 9.4 - Private Right of Action Defense",
            description: "Prepare defenses against potential private lawsuits",
            order_no: 4,
            summary:
              "TRAIGA may enable private actions by affected consumers. Document compliance efforts and maintain records that can support defense against claims",
            questions: [
              "Is litigation risk understood?",
              "Are compliance efforts documented?",
              "Are consumer interactions recorded?",
              "Is there litigation response plan?",
            ],
            evidence_examples: [
              "Litigation risk assessment",
              "Compliance documentation",
              "Consumer interaction records",
              "Legal response procedures",
            ],
          },
        ],
      },
      {
        title: "Chapter 10: Governance and Accountability",
        description: "Organizational governance and accountability structures for AI compliance",
        order_no: 10,
        items: [
          {
            title: "Sec. 10.1 - AI Governance Structure",
            description: "Establish organizational governance structure for AI",
            order_no: 1,
            summary:
              "Implement governance structure with clear roles, responsibilities, and accountability for AI compliance. Include executive oversight and operational responsibilities",
            questions: [
              "Is there AI governance structure?",
              "Are roles and responsibilities defined?",
              "Is there executive oversight?",
              "Is accountability clear?",
            ],
            evidence_examples: [
              "AI governance charter",
              "Roles and responsibilities matrix",
              "Executive oversight documentation",
              "Accountability framework",
            ],
          },
          {
            title: "Sec. 10.2 - AI Ethics Committee",
            description: "Establish or designate an AI ethics review function",
            order_no: 2,
            summary:
              "Consider establishing an AI ethics committee or function to review high-risk AI use cases, assess ethical implications, and provide guidance",
            questions: [
              "Is there AI ethics review function?",
              "Are high-risk uses reviewed?",
              "Are ethical implications assessed?",
              "Is guidance provided and followed?",
            ],
            evidence_examples: [
              "AI ethics committee charter",
              "Review procedures",
              "Ethics assessment records",
              "Guidance documentation",
            ],
          },
          {
            title: "Sec. 10.3 - Compliance Program",
            description: "Implement comprehensive AI compliance program",
            order_no: 3,
            summary:
              "Establish a compliance program including policies, procedures, training, monitoring, and continuous improvement for TRAIGA compliance",
            questions: [
              "Is there AI compliance program?",
              "Are policies and procedures documented?",
              "Is training provided?",
              "Is continuous improvement implemented?",
            ],
            evidence_examples: [
              "Compliance program documentation",
              "Policies and procedures",
              "Training program and records",
              "Continuous improvement records",
            ],
          },
          {
            title: "Sec. 10.4 - Internal Audit",
            description: "Conduct internal audits of AI compliance",
            order_no: 4,
            summary:
              "Perform regular internal audits of AI compliance. Audit scope should cover all TRAIGA requirements with findings tracked to remediation",
            questions: [
              "Are internal audits conducted?",
              "Do audits cover all requirements?",
              "Are findings tracked?",
              "Is remediation completed?",
            ],
            evidence_examples: [
              "Audit program documentation",
              "Audit reports",
              "Finding tracking system",
              "Remediation records",
            ],
          },
          {
            title: "Sec. 10.5 - Board Reporting",
            description: "Report AI governance matters to board or senior leadership",
            order_no: 5,
            summary:
              "Provide regular reporting to board or senior leadership on AI risk, compliance status, significant incidents, and governance matters",
            questions: [
              "Is there board/leadership reporting?",
              "Does reporting cover key matters?",
              "Is reporting frequency appropriate?",
              "Are significant issues escalated?",
            ],
            evidence_examples: [
              "Board reporting procedures",
              "Sample board reports",
              "Reporting schedule",
              "Escalation procedures",
            ],
          },
        ],
      },
    ],
  },
};

export default texasAiActStructure;
