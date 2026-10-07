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
        { bold: 'Choose what to send', text: 'Pick which notification types go to Slack' },
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
      text: 'Slack is one of the built-in extensions, so an Admin needs to enable it first. To connect your Slack workspace:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click the **Extensions** button in the top header' },
        { text: 'On the Slack card, click **Enable**, then **Configure**' },
        { text: 'Click **Add to Slack**. You\'ll be redirected to Slack to authorize the connection' },
        { text: 'Select the Slack workspace and the channel VerifyWise should post to' },
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
      type: 'callout',
      variant: 'info',
      title: 'Self-hosted installations',
      text: 'On a self-hosted installation, **Add to Slack** only works once a Slack app is configured: set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_API_URL` on the server, and `VITE_SLACK_CLIENT_ID` and `VITE_SLACK_URL` on the client.',
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
        { bold: 'incoming-webhook', text: 'Post messages to the channel you pick during authorization' },
        { bold: 'chat:write', text: 'Send messages to channels' },
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
      text: 'After connecting Slack, manage your connections from the Slack settings page:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click the **Extensions** button in the top header' },
        { text: 'Click **Configure** on the Slack card' },
        { text: 'View your connected workspaces and their status in the table' },
      ],
    },
    {
      type: 'heading',
      id: 'integration-table',
      level: 3,
      text: 'Connections table',
    },
    {
      type: 'paragraph',
      text: 'The table shows one row per connection:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Team Name', text: 'The name of the connected Slack workspace' },
        { bold: 'Channel', text: 'The channel VerifyWise posts to' },
        { bold: 'Creation Date', text: 'When the connection was added' },
        { bold: 'Active', text: 'Whether the connection is active or inactive' },
        { bold: 'Action', text: 'Turn the connection on or off, or delete it' },
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
      text: 'Routing decides which notification types VerifyWise sends to Slack. Each connection posts to the channel you chose when you added it.',
    },
    {
      type: 'paragraph',
      text: 'To configure notification routing:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'On the Slack settings page, click **Configure** (available once at least one workspace is connected)' },
        { text: 'In the **Notification Routing** dialog, open "Apply to all workspaces" and select the notification types to send' },
        { text: 'Click **Save Changes**' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'The notification types you select apply to every connected workspace.',
    },
    {
      type: 'image',
      src: '/images/user-guide/slack-notifications.png',
      alt: 'Notification routing dialog listing notification types such as Membership and roles, Projects and organizations, Policy reminders and Evidence alerts',
      caption: 'Choose which notification types VerifyWise sends to Slack.',
    },
    {
      type: 'heading',
      id: 'notification-types',
      level: 3,
      text: 'Available notification types',
    },
    {
      type: 'paragraph',
      text: 'You can choose from these notification types:',
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
        { text: 'Go to the Slack settings page' },
        { text: 'Click **Add to Slack**' },
        { text: 'Follow the authorization flow for the new workspace' },
        { text: 'Update notification routing if needed' },
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
        { text: 'Go to the Slack settings page' },
        { text: 'Find the workspace connection in the table' },
        { text: 'Click the delete icon in the Action column' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'The connection is removed as soon as you click delete, without a confirmation step, and notifications to it stop right away. To pause a connection instead, turn it off in the Action column. You can reconnect at any time by going through the authorization flow again.',
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'To stop notifications, turn off or delete the connections in the table before you disable the Slack extension. Disabling the extension hides the Slack settings page but keeps your connections.',
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
        { text: 'Check that the Slack extension is enabled and the connection is active in the connections table' },
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
      text: 'Yes. When you authorize the connection, Slack lets you pick the channel VerifyWise posts to, including private channels you belong to.',
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
          collectionId: 'integrations',
          articleId: 'extensions',
          title: 'Extensions',
          description: 'Enable and configure built-in extensions',
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
