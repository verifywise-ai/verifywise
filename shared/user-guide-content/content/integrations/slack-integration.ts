import type { ArticleContent } from '../../contentTypes';

export const slackIntegrationContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Slack integration lets VerifyWise send real-time notifications about AI governance activities to your Slack workspace. Your team can stay on top of model updates, risk assessments, compliance changes and more without leaving Slack.',
    },
    {
      type: 'heading',
      id: 'what-you-can-do',
      level: 2,
      text: 'What you can do with Slack integration',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Receive notifications', text: 'Get real-time alerts about governance events in Slack channels' },
        { bold: 'Route by channel', text: 'Send different notification types to specific channels' },
        { bold: 'Multiple workspaces', text: 'Connect more than one Slack workspace if needed' },
        { bold: 'Stay informed', text: 'Keep your team updated without requiring them to log into VerifyWise' },
      ],
    },
    {
      type: 'heading',
      id: 'connecting-slack',
      level: 2,
      text: 'Connecting Slack',
    },
    {
      type: 'paragraph',
      text: 'To connect your Slack workspace:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to Integrations from the main menu' },
        { text: 'Click Configure on the Slack integration card' },
        { text: 'You\'ll be redirected to Slack to authorize the connection' },
        { text: 'Select the Slack workspace you want to connect' },
        { text: 'Review the permissions and click Allow' },
        { text: 'You\'ll be sent back to VerifyWise with the connection active' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'You need permission to install apps in your Slack workspace. If you see an error during authorization, contact your Slack workspace administrator.',
    },
    {
      type: 'heading',
      id: 'required-permissions',
      level: 2,
      text: 'Required Slack permissions',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise requests the following Slack permissions:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'channels:read', text: 'View channels to allow notification routing' },
        { bold: 'chat:write', text: 'Send messages to channels' },
        { bold: 'incoming-webhook', text: 'Create webhooks for notifications' },
        { bold: 'groups:read', text: 'View private channels for routing options' },
      ],
    },
    {
      type: 'paragraph',
      text: 'These permissions let VerifyWise send notifications but don\'t give it access to read your messages or user data.',
    },
    {
      type: 'heading',
      id: 'managing-connections',
      level: 2,
      text: 'Managing Slack connections',
    },
    {
      type: 'paragraph',
      text: 'After connecting Slack, you can manage your integrations from the Slack management page:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to Integrations' },
        { text: 'Click Manage on the Slack integration card' },
        { text: 'View your connected workspaces and their status' },
      ],
    },
    {
      type: 'heading',
      id: 'integration-table',
      level: 3,
      text: 'Integration table',
    },
    {
      type: 'paragraph',
      text: 'The integrations table shows:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Workspace', text: 'The name of the connected Slack workspace' },
        { bold: 'Channel', text: 'The default channel for notifications' },
        { bold: 'Status', text: 'Whether the connection is active' },
        { bold: 'Actions', text: 'Options to configure routing or delete the connection' },
      ],
    },
    {
      type: 'heading',
      id: 'notification-routing',
      level: 2,
      text: 'Notification routing',
    },
    {
      type: 'paragraph',
      text: 'You can configure where different notification types go by setting up routing rules. This lets you direct specific notifications to relevant channels.',
    },
    {
      type: 'paragraph',
      text: 'To configure notification routing:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click the routing icon for a workspace connection' },
        { text: 'Select the notification types to route' },
        { text: 'Choose the target channel for each notification type' },
        { text: 'Save your routing configuration' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/slack-notifications.png',
      alt: 'Notification routing modal showing different notification types like Membership and roles, Projects and organizations, Policy reminders, and Evidence alerts with channel selection dropdowns',
      caption: 'Configure notification routing to send different alert types to specific Slack channels.',
    },
    {
      type: 'heading',
      id: 'notification-types',
      level: 3,
      text: 'Available notification types',
    },
    {
      type: 'paragraph',
      text: 'You can route these notification types to specific channels:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Membership and roles', text: 'User invites, role changes and removals' },
        { bold: 'Projects and organizations', text: 'Project creation, updates and organization changes' },
        { bold: 'Policy reminders and status', text: 'Policy approaching review dates or status updates' },
        { bold: 'Evidence and task alerts', text: 'New evidence uploads, task assignments and completions' },
        { bold: 'Control or policy changes', text: 'Control status changes and policy updates' },
      ],
    },
    {
      type: 'heading',
      id: 'adding-workspace',
      level: 2,
      text: 'Adding another workspace',
    },
    {
      type: 'paragraph',
      text: 'To connect an additional Slack workspace:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to the Slack management page' },
        { text: 'Click "Add to Slack"' },
        { text: 'Follow the authorization flow for the new workspace' },
        { text: 'Configure notification routing for the new connection' },
      ],
    },
    {
      type: 'heading',
      id: 'removing-connection',
      level: 2,
      text: 'Removing a Slack connection',
    },
    {
      type: 'paragraph',
      text: 'To disconnect a Slack workspace:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to the Slack management page' },
        { text: 'Find the workspace connection in the table' },
        { text: 'Click the delete icon in the actions column' },
        { text: 'Confirm the removal when prompted' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Removing a Slack connection stops all notifications to that workspace right away. You can reconnect at any time by going through the authorization flow again.',
    },
    {
      type: 'heading',
      id: 'troubleshooting',
      level: 2,
      text: 'Troubleshooting',
    },
    {
      type: 'heading',
      id: 'troubleshoot-no-notifications',
      level: 3,
      text: 'Notifications are not appearing',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Check that the Slack connection is active in the integrations table' },
        { text: 'Verify notification routing is set up for the right channel' },
        { text: 'Make sure the VerifyWise app hasn\'t been removed from your Slack workspace' },
        { text: 'Confirm the target channel still exists' },
      ],
    },
    {
      type: 'heading',
      id: 'troubleshoot-auth-error',
      level: 3,
      text: 'Authorization failed',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Make sure you have permission to install apps in your Slack workspace' },
        { text: 'Try again after clearing your browser cache' },
        { text: 'Contact your Slack workspace administrator if restrictions are in place' },
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
      id: 'faq-private-channels',
      level: 3,
      text: 'Can I send notifications to private channels?',
    },
    {
      type: 'paragraph',
      text: 'Yes, if you grant the appropriate permissions during authorization. The VerifyWise Slack app needs to be invited to private channels before it can send messages there.',
    },
    {
      type: 'heading',
      id: 'faq-who-sees',
      level: 3,
      text: 'Who can see the notifications?',
    },
    {
      type: 'paragraph',
      text: 'Anyone with access to the Slack channel where notifications are sent can see them. Plan your routing accordingly so the right people have visibility.',
    },
    {
      type: 'heading',
      id: 'faq-customize-messages',
      level: 3,
      text: 'Can I customize the notification messages?',
    },
    {
      type: 'paragraph',
      text: 'Notification messages use standard formats designed to be clear and actionable. Custom message formatting isn\'t available right now.',
    },
    {
      type: 'heading',
      id: 'faq-frequency',
      level: 3,
      text: 'How often are notifications sent?',
    },
    {
      type: 'paragraph',
      text: 'Notifications go out in real-time as events happen in VerifyWise. There\'s no batching or delay.',
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
          articleId: 'notifications',
          title: 'Notification settings',
          description: 'Configure how you receive notifications',
        },
      ],
    },
  ],
};
