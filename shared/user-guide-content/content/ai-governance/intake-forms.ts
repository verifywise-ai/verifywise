import type { ArticleContent } from '../../contentTypes';

export const intakeFormsContent: ArticleContent = {
  blocks: [
    {
      type: 'time-estimate',
      text: '13 min read',
    },
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Intake forms let anyone in your organization request a new AI use case or register a model without needing a VerifyWise account. You publish a public form, share the link and submissions land in your governance queue for review. When you approve a submission, VerifyWise creates the use case or model inventory entry and carries over the risk score from the intake.',
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
        { bold: 'Build', text: 'Create a form in the drag-and-drop builder. Choose field types, set validation rules and map fields to entity properties.' },
        { bold: 'Brand', text: 'Customize the look with your organization\'s colors, logo and typography.' },
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
      text: 'Marketing buys a third-party content generation tool. The intake form captures the vendor name, what data the tool touches, whether it makes decisions on its own and how many people are affected. Governance reviews it before the tool goes live across the company.',
    },
    {
      type: 'heading',
      id: 'use-case-model-registration',
      level: 3,
      text: 'Model inventory registration',
    },
    {
      type: 'paragraph',
      text: 'Data science teams ship models regularly. An intake form set up for model inventory collects the model name, version, training data description, intended use and provider. Approved submissions go straight into the model inventory with risk metadata carried over.',
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
      text: 'You can keep all of these, remove the ones you don\'t need, or add your own. Model inventory forms have their own set of defaults (model name, version, provider, intended use and risk level).',
    },
    {
      type: 'heading',
      id: 'form-builder',
      level: 2,
      text: 'The form builder',
    },
    {
      type: 'paragraph',
      text: 'The builder has three areas: a **field palette** on the left, the **form canvas** in the center and a **settings panel** on the right.',
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
      text: 'Text and textarea fields also support **min length**, **max length** and **regex pattern** validation. Number fields support **min** and **max** bounds. Select and multi-select fields have an **options editor** where you add label/value pairs.',
    },
    {
      type: 'heading',
      id: 'conditional-fields',
      level: 2,
      text: 'Conditional fields',
    },
    {
      type: 'paragraph',
      text: 'Open "Show this field only if…" in a field\'s settings to show it only when other answers match. Add one or more conditions and choose whether all or any must match. A condition can use any other field in the form, above or below. Until that question is answered, the field stays hidden.',
    },
    {
      type: 'paragraph',
      text: 'Hidden fields are never required and their answers are not saved. Fields mapped to the use case name, the use case goal or the model name cannot have conditions, because those values are needed to create the entity.',
    },
    {
      type: 'heading',
      id: 'calculated-fields',
      level: 2,
      text: 'Calculated fields',
    },
    {
      type: 'paragraph',
      text: 'A calculated field shows a read-only result that updates as the submitter types, for example annual cost from a monthly cost. Add one from the Advanced section of the field palette. Formulas use + − × ÷ (typed as + - * /), parentheses and numbers, and refer to number or calculated fields anywhere in the form, so a total at the top can add up fields below it. Type { in the formula box to insert a field.',
    },
    {
      type: 'paragraph',
      text: 'Set decimals (0 to 6) and an optional prefix or suffix, such as € or people. If an input is empty or hidden, the result shows a dash. The value is recalculated by VerifyWise when the form is submitted and is shown to reviewers. A form cannot be published while its formulas or conditions go round in a loop, for example two fields that each read the other. A draft can still be saved.',
    },
    {
      type: 'heading',
      id: 'logic-overview',
      level: 2,
      text: 'Logic overview',
    },
    {
      type: 'paragraph',
      text: 'Select **Logic** at the top of the form builder to see all the logic on the form in one list: every calculated field and its formula, every conditional field and the answers it depends on, risk dimension tags, and how reviewer assignment sends submissions to expert or regular reviewers. A row with a problem is outlined in red with the reason. Click a row to open that field in the editor.',
    },
    {
      type: 'heading',
      id: 'risk-dimension-tags',
      level: 2,
      text: 'Risk dimension tags',
    },
    {
      type: 'paragraph',
      text: 'Under "Risk scoring" in a text, dropdown or checkbox field\'s settings, choose the risk dimension its answer speaks to. The AI scorer sees the dimension next to each tagged answer, so it knows what the answer was meant to show. Tags don\'t produce scores of their own. For submissions scored with the earlier keyword method, tags decided which answers fed each dimension.',
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
        { text: '`project_title`, use case name' },
        { text: '`description`, system description' },
        { text: '`goal`, business justification' },
        { text: '`owner`, responsible person' },
        { text: '`start_date`, planned start date' },
        { text: '`ai_risk_classification`, risk tier' },
        { text: '`type_of_high_risk_role`, the use case\'s high-risk roles (Provider, Deployer or both). Map a select or multi-select question to it. Each selected option whose label or value is Provider or Deployer becomes a role; the review dialog lists any other selected option so you can correct the roles before approving.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'For model inventory forms: `name`, `description`, `modelVersion`, `provider`, `owner`, `modelType`, `intendedUse` and `riskLevel`.',
    },
    {
      type: 'paragraph',
      text: 'Fields without a mapping are still captured in the submission data. They just don\'t auto-populate entity properties. The reviewing admin can always edit entity data before confirming approval.',
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
        { setting: 'Format', description: 'Form width, either narrow (620px) or wide (820px)', default: 'Narrow' },
        { setting: 'Alignment', description: 'Horizontal position: left, center or right', default: 'Center' },
        { setting: 'Color theme', description: 'Primary color used for the banner gradient, focused inputs and the submit button', default: '#13715B' },
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
      text: 'Select which team members get an email when a new submission arrives. Recipients come from your organization\'s user list. The email waits for the AI assessment and then shows the EU AI Act level, the risk score and the number of suggested risks. If the assessment takes longer than 2 minutes, the email goes out anyway and says scoring is still running. Each submission sends this email once. If no recipients are configured, submissions still appear in the review queue but no email is sent. Forms opened through the older /{organization}/{form} link email your organization\'s admins instead.',
    },
    {
      type: 'heading',
      id: 'review-routing',
      level: 3,
      text: 'Reviewer assignment',
    },
    {
      type: 'paragraph',
      text: 'Reviewer assignment is off by default. Only Admins can change it; other roles see the settings read-only. Turn on **Assign reviewers by risk score** in the form settings to send each scored submission to **expert** or **regular** reviewers. With reviewer assignment off, anyone who can edit intake forms can decide every submission.',
    },
    {
      type: 'bullet-list',
      items: [
        { text: '**Expert reviewers** and **Regular reviewers**: pick at least one of each. Only users whose role can edit intake forms are listed.' },
        { text: '**Threshold**: the risk score that separates the review levels, from 1 to 99. The default is 50.' },
        { text: '**Close-call margin**: how many points either side of the threshold count as a close call, from 0 to 25. The default is 10.' },
        { text: '**Second review share %**: the share of regular review approvals that are checked again, from 0 to 100. The default is 10.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'A submission goes to expert review if any of these is true, checked in this order. Otherwise it goes to regular review.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'The EU AI Act level is Prohibited.' },
        { text: 'There is no usable score, for example because the AI scoring failed or the form has no LLM key and the rules give no minimum.' },
        { text: 'The score is within the close-call margin of the threshold.' },
        { text: 'The score is at or above the threshold.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Saving the form assigns its pending submissions again with the new settings. A reviewer who is removed from your organization or loses the right to edit intake forms stays in the list, shown as **Former user**, until you remove them. You can still save the form with them in the list, but you cannot add someone who cannot review, and a list you change needs at least one person who can currently review. Admins can still decide, and the Oversight tab flags the form under **No active reviewer**.',
    },
    {
      type: 'heading',
      id: 'risk-tier-system',
      level: 3,
      text: 'Risk score bands',
    },
    {
      type: 'paragraph',
      text: 'Scores run from 0 to 100. Every screen shows the score with its band: **Low** (0 to 25), **Medium** (26 to 50), **High** (51 to 75) or **Critical** (76 to 100). The band is separate from the EU AI Act level, which comes from the risk questionnaire. Submissions scored with the earlier keyword method keep their old tiers: Minimal, Limited, High and Unacceptable.',
    },
    {
      type: 'heading',
      id: 'llm-analysis',
      level: 3,
      text: 'LLM key',
    },
    {
      type: 'paragraph',
      text: 'Connect one of your organization\'s LLM keys to the form. VerifyWise uses it to score submissions and to suggest risks. Without a key, reviewers get the rule-based EU AI Act classification only. The score is then the rule minimum, shown as "at least 70 (rules only)", and no risks are suggested.',
    },
    {
      type: 'heading',
      id: 'suggested-questions',
      level: 3,
      text: 'Suggested questions',
    },
    {
      type: 'paragraph',
      text: 'Toggle on **Suggested questions** to show a panel of pre-built governance questions in the builder. They are organized by category (risks, compliance, operations, vendors, models) and you can add any of them to your form with one click. Each question comes with the field type, validation rules and guidance text already set up.',
    },
    {
      type: 'heading',
      id: 'live-checks-toggle',
      level: 3,
      text: 'Check answers while the submitter types',
    },
    {
      type: 'paragraph',
      text: 'This setting is on by default for every form. It shows hints under answers on the public form and stores them with the submission for the reviewer (see **Live checks** below). Rule checks work on every form. AI checks and vendor document prefill also need the form\'s LLM key. Every AI call they make uses that key. Turn the setting off to stop all three for this form.',
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
      text: 'When someone opens the public link, they see the form page with your color theme, the form title in a gradient banner and an optional description. No login required.',
    },
    {
      type: 'heading',
      id: 'submitting-a-form',
      level: 3,
      text: 'Submitting a form',
    },
    {
      type: 'paragraph',
      text: 'The submitter fills out the required fields, optionally enters their contact information, solves a math CAPTCHA (something like "7 + 4 = ?") and clicks **Submit**. The CAPTCHA blocks automated spam but is simple enough that it won\'t slow anyone down.',
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
      id: 'live-checks',
      level: 3,
      text: 'Live checks',
    },
    {
      type: 'paragraph',
      text: 'While someone fills in the form, hints appear under answers that may need a second look. An **Intake assistant** panel counts them, jumps to each question and runs AI checks on request. The hints never block submission.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Rule checks', text: 'Run in the browser on every change. They flag placeholder or very short answers, answers that mention a practice prohibited under EU AI Act Article 5, uses listed as high-risk in Annex III and decisions made without human review (GDPR Article 22). The hint says what the answer mentions and why it may matter; it never says the system is prohibited. Rules match English answers; the hint text is shown in the submitter\'s language.' },
        { bold: 'AI checks', text: 'With an LLM key, the panel has a **Check my answers** button. It asks the AI once about vague answers and answers that contradict each other. Answers go to the AI only when the submitter selects it, so typing never uses your key. After a check, the button stays off until an answer changes. A notice at the top of the form explains this.' },
        { bold: 'Fill from a vendor document', text: 'With an LLM key, the submitter can upload a PDF or Word file of up to 10 MB. The AI suggests answers for empty questions. Each one is marked **AI-suggested** with the file and section it was read from. A **Confirm** button sits next to it. Suggestions never replace an answer the submitter already gave. The file is not stored.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'AI calls are rate-limited per visitor and per form, so a busy or misused link cannot run up costs on your key. When a limit is reached, rule checks keep working and the panel shows that AI checks are paused for a few minutes.',
    },
    {
      type: 'paragraph',
      text: 'At submit, VerifyWise runs the checks again on the server and stores them with the submission; AI checks finish in the background. In the review modal, an **Intake checks** section counts the hints by kind. Each flagged answer shows its hints as chips (hover for the full text). Answers filled from a vendor document show the file, the section and whether the submitter confirmed them.',
    },
    {
      type: 'heading',
      id: 'reviewing-submissions',
      level: 2,
      text: 'Reviewing submissions',
    },
    {
      type: 'paragraph',
      text: 'All submissions appear in the **Submissions** tab on the intake forms page. Each row shows the submitter\'s name (if provided), the form name, submission status, risk score and date.',
    },
    {
      type: 'paragraph',
      text: 'Click **Review** on any submission to open the review modal, which shows:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'All submitted field values' },
        { text: 'The risk score, with a **How this score is built** breakdown' },
        { text: 'The EU AI Act classification, when the form asks the questionnaire' },
        { text: 'Suggested risks to accept or dismiss' },
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
      text: 'VerifyWise scores each submission in the background after it arrives. The review dialog shows **Scoring…** until the result is in and refreshes on its own.',
    },
    {
      type: 'paragraph',
      text: 'The score has two parts. The EU AI Act level from the risk questionnaire sets a rule minimum. The form\'s LLM then scores the answers 5 times, independently, from 0 to 100. Each run explains its score with reasons that quote the submitter\'s answers. VerifyWise drops any reason whose quote is not in the answer. The median of the runs is the AI score, and at least 3 runs must succeed for it to count.',
    },
    {
      type: 'table',
      columns: [
        { key: 'level', label: 'EU AI Act level', width: '50%' },
        { key: 'minimum', label: 'Rule minimum', width: '50%' },
      ],
      rows: [
        { level: 'Prohibited', minimum: '90' },
        { level: 'High risk', minimum: '70' },
        { level: 'Limited risk', minimum: '30' },
        { level: 'Minimal risk', minimum: '0' },
        { level: 'Out of scope', minimum: '0' },
        { level: 'No questionnaire (step off, or a model)', minimum: 'None. The score is marked "not rule-checked"' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The final score is the higher of the rule minimum and the AI median. The AI can raise the score but never lower it, so an answer written to talk the score down can\'t take it below what the rules require.',
    },
    {
      type: 'paragraph',
      text: 'Without an AI score the dialog shows the rule minimum as "at least 70 (rules only)". This happens when the form has no LLM key or the AI scoring failed. With no AI score and a rule minimum of 0, it shows "No score yet". When a step failed, or has run for more than 10 minutes, the dialog offers **Retry**. Retry reruns only the steps that did not finish, so your decisions on suggested risks stay as they are.',
    },
    {
      type: 'paragraph',
      text: 'Model inventory forms have no EU AI Act questionnaire. Their submissions are scored by the AI alone and marked "not rule-checked".',
    },
    {
      type: 'paragraph',
      text: 'The LLM sees the answers and the questionnaire result. It never sees the submitter\'s name, their email address or any email field on the form. Answers are passed as data, and the model is told to ignore any instructions written inside them.',
    },
    {
      type: 'paragraph',
      text: 'Open **How this score is built** to see each input: the level with its articles, the rule minimum, all 5 AI scores with failed runs marked, the median, the range, the quoted reasons and any band override.',
    },
    {
      type: 'paragraph',
      text: 'If you pick a different EU AI Act level before approving, the score is recalculated for that level and marked "Minimum based on your level change". If the questionnaire rules changed after the submission was scored, the dialog says "Rules updated since this was scored".',
    },
    {
      type: 'heading',
      id: 'keyword-scores',
      level: 3,
      text: 'Submissions scored before AI scoring',
    },
    {
      type: 'paragraph',
      text: 'Submissions scored with the earlier keyword method keep that score. The dialog shows its 6 dimension scores:',
    },
    {
      type: 'table',
      columns: [
        { key: 'dimension', label: 'Dimension', width: '25%' },
        { key: 'description', label: 'What it measures', width: '75%' },
      ],
      rows: [
        { dimension: 'Data sensitivity', description: 'Whether personal, financial, health or other sensitive data is involved (weight 20%)' },
        { dimension: 'Autonomy level', description: 'How much the system decides without a person (weight 20%)' },
        { dimension: 'Impact scope', description: 'How many people or how much of the organization it reaches (weight 15%)' },
        { dimension: 'Transparency', description: 'Whether its behaviour can be explained and is documented (weight 15%)' },
        { dimension: 'Human oversight', description: 'How closely people monitor and review it (weight 15%)' },
        { dimension: 'Domain criticality', description: 'How critical the domain is, such as healthcare, hiring or finance (weight 15%)' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The weighted dimension scores produced an overall score mapped to the old tiers.',
    },
    {
      type: 'heading',
      id: 'risk-override',
      level: 3,
      text: 'Overriding the score band',
    },
    {
      type: 'paragraph',
      text: 'Reviewers can override the score band during approval with a justification. The override changes the band, while the score stays as computed. It is logged with your identity and time. Use it when the scoring misses context you have, like a system that scores Medium but affects a protected population.',
    },
    {
      type: 'paragraph',
      text: 'The band can go up but not below the band that holds the rule minimum. A High risk submission (minimum 70) can\'t be set lower than High, and the lower bands are greyed out. To go lower, change the EU AI Act level itself, which needs its own justification.',
    },
    {
      type: 'heading',
      id: 'suggested-risks',
      level: 2,
      text: 'Suggested risks',
    },
    {
      type: 'paragraph',
      text: 'With the score, the form\'s LLM suggests up to 10 risks for each submission, highest rated first. Some come from the MIT and IBM risk catalogs. The rest are written for the submission. Each one names its source, likelihood and severity. It comes with a drafted impact, mitigation plan and implementation strategy. Model submissions also get a model risk category and level.',
    },
    {
      type: 'paragraph',
      text: 'For each suggestion you can accept, dismiss, edit or undo your choice. **Accept all** accepts every open suggestion that has a mitigation plan. A risk can\'t be accepted without a mitigation plan, because the risk register requires one. Your choices save as you make them, so closing the dialog keeps them.',
    },
    {
      type: 'paragraph',
      text: 'Nothing is added to the register until you approve. On approval each accepted suggestion becomes a risk on the new use case. You own it, and it is due 90 days after approval unless you set a deadline. For model submissions it becomes a model risk with status Open. If adding any risk fails, the whole approval is rolled back. Rejecting a submission adds no risks.',
    },
    {
      type: 'paragraph',
      text: 'Without an LLM key on the form there are no suggestions. When more than 10 risks fit, the list says how many lower-rated ones are not shown.',
    },
    {
      type: 'heading',
      id: 'eu-ai-act-risk-step',
      level: 2,
      text: 'EU AI Act risk classification step',
    },
    {
      type: 'paragraph',
      text: 'Use case forms can ask the EU AI Act risk questionnaire before the form\'s own questions. Turn on **EU AI Act risk classification step** in the builder\'s settings panel and save the form. The toggle only appears on use case forms. Model inventory forms do not have it. New use case forms start with the step on, and their default questions no longer ask for a risk level or a high-risk role, because the step sets both. Forms you saved earlier keep their setting. While the step is on, the builder canvas shows it above the form\'s questions as a read-only card. Select **View questions** to open the questionnaire, read-only, in a sidebar. While it is off, the builder shows a notice that submissions won\'t be rule-checked.',
    },
    {
      type: 'paragraph',
      text: 'The step sets the new use case\'s AI risk classification, so a form cannot have both the step and a question mapped to `ai_risk_classification`. Turning the step on removes that mapping. The question itself stays on the form and its answers are still saved with the submission.',
    },
    {
      type: 'heading',
      id: 'eu-ai-act-risk-step-submitters',
      level: 3,
      text: 'What submitters see',
    },
    {
      type: 'paragraph',
      text: 'The public form opens on the risk questionnaire. Each answer decides which question comes next, so a system built only for research and development finishes after one question. The follow-up questions for each Annex III area accept several answers, and any listed use makes the system high risk. After the last question the submitter moves on to the form, and can go back with **Back to risk classification**. Submitters do not see the resulting classification. The browser sends only the answers: VerifyWise checks and scores them on the server when the form is submitted. If the server rejects the answers, the form returns to the risk questionnaire.',
    },
    {
      type: 'heading',
      id: 'eu-ai-act-risk-step-reviewers',
      level: 3,
      text: 'What reviewers see',
    },
    {
      type: 'paragraph',
      text: 'The review dialog adds an **EU AI Act classification** panel with:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'The computed level: Prohibited, High risk, Limited risk, Minimal risk or Out of scope' },
        { text: 'The reasons, each with its article and, where one applies, the date it applies from' },
        { text: 'The roles (provider, deployer or both) the submitter chose' },
        { text: 'Every question and the answer given' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The panel scores the stored answers again when you open it. If that gives a different level from the one at submission, the panel marks it **Updated since submission**.',
    },
    {
      type: 'paragraph',
      text: 'You can pick a different level under **Classification for the new use case**. Only the five levels above are offered, and a change needs a justification of at least 10 characters. On approval the use case gets the chosen level and the roles, the answers are copied to the use case, and its change history records the level together with the computed level and your justification when you changed it. Because the classification comes from the EU AI Act step, the new use case also gets the EU AI Act framework, with its assessment and controls. A submission without a classification from the step, for example from a form that does not use the step, gets no framework on approval. When the selected level is Prohibited, the panel warns that approving creates a use case classified as prohibited.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Submissions from forms without the step, and submissions made before the step was turned on, have no classification panel and are approved as before.',
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
        { text: 'Review the entity data preview. These are the field values that will populate the new entity, and you can edit them before confirming.' },
        { text: 'Accept or dismiss the suggested risks.' },
        { text: 'Optionally override the score band with a justification.' },
        { text: 'Click **Approve**. VerifyWise creates the entity (use case or model inventory entry) with the confirmed data and adds the risks you accepted.' },
        { text: 'If the submitter provided an email, they receive an approval notification.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'When you approve a submission (which transitions the *submission* status from PENDING to APPROVED), VerifyWise creates the entity. The new entity then starts in its own default lifecycle state ("Under review" for use cases, "Pending" for models) and shows up in your governance dashboards right away.',
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
      text: 'Resubmissions create a new submission record linked to the original. The original submission is preserved for audit purposes. A resubmission is assigned on its own once it has been scored. Nothing is carried over from the original.',
    },
    {
      type: 'heading',
      id: 'lanes-and-second-review',
      level: 2,
      text: 'Review levels and second reviews',
    },
    {
      type: 'paragraph',
      text: 'When a form has reviewer assignment on, the review modal shows the review level and why the submission is at it, for example "Within 10 points of the threshold" or "Prohibited practice". A submission with no score yet shows "No score yet" instead of a number.',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Only a reviewer of the right level, or an Admin, can approve or reject. Expert reviewers can decide at both levels. Others see which reviewers can decide.' },
        { text: 'A regular reviewer can\'t approve a submission while setting a Prohibited level or a band that sends it to expert review.' },
        { text: 'If you raise the score band with an override and the new band alone would send the submission to expert review, it moves there. A band override never moves a submission to regular review.' },
        { text: 'Use **Request expert review** to hand a submission in regular review to the expert reviewers. You must give a reason. It stays in expert review afterwards.' },
      ],
    },
    {
      type: 'heading',
      id: 'second-review',
      level: 3,
      text: 'Second review',
    },
    {
      type: 'paragraph',
      text: 'After a regular reviewer approves a submission, it is picked for a second review with a chance equal to the form\'s second review share. Approvals by expert reviewers, and approvals in expert review, are not picked. The expert reviewers get an email, and the review modal shows a Second review panel.',
    },
    {
      type: 'paragraph',
      text: 'The email you get when a second review is waiting opens the submission directly. You can also find these submissions in the submissions list: choose **Second review** in the review level filter to see every open one, or **Assigned to me** to see the ones you can review.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'An expert reviewer, or an Admin, opens the submission. The person who approved it can\'t do the second review.' },
        { text: 'Click **Agree** if the approval was right, or **Missed something** and write a note saying what was missed. The note is required for a miss.' },
        { text: 'For a miss, do the follow-up, then click **Mark resolved** and write what was done.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'A second review does not change the approval or the use case or model it created.',
    },
    {
      type: 'heading',
      id: 'oversight',
      level: 3,
      text: 'Oversight tab',
    },
    {
      type: 'paragraph',
      text: 'The **Oversight** tab on the intake forms page is for users who can edit intake forms. Choose the last 4, 8 or 12 weeks, and one form or all forms. Weeks start on Monday, UTC.',
    },
    {
      type: 'bullet-list',
      items: [
        { text: '**Submissions**: how many came in, and how many went to each review level. Close calls, submissions not assigned yet and submissions on forms with reviewer assignment off are counted separately.' },
        { text: '**Median time to decision**: from submission to approval or rejection, overall and per review level.' },
        { text: '**Redlines caught**: submissions at the Prohibited or High risk level.' },
        { text: '**Second reviews**: how many were missed out of those completed, and how many are still open.' },
        { text: '**Reviewers**: decisions, how often each reviewer changed the score band, and median time. A **Check** flag appears for a reviewer with at least 10 decisions who never changed a band. It is a prompt to look, not a finding.' },
        { text: '**Band kept**: the share of decisions where the band stayed as computed, overall and in expert review. **Suggested risks accepted** is the share of suggestions reviewers accepted.' },
        { text: '**Needs attention**: up to 20 items. A second review open for more than 3 days, a missed second review not yet resolved, a pending Prohibited submission, a submission pending for more than 7 days, and a form with no active reviewer at a review level. Forms with no active reviewer are listed first.' },
      ],
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
        { event: 'New submission alert', recipient: 'Form recipients', contents: 'Submitter name and email, form name, submission ID, EU AI Act level, risk score and number of suggested risks. Sent once the assessment finishes, or after 2 minutes.' },
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
      text: 'The intake forms list page shows all your forms with their status, entity type, submission count and creation date.',
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
        { text: 'Connect an LLM key to get an AI score and suggested risks. Without one, reviewers see the rule-based classification only.' },
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
        { text: 'The CAPTCHA and rate limiting run automatically. No configuration needed.' },
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
