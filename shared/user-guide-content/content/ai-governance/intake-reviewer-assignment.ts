import type { ArticleContent } from '../../contentTypes';

export const intakeReviewerAssignmentContent: ArticleContent = {
  blocks: [
    {
      type: 'time-estimate',
      text: '7 min read',
    },
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Reviewer assignment sends each scored submission to **expert** or **regular** reviewers based on its risk score. Higher-risk submissions go to the people you pick as expert reviewers. A share of regular approvals gets a second look from one of them.',
    },
    {
      type: 'paragraph',
      text: 'It is off by default. With it off, anyone who can edit intake forms can approve or reject every submission. Only Admins can change the settings. Other roles see them read-only.',
    },
    {
      type: 'heading',
      id: 'turn-on',
      level: 2,
      text: 'Turn on reviewer assignment',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open the form in **Edit** mode. If a field\'s settings are open on the right, close them with the close button at the top. Then open **Form settings** in the right panel.' },
        { text: 'Check **Assign reviewers by risk score**.' },
        { text: 'Choose at least one person under **Expert reviewers** and at least one under **Regular reviewers**. Only users whose role can edit intake forms are listed.' },
        { text: 'Set **Threshold**, **Close-call margin** and **Second review share %**, or keep the defaults (see below).' },
        { text: 'Check the summary line under the settings. It reads like "Scores of 50 or more, prohibited practices and scores within 10 points of 50 go to expert reviewers."' },
        { text: 'Click **Save**. Pending submissions on the form are assigned with the new settings.' },
      ],
    },
    {
      type: 'table',
      columns: [
        { key: 'setting', label: 'Setting', width: '25%' },
        { key: 'what', label: 'What it does', width: '45%' },
        { key: 'range', label: 'Allowed values', width: '15%' },
        { key: 'default', label: 'Default', width: '15%' },
      ],
      rows: [
        { setting: 'Threshold', what: 'The risk score that separates expert review from regular review.', range: '1 to 99', default: '50' },
        { setting: 'Close-call margin', what: 'Scores this close to the threshold go to expert review even when they are below it.', range: '0 to 25', default: '10' },
        { setting: 'Second review share %', what: 'The chance that a regular reviewer\'s approval is picked for a second review.', range: '0 to 100', default: '10' },
      ],
    },
    {
      type: 'paragraph',
      text: 'All three take whole numbers. Risk scores run from 0 to 100.',
    },
    {
      type: 'heading',
      id: 'assignment-rules',
      level: 2,
      text: 'How a submission is assigned',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise assigns a submission once its scoring has finished. It checks these rules in order and stops at the first one that matches. The reason shown in the review window tells you which rule applied.',
    },
    {
      type: 'table',
      columns: [
        { key: 'order', label: 'Order', width: '10%' },
        { key: 'rule', label: 'If', width: '45%' },
        { key: 'level', label: 'Goes to', width: '18%' },
        { key: 'reason', label: 'Reason shown', width: '27%' },
      ],
      rows: [
        { order: '1', rule: 'The EU AI Act level is Prohibited', level: 'Expert review', reason: 'Prohibited practice' },
        { order: '2', rule: 'There is no usable score, for example because AI scoring failed', level: 'Expert review', reason: 'No usable score' },
        { order: '3', rule: 'The score is less than the close-call margin away from the threshold', level: 'Expert review', reason: 'Within N points of the threshold' },
        { order: '4', rule: 'The score is at or above the threshold', level: 'Expert review', reason: 'Score N, threshold N' },
        { order: '5', rule: 'None of the above', level: 'Regular review', reason: 'Score N, below N' },
      ],
    },
    {
      type: 'paragraph',
      text: 'With the defaults (threshold 50, margin 10), a score of 41 to 59 is a close call. A score of 60 or more is at or above the threshold. So every score from 41 up goes to expert review. A score of 40 is exactly 10 points away, which is not less than the margin, so it goes to regular review. With a margin of 0 there are no close calls and only the threshold counts.',
    },
    {
      type: 'heading',
      id: 'status-chips',
      level: 2,
      text: 'Review level in the submissions list',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Expert review or Regular review', text: 'the level the submission was assigned to.' },
        { bold: 'Not assigned yet', text: 'scoring is still running, so there is no level yet.' },
        { bold: 'Assignment off', text: 'the form doesn\'t use reviewer assignment.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Use the **Review level** filter to narrow the list: All review levels, Expert, Regular, Not assigned, Assigned to me or Second review. **Assigned to me** shows the submissions you can decide, plus the second reviews you can do.',
    },
    {
      type: 'heading',
      id: 'who-can-decide',
      level: 2,
      text: 'Who can approve or reject',
    },
    {
      type: 'table',
      columns: [
        { key: 'who', label: 'Person', width: '40%' },
        { key: 'expert', label: 'Expert review', width: '30%' },
        { key: 'regular', label: 'Regular review', width: '30%' },
      ],
      rows: [
        { who: 'Admin', expert: 'Yes', regular: 'Yes' },
        { who: 'Expert reviewer on this form', expert: 'Yes', regular: 'Yes' },
        { who: 'Regular reviewer on this form', expert: 'No', regular: 'Yes' },
        { who: 'Anyone else', expert: 'No', regular: 'No' },
      ],
    },
    {
      type: 'paragraph',
      text: 'People who can\'t decide still see the submission, with a line naming who can, for example "Only Dana Lee, Sam Ortiz can decide this submission."',
    },
    {
      type: 'heading',
      id: 'moving-to-expert',
      level: 2,
      text: 'Moving a submission to expert review',
    },
    {
      type: 'paragraph',
      text: 'A submission in regular review can move to expert review in three ways. Nothing moves a submission from expert review back to regular review.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Request expert review', text: 'A reviewer on the form or an Admin clicks **Request expert review** in the review window and gives a reason of up to 1000 characters. The reason is shown with the submission.' },
        { bold: 'A higher score band', text: 'If a reviewer raises the score band and the lowest score of the new band (Medium 26, High 51, Critical 76) would go to expert review under the rules above, the submission moves there. The reason shown is "Band raised by a reviewer".' },
        { bold: 'At the moment of decision', text: 'A regular reviewer can\'t approve while setting a Prohibited level, or a band that would send the submission to expert review. An expert reviewer or Admin has to decide it.' },
      ],
    },
    {
      type: 'heading',
      id: 'walkthrough-request',
      level: 3,
      text: 'Walkthrough: request expert review',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open a pending submission that shows **Regular review**.' },
        { text: 'Click **Request expert review**.' },
        { text: 'In **Reason**, explain why it needs an expert reviewer.' },
        { text: 'Click **Request expert review** in the dialog. The submission now shows **Expert review** with "Expert review requested:" and your reason. It stays in expert review even if the settings change later.' },
      ],
    },
    {
      type: 'heading',
      id: 'second-review',
      level: 2,
      text: 'Second review',
    },
    {
      type: 'paragraph',
      text: 'When someone who isn\'t one of the form\'s expert reviewers approves a submission in regular review, VerifyWise may pick it for a second review. The chance is the **Second review share %**. Approvals in expert review are never picked. The approval stands either way. A second review doesn\'t undo it or change the use case or model it created.',
    },
    {
      type: 'heading',
      id: 'walkthrough-second-review',
      level: 3,
      text: 'Walkthrough: do a second review',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open the submission from the email you received, or choose **Second review** in the **Review level** filter. Only expert reviewers of the form and Admins can do second reviews, and never on their own approval.' },
        { text: 'The review window shows a **Second review** panel. Check the answers and the decision that was made.' },
        { text: 'Click **Agree** if the approval was right. A note is optional.' },
        { text: 'Or click **Missed something** and write a note of up to 2000 characters saying what was missed. The note is required.' },
        { text: 'For a miss, do the follow-up work, then click **Mark resolved** and write what was done. This note is also required.' },
      ],
    },
    {
      type: 'heading',
      id: 'changing-settings',
      level: 2,
      text: 'Changing the settings later',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'When you save changed settings with reviewer assignment on, every pending submission on the form is assigned again. Submissions sent to expert review by a request stay there. Submissions moved by a raised band stay there if the new settings would put them in regular review.' },
        { text: 'Approved and rejected submissions keep the level they were decided at.' },
        { text: 'If a reviewer leaves your organization or loses the right to edit intake forms, they stay in the list as **Former user** until you remove them. A list you change must keep at least one person who can review. Admins can always decide.' },
      ],
    },
    {
      type: 'heading',
      id: 'logic-view',
      level: 2,
      text: 'Check the setup',
    },
    {
      type: 'paragraph',
      text: 'Select **Logic** at the top of the builder to see the reviewer assignment rules in plain words, with the names of the expert and regular reviewers. The **Oversight** tab on the intake forms page shows how submissions split between the review levels, how long decisions take and which second reviews are still open.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'intake-forms',
          title: 'Intake forms',
          description: 'Risk scoring, score bands, the review window and the Oversight tab',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'intake-conditional-fields',
          title: 'Conditional fields',
          description: 'Show a field only when other answers match',
        },
      ],
    },
  ],
};
