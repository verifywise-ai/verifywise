import type { ArticleContent } from '../../contentTypes';

export const regulationsTrackerHorizonContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'The horizon changelog',
    },
    {
      type: 'paragraph',
      text: 'The Horizon tab is a dated changelog of AI-regulation changes across jurisdictions, with the most recent change first. Use it to see what has changed recently worldwide, not only in the countries you track.',
    },
    {
      type: 'heading',
      id: 'entry-detail',
      level: 2,
      text: 'What each entry shows',
    },
    {
      type: 'bullet-list',
      items: [
        {
          bold: 'Country',
          text: 'The flag and name of the jurisdiction the change applies to.',
        },
        {
          bold: 'Type',
          text: 'A label describing the kind of change, when the source provides one.',
        },
        {
          bold: 'Date',
          text: 'When the change occurred.',
        },
        {
          bold: 'Description',
          text: 'A short summary of the change, with additional detail beneath it when available.',
        },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Horizon is read-only. It reflects the public Global AI Regulations feed and is not filtered to your tracked countries.',
    },
    {
      type: 'paragraph',
      text: 'If the live feed is temporarily unavailable, the page shows the last known changelog and tells you the data may not be current.',
    },
  ],
};
