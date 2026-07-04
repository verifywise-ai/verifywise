import type { ArticleContent } from '../../contentTypes';

export const mrmContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'What is Model risk management?',
    },
    {
      type: 'paragraph',
      text: 'Model risk management (MRM) brings bank-grade model governance into VerifyWise. Use it to tier your models by risk, run independent validations, track findings to closure, monitor live metrics against thresholds, and produce a board-level attestation. It covers both AI and traditional models from one register, so you keep a single view rather than a separate silo.',
    },
    {
      type: 'paragraph',
      text: 'The module maps to the ongoing-monitoring, tiering, independent-validation, findings, revalidation, and attestation expectations in the US Federal Reserve SR 26-2, UK PRA SS1/23, and OSFI E-23 supervisory standards.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'MRM governs the process an examiner inspects: thresholds, evaluation, alerting, and the audit trail. It does not compute metrics for you. Your pipeline calculates drift, performance, and fairness numbers and pushes them in; VerifyWise owns the governance around them.',
    },
    {
      type: 'heading',
      id: 'access',
      level: 2,
      text: 'Opening the module',
    },
    {
      type: 'paragraph',
      text: 'Open Model inventory from the left sidebar, then select the Model risk management tab. Six sub-tabs run across the top:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'LayoutDashboard',
          title: 'Overview',
          description: 'Portfolio roll-up: models by tier, validation coverage, overdue validations, and open findings. Generate the attestation report from here.',
        },
        {
          icon: 'Layers',
          title: 'Tiering',
          description: 'Classify each model into Tier 1, 2, or 3 and record the materiality drivers behind the decision.',
        },
        {
          icon: 'ClipboardCheck',
          title: 'Validation',
          description: 'Run staged validations, complete the sectioned validation report, and sign off with an outcome.',
        },
        {
          icon: 'AlertTriangle',
          title: 'Findings',
          description: 'Log validation findings and move them through remediation to verified closure.',
        },
        {
          icon: 'Activity',
          title: 'Monitoring',
          description: 'Track the latest ingested metric values, trends, and breach history per model.',
        },
        {
          icon: 'Settings',
          title: 'Settings',
          description: 'Assign model roles, manage thresholds and ingestion tokens, and review how alerts are routed.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'tiering',
      level: 2,
      text: 'Tiering models',
    },
    {
      type: 'paragraph',
      text: 'The Tiering sub-tab lists every model in the inventory. Select Assign tier on a row to open the tier dialog, choose a tier, and record the materiality drivers, for example capital impact, regulatory reporting, or customer exposure. Tier assignment is manual, and the tier you set governs how deep validation goes and how often the model must be revalidated.',
    },
    {
      type: 'table',
      columns: [
        { key: 'tier', label: 'Tier', width: '18%' },
        { key: 'expectation', label: 'What the tier drives', width: '82%' },
      ],
      rows: [
        { tier: 'Tier 1', expectation: 'Full independent validation and continuous monitoring, with annual revalidation.' },
        { tier: 'Tier 2', expectation: 'Standard validation and periodic monitoring, on an 18-month cycle.' },
        { tier: 'Tier 3', expectation: 'Lightweight review, with biennial revalidation.' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'Raising a tier, for example Tier 3 to Tier 1, automatically fires a revalidation trigger for that model, since the higher tier carries a stricter validation bar.',
    },
    {
      type: 'heading',
      id: 'validation',
      level: 2,
      text: 'Running a validation',
    },
    {
      type: 'paragraph',
      text: 'A summary strip at the top of the Validation sub-tab shows how many models sit at each stage. Select Start validation to begin a cycle for a model that has no active validation. Only one validation can run per model at a time.',
    },
    {
      type: 'paragraph',
      text: 'Each validation moves through four stages:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Not started', text: 'the cycle exists but no work has begun.' },
        { bold: 'In validation', text: 'the validator is working through the report.' },
        { bold: 'Under review', text: 'the draft report is being reviewed.' },
        { bold: 'Validated', text: 'reached only by signing off, not by changing the stage manually.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Select any row to open the validation report drawer. The report is the primary artifact an examiner reviews, and the validator completes six numbered sections:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Purpose and scope' },
        { text: 'Conceptual soundness' },
        { text: 'Data review' },
        { text: 'Outcomes analysis' },
        { text: 'Findings and limitations' },
        { text: 'Conclusion and sign-off' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Select Sign off validation to close the cycle. You choose an outcome, Validated, Validated with findings, or Not validated, and the report becomes read-only afterward. The drawer also lists any revalidation triggers that opened or annotated the cycle, so the reason the model is being validated stays attached to the record.',
    },
    {
      type: 'heading',
      id: 'findings',
      level: 2,
      text: 'Managing findings',
    },
    {
      type: 'paragraph',
      text: 'Findings capture the issues a validation surfaces. Select Create finding, link it to a validation, give it a title, and set a severity of Critical, High, Medium, or Low. Each finding moves through a remediation lifecycle: Open, Remediation planned, In progress, Resolved, and Closed. Open a finding to set its owner, due date, and remediation plan.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Before you can close a finding, mark it as verified to confirm the remediation was effective. A finding cannot move to Closed until it is verified. Findings are audit records and are never deleted; they travel the lifecycle to closure instead.',
    },
    {
      type: 'heading',
      id: 'roles',
      level: 2,
      text: 'Assigning roles and independence',
    },
    {
      type: 'paragraph',
      text: 'Under Settings, the Roles and independence section lets you assign four roles per model. Select a model, choose a user for each role, then save.',
    },
    {
      type: 'table',
      columns: [
        { key: 'role', label: 'Role', width: '22%' },
        { key: 'responsibility', label: 'Responsibility', width: '78%' },
      ],
      rows: [
        { role: 'Owner', responsibility: 'Accountable for the model in production and responds to findings.' },
        { role: 'Developer', responsibility: 'Builds and changes the model.' },
        { role: 'Validator', responsibility: 'Independently reviews and signs off the validation.' },
        { role: 'Approver', responsibility: 'Grants use or conditional approval after validation.' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'The validator must be independent: they cannot also be the developer. If you select the same person for both roles, the save is blocked.',
    },
    {
      type: 'heading',
      id: 'ingestion',
      level: 2,
      text: 'Feeding metrics in',
    },
    {
      type: 'paragraph',
      text: 'Your pipeline pushes computed metrics to VerifyWise over a single endpoint. The model key sits in the URL path, so one pipeline can report for many models by varying the path.',
    },
    {
      type: 'code',
      language: 'text',
      code: 'POST https://app.verifywise.ai/api/mrm/models/{externalModelKey}/metrics',
    },
    {
      type: 'paragraph',
      text: 'Send a metric key, a numeric value, and an ISO 8601 timestamp for when the metric applies. You can add an optional window (such as daily or rolling-30d), a segment for a sub-population, and a context object for audit metadata that is stored but never evaluated. Reposting the same metric, timestamp, segment, and window is treated as a no-op, so a retrying cron never creates duplicates.',
    },
    {
      type: 'paragraph',
      text: 'Manage the credentials under Settings, in Metrics feed and tokens. Select Create ingestion token, name it, and copy the value.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'A token is shown once, at creation. Store it securely, since it cannot be retrieved again. Tokens are per-organization and only their hash is stored. You can rotate a token to issue a new secret, or revoke it to cut off a pipeline.',
    },
    {
      type: 'heading',
      id: 'thresholds',
      level: 2,
      text: 'Setting thresholds',
    },
    {
      type: 'paragraph',
      text: 'Thresholds turn raw metric values into a pass or breach verdict. Under Settings, in Default thresholds, select Add threshold, pick the model and metric key, then choose a shape:',
    },
    {
      type: 'table',
      columns: [
        { key: 'shape', label: 'Shape', width: '28%' },
        { key: 'breach', label: 'Breaches when', width: '72%' },
      ],
      rows: [
        { shape: 'Floor (≥)', breach: 'the value falls below the floor.' },
        { shape: 'Above (>)', breach: 'the value rises above the limit.' },
        { shape: 'Ceiling (≤)', breach: 'the value rises above the ceiling.' },
        { shape: 'Below (<)', breach: 'the value falls below the limit.' },
        { shape: 'Band (min–max)', breach: 'the value falls outside the range.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Set the value (or minimum and maximum for a band), a severity of Warning, High, or Critical, and what happens on breach: Notify only, or Notify and flag for revalidation. Unlike findings, thresholds can be edited and deleted. Every evaluation stores a snapshot of the threshold as it stood at the time, so later edits never rewrite the history an examiner sees.',
    },
    {
      type: 'heading',
      id: 'monitoring',
      level: 2,
      text: 'Reading the monitoring view',
    },
    {
      type: 'paragraph',
      text: 'Select a model on the Monitoring sub-tab to see each metric with its latest value, the threshold in force, a trend sparkline, when the value last arrived, and a status chip: Within threshold, Warning, Breach, No threshold defined, or No data yet. A breach history section below lists every warning and breach for the model, newest first, alongside the threshold snapshot recorded at evaluation.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'When a metric breaches its threshold, VerifyWise sends an in-app notification to the people assigned to that model\'s MRM roles, so the alert follows your role assignments and you maintain one list instead of two.',
    },
    {
      type: 'heading',
      id: 'revalidation',
      level: 2,
      text: 'Revalidation triggers',
    },
    {
      type: 'paragraph',
      text: 'A revalidation trigger tells VerifyWise a model needs to be looked at again. Four sources converge on one task, and each firing is recorded in an audit trail you can see in the validation report drawer:',
    },
    {
      type: 'table',
      columns: [
        { key: 'source', label: 'Source', width: '26%' },
        { key: 'when', label: 'When it fires', width: '74%' },
      ],
      rows: [
        { source: 'Breach', when: 'a metric breaches a threshold set to flag for revalidation.' },
        { source: 'Change', when: 'you request revalidation after a material change to the model.' },
        { source: 'Tier increase', when: 'a model moves to a higher tier.' },
        { source: 'Scheduled', when: 'a daily sweep finds a validation past its next-due date.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'If a validation is already open for a model, a second trigger annotates that task rather than opening a duplicate, and still records its own audit event. This keeps one clear thread of work per model while preserving the full history of why revalidation was requested.',
    },
    {
      type: 'heading',
      id: 'attestation',
      level: 2,
      text: 'Attesting to the portfolio',
    },
    {
      type: 'paragraph',
      text: 'The Overview sub-tab rolls the whole portfolio into four summary cards, models by tier, validation coverage, overdue validations, and open findings by severity, followed by a per-tier table showing tiering, validation, monitoring, and finding status. Each tier and the fleet overall reads either Ready or Blocked.',
    },
    {
      type: 'paragraph',
      text: 'Select Generate attestation report to download a DOCX file for the board and audit committee. It states the overall attestation status in plain language, summarizes the fleet by tier, breaks down validation coverage and open findings by severity, and includes the per-tier attestation table.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        { collectionId: 'ai-governance', articleId: 'model-inventory', title: 'Managing model inventory', description: 'Register and track the models MRM governs' },
        { collectionId: 'ai-governance', articleId: 'model-lifecycle', title: 'Model lifecycle management', description: 'Track models from development through retirement' },
        { collectionId: 'ai-governance', articleId: 'approval-workflows', title: 'Approval workflows', description: 'Set up multi-approver sign-off for models and use cases' },
      ],
    },
  ],
};
