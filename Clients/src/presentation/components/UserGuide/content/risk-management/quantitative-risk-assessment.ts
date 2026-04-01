import type { ArticleContent } from '@user-guide-content/contentTypes';

export const quantitativeRiskAssessmentContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Qualitative labels like "high" or "low" tell you something about a risk, but they do not tell you what it could actually cost. Quantitative risk assessment fills that gap. It uses the FAIR methodology (Factor Analysis of Information Risk) to put a dollar figure on each risk in your register: how much you stand to lose per year and whether your controls justify their cost.',
    },
    {
      type: 'paragraph',
      text: 'Once enabled, every risk gains a Quantitative tab. You enter event frequency, loss estimates across four categories, control effectiveness, and mitigation cost. VerifyWise runs the math in real time and shows your Annualized Loss Expectancy, residual exposure, and ROI right at the top of the form.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Enabling quantitative assessment does not replace qualitative scoring. Severity and likelihood ratings stay in place. You get both views on every risk.',
    },
    {
      type: 'heading',
      id: 'enabling-the-feature',
      level: 2,
      text: 'Turning it on',
    },
    {
      type: 'paragraph',
      text: 'This is an organization-wide setting. An admin needs to flip the switch before anyone can use it.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to Settings in the sidebar' },
        { text: 'Open the Features tab' },
        { text: 'Toggle "Quantitative risk assessment" on' },
        { text: 'A Quantitative tab now appears whenever you create or edit a risk' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Only admins can change this setting. Other roles can see the toggle but cannot switch it.',
    },
    {
      type: 'heading',
      id: 'the-fair-model',
      level: 2,
      text: 'How the FAIR math works',
    },
    {
      type: 'paragraph',
      text: 'FAIR is a widely adopted framework for expressing risk in monetary terms. VerifyWise uses a simplified version built around four calculations:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'PERT estimate', text: 'Takes your min, most likely, and max values and produces a weighted average: (min + 4 x likely + max) / 6. The formula gives more weight to the most likely outcome while still accounting for the extremes.' },
        { bold: 'Annualized Loss Expectancy (ALE)', text: 'Your expected yearly loss. Multiply the PERT of your event frequency by the total PERT loss across all four categories.' },
        { bold: 'Residual ALE', text: 'What remains after your controls take effect. If you rate your controls at 70% effective, residual ALE drops to 30% of the original.' },
        { bold: 'Return on Investment (ROI)', text: 'Tells you whether mitigation spending pays for itself. The formula is ((ALE minus Residual ALE) minus mitigation cost) / mitigation cost x 100. Positive means your spend is justified; negative means you are paying more for controls than the risk reduction you get back.' },
      ],
    },
    {
      type: 'heading',
      id: 'filling-out-the-form',
      level: 2,
      text: 'Walking through the form',
    },
    {
      type: 'paragraph',
      text: 'Open any risk and click the Quantitative tab. The form has five sections. The Risk Exposure Summary sits at the top and recalculates as you type.',
    },
    {
      type: 'heading',
      id: 'risk-exposure-summary',
      level: 3,
      text: 'Risk Exposure Summary',
    },
    {
      type: 'paragraph',
      text: 'A live dashboard at the top of the form. It shows Total Loss (PERT), ALE, Residual ALE, and ROI. Until you enter numbers, it displays a placeholder. Once you start filling in values, the metrics update with every keystroke.',
    },
    {
      type: 'heading',
      id: 'industry-benchmarks',
      level: 3,
      text: 'Starting from a benchmark',
    },
    {
      type: 'paragraph',
      text: 'You do not have to estimate from zero. Pick an industry benchmark from the dropdown and VerifyWise fills in all fifteen frequency and loss fields for you. There are 19 benchmarks across six industries, drawn from published regulatory penalty data and incident reports.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Cross-Industry', text: 'EU AI Act prohibited practices, high-risk system non-compliance, governance failures, data quality issues, deepfake and synthetic media' },
        { bold: 'Technology', text: 'Hiring bias, training data privacy breaches, adversarial attacks, supply chain compromise, IP infringement' },
        { bold: 'Financial Services', text: 'Lending bias, data breaches, model failure in critical decisions, transparency failures' },
        { bold: 'Healthcare', text: 'Diagnostic bias, patient data breaches, model failure in clinical diagnosis' },
        { bold: 'Automotive & Transport', text: 'Autonomous system failure' },
        { bold: 'Government', text: 'Transparency failures in public-facing AI services' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Benchmarks give you a calibrated starting point, not a finished assessment. Adjust the numbers after applying one to reflect your organization, risk appetite, and scale.',
    },
    {
      type: 'heading',
      id: 'event-frequency',
      level: 3,
      text: 'Event frequency',
    },
    {
      type: 'paragraph',
      text: 'How often do you expect this risk event to happen each year? Enter three values:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Min', text: 'Best case. The lowest realistic frequency.' },
        { bold: 'Most likely', text: 'Your best single estimate of actual frequency.' },
        { bold: 'Max', text: 'Worst case. The highest realistic frequency.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'A frequency of min 0.1, most likely 0.3, max 0.8 means you expect the event roughly once every three years on average, with a range from once in ten years to about once every fifteen months.',
    },
    {
      type: 'heading',
      id: 'loss-magnitude',
      level: 3,
      text: 'Loss magnitude',
    },
    {
      type: 'paragraph',
      text: 'For each occurrence, estimate the cost across four categories. Each one takes a min, most likely, and max value.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Regulatory fines', text: 'What regulators could charge you. GDPR penalties run up to 4% of global turnover; EU AI Act fines can reach 7% or EUR 35M.' },
        { bold: 'Operational costs', text: 'What it takes to respond and recover internally: staff hours, system fixes, downtime.' },
        { bold: 'Litigation costs', text: 'Legal fees, settlements, and court judgments.' },
        { bold: 'Reputational damage', text: 'Lost customers, eroded brand value, and foregone revenue from negative coverage.' },
      ],
    },
    {
      type: 'heading',
      id: 'mitigation-controls',
      level: 3,
      text: 'Mitigation and ROI',
    },
    {
      type: 'paragraph',
      text: 'With your exposure estimated, gauge the value of your defenses:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Control effectiveness', text: 'Drag the slider from 0% (no controls at all) to 100% (risk fully contained). This directly shrinks your Residual ALE.' },
        { bold: 'Annual mitigation cost', text: 'Enter what you spend each year on the controls. VerifyWise uses this to calculate whether the investment pays for itself.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Green ROI means your controls save more than they cost. Red ROI means the spend exceeds the risk reduction. Neither is automatically wrong, but red deserves a second look.',
    },
    {
      type: 'heading',
      id: 'dashboard-portfolio',
      level: 2,
      text: 'Portfolio view on the dashboard',
    },
    {
      type: 'paragraph',
      text: 'Once you have at least one quantified risk, three new cards appear on the main dashboard:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'AI portfolio exposure', text: 'Total ALE across every quantified risk, residual exposure, how much your controls have reduced the total, what you spend on mitigation, and your aggregate ROI.' },
        { bold: 'Exposure trend (90 days)', text: 'Two lines tracking total ALE and residual ALE over the past three months so you can see whether things are improving.' },
        { bold: 'Loss category breakdown', text: 'Shows which of the four loss types (regulatory, operational, litigation, reputational) accounts for the largest share of your exposure.' },
      ],
    },
    {
      type: 'heading',
      id: 'standards-compliance',
      level: 2,
      text: 'Where this fits in compliance',
    },
    {
      type: 'paragraph',
      text: 'Putting numbers to risk is not just good practice. Several frameworks require or strongly encourage it:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'EU AI Act', text: 'Articles 9, 14, 15, and 99 call for documented risk management, human oversight, robustness testing, and proportionate penalties. Financial quantification strengthens every one of those requirements for high-risk systems.' },
        { bold: 'ISO 42001', text: 'Clause 8.2 asks organizations to assess the likelihood and consequences of AI risks. FAIR-based estimates give you a structured, defensible way to meet that.' },
        { bold: 'NIST AI RMF', text: 'The Map and Measure functions expect you to characterize risks and track their impacts over time. ALE and residual ALE give you the numbers to do that.' },
        { bold: 'GDPR', text: 'Data protection impact assessments are sharper when you can attach a financial estimate to a potential breach, especially for risks involving training data.' },
      ],
    },
    {
      type: 'heading',
      id: 'best-practices',
      level: 2,
      text: 'Getting the most out of it',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Start from a benchmark, then adjust. The pre-loaded numbers come from published penalty data and real incidents, so they are a solid baseline. Tailor them to your size and context.' },
        { text: 'Do not pretend you know more than you do. Wide min-max ranges are honest; artificially narrow ranges create a false sense of precision.' },
        { text: 'Revisit every quarter. Regulations shift, models get updated, and new threat patterns emerge. Stale numbers are worse than no numbers.' },
        { text: 'Use ALE to prioritize. When two risks compete for budget, the one with a higher ALE usually deserves attention first.' },
        { text: 'Watch the trend chart. If your total ALE keeps climbing despite mitigation spending, something is not working.' },
      ],
    },
  ],
};
