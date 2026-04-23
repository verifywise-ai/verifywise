import type { ArticleContent } from '../../contentTypes';

export const playgroundContent: ArticleContent = {
  blocks: [
    {
      type: 'callout',
      variant: 'warning',
      text: 'The playground is listed in the sidebar but not yet available. This page will be enabled in a future release.',
    },
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'What the playground will do',
    },
    {
      type: 'paragraph',
      text: 'The playground will be a chat interface for talking to any model your organization has configured. You\'ll be able to test prompts, compare model responses and verify API key connectivity without setting up a formal experiment.',
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
        { text: 'Pick a provider and model from a dropdown, then chat in real time' },
        { text: 'Multi-turn conversations with full history sent on each request' },
        { text: 'Switch models mid-session (clears conversation)' },
        { text: 'No project selection required, available from the sidebar at any time' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'You\'ll need at least one API key configured in **Settings** before the playground can connect to a model.',
    },
  ],
};
