import type { FrameworkStructure } from "../types";

/**
 * Saudi National AI Index (NAII), SDAIA-P123 version 1 (May 2025).
 *
 * The index has 3 pillars (Directions, Enablers, Outputs), 7 sub-pillars and
 * 23 domains. Level 1 is the sub-pillar, titled "<pillar>: <sub-pillar>"; level
 * 2 is the domain. Titles and descriptions follow SDAIA's document. SDAIA
 * shares its questionnaire only with participating entities, so `questions`
 * and `evidence_examples` are VerifyWise guidance written from the domain
 * descriptions, not SDAIA's questions.
 *
 * The "Employee productivity" description follows SDAIA's text, which
 * describes beneficiary-facing personalization in both the English and Arabic
 * editions; its guidance questions also cover staff productivity.
 */
export const saudiNaiiStructure: FrameworkStructure = {
  id: 30,
  key: "saudi-naii",
  framework_type: "saudi_naii",
  displayName: "Saudi National AI Index (NAII)",
  tables: {
    l1_struct: "saudi_naii_sub_pillars_struct",
    l2_struct: "saudi_naii_domains_struct",
    l2_impl: "saudi_naii_domains",
    l2_risks: "saudi_naii_domains__risks",
  },
  cols: {
    l2_struct_parent: "sub_pillar_id",
    l2_impl_meta: "domain_meta_id",
    l2_risks_impl: "domain_id",
  },
  entity_types: {
    l2_impl: "domain",
  },
  source_labels: {
    domain: "Saudi NAII domains",
  },
  seed: {
    name: "Saudi National AI Index (NAII)",
    description:
      "SDAIA's National AI Index (SDAIA-P123, May 2025) measuring a government entity's readiness to adopt AI across 3 pillars, 7 sub-pillars and 23 domains, with results on six adoption levels from 0 (absence of capabilities) to 5 (pioneer). Questions and evidence examples are guidance, not SDAIA's questionnaire",
    version: "1",
    is_organizational: true,
    hierarchy: {
      type: "two_level",
      level1_name: "Sub-pillar",
      level2_name: "Domain",
    },
    structure: [
      {
        title: "Directions: Strategy",
        description:
          "An ambitious strategy for integrating AI into the entity's operations that defines priorities, requirements, actions, timelines and the governance needed for sustainable implementation",
        order_no: 1,
        items: [
          {
            title: "Planning and performance",
            description:
              "An AI strategy and vision that serve as the enterprise reference for directing AI efforts toward measurable objectives and priority domains, link initiatives to enterprise objectives and align with national strategies and Saudi Vision 2030",
            order_no: 1,
            summary: "Set an AI strategy with measurable objectives",
            questions: [
              "Is there an approved AI strategy and vision for the entity?",
              "Does the strategy set measurable objectives and priority domains?",
              "How does it align with the National Strategy for Data and AI and Saudi Vision 2030?",
              "How is progress against the strategy measured and reported?",
            ],
            evidence_examples: [
              "Approved AI strategy and vision",
              "AI objectives and performance indicators",
              "Mapping of AI objectives to national strategies and Vision 2030",
              "Strategy progress reports",
            ],
          },
          {
            title: "Initiatives",
            description:
              "Operational and experimental initiatives that translate the strategic vision into practical projects with tangible impact, such as process automation and intelligent recommendations",
            order_no: 2,
            summary: "Turn the AI strategy into funded, owned initiatives",
            questions: [
              "Is there a portfolio of AI initiatives linked to the strategy?",
              "Does the portfolio include both operational and experimental initiatives?",
              "Does each initiative have an owner, a timeline and an expected impact?",
              "How are initiatives prioritized and their outcomes tracked?",
            ],
            evidence_examples: [
              "AI initiatives portfolio or roadmap",
              "Initiative charters with owners and timelines",
              "Pilot results and lessons learned",
              "Initiative status reports",
            ],
          },
          {
            title: "Budget",
            description:
              "A dedicated budget for implementing AI initiatives within the entity, which turns plans into outcomes and reflects a strategic commitment to digital transformation",
            order_no: 3,
            summary: "Fund AI initiatives through a dedicated budget",
            questions: [
              "Is there a dedicated, approved budget for AI initiatives?",
              "Is the budget allocated to specific initiatives?",
              "How is AI spending tracked against the plan?",
              "Is funding planned beyond the current year?",
            ],
            evidence_examples: [
              "Approved AI budget allocation",
              "Budget breakdown by initiative",
              "AI spending reports",
              "Multi-year funding plan",
            ],
          },
        ],
      },
      {
        title: "Directions: Governance",
        description:
          "Frameworks, policies and enterprise structures that regulate the development and use of AI, define roles, responsibilities and decision-making, and keep its use compliant, safe and responsible through periodic reviews",
        order_no: 2,
        items: [
          {
            title: "Frameworks and policies",
            description:
              "Regulatory frameworks and policies that form the foundation of effective AI governance, support the organized use of smart technologies, strengthen public trust and consider cultural and developmental specificities",
            order_no: 1,
            summary: "Adopt an AI governance framework and policies",
            questions: [
              "Has the entity adopted an AI governance framework?",
              "Are AI policies approved and communicated to staff?",
              "Do the policies cover the AI life cycle, from acquisition and development to retirement?",
              "How often are the framework and policies reviewed against local and global practice?",
            ],
            evidence_examples: [
              "AI governance framework",
              "Approved AI policies",
              "Policy communication records",
              "Policy review log",
            ],
          },
          {
            title: "Regulatory enablement",
            description:
              "A regulatory unit dedicated to AI within the entity, with clearly defined mandates, to strengthen governance and enterprise transformation",
            order_no: 2,
            summary: "Establish a dedicated AI unit with a clear mandate",
            questions: [
              "Is there a unit dedicated to AI within the entity?",
              "Are its mandate, roles and responsibilities formally approved?",
              "Who does the unit report to?",
              "Are decision rights and escalation paths for AI defined?",
            ],
            evidence_examples: [
              "Decision establishing the AI unit",
              "Unit mandate or terms of reference",
              "Organization chart",
              "Responsibility matrix for AI decisions",
            ],
          },
          {
            title: "Reliability and safety",
            description:
              "The accuracy and stability of AI systems, ensured through control procedures, adherence to national standards and mitigation of potential risks, in alignment with the relevant regulatory frameworks",
            order_no: 3,
            summary: "Control the accuracy, stability and risks of AI systems",
            questions: [
              "Are there control procedures that check AI system accuracy and stability before and after deployment?",
              "Are risks of AI systems identified, assessed and mitigated?",
              "Which national standards do the entity's AI systems adhere to?",
              "How are AI system failures and incidents handled?",
            ],
            evidence_examples: [
              "AI risk assessments",
              "Testing and validation reports",
              "Monitoring and control procedures",
              "AI incident records",
            ],
          },
          {
            title: "Regulatory compliance",
            description:
              "Regulations embedded into daily operations rather than treated as a formality, including the regulatory frameworks issued by SDAIA such as the Generative AI Guidelines and the Deepfake Guidelines",
            order_no: 4,
            summary: "Apply SDAIA's AI regulatory frameworks in daily work",
            questions: [
              "Which SDAIA regulatory instruments apply to the entity's use of AI?",
              "How are the Generative AI Guidelines and Deepfake Guidelines applied in practice?",
              "Are compliance checks built into AI processes rather than done once?",
              "How is compliance monitored and evidenced?",
            ],
            evidence_examples: [
              "Register of applicable AI regulations and guidelines",
              "Generative AI usage controls",
              "Compliance assessments against SDAIA guidelines",
              "Compliance monitoring reports",
            ],
          },
        ],
      },
      {
        title: "Enablers: Data",
        description:
          "The data foundation of AI applications: a robust enterprise structure, data quality, and privacy and security, supporting the sustainability and efficiency of AI models",
        order_no: 3,
        items: [
          {
            title: "Availability and accessibility",
            description:
              "Data that is available and easy to access through data discovery tools, data catalogs and automated updates that keep it current",
            order_no: 1,
            summary: "Make data discoverable, accessible and current",
            questions: [
              "Is there a data catalog covering the data used for AI?",
              "Can teams discover and request data through defined tools?",
              "Is data updated automatically to stay current?",
              "How is access to data granted and recorded?",
            ],
            evidence_examples: [
              "Data catalog",
              "Data discovery tools",
              "Data access request process",
              "Automated data update schedules",
            ],
          },
          {
            title: "Quality and integration",
            description:
              "Data quality that supports model accuracy: tracking data sources, documenting usage rights, conducting legal reviews of data use and complying with intellectual property rights",
            order_no: 2,
            summary: "Track data sources, rights and quality",
            questions: [
              "Are the sources of AI training and input data tracked?",
              "Are usage rights documented for each dataset?",
              "Is there a legal review before data is used for AI?",
              "How are data quality and intellectual property compliance checked?",
            ],
            evidence_examples: [
              "Data source and lineage records",
              "Dataset usage rights register",
              "Legal review records",
              "Data quality reports",
            ],
          },
          {
            title: "Reliability",
            description:
              "Data continuity and trust, supported by distributed cloud storage and backup solutions for disaster recovery",
            order_no: 3,
            summary: "Protect data continuity with backups and recovery",
            questions: [
              "Is data stored on distributed or redundant storage?",
              "Are backups taken and restores tested?",
              "Does a disaster recovery plan cover the data used for AI?",
              "Are recovery time and recovery point objectives set?",
            ],
            evidence_examples: [
              "Backup policy and schedules",
              "Restore test results",
              "Disaster recovery plan",
              "Storage architecture documentation",
            ],
          },
        ],
      },
      {
        title: "Enablers: Infrastructure",
        description:
          "Digital resources such as servers, cloud and data centers that enable the development and operation of AI applications, kept flexible, scalable and secure for consistent performance",
        order_no: 4,
        items: [
          {
            title: "Technical standards",
            description:
              "Compatibility, performance and sustainability through a scalable, flexible infrastructure that can accommodate growth and integrates with national platforms",
            order_no: 1,
            summary: "Set infrastructure standards and integrate with national platforms",
            questions: [
              "Are technical standards defined for AI infrastructure?",
              "Can the infrastructure scale with growing AI workloads?",
              "Is the infrastructure integrated with national platforms?",
              "How is compatibility checked when new AI components are added?",
            ],
            evidence_examples: [
              "Infrastructure technical standards",
              "Architecture documentation",
              "National platform integration records",
              "Capacity plan",
            ],
          },
          {
            title: "Availability and monitoring",
            description:
              "A flexible internal high-performance computing infrastructure that supports AI, with scalability, operational efficiency and regular hardware upgrades",
            order_no: 2,
            summary: "Provide and monitor high-performance computing for AI",
            questions: [
              "Does the entity have high-performance computing capacity for AI?",
              "Are utilization and performance of that capacity monitored?",
              "Is there a plan for regular hardware upgrades?",
              "How are capacity shortfalls identified and addressed?",
            ],
            evidence_examples: [
              "Computing capacity inventory",
              "Monitoring dashboards",
              "Hardware upgrade plan",
              "Utilization reports",
            ],
          },
          {
            title: "Operational resilience",
            description:
              "Service continuity with downtime not exceeding 30 minutes a year, and predictive analytics used to reduce potential outages",
            order_no: 3,
            summary: "Keep downtime under 30 minutes a year",
            questions: [
              "What was the downtime of AI services over the past year, against the 30-minute target?",
              "Are predictive analytics used to anticipate outages?",
              "Is there a continuity plan for AI services?",
              "Are outages reviewed to find their root causes?",
            ],
            evidence_examples: [
              "Availability and downtime reports",
              "Predictive monitoring tools",
              "Service continuity plan",
              "Outage reviews",
            ],
          },
        ],
      },
      {
        title: "Enablers: Human capabilities",
        description:
          "Specialized expertise in AI design, development, operation and governance: attracting talent, training professionals, building career paths, providing a motivating work environment and fostering academic partnerships",
        order_no: 5,
        items: [
          {
            title: "Headcount and diversity",
            description:
              "Diverse teams with deep expertise, aligned with the National Occupational Standard Framework for Data and Artificial Intelligence",
            order_no: 1,
            summary: "Build diverse AI teams mapped to national occupational standards",
            questions: [
              "How many AI specialists does the entity employ, by role?",
              "Do the teams cover AI design, development, operation and governance?",
              "Are roles mapped to the National Occupational Standard Framework for Data and AI?",
              "Have skill gaps been identified?",
            ],
            evidence_examples: [
              "AI headcount by role",
              "Role mapping to the national occupational standard framework",
              "Skills gap analysis",
              "Team structure",
            ],
          },
          {
            title: "Professional development",
            description:
              "A sustainable training plan that supports continuous learning, is aligned with job roles and offers accredited certifications in the field",
            order_no: 2,
            summary: "Train staff through a role-based plan with accredited certifications",
            questions: [
              "Is there an AI training plan aligned with job roles?",
              "Does it support continuous learning rather than one-off courses?",
              "Does it offer accredited certifications?",
              "How are completion and effectiveness tracked?",
            ],
            evidence_examples: [
              "AI training plan",
              "Training completion records",
              "Accredited certifications held by staff",
              "Role-based learning paths",
            ],
          },
          {
            title: "Academic collaboration",
            description:
              "Partnerships with universities and institutes that supply qualified talent, create an applied learning environment and attract talented students through training programs and technology competitions",
            order_no: 3,
            summary: "Partner with universities and institutes",
            questions: [
              "Does the entity have partnerships with universities or institutes on AI?",
              "Are there training programs or internships for students?",
              "Does the entity run or take part in technology competitions?",
              "How do partnerships feed into hiring?",
            ],
            evidence_examples: [
              "Partnership agreements",
              "Internship and training program records",
              "Technology competition records",
              "Joint projects with academic institutions",
            ],
          },
          {
            title: "Job stability",
            description:
              "Retention of specialized AI talent by analyzing the causes of attrition, developing professional and financial incentives and aligning HR policies with the National Occupational Standard Framework",
            order_no: 4,
            summary: "Retain AI talent through incentives and aligned HR policies",
            questions: [
              "Is attrition among AI specialists measured and its causes analyzed?",
              "Are there professional and financial incentives to retain AI talent?",
              "Are HR policies aligned with the National Occupational Standard Framework?",
              "Are career paths defined for AI roles?",
            ],
            evidence_examples: [
              "Attrition analysis",
              "Retention incentive program",
              "HR policies aligned with the national occupational standard framework",
              "AI career path definitions",
            ],
          },
        ],
      },
      {
        title: "Outputs: Applications",
        description:
          "In-house capabilities to develop AI-based products and applications, one of the most significant indicators of enterprise AI maturity",
        order_no: 6,
        items: [
          {
            title: "Development and deployment",
            description:
              "The number of AI applications developed, and the development and deployment of intelligent applications tailored to the entity's needs through an internal development environment that supports model life cycle management with frameworks such as MLOps",
            order_no: 1,
            summary: "Build and deploy AI applications with life cycle management",
            questions: [
              "How many AI applications has the entity developed and deployed?",
              "Is there an internal development environment for AI?",
              "Is the model life cycle managed with practices such as MLOps?",
              "How are applications approved for deployment?",
            ],
            evidence_examples: [
              "Inventory of AI applications",
              "Development environment documentation",
              "Model registry and MLOps pipeline records",
              "Deployment approval records",
            ],
          },
          {
            title: "Privacy and security",
            description:
              "A security and privacy by design approach that builds in encryption and access controls from the earliest stages of analysis, complies with national regulations such as the Personal Data Protection Law, and keeps immediate recovery plans and periodic risk measurement",
            order_no: 2,
            summary: "Build privacy and security into AI applications from the start",
            questions: [
              "Are encryption and access controls designed in from the first stages of analysis?",
              "How do AI applications comply with the Personal Data Protection Law?",
              "Are there recovery plans for AI applications?",
              "Are security and privacy risks measured periodically?",
            ],
            evidence_examples: [
              "Privacy impact assessments",
              "Security design reviews",
              "Personal Data Protection Law compliance records",
              "Recovery plans and test results",
            ],
          },
          {
            title: "Operation and management",
            description:
              "Tracking model usage and linking performance to enterprise indicators such as service quality and cost reduction, with intelligent monitoring for proactive improvement and analytical reports to senior management",
            order_no: 3,
            summary: "Monitor models against enterprise indicators and report to management",
            questions: [
              "Is the usage of each model tracked?",
              "Is model performance linked to enterprise indicators such as service quality and cost?",
              "Is monitoring in place to catch issues and improve models proactively?",
              "Are analytical reports sent to senior management?",
            ],
            evidence_examples: [
              "Model usage and performance dashboards",
              "Mapping of models to enterprise indicators",
              "Monitoring alerts and actions",
              "Reports to senior management",
            ],
          },
        ],
      },
      {
        title: "Outputs: Impact",
        description:
          "The impact of AI, from cost reduction and efficiency to better user experience and more accurate decisions, realized when AI is integrated in alignment with strategy, governance and enablers",
        order_no: 7,
        items: [
          {
            title: "Operational efficiency",
            description:
              "Lower costs and higher productivity from automating manual processes, measured with return on investment models covering productivity gains, time savings and performance improvements. AI supports at least 25% of jobs, with productivity gains targeted above 15%, and performance analysis tools link job training to actual outcomes",
            order_no: 1,
            summary: "Measure AI's return on investment and efficiency gains",
            questions: [
              "Is the impact of AI measured with return on investment models?",
              "What share of jobs does AI support, against the 25% target?",
              "What productivity gains are measured, against the 15% target?",
              "Are performance analysis tools used to link training to outcomes?",
            ],
            evidence_examples: [
              "Return on investment analyses",
              "Process automation records",
              "Productivity measurements",
              "Performance analysis reports",
            ],
          },
          {
            title: "Employee productivity",
            description:
              "AI used to analyze beneficiary behavior and personalize services, improving time-related performance indicators by more than 20%, with proactive solutions such as chatbots and AI integrated across all service channels",
            order_no: 2,
            summary: "Improve time-related performance indicators by more than 20%",
            questions: [
              "Which employee tasks are supported by AI, and what time savings are measured?",
              "Have time-related performance indicators improved by more than 20%?",
              "Are proactive solutions such as chatbots used across service channels?",
              "Is beneficiary behavior analyzed to personalize services?",
            ],
            evidence_examples: [
              "Time-related performance indicator reports",
              "Inventory of AI tools used by employees",
              "Chatbot and service channel records",
              "Personalization analyses",
            ],
          },
          {
            title: "Service quality and improvement",
            description:
              "AI used to deliver interactive, personalized and proactive services through diverse channels for users, customers or citizens. AI powers more than 25% of services, with improvements in response time, satisfaction and personalization exceeding 20%",
            order_no: 3,
            summary: "Power more than 25% of services with AI",
            questions: [
              "What share of the entity's services are powered by AI, against the 25% target?",
              "Through which channels are AI-powered services delivered?",
              "How have response time, satisfaction and personalization changed, against the 20% target?",
              "How is service quality measured before and after AI?",
            ],
            evidence_examples: [
              "Service catalog showing AI-powered services",
              "Response time and satisfaction reports",
              "Before and after service measurements",
              "Channel integration records",
            ],
          },
        ],
      },
    ],
  },
};

export default saudiNaiiStructure;
