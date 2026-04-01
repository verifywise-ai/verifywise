import type { ArticleContent } from '../../contentTypes';

export const intakeFormsContent: ArticleContent = {
  blocks: [
    {
      type: 'time-estimate',
      text: '12 min read',
    },
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Intake forms let anyone in your organization request a new AI use case or register a model without needing a VerifyWise account. You publish a public form, share the link, and submissions land in your governance queue for review. When you approve a submission, VerifyWise creates the use case or model inventory entry and carries over the risk score from the intake.',
    },
    {
      type: 'paragraph',
      text: 'Without this, the gap between "someone wants to launch an AI project" and "the governance team finds out" usually gets filled by ad hoc emails or a spreadsheet that nobody updates. Intake forms replace that with a repeatable path: request, score, review, approve or reject.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Intake forms are publicly accessible and do not require authentication. Submitters fill out the form in their browser and receive email updates as their submission moves through review.',
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
        { bold: 'Build', text: 'Create a form in the drag-and-drop builder. Choose field types, set validation rules, and map fields to entity properties.' },
        { bold: 'Brand', text: 'Customize the look with your organization\'s colors, logo, and typography.' },
        { bold: 'Publish', text: 'One click generates a public URL. Share it internally, embed it in a wiki, or send it via email.' },
        { bold: 'Collect', text: 'Submissions arrive with automatic risk scoring. If an LLM key is connected, the system also runs an LLM-based risk analysis on top.' },
        { bold: 'Review', text: 'Approve or reject each submission. Approvals create governed entities instantly. Rejections send the submitter a pre-filled resubmission link.' },
      ],
    },
    {
      type: 'heading',
      id: 'use-cases',
      level: 2,
      text: 'When to use intake forms',
    },
    {
      type: 'paragraph',
      text: 'A few scenarios where intake forms tend to pay off:',
    },
    {
      type: 'heading',
      id: 'use-case-new-ai-project',
      level: 3,
      text: 'New AI project requests',
    },
    {
      type: 'paragraph',
      text: 'A product team wants to build a recommendation engine. Rather than filing a ticket or sending a Slack message that gets lost in a thread, they fill out the intake form: what the system does, what data it uses, who it affects, what it decides. The governance team gets the request with a risk score already attached.',
    },
    {
      type: 'heading',
      id: 'use-case-vendor-ai-tools',
      level: 3,
      text: 'Vendor AI tool registration',
    },
    {
      type: 'paragraph',
      text: 'Marketing buys a third-party content generation tool. The intake form captures the vendor name, what data the tool touches, whether it makes decisions on its own, and how many people are affected. Governance reviews it before the tool goes live across the company.',
    },
    {
      type: 'heading',
      id: 'use-case-model-registration',
      level: 3,
      text: 'Model inventory registration',
    },
    {
      type: 'paragraph',
      text: 'Data science teams ship models regularly. An intake form set up for model inventory collects the model name, version, training data description, intended use, and provider. Approved submissions go straight into the model inventory with risk metadata carried over.',
    },
    {
      type: 'heading',
      id: 'use-case-department-self-service',
      level: 3,
      text: 'Department self-service',
    },
    {
      type: 'paragraph',
      text: 'HR is piloting AI resume screening. Finance is testing automated fraud detection. Every department fills out the same intake form, so the governance team can compare risk and compliance exposure on equal terms instead of parsing different request formats from each group.',
    },
    {
      type: 'heading',
      id: 'use-case-external-partner-intake',
      level: 3,
      text: 'External partner intake',
    },
    {
      type: 'paragraph',
      text: 'A consulting firm or system integrator is deploying AI on your behalf. Since intake forms require no login, external partners can submit their project details directly without getting access to your internal systems.',
    },
    {
      type: 'heading',
      id: 'use-case-compliance-pre-screening',
      level: 3,
      text: 'Compliance pre-screening',
    },
    {
      type: 'paragraph',
      text: 'Before a team spends months building an AI system, an intake form can flag whether the project falls into a high-risk category under the EU AI Act or triggers GDPR obligations. The risk scoring gives teams early feedback on what compliance work lies ahead.',
    },
    {
      type: 'heading',
      id: 'creating-a-form',
      level: 2,
      text: 'Creating a form',
    },
    {
      type: 'paragraph',
      text: 'Navigate to the **Intake forms** page from the sidebar and click **Create form**. You will choose:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Form name', text: 'Descriptive title shown to submitters at the top of the form' },
        { bold: 'Description', text: 'Optional context about what the form is for' },
        { bold: 'Entity type', text: 'Whether approved submissions create a **Use case** or a **Model inventory** entry' },
      ],
    },
    {
      type: 'paragraph',
      text: 'After creation, the form builder opens with your chosen entity type\'s default fields pre-loaded.',
    },
    {
      type: 'heading',
      id: 'default-fields',
      level: 3,
      text: 'Default fields',
    },
    {
      type: 'paragraph',
      text: 'New use case forms start with six fields that are already mapped to entity properties:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Use case name (mapped to project title)' },
        { text: 'What does this AI system do? (mapped to description)' },
        { text: 'What business goal does this serve? (mapped to goal)' },
        { text: 'AI risk classification (mapped to risk classification)' },
        { text: 'Does this system make autonomous decisions?' },
        { text: 'What type of personal data does this process?' },
      ],
    },
    {
      type: 'paragraph',
      text: 'You can keep all of these, remove the ones you don\'t need, or add your own. Model inventory forms have their own set of defaults (model name, version, provider, intended use, and risk level).',
    },
    {
      type: 'heading',
      id: 'form-builder',
      level: 2,
      text: 'The form builder',
    },
    {
      type: 'paragraph',
      text: 'The builder has three areas: a **field palette** on the left, the **form canvas** in the center, and a **settings panel** on the right.',
    },
    {
      type: 'heading',
      id: 'field-types',
      level: 3,
      text: 'Field types',
    },
    {
      type: 'paragraph',
      text: 'Drag any field type from the palette onto the canvas:',
    },
    {
      type: 'table',
      columns: [
        { key: 'type', label: 'Type', width: '20%' },
        { key: 'description', label: 'Description', width: '45%' },
        { key: 'example', label: 'Example use', width: '35%' },
      ],
      rows: [
        { type: 'Text', description: 'Single-line text input', example: 'Project name, owner name' },
        { type: 'Textarea', description: 'Multi-line text for longer responses', example: 'System description, business justification' },
        { type: 'Email', description: 'Email address with format validation', example: 'Technical contact email' },
        { type: 'URL', description: 'Web address with URL validation', example: 'Repository link, documentation URL' },
        { type: 'Number', description: 'Numeric value with min/max bounds', example: 'Number of affected users, budget' },
        { type: 'Date', description: 'Date picker', example: 'Target launch date, review date' },
        { type: 'Select', description: 'Single-choice dropdown', example: 'Risk classification, deployment status' },
        { type: 'Multi-select', description: 'Multiple-choice list with checkboxes', example: 'Applicable regulations, data categories' },
        { type: 'Checkbox', description: 'True/false toggle', example: 'DPIA completed, Terms accepted' },
      ],
    },
    {
      type: 'heading',
      id: 'field-configuration',
      level: 3,
      text: 'Field configuration',
    },
    {
      type: 'paragraph',
      text: 'Click any field on the canvas to open its configuration in the right panel. Every field supports:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Label', text: 'The question text shown to the submitter' },
        { bold: 'Placeholder', text: 'Hint text inside the input (disappears on focus)' },
        { bold: 'Help text', text: 'Appears below the field label as secondary guidance' },
        { bold: 'Guidance text', text: 'Detailed instructions shown below the input field' },
        { bold: 'Required', text: 'Whether the field must be filled to submit' },
        { bold: 'Default value', text: 'Pre-filled value when the form loads' },
        { bold: 'Entity field mapping', text: 'Which entity property this field populates on approval (e.g., project_title, description, risk_classification)' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Text and textarea fields also support **min length**, **max length**, and **regex pattern** validation. Number fields support **min** and **max** bounds. Select and multi-select fields have an **options editor** where you add label/value pairs.',
    },
    {
      type: 'heading',
      id: 'entity-field-mapping',
      level: 3,
      text: 'Entity field mapping',
    },
    {
      type: 'paragraph',
      text: 'Each field can optionally map to a property on the entity that gets created when the submission is approved. For use case forms, available mappings include:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: '`project_title` — use case name' },
        { text: '`description` — system description' },
        { text: '`goal` — business justification' },
        { text: '`owner` — responsible person' },
        { text: '`start_date` — planned start date' },
        { text: '`ai_risk_classification` — risk tier' },
        { text: '`type_of_high_risk_role` — high-risk role category' },
      ],
    },
    {
      type: 'paragraph',
      text: 'For model inventory forms: `name`, `description`, `modelVersion`, `provider`, `owner`, `modelType`, `intendedUse`, and `riskLevel`.',
    },
    {
      type: 'paragraph',
      text: 'Fields without a mapping are still captured in the submission data — they just don\'t auto-populate entity properties. The reviewing admin can always edit entity data before confirming approval.',
    },
    {
      type: 'heading',
      id: 'field-operations',
      level: 3,
      text: 'Field operations',
    },
    {
      type: 'paragraph',
      text: 'Each field on the canvas has a toolbar with:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Move up / Move down', text: 'Reorder fields in the form' },
        { bold: 'Duplicate', text: 'Copy the field with all its settings (gets a new ID)' },
        { bold: 'Delete', text: 'Remove the field after confirmation' },
      ],
    },
    {
      type: 'heading',
      id: 'design-settings',
      level: 2,
      text: 'Design settings',
    },
    {
      type: 'paragraph',
      text: 'Switch to the **Design** tab in the builder to change how the public form looks.',
    },
    {
      type: 'table',
      columns: [
        { key: 'setting', label: 'Setting', width: '25%' },
        { key: 'description', label: 'Description', width: '50%' },
        { key: 'default', label: 'Default', width: '25%' },
      ],
      rows: [
        { setting: 'Format', description: 'Form width — narrow (620px) or wide (820px)', default: 'Narrow' },
        { setting: 'Alignment', description: 'Horizontal position — left, center, or right', default: 'Center' },
        { setting: 'Color theme', description: 'Primary color used for the banner gradient, focused inputs, and the submit button', default: '#13715B' },
        { setting: 'Background color', description: 'Page background behind the form card', default: '#fafafa' },
        { setting: 'Logo URL', description: 'Organization logo displayed on the form', default: 'None' },
        { setting: 'Font family', description: 'Typography for all form text', default: 'Inter' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The form canvas updates in real-time as you change design settings, so you see exactly what submitters will see.',
    },
    {
      type: 'heading',
      id: 'form-settings',
      level: 2,
      text: 'Form settings',
    },
    {
      type: 'paragraph',
      text: 'The right panel in **Edit** mode has several settings beyond individual field configuration.',
    },
    {
      type: 'heading',
      id: 'notification-recipients',
      level: 3,
      text: 'Notification recipients',
    },
    {
      type: 'paragraph',
      text: 'Select which team members receive an email when a new submission arrives. Recipients are chosen from your organization\'s user list. If no recipients are configured, submissions still appear in the review queue but no email alerts are sent.',
    },
    {
      type: 'heading',
      id: 'risk-tier-system',
      level: 3,
      text: 'Risk tier system',
    },
    {
      type: 'paragraph',
      text: 'Choose how submissions are classified by risk:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Generic', text: 'Four-tier system: Low, Medium, High, Critical' },
        { bold: 'EU AI Act', text: 'Four-tier system aligned with the regulation: Minimal, Limited, High, Unacceptable' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The tier system determines the labels and thresholds used when scoring submissions. Both systems use the same scoring dimensions under the hood.',
    },
    {
      type: 'heading',
      id: 'llm-analysis',
      level: 3,
      text: 'LLM-enhanced analysis',
    },
    {
      type: 'paragraph',
      text: 'If you have an LLM key configured in your organization settings, you can connect it to the form. The LLM analyzes each submission and adds explanations to the risk scoring, not just numbers. Without an LLM key, risk scoring still runs but uses rule-based analysis only.',
    },
    {
      type: 'heading',
      id: 'suggested-questions',
      level: 3,
      text: 'Suggested questions',
    },
    {
      type: 'paragraph',
      text: 'Toggle on **Suggested questions** to show a panel of pre-built governance questions in the builder. They are organized by category (risks, compliance, operations, vendors, models) and you can add any of them to your form with one click. Each question comes with the field type, validation rules, and guidance text already set up.',
    },
    {
      type: 'heading',
      id: 'contact-info-toggle',
      level: 3,
      text: 'Collect contact information',
    },
    {
      type: 'paragraph',
      text: 'Toggle **Collect contact information** to control whether submitters are asked for their name and email. When enabled, the public form shows a "Your contact information" section at the top with name (optional) and email (required). When disabled, submissions are anonymous.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'When to go anonymous',
      text: 'Disable contact collection when the form is used internally by teams who are already identified through other channels, or when you want to lower the barrier for reporting shadow AI usage.',
    },
    {
      type: 'heading',
      id: 'publishing',
      level: 2,
      text: 'Publishing a form',
    },
    {
      type: 'paragraph',
      text: 'Forms start in **Draft** status. Click **Publish** to generate a public URL you can copy and share. The form status changes to **Active** and submissions start showing up in your review queue.',
    },
    {
      type: 'paragraph',
      text: 'You can still edit an active form. Changes take effect for new visitors right away. To stop accepting submissions, **archive** the form. Archived forms can be deleted later if you no longer need them.',
    },
    {
      type: 'table',
      columns: [
        { key: 'status', label: 'Status', width: '20%' },
        { key: 'accepts', label: 'Accepts submissions', width: '20%' },
        { key: 'editable', label: 'Editable', width: '20%' },
        { key: 'deletable', label: 'Can delete', width: '20%' },
        { key: 'transitions', label: 'Can transition to', width: '20%' },
      ],
      rows: [
        { status: 'Draft', accepts: 'No', editable: 'Yes', deletable: 'Yes', transitions: 'Active' },
        { status: 'Active', accepts: 'Yes', editable: 'Yes', deletable: 'No', transitions: 'Archived' },
        { status: 'Archived', accepts: 'No', editable: 'Yes', deletable: 'Yes', transitions: 'Active' },
      ],
    },
    {
      type: 'heading',
      id: 'public-form-experience',
      level: 2,
      text: 'The public form experience',
    },
    {
      type: 'paragraph',
      text: 'When someone opens the public link, they see the form page with your color theme, the form title in a gradient banner, and an optional description. No login required.',
    },
    {
      type: 'heading',
      id: 'submitting-a-form',
      level: 3,
      text: 'Submitting a form',
    },
    {
      type: 'paragraph',
      text: 'The submitter fills out the required fields, optionally enters their contact information, solves a math CAPTCHA (something like "7 + 4 = ?"), and clicks **Submit**. The CAPTCHA blocks automated spam but is simple enough that it won\'t slow anyone down.',
    },
    {
      type: 'paragraph',
      text: 'After submission, the submitter sees a success page with their reference number. If contact information was collected, they also receive a confirmation email.',
    },
    {
      type: 'heading',
      id: 'spam-protection',
      level: 3,
      text: 'Spam protection',
    },
    {
      type: 'paragraph',
      text: 'Public forms are protected by two layers:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Math CAPTCHA', text: 'A simple arithmetic question that changes on each page load. The answer is verified server-side using a time-limited cryptographic token that expires after 5 minutes.' },
        { bold: 'IP-based rate limiting', text: 'Limits the number of submissions from a single IP address within a time window. Exceeding the limit returns a "Too many submissions" error.' },
      ],
    },
    {
      type: 'heading',
      id: 'reviewing-submissions',
      level: 2,
      text: 'Reviewing submissions',
    },
    {
      type: 'paragraph',
      text: 'All submissions appear in the **Submissions** tab on the intake forms page. Each row shows the submitter\'s name (if provided), the form name, submission status, risk tier, and date.',
    },
    {
      type: 'paragraph',
      text: 'Click **Review** on any submission to open the review modal, which shows:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'All submitted field values' },
        { text: 'The calculated risk assessment with dimension-level scores' },
        { text: 'An entity data preview built from field mappings' },
        { text: 'Approve and Reject action buttons' },
      ],
    },
    {
      type: 'heading',
      id: 'risk-scoring',
      level: 2,
      text: 'Risk scoring',
    },
    {
      type: 'paragraph',
      text: 'Every submission is scored across multiple risk dimensions. Each dimension produces a score from 1 to 10, a weight, and a set of signals (short explanations of what drove the score).',
    },
    {
      type: 'table',
      columns: [
        { key: 'dimension', label: 'Dimension', width: '25%' },
        { key: 'description', label: 'What it measures', width: '75%' },
      ],
      rows: [
        { dimension: 'Impact', description: 'How severe the harm could be if the system fails or behaves incorrectly' },
        { dimension: 'Likelihood', description: 'How probable a failure or unintended outcome is' },
        { dimension: 'Scope', description: 'How many people or processes the system affects' },
        { dimension: 'Reversibility', description: 'Whether the consequences of a mistake can be undone' },
        { dimension: 'Contestability', description: 'Whether affected individuals can challenge the system\'s decisions' },
        { dimension: 'Transparency', description: 'How explainable the system\'s behavior is to stakeholders' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The weighted dimension scores produce an overall score that maps to a tier in your chosen risk system (Generic or EU AI Act). With an LLM key connected, each dimension also gets a written explanation of what drove the score.',
    },
    {
      type: 'heading',
      id: 'risk-override',
      level: 3,
      text: 'Overriding the risk tier',
    },
    {
      type: 'paragraph',
      text: 'Reviewers can override the calculated risk tier during approval. You need to provide a justification, and the override is logged with your identity and timestamp. This matters when the automatic scoring misses context you have, like a system that scores "medium" but affects a protected population.',
    },
    {
      type: 'heading',
      id: 'approving-submissions',
      level: 2,
      text: 'Approving a submission',
    },
    {
      type: 'paragraph',
      text: 'When you approve a submission:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Review the entity data preview — these are the field values that will populate the new entity. You can edit them before confirming.' },
        { text: 'Optionally override the risk tier with a justification.' },
        { text: 'Click **Approve**. VerifyWise creates the entity (use case or model inventory entry) with the confirmed data.' },
        { text: 'If the submitter provided an email, they receive an approval notification.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The new entity starts in its default lifecycle state ("Under review" for use cases, "Pending" for models) and shows up in your governance dashboards right away.',
    },
    {
      type: 'heading',
      id: 'rejecting-submissions',
      level: 2,
      text: 'Rejecting a submission',
    },
    {
      type: 'paragraph',
      text: 'When you reject a submission:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Enter a rejection reason explaining what needs to change.' },
        { text: 'Click **Reject**. The submission status changes to "Rejected."' },
        { text: 'If the submitter provided an email, they receive a rejection notification that includes the reason and a resubmission link.' },
      ],
    },
    {
      type: 'heading',
      id: 'resubmission',
      level: 3,
      text: 'Resubmission',
    },
    {
      type: 'paragraph',
      text: 'The rejection email includes a link that opens the form with all previous answers pre-filled. The submitter edits what needs changing and resubmits. These links expire after 7 days and are cryptographically signed so they can\'t be tampered with.',
    },
    {
      type: 'paragraph',
      text: 'Resubmissions create a new submission record linked to the original. The original submission is preserved for audit purposes.',
    },
    {
      type: 'heading',
      id: 'email-notifications',
      level: 2,
      text: 'Email notifications',
    },
    {
      type: 'paragraph',
      text: 'Emails go out at four points in the workflow. Submitter-facing emails are only sent when an email address was collected.',
    },
    {
      type: 'table',
      columns: [
        { key: 'event', label: 'Event', width: '25%' },
        { key: 'recipient', label: 'Recipient', width: '25%' },
        { key: 'contents', label: 'What it includes', width: '50%' },
      ],
      rows: [
        { event: 'Submission received', recipient: 'Submitter', contents: 'Confirmation with reference number and form name' },
        { event: 'New submission alert', recipient: 'Form recipients', contents: 'Submitter name/email, form name, submission ID' },
        { event: 'Submission approved', recipient: 'Submitter', contents: 'Approval confirmation, entity type created' },
        { event: 'Submission rejected', recipient: 'Submitter', contents: 'Rejection reason and resubmission link (7-day expiry)' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Anonymous submissions',
      text: 'When contact collection is off, there is no way to email the submitter. Approval and rejection notifications get skipped. Admin alerts still go out to configured recipients, showing "Anonymous" as the submitter.',
    },
    {
      type: 'heading',
      id: 'managing-forms',
      level: 2,
      text: 'Managing forms',
    },
    {
      type: 'paragraph',
      text: 'The intake forms list page shows all your forms with their status, entity type, submission count, and creation date.',
    },
    {
      type: 'heading',
      id: 'form-actions',
      level: 3,
      text: 'Form actions',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Edit', text: 'Open the form builder to modify fields, settings, or design' },
        { bold: 'Preview', text: 'See how the form looks to submitters without publishing' },
        { bold: 'Copy link', text: 'Copy the public URL to clipboard (active forms only)' },
        { bold: 'Archive', text: 'Stop accepting submissions while preserving the form and its data' },
        { bold: 'Delete', text: 'Permanently remove the form (draft and archived forms only)' },
      ],
    },
    {
      type: 'heading',
      id: 'submission-statuses',
      level: 3,
      text: 'Submission statuses',
    },
    {
      type: 'table',
      columns: [
        { key: 'status', label: 'Status', width: '20%' },
        { key: 'meaning', label: 'Meaning', width: '45%' },
        { key: 'next', label: 'Possible transitions', width: '35%' },
      ],
      rows: [
        { status: 'Pending', meaning: 'Waiting for admin review', next: 'Approved or Rejected' },
        { status: 'Approved', meaning: 'Entity created from submission data', next: 'None (final)' },
        { status: 'Rejected', meaning: 'Returned to submitter with reason', next: 'Submitter can resubmit (creates new Pending submission)' },
      ],
    },
    {
      type: 'heading',
      id: 'best-practices',
      level: 2,
      text: 'Best practices',
    },
    {
      type: 'heading',
      id: 'form-design-tips',
      level: 3,
      text: 'Form design',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Keep forms under 15 fields. Longer forms have higher abandonment rates.' },
        { text: 'Use guidance text on complex questions. A two-sentence explanation prevents misinterpretation.' },
        { text: 'Map fields to entity properties wherever possible. This saves the reviewer from manual data entry on approval.' },
        { text: 'Use select and multi-select fields for classification questions (risk level, data categories). Structured answers are easier to score and compare.' },
        { text: 'Start with the default fields and remove what you don\'t need rather than starting blank.' },
      ],
    },
    {
      type: 'heading',
      id: 'review-workflow-tips',
      level: 3,
      text: 'Review workflow',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Configure at least one notification recipient so submissions don\'t sit unreviewed.' },
        { text: 'Use the EU AI Act tier system if your organization reports under that regulation. The generic system works well for internal governance programs.' },
        { text: 'Connect an LLM key if you want richer risk explanations. The rule-based scoring still works without it, but the LLM adds reasoning context.' },
        { text: 'When rejecting, be specific in the rejection reason. The submitter sees your text verbatim.' },
        { text: 'Review entity data before confirming approval. The field mapping builds a reasonable starting point, but a quick check prevents errors downstream.' },
      ],
    },
    {
      type: 'heading',
      id: 'security-tips',
      level: 3,
      text: 'Security',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Archive forms as soon as you stop accepting submissions. This prevents stale links from collecting data.' },
        { text: 'Enable contact collection when you need to communicate decisions back to submitters. Disable it when anonymity is more important than follow-up.' },
        { text: 'The CAPTCHA and rate limiting run automatically — no configuration needed.' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'model-inventory',
          title: 'Managing model inventory',
          description: 'What happens after intake approves a model submission',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'How risk scoring works across the platform',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'task-management',
          title: 'Task management',
          description: 'Assign follow-up tasks after approving intake submissions',
        },
      ],
    },
  ],
};
