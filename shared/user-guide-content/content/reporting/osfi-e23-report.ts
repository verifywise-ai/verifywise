import type { ArticleContent } from '../../contentTypes';

export const osfiE23ReportContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'OSFI Guideline E-23 sets out what federally regulated financial institutions in Canada are expected to do about model risk. The OSFI E-23 completeness report takes the E-23 checklist your team has filled in and checks it against your model risk management records: the model inventory, tiers, validations, findings and monitoring. Where the checklist says a requirement is done and the records say otherwise, the report lists it.',
    },
    {
      type: 'paragraph',
      text: 'The report is a self-assessment prepared from your VerifyWise records. It is not an OSFI assessment. The cover and the sign-off page both say so.',
    },
    {
      type: 'paragraph',
      text: 'Each run produces two files: the formal report, written for an OSFI examiner or your board, and an internal fix-it list for your model risk team.',
    },
    {
      type: 'heading',
      id: 'before-you-start',
      level: 2,
      text: 'Before you start',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Admin role', text: 'The report covers the whole organization. Only an Admin can run or schedule an organization report.' },
        { bold: 'The OSFI E-23 framework', text: 'Add OSFI E-23 on the **Frameworks** page. Then record the status, owner, due date and evidence of each requirement. Without it the report runs, but it says E-23 is not on file. The completeness and contradiction checks are then skipped.' },
        { bold: 'Model risk management records', text: 'Tiers, validations, findings and monitoring thresholds come from the Model risk management tab under **Record > Inventory > Models**. The more of it is filled in, the more the report can check.' },
        { bold: 'An LLM key (optional)', text: 'The AI sections need an LLM key in **Settings → LLM keys**. Without one you get the report with a note in place of each AI section.' },
      ],
    },
    {
      type: 'heading',
      id: 'running-the-report',
      level: 2,
      text: 'Running the report once',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'In the sidebar, open **Record > Evidence & reports > Reporting** and select the **Templates** tab' },
        { text: 'Under the system templates, find **OSFI E-23 completeness report** and click **Run now**' },
        { text: '**Scope**: the report always covers the whole organization, so there is nothing to choose here' },
        { text: '**Report details**: fill in the reporting period, names and audience (see below)' },
        { text: '**Sections**: the template turns on everything except the model inventory appendix. Turn the appendix on if you want a full list of models' },
        { text: '**AI Insights**: executive summary, key findings, recommended actions and the E-23 gap analysis are on by default' },
        { text: '**Review**: check your answers and run the report' },
      ],
    },
    {
      type: 'paragraph',
      text: 'When the run finishes, it appears in the list on the **Generate** tab. Open the row\'s actions menu to download the formal report or the fix-it list.',
    },
    {
      type: 'heading',
      id: 'report-details',
      level: 2,
      text: 'Report details',
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Field', width: '30%' },
        { key: 'notes', label: 'Notes', width: '70%' },
      ],
      rows: [
        { field: 'Period start and end', notes: 'Required. The end date cannot be in the future or before the start. The start date defaults to the day after your last run\'s period ended, or three months before the end date if there is no earlier run.' },
        { field: 'Institution name', notes: 'Required. Defaults to your organization name.' },
        { field: 'Accountable executive name and title', notes: 'Required. Printed on the cover and the sign-off page.' },
        { field: 'Head of validation name and title', notes: 'Optional. When given, a second signature block is added to the sign-off page.' },
        { field: 'Prepared by name and title', notes: 'Required. The name defaults to yours.' },
        { field: 'Audience', notes: 'OSFI supervisory review or Board of directors. See "Audience" below.' },
        { field: 'Scope note', notes: 'Optional, up to 1,000 characters. Printed in the Scope and method section.' },
        { field: 'Final version', notes: 'Off by default. See "Draft or final" below.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Text fields take up to 200 characters. Every answer except the period and the final version box is filled in from your organization\'s last successful run of this template, so you only change what is different.',
    },
    {
      type: 'paragraph',
      text: 'The figures describe your records as they are when the report is generated. The period only limits the activity counts: validations signed off, findings opened and closed, threshold breaches and revalidation events.',
    },
    {
      type: 'heading',
      id: 'draft-or-final',
      level: 3,
      text: 'Draft or final',
    },
    {
      type: 'paragraph',
      text: 'A draft has "Draft: not for distribution" on every page and shows "Draft" where the signature lines would be. Tick **Final version** to remove the marking and print the signature lines. The run list shows a Draft or Final label on each run.',
    },
    {
      type: 'heading',
      id: 'audience',
      level: 3,
      text: 'Audience',
    },
    {
      type: 'paragraph',
      text: 'Both versions use the same data and the same rules. The audience only changes how much detail is shown.',
    },
    {
      type: 'table',
      columns: [
        { key: 'part', label: 'Part of the report', width: '30%' },
        { key: 'osfi', label: 'OSFI supervisory review', width: '35%' },
        { key: 'board', label: 'Board of directors', width: '35%' },
      ],
      rows: [
        { part: 'E-23 program completeness', osfi: 'Every requirement, with owner, due date and evidence', board: 'One line per requirement group' },
        { part: 'Model risk management status', osfi: 'Full, including the models with exceptions', board: 'Totals and the per-tier table, no model names' },
        { part: 'Where the checklist and the data disagree', osfi: 'Each rule that fired, with counts and up to 5 example models', board: 'Each rule that fired, with its count' },
        { part: 'Model inventory appendix', osfi: 'When turned on', board: 'Never shown' },
      ],
    },
    {
      type: 'heading',
      id: 'scheduling',
      level: 2,
      text: 'Scheduling the report',
    },
    {
      type: 'paragraph',
      text: 'Click **Use Template** instead of **Run now** to set up a schedule. The frequency starts on **Quarterly**. Pick the **Run in month**. The report then runs every three months from that month.',
    },
    {
      type: 'paragraph',
      text: 'A schedule doesn\'t ask for dates. Each run reports on the quarter that ends the day before it runs. If your fiscal quarter ends on 31 October, schedule the run for 1 November. All other answers, including the final version box, are stored with the schedule and used on every run.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'The fix-it list is never emailed',
      text: 'Scheduled emails carry the formal report only. The fix-it list is always stored with the run, even when the schedule\'s "Save to storage" option is off. You download it from the run list.',
    },
    {
      type: 'heading',
      id: 'whats-in-the-report',
      level: 2,
      text: 'What\'s in the formal report',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Cover', text: 'Institution, audience, period, the as-at date, who prepared it and the accountable executive.' },
        { bold: 'Scope and method', text: 'Where the data comes from, how the checks work, your scope note and the limitations.' },
        { bold: 'At a glance', text: 'Fixed figures: requirements done, groups checked against model risk data, rules that fired, models in scope, untiered models, overdue validations, open critical or high findings and fix-it items by severity. When there is an earlier run, it shows the change since then. No AI is used here.' },
        { bold: 'Executive summary and key findings', text: 'Written by AI from the data in the report.' },
        { bold: 'E-23 program completeness', text: 'Progress for each E-23 requirement group. Each group is labelled "Checked against MRM data" if at least one rule checks a requirement in it, or "Self-assessment only" if none does.' },
        { bold: 'Model risk management status', text: 'Models by tier, validation coverage, open findings by severity, monitoring coverage and activity in the period. Retired models are left out of every count.' },
        { bold: 'Where the checklist and the data disagree', text: 'The rules that fired. When none fire, the report says so and lists the rules it checked, so an empty table is never mistaken for an unchecked one.' },
        { bold: 'E-23 gap analysis', text: 'Written by AI. For each requirement group it states how far your records bear out the checklist (see below).' },
        { bold: 'Model inventory appendix', text: 'Off by default. One row per model, with retired models in a second table.' },
        { bold: 'Sign-off', text: 'The self-assessment statement, with signature lines for the accountable executive. The head of validation gets a second block when you give a name.' },
      ],
    },
    {
      type: 'heading',
      id: 'contradiction-rules',
      level: 2,
      text: 'How the checklist is checked against your records',
    },
    {
      type: 'paragraph',
      text: 'The report uses 13 fixed rules. A rule only fires when its E-23 requirement is marked Implemented or Audited and your records show the opposite for at least one model. Retired models are ignored.',
    },
    {
      type: 'table',
      columns: [
        { key: 'requirement', label: 'Requirement', width: '20%' },
        { key: 'condition', label: 'Fires when', width: '80%' },
      ],
      rows: [
        { requirement: '2.1.4', condition: 'The model inventory is empty' },
        { requirement: '2.2.3', condition: 'A model has no MRM tier' },
        { requirement: '2.2.4', condition: 'A model\'s tier was last set, or last confirmed by a validation sign-off, longer ago than its review interval, or the model is flagged for revalidation with no open validation' },
        { requirement: '3.1.3', condition: 'A model has no owner role' },
        { requirement: '3.4.1', condition: 'The validator of a model\'s latest validation also holds the developer role on that model' },
        { requirement: '3.4.2', condition: 'A model has an overdue validation' },
        { requirement: '3.4.6', condition: 'A model\'s latest signed-off validation report has a missing or empty section' },
        { requirement: '3.4.7', condition: 'A model has neither an approver role nor an inventory approver' },
        { requirement: '3.4.7', condition: 'An approved model\'s latest signed-off validation outcome is "not validated"' },
        { requirement: '3.4.9', condition: 'An approved model has an open critical or high finding with no remediation plan' },
        { requirement: '3.6.4', condition: 'A tier 1 or tier 2 model has no active threshold' },
        { requirement: '3.6.1', condition: 'A model has active thresholds but no metric received in the last 90 days' },
        { requirement: '2.2.8', condition: 'An open critical or high finding is past its due date' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Review intervals are VerifyWise\'s standard ones: 12 months for tier 1, 18 for tier 2 and 24 for tier 3. If a rule\'s requirement number is not in your E-23 checklist, the report lists that rule under "Rules not run" instead of treating it as clean.',
    },
    {
      type: 'heading',
      id: 'fix-it-list',
      level: 2,
      text: 'The fix-it list',
    },
    {
      type: 'paragraph',
      text: 'The fix-it list is a separate file in the same format as the report (PDF or DOCX). It is marked "Internal: not for external distribution" on the cover and in every page footer. It lists what to fix, with a severity, where the problem is, the owner (or "Unassigned"), the due date and what closes the item.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'High', text: 'A rule that fired, a requirement past its due date, or a model gap on a tier 1 model or a model with an open critical or high finding' },
        { bold: 'Medium', text: 'A requirement with no owner, marked as needing rework or marked done with no evidence. Other model gaps are medium too' },
        { bold: 'Low', text: 'Any other requirement that is not done yet' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The list is built from fixed rules and sorted by severity, then overdue items first. The AI does not rank or edit it. For this report, the AI recommended actions appear at the end of the fix-it list, not in the formal report. They name suggested owners, so they belong with the to-do items.',
    },
    {
      type: 'paragraph',
      text: 'If the fix-it list cannot be produced or stored, the whole run fails. You never get a formal report without its fix-it list. Deleting a run deletes both files.',
    },
    {
      type: 'heading',
      id: 'ai-sections',
      level: 2,
      text: 'AI sections',
    },
    {
      type: 'paragraph',
      text: 'Every section written by AI is labelled "AI-Generated Analysis" and draws only on the data in the report. The E-23 gap analysis gives each requirement group one of four positions: data consistent with self-assessment, partly consistent, inconsistent, or not assessable from VerifyWise data. These describe how well your records match your own checklist. They are not a compliance rating.',
    },
    {
      type: 'paragraph',
      text: 'Two limits are applied after the AI answers. A group labelled "Self-assessment only" is always "not assessable". A group with a rule that fired is never "consistent". If the AI\'s answer breaks either limit, the position is corrected before it goes into the report.',
    },
    {
      type: 'heading',
      id: 'limitations',
      level: 2,
      text: 'Limitations',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Requirement statuses are self-assessed by your team.' },
        { text: 'VerifyWise does not compute model performance metrics. Your institution sends them in.' },
        { text: 'These E-23 Appendix 1 fields are not tracked in VerifyWise: production deployment date, data sources, approved uses and exceptions, dependencies and third-party designation.' },
        { text: '"Overdue" and "stale rating" use VerifyWise\'s standard review intervals, which may differ from your own policy.' },
        { text: 'The report and the fix-it list are produced in English only.' },
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
      id: 'faq-use-case',
      level: 3,
      text: 'Can I run the report for a single use case?',
    },
    {
      type: 'paragraph',
      text: 'No. The report describes your whole model risk program, so it always covers the organization. A report on part of it would look complete while leaving models out.',
    },
    {
      type: 'heading',
      id: 'faq-who-can-run',
      level: 3,
      text: 'Who can run or schedule it?',
    },
    {
      type: 'paragraph',
      text: 'Admins only, like every organization report. Your model risk team can get the files from the run list, or through a schedule an Admin sets up.',
    },
    {
      type: 'heading',
      id: 'faq-no-framework',
      level: 3,
      text: 'The report says OSFI E-23 is not on file. What do I do?',
    },
    {
      type: 'paragraph',
      text: 'Add OSFI E-23 on the Frameworks page, record your requirement statuses, then run the report again.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'reporting',
          articleId: 'generating-reports',
          title: 'Generating reports',
          description: 'Create project and organization reports',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'mrm',
          title: 'Model risk management',
          description: 'Tier models, run validations and track findings',
        },
        {
          collectionId: 'compliance',
          articleId: 'adding-frameworks',
          title: 'Adding frameworks',
          description: 'Add OSFI E-23 and the other built-in frameworks',
        },
      ],
    },
  ],
};
