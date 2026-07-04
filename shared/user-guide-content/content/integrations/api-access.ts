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
        { bold: 'Status', text: 'Whether the key is Active, Expired or Revoked' },
        { bold: 'Created', text: 'When the key was created' },
        { bold: 'Expires', text: 'When the key will expire' },
        { bold: 'Last used', text: 'When the key last authenticated a request, or Never if it has not been used yet' },
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
      text: 'Active keys have a green badge. Expired keys can no longer be used. Revoked keys were turned off manually and are kept in the list for your records.',
    },
    {
      type: 'heading',
      id: 'revoking-keys',
      level: 2,
      text: 'Revoking API keys',
    },
    {
      type: 'paragraph',
      text: 'Revoking a key turns it off straight away while keeping it in the list, marked as revoked, for your records. This is the best way to retire a key you no longer trust.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Find the key in the API keys list' },
        { text: 'Click the revoke icon for that key' },
        { text: 'Confirm when prompted' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'A revoked key is rejected on its very next request, before its expiry date. If a key might be compromised, revoke it rather than waiting for it to expire.',
    },
    {
      type: 'heading',
      id: 'deleting-keys',
      level: 2,
      text: 'Deleting API keys',
    },
    {
      type: 'paragraph',
      text: 'Deleting removes a key from the list entirely. If you want to keep a record that the key existed, revoke it instead. To delete a key:',
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
      type: 'paragraph',
      text: 'For the base URL, the response shape, the full list of endpoints and the current limits, see the Platform REST API article in the developer guide. You can also browse the live endpoint reference in your browser at /api/docs.',
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
        { bold: 'Rotate regularly', text: 'Create new keys periodically and revoke old ones to limit exposure.' },
        { bold: 'Use separate keys', text: 'Create different keys for different environments and purposes.' },
        { bold: 'Act on compromises', text: 'If you suspect a key has been compromised, revoke it right away and create a new one.' },
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
        { text: 'Confirm the key hasn\'t been revoked or deleted' },
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
      text: 'A key carries the role of the Admin who created it and is scoped to your organization, so it can only read and write your own organization\'s data. The endpoints and operations available are listed in the Platform REST API article and the live reference at /api/docs.',
    },
    {
      type: 'heading',
      id: 'faq-rate-limits',
      level: 3,
      text: 'Are there rate limits?',
    },
    {
      type: 'paragraph',
      text: 'Some route groups, such as login and file uploads, are rate-limited, but the main data (CRUD) endpoints currently are not. Keep your request volume reasonable anyway, since limits may be added later. The Platform REST API article covers this in more detail.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'developers',
          articleId: 'platform-rest-api',
          title: 'Platform REST API',
          description: 'Base URL, authentication, response shape and limits for the API',
        },
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
