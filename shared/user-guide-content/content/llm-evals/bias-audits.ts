import type { ArticleContent } from '../../contentTypes';

export const biasAuditsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'What is a bias audit?',
    },
    {
      type: 'paragraph',
      text: 'A bias audit checks whether an automated decision tool treats demographic groups consistently. You upload records with demographic columns and one of three kinds of outcome data, and VerifyWise calculates per-group rates, cross-group disparities and flags groups that fall below the configured threshold. The tool is not LLM-specific; it works for any system that produces a decision, a score or a classification.',
    },
    {
      type: 'paragraph',
      text: 'NYC Local Law 144 requires annual independent bias audits for any automated employment decision tool. EU AI Act Article 9 and the EEOC guidelines set comparable expectations. VerifyWise ships with 15 compliance frameworks out of the box, each pre-configured with the right categories, thresholds and reporting requirements.',
    },
    {
      type: 'paragraph',
      text: 'Every run gives you an interactive results dashboard, a raw JSON export and a formal PDF report you can hand to a reviewer or procurement team without any additional explanation.',
    },
    {
      type: 'heading',
      id: 'accessing',
      level: 2,
      text: 'Accessing bias audits',
    },
    {
      type: 'paragraph',
      text: 'Open the LLM Evals module from the sidebar and click **Bias audits**. You\'ll see a list of all audits for your organization, sortable by date, status, framework, or mode. Running audits update automatically every few seconds.',
    },
    {
      type: 'heading',
      id: 'choosing-metric',
      level: 2,
      text: 'Choosing a metric',
    },
    {
      type: 'paragraph',
      text: 'Before uploading your data, you pick an audit metric. The metric determines what your CSV needs to contain and what the results mean. VerifyWise supports three modes:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Selection rate', text: 'The default, and the right choice for any tool that produces a binary decision (hire or reject, approve or deny, flag or pass). Your CSV needs one outcome column. The audit computes each group\'s selection rate and an impact ratio against the highest-rate group. NYC Local Law 144 mandates this metric for binary employment decisions.' },
        { bold: 'Scoring rate', text: 'Use this when your tool outputs a continuous score rather than a yes/no: a ranker, a risk score, a suitability score. Your CSV needs one numeric score column. VerifyWise computes each group\'s "above-median rate" (the share of records whose score beats the overall median) and then applies the same impact ratio logic. Local Law 144 explicitly allows this as an alternative to selection rate for scoring tools.' },
        { bold: 'Fairness metrics', text: 'Pick this when you have both the model\'s prediction and the real answer. Your CSV needs a prediction column and a ground-truth column. You get a confusion matrix per group (true positive rate, false positive rate, precision, accuracy) plus the three standard cross-group differences: equal opportunity (TPR gap), equalized odds, predictive parity. This is the most informative mode but it also requires the most data.' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'Not sure which metric fits? Let your data pick for you. If the outcome is a yes/no flag, go with selection rate. If it\'s a numeric score, go with scoring rate. Fairness metrics is the right choice only when you also have ground-truth labels sitting next to the predictions.',
    },
    {
      type: 'heading',
      id: 'creating',
      level: 2,
      text: 'Creating a new audit',
    },
    {
      type: 'paragraph',
      text: 'Click **New bias audit** to open the setup wizard. It walks you through four steps.',
    },
    {
      type: 'heading',
      id: 'step-1',
      level: 3,
      text: 'Step 1: Select a compliance framework',
    },
    {
      type: 'paragraph',
      text: 'Pick the law or standard that applies to your situation. Each framework card shows the jurisdiction and a short description of what it requires. Frameworks are grouped by audit mode:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Quantitative audit', text: 'Computes selection rates and impact ratios with statistical flagging. Used by NYC LL144, EEOC guidelines, and California FEHA.' },
        { bold: 'Impact assessment', text: 'Structured assessment with optional quantitative supplement. Used by Colorado SB 205, EU AI Act, and South Korea.' },
        { bold: 'Compliance checklist', text: 'Checklist-based evaluation with recommended quantitative analysis. Used by Illinois HB 3773, New Jersey, Texas TRAIGA, and others.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Selecting a framework auto-fills everything: protected categories, group labels, threshold values, and intersectional analysis settings. You can override any of these in step 4.',
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'Not sure which framework applies? If you\'re hiring in New York City using an AI tool, start with NYC LL144. For general US employment, EEOC guidelines is a safe default. The "Custom" preset lets you configure everything from scratch.',
    },
    {
      type: 'heading',
      id: 'step-2',
      level: 3,
      text: 'Step 2: Enter system information',
    },
    {
      type: 'paragraph',
      text: 'Provide details about the AI system being audited. The form adapts based on your framework. For NYC LL144, you\'ll see fields specific to AEDTs (automated employment decision tools). For other frameworks, the labels adjust accordingly.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'System name', text: 'The name of the AI tool or model being audited.' },
        { bold: 'Description', text: 'What the system does and how it\'s used in decision-making.' },
        { bold: 'Distribution date', text: 'When the tool was first deployed or made available.' },
        { bold: 'Data source description', text: 'Where the demographic and outcome data came from.' },
      ],
    },
    {
      type: 'heading',
      id: 'step-3',
      level: 3,
      text: 'Step 3: Upload demographic data',
    },
    {
      type: 'paragraph',
      text: 'Upload a CSV file where each row represents one record. The file needs demographic columns plus the metric-specific column(s) described in the "Choosing a metric" section above.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'The wizard shows required columns based on your selected framework and your chosen metric. For NYC LL144 with selection rate, you need sex and race/ethnicity columns plus an outcome column. Categories with empty group definitions are marked as optional.',
    },
    {
      type: 'paragraph',
      text: 'Step 3 starts with a metric dropdown. Pick selection rate, scoring rate or fairness metrics, and the rest of the step adapts to your choice. After uploading the CSV you\'ll see:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Metric selector', text: 'Dropdown at the top of the step. Changing the metric swaps the column selectors below it.' },
        { bold: 'Column mapping', text: 'Dropdowns that map each required demographic category to a column in your CSV. For example, map "Sex" to your CSV\'s "Gender" column.' },
        { bold: 'Metric column(s)', text: 'For selection rate, an outcome column. For scoring rate, a numeric score column. For fairness metrics, a prediction column plus a ground-truth column.' },
        { bold: 'Data preview', text: 'A preview of the first five rows so you can confirm the data looks correct before proceeding.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Accepted outcome values for selection-rate and fairness-metrics modes are 1/true/yes/selected/hired/promoted as positive, and 0/false/no/rejected/declined as negative. Scoring-rate columns need to parse as numbers; missing or non-numeric values are counted as unknown.',
    },
    {
      type: 'paragraph',
      text: 'The wizard validates that required categories are mapped, no duplicate mappings exist, and your metric columns aren\'t reused as demographic columns.',
    },
    {
      type: 'heading',
      id: 'step-4',
      level: 3,
      text: 'Step 4: Review and run',
    },
    {
      type: 'paragraph',
      text: 'Review all settings before running the audit. The framework auto-fills these values, but you can adjust them:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Adverse impact threshold', text: 'Groups with an impact ratio below this value are flagged. NYC LL144 and EEOC use 0.80 (the "four-fifths rule").' },
        { bold: 'Small sample exclusion', text: 'Groups representing less than this percentage of total applicants are excluded from impact ratio calculations. Prevents unreliable results from very small groups.' },
        { bold: 'Intersectional analysis', text: 'When enabled, the audit computes cross-tabulated results (e.g., Male + Hispanic, Female + Asian) in addition to per-category results.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click **Run audit** to start. The audit runs in the background and typically completes in a few seconds. You\'ll be redirected to the audit list where the status updates automatically.',
    },
    {
      type: 'heading',
      id: 'results',
      level: 2,
      text: 'Reading audit results',
    },
    {
      type: 'paragraph',
      text: 'Click into a completed audit to see the results. The detail page shows the audit title, the compliance framework, headline summary cards, a plain-English summary, and the metric-specific results tables underneath.',
    },
    {
      type: 'heading',
      id: 'editable-name',
      level: 3,
      text: 'Naming your audit',
    },
    {
      type: 'paragraph',
      text: 'Hover over the audit title at the top of the detail page and click the pencil icon to rename it. New audits inherit the compliance framework as their default title ("NYC Local Law 144"), but a descriptive name like "Acme Resume Screener Q1 2026" makes the list view easier to scan. The compliance framework continues to appear as a subtitle.',
    },
    {
      type: 'heading',
      id: 'summary-cards',
      level: 3,
      text: 'Summary cards',
    },
    {
      type: 'paragraph',
      text: 'At the top you\'ll see cards for total records, the count and rate of positive outcomes, and the number of flagged groups. The positive-outcome label depends on the metric: "Total selected" for selection rate, "Above median" for scoring rate, "Predicted positive" for fairness metrics. If rows were excluded due to missing demographic data, an "Unknown" card also appears.',
    },
    {
      type: 'heading',
      id: 'impact-tables',
      level: 3,
      text: 'Impact ratio tables',
    },
    {
      type: 'paragraph',
      text: 'Each demographic category gets its own table. For NYC LL144, you\'ll see separate tables for sex, race/ethnicity, and (if enabled) intersectional categories. Each table shows:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Group', text: 'The demographic group name (e.g., "Female", "Hispanic or Latino").' },
        { bold: 'Applicants', text: 'Number of applicants in this group.' },
        { bold: 'Selected', text: 'Number selected/hired from this group.' },
        { bold: 'Selection rate', text: 'Percentage of the group that was selected.' },
        { bold: 'Impact ratio', text: 'This group\'s selection rate divided by the highest group\'s selection rate. A value of 1.000 means equal treatment.' },
        { bold: 'Status', text: 'Pass (above threshold), Flag (below threshold), or N/A (excluded due to small sample size).' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Flagged rows are highlighted in red. The table header shows which group had the highest selection rate, since all impact ratios are calculated relative to that group.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'A flag doesn\'t automatically mean discrimination. It means the data shows a statistical disparity that warrants further investigation. The four-fifths rule is a screening tool, not a legal conclusion.',
    },
    {
      type: 'heading',
      id: 'intersectional',
      level: 3,
      text: 'Intersectional results',
    },
    {
      type: 'paragraph',
      text: 'When intersectional analysis is enabled, an additional table shows compound groups like "Male - Hispanic or Latino" or "Female - Asian". This reveals disparities that single-category analysis might miss. For example, a system might treat women and men equally overall, but show significant differences for women of a specific racial group.',
    },
    {
      type: 'heading',
      id: 'fairness-metrics-results',
      level: 3,
      text: 'Fairness metrics tables',
    },
    {
      type: 'paragraph',
      text: 'When you run the audit with the fairness-metrics mode, the results page renders a confusion-matrix table for each demographic category. Each row shows one group with its true positive rate, false positive rate, false negative rate, precision, accuracy, and the raw TP/FP/TN/FN counts.',
    },
    {
      type: 'paragraph',
      text: 'Above the per-group table you\'ll find three cross-group differences that summarize the disparity in a single number each:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Equal opportunity difference', text: 'The gap between the highest and lowest true positive rate across groups. A value near zero means every group\'s qualified members get correctly identified at the same rate. Big values mean some groups are systematically missed.' },
        { bold: 'Equalized odds difference', text: 'The larger of the TPR gap and the FPR gap. A stricter version of equal opportunity that penalizes both missed positives and false alarms.' },
        { bold: 'Predictive parity difference', text: 'The gap in precision across groups. A positive prediction should mean roughly the same thing regardless of which group it applies to.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'No single fairness metric is "correct." They can conflict with each other: optimizing for equal opportunity can worsen predictive parity and vice versa. Which one matters most depends on the downstream consequences of a wrong decision in your specific context.',
    },
    {
      type: 'heading',
      id: 'score-distributions',
      level: 3,
      text: 'Score distributions',
    },
    {
      type: 'paragraph',
      text: 'If your CSV includes a score column, the results page shows a score-distribution section alongside the impact-ratio tables. Each group gets a histogram of its scores plus descriptive statistics (mean, median, standard deviation) and a Kolmogorov-Smirnov statistic comparing the group\'s distribution to the overall one. Small K-S values mean the group looks like the overall distribution; large values mean it\'s shifted in some way.',
    },
    {
      type: 'paragraph',
      text: 'Score distributions are diagnostic. Two groups can have identical impact ratios but very different score distributions, and the distribution view surfaces that difference.',
    },
    {
      type: 'heading',
      id: 'actions',
      level: 2,
      text: 'Audit actions',
    },
    {
      type: 'paragraph',
      text: 'From the results page, you can:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Download PDF report', text: 'Generate a formal PDF audit report. This is the artifact to hand to a reviewer, auditor, or procurement team. Described in detail below.' },
        { bold: 'Download JSON', text: 'Export the full raw results as a JSON file for external reporting, record-keeping, or downstream tooling.' },
        { bold: 'Delete', text: 'Permanently remove the audit and all its results. This requires confirmation.' },
      ],
    },
    {
      type: 'heading',
      id: 'pdf-report',
      level: 2,
      text: 'The PDF report',
    },
    {
      type: 'paragraph',
      text: 'The PDF is built so a reader who has never opened VerifyWise can still understand what was audited and what the numbers mean. It starts with a cover page, moves through an executive summary, describes the system and the data, walks through the methodology, then presents the results tables with any fairness metrics or score distributions your audit produced. It closes with a limitations section. Nowhere does the PDF offer mitigation advice: that\'s a conversation for qualified counsel, not a tool output.',
    },
    {
      type: 'paragraph',
      text: 'The cover page also shows the auditor\'s declared independence level. Self-declared audits carry a warning box so readers know the tool vendor or system owner produced the report without third-party oversight. Plenty of legitimate audits are self-declared, but it\'s the first thing a reviewer should see.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'The PDF report does not constitute legal advice. It documents statistical results against a chosen framework. Interpretation in your specific regulatory context is a conversation to have with qualified counsel.',
    },
    {
      type: 'heading',
      id: 'frameworks',
      level: 2,
      text: 'Supported frameworks',
    },
    {
      type: 'table',
      columns: [
        { key: 'framework', label: 'Framework', width: '30%' },
        { key: 'jurisdiction', label: 'Jurisdiction', width: '25%' },
        { key: 'mode', label: 'Mode', width: '20%' },
        { key: 'threshold', label: 'Default threshold', width: '25%' },
      ],
      rows: [
        { framework: 'NYC Local Law 144', jurisdiction: 'New York City', mode: 'Quantitative audit', threshold: '0.80' },
        { framework: 'EEOC guidelines', jurisdiction: 'United States', mode: 'Quantitative audit', threshold: '0.80' },
        { framework: 'California FEHA', jurisdiction: 'California', mode: 'Quantitative audit', threshold: '0.80' },
        { framework: 'Colorado SB 205', jurisdiction: 'Colorado', mode: 'Impact assessment', threshold: '0.80' },
        { framework: 'EU AI Act', jurisdiction: 'European Union', mode: 'Impact assessment', threshold: '0.80' },
        { framework: 'South Korea AI Act', jurisdiction: 'South Korea', mode: 'Impact assessment', threshold: '0.80' },
        { framework: 'Illinois HB 3773', jurisdiction: 'Illinois', mode: 'Compliance checklist', threshold: '0.80' },
        { framework: 'New Jersey AI guidance', jurisdiction: 'New Jersey', mode: 'Compliance checklist', threshold: '—' },
        { framework: 'Texas TRAIGA', jurisdiction: 'Texas', mode: 'Compliance checklist', threshold: '—' },
        { framework: 'UK GDPR & Equality Act', jurisdiction: 'United Kingdom', mode: 'Compliance checklist', threshold: '0.80' },
        { framework: 'Singapore WFA', jurisdiction: 'Singapore', mode: 'Compliance checklist', threshold: '—' },
        { framework: 'Brazil Bill 2338', jurisdiction: 'Brazil', mode: 'Compliance checklist', threshold: '—' },
        { framework: 'NIST AI RMF', jurisdiction: 'International', mode: 'Impact assessment', threshold: '0.80' },
        { framework: 'ISO 42001', jurisdiction: 'International', mode: 'Impact assessment', threshold: '0.80' },
        { framework: 'Custom', jurisdiction: '—', mode: 'Quantitative audit', threshold: 'User-defined' },
      ],
    },
    {
      type: 'heading',
      id: 'csv-format',
      level: 2,
      text: 'Preparing your CSV file',
    },
    {
      type: 'paragraph',
      text: 'Your CSV needs at minimum a demographic column and an outcome column. Here\'s what a typical file looks like for an NYC LL144 audit:',
    },
    {
      type: 'code',
      language: 'csv',
      code: 'Gender,Race,Selected\nMale,White,1\nFemale,Hispanic or Latino,0\nMale,Black or African American,1\nFemale,Asian,1\nMale,White,0',
    },
    {
      type: 'paragraph',
      text: 'A few things to keep in mind:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Column names are flexible', text: 'You map them in step 3, so they don\'t need to match the framework\'s category names exactly.' },
        { bold: 'Outcome values', text: 'The outcome column accepts 1/true/yes/selected/hired/promoted as positive outcomes. Everything else (0/false/no/rejected/declined) is treated as not selected.' },
        { bold: 'Missing data', text: 'Rows with empty values in any mapped demographic column are excluded and counted separately as "unknown".' },
        { bold: 'File size', text: 'Maximum 50 MB. Quoted fields with commas are supported (RFC 4180).' },
        { bold: 'Encoding', text: 'UTF-8 is preferred. The parser also handles UTF-8 with BOM, Latin-1, and Windows-1252.' },
      ],
    },
    {
      type: 'heading',
      id: 'understanding-math',
      level: 2,
      text: 'How the math works',
    },
    {
      type: 'paragraph',
      text: 'Each metric mode uses a slightly different formula, but the shape of the output is the same: a per-group rate, a ratio against the highest-rate group, and a flag when the ratio falls below the threshold.',
    },
    {
      type: 'heading',
      id: 'math-selection-rate',
      level: 3,
      text: 'Selection rate',
    },
    {
      type: 'ordered-list',
      items: [
        { text: '**Selection rate** = number selected / total records in that group' },
        { text: '**Impact ratio** = this group\'s selection rate / highest group\'s selection rate' },
        { text: 'If the impact ratio falls below the threshold (typically 0.80), the group is **flagged**' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The 0.80 threshold is the "four-fifths rule" from the EEOC Uniform Guidelines on Employee Selection Procedures. A group\'s selection rate should be at least 80% of the most-selected group\'s rate. A ratio of 0.75 means that group is selected at 75% the rate of the top group, which falls below the threshold.',
    },
    {
      type: 'heading',
      id: 'math-scoring-rate',
      level: 3,
      text: 'Scoring rate',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Compute the **overall median** of every record\'s score (one number across all groups)' },
        { text: '**Scoring rate** for a group = share of that group\'s records whose score is above the overall median' },
        { text: '**Impact ratio** = this group\'s scoring rate / highest group\'s scoring rate' },
        { text: 'The same threshold and flagging rules apply as for selection rate' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Scoring rate is the right metric for ranking tools and continuous-score tools because it asks "does this tool place group X above its overall median as often as it places group Y?" rather than collapsing the score into a yes/no first.',
    },
    {
      type: 'heading',
      id: 'math-fairness-metrics',
      level: 3,
      text: 'Fairness metrics',
    },
    {
      type: 'paragraph',
      text: 'Fairness metrics are computed from a confusion matrix per group. Each record has both a model prediction and a ground-truth label, so every record falls into exactly one of four cells:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'TP (true positive)', text: 'Predicted positive, actually positive.' },
        { bold: 'FP (false positive)', text: 'Predicted positive, actually negative.' },
        { bold: 'TN (true negative)', text: 'Predicted negative, actually negative.' },
        { bold: 'FN (false negative)', text: 'Predicted negative, actually positive.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'From these counts VerifyWise derives the standard per-group rates:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: '**True positive rate (TPR)** = TP / (TP + FN), also called recall or sensitivity' },
        { text: '**False positive rate (FPR)** = FP / (FP + TN)' },
        { text: '**Precision** = TP / (TP + FP)' },
        { text: '**Accuracy** = (TP + TN) / total' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Cross-group differences are then reported as the max-minus-min gap across groups: equal opportunity difference is the TPR gap, equalized odds difference takes the larger of the TPR and FPR gaps, and predictive parity difference is the precision gap.',
    },
    {
      type: 'heading',
      id: 'math-ks',
      level: 3,
      text: 'Kolmogorov-Smirnov for score distributions',
    },
    {
      type: 'paragraph',
      text: 'The score distribution view uses a two-sample Kolmogorov-Smirnov test to compare each group\'s scores against the overall distribution. The K-S statistic is the largest gap between the two empirical cumulative distribution functions. A statistic of 0.0 means the distributions are identical; 1.0 means they are completely disjoint. The reported p-value uses the standard Kolmogorov asymptotic formula and tells you how surprising that gap would be under the null hypothesis that both samples come from the same distribution.',
    },
    {
      type: 'heading',
      id: 'math-exclusion',
      level: 3,
      text: 'Small sample exclusion',
    },
    {
      type: 'paragraph',
      text: 'Groups that make up less than the small sample exclusion percentage (default 2%) are excluded from the calculation entirely. Small samples produce unreliable ratios, and including them can mask real patterns with noise. Excluded groups appear in the results with a grey "N/A" status so it\'s obvious they were present in the data but set aside.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        { collectionId: 'llm-evals', articleId: 'llm-evals-overview', title: 'LLM Evals overview', description: 'Introduction to the evaluation platform' },
        { collectionId: 'llm-evals', articleId: 'running-experiments', title: 'Running experiments', description: 'Create evaluation experiments for your models' },
      ],
    },
  ],
};
