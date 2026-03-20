import type { ArticleContent } from '../../contentTypes';

export const aiGatewaySettingsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Settings page covers 3 areas: API keys for LLM providers, monthly budget limits, and guardrail configuration. Changes take effect immediately.',
    },
    {
      type: 'heading',
      id: 'api-keys',
      level: 2,
      text: 'API keys',
    },
    {
      type: 'paragraph',
      text: 'API keys connect the gateway to LLM providers. Each key is encrypted at rest using AES-256-CBC and only decrypted at the moment a request is proxied to the provider. Keys are scoped to your organization and can be referenced by multiple endpoints.',
    },
    {
      type: 'heading',
      id: 'adding-key',
      level: 3,
      text: 'Adding a key',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click "Add key"' },
        { text: 'Enter a name (e.g., "Production OpenAI key")' },
        { text: 'Select the provider from the dropdown. The top 10 providers are listed first, with 100+ additional providers below the divider.' },
        { text: 'Paste your API key' },
        { text: 'Click "Add key"' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Key security',
      text: 'API keys are never displayed in full after creation. The key list shows a masked version (first and last few characters). Keys are never logged, even in error messages.',
    },
    {
      type: 'heading',
      id: 'budget',
      level: 2,
      text: 'Budget',
    },
    {
      type: 'paragraph',
      text: 'Budgets set a monthly spending limit across all endpoints. The budget section shows current spend with a progress bar, alert threshold, and hard limit status. Spend resets automatically on the 1st of each month.',
    },
    {
      type: 'heading',
      id: 'budget-options',
      level: 3,
      text: 'Budget options',
    },
    {
      type: 'table',
      columns: [
        { key: 'setting', label: 'Setting', width: '25%' },
        { key: 'description', label: 'Description', width: '75%' },
      ],
      rows: [
        { setting: 'Monthly limit', description: 'Maximum spend in USD per month. Must be a positive number.' },
        { setting: 'Alert threshold', description: 'Percentage (0-100) at which the progress bar turns red as a visual warning.' },
        { setting: 'Hard limit', description: 'When enabled, requests are rejected with HTTP 429 once the budget is exceeded. When disabled, requests continue but the progress bar shows the overage.' },
      ],
    },
    {
      type: 'heading',
      id: 'budget-alerts',
      level: 3,
      text: 'Budget alerts',
    },
    {
      type: 'paragraph',
      text: 'When spend crosses the alert threshold percentage, the system logs an alert. Alerts are deduplicated per month (only 1 alert per threshold crossing per month). The budget spend resets automatically on the 1st of each month via a background job.',
    },
    {
      type: 'heading',
      id: 'guardrail-settings',
      level: 2,
      text: 'Guardrail settings',
    },
    {
      type: 'paragraph',
      text: 'These settings control the global behavior of guardrail scanning. They apply to all guardrail rules regardless of type.',
    },
    {
      type: 'heading',
      id: 'error-behavior',
      level: 3,
      text: 'Error behavior',
    },
    {
      type: 'paragraph',
      text: 'Controls what happens when the guardrail scanner itself fails (e.g., the AI Gateway service is temporarily unavailable):',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'PII scan on error: Block (default)', text: 'If PII scanning fails, all requests are blocked. Fail-closed. Recommended for regulated environments.' },
        { bold: 'Content filter on error: Allow (default)', text: 'If content filtering fails, requests go through. Fail-open. Prevents a scanner outage from blocking all AI traffic.' },
      ],
    },
    {
      type: 'heading',
      id: 'replacement-text',
      level: 3,
      text: 'Replacement text',
    },
    {
      type: 'paragraph',
      text: 'When a guardrail masks content, these settings control the replacement text:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'PII replacement format', text: 'Default: "<ENTITY_TYPE>". The placeholder ENTITY_TYPE is replaced with the detected type (e.g., "<EMAIL_ADDRESS>", "<CREDIT_CARD>").' },
        { bold: 'Content filter replacement', text: 'Default: "[REDACTED]". A fixed string that replaces any matched keyword or regex pattern.' },
      ],
    },
    {
      type: 'heading',
      id: 'log-retention',
      level: 3,
      text: 'Audit log retention',
    },
    {
      type: 'paragraph',
      text: 'Guardrail detection logs record every blocked or masked request for compliance auditing (EU AI Act Art. 12). The retention period controls how long these logs are kept. Default: 90 days. Use the "Purge old logs" button to immediately delete logs older than the retention period.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Log purge is irreversible',
      text: 'Purged logs cannot be recovered. Ensure your retention period meets your organization\'s compliance requirements before reducing it.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'guardrails',
          title: 'Guardrails',
          description: 'Create and manage the PII and content filter rules configured here.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'endpoints',
          title: 'Endpoints',
          description: 'Endpoints reference the API keys and budgets managed in settings.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'virtual-keys',
          title: 'Virtual keys',
          description: 'Virtual keys have their own per-key budgets separate from the org budget.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'logs',
          title: 'Logs',
          description: 'Request and response body logging is controlled by settings on this page.',
        },
      ],
    },
  ],
};
