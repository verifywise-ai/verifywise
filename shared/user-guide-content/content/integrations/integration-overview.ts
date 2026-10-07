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
      text: 'Integrations connect VerifyWise with the tools your team already uses. There are three ways to do it:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Extensions', text: 'Built-in connections and tools that an Admin turns on from the **Extensions** page, such as Slack, MLflow and Jira Assets.' },
        { bold: 'API keys', text: 'Tokens that let your own scripts and systems call the VerifyWise API.' },
        { bold: 'Automations', text: 'Trigger-condition-action rules that react to events in VerifyWise.' },
      ],
    },
    {
      type: 'heading',
      id: 'extensions',
      level: 2,
      text: 'Extensions',
    },
    {
      type: 'paragraph',
      text: 'To manage extensions, click the **Extensions** button in the top header, or open **Start here** and click the **Extensions** card. Each extension is off until an Admin enables it.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Only Admins can open the Extensions page. Other roles see the Extensions button greyed out with the tooltip "Admin access required."',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise includes seven extensions:',
    },
    {
      type: 'grid-cards',
      columns: 2,
      items: [
        { title: 'Slack', description: 'Send VerifyWise notifications to channels in your Slack workspace.' },
        { title: 'MLflow', description: 'Pull models and runs from your MLflow tracking server into Model inventory.' },
        { title: 'Azure AI Foundry', description: 'Import model deployments from an Azure AI Foundry project into Model inventory.' },
        { title: 'Model Lifecycle', description: 'Define lifecycle phases, with approvals, documents and people, for each model.' },
        { title: 'Risk Import', description: 'Create many risks at once from an Excel template.' },
        { title: 'Jira Assets Integration', description: 'Import AI System objects from Jira Service Management Assets as use cases.' },
        { title: 'Dataset Bulk Upload', description: 'Upload up to 20 dataset files at once, with PII detection.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'See **Extensions** for how to enable, configure and disable each one, and where it shows up in the app.',
    },
    {
      type: 'heading',
      id: 'api-access',
      level: 2,
      text: 'API access',
    },
    {
      type: 'paragraph',
      text: 'For anything the extensions don\'t cover, use the API. API keys let external applications and scripts work with VerifyWise data. See **API access** for creating and managing keys.',
    },
    {
      type: 'heading',
      id: 'automations',
      level: 2,
      text: 'Automations',
    },
    {
      type: 'paragraph',
      text: 'Automations run actions when something happens in VerifyWise, without code. See **Automations** for the available triggers and actions.',
    },
    {
      type: 'heading',
      id: 'security',
      level: 2,
      text: 'Security considerations',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Limit access', text: 'Only Admins can enable or configure extensions, which reduces the risk of unauthorized changes' },
        { bold: 'Protect credentials', text: 'Passwords and tokens entered in extension settings are stored encrypted. Share them only with the people who need them' },
        { bold: 'Review what you connect', text: 'Understand what each external service can see before you connect it' },
        { bold: 'Turn off what you don\'t use', text: 'Disable extensions you no longer need. Disabling keeps their configuration and data, so you can turn them back on later' },
        { bold: 'Use HTTPS', text: 'Make sure external services such as MLflow use secure HTTPS connections' },
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
      text: 'If an extension isn\'t working as expected:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Check on the Extensions page that it shows the **Enabled** badge' },
        { text: 'Open its settings with **Configure** and check the connection details' },
        { text: 'For MLflow and Azure AI Foundry, click **Test connection**. For Jira Assets, use **Test Connection** in its panel' },
        { text: 'Check that the external service is running and reachable from VerifyWise' },
        { text: 'Read the error message shown on the settings page' },
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
      text: 'Only Admins can open the Extensions page and enable or configure extensions.',
    },
    {
      type: 'heading',
      id: 'faq-multiple-connections',
      level: 3,
      text: 'Can I connect multiple Slack workspaces?',
    },
    {
      type: 'paragraph',
      text: 'Yes. Click **Add to Slack** again to add another workspace or channel.',
    },
    {
      type: 'heading',
      id: 'faq-disconnect',
      level: 3,
      text: 'How do I disconnect an integration?',
    },
    {
      type: 'paragraph',
      text: 'Click **Disable** on the extension\'s card. Its configuration and data are kept. For Slack you can also delete individual workspace connections from the Slack settings panel.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'integrations',
          articleId: 'extensions',
          title: 'Extensions',
          description: 'Enable and configure each extension',
        },
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
        {
          collectionId: 'integrations',
          articleId: 'automations',
          title: 'Automations',
          description: 'Automate governance tasks with rules',
        },
      ],
    },
  ],
};
