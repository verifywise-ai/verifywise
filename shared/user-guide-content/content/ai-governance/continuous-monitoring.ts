import type { ArticleContent } from '../contentTypes';

export const continuousMonitoringContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Continuous Control Monitoring (CCM) automates the verification of your security and compliance controls. Instead of manually checking whether encryption is enabled, MFA is enforced, or branch protection is active, CCM connects to your infrastructure and runs scheduled tests that prove your controls are working.',
    },
    {
      type: 'heading',
      id: 'how-it-works',
      level: 2,
      text: 'How it works',
    },
    {
      type: 'ordered-list',
      items: [
        {
          text: 'Connectors — Integrate with AWS, GitHub, or generic APIs to access your infrastructure data.',
        },
        {
          text: 'Control Tests — Define automated queries or API checks that validate specific controls (e.g., "All S3 buckets must have encryption enabled").',
        },
        {
          text: 'Scheduled Execution — Tests run automatically on a cron schedule you define.',
        },
        {
          text: 'Results & Evidence — Each test produces a pass/fail result with detailed evidence stored for audit trails.',
        },
        {
          text: 'Alerts — Failed tests generate alerts so you can investigate and remediate quickly.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'dashboard',
      level: 2,
      text: 'Dashboard',
    },
    {
      type: 'paragraph',
      text: 'The Dashboard tab gives you an at-a-glance view of your monitoring health. Status cards show how many tests are active, passing, failing, and how many open alerts require attention. Recent test results and alerts are displayed in tables for quick investigation.',
    },
    {
      type: 'heading',
      id: 'connectors',
      level: 2,
      text: 'Connectors',
    },
    {
      type: 'paragraph',
      text: 'Connectors are integrations with external systems. Each connector stores the configuration needed to authenticate and query that system. You can test connector health at any time, and the status reflects whether the connection is working.',
    },
    {
      type: 'bullet-list',
      items: [
        {
          bold: 'AWS',
          text: ' — Connect to AWS accounts to query resources like S3 buckets, IAM users, and security groups.',
        },
        {
          bold: 'GitHub',
          text: ' — Connect to GitHub organizations to verify repository settings like branch protection and access controls.',
        },
        {
          bold: 'Generic API',
          text: ' — Connect to any REST API for custom control checks.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'control-tests',
      level: 2,
      text: 'Control Tests',
    },
    {
      type: 'paragraph',
      text: 'A control test defines what to check, how to check it, and what result is expected. Each test is linked to a connector that provides the data, and uses a query template to extract the relevant information.',
    },
    {
      type: 'bullet-list',
      items: [
        {
          bold: 'Query Template',
          text: ' — The query or API call that retrieves data for validation.',
        },
        {
          bold: 'Expectation Type',
          text: ' — How to evaluate the result (e.g., count equals, greater than, not empty).',
        },
        {
          bold: 'Expectation Config',
          text: ' — JSON configuration for the expectation, such as thresholds.',
        },
        {
          bold: 'Schedule',
          text: ' — Cron expression defining how often the test runs (e.g., every 6 hours).',
        },
      ],
    },
    {
      type: 'heading',
      id: 'alerts',
      level: 2,
      text: 'Alerts',
    },
    {
      type: 'paragraph',
      text: 'When a test fails or encounters an error, an alert is created. Alerts include the severity level, a descriptive message, and a link to the test result evidence. You can acknowledge alerts to track which issues are being investigated, and resolve them once remediation is complete.',
    },
    {
      type: 'heading',
      id: 'best-practices',
      level: 2,
      text: 'Best practices',
    },
    {
      type: 'ordered-list',
      items: [
        {
          text: 'Start with high-risk controls — Prioritize automated tests for controls that map to critical compliance requirements.',
        },
        {
          text: 'Use descriptive test names — Clear names make it easy to understand what failed when alerts fire.',
        },
        {
          text: 'Set appropriate schedules — Run critical tests frequently (e.g., every hour), and lower-priority tests less often (e.g., daily).',
        },
        {
          text: 'Monitor connector health — A connector in error state means all linked tests are skipped. Fix connection issues promptly.',
        },
        {
          text: 'Review results regularly — Even passing tests should be reviewed periodically to ensure they still cover the right scope.',
        },
      ],
    },
  ],
};
