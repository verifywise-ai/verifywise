import type { ArticleContent } from '../../contentTypes';

export const nistAiRmfContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The NIST AI Risk Management Framework (AI RMF) is a voluntary framework from the U.S. National Institute of Standards and Technology. It helps organizations design, develop, deploy and use AI systems responsibly, with practical guidance for managing AI risks throughout the lifecycle.',
    },
    {
      type: 'paragraph',
      text: 'Unlike prescriptive regulations, the NIST AI RMF offers flexible, risk-based guidance you can adapt to your specific context. It focuses on trustworthiness characteristics and gives you a structured way to identify, assess and manage AI risks. Many organizations use it as a foundation for their AI governance programs.',
    },
    {
      type: 'heading',
      id: 'why-nist',
      level: 2,
      text: 'Why use the NIST AI RMF?',
    },
    {
      type: 'paragraph',
      text: 'The NIST AI RMF has become a go-to framework for AI governance because it balances thoroughness with flexibility. Whether you\'re a startup deploying your first AI model or an enterprise managing hundreds of AI systems, it scales to your needs.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Flexible', text: 'Works for organizations of any size, sector or AI maturity level. You can implement it incrementally as your governance capabilities grow' },
        { bold: 'Risk-based', text: 'Lets you focus resources on the risks that matter most rather than checking boxes on a compliance list' },
        { bold: 'Widely recognized', text: 'Referenced by regulators, customers and partners globally. Increasingly required in government contracts and enterprise procurement' },
        { bold: 'Complementary', text: 'Aligns with regulations like the EU AI Act and ISO 42001. Implementing the AI RMF creates foundations for other standards' },
        { bold: 'Practical guidance', text: 'The accompanying Playbook gives specific suggested actions and examples for each subcategory' },
        { bold: 'Free and accessible', text: 'Publicly available with no licensing requirements. NIST continues to develop additional resources and profiles' },
        { bold: 'Stakeholder trust', text: 'Shows customers, investors and the public that you take AI risks seriously and have processes to manage them' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'The NIST AI RMF was published in January 2023 and is accompanied by a Playbook with detailed implementation guidance. NIST continues to develop additional resources, including profiles for specific use cases and sectors.',
    },
    {
      type: 'heading',
      id: 'trustworthy-ai',
      level: 2,
      text: 'Trustworthy AI characteristics',
    },
    {
      type: 'paragraph',
      text: 'The NIST AI RMF is built around seven characteristics of trustworthy AI systems. These characteristics are interconnected and sometimes in tension with each other. Good AI governance means balancing them based on context, use case and stakeholder needs.',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Shield',
          title: 'Safe',
          description: 'AI systems should not endanger human life, health, property or the environment. Safety considerations span the entire AI lifecycle from design through deployment and retirement.',
        },
        {
          icon: 'Lock',
          title: 'Secure and resilient',
          description: 'AI systems should withstand attacks and recover from failures. This includes protecting against adversarial manipulation, data poisoning and model theft.',
        },
        {
          icon: 'Eye',
          title: 'Explainable and interpretable',
          description: 'AI outputs should be understandable to relevant stakeholders. The level of explainability needed depends on the use case and who needs to understand the system.',
        },
        {
          icon: 'FileText',
          title: 'Accountable and transparent',
          description: 'Clear responsibility for AI outcomes and openness about system capabilities and limitations. Organizations should be able to explain how and why AI decisions are made.',
        },
        {
          icon: 'Scale',
          title: 'Fair with harmful bias managed',
          description: 'AI systems should treat individuals and groups equitably. This takes active effort to identify, measure and mitigate harmful biases throughout the AI lifecycle.',
        },
        {
          icon: 'UserCheck',
          title: 'Privacy enhanced',
          description: 'AI systems should protect individual privacy and data rights. This includes privacy considerations during data collection, model training and inference.',
        },
        {
          icon: 'CheckCircle',
          title: 'Valid and reliable',
          description: 'AI systems should perform consistently and as intended across different conditions and over time. Validation should match the deployment context.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'These characteristics aren\'t independent. For example, increasing explainability might reduce model performance, and strong privacy protections could limit the data available for bias testing. The framework helps you navigate these tradeoffs thoughtfully.',
    },
    {
      type: 'heading',
      id: 'core-functions',
      level: 2,
      text: 'Core functions',
    },
    {
      type: 'paragraph',
      text: 'The NIST AI RMF is organized around four core functions that provide a structure for managing AI risks. These functions are not sequential; organizations should engage with all four continuously throughout the AI lifecycle.',
    },
    {
      type: 'heading',
      id: 'govern',
      level: 3,
      text: 'Govern',
    },
    {
      type: 'paragraph',
      text: 'The Govern function establishes and maintains a culture of risk management for AI across the organization. Unlike the other three functions which focus on specific AI systems, Govern is cross-cutting and informs how Map, Measure and Manage are performed.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Policies and procedures', text: 'Define organizational AI policies, procedures and practices that are transparent and consistently implemented' },
        { bold: 'Accountability structures', text: 'Establish clear roles, responsibilities and lines of authority for AI risk management' },
        { bold: 'Legal and regulatory compliance', text: 'Ensure processes are in place to understand and comply with applicable AI regulations' },
        { bold: 'Risk culture', text: 'Promote a critical thinking and safety-first mindset throughout AI design, development and deployment' },
        { bold: 'Third-party management', text: 'Address risks from third-party AI software, data and services' },
        { bold: 'Workforce development', text: 'Provide training so personnel can perform AI risk management duties effectively' },
      ],
    },
    {
      type: 'heading',
      id: 'map',
      level: 3,
      text: 'Map',
    },
    {
      type: 'paragraph',
      text: 'The Map function frames the context in which AI systems operate and identifies potential impacts. Thorough context mapping matters because AI risks depend heavily on the specific use case, deployment environment and affected stakeholders.',
    },
    {
      type: 'bullet-list',
      items: [
      { bold: 'Context establishment', text: 'Document intended purposes, users, deployment settings and applicable laws and norms' },
        { bold: 'System categorization', text: 'Define what tasks the AI system performs and how its outputs will be used' },
        { bold: 'Benefits and costs', text: 'Look at potential benefits and costs, including non-monetary impacts on individuals and communities' },
        { bold: 'Third-party components', text: 'Map risks from third-party data, models and AI services' },
        { bold: 'Impact characterization', text: 'Identify the likelihood and magnitude of potential impacts on individuals, groups and society' },
        { bold: 'Stakeholder engagement', text: 'Integrate feedback from affected communities and external stakeholders' },
      ],
    },
    {
      type: 'heading',
      id: 'measure',
      level: 3,
      text: 'Measure',
    },
    {
      type: 'paragraph',
      text: 'The Measure function uses quantitative and qualitative methods to analyze, assess and monitor AI risks and trustworthiness characteristics. Your measurement approaches should connect to the deployment context you identified in the Map function.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Metrics selection', text: 'Identify appropriate metrics for measuring AI risks based on the mapped context and trustworthiness characteristics' },
        { bold: 'Trustworthiness evaluation', text: 'Evaluate AI systems against all relevant trustworthiness characteristics (safety, fairness, privacy, etc.)' },
        { bold: 'Testing and validation', text: 'Document test sets, metrics and tools used during testing, evaluation, verification and validation (TEVV)' },
        { bold: 'Ongoing monitoring', text: 'Monitor deployed AI systems for performance, behavior and compliance with requirements' },
        { bold: 'Risk tracking', text: 'Track existing, unanticipated and emergent risks over time' },
        { bold: 'Feedback integration', text: 'Gather feedback from end users and affected communities about system performance' },
      ],
    },
    {
      type: 'heading',
      id: 'manage',
      level: 3,
      text: 'Manage',
    },
    {
      type: 'paragraph',
      text: 'The Manage function allocates resources to address mapped and measured risks based on their priority and the organization\'s risk tolerance. It turns risk assessment into action.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Risk prioritization', text: 'Prioritize risks for treatment based on impact, likelihood and available resources' },
        { bold: 'Response strategies', text: 'Develop and document responses to high-priority risks (mitigate, transfer, avoid or accept)' },
        { bold: 'Residual risk documentation', text: 'Document negative residual risks that remain after treatment' },
        { bold: 'Benefit maximization', text: 'Plan strategies to maximize AI benefits while minimizing negative impacts' },
        { bold: 'Incident response', text: 'Establish processes for responding to, recovering from and learning from AI incidents' },
        { bold: 'Third-party risk management', text: 'Monitor and manage risks from third-party AI components and services' },
      ],
    },
    {
      type: 'heading',
      id: 'verifywise-support',
      level: 2,
      text: 'How VerifyWise supports NIST AI RMF',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise gives you a structured place to implement and track your NIST AI RMF activities. The platform organizes the framework into functions, categories and subcategories so you can work through requirements systematically.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Govern', text: 'Policy management, role-based access control and organizational structure documentation for AI governance' },
        { bold: 'Map', text: 'Model inventory with context documentation, impact assessment tools and stakeholder tracking' },
        { bold: 'Measure', text: 'Risk assessment tracking across all trustworthiness characteristics with metrics and evidence collection' },
        { bold: 'Manage', text: 'Risk mitigation planning, incident tracking and evidence collection to demonstrate risk treatment' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Use the NIST AI RMF Playbook alongside VerifyWise. The Playbook provides specific suggested actions for each subcategory that you can track in VerifyWise. Download the Playbook from the official NIST website.',
    },
    {
      type: 'heading',
      id: 'assessment-structure',
      level: 2,
      text: 'NIST AI RMF assessment structure',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise organizes the NIST AI RMF into a three-level hierarchy that mirrors the framework\'s structure:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'FolderKanban',
          title: 'Functions',
          description: 'The four core functions (Govern, Map, Measure, Manage) that organize risk management activities.',
        },
        {
          icon: 'FileText',
          title: 'Categories',
          description: 'Groups of related outcomes within each function. For example, GOVERN 1 focuses on policies and procedures.',
        },
        {
          icon: 'List',
          title: 'Subcategories',
          description: 'Specific outcomes that represent actionable requirements. These are what you track and implement.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'functions-screen',
      level: 2,
      text: 'The functions screen',
    },
    {
      type: 'paragraph',
      text: 'When you access NIST AI RMF in VerifyWise, you see the four core functions with their categories and subcategories. Each function shows progress indicators so you can quickly see where you stand:',
    },
    {
      type: 'checklist',
      items: [
        'GOVERN (6 categories, ~19 subcategories), establishes AI risk management culture and policies',
        'MAP (5 categories, ~18 subcategories), frames context and scope of AI risks',
        'MEASURE (4 categories, ~25 subcategories), evaluates AI risks and trustworthiness',
        'MANAGE (4 categories, ~15 subcategories), addresses identified risks',
      ],
    },
    {
      type: 'heading',
      id: 'working-with-subcategories',
      level: 2,
      text: 'Working with subcategories',
    },
    {
      type: 'paragraph',
      text: 'Subcategories are the actionable units in the NIST AI RMF. Each subcategory represents a specific outcome your organization should achieve. Click on a subcategory to open its detail view where you can:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Review the requirement', text: 'Read the subcategory description to understand what is expected' },
        { bold: 'Document implementation', text: 'Describe how your organization addresses this requirement' },
        { bold: 'Link evidence', text: 'Attach documents, policies, or records from your Evidence Hub' },
        { bold: 'Assign responsibility', text: 'Set owner, reviewer and approver for accountability' },
        { bold: 'Update status', text: 'Track progress through the implementation workflow' },
        { bold: 'Add tags', text: 'Organize subcategories with custom tags for filtering' },
        { bold: 'Link risks', text: 'Connect use case risks that this subcategory addresses' },
      ],
    },
    {
      type: 'heading',
      id: 'subcategory-detail',
      level: 3,
      text: 'Subcategory detail fields',
    },
    {
      type: 'paragraph',
      text: 'For each subcategory, VerifyWise tracks:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Status', text: 'Current progress through the implementation workflow' },
        { bold: 'Implementation description', text: 'Your documentation of how the requirement is addressed' },
        { bold: 'Evidence links', text: 'Supporting documents, policies and artifacts' },
        { bold: 'Owner', text: 'Person responsible for implementation' },
        { bold: 'Reviewer', text: 'Person who reviews the implementation' },
        { bold: 'Approver', text: 'Person who gives final sign-off' },
        { bold: 'Due date', text: 'Target completion date' },
        { bold: 'Auditor feedback', text: 'Notes from internal or external auditors' },
        { bold: 'Tags', text: 'Custom labels for organization and filtering' },
        { bold: 'Linked risks', text: 'Use case risks associated with this subcategory' },
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
      text: 'NIST AI RMF subcategories follow a detailed status workflow that supports review and approval processes:',
    },
    {
      type: 'checklist',
      items: [
        'Not started: work hasn\'t begun on this subcategory',
        'Draft: initial implementation documentation is being prepared',
        'In progress: active work is underway to implement the requirement',
        'Awaiting review: implementation is complete and ready for reviewer assessment',
        'Awaiting approval: reviewer has approved, waiting for final approver sign-off',
        'Implemented: the subcategory has been fully addressed and approved',
        'Needs rework: reviewer or approver has identified issues that need correction',
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
      text: 'There are several ways to monitor your NIST AI RMF implementation in VerifyWise:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Overall completion', text: 'Total subcategories implemented vs. total subcategories' },
        { bold: 'Progress by function', text: 'Separate progress tracking for Govern, Map, Measure and Manage' },
        { bold: 'Status breakdown', text: 'Distribution across all status values' },
        { bold: 'Assignment coverage', text: 'How many subcategories have owners assigned' },
        { bold: 'Overdue items', text: 'Subcategories past their due date' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Use these metrics to spot bottlenecks, allocate resources and report progress to stakeholders.',
    },
    {
      type: 'heading',
      id: 'linking-evidence',
      level: 2,
      text: 'Linking evidence',
    },
    {
      type: 'paragraph',
      text: 'For each subcategory, you can link evidence to demonstrate how you meet the requirement:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open the subcategory detail view' },
        { text: 'Navigate to the evidence section' },
        { text: 'Select existing evidence from your Evidence Hub or upload new documents' },
        { text: 'Add implementation notes explaining how the evidence supports compliance' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'The NIST AI RMF Playbook lists suggested actions for each subcategory. Use these as a guide for what evidence to collect and what implementation activities to document.',
    },
    {
      type: 'heading',
      id: 'linking-risks',
      level: 2,
      text: 'Linking risks',
    },
    {
      type: 'paragraph',
      text: 'The NIST AI RMF is all about managing AI risks. You can link use case risks to subcategories to create traceability between your risk assessment and your control implementation. Linking a risk to a subcategory shows how your NIST AI RMF activities address that specific risk.',
    },
    {
      type: 'heading',
      id: 'faq',
      level: 2,
      text: 'Frequently asked questions',
    },
    {
      type: 'heading',
      id: 'faq-mandatory',
      level: 3,
      text: 'Is the NIST AI RMF mandatory?',
    },
    {
      type: 'paragraph',
      text: 'For most organizations, it\'s voluntary. That said, it shows up more and more in government contracts, procurement requirements and industry standards. Some federal agencies require AI RMF implementation for AI systems used in government contexts. Even when it\'s not required, implementing the framework signals AI governance maturity.',
    },
    {
      type: 'heading',
      id: 'faq-start',
      level: 3,
      text: 'Where should we start with implementation?',
    },
    {
      type: 'paragraph',
      text: 'Start with the Govern function since it establishes the organizational foundation for everything else. Then focus on the Map function for your highest-risk AI systems to understand context and potential impacts. You don\'t need to complete all subcategories before moving to Measure and Manage.',
    },
    {
      type: 'heading',
      id: 'faq-eu-ai-act',
      level: 3,
      text: 'How does the AI RMF relate to the EU AI Act?',
    },
    {
      type: 'paragraph',
      text: 'The NIST AI RMF and EU AI Act share common goals around trustworthy AI but differ in approach. The EU AI Act is a regulation with mandatory requirements, while the AI RMF is voluntary guidance. Organizations subject to the EU AI Act will find that implementing the AI RMF addresses many of the same concerns and can support EU AI Act compliance.',
    },
    {
      type: 'heading',
      id: 'faq-iso-42001',
      level: 3,
      text: 'Should we use the AI RMF or ISO 42001?',
    },
    {
      type: 'paragraph',
      text: 'They serve different but complementary purposes. ISO 42001 provides a certifiable management system standard, while the AI RMF offers practical risk management guidance. Many organizations implement the AI RMF as the operational framework within an ISO 42001-certified management system. You can use both together.',
    },
    {
      type: 'heading',
      id: 'faq-all-subcategories',
      level: 3,
      text: 'Do we need to implement all subcategories?',
    },
    {
      type: 'paragraph',
      text: 'No. The AI RMF is designed to be flexible. Prioritize subcategories based on your specific AI systems, risk tolerance and resources. Start with the subcategories most relevant to your highest-risk AI systems and expand coverage over time.',
    },
    {
      type: 'heading',
      id: 'faq-playbook',
      level: 3,
      text: 'What is the AI RMF Playbook?',
    },
    {
      type: 'paragraph',
      text: 'The NIST AI RMF Playbook is a companion document with specific suggested actions for each subcategory. It includes examples, considerations and guidance to help you understand how to implement each requirement. The Playbook is free on the NIST website and gets updated regularly.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'Implement the Measure function',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-mitigation',
          title: 'Risk mitigation strategies',
          description: 'Implement the Manage function',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'model-inventory',
          title: 'Managing model inventory',
          description: 'Implement the Map function',
        },
      ],
    },
  ],
};
