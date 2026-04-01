import type { ArticleContent } from '../../contentTypes';

export const logsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Logs page records every request through the AI Gateway, whether it came from the Playground or a virtual key. Each row shows the endpoint, model, cost, tokens, latency, status, and who sent it. Click any row to see the full prompt and response.',
    },
    {
      type: 'heading',
      id: 'filtering',
      level: 2,
      text: 'Filtering logs',
    },
    {
      type: 'paragraph',
      text: 'A filter bar sits at the top of the page. All filtering happens server-side, so the total count and pagination update to match.',
    },
    {
      type: 'heading',
      id: 'search',
      level: 3,
      text: 'Search',
    },
    {
      type: 'paragraph',
      text: 'The search box matches against endpoint name, model, user name, and virtual key name. It\'s case-insensitive and matches partial strings. There\'s a short debounce so it doesn\'t hammer the server on every keystroke.',
    },
    {
      type: 'heading',
      id: 'status-filter',
      level: 3,
      text: 'Status filter',
    },
    {
      type: 'paragraph',
      text: 'Toggle between All, Success (HTTP 200), and Error (anything else). Useful when you\'re hunting down failed requests and don\'t want to scroll past hundreds of green 200s.',
    },
    {
      type: 'heading',
      id: 'source-filter',
      level: 3,
      text: 'Source filter',
    },
    {
      type: 'paragraph',
      text: 'Toggle between All, Playground (requests from logged-in users), and Virtual key (programmatic requests from developer API keys). Handy for separating test traffic from production.',
    },
    {
      type: 'heading',
      id: 'date-grouping',
      level: 2,
      text: 'Date grouping',
    },
    {
      type: 'paragraph',
      text: 'Logs are grouped under day headers: "Today", "Yesterday", or a short date like "Mar 14". You can tell at a glance which day a cluster of requests belongs to without reading individual timestamps.',
    },
    {
      type: 'heading',
      id: 'log-row',
      level: 2,
      text: 'Reading a log row',
    },
    {
      type: 'paragraph',
      text: 'Each row shows, left to right:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Endpoint', text: 'Which endpoint handled the request, plus the model' },
        { bold: 'Source', text: 'User name for Playground requests, or the virtual key name (with a key icon) for programmatic ones' },
        { bold: 'Tokens', text: 'Total tokens (prompt + completion combined)' },
        { bold: 'Cost', text: 'Dollar cost, shown to 6 decimal places' },
        { bold: 'Status', text: 'Green chip for 200, red for errors' },
        { bold: 'Time', text: 'When it happened' },
      ],
    },
    {
      type: 'heading',
      id: 'expanded-view',
      level: 2,
      text: 'Expanded view',
    },
    {
      type: 'paragraph',
      text: 'Click a row to expand it. You\'ll see up to 4 sections:',
    },
    {
      type: 'heading',
      id: 'request-section',
      level: 3,
      text: 'Request',
    },
    {
      type: 'paragraph',
      text: 'Chat messages are rendered as a conversation with colored role labels (system, user, assistant) rather than a wall of JSON. If the data isn\'t in the standard message format, you get formatted JSON as a fallback.',
    },
    {
      type: 'heading',
      id: 'response-section',
      level: 3,
      text: 'Response',
    },
    {
      type: 'paragraph',
      text: 'The LLM\'s output text. Long responses scroll within the panel.',
    },
    {
      type: 'heading',
      id: 'error-section',
      level: 3,
      text: 'Error',
    },
    {
      type: 'paragraph',
      text: 'Shown in red when the request failed. Contains the error message from the provider or from a guardrail block.',
    },
    {
      type: 'heading',
      id: 'metadata-section',
      level: 3,
      text: 'Metadata',
    },
    {
      type: 'paragraph',
      text: 'Custom tags the caller attached to the request (e.g., `{"department": "engineering"}`). These are stored as JSON and show up in search results too.',
    },
    {
      type: 'paragraph',
      text: 'A footer row below these sections shows latency in milliseconds, prompt tokens, and completion tokens.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Request/response logging is opt-in',
      text: 'Prompts and responses are only stored when "Log request body" and "Log response body" are turned on in Settings. If they\'re off, expanded rows won\'t have Request or Response sections.',
    },
    {
      type: 'heading',
      id: 'auto-refresh',
      level: 2,
      text: 'Auto-refresh',
    },
    {
      type: 'paragraph',
      text: 'Hit the "Auto" button next to Refresh to poll for new logs every 10 seconds. It turns green while active. Click it again to stop. Auto-refresh keeps running as you page through results.',
    },
    {
      type: 'heading',
      id: 'pagination',
      level: 2,
      text: 'Pagination',
    },
    {
      type: 'paragraph',
      text: 'Pick 10, 25, or 50 rows per page. Your choice sticks across sessions. The total count in the top right reflects whatever filters are active, not just the visible page.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Compliance audit trail',
      text: 'Every gateway request is logged with timestamp, model, cost, tokens, and status. That\'s your evidence for EU AI Act Article 12 (record-keeping) and ISO 42001 Clause 9 (performance evaluation). The source filter is especially useful here: you can pull just the programmatic traffic and ignore test requests from the Playground.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'settings',
          title: 'Settings',
          description: 'Toggle request and response body logging on or off.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'guardrails',
          title: 'Guardrails',
          description: 'Configure rules whose blocks and masks appear in log error details.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'analytics',
          title: 'Analytics',
          description: 'See aggregated cost and usage trends from the same request data.',
        },
      ],
    },
  ],
};
