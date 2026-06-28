import type { ArticleContent } from '../../contentTypes';

export const regulationsTrackerFrameworksContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'International frameworks',
    },
    {
      type: 'paragraph',
      text: 'The Frameworks tab lists cross-border AI governance frameworks and principles, such as those from international and multilateral bodies. These complement national regulations rather than replacing them. Use this tab to understand the broader principles that shape AI governance worldwide.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Looking for the EU AI Act?',
      text: 'Country and regional laws, including the EU AI Act, are not on this tab. They live under each country. Find them on the Browse tab.',
    },
    {
      type: 'heading',
      id: 'card-detail',
      level: 2,
      text: 'What each framework shows',
    },
    {
      type: 'paragraph',
      text: 'Frameworks are shown as cards. Each card includes, where available:',
    },
    {
      type: 'bullet-list',
      items: [
        {
          bold: 'Name and status',
          text: 'The framework name and its current status.',
        },
        {
          bold: 'Adopted by',
          text: 'The bodies or countries that have adopted it.',
        },
        {
          bold: 'Why it matters',
          text: 'A short explanation of the framework’s purpose and relevance.',
        },
        {
          bold: 'Key principles',
          text: 'The main principles the framework sets out.',
        },
        {
          bold: 'Named documents',
          text: 'The specific documents or instruments associated with the framework.',
        },
        {
          bold: 'View source',
          text: 'A link to the official reference, opening in a new tab.',
        },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Frameworks are read-only and reflect the public Global AI Regulations feed. If the live feed is temporarily unavailable, the page shows the last known frameworks.',
    },
  ],
};
