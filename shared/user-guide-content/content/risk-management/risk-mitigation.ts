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
        { bold: 'Approver', text: 'Optionally, pick the person who approves the risk and its mitigation. See Risk approval below' },
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
        { bold: 'Current risk level', text: 'The level you pick by hand on the mitigation form. When it is set, VerifyWise shows it for the risk in tables, cards, filters and reports. When it is empty, the inherent level is shown' },
        { bold: 'Residual risk', text: 'Calculated automatically from the residual likelihood and residual severity with the same formula as the inherent level (likelihood + 3 × severity) once mitigations are in place' },
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
      text: 'Risk approval',
    },
    {
      type: 'paragraph',
      text: 'A risk can go to one person for approval. Approver, approval status and assessment date are optional. A new risk starts at **Not required**. The approval status is one of these:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Not required', text: 'The risk has no approver.' },
        { bold: 'Pending', text: 'An approver is named and has not decided yet.' },
        { bold: 'Approved', text: 'The approver or an Admin approved the risk.' },
        { bold: 'Rejected', text: 'The approver or an Admin rejected the risk.' },
      ],
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'On the risk form, pick an approver. The approval status changes to Pending. The approver gets an in-app notification and an assignment email.' },
        { text: 'The approver opens the risk to review the mitigation plan and its evidence. Then they set the approval status to Approved or Rejected.' },
        { text: 'To take a risk out of approval, set the approver to **None**. The status goes back to Not required.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The approval status field is greyed out until the risk has an approver.',
    },
    {
      type: 'heading',
      id: 'approval-who-decides',
      level: 3,
      text: 'Who can approve or reject',
    },
    {
      type: 'paragraph',
      text: 'Only the risk\'s approver or an Admin can set Approved or Rejected. The same rule applies to changing a status that is already Approved or Rejected. Other users who can edit the risk can save its other fields. When they try to make the decision, the save fails with "Only the risk\'s approver or an Admin can approve or reject it."',
    },
    {
      type: 'paragraph',
      text: 'Changing the approver sets the status back to Pending, even on a risk that was approved. In that same save only an Admin can set Approved or Rejected. The new approver decides in a later edit.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Editing a risk after it is approved does not reset its approval. If the mitigation changes, the approver or an Admin can set the status back to Pending.',
    },
    {
      type: 'heading',
      id: 'approval-other-paths',
      level: 3,
      text: 'Bulk actions, import and the AI advisor',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Bulk actions', text: 'Bulk actions on the risk list do not change a risk\'s approval.' },
        { bold: 'Risk import', text: 'The Approval Status column takes the four values above. A row without an approver gets Not required. A row with an approver gets Pending, unless an Admin imports it with Approved or Rejected. Approvers named in an import are not notified.' },
        { bold: 'AI advisor', text: 'The advisor follows the same rules. It tells you when you cannot make the approval decision you asked for.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Risks created before these rules kept Approved, Rejected and Not required. Pending and Requires review became Pending when the risk had an approver, or Not required when it had none. Other values, such as In Progress, became Not required.',
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
