import type { ArticleContent } from '../../contentTypes';

export const automationsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Automations let you set up rules that run when something happens in VerifyWise. Instead of sending routine updates by hand, you choose a trigger and an action. VerifyWise handles the rest.',
    },
    {
      type: 'heading',
      id: 'how-they-work',
      level: 2,
      text: 'How automations work',
    },
    {
      type: 'paragraph',
      text: 'Each automation has 2 parts:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Trigger', text: 'What event starts the automation: a vendor, model, project, task, risk, training, policy or incident is added, updated or deleted; a vendor review date is approaching; a scheduled report is due; or an AI Detection scan finishes, finds new high-risk findings, or fails.' },
        { bold: 'Action', text: 'What happens when the trigger fires. Today the available action is Send email, which emails the recipients you choose. For update triggers, the email can include a summary of the fields that changed.' },
      ],
    },
    {
      type: 'heading',
      id: 'creating',
      level: 2,
      text: 'Creating an automation',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to **Automations** from the sidebar.' },
        { text: 'Click **New automation**.' },
        { text: 'Give it a name and description.' },
        { text: 'Select a trigger event from the dropdown.' },
        { text: 'Configure the trigger if it has settings, for example how many days before a vendor review date to notify, or the schedule and scope of a scheduled report.' },
        { text: 'Choose the action and configure its parameters.' },
        { text: 'Toggle the automation **Active** and click **Save**.' },
      ],
    },
    {
      type: 'heading',
      id: 'managing',
      level: 2,
      text: 'Managing automations',
    },
    {
      type: 'paragraph',
      text: 'The automations list shows all your rules with their name, trigger, status (active or inactive) and last run time. You can toggle automations on and off without deleting them, edit their configuration or remove them entirely.',
    },
    {
      type: 'heading',
      id: 'ai-detection-triggers',
      level: 2,
      text: 'AI Detection triggers',
    },
    {
      type: 'paragraph',
      text: 'The AI Detection triggers have no settings. "Finds new high-risk findings" fires when a scan has high-risk findings, exposed secrets included, that the previous scan of the same repository did not have. Their emails can use these variables: `{{scan.repository}}`, `{{scan.url}}`, `{{scan.findings_count}}`, `{{scan.high_risk_count}}`, `{{scan.secret_count}}`, `{{scan.grade}}`, `{{scan.score}}`, `{{scan.previous_grade}}`, `{{scan.new_high_risk_count}}`, `{{scan.new_high_risk_findings}}`, `{{scan.new_secret_count}}`, `{{scan.trigger}}` and, for failed scans, `{{scan.error}}`. A grade or score that could not be calculated shows as "Not calculated".',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Start simple',
      text: 'Begin with a single automation for your most common manual task. Once you see it working, create more. An automation runs on every event of its trigger type, so pick recipients who need every update.',
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
        { action: 'View automations', roles: 'Any authenticated user' },
        { action: 'Create, edit or delete automations', roles: 'Admin' },
        { action: 'Toggle automations on/off', roles: 'Admin' },
      ],
    },
  ],
};
