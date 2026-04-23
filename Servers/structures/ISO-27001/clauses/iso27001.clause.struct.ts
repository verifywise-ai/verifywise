export const ISO27001Clause = [
  {
    arrangement: 4,
    title: "Context of the organization",
    subclauses: [
      {
        arrangement: 4,
        index: 1,
        title: "Understanding the organization and its context",
        requirement_summary:
          "Identify what internal and external factors affect how your company manages information security.",
        key_questions: [
          "What business goals or challenges impact our information security?",
          "Which external factors, such as laws, suppliers, or technology trends, change how we protect data?",
          "Do these factors affect decisions about risk and security measures?",
        ],
        evidence_examples: [
          "Context analysis document",
          "SWOT or PESTLE analysis",
          "Meeting notes or planning documents",
        ],
        implementation_description: "Conduct comprehensive analysis of internal and external factors affecting information security. Document business objectives, regulatory requirements, technology trends, market conditions, and competitive landscape. Create a structured context analysis that identifies how these factors influence security decisions and risk management approaches. Review and update quarterly to ensure relevance.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [
          {
            framework: "ISO 42001",
            clause_no: 4,
            order_no: 1,
            clause_title: "Understanding the organization and its context",
            relevance: "Medium",
          },
        ],
      },
      {
        arrangement: 4,
        index: 2,
        title: "Understanding the needs and expectations of interested parties",
        requirement_summary:
          "List all people and organizations who care about how we manage information security and note their requirements.",
        key_questions: [
          "Who are our stakeholders, such as customers, regulators, partners, and suppliers?",
          "What specific security requirements or expectations do they have?",
        ],
        evidence_examples: [
          "Stakeholder list",
          "Contracts or SLAs mentioning security",
          "Customer requirement tracking sheet",
        ],
        implementation_description: "Identify and document all internal and external stakeholders who have an interest in the organization's information security. Map their specific requirements, expectations, and concerns. Maintain a stakeholder register with contact information and communication preferences. Regularly engage with stakeholders to understand evolving needs and ensure alignment with security objectives.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [
          {
            framework: "ISO 42001",
            clause_no: 5,
            order_no: 2,
            clause_title: "Policy",
            relevance: "Medium",
          },
        ],
      },
      {
        arrangement: 4,
        index: 3,
        title: "Determining the scope of the ISMS",
        requirement_summary:
          "Define exactly what parts of the company are covered by ISO 27001 and why others might be excluded.",
        key_questions: [
          "What systems, locations, and processes are included in our ISMS scope?",
          "Are exclusions documented and justified?",
        ],
        evidence_examples: [
          "Scope statement",
          "ISMS boundaries document",
          "Exclusion list with rationale",
        ],
        implementation_description: "Define clear boundaries for the ISMS by identifying all systems, processes, locations, and organizational units to be included. Document any exclusions with valid business justifications. Ensure the scope aligns with business objectives and stakeholder requirements. Create visual representations such as network diagrams and process maps to clearly illustrate the ISMS boundaries.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [
          {
            framework: "ISO 42001",
            clause_no: 8,
            order_no: 2,
            clause_title: "AI risk assessment (Operational)",
            relevance: "High",
          },
          {
            framework: "ISO 42001",
            clause_no: 8,
            order_no: 3,
            clause_title: "AI risk treatment (Operational)",
            relevance: "High",
          },
          {
            framework: "ISO 42001",
            clause_no: 8,
            order_no: 4,
            clause_title: "AI System Lifecycle",
            relevance: "High",
          },
        ],
      },
      {
        arrangement: 4,
        index: 4,
        title: "Information Security Management System",
        requirement_summary:
          "Create and maintain a structured approach to managing information security across the organization.",
        key_questions: [
          "Do we have a defined ISMS process?",
          "Does it include continuous improvement steps?",
        ],
        evidence_examples: [
          "ISMS process documentation",
          "Improvement plans",
          "Tracking reports for ISMS activities",
        ],
        implementation_description: "Establish, implement, maintain, and continually improve the ISMS in accordance with ISO 27001 requirements. Develop comprehensive process documentation covering planning, implementation, checking, and acting phases. Create procedures for monitoring, measuring, analyzing, and evaluating ISMS performance. Implement a continuous improvement cycle with regular reviews and updates.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [
          {
            framework: "ISO 42001",
            clause_no: 5,
            order_no: 2,
            clause_title: "Policy",
            relevance: "Medium",
          },
        ],
      }
    ]
  },
  {
    arrangement: 5,
    title: "Leadership",
    subclauses: [
      {
        arrangement: 5,
        index: 1,
        title: "Leadership and commitment",
        requirement_summary:
          "Ensure company leaders actively support and drive information security initiatives.",
        key_questions: [
          "Are managers setting priorities for security?",
          "Do they allocate enough resources to security?",
        ],
        evidence_examples: [
          "Meeting minutes showing leadership involvement",
          "Budget and resource allocation documents",
        ],
        implementation_description: "Demonstrate top management commitment to the ISMS through visible leadership actions. Ensure senior executives actively participate in setting information security direction, approving policies, and allocating necessary resources. Establish regular management reviews of ISMS performance and communicate the importance of information security throughout the organization.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [
          {
            framework: "ISO 42001",
            clause_no: 5,
            order_no: 2,
            clause_title: "Policy",
            relevance: "Medium",
          },
          {
            framework: "ISO 42001",
            clause_no: 8,
            order_no: 2,
            clause_title: "AI risk assessment (Operational)",
            relevance: "High",
          },
          {
            framework: "ISO 42001",
            clause_no: 8,
            order_no: 3,
            clause_title: "AI risk treatment (Operational)",
            relevance: "High",
          },
          {
            framework: "ISO 42001",
            clause_no: 8,
            order_no: 4,
            clause_title: "AI System Lifecycle",
            relevance: "High",
          },
        ],
      },
      {
        arrangement: 5,
        index: 2,
        title: "Information security policy",
        requirement_summary:
          "Create a clear, approved policy outlining your information security goals and rules.",
        key_questions: [
          "Do we have a signed and approved security policy?",
          "Has the policy been communicated to all relevant staff?",
        ],
        evidence_examples: [
          "Policy document",
          "Communication records or intranet posts",
        ],
        implementation_description: "Develop, document, and maintain an information security policy that is appropriate to the organization's purpose and context. Ensure the policy includes commitment to satisfy applicable requirements and continual improvement of the ISMS. Obtain top management approval and communicate the policy to all relevant personnel. Review and update the policy regularly to ensure continued suitability.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [
          {
            framework: "ISO 42001",
            clause_no: 4,
            order_no: 1,
            clause_title: "Understanding the organization and its context",
            relevance: "Medium",
          },
        ],
      },
      {
        arrangement: 5,
        index: 3,
        title: "Organizational roles, responsibilities, and authorities",
        requirement_summary:
          "Make sure all employees know their security responsibilities and who is accountable for key decisions.",
        key_questions: [
          "Are security roles and responsibilities defined in job descriptions?",
          "Do staff know whom to contact for security issues?",
        ],
        evidence_examples: [
          "Organizational chart",
          "Responsibility matrix",
          "Job description documents",
        ],
        implementation_description: "Define and assign information security roles, responsibilities, and authorities throughout the organization. Create detailed job descriptions that include security responsibilities for all relevant positions. Establish clear reporting lines and escalation procedures. Ensure all personnel understand their security obligations and know how to report security incidents or concerns.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [
          {
            framework: "ISO 42001",
            clause_no: 5,
            order_no: 2,
            clause_title: "Policy",
            relevance: "Medium",
          },
        ],
      }
    ]
  },
  {
    arrangement: 6,
    title: "Planning",
    subclauses: [
      {
        arrangement: 6,
        index: 1,
        sub_index: 1,
        title: "General — actions to address risks and opportunities",
        requirement_summary:
          "When planning for the ISMS, consider the issues from 4.1 and requirements from 4.2 to determine risks and opportunities that need to be addressed so the ISMS achieves its intended outcomes, prevents or reduces undesired effects, and supports continual improvement.",
        key_questions: [
          "Have we identified risks and opportunities based on context (4.1) and interested party requirements (4.2)?",
          "Do planned actions integrate into ISMS processes?",
          "How do we evaluate the effectiveness of these actions?",
        ],
        evidence_examples: [
          "Risk and opportunity register linked to context analysis",
          "Planning integration records",
          "Effectiveness evaluation records",
        ],
        implementation_description:
          "Maintain a risk and opportunity register derived from context analysis (4.1) and stakeholder requirements (4.2). Plan actions, integrate them into ISMS processes, and evaluate their effectiveness. This general planning step precedes the specific risk assessment (6.1.2) and risk treatment (6.1.3).",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [],
      },
      {
        arrangement: 6,
        index: 1,
        sub_index: 2,
        title: "Information security risk assessment",
        requirement_summary:
          "Have a clear method to identify, assess, and prioritize information security risks regularly.",
        key_questions: [
          "Do we follow a documented process for spotting risks?",
          "Are risk levels (high, medium, low) defined clearly?",
          "Do we update the risk register regularly?",
        ],
        evidence_examples: [
          "Risk assessment methodology",
          "Risk register",
          "Recent risk assessment reports",
        ],
        implementation_description: "Establish and maintain a systematic information security risk assessment process. Define risk criteria including likelihood and impact scales, risk appetite, and acceptance criteria. Identify information security risks through asset identification, threat analysis, and vulnerability assessment. Regularly conduct risk assessments and maintain an up-to-date risk register with appropriate risk owners assigned.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [],
      },
      {
        arrangement: 6,
        index: 1,
        sub_index: 3,
        title: "Information security risk treatment",
        requirement_summary:
          "Develop and track actions to manage risks with appropriate controls and treatments.",
        key_questions: [
          "Do we have treatment plans for significant risks?",
          "Are chosen controls linked to risk priorities and documented?",
        ],
        evidence_examples: [
          "Risk treatment plans",
          "Control selection documents",
          "Approval records",
        ],
        implementation_description: "Develop and implement information security risk treatment plans for all identified risks. Select appropriate treatment options (mitigate, accept, avoid, or transfer) based on risk assessment results and organizational risk appetite. Choose and implement security controls from Annex A or other sources as needed. Document treatment decisions and obtain necessary approvals from risk owners and management.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [],
      },
      {
        arrangement: 6,
        index: 2,
        title: "Information security objectives",
        requirement_summary:
          "Define measurable security goals and plan actions to achieve them.",
        key_questions: [
          "Are our information security objectives written down?",
          "Are they reviewed and updated periodically?",
        ],
        evidence_examples: [
          "Objectives document",
          "Review meeting notes",
          "Progress reports",
        ],
        implementation_description: "Establish information security objectives at relevant functions and levels within the organization. Ensure objectives are consistent with the information security policy, measurable, monitored, communicated, and updated as needed. Define specific, achievable targets that align with business objectives and risk treatment plans. Regularly review progress and adjust objectives based on changing business needs and threat landscape.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [
          {
            framework: "ISO 42001",
            clause_no: 5,
            order_no: 2,
            clause_title: "Policy",
            relevance: "Medium",
          },
          {
            framework: "ISO 42001",
            clause_no: 8,
            order_no: 2,
            clause_title: "AI risk assessment (Operational)",
            relevance: "High",
          },
          {
            framework: "ISO 42001",
            clause_no: 8,
            order_no: 3,
            clause_title: "AI risk treatment (Operational)",
            relevance: "High",
          },
          {
            framework: "ISO 42001",
            clause_no: 8,
            order_no: 4,
            clause_title: "AI system lifecycle",
            relevance: "High",
          },
        ],
      },
      {
        arrangement: 6,
        index: 3,
        title: "Planning of changes",
        requirement_summary:
          "When the organization determines the need for changes to the ISMS, the changes shall be carried out in a planned manner.",
        key_questions: [
          "Is there a defined process for planning ISMS changes?",
          "Are changes assessed for impact on risk assessments and the Statement of Applicability before implementation?",
          "Are responsibilities, timelines, and resources documented?",
        ],
        evidence_examples: [
          "ISMS change management procedure",
          "Change request and impact assessment records",
          "Approval records",
          "Post-change review records",
        ],
        implementation_description:
          "Manage ISMS changes through a formal change control process. Assess impact on existing risk assessments, controls, and the Statement of Applicability before approval. This clause is new in ISO 27001:2022.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [],
      },
    ]
  },
  {
    arrangement: 7,
    title: "Support",
    subclauses: [
      {
        arrangement: 7,
        index: 1,
        title: "Resources",
        requirement_summary:
          "Make sure enough staff, tools, and funding are available to maintain the ISMS.",
        key_questions: [
          "Do we have sufficient resources allocated to ISMS tasks?",
          "Are tools and infrastructure adequate for security requirements?",
        ],
        evidence_examples: [
          "Resource allocation plan",
          "Budget approvals",
          "Tool purchase records",
        ],
        implementation_description: "Determine and provide the resources needed for the establishment, implementation, maintenance, and continual improvement of the ISMS. This includes human resources with appropriate competencies, technological infrastructure, financial resources for security tools and training, and physical resources for secure operations. Regularly assess resource adequacy and adjust allocations based on changing requirements.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [
          {
            framework: "ISO 42001",
            clause_no: 5,
            order_no: 2,
            clause_title: "Policy",
            relevance: "Medium",
          },
        ],
      },
      {
        arrangement: 7,
        index: 2,
        title: "Competence",
        requirement_summary:
          "Ensure employees have the necessary skills and training for their security-related tasks.",
        key_questions: [
          "Have we identified required competencies for security roles?",
          "Do we offer relevant training or certifications?",
        ],
        evidence_examples: [
          "Training matrix",
          "Employee certifications",
          "Skill assessment records",
        ],
        implementation_description: "Determine necessary competencies for personnel performing work affecting information security performance. Ensure personnel have appropriate education, training, or experience. Identify competency gaps and provide training or take other actions to acquire necessary competencies. Maintain records of competency assessments, training activities, and certifications. Regularly evaluate the effectiveness of competency development programs.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [
          {
            framework: "ISO 42001",
            clause_no: 4,
            order_no: 1,
            clause_title: "Understanding the organization and its context",
            relevance: "Medium",
          },
        ],
      },
      {
        arrangement: 7,
        index: 3,
        title: "Awareness",
        requirement_summary:
          "Employees must understand security policies and their responsibilities in protecting information.",
        key_questions: [
          "Have all employees received security awareness training?",
          "Do they know how to report incidents?",
        ],
        evidence_examples: [
          "Training attendance records",
          "Awareness posters or guides",
        ],
        implementation_description: "Ensure personnel are aware of the information security policy, their contribution to the effectiveness of the ISMS, the implications of not conforming with ISMS requirements, and relevant information security risks. Implement comprehensive awareness programs including regular training sessions, security bulletins, and incident reporting procedures. Maintain records of awareness activities and assess their effectiveness through testing or feedback.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [
          {
            framework: "ISO 42001",
            clause_no: 5,
            order_no: 2,
            clause_title: "Policy",
            relevance: "Medium",
          },
          {
            framework: "ISO 42001",
            clause_no: 8,
            order_no: 2,
            clause_title: "AI risk assessment (Operational)",
            relevance: "High",
          },
          {
            framework: "ISO 42001",
            clause_no: 8,
            order_no: 3,
            clause_title: "AI risk treatment (Operational)",
            relevance: "High",
          },
          {
            framework: "ISO 42001",
            clause_no: 8,
            order_no: 4,
            clause_title: "AI System Lifecycle",
            relevance: "High",
          },
        ],
      },
      {
        arrangement: 7,
        index: 4,
        title: "Communication",
        requirement_summary:
          "Share security-related information effectively inside and outside the company.",
        key_questions: [
          "Do we have a communication plan for security messages?",
          "Do we inform stakeholders about incidents promptly?",
        ],
        evidence_examples: [
          "Communication plan",
          "Incident notification logs",
          "Emails to stakeholders",
        ],
        implementation_description: "Determine internal and external communications relevant to the ISMS including what to communicate, when to communicate, with whom to communicate, who communicates, and the processes for communication. Establish procedures for routine security communications, incident notifications, and emergency communications. Ensure timely and appropriate communication of security matters to all relevant stakeholders.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [
          {
            framework: "ISO 42001",
            clause_no: 4,
            order_no: 1,
            clause_title: "Understanding the organization and its context",
            relevance: "Medium",
          },
        ],
      },
      {
        arrangement: 7,
        index: 5,
        title: "Documented information",
        requirement_summary:
          "Keep necessary ISMS documents and records under control and easily accessible.",
        key_questions: [
          "Do we version-control security documents?",
          "Are sensitive records protected properly?",
        ],
        evidence_examples: [
          "Document register",
          "Access-controlled folders",
          "Record logs",
        ],
        implementation_description: "Create and update documented information required by the ISMS and by ISO 27001. Control documented information to ensure it is available and suitable for use, where and when needed. Implement document control procedures including identification, format, review, approval, version control, distribution, access control, retrieval, retention, and disposal. Protect documented information from loss of confidentiality, improper use, or loss of integrity.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [],
      },
    ]
  },
  {
    arrangement: 8,
    title: "Operation",
    subclauses: [
      {
        arrangement: 8,
        index: 1,
        title: "Operational planning and control",
        requirement_summary:
          "Plan and manage day-to-day operations to meet security goals and apply risk treatments effectively.",
        key_questions: [
          "Do we have documented procedures for operational tasks?",
          "Are controls applied consistently?",
        ],
        evidence_examples: [
          "Operational plans",
          "Checklists or logs of daily security checks",
        ],
        implementation_description: "Plan, implement, and control the processes needed to meet information security requirements and implement risk treatment actions. Develop comprehensive operational procedures covering day-to-day security activities, change management, incident response, and business continuity. Ensure consistent application of security controls across all operational areas and maintain evidence of operational compliance.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [],
      },
      {
        arrangement: 8,
        index: 2,
        title: "Risk assessment during operations",
        requirement_summary:
          "Review risks when projects change, new systems are introduced, or major updates occur.",
        key_questions: [
          "Do we assess risks for all major changes?",
          "Are decisions documented based on updated risk findings?",
        ],
        evidence_examples: ["Change risk logs", "Updated risk register entries"],
        implementation_description: "Conduct risk assessments for all planned changes that could affect information security. Establish procedures for evaluating security implications of system changes, new projects, organizational restructuring, and external factors. Update risk registers to reflect new or modified risks and ensure appropriate risk treatment measures are implemented before changes are deployed.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [],
      },
      {
        arrangement: 8,
        index: 3,
        title: "Risk treatment during operations",
        requirement_summary:
          "Implement planned risk treatment actions and verify they are effective.",
        key_questions: [
          "Do we track results of risk treatments?",
          "Are failed treatments escalated quickly?",
        ],
        evidence_examples: ["Risk treatment reports", "Incident follow-up records"],
        implementation_description: "Implement planned risk treatment actions and monitor their effectiveness during operations. Track the status of risk treatment implementations, measure their performance against expected outcomes, and take corrective actions when treatments are not achieving desired results. Establish escalation procedures for failed or inadequate risk treatments and ensure timely resolution of security gaps.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [],
      },
    ]
  },
  {
    arrangement: 9,
    title: "Performance evaluation",
    subclauses: [
      {
        arrangement: 9,
        index: 1,
        title: "Monitoring, measurement, analysis, and evaluation",
        requirement_summary:
          "Track and measure the performance of ISMS processes and security controls.",
        key_questions: [
          "Do we have defined KPIs for security?",
          "Are results reviewed periodically?",
        ],
        evidence_examples: ["Monitoring reports", "Performance dashboards"],
        implementation_description: "Establish and implement monitoring, measurement, analysis, and evaluation procedures for the ISMS. Define key performance indicators (KPIs) and metrics to assess the effectiveness of security controls and overall ISMS performance. Collect and analyze data regularly, produce monitoring reports, and use results to drive improvement decisions. Ensure monitoring activities cover all aspects of the ISMS including processes, controls, and objectives.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [],
      },
      {
        arrangement: 9,
        index: 2,
        title: "Internal audit",
        requirement_summary:
          "Check regularly that ISMS is effective and meets ISO 27001 requirements.",
        key_questions: [
          "Is there a documented audit plan?",
          "Are findings recorded and resolved promptly?",
        ],
        evidence_examples: [
          "Audit schedules",
          "Audit reports",
          "Corrective action tracking logs",
        ],
        implementation_description: "Conduct internal audits at planned intervals to provide information on whether the ISMS conforms to the organization's own requirements and ISO 27001 requirements, and is effectively implemented and maintained. Develop annual audit programs, train competent auditors, conduct systematic audits of all ISMS areas, report findings objectively, and track corrective actions to completion.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [],
      },
      {
        arrangement: 9,
        index: 3,
        title: "Management review",
        requirement_summary:
          "Have top management review ISMS performance and plan necessary improvements.",
        key_questions: [
          "Are reviews held regularly with documented outputs?",
          "Are improvement decisions tracked and implemented?",
        ],
        evidence_examples: ["Meeting minutes", "Improvement action logs"],
        implementation_description: "Conduct management reviews of the ISMS at planned intervals to ensure its continuing suitability, adequacy, and effectiveness. Include review of ISMS performance, audit results, stakeholder feedback, risk assessment outcomes, status of corrective actions, and opportunities for improvement. Document review outcomes, decisions, and actions taken. Ensure top management participation and commitment to continual improvement.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [],
      },
    ]
  },
  {
    arrangement: 10,
    title: "Improvement",
    subclauses: [
      {
        arrangement: 10,
        index: 1,
        title: "Nonconformity and corrective action",
        requirement_summary:
          "Record, investigate, and fix problems, ensuring they do not recur.",
        key_questions: [
          "Do we track nonconformities in a register?",
          "Are corrective actions tested and verified?",
        ],
        evidence_examples: [
          "Nonconformity logs",
          "Corrective action plans",
          "Verification records",
        ],
        implementation_description: "When nonconformities occur, react to control and correct them, deal with consequences, evaluate the need for action to eliminate causes, implement necessary actions, review effectiveness of corrective actions, and update risks and controls if necessary. Maintain a nonconformity register, conduct root cause analysis, develop and implement corrective action plans, and verify their effectiveness through follow-up activities.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [],
      },
      {
        arrangement: 10,
        index: 2,
        title: "Continual improvement",
        requirement_summary:
          "Identify and act on opportunities to make the ISMS more effective over time.",
        key_questions: [
          "Do we have a process for suggesting and implementing improvements?",
          "Are improvements reviewed by leadership?",
        ],
        evidence_examples: [
          "Improvement plan document",
          "Lessons learned reports",
          "Approval records",
        ],
        implementation_description: "Continually improve the suitability, adequacy, and effectiveness of the ISMS. Establish processes for identifying improvement opportunities from various sources including monitoring results, audit findings, management reviews, stakeholder feedback, and changes in technology or threats. Implement approved improvements, track their effectiveness, and ensure they contribute to enhanced information security performance.",
        status: "Not Started",
        owner: "",
        reviewer: "",
        approver: "",
        due_date: "",
        cross_mappings: [],
      },
    ]
  }
];
