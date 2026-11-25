import type { ArticleContent } from '../../contentTypes';

export const approvalWorkflowsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Approval workflows let you require sign-off before certain changes take effect. You define who needs to approve, whether all approvers or just one must agree and set an optional deadline. When someone submits a request, the designated approvers are notified and can approve or reject it.',
    },
    {
      type: 'heading',
      id: 'creating',
      level: 2,
      text: 'Creating a workflow',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to **Approval workflows** from the sidebar.' },
        { text: 'Click **Create workflow**.' },
        { text: 'Give it a name and description.' },
        { text: 'Select the entity type this workflow applies to (e.g., use cases, policies, models).' },
        { text: 'Add one or more approvers from your organization.' },
        { text: 'Choose whether **all approvers** must approve or just **any one** of them.' },
        { text: 'Optionally set an expiration period for pending requests.' },
        { text: 'Click **Save**.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'You can also create a use case workflow without leaving the use case. Choose **Create workflow** under the **Approval workflow** field, in the create use case form or in the workflow dialog on a use case\'s Overview tab. The entity is set to Use case, and the new workflow is selected once you save it.',
    },
    {
      type: 'heading',
      id: 'submitting',
      level: 2,
      text: 'Submitting a request',
    },
    {
      type: 'paragraph',
      text: 'When a workflow is active for an entity type, users can submit approval requests from that entity\'s page. The request includes details about what\'s being submitted and why. All designated approvers receive a notification.',
    },
    {
      type: 'paragraph',
      text: 'Policies are submitted from the **Approval** section of the policy editor. A policy workflow is used only when it is active and every step has at least one approver. The policy approval article explains what each decision does to the policy.',
    },
    {
      type: 'paragraph',
      text: 'A use case workflow follows the same rule: it must be active and have at least one approver on every step, or the use case is not saved. While a use case\'s request is pending or rejected, only people who manage approval workflows can change or remove its workflow. After a rejection, anyone who can edit the use case can choose **Resubmit for approval** on its Overview tab to send it to the same workflow again. To attach or change the workflow of an existing use case, use the **Approval workflow** field on its Overview tab.',
    },
    {
      type: 'heading',
      id: 'statuses',
      level: 2,
      text: 'Request statuses',
    },
    {
      type: 'table',
      columns: [
        { key: 'status', label: 'Status', width: '25%' },
        { key: 'meaning', label: 'Meaning', width: '75%' },
      ],
      rows: [
        { status: 'Pending', meaning: 'Waiting for approver action' },
        { status: 'Approved', meaning: 'All required approvers have approved' },
        { status: 'Rejected', meaning: 'One or more approvers rejected the request' },
        { status: 'Withdrawn', meaning: 'The requestor cancelled the request' },
      ],
    },
    {
      type: 'paragraph',
      text: 'When a request is rejected, the requestor is notified. For a policy or a use case, the notification opens that item, where it can be resubmitted. Only a pending request can be withdrawn, and only by the person who made it. If the item a request is about is deleted, such as a file or a policy, its pending request is rejected and the requestor is notified.',
    },
    {
      type: 'heading',
      id: 'approving',
      level: 2,
      text: 'Approving or rejecting',
    },
    {
      type: 'paragraph',
      text: 'When you\'re an approver on a pending request, you\'ll see it in your notifications. Open the request to review the details, then click **Approve** or **Reject**. You can add a comment explaining your decision.',
    },
    {
      type: 'heading',
      id: 'roles',
      level: 2,
      text: 'Who can do what',
    },
    {
      type: 'table',
      columns: [
        { key: 'action', label: 'Action', width: '50%' },
        { key: 'roles', label: 'Required role', width: '50%' },
      ],
      rows: [
        { action: 'View workflows and requests', roles: 'Any authenticated user' },
        { action: 'Create or edit workflows', roles: 'Admin' },
        { action: 'Submit approval requests', roles: 'Admin or Editor' },
        { action: 'Withdraw a pending request', roles: 'The person who submitted it' },
        { action: 'Approve or reject requests', roles: 'Designated approvers (any role)' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'use-cases',
          title: 'Use cases',
          description: 'Attach an approval workflow to a new or existing use case',
        },
        {
          collectionId: 'policies',
          articleId: 'policy-approval',
          title: 'Policy approval',
          description: 'Submit a policy for approval or approve it as an Admin',
        },
      ],
    },
  ],
};
