import type { ArticleContent } from '../../contentTypes';

export const euAiActContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The EU AI Act is the European Union\'s regulation governing artificial intelligence systems. It uses a risk-based framework that classifies AI systems by their potential impact and sets requirements for transparency, accountability and human oversight.',
    },
    {
      type: 'paragraph',
      text: 'As the first dedicated AI law, the EU AI Act applies to any organization that develops, deploys or uses AI systems within the European Union or that affects EU citizens. If you operate in or sell to European markets, you\'ll need to understand and comply with this regulation.',
    },
    {
      type: 'heading',
      id: 'why-comply',
      level: 2,
      text: 'Why comply with the EU AI Act?',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Legal requirement', text: 'Non-compliance can result in fines up to 35 million euros or 7% of global annual turnover' },
        { bold: 'Market access', text: 'You need compliance to offer AI systems in the EU market' },
        { bold: 'Competitive advantage', text: 'Showing compliance builds trust with European customers and partners' },
        { bold: 'Risk management', text: 'The Act\'s requirements align with sound AI governance practices that protect your organization' },
        { bold: 'Future readiness', text: 'Similar regulations are emerging globally, so EU AI Act compliance helps prepare you for other jurisdictions' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Important timeline',
      text: 'The EU AI Act entered into force in August 2024, with different provisions kicking in at different times through 2027. Start your compliance preparations now if you haven\'t already.',
    },
    {
      type: 'heading',
      id: 'risk-classification',
      level: 2,
      text: 'Risk classification',
    },
    {
      type: 'paragraph',
      text: 'The EU AI Act classifies AI systems into four risk categories, each with different compliance requirements:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'XCircle',
          title: 'Unacceptable risk',
          description: 'AI systems that pose clear threats to safety or fundamental rights are prohibited entirely.',
        },
        {
          icon: 'AlertTriangle',
          title: 'High risk',
          description: 'AI systems in critical areas like healthcare, employment, or law enforcement require strict compliance measures.',
        },
        {
          icon: 'AlertCircle',
          title: 'Limited risk',
          description: 'AI systems with specific transparency obligations, such as chatbots or emotion recognition systems.',
        },
        {
          icon: 'CheckCircle',
          title: 'Minimal risk',
          description: 'Most AI systems fall here and face no specific requirements beyond existing laws.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'high-risk-requirements',
      level: 2,
      text: 'High-risk AI requirements',
    },
    {
      type: 'paragraph',
      text: 'For high-risk AI systems, the EU AI Act mandates:',
    },
    {
      type: 'checklist',
      items: [
        'Risk management system throughout the AI lifecycle',
        'Data governance and management practices',
        'Technical documentation and record-keeping',
        'Transparency and information provision to users',
        'Human oversight measures',
        'Accuracy, robustness and cybersecurity requirements',
        'Quality management system',
        'Conformity assessment before market placement',
      ],
    },
    {
      type: 'heading',
      id: 'verifywise-support',
      level: 2,
      text: 'How VerifyWise supports EU AI Act compliance',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise gives you structured tools to help meet EU AI Act requirements:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Risk classification', text: 'Classify your AI systems according to the Act\'s risk categories' },
        { bold: 'Control framework', text: 'Pre-built controls mapped to EU AI Act requirements' },
        { bold: 'Assessment tracking', text: 'Track progress through compliance assessments' },
        { bold: 'Documentation', text: 'Maintain technical documentation required by the regulation' },
        { bold: 'Evidence collection', text: 'Gather and organize evidence for conformity assessments' },
        { bold: 'Audit readiness', text: 'Generate reports demonstrating compliance status' },
      ],
    },
    {
      type: 'heading',
      id: 'getting-started',
      level: 2,
      text: 'Getting started with EU AI Act compliance',
    },
    {
      type: 'paragraph',
      text: 'To start working on EU AI Act compliance in VerifyWise:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Create a use case for your AI system in VerifyWise' },
        { text: 'Select the EU AI Act framework when configuring the use case' },
        { text: 'Classify your AI system according to its risk level' },
        { text: 'Complete the compliance assessment to identify gaps' },
        { text: 'Work through the controls to address each requirement' },
        { text: 'Document implementation details and collect evidence' },
      ],
    },
    {
      type: 'heading',
      id: 'controls-structure',
      level: 2,
      text: 'EU AI Act controls structure',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise organizes EU AI Act requirements into manageable controls and subcontrols:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Controls', text: 'High-level requirements from the regulation' },
        { bold: 'Subcontrols', text: 'Specific actions needed to satisfy each control' },
        { bold: 'Status tracking', text: 'Track each control as Waiting, In progress, or Done' },
        { bold: 'Risk review', text: 'Assess residual risk as Acceptable, Residual, or Unacceptable' },
        { bold: 'Ownership', text: 'Assign owners, reviewers and approvers to controls' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Start with the highest-priority controls for your risk classification. Focus on documentation and evidence collection early, as these take time to accumulate.',
    },
    {
      type: 'heading',
      id: 'assessment-screen',
      level: 2,
      text: 'The assessment screen',
    },
    {
      type: 'paragraph',
      text: 'When you select the EU AI Act framework for a use case, VerifyWise creates an assessment containing all applicable controls. The assessment screen shows your compliance progress at a glance.',
    },
    {
      type: 'paragraph',
      text: 'The assessment screen displays:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Progress overview', text: 'Visual indicators showing overall completion percentage and control status breakdown' },
        { bold: 'Control categories', text: 'Controls organized by EU AI Act articles and requirements' },
        { bold: 'Status filters', text: 'Filter controls by status to focus on what needs attention' },
        { bold: 'Search', text: 'Find specific controls by keyword' },
      ],
    },
    {
      type: 'heading',
      id: 'control-categories',
      level: 2,
      text: 'Control categories',
    },
    {
      type: 'paragraph',
      text: 'EU AI Act controls in VerifyWise are organized into categories aligned with the regulation\'s structure:',
    },
    {
      type: 'checklist',
      items: [
        'Risk management system requirements',
        'Data and data governance requirements',
        'Technical documentation requirements',
        'Record-keeping requirements',
        'Transparency and provision of information',
        'Human oversight requirements',
        'Accuracy, robustness and cybersecurity',
        'Quality management system',
      ],
    },
    {
      type: 'heading',
      id: 'working-with-controls',
      level: 2,
      text: 'Working with controls',
    },
    {
      type: 'paragraph',
      text: 'Each control represents a specific requirement from the EU AI Act. Click on a control to open its detail view where you can:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Review the requirement', text: 'Read the control description and understand what is required' },
        { bold: 'View subcontrols', text: 'See the specific actions needed to satisfy the control' },
        { bold: 'Update status', text: 'Change the control status as you make progress' },
        { bold: 'Assign responsibility', text: 'Set the owner, reviewer and approver' },
        { bold: 'Set due date', text: 'Establish a target completion date' },
        { bold: 'Document implementation', text: 'Describe how you are addressing the requirement' },
        { bold: 'Assess risk', text: 'Evaluate the residual risk after implementation' },
      ],
    },
    {
      type: 'heading',
      id: 'subcontrols',
      level: 2,
      text: 'Understanding subcontrols',
    },
    {
      type: 'paragraph',
      text: 'Subcontrols break down each control into specific, actionable items. They help you understand exactly what needs to be done and track granular progress.',
    },
    {
      type: 'paragraph',
      text: 'For each subcontrol, you can:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Mark it as complete when addressed' },
        { text: 'Add notes about your implementation approach' },
        { text: 'Link evidence demonstrating compliance' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The parent control tracks how many subcontrols are complete, giving you visibility into detailed progress.',
    },
    {
      type: 'heading',
      id: 'completing-control',
      level: 2,
      text: 'Completing a control',
    },
    {
      type: 'paragraph',
      text: 'To fully complete a control, follow this workflow:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Change status from "Waiting" to "In progress" when you begin work' },
        { text: 'Work through each subcontrol, marking them complete as you go' },
        { text: 'Document your implementation details in the control' },
        { text: 'Link or upload evidence supporting your implementation' },
        { text: 'Assess the residual risk level' },
        { text: 'Change status to "Done" when all subcontrols are addressed' },
        { text: 'Have the reviewer and approver sign off if required' },
      ],
    },
    {
      type: 'heading',
      id: 'control-assignments',
      level: 2,
      text: 'Control assignments',
    },
    {
      type: 'paragraph',
      text: 'Each control can have three types of assignments:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'User',
          title: 'Owner',
          description: 'The person responsible for implementing the control and ensuring it is completed.',
        },
        {
          icon: 'Eye',
          title: 'Reviewer',
          description: 'The person who reviews the implementation to ensure it meets requirements.',
        },
        {
          icon: 'CheckSquare',
          title: 'Approver',
          description: 'The person with authority to give final approval on the control.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'risk-assessment',
      level: 2,
      text: 'Control risk assessment',
    },
    {
      type: 'paragraph',
      text: 'After implementing a control, assess the residual risk to document whether your implementation adequately addresses the requirement:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Acceptable risk', text: 'The control fully addresses the requirement with minimal residual risk' },
        { bold: 'Residual risk', text: 'Some risk remains but is documented, understood and accepted' },
        { bold: 'Unacceptable risk', text: 'The implementation does not adequately address the requirement; further action is needed' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Important',
      text: 'Controls marked with unacceptable risk need attention first. They point to gaps in your compliance posture that still need work.',
    },
    {
      type: 'heading',
      id: 'progress-tracking',
      level: 2,
      text: 'Tracking your progress',
    },
    {
      type: 'paragraph',
      text: 'There are several ways to monitor your EU AI Act compliance progress in VerifyWise:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Completion percentage', text: 'Overall progress across all controls' },
        { bold: 'Status breakdown', text: 'Number of controls in each status (Waiting, In progress, Done)' },
        { bold: 'Subcontrol progress', text: 'Detailed view of completed vs. pending subcontrols' },
        { bold: 'Overdue controls', text: 'Controls that have passed their due date' },
        { bold: 'Risk summary', text: 'Distribution of controls by risk assessment outcome' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Use these metrics to spot bottlenecks, allocate resources and report progress to stakeholders.',
    },
    {
      type: 'heading',
      id: 'evidence-linking',
      level: 2,
      text: 'Linking evidence to controls',
    },
    {
      type: 'paragraph',
      text: 'For each control, you can link evidence from your Evidence Hub to demonstrate compliance:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open the control detail view' },
        { text: 'Navigate to the evidence section' },
        { text: 'Select existing evidence from your Evidence Hub or upload new documents' },
        { text: 'Add notes explaining how the evidence supports the control' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Linked evidence creates an audit trail that demonstrates your compliance activities to auditors and regulators.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'compliance',
          articleId: 'assessments',
          title: 'Compliance assessments',
          description: 'Learn how to run and track compliance assessments',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'Assess risks as required by the EU AI Act',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'evidence-collection',
          title: 'Evidence collection',
          description: 'Gather documentation for conformity assessments',
        },
      ],
    },
  ],
};
