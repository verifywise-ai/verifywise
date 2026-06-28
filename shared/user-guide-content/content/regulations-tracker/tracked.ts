import type { ArticleContent } from '../../contentTypes';

export const regulationsTrackerTrackedContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Your tracked countries',
    },
    {
      type: 'paragraph',
      text: 'The Tracked tab lists the countries and jurisdictions your organization is following. You are notified when any of these countries changes its AI regulations. Add countries to this list from the Browse tab.',
    },
    {
      type: 'heading',
      id: 'row-detail',
      level: 2,
      text: 'What each row shows',
    },
    {
      type: 'paragraph',
      text: 'Each row shows the country flag, name, and region, along with a summary line beneath the name:',
    },
    {
      type: 'bullet-list',
      items: [
        {
          bold: 'Regulations',
          text: 'How many regulations are recorded for that country.',
        },
        {
          bold: 'Last changed',
          text: 'When that country last had a regulation change, when this date is available.',
        },
        {
          bold: 'Tracked since',
          text: 'When your organization started tracking the country.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'Select any row to open the full country detail page.',
    },
    {
      type: 'heading',
      id: 'organize',
      level: 2,
      text: 'Filtering and sorting',
    },
    {
      type: 'bullet-list',
      items: [
        {
          bold: 'Region filter',
          text: 'Show only the tracked countries in a chosen region. Each region option includes a count.',
        },
        {
          bold: 'Sort',
          text: 'Order the list by name (A to Z or Z to A) or by region. The list is sorted by name A to Z by default.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'The list shows 12 countries per page by default, and you can switch to 24 or 48 per page.',
    },
    {
      type: 'heading',
      id: 'untrack',
      level: 2,
      text: 'Removing a country',
    },
    {
      type: 'paragraph',
      text: 'Select Untrack on any row to stop following that country. You will no longer receive notifications about its regulation changes. You can track it again at any time from the Browse tab.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'If you are not tracking any countries yet, this tab is empty. Open the Browse tab to find and track countries.',
    },
  ],
};
