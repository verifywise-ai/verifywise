import type { ArticleContent } from '../../contentTypes';

export const integrationOverviewContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Integrations connect VerifyWise with external tools and services. They help you automate data sync and keep your team informed through channels they already use.',
    },
    {
      type: 'paragraph',
      text: 'From the Integrations page, you can see what\'s available, check connection status and configure each integration.',
    },
    {
      type: 'heading',
      id: 'accessing-integrations',
      level: 2,
      text: 'Accessing integrations',
    },
    {
      type: 'paragraph',
      text: 'To access integrations:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click on Integrations in the main navigation' },
        { text: 'View the available integration cards' },
        { text: 'Click Configure or Manage to set up or modify an integration' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Only users with the Admin role can access and configure integrations. If you don\'t see the Integrations menu item, contact your administrator.',
    },
    {
      type: 'heading',
      id: 'available-integrations',
      level: 2,
      text: 'Available integrations',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise currently offers the following integrations:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'MessageSquare',
          title: 'Slack',
          description: 'Send real-time notifications about AI governance activities to your Slack workspace.',
        },
        {
          icon: 'Activity',
          title: 'MLflow',
          description: 'Sync machine learning models and experiments from your MLflow tracking server.',
        },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/integrations.png',
      alt: 'Integrations page showing Slack and MLflow integration cards with configuration status and descriptions',
      caption: 'The Integrations page shows available integrations with their current status.',
    },
    {
      type: 'heading',
      id: 'integration-status',
      level: 2,
      text: 'Integration status',
    },
    {
      type: 'paragraph',
      text: 'Each integration card shows its current status:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Not configured', text: 'The integration hasn\'t been set up yet. Click Configure to get started.' },
        { bold: 'Configured', text: 'The integration is active and connected. Click Manage to view or change settings.' },
        { bold: 'Error', text: 'Something went wrong. Click Manage to troubleshoot.' },
      ],
    },
    {
      type: 'heading',
      id: 'slack-integration',
      level: 2,
      text: 'Slack integration',
    },
    {
      type: 'paragraph',
      text: 'The Slack integration sends notifications directly to your Slack workspace. You can route different notification types to specific channels, so your team stays up to date on governance activities without leaving Slack.',
    },
    {
      type: 'paragraph',
      text: 'Key features:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Real-time notifications for governance events' },
        { text: 'Route notifications to specific channels' },
        { text: 'Multiple workspace connections' },
        { text: 'Customizable notification routing' },
      ],
    },
    {
      type: 'heading',
      id: 'mlflow-integration',
      level: 2,
      text: 'MLflow integration',
    },
    {
      type: 'paragraph',
      text: 'The MLflow integration connects to your MLflow tracking server and automatically syncs machine learning models. This keeps your model inventory current without manual data entry.',
    },
    {
      type: 'paragraph',
      text: 'Key features:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Automatic model sync' },
        { text: 'Multiple authentication methods (none, basic auth, API token)' },
        { text: 'Scheduled sync every hour' },
        { text: 'Connection status monitoring' },
        { text: 'Manual sync trigger' },
      ],
    },
    {
      type: 'heading',
      id: 'api-access',
      level: 2,
      text: 'API access',
    },
    {
      type: 'paragraph',
      text: 'Beyond the built-in integrations, VerifyWise offers API access for custom integrations. API keys let you interact with VerifyWise data and features programmatically from external applications or scripts.',
    },
    {
      type: 'paragraph',
      text: 'API keys are managed from Settings > API keys. See the API access article for details on creating and managing tokens.',
    },
    {
      type: 'heading',
      id: 'security',
      level: 2,
      text: 'Security considerations',
    },
    {
      type: 'paragraph',
      text: 'Keep these practices in mind when configuring integrations:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Limit access', text: 'Only admins can configure integrations, which reduces the risk of unauthorized changes' },
        { bold: 'Review permissions', text: 'Understand what each integration needs before connecting' },
        { bold: 'Monitor connections', text: 'Check active integrations regularly and disconnect any you no longer use' },
        { bold: 'Protect credentials', text: 'Don\'t share API keys or integration credentials with unauthorized users' },
        { bold: 'Use SSL', text: 'Make sure external services use secure HTTPS connections' },
      ],
    },
    {
      type: 'heading',
      id: 'troubleshooting',
      level: 2,
      text: 'Troubleshooting',
    },
    {
      type: 'paragraph',
      text: 'If an integration isn\'t working as expected:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Check the integration status on the Integrations page' },
        { text: 'Verify that connection credentials are correct' },
        { text: 'Test the connection using the built-in test feature' },
        { text: 'Check if the external service is accessible and running' },
        { text: 'Review any error messages in the integration settings' },
      ],
    },
    {
      type: 'heading',
      id: 'faq',
      level: 2,
      text: 'Frequently asked questions',
    },
    {
      type: 'heading',
      id: 'faq-who-can-configure',
      level: 3,
      text: 'Who can configure integrations?',
    },
    {
      type: 'paragraph',
      text: 'Only users with the Admin role can access the Integrations page and set up connections. This keeps integration credentials and settings in the hands of authorized people.',
    },
    {
      type: 'heading',
      id: 'faq-multiple-connections',
      level: 3,
      text: 'Can I connect multiple Slack workspaces?',
    },
    {
      type: 'paragraph',
      text: 'Yes. You can add multiple Slack workspace connections, each with its own notification routing rules.',
    },
    {
      type: 'heading',
      id: 'faq-disconnect',
      level: 3,
      text: 'How do I disconnect an integration?',
    },
    {
      type: 'paragraph',
      text: 'Go to the integration\'s management page and look for disconnect or delete options. For Slack, you can remove individual workspace connections. For MLflow, clear the configuration to disconnect.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'integrations',
          articleId: 'slack-integration',
          title: 'Slack integration',
          description: 'Set up Slack notifications',
        },
        {
          collectionId: 'integrations',
          articleId: 'api-access',
          title: 'API access',
          description: 'Manage API keys for custom integrations',
        },
      ],
    },
  ],
};
