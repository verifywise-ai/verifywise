import type { ArticleContent } from '../../contentTypes';

export const insightsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Insights page summarizes the Shadow AI data your log sources have sent: which AI tools were detected, who used them, which departments they belong to and how the tools score on risk.',
    },
    {
      type: 'heading',
      id: 'summary-cards',
      level: 2,
      text: 'Summary cards',
    },
    {
      type: 'paragraph',
      text: 'Four cards sit at the top of the page. Click a card to open the page behind it.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Unique apps', text: 'Number of AI tools on the AI tools page. This counts every detected tool you have not deleted, whatever period is selected.' },
        { bold: 'AI users', text: 'Distinct user emails with AI tool traffic in the selected period' },
        { bold: 'Highest risk tool', text: 'The tool with the highest current risk score. Like Unique apps, it ignores the period. A newly detected tool has no score until the next nightly run.' },
        { bold: 'Most active department', text: 'The department with the most AI tool events in the selected period. Events that arrive without a department are left out.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'User, department and event counts include only traffic that matched an AI tool when it was ingested. Your proxy may send other web traffic too. It is stored but does not count as AI usage, so someone who only visited other sites is not an AI user.',
    },
    {
      type: 'heading',
      id: 'risk-rankings',
      level: 2,
      text: 'Accessed tools with highest risk',
    },
    {
      type: 'paragraph',
      text: 'This panel lists the five AI tools with the highest risk scores. Tools that have no score yet come last and show 0. It also shows the number of events recorded for each tool since it was first detected. The event total is not limited to the selected period. Click "Go to AI tools" to see the full tool list.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Risk scores run from 0 to 100 and are recalculated every night. Four factors feed the score: approval status (40%), the tool\'s data policy attributes such as training on user data, SOC 2, GDPR, SSO and encryption at rest (25%), the tool\'s event count compared with the average across your tools (15%) and the most sensitive department that used it in the last 30 days (20%). The approval factor drops to zero only when the tool is approved and linked to a model inventory entry.',
    },
    {
      type: 'heading',
      id: 'department-chart',
      level: 2,
      text: 'AI users by department',
    },
    {
      type: 'paragraph',
      text: 'A pie chart of distinct AI users per department in the selected period. The department is the value your log source sends with each event. Users whose events carry no department are grouped under "Unknown".',
    },
    {
      type: 'heading',
      id: 'bar-charts',
      level: 2,
      text: 'Top tools by events and users',
    },
    {
      type: 'paragraph',
      text: 'Two bar charts on the right show up to six tools each for the selected period:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Most accessed tools by events', text: 'Tools ranked by the number of events matched to them' },
        { bold: 'Most accessed tools by users', text: 'Tools ranked by the number of distinct users who accessed them' },
      ],
    },
    {
      type: 'heading',
      id: 'time-period',
      level: 2,
      text: 'Filtering by time period',
    },
    {
      type: 'paragraph',
      text: 'Use the period selector in the top-right corner to choose last 7 days, last 30 days (the default) or last 90 days. It changes the AI users and Most active department cards, the department chart and both bar charts. Unique apps, Highest risk tool and the risk panel do not depend on the period.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'shadow-ai',
          articleId: 'ai-tools',
          title: 'AI tools',
          description: 'View and manage detected AI tools',
        },
        {
          collectionId: 'shadow-ai',
          articleId: 'user-activity',
          title: 'User activity',
          description: 'Monitor individual user and department AI usage',
        },
        {
          collectionId: 'shadow-ai',
          articleId: 'settings',
          title: 'Settings',
          description: 'Learn how the risk score is calculated',
        },
      ],
    },
  ],
};
