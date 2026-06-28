import type { ArticleContent } from '../../contentTypes';

export const regulationsTrackerBrowseContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Browsing the catalogue',
    },
    {
      type: 'paragraph',
      text: 'The Browse tab lists every country and jurisdiction in the Regulations Tracker catalogue. Each row shows the country flag, its name, and its region. Use Browse to find the jurisdictions that matter to your organization and start tracking them, so you are notified when their AI regulations change.',
    },
    {
      type: 'paragraph',
      text: 'The catalogue is paginated at 24 countries per page. Select any row to open that country and read its full regulation detail, timeline, and change history.',
    },
    {
      type: 'heading',
      id: 'search-filter',
      level: 2,
      text: 'Searching and filtering',
    },
    {
      type: 'bullet-list',
      items: [
        {
          bold: 'Search',
          text: 'Type a country or jurisdiction name in the search box. Results update shortly after you stop typing.',
        },
        {
          bold: 'Region filter',
          text: 'Narrow the list to a single region. The region dropdown always shows every region, regardless of the current search.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'tracking',
      level: 2,
      text: 'Tracking a country',
    },
    {
      type: 'paragraph',
      text: 'Each row has a Track button. Select Track to follow that country; the button then reads Untrack, and the row shows a green check to confirm it is tracked. Tracked countries appear on the Tracked tab and trigger notifications when their regulations change.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Administrators and editors can track and untrack countries. Other roles see the catalogue as read-only. The Settings tab is restricted to administrators.',
    },
    {
      type: 'heading',
      id: 'bulk-track',
      level: 2,
      text: 'Tracking several countries at once',
    },
    {
      type: 'ordered-list',
      items: [
        {
          text: 'Select the checkbox on each untracked country you want to follow. Already-tracked countries cannot be selected.',
        },
        {
          text: 'Use the select-all checkbox above the list to select every untracked country on the current page.',
        },
        {
          text: 'Select Track selected to track them all in one action. The button shows how many countries are selected.',
        },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'Your selection clears when you change the search, region, or page, so bulk-track one page at a time.',
    },
    {
      type: 'article-links',
      title: 'Next steps',
      items: [
        {
          collectionId: 'regulations-tracker',
          articleId: 'tracked',
          title: 'Managing tracked countries',
          description: 'Review the countries you follow and remove ones you no longer need.',
        },
        {
          collectionId: 'regulations-tracker',
          articleId: 'settings',
          title: 'Settings and notifications',
          description: 'Choose who gets notified and turn on impact analysis.',
        },
      ],
    },
  ],
};
