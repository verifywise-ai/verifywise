import type { ArticleContent } from '../../contentTypes';

export const virtualKeysContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Virtual keys are API keys you hand out to developers so they can send LLM requests through the gateway with any OpenAI-compatible SDK. No VerifyWise account required. Your guardrails, budgets, and audit logs still apply to every request; the developer doesn\'t need to think about any of that.',
    },
    {
      type: 'paragraph',
      text: 'They\'re useful when you want application teams or external services to hit your LLM endpoints while you keep control over what gets spent, what content gets through, and what gets logged.',
    },
    {
      type: 'heading',
      id: 'creating-a-virtual-key',
      level: 2,
      text: 'Creating a virtual key',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open the **Virtual keys** page from the AI Gateway sidebar.' },
        { text: 'Click **Create key**.' },
        { text: 'Give it a name that tells you what it\'s for (e.g., "chatbot-prod" or "analytics-team").' },
        { text: 'Optionally set a monthly budget, rate limit (RPM), and expiry date.' },
        { text: 'Click **Create**. The full key appears once.' },
        { text: 'Copy it now. You won\'t see it again.' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Copy the key now',
      text: 'The full key is only shown at creation time. If you lose it, revoke the old one and create a new key.',
    },
    {
      type: 'heading',
      id: 'using-a-virtual-key',
      level: 2,
      text: 'Using a virtual key',
    },
    {
      type: 'paragraph',
      text: 'Point any OpenAI-compatible SDK at the gateway URL and use the virtual key as the API key. The `model` field is the endpoint slug you set up on the Endpoints page.',
    },
    {
      type: 'code',
      language: 'python',
      code: `from openai import OpenAI

client = OpenAI(
    base_url="https://your-verifywise-host/v1",
    api_key="sk-vw-your-virtual-key-here",
)

response = client.chat.completions.create(
    model="my-endpoint-slug",   # matches the endpoint slug in VerifyWise
    messages=[
        {"role": "user", "content": "Summarize this document."}
    ],
)

print(response.choices[0].message.content)`,
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Backend use only',
      text: 'CORS is disabled on the proxy routes. Virtual keys are meant for backend services and scripts, not browser JavaScript.',
    },
    {
      type: 'heading',
      id: 'key-format-and-security',
      level: 2,
      text: 'Key format and security',
    },
    {
      type: 'paragraph',
      text: 'Keys follow the format `sk-vw-` plus 32 hex characters. Only the SHA-256 hash is stored in the database. The plaintext is shown once at creation and can\'t be recovered after that.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Prefix', text: '`sk-vw-` identifies it as a VerifyWise virtual key' },
        { bold: 'Storage', text: 'SHA-256 hash only; the raw key is never persisted' },
        { bold: 'Lost key?', text: 'Revoke the old one and create a new key. There\'s no recovery.' },
      ],
    },
    {
      type: 'heading',
      id: 'budget-controls',
      level: 2,
      text: 'Budget controls',
    },
    {
      type: 'paragraph',
      text: 'Each key can have its own monthly spending cap. When a key hits its limit, only that key gets blocked. Other keys, Playground users, and the rest of the gateway keep running.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Reset', text: 'Budgets reset on the 1st of each month' },
        { bold: 'Scope', text: 'Per-key, separate from endpoint or org-wide budgets' },
        { bold: 'Notifications', text: 'Admins get an email when a key\'s budget runs out' },
        { bold: 'Response', text: 'A budget-exhausted key gets a 429 with a message explaining why' },
      ],
    },
    {
      type: 'heading',
      id: 'rate-limiting',
      level: 2,
      text: 'Rate limiting',
    },
    {
      type: 'paragraph',
      text: 'You can set a requests-per-minute (RPM) cap on each key. It uses a Redis sliding window, so it handles bursts correctly.',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Key-level and endpoint-level RPM limits are independent; both get enforced' },
        { text: 'Over-limit requests get a 429 response with a clear error message' },
        { text: 'If you don\'t set a key RPM, only the endpoint limit applies' },
      ],
    },
    {
      type: 'heading',
      id: 'revoking-and-deleting',
      level: 2,
      text: 'Revoking and deleting',
    },
    {
      type: 'heading',
      id: 'revoking',
      level: 3,
      text: 'Revoking',
    },
    {
      type: 'paragraph',
      text: 'Revoking a key kills it immediately but keeps the record. A `revoked_at` timestamp gets saved and the key stays in the database. Use this when you need to cut off access but want the usage history for audits.',
    },
    {
      type: 'heading',
      id: 'deleting',
      level: 3,
      text: 'Deleting',
    },
    {
      type: 'paragraph',
      text: 'Deleting permanently removes a revoked key. You can only delete keys that have already been revoked. Use this to clean up old keys you don\'t need anymore.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Keep revoked keys around',
      text: 'Revoked keys still have their usage history attached. That\'s useful evidence for EU AI Act Article 12 (record-keeping) and ISO 42001 Clause 9 (monitoring). Delete only when you\'re sure you won\'t need the trail.',
    },
    {
      type: 'heading',
      id: 'monitoring-virtual-key-usage',
      level: 2,
      text: 'Monitoring usage',
    },
    {
      type: 'paragraph',
      text: 'Virtual key requests are tracked the same way as logged-in user requests:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Logs', text: 'Virtual key requests show the key name instead of a user name, so you can tell programmatic traffic apart at a glance' },
        { bold: 'Spend', text: 'Cost per key is visible in the virtual keys list next to the remaining budget' },
        { bold: 'Analytics', text: 'Virtual key traffic shows up in the Analytics charts alongside everything else' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Guardrails apply to virtual keys too',
      text: 'PII detection and content filters from the Guardrails page run on every virtual key request. There\'s no way around them.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'endpoints',
          title: 'Endpoints',
          description: 'Set up the endpoint slugs that virtual key users reference in API calls.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'settings',
          title: 'Settings',
          description: 'Manage org-wide budgets and API keys used by endpoints.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'logs',
          title: 'Logs',
          description: 'Filter logs by virtual key to review programmatic traffic.',
        },
      ],
    },
  ],
};
