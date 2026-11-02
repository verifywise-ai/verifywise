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
      text: 'The User activity page shows which people and departments used AI tools. It has two tabs, Users and Departments. Each tab label shows how many rows it holds.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Only traffic that matched an AI tool when it was ingested counts here. A user appears only if some of their traffic matched an AI tool. A prompt is a POST request to an AI tool.',
    },
    {
      type: 'heading',
      id: 'users-tab',
      level: 2,
      text: 'Users tab',
    },
    {
      type: 'paragraph',
      text: 'The default view lists users with AI tool activity in the last 30 days, 20 per page, ordered by total prompts. The table includes:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'User', text: 'The user\'s email address. Click the row to open the detail view.' },
        { bold: 'Department', text: 'A department sent with the user\'s events by your log source, or "Unknown" if none was sent. If the user\'s events carry more than one department, the list shows the alphabetically last one, while the detail view shows the most recent' },
        { bold: 'Total prompts', text: 'POST requests the user sent to AI tools' },
        { bold: 'Risk score', text: 'The highest risk score among the AI tools the user accessed. A tool that has not been scored yet counts as 0.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click a column header to sort the users on the current page. Your sort choice is remembered the next time you open the page.',
    },
    {
      type: 'heading',
      id: 'user-detail',
      level: 3,
      text: 'User detail view',
    },
    {
      type: 'paragraph',
      text: 'Clicking a user row opens a detail view for the period chosen in the period selector. It shows:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Email address' },
        { text: 'Department, taken from the user\'s most recent AI tool event' },
        { text: 'Total prompts in the selected period' },
        { text: 'A tools used table with the event count, prompt count and last used date for each tool' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Use the back arrow to return to the users list.',
    },
    {
      type: 'heading',
      id: 'departments-tab',
      level: 2,
      text: 'Departments tab',
    },
    {
      type: 'paragraph',
      text: 'The Departments tab groups the last 30 days of AI tool activity by department, 10 per page. Users whose events carry no department are grouped under "Unknown". The table includes:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Department', text: 'Name of the department as sent by your log source' },
        { bold: 'Users', text: 'Number of distinct users in this department who accessed AI tools' },
        { bold: 'Total prompts', text: 'POST requests sent to AI tools by everyone in the department' },
        { bold: 'Top tool', text: 'The AI tool with the most events from this department' },
        { bold: 'Risk score', text: 'The highest risk score among the AI tools the department accessed' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click a column header to sort the departments. Department rows do not open a detail view.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Look for departments with a high risk score or a top tool that is not approved. Open that tool on the AI tools page to review it, or add a sensitive department rule to get alerted when that department uses AI tools.',
    },
    {
      type: 'heading',
      id: 'filtering',
      level: 2,
      text: 'Time period',
    },
    {
      type: 'paragraph',
      text: 'The period selector offers last 7 days, last 30 days and last 90 days. It sets the window for the user detail view. The Users and Departments tables, and the counts on their tabs, always cover the last 30 days.',
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
          description: 'See organization-wide AI usage at a glance',
        },
      ],
    },
  ],
};
