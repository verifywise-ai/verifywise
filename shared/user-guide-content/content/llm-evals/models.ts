import type { ArticleContent } from '../../contentTypes';

export const modelsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Managing models',
    },
    {
      type: 'paragraph',
      text: 'The Models page is your central registry for the AI models used across your evaluation experiments. It shows which models have been tested, their providers and how they\'ve been accessed (via API, locally through Ollama or through HuggingFace).',
    },
    {
      type: 'heading',
      id: 'model-list',
      level: 2,
      text: 'Model list',
    },
    {
      type: 'paragraph',
      text: 'Each model entry shows the model name, provider and access method. Models are automatically added to this list when they\'re used in experiments. You don\'t need to manually register models before running evaluations.',
    },
    {
      type: 'heading',
      id: 'providers',
      level: 2,
      text: 'Supported providers',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise supports a wide range of model providers:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'OpenAI', text: 'GPT-4, GPT-4 Turbo, GPT-3.5 Turbo and newer models.' },
        { bold: 'Anthropic', text: 'Claude 3 and 3.5 family models (Opus, Sonnet, Haiku).' },
        { bold: 'Google Gemini', text: 'Gemini Pro and Ultra.' },
        { bold: 'xAI', text: 'Grok models.' },
        { bold: 'Mistral', text: 'Mistral Large and Medium.' },
        { bold: 'OpenRouter', text: 'Aggregated access to 600+ models from many providers via a single API.' },
        { bold: 'Ollama (self-hosted)', text: 'Locally-hosted models running on your own hardware.' },
      ],
    },
    {
      type: 'heading',
      id: 'api-keys',
      level: 2,
      text: 'API key configuration',
    },
    {
      type: 'paragraph',
      text: 'API keys for cloud providers are configured in the **Settings** tab of your evals project. Keys are stored securely and shared across all experiments in the project. You can add, update or remove keys at any time.',
    },
    {
      type: 'callout',
      text: 'For local models (Ollama), no API key is needed. Just make sure your Ollama instance is running and accessible from the server.',
    },
  ],
};
