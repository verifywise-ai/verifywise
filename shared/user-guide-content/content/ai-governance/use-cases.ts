import type { ArticleContent } from '@user-guide-content/contentTypes';

export const useCasesContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'A use case is how you describe an AI system and what it does inside your organization. Think of it as the container that holds everything together: risks, frameworks, assessments, controls, vendor relationships, and linked models all hang off a use case.',
    },
    {
      type: 'paragraph',
      text: 'Every use case gets a unique ID (UC-001, UC-002, and so on) and follows the AI system from scoping through deployment. You set its risk classification, assign someone to own it, attach compliance frameworks, and build up a risk register, all from one place.',
    },
    {
      type: 'heading',
      id: 'creating-a-use-case',
      level: 2,
      text: 'Creating a use case',
    },
    {
      type: 'paragraph',
      text: 'Head to the Use cases page and hit New use case. You might see a short screening step asking whether the project involves AI. Answer or skip it. The creation form comes next.',
    },
    {
      type: 'heading',
      id: 'required-fields',
      level: 3,
      text: 'What you need to fill in',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Title', text: 'A short name, up to 64 characters. Has to be unique in your organization.' },
        { bold: 'Goal', text: 'What the AI system is supposed to accomplish, up to 256 characters.' },
        { bold: 'Owner', text: 'Who is responsible. They get an email when you assign them.' },
        { bold: 'Start date', text: 'When work started or is expected to start.' },
        { bold: 'AI risk classification', text: 'Pick one: Prohibited, High risk, Limited risk, or Minimal risk. This drives how much oversight the EU AI Act expects.' },
        { bold: 'Type of high risk role', text: 'Your organization\'s relationship to the AI system: Deployer, Provider, Distributor, Importer, Product manufacturer, or Authorized representative.' },
        { bold: 'Geography', text: 'Where the system operates: Global, Europe, North America, South America, Asia, or Africa.' },
        { bold: 'Target industry', text: 'The sector where the AI system is used.' },
      ],
    },
    {
      type: 'heading',
      id: 'optional-fields',
      level: 3,
      text: 'Optional fields',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Description', text: 'A longer explanation of the system and how it works.' },
        { bold: 'Members', text: 'Other people who need access. The owner is added automatically.' },
        { bold: 'Status', text: 'Starts at "Not started." You can also choose In progress, Under review, Completed, Closed, On hold, or Rejected.' },
        { bold: 'Approval workflow', text: 'If your organization requires sign-off before work begins, pick a workflow here. Frameworks won\'t be created until the use case is approved.' },
      ],
    },
    {
      type: 'heading',
      id: 'frameworks',
      level: 3,
      text: 'Attaching frameworks',
    },
    {
      type: 'paragraph',
      text: 'During creation you pick which compliance frameworks apply. EU AI Act, ISO 42001, ISO 27001, and NIST AI RMF come built in, and your organization may have plugin frameworks installed on top. You can always add or remove frameworks later from settings.',
    },
    {
      type: 'paragraph',
      text: 'Frameworks can be scoped to one use case (project-based) or shared across the whole organization. Go with project-based when different AI systems face different regulatory requirements.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'When an approval workflow is assigned, framework creation waits until the use case clears approval. You can still edit basic fields in the meantime.',
    },
    {
      type: 'heading',
      id: 'use-case-view',
      level: 2,
      text: 'Inside a use case',
    },
    {
      type: 'paragraph',
      text: 'Click a use case to open it. The detail view is split into tabs.',
    },
    {
      type: 'heading',
      id: 'overview-tab',
      level: 3,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The landing tab. Shows the use case details, which frameworks are linked, and a breakdown of risk levels.',
    },
    {
      type: 'heading',
      id: 'risks-tab',
      level: 3,
      text: 'Use case risks',
    },
    {
      type: 'paragraph',
      text: 'A risk register scoped to this use case. Create, edit, and delete risks here. Each risk can be tied to specific framework controls and assessments. A badge on the tab shows the count.',
    },
    {
      type: 'paragraph',
      text: 'Anything you create here also shows up on the global Risk management page alongside risks from other use cases.',
    },
    {
      type: 'heading',
      id: 'linked-models-tab',
      level: 3,
      text: 'Linked models',
    },
    {
      type: 'paragraph',
      text: 'Which AI models from your inventory are tied to this use case. Link and unlink them here. The connection makes it clear to auditors which models serve which business processes.',
    },
    {
      type: 'heading',
      id: 'frameworks-tab',
      level: 3,
      text: 'Frameworks and regulations',
    },
    {
      type: 'paragraph',
      text: 'Split into two sub-tabs. Controls tracks progress against each framework\'s requirements. Assessments tracks questionnaire-style evaluations. Completion percentages update automatically as you work through items.',
    },
    {
      type: 'heading',
      id: 'ce-marking-tab',
      level: 3,
      text: 'CE marking',
    },
    {
      type: 'paragraph',
      text: 'For AI systems that require a CE mark under the EU AI Act. This tab appears when the relevant plugin is active and walks through the conformity assessment steps.',
    },
    {
      type: 'heading',
      id: 'activity-tab',
      level: 3,
      text: 'Activity',
    },
    {
      type: 'paragraph',
      text: 'A chronological log of every change made to the use case: who changed what, when, and the old and new values. Useful for audits and internal reviews.',
    },
    {
      type: 'heading',
      id: 'monitoring-tab',
      level: 3,
      text: 'Monitoring',
    },
    {
      type: 'paragraph',
      text: 'Post-market monitoring for deployed AI systems. Track ongoing performance, incidents, and compliance status after the system goes live.',
    },
    {
      type: 'heading',
      id: 'settings-tab',
      level: 3,
      text: 'Settings',
    },
    {
      type: 'paragraph',
      text: 'Change the basics (title, goal, status), transfer ownership, manage team members, add or remove frameworks, or delete the use case. Every edit gets recorded in the activity log.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Deleting a use case cannot be undone. Any pending approval requests get withdrawn automatically.',
    },
    {
      type: 'heading',
      id: 'approval-workflows',
      level: 2,
      text: 'Approval workflows',
    },
    {
      type: 'paragraph',
      text: 'Some organizations need sign-off before a use case moves forward. If you assign an approval workflow during creation, here is what happens while it is pending:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Basic fields (title, goal, description, status) stay editable' },
        { text: 'Frameworks, Risks, and Linked models tabs are locked' },
        { text: 'Framework creation is held back until approval comes through' },
        { text: 'A rejection keeps the tabs locked and updates the status accordingly' },
      ],
    },
    {
      type: 'paragraph',
      text: 'After approval, the deferred frameworks get created and all tabs open up.',
    },
    {
      type: 'heading',
      id: 'list-view',
      level: 2,
      text: 'Working with the list',
    },
    {
      type: 'paragraph',
      text: 'The main page shows every non-organizational use case. A few tools help you find what you need:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Search', text: 'Looks through use case titles and UC IDs.' },
        { bold: 'Filter', text: 'Narrow by name, risk level, owner, status, or start date.' },
        { bold: 'Group', text: 'Organize by risk level, role, owner, or status. Groups collapse and sort.' },
        { bold: 'Columns', text: 'Show or hide columns: UC ID, title, risk classification, role, start date, last updated.' },
      ],
    },
    {
      type: 'heading',
      id: 'export',
      level: 3,
      text: 'Export',
    },
    {
      type: 'paragraph',
      text: 'Pull the full list into CSV or Excel. The export covers UC ID, title, risk level, role, start date, last updated, owner, and status.',
    },
    {
      type: 'heading',
      id: 'project-scope',
      level: 2,
      text: 'Defining scope',
    },
    {
      type: 'paragraph',
      text: 'Each use case can carry a detailed scope that pins down the technical and compliance profile of the AI system.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'AI environment', text: 'Where and how the system runs.' },
        { bold: 'Technology type', text: 'Machine learning, NLP, computer vision, or another category.' },
        { bold: 'Novel technology', text: 'Whether it uses new or experimental AI techniques.' },
        { bold: 'Personal data', text: 'Whether the system handles personal data (matters for GDPR).' },
        { bold: 'Monitoring', text: 'Whether you have post-deployment monitoring running.' },
        { bold: 'Unintended outcomes', text: 'Adverse effects spotted during scoping.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'From your answers, VerifyWise calculates a risk level (High, Medium, or Low) and flags the compliance requirements that apply. A system processing personal data, for instance, gets GDPR and DPIA requirements added automatically.',
    },
    {
      type: 'heading',
      id: 'roles-and-permissions',
      level: 2,
      text: 'Who can do what',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Admin', text: 'Everything. Create, edit, delete, manage settings, handle approvals.' },
        { bold: 'Editor', text: 'Create and edit use cases, add frameworks and risks.' },
        { bold: 'Reviewer', text: 'Read plus approve or reject.' },
        { bold: 'Auditor', text: 'Read only.' },
      ],
    },
    {
      type: 'heading',
      id: 'notifications',
      level: 2,
      text: 'When you get notified',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Someone assigns you as owner' },
        { text: 'You are added as a team member (email varies by role)' },
        { text: 'An approval request changes status' },
        { text: 'A new use case is created (Slack, if your organization has it connected)' },
      ],
    },
    {
      type: 'heading',
      id: 'connections',
      level: 2,
      text: 'Where use cases plug in',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Risk management', text: 'Risks created inside a use case feed into the global register. You can also link existing risks from the risk management page.' },
        { bold: 'Frameworks', text: 'Compliance progress is tracked per use case. Controls and assessments stay scoped to the use case they belong to.' },
        { bold: 'Model inventory', text: 'Link models so there is a clear trail from business process to underlying AI.' },
        { bold: 'Vendors', text: 'Vendor risks can be tied to specific use cases.' },
        { bold: 'Dashboard', text: 'The main dashboard rolls up data from every use case: compliance progress, risk distribution, task status.' },
        { bold: 'Evidence hub', text: 'Attach evidence items to use cases for audit readiness.' },
      ],
    },
    {
      type: 'heading',
      id: 'best-practices',
      level: 2,
      text: 'Practical tips',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Keep it one-to-one. One AI system, one use case. Bundling unrelated systems together confuses auditors and weakens your compliance posture.' },
        { text: 'Classify risk early. The EU AI Act classification shapes how much documentation and oversight you need. Fix it at the start rather than retrofitting later.' },
        { text: 'Pick the right owner. They get the notifications and carry the accountability. Choose someone who actually has authority over the AI system, not just a name on paper.' },
        { text: 'Attach frameworks on day one. Tracking compliance from the beginning is always easier than catching up.' },
        { text: 'Fill in the scope section. The auto-generated compliance requirements can flag obligations you would otherwise overlook.' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'How to identify and evaluate risks within your use cases',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'model-inventory',
          title: 'Model inventory',
          description: 'Track and manage the AI models behind your use cases',
        },
        {
          collectionId: 'compliance',
          articleId: 'eu-ai-act',
          title: 'EU AI Act compliance',
          description: 'How risk classification maps to regulatory requirements',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'intake-forms',
          title: 'Intake forms',
          description: 'Set up intake workflows for new AI project submissions',
        },
      ],
    },
  ],
};
