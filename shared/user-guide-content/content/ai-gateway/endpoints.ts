import type { ArticleContent } from '../../contentTypes';

export const endpointsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Each endpoint maps a URL-safe slug to a provider, model, and API key. Applications call the slug, not the model directly, so you can swap models without changing any application code.',
    },
    {
      type: 'heading',
      id: 'creating-endpoint',
      level: 2,
      text: 'Creating an endpoint',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click "Add endpoint" in the top right' },
        { text: 'Enter a display name (e.g., "Production GPT-4o"). A URL-safe slug is generated automatically.' },
        { text: 'Select a model from the dropdown. Models are grouped by provider.' },
        { text: 'Select an API key to authenticate with the provider. If no keys are available, add one in Settings first.' },
        { text: 'Optionally set max tokens, temperature, system prompt, and rate limit (RPM).' },
        { text: 'Optionally select a fallback endpoint (used if the primary provider is down).' },
        { text: 'Click "Create endpoint"' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'System prompts',
      text: 'If you set a system prompt on an endpoint, it gets prepended to every request. Good for enforcing consistent behavior or response formatting without changing your application.',
    },
    {
      type: 'heading',
      id: 'endpoint-slugs',
      level: 2,
      text: 'Endpoint slugs',
    },
    {
      type: 'paragraph',
      text: 'Each endpoint has a unique slug (e.g., "prod-gpt4o") that is used to route requests. Slugs must be lowercase alphanumeric with hyphens only. They are auto-generated from the display name but can be customized.',
    },
    {
      type: 'heading',
      id: 'managing-endpoints',
      level: 2,
      text: 'Managing endpoints',
    },
    {
      type: 'paragraph',
      text: 'The endpoint list shows each endpoint with its provider icon, display name, model, associated API key, guardrail status, and active/inactive state. You can:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Delete', text: 'Removes the endpoint. Requests using this slug will fail.' },
        { bold: 'View guardrail status', text: 'Shows how many guardrail rules are currently active across all endpoints.' },
        { bold: 'RPM badge', text: 'Shows the rate limit in requests per minute, if configured.' },
        { bold: 'Fallback badge', text: 'Shows "has fallback" when a fallback endpoint is configured.' },
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
      text: 'Set "Rate limit (RPM)" on an endpoint to cap requests per minute. When the limit is hit, additional requests return HTTP 429. The limit uses a Redis sliding window, so it resets continuously (not on a fixed clock boundary). Leave the field empty for no limit.',
    },
    {
      type: 'heading',
      id: 'fallback-endpoints',
      level: 2,
      text: 'Fallback endpoints',
    },
    {
      type: 'paragraph',
      text: 'Select a fallback endpoint when creating or editing an endpoint. If the primary provider returns an error (timeout, 500, rate limit from the provider side), the gateway automatically retries the request using the fallback endpoint. This works for both non-streaming and streaming requests.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Fallback chain',
      text: 'The fallback endpoint can itself have a fallback, forming a chain. The gateway follows the chain until it finds a working endpoint or runs out of fallbacks. Guardrails run on each attempt in the chain. Avoid circular fallback chains (A to B to A) as they will loop.',
    },
    {
      type: 'heading',
      id: 'access-controls',
      level: 2,
      text: 'Role-based access',
    },
    {
      type: 'paragraph',
      text: 'Each endpoint has an allowed roles list (defaults to all 4 roles: Admin, Reviewer, Editor, Auditor). When listing endpoints, users only see endpoints their role has access to. This applies to the Endpoints page, the Playground dropdown, and any API call that lists endpoints.',
    },
    {
      type: 'heading',
      id: 'supported-providers',
      level: 2,
      text: 'Supported providers',
    },
    {
      type: 'paragraph',
      text: 'The model dropdown includes popular models from these providers. You can also type a custom model string in LiteLLM format:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Direct providers', text: 'OpenAI, Anthropic, Google Gemini, Mistral, xAI, Cohere' },
        { bold: 'Cloud providers', text: 'AWS Bedrock, Azure OpenAI, Google Vertex AI' },
        { bold: 'Aggregators', text: 'OpenRouter, Together AI' },
        { bold: 'Self-hosted', text: 'Ollama, vLLM, NVIDIA NIM' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Model format',
      text: 'Models follow the LiteLLM format: "provider/model-name" (e.g., "openai/gpt-4o", "anthropic/claude-sonnet-4-20250514"). For OpenRouter, use "openrouter/provider/model" (e.g., "openrouter/meta-llama/llama-3.3-70b-instruct").',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'settings',
          title: 'Settings',
          description: 'Add the API keys that endpoints use to authenticate with providers.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'guardrails',
          title: 'Guardrails',
          description: 'Set up PII detection and content filtering applied to all endpoints.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'prompts',
          title: 'Prompts',
          description: 'Create versioned prompt templates that can be bound to endpoints.',
        },
      ],
    },
  ],
};
