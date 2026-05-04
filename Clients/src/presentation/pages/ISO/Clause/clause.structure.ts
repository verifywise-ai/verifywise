export const ISO42001ClauseList = [
  {
    id: 1,
    title: "Management System",
    clauses: [
      {
        number: 4,
        title: "Context of the Organization",
        subClauses: [
          {
            number: 1,
            title: "Understanding the organization and its context",
            status: "Not Started",
            summary:
              "Determine external and internal issues relevant to the organization's purpose and its AIMS, including AI principles/values and strategic direction.",
            keyQuestions: [
              "What internal factors (culture, resources, knowledge) influence our AIMS?",
              "What external factors (legal, ethical, market, social, technological) influence our AIMS?",
              "How does our use/development of AI align with our business strategy?",
              "What are our organization's guiding principles or values related to AI?",
            ],
            evidenceExamples: [
              "Context analysis document (PESTLE, SWOT focused on AI)",
              "Documentation of internal/external issues",
              "Strategic planning documents referencing AI",
              "Documented AI Principles/Ethics Statement",
            ],
          },
          {
            number: 2,
            title: "Understanding the needs and expectations of interested parties",
            status: "Draft",
            summary:
              "Identify interested parties relevant to the AIMS and their requirements/expectations concerning AI.",
            keyQuestions: [
              "Who are the interested parties for our AI systems (customers, users, regulators, employees, public, partners)?",
              "What are their relevant needs, expectations, and requirements (legal, ethical, contractual) regarding our AI?",
              "How do we capture and review these requirements?",
            ],
            evidenceExamples: [
              "Stakeholder analysis matrix/register",
              "List of applicable legal/regulatory requirements for AI",
              "Records of communication with stakeholders",
              "Contractual requirements related to AI",
            ],
          },
          {
            number: 3,
            title: "Determining the scope of the AI Management System",
            status: "In Review",
            summary: "Define the boundaries and applicability of the AIMS within the organization.",
            keyQuestions: [
              "What organizational units, processes, locations are included in the AIMS?",
              "Which specific AI systems or applications are covered by the AIMS?",
              "What stages of the AI lifecycle are included?",
              "Are there any exclusions, and what is the justification?",
            ],
            evidenceExamples: ["Documented AIMS Scope Statement"],
          },
          {
            number: 4,
            title: "AI Management System",
            status: "Approved",
            summary:
              "Establish, implement, maintain, and continually improve the AIMS in accordance with ISO 42001 requirements.",
            keyQuestions: [
              "Do we have the necessary processes and documentation established for the AIMS?",
              "Are these processes being followed (implemented)?",
              "Are there mechanisms for maintaining and updating the AIMS?",
              "Is there a process for continual improvement of the AIMS?",
            ],
            evidenceExamples: [
              "The AIMS documentation itself (policies, procedures)",
              "Records of implementation activities",
              "Management review records",
              "Audit results",
            ],
          },
        ],
      },
      {
        number: 5,
        title: "Leadership",
        subClauses: [
          {
            number: 1,
            title: "Leadership and commitment",
            status: "Implemented",
            summary:
              "Top management must demonstrate leadership by ensuring policy/objectives alignment, resource availability, integration, communication, and promoting improvement.",
            keyQuestions: [
              "How does top management show active involvement and support for the AIMS?",
              "Are AIMS objectives aligned with strategic goals?",
              "Are sufficient resources allocated?",
              "Is the importance of AI governance communicated effectively?",
              "How are ethical considerations promoted by leadership?",
            ],
            evidenceExamples: [
              "Management meeting minutes discussing AIMS",
              "Resource allocation records (budget, staffing)",
              "Internal communications from leadership",
              "Published AI Policy signed by management",
            ],
          },
          {
            number: 2,
            title: "Policy",
            status: "Needs Rework",
            summary:
              "Establish, communicate, and maintain an AI Policy appropriate to the organization's context.",
            keyQuestions: [
              "Is there a documented AI Policy?",
              "Does it include commitments to requirements and continual improvement?",
              "Does it align with organizational AI principles/ethics?",
              "Is it communicated and understood by relevant personnel?",
              "Is it available to relevant interested parties?",
            ],
            evidenceExamples: [
              "The documented AI Policy",
              "Communication records (emails, intranet posts)",
              "Training materials covering the policy",
            ],
          },
          {
            number: 3,
            title: "Organizational roles, responsibilities, and authorities",
            status: "Not Started",
            summary:
              "Assign and communicate responsibilities and authorities for roles relevant to the AIMS.",
            keyQuestions: [
              "Who is ultimately accountable for the AIMS?",
              "Who is responsible for specific AIMS tasks (risk assessment, control implementation, audits, reporting)?",
              "Are these roles, responsibilities, and authorities documented and communicated?",
            ],
            evidenceExamples: [
              "Organization chart showing AIMS roles",
              "Documented role descriptions",
              "Responsibility Assignment Matrix (RACI)",
            ],
          },
        ],
      },
      {
        number: 6,
        title: "Planning",
        subClauses: [
          {
            number: 1,
            title:
              "Actions to address risks and opportunities (Includes Risk Assessment, Treatment, Impact Assessment)",
            status: "Draft",
            summary:
              "Plan actions based on context, stakeholders, risks, and opportunities. Conduct AI risk assessments, plan risk treatments, and assess AI system impacts.",
            keyQuestions: [
              "Do we have a process for identifying risks and opportunities related to the AIMS?",
              "Is there a defined AI risk assessment methodology?",
              "Are risks related to AI systems (bias, fairness, transparency, security, societal impact etc.) systematically identified and assessed?",
              "Is there a process for selecting risk treatment options and controls?",
              "Is a Statement of Applicability (SoA) maintained?",
              "Do we assess the potential positive and negative impacts of our AI systems on individuals and society?",
              "How are risk assessment and impact assessment results used in planning?",
            ],
            evidenceExamples: [
              "Risk management framework/policy/procedure",
              "AI Risk Assessment Methodology",
              "Risk assessment reports per AI system",
              "AI Risk Register",
              "AI Risk Treatment Plan",
              "Statement of Applicability (SoA)",
              "AI Impact Assessment Methodology",
              "AI Impact Assessment reports",
            ],
          },
          {
            number: 2,
            title: "AI objectives and planning to achieve them",
            status: "In Review",
            summary:
              "Establish measurable AIMS objectives aligned with the AI policy and plan how to achieve them.",
            keyQuestions: [
              "What are the specific, measurable objectives for our AIMS?",
              "Are they consistent with the AI policy and organizational goals?",
              "What actions, resources, responsibilities, and timelines are defined to achieve these objectives?",
              "How will the achievement of objectives be evaluated?",
            ],
            evidenceExamples: [
              "Documented AIMS Objectives",
              "Action plans linked to objectives",
              "Performance indicators (KPIs) for objectives",
              "Management review records discussing objectives progress",
            ],
          },
        ],
      },
      {
        number: 7,
        title: "Support",
        subClauses: [
          {
            number: 1,
            title: "Resources",
            status: "Approved",
            summary: "Determine and provide the resources needed for the AIMS.",
            keyQuestions: [
              "What resources (human, financial, technological, infrastructure) are needed?",
              "Have these resources been identified and allocated?",
            ],
            evidenceExamples: [
              "Budget approvals",
              "Staffing plans",
              "Technology acquisition records",
              "Facility plans",
            ],
          },
          {
            number: 2,
            title: "Competence",
            status: "Implemented",
            summary:
              "Ensure personnel involved in the AIMS are competent based on education, training, or experience.",
            keyQuestions: [
              "What competencies are required for different AIMS roles?",
              "How do we ensure individuals possess these competencies?",
              "Are training needs identified and addressed?",
              "Is competence maintained and documented?",
            ],
            evidenceExamples: [
              "Job descriptions with competency requirements",
              "Competency matrix",
              "Training plans and records",
              "Performance reviews",
              "Certifications",
            ],
          },
          {
            number: 3,
            title: "Awareness",
            status: "Needs Rework",
            summary:
              "Ensure relevant personnel are aware of the AI policy, their contribution, and the implications of non-conformance.",
            keyQuestions: [
              "Are staff aware of the AI Policy?",
              "Do they understand how their work contributes to the AIMS and AI ethics?",
              "Are they aware of the benefits of effective AI governance and risks of failure?",
              "How is this awareness created and maintained?",
            ],
            evidenceExamples: [
              "Awareness training materials and attendance logs",
              "Internal communications (newsletters, posters)",
              "Onboarding materials",
            ],
          },
          {
            number: 4,
            title: "Communication",
            status: "Not Started",
            summary:
              "Determine and implement internal and external communications relevant to the AIMS.",
            keyQuestions: [
              "What needs to be communicated about the AIMS?",
              "When, how, and with whom does communication occur (internal & external)?",
              "Who is responsible for communication?",
            ],
            evidenceExamples: [
              "Communication plan/matrix",
              "Records of communications (meeting minutes, emails, public statements)",
            ],
          },
          {
            number: 5,
            title: "Documented information",
            status: "Draft",
            summary:
              "Manage documented information required by the standard and necessary for AIMS effectiveness (creation, update, control, availability, protection).",
            keyQuestions: [
              "What documentation is required by ISO 42001?",
              "What other documentation do we need for our AIMS to be effective?",
              "How do we ensure documents are properly identified, formatted, reviewed, approved, version controlled, available, and protected?",
            ],
            evidenceExamples: [
              "Document control procedure",
              "Master document list / Document register",
              "Version history in documents",
              "Access control records",
              "Backup procedures",
            ],
          },
        ],
      },
      {
        number: 8,
        title: "Operation",
        subClauses: [
          {
            number: 1,
            title: "Operational planning and control",
            status: "In Review",
            summary:
              "Plan, implement, and control processes to meet requirements, implement actions from Clause 6, manage changes, and control outsourced processes.",
            keyQuestions: [
              "How are operational processes (related to AI development/deployment/use) planned and controlled?",
              "How are changes to these processes or AI systems managed?",
              "How do we control processes outsourced to third parties that affect the AIMS?",
            ],
            evidenceExamples: [
              "Standard Operating Procedures (SOPs) for AI lifecycle stages",
              "Change management procedures and records",
              "Supplier contracts and oversight procedures",
            ],
          },
          {
            number: 2,
            title: "AI risk assessment (Operational)",
            status: "Approved",
            summary:
              "Perform AI risk assessments operationally (at planned intervals or upon significant changes).",
            keyQuestions: [
              "How often are AI risk assessments reviewed and updated?",
              "What triggers an ad-hoc risk assessment (e.g., new system, major change, incident)?",
            ],
            evidenceExamples: [
              "Schedule/plan for risk assessment reviews",
              "Updated risk assessment reports",
            ],
          },
          {
            number: 3,
            title: "AI risk treatment (Operational)",
            status: "Implemented",
            summary: "Implement the AI risk treatment plan.",
            keyQuestions: [
              "Are the controls defined in the risk treatment plan actually implemented?",
              "Is there evidence of control operation?",
            ],
            evidenceExamples: [
              "Records of control implementation (configuration settings, logs, procedure execution records)",
              "Completed checklists",
              "Training records related to specific controls",
            ],
          },
          {
            number: 4,
            title: "AI System Lifecycle",
            status: "Needs Rework",
            summary:
              "Define and implement processes for managing the entire AI system lifecycle consistent with policy, objectives, and impact assessments.",
            keyQuestions: [
              "Do we have documented processes for each stage (requirements, design, data handling, model building, V&V, deployment, operation, monitoring, retirement)?",
              "How are AI principles (fairness, transparency etc.) embedded in these processes?",
              "How is documentation managed throughout the lifecycle?",
              "How are results from impact assessments considered during the lifecycle?",
            ],
            evidenceExamples: [
              "Documented AI system lifecycle process description",
              "Project plans",
              "Requirements specifications",
              "Design documents",
              "Data processing procedures",
              "Model training logs",
              "Verification & Validation reports",
              "Deployment procedures",
              "Monitoring procedures and logs",
              "Retirement plans",
            ],
          },
          {
            number: 5,
            title: "Third-party relationships",
            status: "Not Started",
            summary:
              "Manage risks associated with third-party suppliers/partners involved in the AI lifecycle.",
            keyQuestions: [
              "How do we identify and assess risks related to third-party AI components or services?",
              "Are AI-specific requirements included in contracts?",
              "How do we monitor third-party performance and compliance?",
            ],
            evidenceExamples: [
              "Third-party risk management procedure",
              "Supplier assessment questionnaires/reports",
              "Contracts with AI clauses",
              "Supplier audit reports",
              "Service Level Agreements (SLAs)",
            ],
          },
        ],
      },
      {
        number: 9,
        title: "Performance Evaluation",
        subClauses: [
          {
            number: 1,
            title: "Monitoring, measurement, analysis, and evaluation",
            status: "Draft",
            summary:
              "Determine what needs monitoring/measuring, the methods, frequency, and how results are analyzed/evaluated.",
            keyQuestions: [
              "What aspects of the AIMS and AI systems are monitored/measured?",
              "What methods are used?",
              "How often is data collected and analyzed?",
              "Who analyzes/evaluates?",
              "How are results used?",
            ],
            evidenceExamples: [
              "Monitoring procedure",
              "Defined metrics/KPIs",
              "Monitoring logs/reports",
              "Performance dashboards",
              "Analysis reports",
            ],
          },
          {
            number: 2,
            title: "Internal audit",
            status: "In Review",
            summary:
              "Conduct internal audits at planned intervals to ensure the AIMS conforms to requirements and is effectively implemented.",
            keyQuestions: [
              "Is there an audit program?",
              "Are audits conducted by objective auditors?",
              "Are criteria/scope defined?",
              "Are results reported?",
              "Are nonconformities addressed?",
            ],
            evidenceExamples: [
              "Internal audit procedure",
              "Audit programme/schedule",
              "Audit plans/reports",
              "Auditor competence records",
              "Nonconformity reports",
            ],
          },
          {
            number: 3,
            title: "Management review",
            status: "Approved",
            summary:
              "Top management must review the AIMS at planned intervals to ensure its continuing suitability, adequacy, and effectiveness.",
            keyQuestions: [
              "Are reviews conducted regularly?",
              "Does review cover required inputs?",
              "Are decisions made regarding improvements/changes?",
              "Are minutes documented?",
            ],
            evidenceExamples: [
              "Management review procedure",
              "Review schedule/agendas/minutes",
              "Action items tracker",
            ],
          },
        ],
      },
      {
        number: 10,
        title: "Improvement",
        subClauses: [
          {
            number: 1,
            title: "Nonconformity and corrective action",
            status: "Implemented",
            summary:
              "React to nonconformities, evaluate need for action, implement corrective actions, review effectiveness, and update AIMS if needed.",
            keyQuestions: [
              "Is there a process for nonconformities?",
              "How is correction handled?",
              "Is root cause analysis performed?",
              "How are corrective actions tracked and verified?",
              "Are changes made to AIMS?",
            ],
            evidenceExamples: [
              "Corrective action procedure",
              "Nonconformity register",
              "Root cause analysis records",
              "Corrective action plans/verification",
            ],
          },
          {
            number: 2,
            title: "Continual improvement",
            status: "Needs Rework",
            summary:
              "Continually improve the suitability, adequacy, and effectiveness of the AIMS.",
            keyQuestions: [
              "How does the organization use results to drive improvement?",
              "Is there evidence of ongoing efforts?",
            ],
            evidenceExamples: [
              "Management review outputs",
              "Updated policies/procedures",
              "Improvement project records",
              "Trend analysis",
            ],
          },
        ],
      },
    ],
  },
];
