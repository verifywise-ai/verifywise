import type { ArticleContent } from '../../contentTypes';

export const policyApprovalContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'A policy becomes **Approved** in one of two ways, depending on whether your organization has a policy approval workflow:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'With a workflow', text: 'You submit the policy for approval and the workflow\'s approvers decide.' },
        { bold: 'Without a workflow', text: 'An Admin approves the policy directly from the policy editor.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Nobody can set **Under Review** or **Approved** from the status dropdown. Once a policy is Approved, you publish it by setting its status to **Published**.',
    },
    {
      type: 'heading',
      id: 'setting-up',
      level: 2,
      text: 'Setting up a policy approval workflow',
    },
    {
      type: 'paragraph',
      text: 'An Admin creates the workflow on the **Approval workflows** page, with **Policy** as the entity type. Only an active workflow with at least one approver on every step can approve policies.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Every organization starts with a workflow called "Policy Approval" that has a step but no approvers. Until an Admin adds an approver to it, it is ignored and Admins approve policies directly.',
    },
    {
      type: 'paragraph',
      text: 'If your organization has more than one policy workflow, the person who submits a policy chooses which one approves it.',
    },
    {
      type: 'heading',
      id: 'submitting',
      level: 2,
      text: 'Submitting a policy for approval',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open the policy and save any changes. You can\'t submit while the policy has unsaved changes, or before a new policy is saved.' },
        { text: 'In the **Approval** section of the sidebar, click **Submit for approval**.' },
        { text: 'If asked, choose the approval workflow, then click **Submit**.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The policy moves to **Under Review** and the approvers on the workflow\'s first step get a notification. You can submit a policy that is Draft or Under Review, as long as it has no pending request.',
    },
    {
      type: 'paragraph',
      text: 'While the request is pending, the Approval section shows the workflow, the current step (for example "Step 1 of 2") and who submitted it. The status dropdown is locked until the request is decided or withdrawn.',
    },
    {
      type: 'paragraph',
      text: 'The title and content are locked too, so approvers review exactly the text you submitted. You can still change the tags, owner, team members, review date and custom fields. To edit the text, withdraw the request, make your changes and submit again.',
    },
    {
      type: 'heading',
      id: 'deciding',
      level: 2,
      text: 'Approving or rejecting',
    },
    {
      type: 'paragraph',
      text: 'Approvers open the request from their notification or from **Approval requests**, then click **Approve** or **Reject** and can add a comment. Each step works as the workflow sets it: one approver is enough, or all of them must approve.',
    },
    {
      type: 'table',
      columns: [
        { key: 'decision', label: 'Decision', width: '35%' },
        { key: 'result', label: 'What happens to the policy', width: '65%' },
      ],
      rows: [
        { decision: 'Last step approved', result: 'The policy becomes Approved. The Approval section shows who approved it and when.' },
        { decision: 'Rejected at any step', result: 'The policy goes back to Draft. The Approval section shows "Changes requested by" the approver, with their comment.' },
        { decision: 'Withdrawn by the submitter', result: 'The policy goes back to Draft.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The person who submitted the policy is notified when it is approved or rejected, with a link back to the policy. After a rejection, edit the policy and submit it again.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'A decided request can\'t be withdrawn. To change an Approved policy, set it back to Draft, edit it and submit it again.',
    },
    {
      type: 'heading',
      id: 'withdrawing',
      level: 2,
      text: 'Withdrawing a request',
    },
    {
      type: 'paragraph',
      text: 'Only the person who submitted the policy can withdraw the request. Click **Withdraw request** in the Approval section and confirm. The policy goes back to Draft and you can submit it again later.',
    },
    {
      type: 'heading',
      id: 'direct-approval',
      level: 2,
      text: 'Approving without a workflow',
    },
    {
      type: 'paragraph',
      text: 'When your organization has no policy approval workflow, an Admin sees an **Approve** button in the Approval section of a Draft or Under Review policy, and can add an optional comment of up to 2,000 characters. On a Draft or Under Review policy with no pending request, other users see "An Admin approves this policy. Your organization has no policy approval workflow."',
    },
    {
      type: 'paragraph',
      text: 'Once a policy workflow is set up, direct approval is no longer available and every policy goes through the workflow.',
    },
    {
      type: 'heading',
      id: 'status-rules',
      level: 2,
      text: 'Which statuses you can set by hand',
    },
    {
      type: 'table',
      columns: [
        { key: 'status', label: 'Status', width: '25%' },
        { key: 'rule', label: 'How it is set', width: '75%' },
      ],
      rows: [
        { status: 'Draft', rule: 'By hand, except from Published or Archived. New policies start as Draft.' },
        { status: 'Under Review', rule: 'Only by submitting for approval.' },
        { status: 'Approved', rule: 'Only by the approval workflow, or by an Admin when there is no workflow.' },
        { status: 'Published', rule: 'By hand, only from Approved.' },
        { status: 'Archived', rule: 'By hand.' },
        { status: 'Deprecated', rule: 'By hand.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The status dropdown only lists the statuses you can choose. While a request is pending, no status change is allowed, including bulk archive from the policy list. Withdraw the request first.',
    },
    {
      type: 'paragraph',
      text: 'Deleting a policy rejects its pending request, and the submitter is notified.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'policies',
          articleId: 'policy-versioning',
          title: 'Policy lifecycle',
          description: 'Understand the policy status workflow',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'approval-workflows',
          title: 'Approval workflows',
          description: 'Create workflows and decide approval requests',
        },
      ],
    },
  ],
};
