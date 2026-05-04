import type { ArticleContent } from '../../contentTypes';

export const reportsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Evaluation reports',
    },
    {
      type: 'paragraph',
      text: 'Once you\'ve run experiments, you can generate structured reports from the results. Reports follow the EvalCards standard, so they work as formal AI evaluation documentation.',
    },
    {
      type: 'heading',
      id: 'generating',
      level: 2,
      text: 'Generating a report',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to the **Reports** tab in your project.' },
        { text: 'Click **Generate report** to open the configuration modal.' },
        { text: 'Give your report a title. The project name is pre-filled as a default.' },
        { text: 'Choose a format: **PDF** for a full document or **CSV** for raw data.' },
        { text: 'Select which completed experiments to include.' },
        { text: 'Pick the sections you want (evaluation context, metric results, safety assessment and more).' },
        { text: 'Click **Generate**. The report may take up to a minute to produce.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'You need at least one completed experiment before you can generate a report. If none are available, the generate button will be disabled.',
    },
    {
      type: 'heading',
      id: 'report-sections',
      level: 2,
      text: 'Report sections',
    },
    {
      type: 'paragraph',
      text: 'The configuration modal shows a checklist of sections. Each section can be toggled on or off:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Executive summary', text: 'Overall scores, pass/fail verdict, key findings' },
        { bold: 'Evaluation context', text: 'Project, organization, evaluator and date' },
        { bold: 'Model under test', text: 'Provider, model ID and generation parameters' },
        { bold: 'Evaluation setup', text: 'Dataset, judge model, metrics and thresholds' },
        { bold: 'Metric results', text: 'Per-metric scores grouped by quality and safety' },
        { bold: 'Safety and compliance', text: 'Bias, toxicity and hallucination analysis' },
        { bold: 'Sample-level details', text: 'Per-sample scores table (off by default, increases file size)' },
        { bold: 'Arena comparison', text: 'Head-to-head results if you\'ve run arena battles (off by default)' },
        { bold: 'Limitations and recommendations', text: 'Auto-generated suggestions based on failing metrics' },
      ],
    },
    {
      type: 'heading',
      id: 'viewing',
      level: 2,
      text: 'Viewing and downloading reports',
    },
    {
      type: 'paragraph',
      text: 'PDF reports open in an inline viewer right on the page. From the viewer toolbar you can download the file or open it in a new browser tab. CSV reports download automatically.',
    },
    {
      type: 'paragraph',
      text: 'All generated reports appear in a history table below the generate button. The table shows the report name, type of report, project/organization, date generated and who generated it. Click any row to view a PDF or download a CSV.',
    },
    {
      type: 'heading',
      id: 'deleting',
      level: 2,
      text: 'Deleting reports',
    },
    {
      type: 'paragraph',
      text: 'Click the trash icon next to any report in the history table. You\'ll be asked to confirm before the report is permanently removed.',
    },
  ],
};
