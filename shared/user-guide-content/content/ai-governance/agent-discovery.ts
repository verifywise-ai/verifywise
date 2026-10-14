import type { ArticleContent } from '../../contentTypes';

export const agentDiscoveryContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The **AI agents** page (under Inventory in the sidebar) helps you find and track service accounts, technical users and system identities across your connected source systems. These "agents" are non-human identities that interact with your AI systems. Knowing what they are, who is accountable for them and what they can access is a basic governance requirement.',
    },
    {
      type: 'heading',
      id: 'what-are-agents',
      level: 2,
      text: 'What counts as an agent',
    },
    {
      type: 'paragraph',
      text: 'In this context, an agent is any non-human identity that interacts with your systems. Examples:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Service accounts used by automation pipelines' },
        { text: 'API keys or technical users from external integrations' },
        { text: 'Bot accounts or scheduled job runners' },
        { text: 'System identities with elevated permissions' },
      ],
    },
    {
      type: 'heading',
      id: 'discovery',
      level: 2,
      text: 'Discovering agents',
    },
    {
      type: 'paragraph',
      text: 'There are two ways agents get into the inventory:',
    },
    {
      type: 'heading',
      id: 'auto-discovery',
      level: 3,
      text: 'Automatic discovery',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Sync now** to trigger a sync with your connected source systems.' },
        { text: 'The system queries each source and imports any new agents it finds.' },
        { text: 'New agents appear with a status of "Unreviewed" so you can review them before they are confirmed.' },
      ],
    },
    {
      type: 'heading',
      id: 'manual-add',
      level: 3,
      text: 'Manual registration',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Add agent**.' },
        { text: 'Enter the agent\'s name, type, owners and notes.' },
        { text: 'Manually added agents are marked as such so you can distinguish them from auto-discovered ones.' },
      ],
    },
    {
      type: 'heading',
      id: 'owners',
      level: 2,
      text: 'Owners',
    },
    {
      type: 'paragraph',
      text: 'A manually added agent can have several owners, so more than one person can be accountable for it. Pick them from your organization\'s users in the **Owners** field. The first owner is the primary owner. If an owner\'s user account is deleted, they are removed from the agent\'s owners and the next owner becomes the primary.',
    },
    {
      type: 'paragraph',
      text: 'An auto-discovered agent shows the owner reported by its source system, such as an email address. That owner is not a VerifyWise user and cannot be changed in VerifyWise.',
    },
    {
      type: 'heading',
      id: 'reviewing',
      level: 2,
      text: 'Reviewing agents',
    },
    {
      type: 'paragraph',
      text: 'Each discovered agent needs to be reviewed. The review status tells your team whether the agent has been vetted:',
    },
    {
      type: 'table',
      columns: [
        { key: 'status', label: 'Status', width: '25%' },
        { key: 'meaning', label: 'Meaning', width: '75%' },
      ],
      rows: [
        { status: 'Unreviewed', meaning: 'Agent was discovered but nobody has looked at it yet' },
        { status: 'Confirmed', meaning: 'Agent was reviewed and approved for continued operation' },
        { status: 'Rejected', meaning: 'Agent was reviewed and flagged as unauthorized or unnecessary' },
      ],
    },
    {
      type: 'paragraph',
      text: 'To review an agent, open the row\'s action menu and choose **Review**, or click **Review** on the agent\'s detail page. The review panel shows the agent\'s details, where you can confirm or reject it and link it to a model.',
    },
    {
      type: 'heading',
      id: 'detail-page',
      level: 2,
      text: 'Agent detail page',
    },
    {
      type: 'paragraph',
      text: 'Click any agent row to open its detail page. It has three sections:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: '**Lifecycle**: the stages the agent has been through (added, under review, then confirmed or rejected, then active), with who was in charge of each and when it happened. An agent with no activity for 30 days or more is flagged as stale.' },
        { text: '**Ownership & capabilities**: the accountable owners, type, source, linked model, access categories and permissions.' },
        { text: '**Activity**: the governance actions taken on the agent, such as review status changes, model links and edits, with who made each change and when.' },
      ],
    },
    {
      type: 'heading',
      id: 'row-actions',
      level: 2,
      text: 'Row actions',
    },
    {
      type: 'paragraph',
      text: 'Each row\'s action menu offers:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: '**Review**: opens the review panel. Available to everyone; only Admins can change the review status or the linked model.' },
        { text: '**Edit**: changes the name, type, owners and notes. Only for manually added agents, because auto-discovered agents come from their source system. Admin only.' },
        { text: '**Delete**: removes the agent and its data. This cannot be undone. Admin only.' },
      ],
    },
    {
      type: 'heading',
      id: 'filtering',
      level: 2,
      text: 'Searching and filtering',
    },
    {
      type: 'paragraph',
      text: 'The table supports searching by name and filtering by review status, source system, agent type and staleness. Stale agents are those with no activity for 30 days or more, which may indicate they should be decommissioned.',
    },
    {
      type: 'heading',
      id: 'model-linking',
      level: 2,
      text: 'Linking agents to models',
    },
    {
      type: 'paragraph',
      text: 'From the review panel, you can link an agent to a model from the model inventory. This creates a traceable connection between the non-human identity and the AI system it interacts with, which is useful for risk assessments and access reviews.',
    },
    {
      type: 'heading',
      id: 'roles',
      level: 2,
      text: 'Who can do what',
    },
    {
      type: 'table',
      columns: [
        { key: 'action', label: 'Action', width: '50%' },
        { key: 'roles', label: 'Required role', width: '50%' },
      ],
      rows: [
        { action: 'View agents, their detail pages and activity', roles: 'Any authenticated user' },
        { action: 'Add or edit agents', roles: 'Admin' },
        { action: 'Sync now', roles: 'Admin' },
        { action: 'Review agents and link them to models', roles: 'Admin' },
        { action: 'Delete agents', roles: 'Admin' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'model-inventory',
          title: 'Managing model inventory',
          description: 'Link discovered agents to the models they interact with.',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'Assess risks related to non-human identities accessing AI systems.',
        },
      ],
    },
  ],
};
