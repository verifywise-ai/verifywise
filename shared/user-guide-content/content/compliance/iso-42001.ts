import type { ArticleContent } from '../../contentTypes';

export const iso42001Content: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'ISO/IEC 42001 is the international standard for AI management systems. It provides a framework for establishing, implementing, maintaining and continually improving an AI management system (AIMS). Published in December 2023, it\'s the first global standard designed specifically for AI governance.',
    },
    {
      type: 'paragraph',
      text: 'Unlike regulations that mandate specific behaviors, ISO 42001 takes a management system approach. It helps you build the processes, controls and culture needed to govern AI responsibly. Getting certified shows customers, partners and regulators that your organization takes AI governance seriously.',
    },
    {
      type: 'heading',
      id: 'why-iso-42001',
      level: 2,
      text: 'Why pursue ISO 42001 certification?',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Credibility', text: 'Third-party certification gives independent verification of your AI governance practices' },
        { bold: 'Market differentiation', text: 'Early adopters gain an edge as certification becomes expected' },
        { bold: 'Regulatory alignment', text: 'ISO 42001 aligns with EU AI Act requirements and other emerging regulations' },
        { bold: 'Risk reduction', text: 'Systematic governance reduces the likelihood and impact of AI failures' },
        { bold: 'Customer assurance', text: 'Certification helps address customer concerns about AI safety and ethics' },
        { bold: 'Continuous improvement', text: 'The standard requires ongoing improvement of your AI governance practices' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'ISO 42001 follows the same high-level structure as other ISO management system standards (like ISO 27001), making it easier to integrate with existing management systems.',
    },
    {
      type: 'heading',
      id: 'key-requirements',
      level: 2,
      text: 'Key requirements',
    },
    {
      type: 'paragraph',
      text: 'ISO 42001 is organized into clauses that define what your AI management system must address:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Building',
          title: 'Context of the organization',
          description: 'Understand your environment, stakeholders and scope of the AI management system.',
        },
        {
          icon: 'Users',
          title: 'Leadership',
          description: 'Ensure top management commitment and establish AI policy and roles.',
        },
        {
          icon: 'Target',
          title: 'Planning',
          description: 'Address risks and opportunities, set objectives and plan to achieve them.',
        },
        {
          icon: 'Settings',
          title: 'Support',
          description: 'Provide the resources, competence, awareness and documentation needed.',
        },
        {
          icon: 'Activity',
          title: 'Operation',
          description: 'Implement AI-specific controls for the AI lifecycle.',
        },
        {
          icon: 'BarChart3',
          title: 'Performance evaluation',
          description: 'Monitor, measure, analyze and evaluate your AI management system.',
        },
        {
          icon: 'RefreshCw',
          title: 'Improvement',
          description: 'Address nonconformities and continually improve the system.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'annex-controls',
      level: 2,
      text: 'Annex A controls',
    },
    {
      type: 'paragraph',
      text: 'On top of the management system clauses, ISO 42001 includes Annex A, a catalog of reference controls designed for AI systems. The clauses are mandatory, but Annex A is different. You select controls based on your risk assessment and either implement them or document why they don\'t apply to your context.',
    },
    {
      type: 'paragraph',
      text: 'Annex A controls cover key areas of AI governance:',
    },
    {
      type: 'checklist',
      items: [
        'AI policies and governance structure',
        'Roles and responsibilities for AI',
        'AI system impact assessment',
        'AI system lifecycle management',
        'Data for AI systems',
        'AI system testing and validation',
        'AI system operation and monitoring',
        'Third-party and customer relationships',
      ],
    },
    {
      type: 'heading',
      id: 'verifywise-support',
      level: 2,
      text: 'How VerifyWise supports ISO 42001',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise helps you build and demonstrate an ISO 42001-compliant AI management system:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Model inventory', text: 'Maintain the AI system inventory required by the standard' },
        { bold: 'Risk management', text: 'Document and track AI-specific risks and treatments' },
        { bold: 'Control framework', text: 'Map your controls to ISO 42001 requirements' },
        { bold: 'Evidence hub', text: 'Collect and organize evidence for certification audits' },
        { bold: 'Policy management', text: 'Create and maintain required AI policies' },
        { bold: 'Incident tracking', text: 'Document and learn from AI-related incidents' },
      ],
    },
    {
      type: 'heading',
      id: 'certification-process',
      level: 2,
      text: 'Certification process',
    },
    {
      type: 'paragraph',
      text: 'The path to ISO 42001 certification typically involves:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Gap analysis', text: 'Assess your current state against ISO 42001 requirements' },
        { bold: 'Implementation', text: 'Build or enhance your AI management system to meet requirements' },
        { bold: 'Internal audit', text: 'Verify your system meets requirements before the certification audit' },
        { bold: 'Management review', text: 'Conduct formal management review of the AIMS' },
        { bold: 'Stage 1 audit', text: 'Documentation review by the certification body' },
        { bold: 'Stage 2 audit', text: 'Implementation audit by the certification body' },
        { bold: 'Certification', text: 'Receive certificate upon successful audit completion' },
        { bold: 'Surveillance', text: 'Undergo annual surveillance audits to maintain certification' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Start by scoping your AI management system appropriately. You don\'t need to include every AI system in your organization. Begin with a defined scope and expand over time.',
    },
    {
      type: 'heading',
      id: 'integration',
      level: 2,
      text: 'Integration with other standards',
    },
    {
      type: 'paragraph',
      text: 'ISO 42001 is designed to integrate with other management system standards:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'ISO 27001', text: 'Information security management for AI systems' },
        { bold: 'ISO 9001', text: 'Quality management for AI development and operations' },
        { bold: 'ISO 14001', text: 'Environmental management for AI sustainability considerations' },
      ],
    },
    {
      type: 'heading',
      id: 'assessment-structure',
      level: 2,
      text: 'ISO 42001 assessment structure',
    },
    {
      type: 'paragraph',
      text: 'When you select ISO 42001 for a use case, VerifyWise creates an assessment with two distinct sections that mirror the structure of the standard:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'FileText',
          title: 'Management system clauses',
          description: 'The core requirements from Clauses 4-10 that define what your AI management system must include.',
        },
        {
          icon: 'Shield',
          title: 'Reference controls (Annex A)',
          description: 'Specific AI controls that organizations can select and implement based on their risk assessment.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'management-system-clauses',
      level: 2,
      text: 'Management system clauses',
    },
    {
      type: 'paragraph',
      text: 'The management system clauses screen displays the seven core clauses required by ISO 42001. Each clause contains subclauses that define specific requirements:',
    },
    {
      type: 'checklist',
      items: [
        'Clause 4: Context of the organization, covering your environment, stakeholders and AIMS scope',
        'Clause 5: Leadership, covering management commitment, AI policy and organizational roles',
        'Clause 6: Planning, covering risk assessment, objectives and change planning',
        'Clause 7: Support, covering resources, competence, awareness and documentation',
        'Clause 8: Operation, covering AI lifecycle implementation and impact assessments',
        'Clause 9: Performance evaluation, covering monitoring, internal audit and management review',
        'Clause 10: Improvement, covering nonconformity handling and continual improvement',
      ],
    },
    {
      type: 'heading',
      id: 'working-with-subclauses',
      level: 2,
      text: 'Working with subclauses',
    },
    {
      type: 'paragraph',
      text: 'Each clause contains subclauses that represent specific requirements. Click on a subclause to open its detail view where you can:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Review the summary', text: 'Understand what the subclause requires' },
        { bold: 'Answer guiding questions', text: 'Use provided questions to assess your compliance' },
        { bold: 'Document implementation', text: 'Describe how your organization addresses the requirement' },
        { bold: 'Review evidence examples', text: 'See what evidence typically supports compliance' },
        { bold: 'Link evidence', text: 'Attach documents from your Evidence Hub' },
        { bold: 'Assign responsibility', text: 'Set owner, reviewer and approver' },
        { bold: 'Update status', text: 'Track progress from Not started through Implemented' },
      ],
    },
    {
      type: 'heading',
      id: 'subclause-detail',
      level: 3,
      text: 'Subclause detail fields',
    },
    {
      type: 'paragraph',
      text: 'For each subclause, VerifyWise tracks:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Status', text: 'Not started, In progress, or Implemented' },
        { bold: 'Implementation description', text: 'Your documentation of how the requirement is addressed' },
        { bold: 'Evidence links', text: 'Supporting documents and artifacts' },
        { bold: 'Owner', text: 'Person responsible for implementation' },
        { bold: 'Reviewer', text: 'Person who reviews the implementation' },
        { bold: 'Approver', text: 'Person who gives final sign-off' },
        { bold: 'Due date', text: 'Target completion date' },
        { bold: 'Auditor feedback', text: 'Notes from internal or external auditors' },
        { bold: 'Linked risks', text: 'Use case risks associated with this subclause' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/control-details.png',
      alt: 'Control detail modal showing subcontrol tabs, Overview/Evidence/Auditor Feedback sections and fields for status, approver, risk review, owner, reviewer, due date and implementation details',
      caption: 'The control detail view lets you track implementation status, assign responsibilities and document compliance.',
    },
    {
      type: 'heading',
      id: 'reference-controls',
      level: 2,
      text: 'Reference controls (Annex A)',
    },
    {
      type: 'paragraph',
      text: 'The reference controls screen displays ISO 42001 Annex A, which contains specific AI controls organized into seven categories:',
    },
    {
      type: 'checklist',
      items: [
        'A.5: Organizational policies and governance',
        'A.6: Internal organization',
        'A.7: Resources for AI systems',
        'A.8: AI system lifecycle',
        'A.9: Data for AI systems',
        'A.10: Information and communication technology (ICT)',
        'A.11: Third-party relationships',
      ],
    },
    {
      type: 'heading',
      id: 'control-applicability',
      level: 2,
      text: 'Control applicability',
    },
    {
      type: 'paragraph',
      text: 'Unlike the mandatory clauses, Annex A controls can be marked as applicable or not applicable based on your risk assessment. For each control:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Applicable', text: 'The control is relevant to your AI systems and must be implemented' },
        { bold: 'Not applicable', text: 'The control does not apply to your scope. Provide justification for exclusion' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Statement of applicability',
      text: 'Your decisions about which controls apply form the basis of your Statement of Applicability (SoA), a required document for ISO 42001 certification.',
    },
    {
      type: 'heading',
      id: 'annex-category-detail',
      level: 2,
      text: 'Working with annex controls',
    },
    {
      type: 'paragraph',
      text: 'Each annex control includes guidance and description to help you understand what is required. Click on a control to view and update:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Applicability', text: 'Whether this control applies to your organization' },
        { bold: 'Justification for exclusion', text: 'Required explanation if marking as not applicable' },
        { bold: 'Implementation description', text: 'How your organization implements this control' },
        { bold: 'Evidence links', text: 'Supporting documentation' },
        { bold: 'Status', text: 'Not started, In progress, or Implemented' },
        { bold: 'Assignments', text: 'Owner, reviewer and approver' },
        { bold: 'Due date', text: 'Target completion date' },
        { bold: 'Auditor feedback', text: 'Notes from auditors' },
      ],
    },
    {
      type: 'heading',
      id: 'status-workflow',
      level: 2,
      text: 'Status workflow',
    },
    {
      type: 'paragraph',
      text: 'Both subclauses and annex controls follow the same status workflow:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Circle',
          title: 'Not started',
          description: 'Work has not begun on this requirement. Initial state for all items.',
        },
        {
          icon: 'Clock',
          title: 'In progress',
          description: 'Implementation is underway but not yet complete.',
        },
        {
          icon: 'CheckCircle',
          title: 'Implemented',
          description: 'The requirement has been fully addressed with evidence documented.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'tracking-progress',
      level: 2,
      text: 'Tracking your progress',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise provides metrics to monitor your ISO 42001 compliance progress:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Subclause completion', text: 'Progress across all management system subclauses' },
        { bold: 'Annex control completion', text: 'Progress across applicable reference controls' },
        { bold: 'Assignment coverage', text: 'How many items have owners assigned' },
        { bold: 'Status breakdown', text: 'Distribution of items by status' },
        { bold: 'Overdue items', text: 'Subclauses and controls past their due date' },
      ],
    },
    {
      type: 'heading',
      id: 'linking-evidence',
      level: 2,
      text: 'Linking evidence',
    },
    {
      type: 'paragraph',
      text: 'For both subclauses and annex controls, you can link evidence to demonstrate compliance:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open the subclause or annex control detail view' },
        { text: 'Navigate to the evidence section' },
        { text: 'Select existing evidence from your Evidence Hub or upload new documents' },
        { text: 'Add implementation notes explaining how the evidence supports compliance' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Use the evidence examples in each subclause as a guide for what auditors typically expect. Common evidence includes policies, procedures, meeting minutes, training records and system documentation.',
    },
    {
      type: 'heading',
      id: 'linking-risks',
      level: 2,
      text: 'Linking risks',
    },
    {
      type: 'paragraph',
      text: 'ISO 42001 puts risk-based decision making front and center. You can link use case risks to both subclauses and annex controls to show how your control implementation addresses identified risks. This creates traceability between your risk assessment and what you\'ve actually done about it.',
    },
    {
      type: 'heading',
      id: 'faq',
      level: 2,
      text: 'Frequently asked questions',
    },
    {
      type: 'heading',
      id: 'faq-who',
      level: 3,
      text: 'Who should use ISO 42001?',
    },
    {
      type: 'paragraph',
      text: 'Any organization that provides or uses AI-powered products or services can benefit from ISO 42001, regardless of size or industry. Whether you\'re developing AI in-house or deploying third-party solutions, the standard helps you govern AI responsibly.',
    },
    {
      type: 'heading',
      id: 'faq-prerequisites',
      level: 3,
      text: 'Are there prerequisites for certification?',
    },
    {
      type: 'paragraph',
      text: 'There are no specific prerequisites. However, you\'ll need an established AI management system with documented policies, processes and risk management practices ready for audit. You can build these while preparing for certification.',
    },
    {
      type: 'heading',
      id: 'faq-risks',
      level: 3,
      text: 'How does ISO 42001 address AI risks?',
    },
    {
      type: 'paragraph',
      text: 'The standard requires you to determine, assess and treat AI risks and opportunities. This includes considering the domain, application context and intended use of AI systems. Risk assessment isn\'t a one-time activity but an ongoing process throughout the AI lifecycle.',
    },
    {
      type: 'heading',
      id: 'faq-responsible-ai',
      level: 3,
      text: 'How does the standard ensure responsible AI use?',
    },
    {
      type: 'paragraph',
      text: 'ISO 42001 requires you to define and document processes, roles, responsibilities and policies that support ethical AI development, deployment and operation. This includes impact assessments, risk management and governance structures that promote accountability.',
    },
    {
      type: 'heading',
      id: 'faq-other-standards',
      level: 3,
      text: 'How does ISO 42001 relate to other management system standards?',
    },
    {
      type: 'paragraph',
      text: 'ISO 42001 uses a harmonized structure that aligns with quality management (ISO 9001), information security (ISO 27001) and privacy standards. This means you can address multiple standards through a single, unified management system.',
    },
    {
      type: 'heading',
      id: 'faq-implementation',
      level: 3,
      text: 'How can organizations implement ISO 42001?',
    },
    {
      type: 'paragraph',
      text: 'Start by understanding your AI system context, establishing an AI policy, assessing risks and impacts and getting leadership buy-in. Then plan, support, operate, monitor and continually improve your AI management system. VerifyWise has tools to support each phase.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'compliance',
          articleId: 'iso-27001',
          title: 'ISO 27001 integration',
          description: 'Align AI governance with information security standards',
        },
        {
          collectionId: 'compliance',
          articleId: 'assessments',
          title: 'Compliance assessments',
          description: 'Track your progress toward certification',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'model-inventory',
          title: 'Managing model inventory',
          description: 'Maintain the AI system inventory required by the standard',
        },
      ],
    },
  ],
};
