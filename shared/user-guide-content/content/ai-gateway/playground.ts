import type { ArticleContent } from '../../contentTypes';

export const playgroundContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Playground is a chat interface for testing your endpoints before sending production traffic through them. Send messages, watch responses stream in, and check that guardrails catch what they should.',
    },
    {
      type: 'heading',
      id: 'using-playground',
      level: 2,
      text: 'Using the Playground',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Select an endpoint from the dropdown. Only active endpoints appear, filtered by your role.' },
        { text: 'Type a message and press Enter (or click the send button).' },
        { text: 'The response streams in real-time with markdown rendering.' },
        { text: 'Continue the conversation. Full message history is sent with each request.' },
      ],
    },
    {
      type: 'heading',
      id: 'settings',
      level: 2,
      text: 'Playground settings',
    },
    {
      type: 'paragraph',
      text: 'Click the gear icon to open the settings modal:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Temperature', text: 'Controls randomness (0 = focused, 2 = creative). Default: 0.7' },
        { bold: 'Max tokens', text: 'Maximum number of tokens in the response. Default: 4096' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Settings are applied per-request and override any defaults configured on the endpoint.',
    },
    {
      type: 'heading',
      id: 'guardrail-testing',
      level: 2,
      text: 'Testing guardrails',
    },
    {
      type: 'paragraph',
      text: 'If guardrail rules are active, the Playground respects them. A message containing blocked content (e.g., personal data when PII detection is enabled) will be rejected before reaching the LLM. Masked content will be replaced with placeholders.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Guardrail errors',
      text: 'When a guardrail blocks a request, the Playground shows the reason (e.g., "Blocked by guardrail: content_filter: confidential detected"). Good way to verify rules work before going to production.',
    },
    {
      type: 'heading',
      id: 'cost-tracking',
      level: 2,
      text: 'Cost tracking',
    },
    {
      type: 'paragraph',
      text: 'Every Playground message is logged in Analytics with cost and token tracking. If a conversation costs $0.02 per exchange, multiply by your expected daily volume to estimate monthly spend.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'endpoints',
          title: 'Endpoints',
          description: 'Create and configure the endpoints available in the Playground dropdown.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'guardrails',
          title: 'Guardrails',
          description: 'Configure rules that the Playground enforces on every message.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'prompts',
          title: 'Prompts',
          description: 'Build versioned prompt templates and test them in the editor chat.',
        },
      ],
    },
  ],
};
