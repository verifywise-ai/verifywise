import type { ArticleContent } from '../../contentTypes';

export const postMarketMonitoringContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Post-market Monitoring (PMM) is how you keep track of a high-risk AI system after it goes live. EU AI Act Article 72 requires providers of high-risk AI systems to establish and document a monitoring plan. VerifyWise automates this with recurring monitoring cycles, structured question-based assessments, automatic reminders, and PDF report generation.',
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
        { text: 'You configure a monitoring schedule for a project (e.g., every 30 days).' },
        { text: 'When a cycle is due, the assigned stakeholder gets an email notification.' },
        { text: 'They open the monitoring form and answer a set of structured questions about the system\'s current state.' },
        { text: 'If any concerns are flagged, an escalation email goes to the designated contact.' },
        { text: 'Once complete, a PDF report is generated and stored for audit purposes.' },
      ],
    },
    {
      type: 'heading',
      id: 'configuration',
      level: 2,
      text: 'Setting up monitoring',
    },
    {
      type: 'paragraph',
      text: 'Open a project and go to the **Monitoring** tab. If monitoring hasn\'t been configured yet, you\'ll see the setup form.',
    },
    {
      type: 'table',
      columns: [
        { key: 'setting', label: 'Setting', width: '30%' },
        { key: 'description', label: 'What it does', width: '70%' },
      ],
      rows: [
        { setting: 'Frequency', description: 'How often cycles run (e.g., every 30 days, every 2 weeks, every 3 months)' },
        { setting: 'Start date', description: 'When the first cycle should begin' },
        { setting: 'Reminder days', description: 'How many days before the due date to send a reminder email' },
        { setting: 'Escalation days', description: 'How many days past the due date before escalating to the designated contact' },
        { setting: 'Escalation contact', description: 'Who gets notified if a cycle is overdue' },
        { setting: 'Notification hour', description: 'What time of day to send email notifications' },
        { setting: 'Active', description: 'Toggle monitoring on or off without deleting the configuration' },
      ],
    },
    {
      type: 'heading',
      id: 'cycles',
      level: 2,
      text: 'Monitoring cycles',
    },
    {
      type: 'paragraph',
      text: 'Each cycle represents one round of monitoring. Cycles move through these statuses:',
    },
    {
      type: 'table',
      columns: [
        { key: 'status', label: 'Status', width: '20%' },
        { key: 'meaning', label: 'Meaning', width: '80%' },
      ],
      rows: [
        { status: 'Pending', meaning: 'Cycle is scheduled but not yet started' },
        { status: 'In progress', meaning: 'Stakeholder has started answering the monitoring questions' },
        { status: 'Completed', meaning: 'All questions answered and report generated' },
        { status: 'Escalated', meaning: 'Cycle was not completed by the due date and has been escalated' },
      ],
    },
    {
      type: 'heading',
      id: 'questions',
      level: 2,
      text: 'Monitoring questions',
    },
    {
      type: 'paragraph',
      text: 'Each cycle presents a set of structured questions. Questions can be:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Yes/No', text: 'Simple binary questions with optional suggestion text shown when the answer is "No"' },
        { bold: 'Multi-select', text: 'Choose one or more options from a predefined list' },
        { bold: 'Multi-line text', text: 'Free-form responses for detailed explanations' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Questions can be flagged for concern. When a response is flagged, it appears highlighted in the report and can trigger an immediate notification to the escalation contact.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'EU AI Act article mapping',
      text: 'Each question can be linked to a specific EU AI Act article (e.g., Article 72). This mapping appears in the PDF report so auditors can see which regulatory requirement each question addresses.',
    },
    {
      type: 'heading',
      id: 'metrics',
      level: 2,
      text: 'Tracked metrics',
    },
    {
      type: 'paragraph',
      text: 'Each cycle captures a snapshot of the project\'s current state:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Risk counts by level (high, medium, low)' },
        { text: 'Number of linked models and vendors' },
        { text: 'Model and vendor risk counts' },
        { text: 'Use case status at the time of the cycle' },
      ],
    },
    {
      type: 'paragraph',
      text: 'These snapshots let you track how the project\'s risk profile changes over time across multiple monitoring cycles.',
    },
    {
      type: 'heading',
      id: 'reports',
      level: 2,
      text: 'Reports',
    },
    {
      type: 'paragraph',
      text: 'When a cycle is completed, VerifyWise generates a PDF report containing the organization name, use case, cycle number, completion date, the context snapshot, all responses, flagged concerns, and the mapped EU AI Act articles. You can download reports from the Monitoring tab.',
    },
    {
      type: 'heading',
      id: 'email-notifications',
      level: 2,
      text: 'Email notifications',
    },
    {
      type: 'paragraph',
      text: 'The system sends 5 types of email notifications during the monitoring lifecycle:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Initial notification', text: 'Sent when a new cycle is assigned to a stakeholder' },
        { bold: 'Reminder', text: 'Sent N days before the cycle is due (configurable)' },
        { bold: 'Escalation', text: 'Sent to the escalation contact when a cycle is overdue' },
        { bold: 'Flagged concern', text: 'Sent immediately when a response is flagged as a concern' },
        { bold: 'Completion', text: 'Sent when a cycle is fully completed' },
      ],
    },
    {
      type: 'heading',
      id: 'roles',
      level: 2,
      text: 'Who can do what',
    },
    {
      type: 'table',
      columns: [
        { key: 'action', label: 'Action', width: '50%' },
        { key: 'roles', label: 'Required role', width: '50%' },
      ],
      rows: [
        { action: 'View monitoring cycles and reports', roles: 'Any authenticated user' },
        { action: 'Configure monitoring settings', roles: 'Admin or Editor' },
        { action: 'Answer monitoring questions', roles: 'Admin or Editor' },
        { action: 'Download reports', roles: 'Any authenticated user' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'compliance',
          articleId: 'eu-ai-act',
          title: 'EU AI Act compliance',
          description: 'Understand the regulatory context for post-market monitoring.',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'The risk data that feeds into monitoring snapshots.',
        },
        {
          collectionId: 'compliance',
          articleId: 'fria',
          title: 'Fundamental Rights Impact Assessment',
          description: 'Another EU AI Act compliance assessment that complements monitoring.',
        },
      ],
    },
  ],
};
