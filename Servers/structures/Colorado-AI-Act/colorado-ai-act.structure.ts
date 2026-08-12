import type { FrameworkStructure } from "../types";

export const coloradoAiActStructure: FrameworkStructure = {
  id: 23,
  key: "colorado-ai-act",
  framework_type: "colorado_ai_act",
  displayName: "Colorado Artificial Intelligence Act Framework",
  tables: {
    l1_struct: "colorado_ai_act_chapters_struct",
    l2_struct: "colorado_ai_act_sections_struct",
    l2_impl: "colorado_ai_act_sections",
    l2_risks: "colorado_ai_act_sections__risks",
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
    section: "Colorado AI Act sections",
  },
  seed: {
    name: "Colorado Artificial Intelligence Act Framework",
    description:
      "Framework for ensuring compliance with the Colorado Artificial Intelligence Act (SB 21-169) which aims to protect consumers from algorithmic discrimination in high-risk AI decision-making",
    version: "1.0.0",
    is_organizational: false,
    hierarchy: {
      type: "two_level",
      level1_name: "Chapter",
      level2_name: "Section",
    },
    structure: [
      {
        title: "Chapter 1: Scope and Definitions",
        description:
          "Applicability, key definitions, and determination of high-risk AI systems under Colorado AI Act",
        order_no: 1,
        items: [
          {
            title: "Sec. 1.1 - High-Risk AI System Determination",
            description:
              "Determine whether AI systems qualify as high-risk under the Colorado AI Act",
            order_no: 1,
            summary:
              "High-risk AI systems are those that make or are substantial factors in consequential decisions concerning consumers in: education, employment, financial services, government services, healthcare, housing, insurance, and legal services",
            questions: [
              "Does the AI system make or substantially factor into consequential decisions?",
              "Are decisions made in covered domains (education, employment, financial, etc.)?",
              "Does the system affect consumer access to services or opportunities?",
              "Is the AI a substantial factor in the decision-making process?",
            ],
            evidence_examples: [
              "AI system inventory with risk classification",
              "Consequential decision analysis",
              "Domain applicability assessment",
              "Substantial factor determination",
            ],
          },
          {
            title: "Sec. 1.2 - Developer and Deployer Classification",
            description: "Classify your organization's role as developer, deployer, or both",
            order_no: 2,
            summary:
              "Developers create or substantially modify AI systems. Deployers use AI systems for consequential decisions. Many organizations serve both roles. Each role has distinct compliance obligations",
            questions: [
              "Does your organization develop or substantially modify AI systems?",
              "Does your organization deploy AI for consequential decisions?",
              "Are both developer and deployer obligations applicable?",
              "Are third-party developers properly managed?",
            ],
            evidence_examples: [
              "Role classification documentation",
              "Developer/deployer responsibility matrix",
              "Third-party developer inventory",
              "Obligation mapping by role",
            ],
          },
          {
            title: "Sec. 1.3 - Algorithmic Discrimination Definition",
            description: "Understand what constitutes algorithmic discrimination under the Act",
            order_no: 3,
            summary:
              "Algorithmic discrimination means differential treatment or impact that disfavors an individual or group based on: age, color, disability, ethnicity, genetic information, national origin, race, religion, reproductive health, sex, veteran status, or other protected characteristics",
            questions: [
              "Are all protected characteristics identified?",
              "Is there understanding of differential treatment vs. disparate impact?",
              "Are discrimination testing protocols established?",
              "Is there process to identify potential discrimination?",
            ],
            evidence_examples: [
              "Protected characteristic inventory",
              "Discrimination definition documentation",
              "Testing protocol for discrimination",
              "Legal interpretation guidance",
            ],
          },
          {
            title: "Sec. 1.4 - Exemptions and Exceptions",
            description: "Identify applicable exemptions from the Colorado AI Act",
            order_no: 4,
            summary:
              "Certain uses may be exempt including: narrow AI for specific administrative tasks, AI used solely for data processing without decision-making, federally regulated AI in certain contexts, and AI used for national security",
            questions: [
              "Are any AI systems potentially exempt?",
              "Is exemption analysis documented?",
              "Are exempt systems still monitored for scope changes?",
              "Is legal review obtained for exemption claims?",
            ],
            evidence_examples: [
              "Exemption analysis documentation",
              "Legal review of exemptions",
              "Scope monitoring procedures",
              "Exemption justification records",
            ],
          },
        ],
      },
      {
        title: "Chapter 2: Developer Duties",
        description: "Obligations for developers of high-risk AI systems",
        order_no: 2,
        items: [
          {
            title: "Sec. 2.1 - Reasonable Care Standard",
            description:
              "Exercise reasonable care to protect consumers from algorithmic discrimination",
            order_no: 1,
            summary:
              "Developers must use reasonable care to protect consumers from known or reasonably foreseeable risks of algorithmic discrimination. This is the overarching duty that informs all other developer obligations",
            questions: [
              "Is there a documented approach to reasonable care?",
              "Are discrimination risks identified and assessed?",
              "Are mitigation measures implemented?",
              "Is the approach regularly reviewed and updated?",
            ],
            evidence_examples: [
              "Reasonable care policy",
              "Risk identification procedures",
              "Mitigation measure documentation",
              "Review and update records",
            ],
          },
          {
            title: "Sec. 2.2 - Documentation for Deployers",
            description: "Provide required documentation to deployers of AI systems",
            order_no: 2,
            summary:
              "Developers must provide deployers with: general description of system and capabilities, documentation of training data, known limitations, intended uses and foreseeable misuses, and information needed for impact assessments",
            questions: [
              "Is comprehensive documentation provided to deployers?",
              "Does documentation include training data information?",
              "Are limitations and intended uses documented?",
              "Is documentation sufficient for deployer impact assessments?",
            ],
            evidence_examples: [
              "Deployer documentation package",
              "Training data documentation",
              "Limitation disclosures",
              "Intended use documentation",
            ],
          },
          {
            title: "Sec. 2.3 - Public Disclosure Statement",
            description: "Make public statement regarding high-risk AI systems",
            order_no: 3,
            summary:
              "Developers must make publicly available a statement describing: types of high-risk AI systems developed, how the developer manages discrimination risks, and the nature of the documentation provided to deployers",
            questions: [
              "Is public statement published and accessible?",
              "Does statement describe high-risk AI types?",
              "Is risk management approach described?",
              "Is documentation practice disclosed?",
            ],
            evidence_examples: [
              "Public disclosure statement",
              "Website publication",
              "Statement update records",
              "Accessibility verification",
            ],
          },
          {
            title: "Sec. 2.4 - Known Discrimination Disclosure",
            description: "Disclose known or reasonably foreseeable discrimination risks",
            order_no: 4,
            summary:
              "Developers must disclose to deployers and the Attorney General any known or reasonably foreseeable risks of algorithmic discrimination, including risks discovered after deployment",
            questions: [
              "Is there process for identifying discrimination risks?",
              "Are known risks disclosed to deployers?",
              "Is Attorney General notified of significant risks?",
              "Are post-deployment discoveries reported?",
            ],
            evidence_examples: [
              "Risk identification process",
              "Deployer disclosure records",
              "AG notification records",
              "Post-deployment disclosure procedures",
            ],
          },
          {
            title: "Sec. 2.5 - Attorney General Cooperation",
            description: "Cooperate with Attorney General investigations and requests",
            order_no: 5,
            summary:
              "Developers must cooperate with the Attorney General in investigations, provide requested documentation and information, and respond to inquiries in a timely manner",
            questions: [
              "Is there process for AG inquiry response?",
              "Can requested documentation be produced?",
              "Is there designated contact for AG matters?",
              "Are response timelines established?",
            ],
            evidence_examples: [
              "AG cooperation procedures",
              "Document production capability",
              "Designated contact information",
              "Response timeline documentation",
            ],
          },
        ],
      },
      {
        title: "Chapter 3: Deployer Duties",
        description: "Obligations for deployers of high-risk AI systems",
        order_no: 3,
        items: [
          {
            title: "Sec. 3.1 - Risk Management Policy and Program",
            description: "Implement risk management policy and program for high-risk AI",
            order_no: 1,
            summary:
              "Deployers must implement a risk management policy and program to govern deployment of high-risk AI. The program must be reasonable and proportionate to the nature and size of the deployer and scope of AI use",
            questions: [
              "Is there documented risk management policy?",
              "Is program proportionate to organization size?",
              "Does program cover all high-risk AI systems?",
              "Is the program regularly reviewed?",
            ],
            evidence_examples: [
              "Risk management policy",
              "Program documentation",
              "Proportionality assessment",
              "Program review records",
            ],
          },
          {
            title: "Sec. 3.2 - Impact Assessment Requirement",
            description: "Complete impact assessments for high-risk AI systems",
            order_no: 2,
            summary:
              "Deployers must complete impact assessments before deploying high-risk AI and annually thereafter. Assessments must evaluate: purpose and intended use, data and algorithms, discrimination risks, and mitigation measures",
            questions: [
              "Are impact assessments completed before deployment?",
              "Are assessments updated annually?",
              "Do assessments cover all required elements?",
              "Are assessments documented and retained?",
            ],
            evidence_examples: [
              "Impact assessment templates",
              "Completed assessments",
              "Annual review schedule",
              "Assessment retention records",
            ],
          },
          {
            title: "Sec. 3.3 - Consumer Notification",
            description: "Notify consumers about AI use in consequential decisions",
            order_no: 3,
            summary:
              "Deployers must notify consumers that a high-risk AI system is being used to make or substantially contribute to a consequential decision. Notification must be provided before or at the time of the decision",
            questions: [
              "Are consumers notified of AI use?",
              "Is notification timely (before or at decision)?",
              "Is notification clear and understandable?",
              "Are notification methods documented?",
            ],
            evidence_examples: [
              "Consumer notification procedures",
              "Sample notifications",
              "Timing verification",
              "Notification delivery records",
            ],
          },
          {
            title: "Sec. 3.4 - Explanation Statement",
            description: "Provide statement explaining AI's role in adverse decisions",
            order_no: 4,
            summary:
              "For adverse decisions, deployers must provide consumers with a statement explaining: the principal reasons for the decision, the role of the AI system, the type of data used, and how to appeal or contest the decision",
            questions: [
              "Are explanation statements provided for adverse decisions?",
              "Do statements include principal reasons?",
              "Is AI's role clearly explained?",
              "Is appeal information included?",
            ],
            evidence_examples: [
              "Explanation statement templates",
              "Sample explanation statements",
              "Appeal process documentation",
              "Statement delivery records",
            ],
          },
          {
            title: "Sec. 3.5 - Appeal and Correction Process",
            description: "Provide opportunity to appeal or correct AI-influenced decisions",
            order_no: 5,
            summary:
              "Deployers must provide consumers opportunity to appeal adverse decisions, correct inaccurate data used in the decision, and request human review. Appeal process must be accessible and timely",
            questions: [
              "Is appeal process established and documented?",
              "Can consumers correct inaccurate data?",
              "Is human review available?",
              "Is appeal process accessible and timely?",
            ],
            evidence_examples: [
              "Appeal process documentation",
              "Data correction procedures",
              "Human review procedures",
              "Appeal response timelines",
            ],
          },
          {
            title: "Sec. 3.6 - Public Disclosure Statement",
            description: "Publish public statement about high-risk AI use",
            order_no: 6,
            summary:
              "Deployers must make publicly available a statement describing: types of high-risk AI systems deployed, how risks of algorithmic discrimination are managed, and contact information for consumer inquiries",
            questions: [
              "Is public statement published?",
              "Does statement describe AI systems used?",
              "Is risk management approach disclosed?",
              "Is contact information provided?",
            ],
            evidence_examples: [
              "Public disclosure statement",
              "Website publication",
              "Contact information",
              "Statement update records",
            ],
          },
        ],
      },
      {
        title: "Chapter 4: Algorithmic Discrimination Prevention",
        description: "Measures to prevent, detect, and remediate algorithmic discrimination",
        order_no: 4,
        items: [
          {
            title: "Sec. 4.1 - Bias Testing and Evaluation",
            description: "Conduct testing to identify potential algorithmic discrimination",
            order_no: 1,
            summary:
              "Implement testing protocols to identify potential discrimination based on protected characteristics. Testing should occur before deployment and periodically thereafter",
            questions: [
              "Is bias testing conducted before deployment?",
              "Are all protected characteristics tested?",
              "Is testing conducted periodically?",
              "Are testing results documented?",
            ],
            evidence_examples: [
              "Bias testing methodology",
              "Testing results documentation",
              "Protected characteristic coverage",
              "Testing schedule",
            ],
          },
          {
            title: "Sec. 4.2 - Training Data Assessment",
            description: "Assess training data for bias and representativeness",
            order_no: 2,
            summary:
              "Evaluate training data sources, quality, and representativeness. Identify and address potential biases embedded in training data that could lead to discriminatory outcomes",
            questions: [
              "Is training data assessed for bias?",
              "Is data representativeness evaluated?",
              "Are data sources vetted for quality?",
              "Are identified biases addressed?",
            ],
            evidence_examples: [
              "Training data assessment",
              "Representativeness analysis",
              "Data source vetting records",
              "Bias remediation documentation",
            ],
          },
          {
            title: "Sec. 4.3 - Outcome Monitoring",
            description: "Monitor AI system outcomes for discriminatory patterns",
            order_no: 3,
            summary:
              "Continuously monitor AI system outcomes to detect disparate impact or differential treatment based on protected characteristics. Establish metrics and thresholds for identifying potential discrimination",
            questions: [
              "Is outcome monitoring implemented?",
              "Are metrics established for discrimination detection?",
              "Are monitoring thresholds defined?",
              "Is there process for responding to findings?",
            ],
            evidence_examples: [
              "Monitoring procedures",
              "Discrimination detection metrics",
              "Threshold documentation",
              "Response procedures",
            ],
          },
          {
            title: "Sec. 4.4 - Remediation Procedures",
            description: "Establish procedures for remediating discovered discrimination",
            order_no: 4,
            summary:
              "Implement procedures for addressing algorithmic discrimination when discovered, including root cause analysis, system correction, affected consumer notification, and prevention of recurrence",
            questions: [
              "Are remediation procedures established?",
              "Is root cause analysis conducted?",
              "Are affected consumers notified?",
              "Are preventive measures implemented?",
            ],
            evidence_examples: [
              "Remediation procedures",
              "Root cause analysis records",
              "Consumer notification records",
              "Prevention measure documentation",
            ],
          },
          {
            title: "Sec. 4.5 - Fair Lending and Insurance Considerations",
            description: "Address specific discrimination concerns in lending and insurance",
            order_no: 5,
            summary:
              "For AI used in lending and insurance decisions, implement additional safeguards to prevent discrimination. Consider intersection with federal fair lending and insurance regulations",
            questions: [
              "Are additional safeguards in place for lending/insurance AI?",
              "Is there compliance with fair lending laws?",
              "Are insurance-specific regulations addressed?",
              "Is disparate impact analyzed for these domains?",
            ],
            evidence_examples: [
              "Lending AI safeguards",
              "Fair lending compliance documentation",
              "Insurance regulation compliance",
              "Domain-specific impact analysis",
            ],
          },
        ],
      },
      {
        title: "Chapter 5: Consumer Rights and Protections",
        description: "Consumer rights under the Colorado AI Act and protection mechanisms",
        order_no: 5,
        items: [
          {
            title: "Sec. 5.1 - Right to Disclosure",
            description: "Consumers' right to know when AI is used in decisions",
            order_no: 1,
            summary:
              "Consumers have the right to be informed when a high-risk AI system is used to make or substantially contribute to consequential decisions about them",
            questions: [
              "Can all AI-influenced decisions be identified?",
              "Is disclosure provided consistently?",
              "Is disclosure clear and understandable?",
              "Are disclosure records maintained?",
            ],
            evidence_examples: [
              "Disclosure procedures",
              "Disclosure templates",
              "Consistency verification",
              "Disclosure records",
            ],
          },
          {
            title: "Sec. 5.2 - Right to Explanation",
            description: "Consumers' right to explanation of adverse decisions",
            order_no: 2,
            summary:
              "For adverse decisions, consumers have the right to receive a meaningful explanation including principal factors, data used, and the AI system's role in the decision",
            questions: [
              "Can meaningful explanations be provided?",
              "Are explanations in plain language?",
              "Do explanations cover required elements?",
              "Are explanations provided timely?",
            ],
            evidence_examples: [
              "Explanation capability",
              "Plain language guidelines",
              "Explanation completeness verification",
              "Response time tracking",
            ],
          },
          {
            title: "Sec. 5.3 - Right to Appeal",
            description: "Consumers' right to appeal AI-influenced decisions",
            order_no: 3,
            summary:
              "Consumers have the right to appeal adverse decisions made or influenced by AI, including the right to human review of the decision",
            questions: [
              "Is appeal process established?",
              "Can consumers access human review?",
              "Are appeals resolved timely?",
              "Are appeal outcomes documented?",
            ],
            evidence_examples: [
              "Appeal procedures",
              "Human review process",
              "Appeal timeline standards",
              "Appeal outcome records",
            ],
          },
          {
            title: "Sec. 5.4 - Right to Data Correction",
            description: "Consumers' right to correct inaccurate data",
            order_no: 4,
            summary:
              "Consumers have the right to correct inaccurate personal data that was used in AI-influenced decisions. Organizations must have procedures for receiving and processing correction requests",
            questions: [
              "Is data correction process established?",
              "Can corrections be processed efficiently?",
              "Are decisions re-evaluated after corrections?",
              "Are correction records maintained?",
            ],
            evidence_examples: [
              "Data correction procedures",
              "Correction request handling",
              "Re-evaluation procedures",
              "Correction records",
            ],
          },
          {
            title: "Sec. 5.5 - Non-Retaliation Protection",
            description: "Protection against retaliation for exercising rights",
            order_no: 5,
            summary:
              "Consumers must not face retaliation for exercising their rights under the Act, including filing complaints, requesting information, or appealing decisions",
            questions: [
              "Is non-retaliation policy in place?",
              "Are staff trained on non-retaliation?",
              "Is there monitoring for potential retaliation?",
              "Are retaliation complaints investigated?",
            ],
            evidence_examples: [
              "Non-retaliation policy",
              "Staff training records",
              "Monitoring procedures",
              "Complaint investigation records",
            ],
          },
        ],
      },
      {
        title: "Chapter 6: Impact Assessments",
        description: "Detailed requirements for algorithmic impact assessments",
        order_no: 6,
        items: [
          {
            title: "Sec. 6.1 - Assessment Methodology",
            description: "Establish methodology for conducting impact assessments",
            order_no: 1,
            summary:
              "Develop standardized methodology for impact assessments covering scope, analysis approach, stakeholder input, and documentation requirements",
            questions: [
              "Is assessment methodology documented?",
              "Is methodology appropriate for AI risks?",
              "Are stakeholder inputs incorporated?",
              "Is methodology consistently applied?",
            ],
            evidence_examples: [
              "Assessment methodology document",
              "Stakeholder input procedures",
              "Methodology application records",
              "Consistency verification",
            ],
          },
          {
            title: "Sec. 6.2 - Purpose and Use Case Analysis",
            description: "Document AI system purpose and intended use cases",
            order_no: 2,
            summary:
              "Assessments must include clear documentation of the AI system's purpose, intended use cases, and the decisions it will inform or make",
            questions: [
              "Is system purpose clearly documented?",
              "Are intended use cases specified?",
              "Are decision types identified?",
              "Are boundaries of use defined?",
            ],
            evidence_examples: [
              "Purpose documentation",
              "Use case specifications",
              "Decision type inventory",
              "Use boundary documentation",
            ],
          },
          {
            title: "Sec. 6.3 - Discrimination Risk Analysis",
            description: "Analyze risks of algorithmic discrimination",
            order_no: 3,
            summary:
              "Assessments must evaluate potential for algorithmic discrimination based on all protected characteristics, considering both direct discrimination and proxy variables",
            questions: [
              "Are discrimination risks thoroughly analyzed?",
              "Are all protected characteristics considered?",
              "Are proxy variables identified?",
              "Is analysis methodology sound?",
            ],
            evidence_examples: [
              "Discrimination risk analysis",
              "Protected characteristic coverage",
              "Proxy variable identification",
              "Analysis methodology documentation",
            ],
          },
          {
            title: "Sec. 6.4 - Mitigation Measures",
            description: "Document measures to mitigate identified risks",
            order_no: 4,
            summary:
              "Assessments must document specific measures implemented to mitigate identified discrimination risks, including technical, procedural, and governance measures",
            questions: [
              "Are mitigation measures documented?",
              "Do measures address identified risks?",
              "Are measures implemented and tested?",
              "Is effectiveness evaluated?",
            ],
            evidence_examples: [
              "Mitigation measure documentation",
              "Risk-mitigation mapping",
              "Implementation verification",
              "Effectiveness evaluation",
            ],
          },
          {
            title: "Sec. 6.5 - Assessment Retention and Updates",
            description: "Retain assessments and update annually or upon changes",
            order_no: 5,
            summary:
              "Impact assessments must be retained for at least three years after the AI system is discontinued. Assessments must be updated annually and when significant changes occur",
            questions: [
              "Are assessments properly retained?",
              "Is retention period at least 3 years post-discontinuation?",
              "Are annual updates conducted?",
              "Are changes triggering updates identified?",
            ],
            evidence_examples: [
              "Retention policy compliance",
              "Assessment archive",
              "Annual update schedule",
              "Change trigger procedures",
            ],
          },
        ],
      },
      {
        title: "Chapter 7: Data Governance",
        description: "Requirements for managing data used in high-risk AI systems",
        order_no: 7,
        items: [
          {
            title: "Sec. 7.1 - Data Quality Standards",
            description: "Establish and maintain data quality standards",
            order_no: 1,
            summary:
              "Implement data quality standards for AI training and operational data including accuracy, completeness, timeliness, and relevance requirements",
            questions: [
              "Are data quality standards documented?",
              "Is data accuracy measured?",
              "Is data completeness assessed?",
              "Are quality issues addressed?",
            ],
            evidence_examples: [
              "Data quality standards",
              "Quality measurement results",
              "Completeness assessments",
              "Quality improvement records",
            ],
          },
          {
            title: "Sec. 7.2 - Data Lineage and Documentation",
            description: "Document data sources, transformations, and lineage",
            order_no: 2,
            summary:
              "Maintain documentation of data sources, collection methods, transformations applied, and data lineage to enable understanding and audit of data used in AI decisions",
            questions: [
              "Is data lineage documented?",
              "Are data sources traceable?",
              "Are transformations documented?",
              "Can data be audited?",
            ],
            evidence_examples: [
              "Data lineage documentation",
              "Source traceability records",
              "Transformation documentation",
              "Audit capability demonstration",
            ],
          },
          {
            title: "Sec. 7.3 - Protected Characteristic Data",
            description: "Appropriately handle data related to protected characteristics",
            order_no: 3,
            summary:
              "Implement appropriate safeguards for data related to protected characteristics. Such data may be necessary for bias testing but requires enhanced protections and use limitations",
            questions: [
              "Is protected characteristic data identified?",
              "Are enhanced safeguards implemented?",
              "Is use limited to legitimate purposes?",
              "Is access appropriately restricted?",
            ],
            evidence_examples: [
              "Protected data inventory",
              "Enhanced safeguard documentation",
              "Use limitation policies",
              "Access control records",
            ],
          },
          {
            title: "Sec. 7.4 - Consumer Data Rights",
            description: "Honor consumer data rights under applicable laws",
            order_no: 4,
            summary:
              "Ensure AI data practices comply with Colorado Privacy Act and other applicable data protection laws, including consumer rights to access, delete, and correct data",
            questions: [
              "Are consumer data rights honored?",
              "Is there compliance with Colorado Privacy Act?",
              "Can access/deletion/correction requests be fulfilled?",
              "Are data practices documented?",
            ],
            evidence_examples: [
              "Data rights procedures",
              "Privacy Act compliance documentation",
              "Request fulfillment records",
              "Practice documentation",
            ],
          },
        ],
      },
      {
        title: "Chapter 8: Governance and Accountability",
        description: "Organizational governance structures for AI Act compliance",
        order_no: 8,
        items: [
          {
            title: "Sec. 8.1 - AI Governance Structure",
            description: "Establish governance structure for AI compliance",
            order_no: 1,
            summary:
              "Implement governance structure with clear roles, responsibilities, and accountability for Colorado AI Act compliance at executive and operational levels",
            questions: [
              "Is governance structure documented?",
              "Are roles and responsibilities clear?",
              "Is there executive accountability?",
              "Is operational responsibility assigned?",
            ],
            evidence_examples: [
              "Governance structure documentation",
              "Roles and responsibilities matrix",
              "Executive accountability documentation",
              "Operational responsibility assignments",
            ],
          },
          {
            title: "Sec. 8.2 - Compliance Program",
            description: "Implement AI Act compliance program",
            order_no: 2,
            summary:
              "Establish comprehensive compliance program including policies, procedures, training, monitoring, and reporting for Colorado AI Act requirements",
            questions: [
              "Is compliance program documented?",
              "Are policies and procedures complete?",
              "Is training provided to relevant personnel?",
              "Is compliance monitored and reported?",
            ],
            evidence_examples: [
              "Compliance program documentation",
              "Policies and procedures",
              "Training program and records",
              "Monitoring and reporting records",
            ],
          },
          {
            title: "Sec. 8.3 - Training and Awareness",
            description: "Train personnel on AI Act requirements and responsibilities",
            order_no: 3,
            summary:
              "Provide training to personnel involved in developing, deploying, or operating high-risk AI systems on their obligations under the Act and organizational procedures",
            questions: [
              "Is training program established?",
              "Does training cover Act requirements?",
              "Are relevant personnel trained?",
              "Is training documented and refreshed?",
            ],
            evidence_examples: [
              "Training program documentation",
              "Training content",
              "Training completion records",
              "Refresh schedule",
            ],
          },
          {
            title: "Sec. 8.4 - Internal Audit and Review",
            description: "Conduct internal audits of AI Act compliance",
            order_no: 4,
            summary:
              "Perform periodic internal audits to assess compliance with AI Act requirements. Track findings and implement corrective actions",
            questions: [
              "Are internal audits conducted?",
              "Do audits cover all requirements?",
              "Are findings tracked to resolution?",
              "Are audit results reported to leadership?",
            ],
            evidence_examples: [
              "Audit program documentation",
              "Audit reports",
              "Finding tracking records",
              "Leadership reporting",
            ],
          },
        ],
      },
      {
        title: "Chapter 9: Documentation and Records",
        description: "Documentation and record retention requirements",
        order_no: 9,
        items: [
          {
            title: "Sec. 9.1 - Technical Documentation",
            description: "Maintain technical documentation for high-risk AI systems",
            order_no: 1,
            summary:
              "Document AI system design, algorithms, training processes, validation methods, and performance characteristics sufficient to demonstrate compliance and enable audit",
            questions: [
              "Is technical documentation complete?",
              "Are algorithms documented?",
              "Is training process documented?",
              "Can compliance be demonstrated?",
            ],
            evidence_examples: [
              "Technical documentation package",
              "Algorithm documentation",
              "Training process documentation",
              "Compliance demonstration capability",
            ],
          },
          {
            title: "Sec. 9.2 - Decision Records",
            description: "Maintain records of AI-influenced decisions",
            order_no: 2,
            summary:
              "Keep records of consequential decisions made or influenced by high-risk AI, including inputs, outputs, and human review activities",
            questions: [
              "Are decision records maintained?",
              "Do records include inputs and outputs?",
              "Is human review documented?",
              "Can decisions be reconstructed?",
            ],
            evidence_examples: [
              "Decision logging system",
              "Input/output records",
              "Human review records",
              "Decision reconstruction capability",
            ],
          },
          {
            title: "Sec. 9.3 - Consumer Interaction Records",
            description: "Maintain records of consumer notifications and responses",
            order_no: 3,
            summary:
              "Document consumer notifications, explanation statements, appeals, and resolution outcomes related to AI-influenced decisions",
            questions: [
              "Are notification records maintained?",
              "Are explanations documented?",
              "Are appeals tracked to resolution?",
              "Can consumer interactions be retrieved?",
            ],
            evidence_examples: [
              "Notification records",
              "Explanation documentation",
              "Appeal tracking system",
              "Record retrieval capability",
            ],
          },
          {
            title: "Sec. 9.4 - Record Retention",
            description: "Retain records for required periods",
            order_no: 4,
            summary:
              "Retain impact assessments, decision records, and compliance documentation for at least three years after AI system discontinuation or decision date",
            questions: [
              "Is retention policy compliant?",
              "Are records securely stored?",
              "Can records be produced upon request?",
              "Is destruction properly managed?",
            ],
            evidence_examples: [
              "Retention policy",
              "Secure storage procedures",
              "Record production capability",
              "Destruction records",
            ],
          },
        ],
      },
      {
        title: "Chapter 10: Enforcement and Penalties",
        description: "Preparation for enforcement and penalty mitigation",
        order_no: 10,
        items: [
          {
            title: "Sec. 10.1 - Attorney General Authority",
            description: "Understand Attorney General enforcement authority",
            order_no: 1,
            summary:
              "The Colorado Attorney General has exclusive authority to enforce the AI Act, including investigation powers, civil penalties, and injunctive relief. Understand enforcement mechanisms and prepare accordingly",
            questions: [
              "Is AG enforcement authority understood?",
              "Is there process for responding to AG?",
              "Can documentation be produced promptly?",
              "Is there designated AG contact?",
            ],
            evidence_examples: [
              "Enforcement authority analysis",
              "AG response procedures",
              "Documentation production capability",
              "Designated contact information",
            ],
          },
          {
            title: "Sec. 10.2 - Affirmative Defense",
            description: "Establish basis for affirmative defense if needed",
            order_no: 2,
            summary:
              "The Act provides affirmative defense for deployers who maintain and follow a risk management program, complete impact assessments, and comply with consumer notification requirements. Document compliance to support defense",
            questions: [
              "Are affirmative defense elements documented?",
              "Is risk management program maintained?",
              "Are impact assessments complete?",
              "Is consumer notification compliant?",
            ],
            evidence_examples: [
              "Affirmative defense documentation",
              "Risk management compliance evidence",
              "Impact assessment completeness",
              "Notification compliance records",
            ],
          },
          {
            title: "Sec. 10.3 - Cure Period",
            description: "Understand and prepare for cure period opportunity",
            order_no: 3,
            summary:
              "Before enforcement action, deployers may have opportunity to cure violations. Understand cure requirements and maintain ability to implement rapid remediation",
            questions: [
              "Is cure period understood?",
              "Can violations be quickly identified?",
              "Can remediation be implemented rapidly?",
              "Is cure documentation prepared?",
            ],
            evidence_examples: [
              "Cure period analysis",
              "Violation identification capability",
              "Rapid remediation procedures",
              "Cure documentation templates",
            ],
          },
          {
            title: "Sec. 10.4 - Civil Penalty Mitigation",
            description: "Implement measures to mitigate potential civil penalties",
            order_no: 4,
            summary:
              "Civil penalties can reach $20,000 per violation. Mitigate penalty risk through documented compliance efforts, good faith implementation, and prompt violation remediation",
            questions: [
              "Is penalty structure understood?",
              "Are compliance efforts documented?",
              "Is good faith demonstrable?",
              "Are violations promptly remediated?",
            ],
            evidence_examples: [
              "Penalty risk assessment",
              "Compliance effort documentation",
              "Good faith evidence",
              "Remediation records",
            ],
          },
        ],
      },
    ],
  },
};

export default coloradoAiActStructure;
