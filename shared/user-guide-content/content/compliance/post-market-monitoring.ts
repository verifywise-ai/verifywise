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
      text: 'Post-market monitoring (PMM) tracks how a high-risk AI system behaves after it goes live. EU AI Act Article 72 requires providers of high-risk AI systems to establish and document a monitoring plan. VerifyWise turns this into a repeatable process: you set a schedule, the system creates monitoring cycles, stakeholders answer structured questions and a PDF report gets generated automatically when a cycle is submitted.',
    },
    {
      type: 'paragraph',
      text: 'PMM lives inside each use case. Open a use case, then go to the **Monitoring** tab to configure it.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Where to find it',
      text: 'Use cases > [your use case] > Monitoring tab. Reports archive is at /monitoring/reports in the main navigation.',
    },

    // =========================================================================
    // How it works
    // =========================================================================
    {
      type: 'heading',
      id: 'how-it-works',
      level: 2,
      text: 'How it works',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'An admin or editor enables monitoring on a use case and sets a schedule (e.g. every 30 days).' },
        { text: 'The system creates a monitoring cycle and assigns it to the use case stakeholder.' },
        { text: 'The assigned stakeholder receives an email with a link to the monitoring form.' },
        { text: 'They open the form, answer each question and can flag concerns along the way.' },
        { text: 'Drafts are saved so they can come back later.' },
        { text: 'When they submit, VerifyWise captures a context snapshot (risk counts, model counts, vendor counts) and generates a PDF report.' },
        { text: 'The report is stored in the reports archive for download at any time.' },
        { text: 'If the cycle isn\'t completed by its due date, a reminder goes out. If it stays overdue past the escalation threshold, the escalation contact gets notified.' },
      ],
    },

    // =========================================================================
    // Enabling monitoring
    // =========================================================================
    {
      type: 'heading',
      id: 'enabling-monitoring',
      level: 2,
      text: 'Enabling monitoring',
    },
    {
      type: 'paragraph',
      text: 'Open a use case and go to the **Monitoring** tab. You\'ll see a card labeled **Post-market monitoring** with a toggle on the right side. The card shows the use case name and references EU AI Act Article 9 and Article 72.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Flip the toggle to enable monitoring.' },
        { text: 'If this is the first time, VerifyWise creates a configuration and seeds it with seven default questions based on EU AI Act requirements.' },
        { text: 'The schedule and questions sections appear below the toggle.' },
        { text: 'You can flip the toggle off at any time to pause monitoring without deleting your configuration or question set.' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Toggling off vs. deleting',
      text: 'Turning the toggle off keeps your schedule and questions intact. It just stops new cycles from being created. Turn it back on whenever you\'re ready.',
    },

    // =========================================================================
    // Configuring the schedule
    // =========================================================================
    {
      type: 'heading',
      id: 'configuring-schedule',
      level: 2,
      text: 'Configuring the schedule',
    },
    {
      type: 'paragraph',
      text: 'Once monitoring is enabled, the **Monitoring schedule** card appears. It uses a two-column layout with the setting name on the left and the input on the right. Here\'s what each field does.',
    },
    {
      type: 'table',
      columns: [
        { key: 'setting', label: 'Setting', width: '25%' },
        { key: 'description', label: 'What it does', width: '50%' },
        { key: 'default', label: 'Default', width: '25%' },
      ],
      rows: [
        { setting: 'Frequency', description: 'How often a new cycle runs. Enter a number (the unit is always days in the current UI).', default: '30 days' },
        { setting: 'Start date', description: 'When the first cycle should begin. If left blank, the first cycle starts immediately.', default: 'None' },
        { setting: 'Notification time', description: 'Hour of the day (00:00 through 23:00) when emails are sent. Pick a time that works for your team\'s time zone.', default: '09:00' },
        { setting: 'Reminder after', description: 'How many days before the due date to send a reminder email to the stakeholder.', default: '3 days' },
        { setting: 'Escalate after', description: 'How many days past the due date before the escalation contact gets notified.', default: '7 days' },
        { setting: 'Escalation contact', description: 'The person who gets notified if a cycle is overdue past the escalation threshold. Dropdown lists all users in your organization.', default: 'None' },
      ],
    },
    {
      type: 'paragraph',
      text: 'After filling in the fields, click **Save configuration** at the bottom right. Changes don\'t take effect until you save.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Don\'t forget to save',
      text: 'Changing a field doesn\'t auto-save. Always click Save configuration before leaving the page.',
    },

    // =========================================================================
    // Monitoring questions
    // =========================================================================
    {
      type: 'heading',
      id: 'monitoring-questions',
      level: 2,
      text: 'Monitoring questions',
    },
    {
      type: 'paragraph',
      text: 'Below the schedule card you\'ll find the **Monitoring questions** card. This is the question set that stakeholders answer during each cycle.',
    },

    {
      type: 'heading',
      id: 'default-questions',
      level: 3,
      text: 'Default questions',
    },
    {
      type: 'paragraph',
      text: 'When you first enable monitoring, VerifyWise creates seven default questions. Six are yes/no questions mapped to EU AI Act articles. The seventh is a free-text field for additional observations.',
    },
    {
      type: 'table',
      columns: [
        { key: 'question', label: 'Question', width: '55%' },
        { key: 'type', label: 'Type', width: '15%' },
        { key: 'article', label: 'EU AI Act ref', width: '15%' },
        { key: 'required', label: 'Required', width: '15%' },
      ],
      rows: [
        { question: 'Have you reviewed all identified risks and their mitigations for this use case?', type: 'Yes/No', article: 'Article 9', required: 'Yes' },
        { question: 'Have you reviewed the connected AI models and their associated risks?', type: 'Yes/No', article: 'Article 9', required: 'Yes' },
        { question: 'Have you reviewed the connected vendors and their associated risks?', type: 'Yes/No', article: 'Article 72', required: 'Yes' },
        { question: 'Have there been any incidents, malfunctions, or unexpected behaviors to report?', type: 'Yes/No', article: 'Article 72', required: 'Yes' },
        { question: 'Have any changes been made to the AI system or its operating environment since the last review?', type: 'Yes/No', article: 'Article 9', required: 'Yes' },
        { question: 'Are all required technical documentation and logs up to date?', type: 'Yes/No', article: 'Article 9', required: 'Yes' },
        { question: 'Any additional concerns or observations to report?', type: 'Text', article: '-', required: 'No' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Default questions are tagged with a **Default** chip. They can be edited but not deleted.',
    },

    {
      type: 'heading',
      id: 'question-types',
      level: 3,
      text: 'Question types',
    },
    {
      type: 'paragraph',
      text: 'Each question has a response type that determines how the stakeholder answers it.',
    },
    {
      type: 'table',
      columns: [
        { key: 'type', label: 'Type', width: '20%' },
        { key: 'behavior', label: 'How it works', width: '80%' },
      ],
      rows: [
        { type: 'Yes/No', behavior: 'Two radio buttons. When the stakeholder selects "No", optional suggestion text appears in a yellow callout to guide them on next steps.' },
        { type: 'Multiple choice', behavior: 'A list of checkboxes. The stakeholder can select one or more options from a predefined set. You must provide at least two options when creating the question.' },
        { type: 'Text response', behavior: 'A multi-line text area for free-form answers. Good for open-ended observations or explanations.' },
      ],
    },

    {
      type: 'heading',
      id: 'adding-a-question',
      level: 3,
      text: 'Adding a question',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Add question** in the top right of the questions card.' },
        { text: 'The question editor modal opens with these fields:' },
        { text: '**Question text** (required). Write the question the stakeholder needs to answer.' },
        { text: '**Response type** (required). Pick Yes/No, Multiple choice or Text response.' },
        { text: 'If you chose Multiple choice, add at least two options using the **Add option** button. Remove an option by clicking the X next to it.' },
        { text: 'If you chose Yes/No, you can add optional **suggestion text** that shows when the answer is "No".' },
        { text: '**EU AI Act reference** (optional). Link the question to a specific article, like "Article 9" or "Article 72". This appears in the PDF report.' },
        { text: '**Required question** checkbox. When checked, the stakeholder must answer this question before submitting.' },
        { text: '**Allow flag for concern** checkbox. When checked, the stakeholder can flag this question for immediate attention during the cycle.' },
        { text: 'Click **Add** to save the question.' },
      ],
    },

    {
      type: 'heading',
      id: 'editing-a-question',
      level: 3,
      text: 'Editing and deleting questions',
    },
    {
      type: 'paragraph',
      text: 'Each question row shows a pencil icon (edit) and a trash icon (delete) on the right side. Click the pencil to open the same editor modal with the question\'s current values pre-filled. Click **Update** to save your changes.',
    },
    {
      type: 'paragraph',
      text: 'Custom questions can be deleted by clicking the trash icon. Default questions can\'t be deleted, only edited.',
    },

    {
      type: 'heading',
      id: 'reordering-questions',
      level: 3,
      text: 'Reordering questions',
    },
    {
      type: 'paragraph',
      text: 'Each question has a drag handle (six-dot grip icon) on the left. Click and drag to reorder. The new order is saved to the server automatically. If the save fails, the order reverts to where it was.',
    },
    {
      type: 'paragraph',
      text: 'Required questions show a **Required** chip. Default questions show a **Default** chip. Each row also displays the question type and EU AI Act reference if one is set.',
    },

    // =========================================================================
    // Monitoring cycles
    // =========================================================================
    {
      type: 'heading',
      id: 'monitoring-cycles',
      level: 2,
      text: 'Monitoring cycles',
    },
    {
      type: 'paragraph',
      text: 'A cycle is one round of monitoring. The system creates cycles automatically based on your schedule. Each cycle has a number (#1, #2, #3...), a due date and a status.',
    },
    {
      type: 'table',
      columns: [
        { key: 'status', label: 'Status', width: '20%' },
        { key: 'meaning', label: 'Meaning', width: '80%' },
      ],
      rows: [
        { status: 'Pending', meaning: 'Cycle is scheduled but the stakeholder hasn\'t started answering yet.' },
        { status: 'In progress', meaning: 'The stakeholder has opened the form and started entering responses.' },
        { status: 'Completed', meaning: 'All required questions answered, form submitted, PDF report generated.' },
        { status: 'Escalated', meaning: 'The cycle wasn\'t completed by the due date and has been flagged to the escalation contact.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Once a cycle is completed, the system doesn\'t create the next one until the notification hour you configured. A new cycle won\'t be created if there\'s already an active (non-completed) cycle.',
    },

    {
      type: 'heading',
      id: 'how-cycles-are-created',
      level: 3,
      text: 'How cycles are created',
    },
    {
      type: 'paragraph',
      text: 'A background job runs every hour. At the notification hour you set, it checks each active configuration:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Is there already an active cycle? If yes, skip.' },
        { text: 'Has the start date passed (or is there no start date set)? If yes, create a new cycle.' },
        { text: 'The due date is calculated by adding the frequency value to the start date (or current date if no start date).' },
        { text: 'The cycle gets assigned to the use case\'s stakeholder.' },
      ],
    },

    {
      type: 'heading',
      id: 'manually-starting-a-cycle',
      level: 3,
      text: 'Manually starting a cycle',
    },
    {
      type: 'paragraph',
      text: 'Admins can trigger a new cycle on demand through the API without waiting for the scheduler. This is useful for ad-hoc reviews or when you need to run an unscheduled check.',
    },

    // =========================================================================
    // Completing the monitoring form
    // =========================================================================
    {
      type: 'heading',
      id: 'completing-the-form',
      level: 2,
      text: 'Completing the monitoring form',
    },
    {
      type: 'paragraph',
      text: 'When a cycle is active, the assigned stakeholder can open the monitoring form at `/monitoring/cycle/{cycleId}`. They can also reach it through the link in the notification email.',
    },

    {
      type: 'heading',
      id: 'form-layout',
      level: 3,
      text: 'Form layout',
    },
    {
      type: 'paragraph',
      text: 'The form page has three sections:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Status bar', text: 'Shows the cycle status (in progress, overdue or completed), the due date and a completion percentage based on required questions answered.' },
        { bold: 'Question cards', text: 'One card per question, numbered sequentially. Each card shows the question text, a required indicator (*) if applicable and the EU AI Act article reference below it.' },
        { bold: 'Action buttons', text: 'Save draft and Submit at the bottom of the page.' },
      ],
    },

    {
      type: 'heading',
      id: 'answering-questions',
      level: 3,
      text: 'Answering questions',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Yes/No questions', text: 'Select one of the two radio buttons. If you pick "No" and the question has suggestion text, a yellow guidance box appears below your answer.' },
        { bold: 'Multiple choice questions', text: 'Check one or more options from the list.' },
        { bold: 'Text response questions', text: 'Type your answer in the multi-line text area.' },
      ],
    },

    {
      type: 'heading',
      id: 'flagging-concerns',
      level: 3,
      text: 'Flagging concerns',
    },
    {
      type: 'paragraph',
      text: 'If a question has **Allow flag for concern** enabled, you\'ll see a **Flag concern** button in the top right corner of the question card. Click it to flag that question. The button turns red with a filled background when active. Click again to un-flag.',
    },
    {
      type: 'paragraph',
      text: 'Flagged questions appear highlighted in the PDF report. They can also trigger an immediate notification to the escalation contact so issues get attention fast.',
    },

    {
      type: 'heading',
      id: 'saving-drafts',
      level: 3,
      text: 'Saving drafts',
    },
    {
      type: 'paragraph',
      text: 'Click **Save draft** to save your progress without submitting. All current answers and flag states are preserved. You can close the browser and come back later. The form shows a "Last saved" timestamp in the status bar after each save.',
    },
    {
      type: 'paragraph',
      text: 'When you reopen the form, your previous answers are loaded automatically.',
    },

    {
      type: 'heading',
      id: 'submitting-the-form',
      level: 3,
      text: 'Submitting the form',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Answer all required questions (marked with *).' },
        { text: 'Review your flags. Make sure anything that needs escalation is flagged.' },
        { text: 'Click **Submit**.' },
        { text: 'If any required questions are unanswered, you\'ll see an error message telling you how many are missing.' },
        { text: 'On success, the system marks the cycle as completed, captures a context snapshot and generates a PDF report.' },
        { text: 'You\'re redirected back to the previous page after a brief confirmation message.' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Submission is final',
      text: 'Once submitted, you can\'t edit the responses. The form switches to read-only view showing the completion date and who submitted it.',
    },

    // =========================================================================
    // Context snapshot
    // =========================================================================
    {
      type: 'heading',
      id: 'context-snapshot',
      level: 2,
      text: 'Context snapshot',
    },
    {
      type: 'paragraph',
      text: 'When a cycle is submitted, VerifyWise captures a snapshot of the use case\'s current state. This snapshot is stored with the report so you can track how the risk profile changes over time.',
    },
    {
      type: 'paragraph',
      text: 'The snapshot includes:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Use case title and current status' },
        { text: 'Total risk count and breakdown by level (high, medium, low)' },
        { text: 'Number of linked AI models and their risk count' },
        { text: 'Number of linked vendors and their risk count' },
        { text: 'Timestamp of when the snapshot was taken' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Comparing snapshots across cycles #1, #2, #3 etc. gives you a clear trend line of whether risk is increasing, stable or decreasing.',
    },

    // =========================================================================
    // PDF reports
    // =========================================================================
    {
      type: 'heading',
      id: 'pdf-reports',
      level: 2,
      text: 'PDF reports',
    },
    {
      type: 'paragraph',
      text: 'A PDF is generated automatically when a cycle is submitted. The report is rendered from an HTML template using Playwright (headless Chromium) and uploaded to VerifyWise\'s file storage.',
    },
    {
      type: 'paragraph',
      text: 'Each report includes:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Organization name and logo (if configured)' },
        { text: 'Use case title and ID' },
        { text: 'Cycle number and completion date' },
        { text: 'Name of who completed the cycle' },
        { text: 'The full context snapshot (risks, models, vendors)' },
        { text: 'Every question with its response' },
        { text: 'Flagged concerns highlighted visually' },
        { text: 'EU AI Act article references for each question' },
        { text: 'A summary of all referenced EU AI Act articles' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Report filenames follow the pattern `PMM_Report_{UseCaseTitle}_Cycle{N}_{timestamp}.pdf`.',
    },

    // =========================================================================
    // Reports archive
    // =========================================================================
    {
      type: 'heading',
      id: 'reports-archive',
      level: 2,
      text: 'Reports archive',
    },
    {
      type: 'paragraph',
      text: 'The reports archive page is at `/monitoring/reports`. It shows a filterable, paginated table of all completed monitoring reports across your use cases.',
    },

    {
      type: 'heading',
      id: 'archive-filters',
      level: 3,
      text: 'Filters',
    },
    {
      type: 'paragraph',
      text: 'The filter bar at the top lets you narrow results:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Date range', text: 'Pick a "From" and "To" date to filter by completion date. The system validates that "From" isn\'t after "To".' },
        { bold: 'Flagged only', text: 'Check this box to show only reports where at least one question was flagged for concern.' },
        { bold: 'Reset filters', text: 'A text button that appears when any filter is active. Click it to clear all filters.' },
      ],
    },

    {
      type: 'heading',
      id: 'archive-table',
      level: 3,
      text: 'Table columns',
    },
    {
      type: 'table',
      columns: [
        { key: 'column', label: 'Column', width: '25%' },
        { key: 'description', label: 'What it shows', width: '75%' },
      ],
      rows: [
        { column: 'Use case', description: 'The name of the use case the report belongs to.' },
        { column: 'Cycle', description: 'The cycle number (e.g. #1, #2, #3).' },
        { column: 'Completed', description: 'The date the cycle was submitted (e.g. "Apr 15, 2026").' },
        { column: 'By', description: 'The name of the person who submitted the cycle.' },
        { column: 'Flagged', description: 'A red flag icon if any questions were flagged. A dash (-) if none were flagged.' },
        { column: 'Actions', description: 'A Download button that saves the PDF to your computer.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Pagination controls at the bottom let you pick 5, 10, 25 or 50 rows per page.',
    },

    // =========================================================================
    // Email notifications
    // =========================================================================
    {
      type: 'heading',
      id: 'email-notifications',
      level: 2,
      text: 'Email notifications',
    },
    {
      type: 'paragraph',
      text: 'The background scheduler handles all email notifications through the BullMQ automation queue. Five types of emails are sent during the monitoring lifecycle.',
    },
    {
      type: 'table',
      columns: [
        { key: 'type', label: 'Email type', width: '20%' },
        { key: 'when', label: 'When it\'s sent', width: '40%' },
        { key: 'recipient', label: 'Who receives it', width: '40%' },
      ],
      rows: [
        { type: 'Initial', when: 'On the start day of a new cycle, or if reminder threshold is already hit', recipient: 'The assigned stakeholder' },
        { type: 'Reminder', when: 'N days before the due date (based on your "Reminder after" setting)', recipient: 'The assigned stakeholder' },
        { type: 'Escalation', when: 'N days after the due date (based on your "Escalate after" setting)', recipient: 'The escalation contact' },
        { type: 'Flagged concern', when: 'Immediately when a response is flagged during the cycle', recipient: 'The escalation contact' },
        { type: 'Completion', when: 'When the cycle is fully submitted', recipient: 'The stakeholder and relevant parties' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Each email includes a direct link to the monitoring form so the recipient can open it with one click. The scheduler runs every hour and checks all active configurations at their configured notification hour.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'No duplicate emails',
      text: 'The system tracks when reminders and escalations are sent. Each cycle only gets one reminder email and one escalation email.',
    },

    // =========================================================================
    // Stakeholder reassignment
    // =========================================================================
    {
      type: 'heading',
      id: 'stakeholder-reassignment',
      level: 2,
      text: 'Stakeholder reassignment',
    },
    {
      type: 'paragraph',
      text: 'If the person assigned to a cycle is unavailable, an admin can reassign it to a different team member. The new stakeholder will receive future notifications for that cycle. Previous responses (if any) are preserved.',
    },

    // =========================================================================
    // Roles and permissions
    // =========================================================================
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
        { action: 'View monitoring configuration and questions', roles: 'Admin, Editor or Auditor' },
        { action: 'Enable/disable monitoring', roles: 'Admin or Editor' },
        { action: 'Configure schedule settings', roles: 'Admin or Editor' },
        { action: 'Add, edit, delete or reorder questions', roles: 'Admin or Editor' },
        { action: 'Answer monitoring questions and submit cycles', roles: 'Admin or Editor' },
        { action: 'View and download reports', roles: 'Admin, Editor or Auditor' },
        { action: 'Reassign stakeholders', roles: 'Admin' },
        { action: 'Manually start a new cycle', roles: 'Admin' },
      ],
    },
    {
      type: 'paragraph',
      text: 'When a user with view-only access (Auditor) opens the monitoring tab, the schedule and question cards appear dimmed with a **View only** chip. All inputs are disabled.',
    },

    // =========================================================================
    // Tips
    // =========================================================================
    {
      type: 'heading',
      id: 'tips',
      level: 2,
      text: 'Tips for effective monitoring',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Start with the defaults.', text: 'The seven default questions cover the core EU AI Act requirements. Try them for a few cycles before customizing.' },
        { bold: 'Keep the question count manageable.', text: 'Long forms lead to rushed answers. Aim for 8-12 questions total.' },
        { bold: 'Use the flag feature.', text: 'Flags create a fast path from observation to action. Encourage stakeholders to flag anything that needs follow-up, not just serious issues.' },
        { bold: 'Set a realistic frequency.', text: 'High-risk systems in production might need monthly cycles. Lower-risk systems could use quarterly checks.' },
        { bold: 'Review the context snapshots.', text: 'The risk counts captured with each cycle let you spot trends. If high-risk counts are climbing, investigate before the next cycle.' },
        { bold: 'Name your escalation contact.', text: 'Without one, overdue cycles go unnoticed. Pick someone with authority to act.' },
        { bold: 'Use EU AI Act references.', text: 'Mapping questions to specific articles makes the PDF report audit-ready.' },
      ],
    },

    // =========================================================================
    // Related articles
    // =========================================================================
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
          description: 'Risk data that feeds into monitoring snapshots.',
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
