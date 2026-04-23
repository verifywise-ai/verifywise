import type { ArticleContent } from '../../contentTypes';

export const aiToolsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The AI tools page is your central inventory of all AI applications detected in your organization\'s network traffic. From here you can review each tool\'s risk profile, change its status and bring it under formal governance through the model inventory.',
    },
    {
      type: 'heading',
      id: 'tool-list',
      level: 2,
      text: 'Tool list',
    },
    {
      type: 'paragraph',
      text: 'The main table shows all detected tools with the following columns:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Tool', text: 'Name and vendor icon of the detected AI application' },
        { bold: 'Status', text: 'Current status assigned to the tool (see below)' },
        { bold: 'Users', text: 'Number of unique users who have accessed this tool' },
        { bold: 'Events', text: 'Total network events recorded for this tool' },
        { bold: 'Risk score', text: 'Composite score from 0 to 100 (hover for formula details)' },
        { bold: 'Last seen', text: 'Date of the most recent network event for this tool' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click any column header to sort the table. Use the status filter dropdown to narrow the list to a specific status.',
    },
    {
      type: 'heading',
      id: 'statuses',
      level: 2,
      text: 'Tool statuses',
    },
    {
      type: 'paragraph',
      text: 'Each tool can be assigned one of these statuses to reflect your organization\'s assessment:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Radar',
          title: 'Detected',
          description: 'Newly discovered tool, not yet reviewed.',
        },
        {
          icon: 'Search',
          title: 'Under review',
          description: 'Currently being evaluated for compliance and risk.',
        },
        {
          icon: 'CheckCircle',
          title: 'Approved',
          description: 'Reviewed and approved for organizational use.',
        },
        {
          icon: 'AlertTriangle',
          title: 'Restricted',
          description: 'Allowed with conditions (e.g., specific departments only).',
        },
      ],
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Blocked', text: 'Prohibited from use. Access attempts can trigger alerts if a "Blocked tool attempt" rule is configured.' },
        { bold: 'Dismissed', text: 'Reviewed but deemed irrelevant (e.g., false positive).' },
      ],
    },
    {
      type: 'heading',
      id: 'tool-detail',
      level: 2,
      text: 'Tool detail view',
    },
    {
      type: 'paragraph',
      text: 'Click any tool row to open the detail view, which shows:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Vendor, total users, total events, risk score, first detected and last seen dates' },
        { text: 'A status selector to change the tool\'s status' },
        { text: 'Department breakdown showing which teams are using the tool' },
        { text: 'Top users ranked by event count' },
      ],
    },
    {
      type: 'heading',
      id: 'start-governance',
      level: 2,
      text: 'Starting governance',
    },
    {
      type: 'paragraph',
      text: 'If a detected tool has not yet been added to the model inventory, a "Start governance" button appears in the detail view. Clicking it opens a wizard that creates a new model inventory entry pre-filled with the tool\'s provider, name and version.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Bring high-risk tools under governance early. Once a tool is linked to a model inventory entry, it shows a "Governed" badge and inherits the full lifecycle tracking available in the AI governance module.',
    },
    {
      type: 'heading',
      id: 'risk-score',
      level: 2,
      text: 'Risk score',
    },
    {
      type: 'paragraph',
      text: 'The risk score is a composite metric from 0 to 100 that gets recalculated nightly. It uses a weighted formula:',
    },
    {
      type: 'table',
      columns: [
        { key: 'factor', label: 'Factor', width: '30%' },
        { key: 'weight', label: 'Weight', width: '15%' },
        { key: 'description', label: 'Description', width: '55%' },
      ],
      rows: [
        { factor: 'Approval status', weight: '40%', description: 'Tools not in the model inventory or not approved receive the maximum score.' },
        { factor: 'Data & compliance', weight: '25%', description: 'Based on training-on-data policy, SOC 2, GDPR, SSO and encryption at rest.' },
        { factor: 'Usage volume', weight: '15%', description: 'Normalized against the organization average. Higher usage increases the score.' },
        { factor: 'Department sensitivity', weight: '20%', description: 'Uses the highest sensitivity among accessing departments. Finance, Legal and HR are rated highest.' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'shadow-ai',
          articleId: 'rules',
          title: 'Rules',
          description: 'Set up alerts for risk score thresholds',
        },
        {
          collectionId: 'shadow-ai',
          articleId: 'user-activity',
          title: 'User activity',
          description: 'See who is using each tool',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'model-inventory',
          title: 'Model inventory',
          description: 'Manage governed AI models',
        },
      ],
    },
  ],
};
