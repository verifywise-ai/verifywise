import type { ArticleContent } from '../../contentTypes';

export const policyManagementContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The policy manager in VerifyWise helps you create, organize and maintain AI governance policies for your organization. Well-documented policies set the groundwork for how your teams handle AI, and they show regulators and stakeholders that you take governance seriously.',
    },
    {
      type: 'paragraph',
      text: 'You can create policies from scratch or start from pre-designed templates covering common AI governance topics. Each policy tracks its status through a defined lifecycle, from initial draft through review and approval to publication.',
    },
    {
      type: 'heading',
      id: 'why-policies',
      level: 2,
      text: 'Why manage AI policies?',
    },
    {
      type: 'paragraph',
      text: 'AI systems bring governance challenges that traditional corporate policies don\'t cover. Things like algorithmic bias, model transparency and human oversight need clear rules. Without documented policies, teams make inconsistent decisions, risks go unmanaged and it\'s hard to prove compliance when auditors come knocking.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Regulatory compliance', text: 'Many AI regulations require documented policies covering AI development, deployment, and monitoring' },
        { bold: 'Consistent practices', text: 'Make sure all teams follow the same standards for AI development and use' },
        { bold: 'Risk management', text: 'Define acceptable uses, prohibited practices and risk thresholds for AI systems' },
        { bold: 'Audit readiness', text: 'Show auditors and regulators your governance controls with documented policies' },
        { bold: 'Stakeholder trust', text: 'Show customers and partners that you take AI governance seriously' },
        { bold: 'Training foundation', text: 'Provide clear guidance that teams can reference and learn from' },
      ],
    },
    {
      type: 'heading',
      id: 'policy-manager-screen',
      level: 2,
      text: 'The policy manager screen',
    },
    {
      type: 'paragraph',
      text: 'The policy manager has two tabs for organizing your work:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Shield',
          title: 'Organizational policies',
          description: 'Your organization\'s custom policies. Create, edit, and manage policies that define your AI governance standards.',
        },
        {
          icon: 'ShieldHalf',
          title: 'Policy templates',
          description: 'Pre-built templates covering common AI governance topics. Use templates as starting points for your own policies.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'status-cards',
      level: 2,
      text: 'Policy status overview',
    },
    {
      type: 'paragraph',
      text: 'At the top of the organizational policies tab, status cards show the distribution of your policies across each lifecycle stage:',
    },
    {
      type: 'checklist',
      items: [
        'Draft, policies being written or edited, not yet ready for review',
        'Under review, policies submitted for stakeholder review',
        'Approved, policies that have passed review and are ready for publication',
        'Published, active policies that apply to your organization',
        'Archived, older policies kept for reference but no longer active',
        'Deprecated, policies that have been superseded or are no longer relevant',
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/policy-manager.png',
      alt: 'Policy Manager page showing status cards for Draft, Under Review, Approved, Published, Archived, and Deprecated policies, along with a table listing organizational policies with their status, tags, next review date, and author',
      caption: 'The policy manager shows all organizational policies and their current status.',
    },
    {
      type: 'heading',
      id: 'creating-policy',
      level: 2,
      text: 'Creating a policy',
    },
    {
      type: 'paragraph',
      text: 'To create a new policy:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click "Add new policy" in the organizational policies tab' },
        { text: 'Enter a title that clearly describes the policy\'s purpose' },
        { text: 'Assign a policy owner who is accountable for the policy' },
        { text: 'Write or paste the policy content using the rich text editor' },
        { text: 'Select relevant tags to categorize the policy' },
        { text: 'Set the initial status (typically Draft)' },
        { text: 'Optionally add team members as reviewers' },
        { text: 'Optionally set a next review date' },
        { text: 'Save the policy' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/create-policy.png',
      alt: 'Create new policy modal with fields for policy title, next review date, status, team members, tags, and a rich text editor for policy content',
      caption: 'The policy creation form allows you to write or paste policy content with rich text formatting.',
    },
    {
      type: 'heading',
      id: 'policy-fields',
      level: 2,
      text: 'Policy fields',
    },
    {
      type: 'paragraph',
      text: 'Each policy includes the following information:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Title', text: 'A clear, descriptive name for the policy (up to 128 characters)' },
        { bold: 'Policy owner', text: 'The person accountable for the policy. Owners cannot also be assigned as reviewers on the same policy.' },
        { bold: 'Content', text: 'The full policy text with rich formatting support' },
        { bold: 'Status', text: 'Current lifecycle stage (Draft, Under review, Approved, Published, Archived, Deprecated)' },
        { bold: 'Tags', text: 'Categories like AI ethics, Privacy, Security, EU AI Act, ISO 42001, etc.' },
        { bold: 'Team members', text: 'Reviewers assigned to evaluate the policy. The policy owner is excluded from this list.' },
        { bold: 'Next review date', text: 'When the policy should be reviewed for updates' },
        { bold: 'Author', text: 'The person who created the policy' },
        { bold: 'Last updated', text: 'When the policy was most recently modified' },
        { bold: 'Updated by', text: 'Who made the most recent changes' },
      ],
    },
    {
      type: 'heading',
      id: 'available-tags',
      level: 2,
      text: 'Available policy tags',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise comes with predefined tags to help you categorize policies:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Governance topics', text: 'AI ethics, Fairness, Transparency, Explainability, Bias mitigation, Accountability, Human oversight' },
        { bold: 'Technical areas', text: 'Privacy, Data governance, Model risk, Security, LLM, Red teaming, Monitoring' },
        { bold: 'Compliance frameworks', text: 'EU AI Act, ISO 42001, NIST RMF, Audit, Vendor management' },
      ],
    },
    {
      type: 'heading',
      id: 'filtering-searching',
      level: 2,
      text: 'Filtering and searching',
    },
    {
      type: 'paragraph',
      text: 'There are a few ways to find specific policies:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Filter', text: 'Filter by title, status, author, or next review date' },
        { bold: 'Group by', text: 'Group policies by status or author for easier navigation' },
        { bold: 'Search', text: 'Search for policies by title' },
      ],
    },
    {
      type: 'heading',
      id: 'editing-deleting',
      level: 2,
      text: 'Editing and deleting policies',
    },
    {
      type: 'paragraph',
      text: 'To edit a policy, click on it in the table to open the detail view. Make your changes and save. The last updated timestamp and updated by fields get recorded automatically.',
    },
    {
      type: 'paragraph',
      text: 'To delete a policy, use the delete action in the policy table. Deleted policies can\'t be recovered, so consider archiving instead if you might need to reference them later.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Instead of deleting outdated policies, change their status to archived or deprecated. This keeps the historical record and helps show how your governance has evolved over time.',
    },
    {
      type: 'heading',
      id: 'faq',
      level: 2,
      text: 'Frequently asked questions',
    },
    {
      type: 'heading',
      id: 'faq-existing',
      level: 3,
      text: 'Can we use our existing corporate policies?',
    },
    {
      type: 'paragraph',
      text: 'Yes. You can paste existing policy content into VerifyWise to centralize your AI governance documentation. Many organizations start by importing what they already have, then use VerifyWise to track status, schedule reviews and keep everything in one place.',
    },
    {
      type: 'heading',
      id: 'faq-corporate-vs-ai',
      level: 3,
      text: 'How do AI policies relate to general corporate policies?',
    },
    {
      type: 'paragraph',
      text: 'AI policies should complement your existing corporate policies, not replace them. Your general data protection, information security and ethics policies still apply. AI-specific policies cover things like model transparency, algorithmic fairness and automated decision-making. Reference your corporate policies where they apply and focus AI policies on what\'s actually different about AI.',
    },
    {
      type: 'heading',
      id: 'faq-how-many',
      level: 3,
      text: 'How many policies do we need?',
    },
    {
      type: 'paragraph',
      text: 'Start with the policies your regulatory environment requires and add others based on your risk assessment. Most organizations need at least an AI ethics policy, a model development policy and a data governance policy for AI. Use the templates as a guide for what to cover, but don\'t create policies just to check a box. Each one should address a real governance need.',
    },
    {
      type: 'heading',
      id: 'faq-who-writes',
      level: 3,
      text: 'Who should write AI policies?',
    },
    {
      type: 'paragraph',
      text: 'Policy development typically involves technical teams who understand the AI systems, legal and compliance teams who know the regulatory requirements and business stakeholders who understand operational needs. Assign a policy owner to draft and maintain each policy, with input from relevant subject matter experts.',
    },
    {
      type: 'heading',
      id: 'faq-review-frequency',
      level: 3,
      text: 'How often should policies be reviewed?',
    },
    {
      type: 'paragraph',
      text: 'At least annually, or more often for fast-moving areas. AI regulations and best practices are still evolving, so your policies may need updates more often than traditional corporate ones. Set review dates when you publish a policy and use VerifyWise to track when reviews are due.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'policies',
          articleId: 'policy-versioning',
          title: 'Policy lifecycle',
          description: 'Understand the policy status workflow',
        },
        {
          collectionId: 'policies',
          articleId: 'policy-approval',
          title: 'Policy templates',
          description: 'Use pre-built templates for common policies',
        },
      ],
    },
  ],
};
