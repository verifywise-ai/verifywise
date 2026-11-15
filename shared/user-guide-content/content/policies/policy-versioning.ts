import type { ArticleContent } from '../../contentTypes';

export const policyVersioningContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Policies in VerifyWise follow a defined lifecycle from creation through publication and eventual retirement. Understanding this lifecycle helps you manage policies well and makes sure stakeholders always know which policies are active.',
    },
    {
      type: 'paragraph',
      text: 'Each policy has a status showing where it sits in the lifecycle. Moving policies through these stages creates a clear workflow for development, review and maintenance.',
    },
    {
      type: 'heading',
      id: 'status-workflow',
      level: 2,
      text: 'Policy status workflow',
    },
    {
      type: 'paragraph',
      text: 'A clear status workflow makes sure policies get properly reviewed before they become authoritative. It also gives you visibility into who changed what and when, which is exactly what auditors want to see.',
    },
    {
      type: 'paragraph',
      text: 'Policies progress through the following statuses:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'FileEdit',
          title: 'Draft',
          description: 'The policy is being written or revised. Not visible to general users as an active policy.',
        },
        {
          icon: 'Eye',
          title: 'Under Review',
          description: 'The policy has been submitted for approval and is waiting for a decision.',
        },
        {
          icon: 'CheckCircle',
          title: 'Approved',
          description: 'The policy was approved through the approval workflow, or by an Admin, and can be published.',
        },
        {
          icon: 'Globe',
          title: 'Published',
          description: 'The policy is active and applies to your organization. This is the authoritative version.',
        },
        {
          icon: 'Archive',
          title: 'Archived',
          description: 'The policy is no longer active but retained for historical reference.',
        },
        {
          icon: 'AlertTriangle',
          title: 'Deprecated',
          description: 'The policy has been superseded or is scheduled for removal.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'typical-workflow',
      level: 2,
      text: 'Typical policy workflow',
    },
    {
      type: 'paragraph',
      text: 'A typical policy moves through the following stages:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Draft', text: 'Author creates or updates the policy content' },
        { bold: 'Under Review', text: 'Author submits the policy for approval' },
        { bold: 'Approved', text: 'The workflow\'s approvers approve it, or an Admin does when there is no workflow' },
        { bold: 'Published', text: 'Someone sets the status to Published and the policy becomes authoritative' },
        { bold: 'Archived', text: 'When superseded, policy is archived for reference' },
      ],
    },
    {
      type: 'heading',
      id: 'changing-status',
      level: 2,
      text: 'Changing policy status',
    },
    {
      type: 'paragraph',
      text: 'To change a policy\'s status:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click on the policy in the table to open it' },
        { text: 'Locate the status field' },
        { text: 'Select the new status from the dropdown' },
        { text: 'Save your changes' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The dropdown only lists statuses you can choose. Under Review and Approved come from the approval process, not the dropdown. Published can only follow Approved, and a Published or Archived policy can\'t go back to Draft. While an approval request is pending, the status is locked.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Status changes are recorded with a timestamp and the user who made the change, giving you an audit trail of how each policy progressed.',
    },
    {
      type: 'heading',
      id: 'review-dates',
      level: 2,
      text: 'Scheduling policy reviews',
    },
    {
      type: 'paragraph',
      text: 'Policies should be reviewed periodically to make sure they\'re still current. The next review date field helps you track when each policy is due.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Set review dates', text: 'When creating or editing a policy, set a next review date' },
        { bold: 'Filter by review date', text: 'Use the filter to find policies approaching their review date' },
        { bold: 'Track overdue reviews', text: 'Policies past their review date should be prioritized for attention' },
      ],
    },
    {
      type: 'paragraph',
      text: 'VerifyWise reminds people about upcoming and overdue reviews. A reminder goes to the policy owner and the assigned reviewers, or to the author when the policy has neither. It arrives as a notification and an email, and in Slack if your organization sends policy reminders there.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Due soon', text: 'Sent once, when the review date is within the next 7 days' },
        { bold: 'Overdue', text: 'Sent once, after the review date has passed' },
        { bold: 'Changing the date', text: 'Moving the review date to another day sends the reminders again for the new date' },
        { bold: 'Archived and deprecated', text: 'Policies with these statuses are not reminded' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Review policies at least annually, or more often for fast-moving areas like AI regulations. Set review dates when you publish a policy so you don\'t forget to revisit it.',
    },
    {
      type: 'heading',
      id: 'tracking-changes',
      level: 2,
      text: 'Tracking policy changes',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise automatically tracks who made changes and when:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Last updated', text: 'Timestamp of the most recent change' },
        { bold: 'Updated by', text: 'The user who made the most recent change' },
        { bold: 'Author', text: 'The original creator of the policy' },
      ],
    },
    {
      type: 'heading',
      id: 'retiring-policies',
      level: 2,
      text: 'Retiring policies',
    },
    {
      type: 'paragraph',
      text: 'When a policy is no longer needed, you have two options:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Archive', text: 'Use this when the policy is no longer active but you want to keep it for historical reference. Archived policies remain searchable and can be restored if needed.' },
        { bold: 'Deprecate', text: 'Use this when a policy has been superseded by a newer version or is scheduled for removal. Deprecated status signals that the policy should not be followed.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Try not to delete policies unless you really have to. Keeping a historical record shows governance maturity and supports audit requirements.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'policies',
          articleId: 'policy-management',
          title: 'Policy management basics',
          description: 'Create and organize policies',
        },
        {
          collectionId: 'policies',
          articleId: 'policy-approval',
          title: 'Policy approval',
          description: 'Submit a policy for approval or approve it as an Admin',
        },
        {
          collectionId: 'policies',
          articleId: 'policy-templates',
          title: 'Policy templates library',
          description: 'Browse, filter and create policies from pre-built templates',
        },
      ],
    },
  ],
};
