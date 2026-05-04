import type { ArticleContent } from '../../contentTypes';

export const riskMitigationContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Risk mitigation is about taking action to bring identified risks down to acceptable levels. Risk assessment tells you what\'s out there and how serious it is. Mitigation is where you decide what to do about it and track your progress.',
    },
    {
      type: 'paragraph',
      text: 'Without mitigation planning, risks stay as theoretical concerns in a spreadsheet. With it, you\'ve got a clear path from spotting a problem to actually solving it.',
    },
    {
      type: 'heading',
      id: 'mitigation-approaches',
      level: 2,
      text: 'Mitigation approaches',
    },
    {
      type: 'paragraph',
      text: 'When addressing a risk, you typically have four options:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Avoid', text: 'Eliminate the risk entirely by not proceeding with the risky activity' },
        { bold: 'Reduce', text: 'Implement controls that lower the likelihood or impact of the risk' },
        { bold: 'Transfer', text: 'Shift the risk to another party through insurance, contracts or partnerships' },
        { bold: 'Accept', text: 'Acknowledge the risk and move forward without extra controls when the risk is low or mitigation isn\'t cost-effective' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Most AI risks are handled through reduction, meaning you implement technical controls, process changes or monitoring that makes the risk less likely or less severe.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Mitigation information is stored directly on each risk record, making it easy to see both the risk and its treatment in a single view.',
    },
    {
      type: 'heading',
      id: 'mitigation-status',
      level: 2,
      text: 'Mitigation status',
    },
    {
      type: 'paragraph',
      text: 'Track the progress of your mitigation efforts using these status options:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Circle',
          title: 'Not started',
          description: 'Mitigation has been identified but work has not begun.',
        },
        {
          icon: 'Clock',
          title: 'In progress',
          description: 'Mitigation activities are currently underway.',
        },
        {
          icon: 'CheckCircle',
          title: 'Completed',
          description: 'All mitigation activities have been implemented.',
        },
        {
          icon: 'Pause',
          title: 'On hold',
          description: 'Mitigation work has been temporarily paused.',
        },
        {
          icon: 'ArrowRight',
          title: 'Deferred',
          description: 'Mitigation has been postponed to a later date.',
        },
        {
          icon: 'XCircle',
          title: 'Canceled',
          description: 'Mitigation has been cancelled and will not be pursued.',
        },
        {
          icon: 'AlertTriangle',
          title: 'Requires review',
          description: 'Mitigation needs additional review or reassessment.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'mitigation-plan',
      level: 2,
      text: 'Creating a mitigation plan',
    },
    {
      type: 'paragraph',
      text: 'For each risk requiring mitigation, document the following:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Mitigation plan', text: 'Describe the specific actions to reduce the risk' },
        { bold: 'Implementation strategy', text: 'Outline how the mitigation will be executed' },
        { bold: 'Deadline', text: 'Set a target date for completing the mitigation' },
        { bold: 'Approver', text: 'Assign responsibility for approving the mitigation' },
      ],
    },
    {
      type: 'heading',
      id: 'risk-levels',
      level: 2,
      text: 'Tracking risk levels',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise tracks multiple risk level measurements so you can see how well your mitigations are working:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Current risk level', text: 'The present risk level captured on the mitigation form (manually selected from Low / Medium / High / Critical)' },
        { bold: 'Residual risk', text: 'Calculated automatically from residual likelihood × residual severity once mitigations are in place' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Current risk levels range from:',
    },
    {
      type: 'checklist',
      items: [
        'Very low risk',
        'Low risk',
        'Medium risk',
        'High risk',
        'Very high risk',
      ],
    },
    {
      type: 'heading',
      id: 'post-mitigation',
      level: 2,
      text: 'Post-mitigation assessment',
    },
    {
      type: 'paragraph',
      text: 'After implementing mitigation controls, reassess the risk using:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Likelihood after mitigation', text: 'Re-evaluate probability with controls in place' },
        { bold: 'Risk severity', text: 'Assess the impact level after mitigation (Negligible, Minor, Moderate, Major, or Critical)' },
        { bold: 'Final risk level', text: 'Document the residual risk' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Always reassess likelihood and severity after implementing mitigation controls. This gives you an accurate picture of your residual risk.',
    },
    {
      type: 'heading',
      id: 'evidence',
      level: 2,
      text: 'Mitigation evidence',
    },
    {
      type: 'paragraph',
      text: 'Document proof that mitigation controls have been implemented:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Upload mitigation evidence documents directly to the risk record' },
        { text: 'Link to related evidence in the Evidence Hub' },
        { text: 'Reference implementation artifacts and test results' },
      ],
    },
    {
      type: 'heading',
      id: 'approval-workflow',
      level: 2,
      text: 'Risk approval workflow',
    },
    {
      type: 'paragraph',
      text: 'For bigger risks, VerifyWise has an approval process:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Action owner completes the mitigation plan' },
        { text: 'Risk is assigned to an approver for review' },
        { text: 'Approver reviews the mitigation approach and evidence' },
        { text: 'Approval status is updated to reflect the decision' },
      ],
    },
    {
      type: 'heading',
      id: 'review-notes',
      level: 2,
      text: 'Review notes',
    },
    {
      type: 'paragraph',
      text: 'Use the review notes field to capture ongoing observations about the risk and its mitigation:',
    },
    {
      type: 'checklist',
      items: [
        'Changes in risk conditions',
        'Observations during implementation',
        'Stakeholder feedback',
        'Lessons learned',
        'Recommendations for future reviews',
      ],
    },
    {
      type: 'heading',
      id: 'controls-mapping',
      level: 2,
      text: 'Mapping to controls',
    },
    {
      type: 'paragraph',
      text: 'Link mitigation activities to governance controls in your compliance frameworks. This gives you traceability between:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Risk records and the controls that address them' },
        { text: 'Assessment requirements and mitigation evidence' },
        { text: 'Compliance frameworks and risk management activities' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'Identify and evaluate risks before mitigation',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'incident-management',
          title: 'AI incident management',
          description: 'Respond when risks materialize into incidents',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'evidence-collection',
          title: 'Evidence collection',
          description: 'Document mitigation implementation',
        },
      ],
    },
  ],
};
