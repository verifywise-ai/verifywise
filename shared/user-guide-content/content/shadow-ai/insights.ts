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
      text: 'The Insights dashboard gives you a high-level view of Shadow AI activity across your organization. It surfaces key metrics, risk rankings and usage trends so you can quickly understand the scope and risk profile of unauthorized AI tool usage.',
    },
    {
      type: 'heading',
      id: 'summary-cards',
      level: 2,
      text: 'Summary cards',
    },
    {
      type: 'paragraph',
      text: 'The top of the page displays four summary cards that update based on the selected time period:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Unique apps', text: 'Number of distinct AI tools detected in network traffic' },
        { bold: 'AI users', text: 'Total number of unique users who accessed AI tools' },
        { bold: 'Highest risk tool', text: 'The AI tool with the highest calculated risk score' },
        { bold: 'Most active department', text: 'The department with the most AI tool usage' },
      ],
    },
    {
      type: 'heading',
      id: 'risk-rankings',
      level: 2,
      text: 'Accessed tools with highest risk',
    },
    {
      type: 'paragraph',
      text: 'This panel lists the top 5 AI tools sorted by their risk score. Each entry shows the tool name, its numeric risk score and the total number of network events recorded. Click "Go to AI tools" to view the full tool inventory.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Risk scores range from 0 to 100 and are recalculated nightly. They factor in approval status (40%), data and compliance policies (25%), usage volume (15%) and department sensitivity (20%).',
    },
    {
      type: 'heading',
      id: 'department-chart',
      level: 2,
      text: 'AI users by department',
    },
    {
      type: 'paragraph',
      text: 'A pie chart showing how AI tool usage is distributed across departments. This helps identify which parts of the organization are most actively using AI tools and may need additional oversight or training.',
    },
    {
      type: 'heading',
      id: 'bar-charts',
      level: 2,
      text: 'Top tools by events and users',
    },
    {
      type: 'paragraph',
      text: 'Two horizontal bar charts on the right side of the dashboard show:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Most accessed tools by events', text: 'Tools ranked by total number of network events (API calls, page visits)' },
        { bold: 'Most accessed tools by users', text: 'Tools ranked by number of distinct users who accessed them' },
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
      text: 'Use the period selector in the top-right corner to adjust the time window for all dashboard data. Available options are last 7 days, last 30 days and last 90 days.',
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
