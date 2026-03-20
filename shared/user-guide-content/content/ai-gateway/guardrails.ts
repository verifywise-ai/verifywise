import type { ArticleContent } from '../../contentTypes';

export const guardrailsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Guardrails scan every AI request before it reaches the LLM provider. They catch personal data (PII detection) and prohibited content (content filter). Rules apply globally to all endpoints. Scanning runs within your gateway infrastructure (the AI Gateway FastAPI service); no data leaves your network for scanning.',
    },
    {
      type: 'heading',
      id: 'pii-detection',
      level: 2,
      text: 'PII detection',
    },
    {
      type: 'paragraph',
      text: 'PII detection identifies personal data in user messages using pattern recognition and natural language processing. Supported entity types include:',
    },
    {
      type: 'table',
      columns: [
        { key: 'entity', label: 'Entity type', width: '30%' },
        { key: 'example', label: 'Example', width: '35%' },
        { key: 'coverage', label: 'Coverage', width: '35%' },
      ],
      rows: [
        { entity: 'Email address', example: 'john@example.com', coverage: 'All standard formats' },
        { entity: 'Phone number', example: '+1 555-123-4567', coverage: 'US, international' },
        { entity: 'Credit card', example: '4111-1111-1111-1111', coverage: 'Visa, Mastercard, Amex' },
        { entity: 'Person name', example: 'John Smith', coverage: 'English names (NLP-based)' },
        { entity: 'IBAN', example: 'DE89370400440532013000', coverage: 'All countries' },
        { entity: 'Turkish TCKN', example: '12345678901', coverage: '11-digit national ID' },
        { entity: 'EU phone', example: '+33 1 42 68 53 00', coverage: 'FR, DE, UK, TR, and more' },
        { entity: 'US SSN', example: '123-45-6789', coverage: 'Standard format' },
        { entity: 'IP address', example: '192.168.1.1', coverage: 'IPv4' },
        { entity: 'Location', example: 'Berlin, Germany', coverage: 'Cities, countries (NLP-based)' },
        { entity: 'Date/time', example: 'March 14, 2026', coverage: 'Common date formats' },
        { entity: 'NRP', example: 'Catholic, Republican', coverage: 'Nationality, religion, politics' },
        { entity: 'Medical license', example: 'DEA# AB1234567', coverage: 'US medical license numbers' },
      ],
    },
    {
      type: 'heading',
      id: 'creating-pii-rule',
      level: 3,
      text: 'Creating a PII rule',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'On the Guardrails page, click "Add PII rule"' },
        { text: 'Enter a rule name (e.g., "Block credit cards")' },
        { text: 'Select the entity type to detect' },
        { text: 'Choose an action: Block (reject the request) or Mask (replace with a placeholder)' },
        { text: 'Click "Add rule"' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Masking on input',
      text: 'When you choose "Mask" for input scanning, the detected personal data is replaced with a placeholder (e.g., "<EMAIL_ADDRESS>") before sending to the LLM. The model receives the modified text, so the response may be less relevant. Consider using "Block" for input scanning instead.',
    },
    {
      type: 'heading',
      id: 'content-filter',
      level: 2,
      text: 'Content filter',
    },
    {
      type: 'paragraph',
      text: 'Content filters block or mask specific keywords and patterns in user messages. Two match types are available:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Keyword', text: 'Exact word matching with word boundaries. "kill" matches "kill" but not "skilled". Multi-word phrases use substring matching.' },
        { bold: 'Regex', text: 'Custom regular expressions for format-based detection. Useful for internal project codes (e.g., "PROJECT-\\d{6}"), employee IDs, API keys, or internal URLs.' },
      ],
    },
    {
      type: 'heading',
      id: 'creating-filter-rule',
      level: 3,
      text: 'Creating a content filter rule',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click "Add filter rule"' },
        { text: 'Enter a rule name (e.g., "Block competitor names")' },
        { text: 'Select the match type: Keyword or Regex' },
        { text: 'Enter the keyword or regex pattern' },
        { text: 'Choose an action: Block or Mask' },
        { text: 'Click "Add rule"' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Regex validation',
      text: 'Regex patterns are validated when you save the rule. Invalid patterns are rejected with an error message. Patterns are compiled once and cached for performance.',
    },
    {
      type: 'heading',
      id: 'actions',
      level: 2,
      text: 'Block vs mask',
    },
    {
      type: 'table',
      columns: [
        { key: 'action', label: 'Action', width: '15%' },
        { key: 'behavior', label: 'Behavior', width: '45%' },
        { key: 'use_case', label: 'Best for', width: '40%' },
      ],
      rows: [
        { action: 'Block', behavior: 'Rejects the request immediately with HTTP 422. The LLM never sees the message.', use_case: 'Sensitive data that must never leave your network (credit cards, SSNs, confidential terms)' },
        { action: 'Mask', behavior: 'Replaces matched text with a placeholder and forwards the modified message to the LLM.', use_case: 'Data that can be redacted without breaking the request (names, emails in output)' },
      ],
    },
    {
      type: 'heading',
      id: 'testing',
      level: 2,
      text: 'Testing guardrails',
    },
    {
      type: 'paragraph',
      text: 'Click "Test guardrails" at the top of the page to open the test modal. Paste sample text and click "Run test" to see what your active rules would catch, without sending anything to an LLM. The test shows:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Whether the text would be blocked' },
        { text: 'Each detection with the matched text and entity type' },
        { text: 'A masked preview showing what the LLM would receive' },
        { text: 'Execution time in milliseconds' },
      ],
    },
    {
      type: 'heading',
      id: 'toggling',
      level: 2,
      text: 'Enabling and disabling rules',
    },
    {
      type: 'paragraph',
      text: 'Each rule has a toggle switch. Disabled rules aren\'t evaluated during request processing. You can temporarily disable a rule without deleting it, which is handy when investigating false positives.',
    },
    {
      type: 'heading',
      id: 'audit-trail',
      level: 2,
      text: 'Change history',
    },
    {
      type: 'paragraph',
      text: 'Every change to a guardrail rule (name, action, config, toggle) is recorded in the change history. The same applies to endpoint changes. This audit trail tracks who changed what and when, supporting ISO 42001 Clause 10 (improvement) requirements.',
    },
    {
      type: 'heading',
      id: 'compliance',
      level: 2,
      text: 'Compliance mapping',
    },
    {
      type: 'paragraph',
      text: 'Guardrails map to these compliance requirements:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'EU AI Act Art. 9', text: 'Guardrails are risk mitigation measures that identify and control risks per request.' },
        { bold: 'EU AI Act Art. 10', text: 'PII scanning blocks personal data before it reaches the model (data minimization).' },
        { bold: 'EU AI Act Art. 12', text: 'Every detection is logged with timestamp, entity type, action, and matched text.' },
        { bold: 'ISO 42001 A.2', text: 'Guardrail rules are AI policies that are enforced, not just documented.' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'settings',
          title: 'Settings',
          description: 'Configure error behavior, replacement text, and log retention for guardrails.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'analytics',
          title: 'Analytics',
          description: 'View blocked and masked request counts in the guardrails activity section.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'logs',
          title: 'Logs',
          description: 'Inspect individual requests that were blocked or masked by guardrail rules.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'endpoints',
          title: 'Endpoints',
          description: 'Guardrail rules apply globally to all endpoints listed here.',
        },
      ],
    },
  ],
};
