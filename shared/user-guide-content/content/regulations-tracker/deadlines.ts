import type { ArticleContent } from '../../contentTypes';

export const regulationsTrackerDeadlinesContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Effective-date deadlines',
    },
    {
      type: 'paragraph',
      text: 'The Deadlines tab lists upcoming effective dates for AI regulations, soonest first, plus regulations whose effective date is not yet scheduled. Use it to plan ahead for the milestones that affect your organization.',
    },
    {
      type: 'heading',
      id: 'next-12-months',
      level: 2,
      text: 'The next 12 months',
    },
    {
      type: 'paragraph',
      text: 'At the top of the page, a row calendar lays out the coming year as twelve month columns, starting from the current month. Each upcoming deadline appears as a marker in the month it takes effect, so you can see at a glance where the busy periods fall. The nearest months are shaded to highlight what is coming soonest.',
    },
    {
      type: 'paragraph',
      text: 'Hover a marker to see the regulation, date, and country. Select a marker to jump straight to that deadline in the list below.',
    },
    {
      type: 'heading',
      id: 'scheduled',
      level: 2,
      text: 'Scheduled deadlines',
    },
    {
      type: 'paragraph',
      text: 'The Scheduled list shows each upcoming milestone with its effective date, status, country flag and name, and the regulation name. When the source provides one, a View source link opens the official reference in a new tab.',
    },
    {
      type: 'heading',
      id: 'not-scheduled',
      level: 2,
      text: 'Not yet scheduled',
    },
    {
      type: 'paragraph',
      text: 'Regulations that have been announced but have no confirmed effective date appear under Not yet scheduled. These show the country, status, and regulation name, with the date marked as to be determined.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Deadlines are read-only and reflect the public Global AI Regulations feed. If the live feed is temporarily unavailable, the page shows the last known deadlines.',
    },
  ],
};
