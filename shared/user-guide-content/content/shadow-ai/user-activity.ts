import type { ArticleContent } from '../../contentTypes';

export const userActivityContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The User activity page lets you monitor which individuals and departments are using AI tools across your organization. It has two tab views for different levels of analysis.',
    },
    {
      type: 'heading',
      id: 'users-tab',
      level: 2,
      text: 'Users tab',
    },
    {
      type: 'paragraph',
      text: 'The default view lists individual users who have been detected using AI tools. The table includes:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'User', text: 'The user\'s email address (click to open the detail view)' },
        { bold: 'Department', text: 'The department the user belongs to' },
        { bold: 'Total prompts', text: 'Cumulative number of interactions recorded' },
        { bold: 'Risk score', text: 'Aggregated risk across the tools this user accesses' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click any column header to sort the table. Use the period selector to filter by time window (last 7 days, last 30 days or last 90 days).',
    },
    {
      type: 'heading',
      id: 'user-detail',
      level: 3,
      text: 'User detail view',
    },
    {
      type: 'paragraph',
      text: 'Clicking a user row opens a detail view showing:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Email address and department' },
        { text: 'Total number of prompts' },
        { text: 'A table of all tools the user has accessed, with event counts and last-used dates' },
      ],
    },
    {
      type: 'heading',
      id: 'departments-tab',
      level: 2,
      text: 'Departments tab',
    },
    {
      type: 'paragraph',
      text: 'Switch to the Departments tab to see AI usage aggregated by team. The table includes:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Department', text: 'Name of the department' },
        { bold: 'Users', text: 'Number of unique users in this department who accessed AI tools' },
        { bold: 'Total prompts', text: 'Cumulative interactions across all users in the department' },
        { bold: 'Top tool', text: 'The most frequently used AI tool in this department' },
        { bold: 'Risk score', text: 'Aggregated risk for the department' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Use the departments view to identify teams with high AI usage but low governance coverage. These teams may benefit from targeted training or tool approval workflows.',
    },
    {
      type: 'heading',
      id: 'filtering',
      level: 2,
      text: 'Filtering by time period',
    },
    {
      type: 'paragraph',
      text: 'Both the Users and Departments tabs respect the time period filter. Adjusting the period updates all metrics and counts to reflect only activity within the selected window.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'shadow-ai',
          articleId: 'ai-tools',
          title: 'AI tools',
          description: 'View tool-level detail and manage statuses',
        },
        {
          collectionId: 'shadow-ai',
          articleId: 'rules',
          title: 'Rules',
          description: 'Set up alerts for sensitive department usage',
        },
        {
          collectionId: 'shadow-ai',
          articleId: 'insights',
          title: 'Insights',
          description: 'See organization-wide AI usage trends',
        },
      ],
    },
  ],
};
