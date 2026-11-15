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
      text: 'The AI tools page lists every AI tool found in the proxy and firewall logs your organization sends to VerifyWise. A tool appears here the first time a log line matches a known AI tool. From here you can review each tool\'s risk score, set its status, add it to the model inventory or promote it to an AI app.',
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
      text: 'The list opens with the highest risk scores first; tools that have no score yet come last. Use the status filter to show tools with one status. Clicking a column header sorts the rows on the current page, and your choice is remembered.',
    },
    {
      type: 'heading',
      id: 'statuses',
      level: 2,
      text: 'Tool statuses',
    },
    {
      type: 'paragraph',
      text: 'Each tool has one of these statuses. A status records your assessment; VerifyWise does not block or allow traffic itself, so enforce decisions in your proxy or firewall. Two statuses change behavior in VerifyWise: Approved lowers the risk score once the tool is also in the model inventory, and Blocked makes "Blocked tool attempt" rules fire.',
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
          description: 'Allowed with conditions, such as specific departments only. The conditions are not enforced by VerifyWise.',
        },
      ],
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Blocked', text: 'Prohibited from use. When your proxy reports a blocked request to this tool, a "Blocked tool attempt" rule can send an alert.' },
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
        { text: 'A "Start governance" button, or a "Governed" badge once the tool is in the model inventory' },
        { text: 'A "Promote to AI app" button' },
        { text: 'Departments that used the tool, with a user count for each' },
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
      text: 'If a tool is not yet in the model inventory, a "Start governance" button appears in the detail view. It opens a form with the provider and model name filled in from the tool. Choose a governance owner (required) and, optionally, a version. Submitting creates a model inventory entry with the status Pending, links the tool to it and sets the tool\'s status to Under review. If you also pick a data sensitivity or write a risk description, a risk named "Use of <tool name>" is added to the new model\'s risks. Its level follows the data sensitivity (Medium if you only wrote a description), the governance owner owns it, and it is due in 90 days. Tick "Automatically create a lifecycle entry" to also start the model lifecycle checklist for the new entry.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Bring high-risk tools under governance early. A tool linked to a model inventory entry shows a "Governed" badge. Once the tool is linked to an entry and its status here is Approved, the approval part of its risk score drops to zero at the next nightly run. The model inventory entry\'s own status is not part of the score.',
    },
    {
      type: 'heading',
      id: 'promote-to-ai-app',
      level: 2,
      text: 'Promoting to an AI app',
    },
    {
      type: 'paragraph',
      text: 'Click "Promote to AI app" in the detail view to add the tool to the AI apps inventory. The new AI app takes the tool\'s name, starts as a draft and notes the vendor in its description. Each tool can be promoted once; a second attempt shows an error.',
    },
    {
      type: 'heading',
      id: 'risk-score',
      level: 2,
      text: 'Risk score',
    },
    {
      type: 'paragraph',
      text: 'The risk score is a composite metric from 0 to 100, recalculated every night. A newly detected tool has no score until the next run. It uses a weighted formula:',
    },
    {
      type: 'table',
      columns: [
        { key: 'factor', label: 'Factor', width: '30%' },
        { key: 'weight', label: 'Weight', width: '15%' },
        { key: 'description', label: 'Description', width: '55%' },
      ],
      rows: [
        { factor: 'Approval status', weight: '40%', description: 'Zero only when the tool is linked to a model inventory entry and its status is Approved; otherwise the maximum.' },
        { factor: 'Data & compliance', weight: '25%', description: 'Based on training-on-data policy, SOC 2, GDPR, SSO and encryption at rest.' },
        { factor: 'Usage volume', weight: '15%', description: 'The tool\'s event count compared with the average across your tools. Higher usage increases the score.' },
        { factor: 'Department sensitivity', weight: '20%', description: 'The most sensitive department that used the tool in the last 30 days. Finance, Legal and HR (80) are rated highest, then Engineering and Product (50), any other department (30), and Marketing and Sales (20). Names are matched exactly, ignoring case, so "Finance & Accounting" counts as another department.' },
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
