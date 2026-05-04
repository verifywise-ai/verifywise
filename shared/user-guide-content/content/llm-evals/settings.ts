import type { ArticleContent } from '../../contentTypes';

export const evalsSettingsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'LLM Evals settings',
    },
    {
      type: 'paragraph',
      text: 'This is where you manage API keys for the LLM providers your organization uses. Keys are shared across all projects. Without at least one key configured, you can\'t run experiments or arena comparisons.',
    },
    {
      type: 'heading',
      id: 'supported-providers',
      level: 2,
      text: 'Supported providers',
    },
    {
      type: 'paragraph',
      text: 'You can add API keys for these providers:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'OpenRouter', text: 'Routes to multiple providers through one key' },
        { bold: 'OpenAI', text: 'GPT-4o, GPT-4 and other OpenAI models' },
        { bold: 'Anthropic', text: 'Claude model family' },
        { bold: 'Custom', text: 'Any OpenAI-compatible endpoint (bring your own base URL)' },
      ],
    },
    {
      type: 'heading',
      id: 'adding-key',
      level: 2,
      text: 'Adding an API key',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Settings** at the bottom of the LLM Evals sidebar.' },
        { text: 'Click **Add API key**.' },
        { text: 'Select a provider from the list.' },
        { text: 'Paste your API key. The format is validated automatically (e.g., OpenAI keys must start with `sk-`).' },
        { text: 'Click **Add API key** to save.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Keys are encrypted before storage. The settings page only shows a masked version (e.g., `sk-...abc123`).',
    },
    {
      type: 'heading',
      id: 'managing-keys',
      level: 2,
      text: 'Managing keys',
    },
    {
      type: 'paragraph',
      text: 'Each provider can have one active key at a time. To update a key, click the edit icon next to the provider card and enter the new key. To remove a key entirely, click the delete icon and confirm.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Removing an API key will prevent experiments from running against that provider. Make sure no active experiments depend on the key before deleting it.',
    },
    {
      type: 'heading',
      id: 'permissions',
      level: 2,
      text: 'Who can manage keys',
    },
    {
      type: 'paragraph',
      text: 'Only users with the **Admin** role can add, edit or delete API keys. Other roles can see which providers are configured but can\'t view or modify the keys themselves.',
    },
  ],
};
