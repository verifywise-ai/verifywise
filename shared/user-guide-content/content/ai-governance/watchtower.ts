import type { ArticleContent } from '../../contentTypes';

export const watchtowerContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Event Tracker gives you a live window into VerifyWise. It records every user action and system event, then lets you look at the raw logs for troubleshooting. Use it to see who did what, spot patterns and keep things running smoothly.',
    },
    {
      type: 'paragraph',
      text: 'Whether you\'re auditing recent activity or debugging an issue, Event Tracker shows you what\'s happening in your governance platform.',
    },
    {
      type: 'heading',
      id: 'accessing-event-tracker',
      level: 2,
      text: 'Accessing Event Tracker',
    },
    {
      type: 'paragraph',
      text: 'Navigate to **Event Tracker** from the main sidebar. The page is organized into two tabs: Events and Logs.',
    },
    {
      type: 'heading',
      id: 'events-tab',
      level: 2,
      text: 'Events tab',
    },
    {
      type: 'paragraph',
      text: 'The Events tab displays a table of user actions and system events. Each row shows:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Event type', text: 'The category of action that occurred' },
        { bold: 'User', text: 'Who performed the action' },
        { bold: 'Timestamp', text: 'When the event happened' },
        { bold: 'Details', text: 'Additional context about the event' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The table is paginated, so you can browse through your event history without performance issues.',
    },
    {
      type: 'heading',
      id: 'logs-tab',
      level: 2,
      text: 'Logs tab',
    },
    {
      type: 'paragraph',
      text: 'The Logs tab provides access to raw application logs. This is useful for technical troubleshooting when you need to see exactly what happened at the system level.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Line numbers', text: 'Each log entry is numbered for easy reference' },
        { bold: 'Recent first', text: 'Logs are sorted with the most recent entries at the top' },
        { bold: 'Refresh', text: 'Click the refresh button to fetch the latest logs' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'Use the Logs tab when investigating issues or verifying that system processes completed successfully.',
    },
    {
      type: 'heading',
      id: 'use-cases',
      level: 2,
      text: 'Common use cases',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Audit trail', text: 'Review who made changes and when for compliance purposes' },
        { bold: 'Troubleshooting', text: 'Investigate unexpected behavior by examining system logs' },
        { bold: 'Activity monitoring', text: 'Keep track of team activity across your governance program' },
        { bold: 'Verification', text: 'Confirm that automated processes ran correctly' },
      ],
    },
  ],
};
