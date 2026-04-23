import type { ArticleContent } from '../../contentTypes';

export const leaderboardContent: ArticleContent = {
  blocks: [
    {
      type: 'callout',
      variant: 'warning',
      text: 'The leaderboard is listed in the sidebar but not yet available. This page will be enabled in a future release.',
    },
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'What the leaderboard will do',
    },
    {
      type: 'paragraph',
      text: 'The leaderboard will rank models based on their performance in arena comparisons. Every time you run a head-to-head battle in the Arena, results will feed into a ranking table so you can see which models perform best over time.',
    },
    {
      type: 'heading',
      id: 'planned-features',
      level: 2,
      text: 'Planned features',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Organization-wide rankings from all arena comparisons' },
        { text: 'Win rate, total comparisons and average scores per model' },
        { text: 'Performance tracking as you add more arena battles over time' },
        { text: 'Data you can reference in compliance documentation to justify model selection' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'Once available, run arena comparisons across different prompt types to get a complete picture. A model that handles coding well might not rank the same on creative tasks.',
    },
  ],
};
