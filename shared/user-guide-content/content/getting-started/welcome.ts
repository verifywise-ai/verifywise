import type { ArticleContent } from '../../contentTypes';

export const welcomeContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'what-is-verifywise',
      level: 2,
      text: 'What is VerifyWise?',
    },
    {
      type: 'paragraph',
      text: "VerifyWise is an AI governance platform that helps organizations keep track of their AI systems, stay compliant with regulations and manage the risks that come with deploying AI. It covers model inventory, vendor oversight, risk registers, compliance frameworks and policy management in one place.",
    },
    {
      type: 'paragraph',
      text: "You deploy it on your own infrastructure (on-premises or private cloud), so your governance data never leaves your security perimeter. There's no SaaS dependency and no data shared with third parties.",
    },
    {
      type: 'callout',
      variant: 'info',
      text: "VerifyWise is source-available. You can read every line of code, audit it internally, and modify it to fit your organization's needs.",
    },
    {
      type: 'heading',
      id: 'core-capabilities',
      level: 2,
      text: 'What you can do with it',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Brain',
          title: 'Model inventory',
          description: 'Register every AI system in your organization. Track each model from development through deployment to retirement, with approval gates at each stage.',
        },
        {
          icon: 'AlertTriangle',
          title: 'Risk management',
          description: 'Document risks per model, vendor or use case. Score them, assign owners, track mitigations and monitor residual risk over time.',
        },
        {
          icon: 'Shield',
          title: 'Compliance and controls',
          description: 'Map your controls to regulatory frameworks. Track implementation status per control and collect evidence to stay audit-ready.',
        },
        {
          icon: 'Building2',
          title: 'Vendor governance',
          description: 'Maintain a registry of third-party AI vendors. Track contracts, conduct due diligence and monitor vendor-specific risks.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'supported-frameworks',
      level: 2,
      text: 'Supported frameworks',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise ships with pre-built control sets for these frameworks:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'EU AI Act', text: 'Pre-mapped controls and assessment templates covering high-risk AI system requirements' },
        { bold: 'ISO 42001', text: 'Clause-by-clause structure for AI management system certification readiness' },
        { bold: 'ISO 27001', text: 'Information security controls mapped to AI-specific concerns' },
        { bold: 'NIST AI RMF', text: 'The 4 functions (Govern, Map, Measure, Manage) with subcategory tracking' },
      ],
    },
    {
      type: 'paragraph',
      text: 'You can also install additional frameworks (SOC 2, GDPR, HIPAA and others) through the plugin system.',
    },
    {
      type: 'heading',
      id: 'key-features',
      level: 2,
      text: 'Other things included',
    },
    {
      type: 'checklist',
      items: [
        'Policy manager with versioning, approval workflows and status tracking',
        'Evidence hub for uploading and organizing compliance documentation',
        'AI trust center that generates a public transparency page',
        'Training registry to assign courses and track staff completion',
        'Incident management for logging AI-related incidents and corrective actions',
        'Role-based access (Admin, Reviewer, Editor, Auditor) with organization-level isolation',
        'Event tracker with a full audit trail of who did what and when',
        'Integrations with Slack, MLflow, and custom webhooks via automations',
      ],
    },
    {
      type: 'heading',
      id: 'deployment-options',
      level: 2,
      text: 'Deployment',
    },
    {
      type: 'grid-cards',
      items: [
        { title: 'Docker Compose', description: 'Single install script, everything containerized. The fastest way to get running.' },
        { title: 'Kubernetes', description: 'Helm chart for production clusters with horizontal scaling.' },
        { title: 'Cloud VMs', description: 'Works on any Linux VM (AWS, GCP, Azure, Render, DigitalOcean).' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The stack runs on PostgreSQL and Redis. Authentication supports email/password, Google OAuth2 and Microsoft Entra ID.',
    },
    {
      type: 'heading',
      id: 'next-steps',
      level: 2,
      text: 'Where to go from here',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Install', text: '— Get the platform running in your environment (20-30 minutes)' },
        { bold: 'Dashboard tour', text: '— Understand the layout, sidebar and key metrics' },
        { bold: 'Quick start', text: '— Create your first AI use case and upload evidence in under 10 minutes' },
      ],
    },
    {
      type: 'article-links',
      title: 'Continue reading',
      items: [
        {
          collectionId: 'getting-started',
          articleId: 'installing',
          title: 'Installing VerifyWise',
          description: 'Deploy with Docker Compose or set up a development environment',
        },
        {
          collectionId: 'getting-started',
          articleId: 'dashboard',
          title: 'The dashboard',
          description: 'Navigate the interface, switch views and find what needs attention',
        },
        {
          collectionId: 'getting-started',
          articleId: 'quick-start',
          title: 'Quick start',
          description: 'Create a use case, add a framework and upload your first evidence',
        },
      ],
    },
  ],
};
