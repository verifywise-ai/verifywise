import type { ArticleContent } from '../../contentTypes';

export const modelLifecycleContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: "AI models aren't static. They degrade over time, their training data gets stale, and production performance can drift from what you measured in testing. Lifecycle management is how you keep track of where each model is and what kind of oversight it needs at that stage.",
    },
    {
      type: 'paragraph',
      text: 'A model in development needs different governance than one serving production traffic. A model being retired needs a transition plan. VerifyWise tracks these phases so you can apply the right controls at the right time.',
    },
    {
      type: 'heading',
      id: 'why-lifecycle',
      level: 2,
      text: 'What lifecycle tracking gives you',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Proportional governance', text: 'Development needs flexibility; production needs stability. You apply different controls depending on the phase.' },
        { bold: 'Phase-specific risks', text: 'A model in testing has different risks than one in production. Tracking the phase tells you what to watch for.' },
        { bold: 'Audit trail', text: 'Regulators want to see how a model went from development to production. The lifecycle record provides that.' },
        { bold: 'Retirement planning', text: 'When you replace a model, there needs to be a transition plan. Tracking the phase makes that visible.' },
      ],
    },
    {
      type: 'heading',
      id: 'lifecycle-phases',
      level: 2,
      text: 'Lifecycle phases',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise tracks these phases:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'FileText',
          title: 'Problem definition and planning',
          description: 'Initial scoping, requirements gathering, and project planning before development begins.',
        },
        {
          icon: 'Database',
          title: 'Data collection and processing',
          description: 'Gathering, cleaning, and preparing training data with appropriate data governance.',
        },
        {
          icon: 'Brain',
          title: 'Model development and training',
          description: 'Building, training, and iterating on model architecture and parameters.',
        },
        {
          icon: 'CheckCircle',
          title: 'Model validation and testing',
          description: 'Evaluating model performance, fairness, and safety before deployment.',
        },
        {
          icon: 'Rocket',
          title: 'Deployment and integration',
          description: 'Moving models into production environments and integrating with business processes.',
        },
        {
          icon: 'Gauge',
          title: 'Monitoring and maintenance',
          description: 'Ongoing observation of model performance, drift detection, and updates.',
        },
        {
          icon: 'AlertTriangle',
          title: 'Decommissioning and retirement',
          description: 'Safely retiring models and managing the transition to replacement systems.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'project-status',
      level: 2,
      text: 'Project status tracking',
    },
    {
      type: 'paragraph',
      text: 'Each AI project in VerifyWise has a status that indicates its current state in the governance workflow:',
    },
    {
      type: 'table',
      columns: [
        { key: 'status', label: 'Status', width: '1fr' },
        { key: 'description', label: 'Description', width: '2fr' },
        { key: 'next', label: 'Typical next step', width: '1.5fr' },
      ],
      rows: [
        { status: 'Not started', description: 'Project has been registered but work has not begun', next: 'Begin development' },
        { status: 'In progress', description: 'Active development or implementation is underway', next: 'Submit for review' },
        { status: 'Under review', description: 'Project is being evaluated for compliance or approval', next: 'Address feedback' },
        { status: 'Completed', description: 'Project has met all requirements and is in production', next: 'Monitor performance' },
        { status: 'On hold', description: 'Work has been temporarily paused', next: 'Resume when ready' },
        { status: 'Closed', description: 'Project has been concluded or archived', next: '—' },
        { status: 'Rejected', description: 'Project did not pass review and will not proceed', next: 'Revise or discontinue' },
      ],
    },
    {
      type: 'heading',
      id: 'model-approval-status',
      level: 2,
      text: 'Model approval status',
    },
    {
      type: 'paragraph',
      text: 'Independent of project status, individual models have their own approval workflow:',
    },
    {
      type: 'table',
      columns: [
        { key: 'status', label: 'Status', width: '120px' },
        { key: 'meaning', label: 'Meaning' },
        { key: 'action', label: 'Typical action' },
      ],
      rows: [
        { status: 'Pending', meaning: 'Awaiting governance review', action: 'Complete risk assessment' },
        { status: 'Approved', meaning: 'Authorized for production use', action: 'Deploy with monitoring' },
        { status: 'Restricted', meaning: 'Limited use cases only', action: 'Document restrictions' },
        { status: 'Blocked', meaning: 'Not authorized for use', action: 'Seek alternative models' },
      ],
    },
    {
      type: 'heading',
      id: 'mlflow-lifecycle',
      level: 2,
      text: 'MLFlow lifecycle integration',
    },
    {
      type: 'paragraph',
      text: 'For teams using MLFlow, VerifyWise imports lifecycle stage information directly from your ML platform:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Staging', text: 'Model is being prepared for production evaluation' },
        { bold: 'Production', text: 'Model is actively serving predictions' },
        { bold: 'Archived', text: 'Model has been retired from active use' },
      ],
    },
    {
      type: 'paragraph',
      text: 'This integration provides visibility into training timestamps, model parameters, and version history without manual data entry.',
    },
    {
      type: 'heading',
      id: 'risk-classification',
      level: 2,
      text: 'AI risk classification',
    },
    {
      type: 'paragraph',
      text: 'Each use case gets an EU AI Act risk classification, which determines how much governance overhead applies:',
    },
    {
      type: 'grid-cards',
      columns: 2,
      items: [
        { icon: 'AlertTriangle', title: 'Prohibited', description: 'AI systems banned under EU AI Act (social scoring, real-time biometric identification in public spaces)' },
        { icon: 'Shield', title: 'High risk', description: 'Systems requiring conformity assessment and ongoing monitoring' },
        { icon: 'Info', title: 'Limited risk', description: 'Systems with transparency obligations (chatbots, emotion recognition)' },
        { icon: 'CheckCircle', title: 'Minimal risk', description: 'Low-risk applications with voluntary code of conduct' },
      ],
    },
    {
      type: 'heading',
      id: 'high-risk-roles',
      level: 2,
      text: 'High-risk system roles',
    },
    {
      type: 'paragraph',
      text: 'For high-risk systems, you also record your organization\'s role. Different roles have different obligations under the EU AI Act:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Provider', text: 'Develops or places the AI system on the market' },
        { bold: 'Deployer', text: 'Uses an AI system under their authority' },
        { bold: 'Importer', text: 'Brings AI systems into the EU market' },
        { bold: 'Distributor', text: 'Makes AI systems available on the market' },
        { bold: 'Product manufacturer', text: 'Integrates AI into products under their own name' },
        { bold: 'Authorized representative', text: 'Acts on behalf of a non-EU provider' },
      ],
    },
    {
      type: 'heading',
      id: 'audit-trail',
      level: 2,
      text: 'Lifecycle audit trail',
    },
    {
      type: 'paragraph',
      text: 'All status changes and lifecycle transitions are logged automatically with timestamps and who made the change. This record is what auditors and regulators will look at when reviewing your governance process.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Define clear criteria for each lifecycle transition in your AI governance policy. Document who has authority to approve status changes and what evidence is required.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'model-inventory',
          title: 'Managing model inventory',
          description: 'Register and track AI models across your organization',
        },
        {
          collectionId: 'compliance',
          articleId: 'eu-ai-act',
          title: 'EU AI Act compliance',
          description: 'Navigate European AI regulation requirements',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'Evaluate risks at each lifecycle stage',
        },
      ],
    },
  ],
};
