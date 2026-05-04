// Start of Selection
export const ISO42001AnnexList = [
  {
    id: 1,
    order: "A",
    title: "Reference Controls (Statement of Applicability)",
    annexes: [
      {
        id: 1,
        order: 5,
        title: "Organizational policies and governance",
        controls: [
          {
            id: 1,
            control_no: 1,
            control_subSection: 1,
            title: "Policies for AI",
            shortDescription: "Management direction and support for AI via policies.",
            guidance:
              "Management should define and endorse a set of policies to provide clear direction and support for AI development and use within the organization, aligned with business objectives and relevant regulations/ethics.",
            status: "Not Started",
          },
          {
            id: 2,
            control_no: 2,
            control_subSection: 1,
            title: "AI governance framework",
            shortDescription: "Establishment of a governance structure for AI oversight.",
            guidance:
              "An AI governance framework, including roles, responsibilities, processes, and oversight mechanisms, should be established and maintained to direct and control the organization's AI-related activities.",
            status: "Draft",
          },
          {
            id: 3,
            control_no: 3,
            control_subSection: 1,
            title: "AI roles and responsibilities",
            shortDescription: "Defining and allocating AI responsibilities.",
            guidance: "All AI system related responsibilities should be defined and allocated.",
            status: "In Progress",
          },
          {
            id: 4,
            control_no: 3,
            control_subSection: 2,
            title: "Segregation of duties",
            shortDescription: "Separating conflicting duties related to AI.",
            guidance: "Conflicting duties and areas of responsibility should be segregated.",
            status: "Awaiting Review",
          },
          {
            id: 5,
            control_no: 4,
            control_subSection: 1,
            title: "Accountability for AI systems",
            shortDescription: "Assigning accountability for AI systems.",
            guidance:
              "Accountability should be assigned for the establishment, implementation, maintenance, monitoring, evaluation and improvement of the AIMS and for AI systems throughout their lifecycle.",
            status: "Awaiting Approval",
          },
          {
            id: 6,
            control_no: 5,
            control_subSection: 1,
            title: "Contact with authorities",
            shortDescription: "Maintaining contact with relevant authorities.",
            guidance: "Appropriate contacts with relevant authorities should be maintained.",
            status: "Implemented",
          },
          {
            id: 7,
            control_no: 5,
            control_subSection: 2,
            title: "Contact with special interest groups",
            shortDescription: "Maintaining contact with special interest groups.",
            guidance:
              "Appropriate contacts with special interest groups and other specialist forums and professional associations should be maintained.",
            status: "Implemented",
          },
          {
            id: 8,
            control_no: 6,
            control_subSection: 1,
            title: "AI in project management",
            shortDescription: "Integrating AI aspects into project management.",
            guidance: "AI should be integrated into the organization's project management.",
            status: "Needs Rework",
          },
        ],
      },
      {
        id: 2,
        order: 6,
        title: "Internal organization",
        controls: [
          {
            id: 9,
            control_no: 1,
            control_subSection: 1,
            title: "AI roles and responsibilities",
            shortDescription: "Defining and allocating AI responsibilities.",
            guidance:
              "All responsibilities related to the development, deployment, operation, and governance of AI systems should be clearly defined and allocated.",
            status: "Not Started",
          },
          {
            id: 10,
            control_no: 1,
            control_subSection: 2,
            title: "Segregation of duties",
            shortDescription: "Separating conflicting duties related to AI.",
            guidance:
              "Conflicting duties and areas of responsibility should be segregated to reduce opportunities for unauthorized or unintentional modification or misuse of AI systems or related assets.",
            status: "Draft",
          },
        ],
      },
      {
        id: 3,
        order: 7,
        title: "Resources for AI systems",
        controls: [
          {
            id: 11,
            control_no: 1,
            control_subSection: 1,
            title: "Identification of resources",
            shortDescription: "Identifying resources needed for AI.",
            guidance:
              "Resources necessary for the development, operation, and maintenance of AI systems, including data, knowledge, processes, systems, computing power, and human expertise, should be identified and managed.",
            status: "In Progress",
          },
          {
            id: 12,
            control_no: 2,
            control_subSection: 1,
            title: "Computational resources",
            shortDescription: "Managing computational resources for AI.",
            guidance:
              "Computational resources required for AI systems should be managed throughout their lifecycle.",
            status: "Awaiting Review",
          },
          {
            id: 13,
            control_no: 3,
            control_subSection: 1,
            title: "Data resources",
            shortDescription: "Managing data resources for AI.",
            guidance:
              "Data resources required for AI systems should be managed throughout their lifecycle.",
            status: "Awaiting Approval",
          },
          {
            id: 14,
            control_no: 4,
            control_subSection: 1,
            title: "System resources",
            shortDescription: "Managing system resources for AI.",
            guidance:
              "System resources required for AI systems, including tools and infrastructure, should be managed throughout their lifecycle.",
            status: "Implemented",
          },
          {
            id: 15,
            control_no: 5,
            control_subSection: 1,
            title: "Human resources",
            shortDescription: "Managing human resources for AI.",
            guidance:
              "Human resources required for AI systems, including roles, competencies, and training, should be managed throughout their lifecycle.",
            status: "Implemented",
          },
        ],
      },
      {
        id: 4,
        order: 8,
        title: "AI system lifecycle",
        controls: [
          {
            id: 16,
            control_no: 1,
            control_subSection: 1,
            title: "AI system lifecycle management",
            shortDescription: "Establishing and managing a defined AI lifecycle process.",
            guidance:
              "A defined lifecycle process should be established and managed for AI systems, covering stages from conception through retirement, incorporating AI-specific considerations.",
            status: "Needs Rework",
          },
          {
            id: 17,
            control_no: 2,
            control_subSection: 1,
            title: "AI system requirements analysis",
            shortDescription: "Analyzing and specifying AI system requirements.",
            guidance:
              "Requirements for AI systems, including functional, non-functional, data, ethical, legal, and societal aspects, should be analyzed and specified.",
            status: "Not Started",
          },
          {
            id: 18,
            control_no: 3,
            control_subSection: 1,
            title: "AI system design",
            shortDescription: "Designing AI systems based on requirements.",
            guidance:
              "AI systems should be designed based on specified requirements, considering architecture, models, data handling, and interaction mechanisms.",
            status: "Draft",
          },
          {
            id: 19,
            control_no: 4,
            control_subSection: 1,
            title: "Data acquisition and preparation",
            shortDescription: "Acquiring and preparing data for AI systems.",
            guidance:
              "Data for AI systems should be acquired, pre-processed, and prepared according to requirements and quality criteria.",
            status: "In Progress",
          },
          {
            id: 20,
            control_no: 5,
            control_subSection: 1,
            title: "Model building and evaluation",
            shortDescription: "Building, training, and evaluating AI models.",
            guidance:
              "AI models should be built, trained, tuned, and evaluated using appropriate techniques and metrics.",
            status: "Awaiting Review",
          },
          {
            id: 21,
            control_no: 6,
            control_subSection: 1,
            title: "AI system verification and validation",
            shortDescription: "Verifying and validating AI systems.",
            guidance:
              "AI systems should be verified and validated against requirements before deployment.",
            status: "Awaiting Approval",
          },
          {
            id: 22,
            control_no: 7,
            control_subSection: 1,
            title: "AI system deployment",
            shortDescription: "Deploying AI systems into the operational environment.",
            guidance:
              "AI systems should be deployed into the operational environment according to planned procedures.",
            status: "Implemented",
          },
          {
            id: 23,
            control_no: 8,
            control_subSection: 1,
            title: "AI system operation and monitoring",
            shortDescription: "Operating and monitoring AI systems.",
            guidance:
              "Deployed AI systems should be operated and monitored for performance, behaviour, and compliance with requirements.",
            status: "Implemented",
          },
          {
            id: 24,
            control_no: 9,
            control_subSection: 1,
            title: "AI system maintenance and retirement",
            shortDescription: "Maintaining and retiring AI systems.",
            guidance:
              "AI systems should be maintained throughout their operational life and retired securely when no longer needed.",
            status: "Needs Rework",
          },
        ],
      },
      {
        id: 5,
        order: 9,
        title: "Data for AI systems",
        controls: [
          {
            id: 25,
            control_no: 1,
            control_subSection: 1,
            title: "Data quality for AI systems",
            shortDescription: "Processes to ensure data quality characteristics.",
            guidance:
              "Processes should be implemented to ensure that data used for developing and operating AI systems meets defined quality criteria relevant to its intended use (e.g., accuracy, completeness, timeliness, relevance, representativeness).",
            status: "Not Started",
          },
          {
            id: 26,
            control_no: 2,
            control_subSection: 1,
            title: "Data acquisition",
            shortDescription: "Managing the acquisition of data for AI.",
            guidance:
              "Data acquisition processes should ensure data is obtained legally, ethically, and according to specified requirements.",
            status: "Draft",
          },
          {
            id: 27,
            control_no: 3,
            control_subSection: 1,
            title: "Data preparation",
            shortDescription: "Preparing data for use in AI systems.",
            guidance:
              "Data should be prepared (cleaned, transformed, annotated) suitable for its intended use in AI system development and operation.",
            status: "In Progress",
          },
          {
            id: 28,
            control_no: 4,
            control_subSection: 1,
            title: "Data provenance",
            shortDescription: "Documenting the origin and history of data.",
            guidance:
              "Information about the origin, history, and processing steps applied to data (provenance) should be documented and maintained.",
            status: "Awaiting Review",
          },
          {
            id: 29,
            control_no: 5,
            control_subSection: 1,
            title: "Data privacy",
            shortDescription: "Protecting privacy in data used for AI.",
            guidance:
              "Privacy requirements should be addressed throughout the data lifecycle, including anonymization or pseudonymization where appropriate.",
            status: "Awaiting Approval",
          },
          {
            id: 30,
            control_no: 6,
            control_subSection: 1,
            title: "Data handling",
            shortDescription: "Securely handling data throughout its lifecycle.",
            guidance:
              "Data should be handled securely, including storage, access control, transmission, and disposal, according to its classification and applicable requirements.",
            status: "Implemented",
          },
        ],
      },
      {
        id: 6,
        order: 10,
        title: "Information and communication technology (ICT)",
        controls: [
          {
            id: 31,
            control_no: 1,
            control_subSection: 1,
            title: "Information security for AI systems",
            shortDescription: "Application of information security controls to AI systems.",
            guidance:
              "Information security requirements and controls (potentially leveraging standards like ISO/IEC 27001) should be applied throughout the AI system lifecycle to protect confidentiality, integrity, and availability.",
            status: "Implemented",
          },
          {
            id: 32,
            control_no: 2,
            control_subSection: 1,
            title: "Security of AI models",
            shortDescription: "Protecting AI models from threats.",
            guidance:
              "AI models should be protected against threats such as unauthorized access, modification, theft, or poisoning.",
            status: "Needs Rework",
          },
          {
            id: 33,
            control_no: 3,
            control_subSection: 1,
            title: "Security of AI data",
            shortDescription: "Protecting data used by AI systems.",
            guidance:
              "Data used in AI systems should be protected according to information security policies and data classification.",
            status: "Not Started",
          },
          {
            id: 34,
            control_no: 4,
            control_subSection: 1,
            title: "Resilience of AI systems",
            shortDescription: "Ensuring AI systems are resilient to failures and attacks.",
            guidance:
              "AI systems should be designed and operated to be resilient against failures, errors, and attacks.",
            status: "Draft",
          },
        ],
      },
      {
        id: 7,
        order: 11,
        title: "Third party relationships",
        controls: [
          {
            id: 35,
            control_no: 1,
            control_subSection: 1,
            title: "Management of third-party AI related risks",
            shortDescription:
              "Managing risks when using third-party AI systems, components, or data.",
            guidance:
              "Risks associated with third-party provision or use of AI systems, components, services, or data should be identified, assessed, and managed through appropriate agreements and monitoring.",
            status: "In Progress",
          },
          {
            id: 36,
            control_no: 2,
            control_subSection: 1,
            title: "Supplier agreements for AI",
            shortDescription: "Including AI-specific requirements in supplier agreements.",
            guidance:
              "Agreements with third parties supplying AI systems, components, services, or data should include relevant AI-specific requirements (e.g., security, privacy, ethics, performance).",
            status: "Awaiting Review",
          },
          {
            id: 37,
            control_no: 3,
            control_subSection: 1,
            title: "Monitoring of third-party AI services",
            shortDescription: "Monitoring third-party compliance and performance.",
            guidance:
              "The performance and compliance of third parties involved in the AI system lifecycle should be monitored according to agreements.",
            status: "Awaiting Approval",
          },
        ],
      },
    ],
  },
];
