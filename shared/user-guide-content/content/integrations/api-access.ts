import type { ArticleContent } from '../../contentTypes';

export const apiAccessContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise offers API access so you can integrate with external applications, scripts and automation workflows. API keys let you authenticate requests without an interactive login.',
    },
    {
      type: 'paragraph',
      text: 'Use API keys to build custom integrations, automate data sync or connect VerifyWise with your existing tools.',
    },
    {
      type: 'heading',
      id: 'accessing-api-keys',
      level: 2,
      text: 'Accessing API keys',
    },
    {
      type: 'paragraph',
      text: 'To manage API keys:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to Settings from the bottom of the sidebar' },
        { text: 'Select the API keys tab' },
        { text: 'View your existing keys or create new ones' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Only users with the Admin role can view and manage API keys. The API keys tab isn\'t visible to other roles.',
    },
    {
      type: 'heading',
      id: 'creating-api-key',
      level: 2,
      text: 'Creating an API key',
    },
    {
      type: 'paragraph',
      text: 'To create a new API key:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click "Create new key" or "Create API key"' },
        { text: 'Enter a descriptive name for the key (e.g., "Production API key", "CI/CD pipeline")' },
        { text: 'Click Create' },
        { text: 'Copy the generated key right away' },
        { text: 'Click "I copied the key" to close the dialog' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/create-api-key.png',
      alt: 'Create API key modal with a key name input field and Create button',
      caption: 'Enter a descriptive name to help identify the key\'s purpose.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Important',
      text: 'The API key is only shown once when created. Copy it immediately and store it somewhere safe. You can\'t retrieve the key later. If you lose it, you\'ll need to create a new one.',
    },
    {
      type: 'heading',
      id: 'key-naming',
      level: 3,
      text: 'Key naming best practices',
    },
    {
      type: 'paragraph',
      text: 'Use descriptive names that make the key\'s purpose clear:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Environment-based', text: 'Production API key, Staging API key, Development key' },
        { bold: 'Purpose-based', text: 'Model sync key, Reporting automation, CI/CD integration' },
        { bold: 'Application-based', text: 'Data pipeline key, Dashboard integration' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Key names must be between 3 and 50 characters. Each name has to be unique within your organization.',
    },
    {
      type: 'heading',
      id: 'viewing-keys',
      level: 2,
      text: 'Viewing API keys',
    },
    {
      type: 'paragraph',
      text: 'The API keys list shows the following for each key:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Name', text: 'The descriptive name you gave the key' },
        { bold: 'Status', text: 'Whether the key is Active or Expired' },
        { bold: 'Created', text: 'When the key was created' },
        { bold: 'Expires', text: 'When the key will expire' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/api-keys.png',
      alt: 'API keys settings tab showing a list of API keys with their names, status indicators, creation dates, and expiration dates',
      caption: 'The API keys tab shows all your keys with their status and expiration info.',
    },
    {
      type: 'paragraph',
      text: 'Active keys have a green status badge. Expired keys show a warning indicator and can no longer be used.',
    },
    {
      type: 'heading',
      id: 'deleting-keys',
      level: 2,
      text: 'Deleting API keys',
    },
    {
      type: 'paragraph',
      text: 'To delete an API key:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Find the key in the API keys list' },
        { text: 'Click the delete icon for that key' },
        { text: 'Confirm the deletion when prompted' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Deleting an API key invalidates it immediately. Any applications using it will lose access. This can\'t be undone.',
    },
    {
      type: 'heading',
      id: 'using-api-keys',
      level: 2,
      text: 'Using API keys',
    },
    {
      type: 'paragraph',
      text: 'Include your API key in the request headers to authenticate:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Header name', text: 'Authorization' },
        { bold: 'Header value', text: 'Bearer YOUR_API_KEY' },
      ],
    },
    {
      type: 'heading',
      id: 'security-best-practices',
      level: 2,
      text: 'Security best practices',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Never share keys', text: 'Keep API keys confidential. Don\'t share them in emails, chat or version control.' },
        { bold: 'Use environment variables', text: 'Store keys in environment variables rather than hard-coding them.' },
        { bold: 'Rotate regularly', text: 'Create new keys periodically and delete old ones to limit exposure.' },
        { bold: 'Use separate keys', text: 'Create different keys for different environments and purposes.' },
        { bold: 'Act on compromises', text: 'If you suspect a key has been compromised, delete it right away and create a new one.' },
        { bold: 'Limit access', text: 'Only admins should manage API keys.' },
      ],
    },
    {
      type: 'heading',
      id: 'key-expiration',
      level: 2,
      text: 'Key expiration',
    },
    {
      type: 'paragraph',
      text: 'API keys have an expiration date set at creation. Keep an eye on your keys and create new ones before existing keys expire to avoid interruptions.',
    },
    {
      type: 'paragraph',
      text: 'When a key expires:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'The key status changes to Expired' },
        { text: 'API requests using the key get rejected' },
        { text: 'You\'ll need to create a new key and update your applications' },
      ],
    },
    {
      type: 'heading',
      id: 'troubleshooting',
      level: 2,
      text: 'Troubleshooting',
    },
    {
      type: 'heading',
      id: 'troubleshoot-401',
      level: 3,
      text: 'Receiving 401 Unauthorized errors',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Check that the API key is correct and complete' },
        { text: 'Verify the key hasn\'t expired' },
        { text: 'Make sure the Authorization header is formatted properly' },
        { text: 'Confirm the key hasn\'t been deleted' },
      ],
    },
    {
      type: 'heading',
      id: 'troubleshoot-lost-key',
      level: 3,
      text: 'Lost API key',
    },
    {
      type: 'paragraph',
      text: 'If you lose an API key, there\'s no way to retrieve it. Create a new key, update your applications to use it and delete the old one.',
    },
    {
      type: 'heading',
      id: 'faq',
      level: 2,
      text: 'Frequently asked questions',
    },
    {
      type: 'heading',
      id: 'faq-how-many',
      level: 3,
      text: 'How many API keys can I create?',
    },
    {
      type: 'paragraph',
      text: 'Each organization can have up to 10 API keys at a time. If you hit the maximum, delete unused keys before creating new ones.',
    },
    {
      type: 'heading',
      id: 'faq-duplicate-name',
      level: 3,
      text: 'Why am I getting a duplicate name error?',
    },
    {
      type: 'paragraph',
      text: 'Each API key needs a unique name within your organization. If a key with that name already exists, pick a different name or delete the existing key first.',
    },
    {
      type: 'heading',
      id: 'faq-permissions',
      level: 3,
      text: 'What permissions does an API key have?',
    },
    {
      type: 'paragraph',
      text: 'API keys give access to VerifyWise API endpoints based on your organization\'s permissions. The specific endpoints and operations available are documented in the API reference.',
    },
    {
      type: 'heading',
      id: 'faq-rate-limits',
      level: 3,
      text: 'Are there rate limits?',
    },
    {
      type: 'paragraph',
      text: 'API requests may be rate-limited to keep the platform stable. If you run into rate limit errors, reduce request frequency or contact support.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'integrations',
          articleId: 'integration-overview',
          title: 'Integration overview',
          description: 'View all available integrations',
        },
        {
          collectionId: 'settings',
          articleId: 'role-configuration',
          title: 'Role configuration',
          description: 'Understand roles and permissions',
        },
      ],
    },
  ],
};
