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
      text: 'Agent Discovery helps you find and track service accounts, technical users, and system identities across your connected source systems. These "agents" are non-human identities that interact with your AI systems, and knowing what they are and what they can access is a basic governance requirement.',
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
        { text: 'Click **Refresh** to trigger a sync with your connected source systems.' },
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
        { text: 'Enter the agent\'s name, type, and permissions.' },
        { text: 'Manually added agents are marked as such so you can distinguish them from auto-discovered ones.' },
      ],
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
      text: 'Click any agent row to open its details, where you can see the full permission set, source system, and last activity timestamp. From there you can update the review status.',
    },
    {
      type: 'heading',
      id: 'filtering',
      level: 2,
      text: 'Searching and filtering',
    },
    {
      type: 'paragraph',
      text: 'The table supports filtering by name, source system, agent type, review status, and staleness. Stale agents are those that haven\'t been active recently, which may indicate they should be decommissioned.',
    },
    {
      type: 'heading',
      id: 'model-linking',
      level: 2,
      text: 'Linking agents to models',
    },
    {
      type: 'paragraph',
      text: 'You can link an agent to a model from the model inventory. This creates a traceable connection between the non-human identity and the AI system it interacts with, which is useful for risk assessments and access reviews.',
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
        { action: 'View agents', roles: 'Any authenticated user' },
        { action: 'Add, edit, or review agents', roles: 'Admin or Editor' },
        { action: 'Trigger sync/refresh', roles: 'Admin' },
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
