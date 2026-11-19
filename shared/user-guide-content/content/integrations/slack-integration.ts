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
      text: 'The Slack integration posts VerifyWise notifications to channels in your Slack workspace, such as membership changes, new use cases, deadline reminders and policy review reminders. Your team sees them without opening VerifyWise.',
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
        { bold: 'Receive notifications', text: 'Get VerifyWise notifications in the Slack channels you pick' },
        { bold: 'Choose what to send', text: 'Pick which notification types each channel receives' },
        { bold: 'Multiple channels', text: 'Connect more than one channel or workspace' },
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
        { text: 'Click **Add to Slack**. The same browser tab opens Slack' },
        { text: 'Select the Slack workspace and the channel VerifyWise should post to' },
        { text: 'Review the permissions and click **Allow**' },
        { text: 'Slack sends you back to the Slack settings page, which shows "Slack connected." and the new connection in the table' },
      ],
    },
    {
      type: 'paragraph',
      text: 'If you cancel in Slack, VerifyWise shows a message and saves nothing. Finish the sign-in in the tab where you clicked **Add to Slack**: VerifyWise checks that the reply from Slack belongs to that tab and refuses it otherwise.',
    },
    {
      type: 'paragraph',
      text: 'A new connection receives no notifications until you choose its routing, as described under **Notification routing** below.',
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
      text: 'VerifyWise requests these permissions for its Slack app:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'incoming-webhook', text: 'Post messages to the channel you pick during authorization' },
        { bold: 'chat:write', text: 'Send messages as the VerifyWise app' },
        { bold: 'chat:write.public', text: 'Send messages to public channels the app has not joined' },
        { bold: 'channels:read, groups:read', text: 'See basic details of public and private channels, such as their names' },
      ],
    },
    {
      type: 'paragraph',
      text: 'It also asks for these permissions on behalf of the person who adds Slack:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'channels:read, groups:read', text: 'Look up the channel you pick' },
        { bold: 'groups:write.invites', text: 'Add the VerifyWise app to that channel when it is private' },
      ],
    },
    {
      type: 'paragraph',
      text: 'These permissions let VerifyWise post notifications to the channel you pick. They don\'t let it read your messages.',
    },
    {
      type: 'heading',
      id: 'managing-connections',
      level: 2,
      text: 'Managing Slack connections',
    },
    {
      type: 'paragraph',
      text: 'Slack connections belong to the organization. Only Admins manage them, and every Admin sees the same list on the Slack settings page:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click the **Extensions** button in the top header' },
        { text: 'Click **Configure** on the Slack card' },
        { text: 'View the organization\'s connected workspaces and their status in the table' },
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
        { bold: 'Team name', text: 'The Slack workspace' },
        { bold: 'Channel', text: 'The channel VerifyWise posts to' },
        { bold: 'Notification routing', text: 'The notification types the channel receives, or "None"' },
        { bold: 'Created', text: 'When the connection was added' },
        { bold: 'Status', text: 'Active or Inactive' },
        { bold: 'Actions', text: 'Edit routing, turn the connection off or on, or remove it' },
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
      text: 'Routing decides which notification types a connection receives. Each connection has its own routing, so different channels can get different notifications. To set it:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'On the Slack settings page, find the connection in the table' },
        { text: 'Click the **Edit routing** button in the Actions column. The dialog opens with the types the connection receives now' },
        { text: 'Select the notification types this channel should receive' },
        { text: 'Click **Save**. The dialog closes once the routing is saved. If saving fails, the error shows in the dialog and nothing changes' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Connections added before organization ownership',
      text: 'A connection added before Slack connections belonged to the organization shows "Posts only its owner\'s events until you save its routing." under its team name. It posts only events of the person who added it. Once you save its routing, it posts events for the whole organization.',
    },
    {
      type: 'image',
      src: '/images/user-guide/slack-notifications.png',
      alt: 'Notification routing dialog listing notification types such as Membership and roles, Projects and organizations, Policy reminders and status, and Evidence and task alerts',
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
      text: 'VerifyWise sends these messages for each type today:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Membership and roles', text: 'A message when a user\'s details or role are updated, naming their role' },
        { bold: 'Projects and organizations', text: 'A message when someone creates a use case' },
        { bold: 'Policy reminders and status', text: 'Policy review reminders for the policy\'s owner and reviewers' },
        { bold: 'Evidence and task alerts', text: 'A reminder one day before a risk or model risk deadline' },
        { bold: 'Control or policy changes', text: 'Listed in the dialog, but VerifyWise does not send any messages of this type yet' },
      ],
    },
    {
      type: 'heading',
      id: 'adding-workspace',
      level: 2,
      text: 'Adding another channel or workspace',
    },
    {
      type: 'paragraph',
      text: 'Each time you go through **Add to Slack**, you add one connection for the channel you pick. To add another:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to the Slack settings page' },
        { text: 'Click **Add to Slack**' },
        { text: 'Pick the workspace and channel in Slack, then click **Allow**' },
        { text: 'Set the new connection\'s routing' },
      ],
    },
    {
      type: 'heading',
      id: 'turning-off-connection',
      level: 2,
      text: 'Turning a connection off',
    },
    {
      type: 'paragraph',
      text: 'To pause a connection without removing it, click the **Turn off** button in its Actions column. Its status changes to Inactive and it receives nothing until you click **Turn on**. Its routing is kept.',
    },
    {
      type: 'heading',
      id: 'removing-connection',
      level: 2,
      text: 'Removing a Slack connection',
    },
    {
      type: 'paragraph',
      text: 'To remove a connection:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to the Slack settings page' },
        { text: 'Find the connection in the table' },
        { text: 'Click the **Remove** button in the Actions column' },
        { text: 'Confirm with **Remove**. The dialog names the channel and workspace that will stop receiving notifications' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Notifications to that channel stop as soon as the connection is removed. To use the channel again, add it with **Add to Slack**.',
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'To stop notifications, turn off or remove the connections in the table before you disable the Slack extension. Disabling the extension hides the Slack settings page but keeps your connections.',
    },
    {
      type: 'heading',
      id: 'unlinked-connections',
      level: 2,
      text: 'Unlinked connections',
    },
    {
      type: 'paragraph',
      text: 'Some connections were created before Slack connections belonged to an organization. VerifyWise could not tell which organization they belong to. This happens when the person who added them was a member of several organizations, or of none. These connections send nothing.',
    },
    {
      type: 'paragraph',
      text: 'If you added any of them, the Slack settings page lists them under **Unlinked connections**, below the main table. Only you see your own. You can\'t link one to an organization: click **Remove**, confirm, and then add the channel again with **Add to Slack** if you need it again.',
    },
    {
      type: 'paragraph',
      text: 'Unlinked connections whose owner no longer has an account were deleted automatically during an update, since no one could see or remove them.',
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
        { text: 'Check that the Slack extension is enabled and the connection\'s status is Active' },
        { text: 'Check that the connection\'s routing includes the notification type. A new connection receives nothing until you set its routing' },
        { text: 'If the connection says it posts only its owner\'s events, save its routing' },
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
        { text: '"This Slack sign-in could not be verified" means the reply from Slack did not match the tab you started in. Click **Add to Slack** again and finish in the same tab' },
        { text: '"Slack did not accept the authorization code" means the sign-in expired or was already used. Click **Add to Slack** again' },
        { text: '"Slack did not grant the permissions VerifyWise needs" means Slack returned without the permissions listed above. Click **Add to Slack** again and allow every permission' },
        { text: '"Slack rejected the return address" means the server setting `FRONTEND_URL` differs from the address you open VerifyWise at. Ask the person who runs your VerifyWise server to correct it' },
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
      text: 'Membership and use case messages go out when the change happens. Deadline and policy review reminders come from scheduled checks, so they arrive when the check runs.',
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
