import type { ArticleContent } from '../../contentTypes';

export const notificationsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise sends notifications to keep you informed about governance activities. They help make sure team members know about updates, deadlines and actions that need attention.',
    },
    {
      type: 'heading',
      id: 'notification-types',
      level: 2,
      text: 'Types of notifications',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise can notify you about various governance events. The categories below are the user-facing groupings; the underlying notification types are managed centrally and routed by the system to the appropriate channel:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Model updates', text: 'Changes to AI models in your inventory' },
        { bold: 'Risk assessments', text: 'New risks identified or risk status changes' },
        { bold: 'Compliance changes', text: 'Updates to assessment progress or control status' },
        { bold: 'Policy updates', text: 'Changes to policy status or upcoming reviews' },
        { bold: 'Vendor changes', text: 'Vendor status updates or new vendor risks' },
        { bold: 'Training reminders', text: 'Training programs approaching or past due' },
      ],
    },
    {
      type: 'heading',
      id: 'slack-notifications',
      level: 2,
      text: 'Slack notifications',
    },
    {
      type: 'paragraph',
      text: 'The main way to get notifications from VerifyWise is through the Slack integration. When it\'s set up, VerifyWise sends real-time notifications to your Slack workspace.',
    },
    {
      type: 'paragraph',
      text: 'To set up Slack notifications:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to Integrations from the main menu' },
        { text: 'Click on the Slack integration card' },
        { text: 'Authorize VerifyWise to connect to your Slack workspace' },
        { text: 'Pick which channels should receive notifications' },
        { text: 'Set up notification routing for different event types' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Only admins can configure the Slack integration. Once it\'s set up, notifications go to the designated channels for everyone to see.',
    },
    {
      type: 'heading',
      id: 'notification-routing',
      level: 2,
      text: 'Notification routing',
    },
    {
      type: 'paragraph',
      text: 'With the Slack integration, you can send different notification types to different channels. This keeps things organized so team members see the updates that matter to them.',
    },
    {
      type: 'paragraph',
      text: 'Example routing setups:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: '#ai-governance', text: 'All governance-related notifications' },
        { bold: '#compliance-team', text: 'Compliance assessment updates and deadlines' },
        { bold: '#risk-alerts', text: 'New risks and critical risk updates' },
        { bold: '#model-updates', text: 'Model inventory changes and lifecycle events' },
      ],
    },
    {
      type: 'heading',
      id: 'in-app-indicators',
      level: 2,
      text: 'In-app indicators',
    },
    {
      type: 'paragraph',
      text: 'On top of external notifications, VerifyWise shows visual indicators within the platform to flag items that need attention:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Dashboard widgets', text: 'Priority indicators and status charts on the main dashboard' },
        { bold: 'Status badges', text: 'Visual badges showing item status throughout the platform' },
        { bold: 'Review dates', text: 'Policies and assessments show when reviews are due' },
        { bold: 'Risk severity', text: 'Color-coded indicators for risk levels' },
      ],
    },
    {
      type: 'heading',
      id: 'staying-informed',
      level: 2,
      text: 'Staying informed',
    },
    {
      type: 'paragraph',
      text: 'To stay on top of your governance program:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Check the dashboard regularly', text: 'It gives you a real-time overview of your governance status' },
        { bold: 'Set up Slack integration', text: 'Get notifications in the tool you already use every day' },
        { bold: 'Review status cards', text: 'Status breakdowns help you spot areas that need attention' },
        { bold: 'Watch review dates', text: 'Keep track of when policies and assessments need review' },
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
      id: 'faq-email-notifications',
      level: 3,
      text: 'Does VerifyWise send email notifications?',
    },
    {
      type: 'paragraph',
      text: 'Slack is the main notification channel right now. Email is used for account-related things like invitations and password resets, but not for governance notifications.',
    },
    {
      type: 'heading',
      id: 'faq-disable-notifications',
      level: 3,
      text: 'Can I turn off certain notifications?',
    },
    {
      type: 'paragraph',
      text: 'Notification filtering is handled through the Slack integration settings. You can configure which types are sent and which channels receive them. Talk to your admin to adjust notification settings.',
    },
    {
      type: 'heading',
      id: 'faq-who-receives',
      level: 3,
      text: 'Who receives notifications?',
    },
    {
      type: 'paragraph',
      text: 'Slack notifications go to channels, so anyone with access to those channels sees them. Channel membership is managed in Slack. In-app indicators are visible to all users who can view the relevant content.',
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
          collectionId: 'reporting',
          articleId: 'dashboard-analytics',
          title: 'Dashboard overview',
          description: 'Monitor governance status',
        },
      ],
    },
  ],
};
