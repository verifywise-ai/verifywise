import type { ArticleContent } from '../../contentTypes';

export const friaContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Fundamental Rights Impact Assessment (FRIA) helps you comply with EU AI Act Article 27, which requires deployers of high-risk AI systems to assess the impact on fundamental rights before putting a system into use.',
    },
    {
      type: 'paragraph',
      text: 'In VerifyWise, the FRIA is an 8-section assessment. Fields auto-save as you work, risk scores update after each change and you can save snapshots to keep a versioned audit trail.',
    },
    {
      type: 'heading',
      id: 'accessing-fria',
      level: 2,
      text: 'Accessing the FRIA',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open any use case from your dashboard.' },
        { text: 'Click the **FRIA** tab.' },
        { text: 'The assessment is created automatically the first time you open it.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Auto-creation',
      text: 'You don\'t need to manually create a FRIA. One is generated per use case when you first visit the tab, pre-filled with the use case name, organization and assessment owner.',
    },
    {
      type: 'heading',
      id: 'assessment-sections',
      level: 2,
      text: 'Assessment sections',
    },
    {
      type: 'paragraph',
      text: 'The FRIA is divided into 8 sections. Use the sidebar on the left to jump between them, or scroll through the page. The sidebar highlights the section you\'re currently viewing.',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Building2',
          title: '1. Organisation & system profile',
          description: 'Identify the deployer, system name, assessment owner, date and operational context.',
        },
        {
          icon: 'Scale',
          title: '2. Applicability & scope',
          description: 'Classify whether the system is high-risk, select the Annex III category and set the review cycle.',
        },
        {
          icon: 'Users',
          title: '3. Affected persons & groups',
          description: 'Describe who is affected by the AI system and their vulnerability context.',
        },
        {
          icon: 'Shield',
          title: '4. Fundamental rights matrix',
          description: 'Assess 10 rights from the EU Charter. Flag affected rights, rate severity and confidence and document mitigation.',
        },
        {
          icon: 'AlertTriangle',
          title: '5. Specific risks of harm',
          description: 'Build a risk register with likelihood and severity ratings. Import risks from your project risk register.',
        },
        {
          icon: 'Eye',
          title: '6. Human oversight & transparency',
          description: 'Document oversight measures, transparency practices, redress processes and data governance.',
        },
        {
          icon: 'MessageSquare',
          title: '7. Stakeholder consultation',
          description: 'Record legal review, DPO review and owner approval status. Add stakeholder consultation notes.',
        },
        {
          icon: 'FileCheck',
          title: '8. Summary & recommendation',
          description: 'Make a deployment decision and document any conditions.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'auto-save',
      level: 2,
      text: 'How auto-save works',
    },
    {
      type: 'paragraph',
      text: 'Every field auto-saves as you type. When you leave a field or stop typing for half a second, your changes are sent to the server. You\'ll see a brief "Saving..." indicator next to the action buttons, followed by "Saved" when complete.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'No save button needed',
      text: 'You never need to manually save. Just fill in the fields and move on. If you close the browser and come back, your work is there.',
    },
    {
      type: 'heading',
      id: 'stat-cards',
      level: 2,
      text: 'Understanding the stat cards',
    },
    {
      type: 'paragraph',
      text: 'Four cards at the top summarize the current state of your assessment:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Completion', text: 'Percentage of fields filled in, including whether rights have been reviewed and risk items added.' },
        { bold: 'Risk score', text: 'A score from 0 to 100 based on flagged rights (weighted by severity and confidence) and risk items (weighted by likelihood and severity).' },
        { bold: 'Rights flagged', text: 'How many of the 10 fundamental rights you\'ve marked as affected.' },
        { bold: 'Status', text: 'Current assessment status (draft or submitted) and how many snapshots have been saved.' },
      ],
    },
    {
      type: 'heading',
      id: 'rights-matrix',
      level: 2,
      text: 'Fundamental rights matrix',
    },
    {
      type: 'paragraph',
      text: 'Section 4 contains 10 rights from the EU Charter of Fundamental Rights. For each right:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Check the **Flagged** box if the AI system could affect this right.' },
        { text: 'Set the **Severity** (how serious the impact could be) and **Confidence** (how certain you are).' },
        { text: 'Describe the **Impact pathway** explaining how the system could affect this right.' },
        { text: 'Document the **Mitigation** measures you\'ve put in place.' },
      ],
    },
    {
      type: 'table',
      columns: [
        { key: 'right', label: 'Right', width: '35%' },
        { key: 'charter', label: 'Charter article', width: '20%' },
        { key: 'example', label: 'Example impact', width: '45%' },
      ],
      rows: [
        { right: 'Human dignity', charter: 'Art. 1', example: 'System makes decisions that undermine autonomy' },
        { right: 'Right to privacy', charter: 'Art. 7', example: 'Processing personal data beyond stated purpose' },
        { right: 'Data protection', charter: 'Art. 8', example: 'Insufficient data minimization or retention' },
        { right: 'Non-discrimination', charter: 'Art. 21', example: 'Biased outputs across protected groups' },
        { right: 'Gender equality', charter: 'Art. 23', example: 'Gender-based scoring differences' },
        { right: 'Fair working conditions', charter: 'Art. 31', example: 'Worker surveillance or automated management' },
        { right: 'Consumer protection', charter: 'Art. 38', example: 'Misleading AI-generated recommendations' },
        { right: 'Freedom of expression', charter: 'Art. 11', example: 'Content filtering that restricts lawful speech' },
        { right: 'Effective remedy', charter: 'Art. 47', example: 'No way to challenge automated decisions' },
        { right: 'Rights of the child', charter: 'Art. 24', example: 'System processes children\'s data without safeguards' },
      ],
    },
    {
      type: 'heading',
      id: 'risk-items',
      level: 2,
      text: 'Managing risk items',
    },
    {
      type: 'paragraph',
      text: 'Section 5 lets you build a FRIA-specific risk register. You can add risks manually or import them from your use case\'s existing risk register.',
    },
    {
      type: 'heading',
      id: 'adding-risks',
      level: 3,
      text: 'Adding risks manually',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Add risk item** in Section 5.' },
        { text: 'Describe the risk.' },
        { text: 'Set the likelihood (Low/Medium/High) and severity (Low/Medium/High).' },
        { text: 'Document existing controls and any further action needed.' },
      ],
    },
    {
      type: 'heading',
      id: 'importing-risks',
      level: 3,
      text: 'Importing from project risks',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Import from project risks** in Section 5.' },
        { text: 'Select one or more risks from the list.' },
        { text: 'Click **Import selected**. The risk description, likelihood and severity are copied over.' },
      ],
    },
    {
      type: 'heading',
      id: 'evidence',
      level: 2,
      text: 'Attaching evidence',
    },
    {
      type: 'paragraph',
      text: 'Each section has an **Attach evidence** button at the bottom. You can link existing files from the evidence hub or upload new ones. Evidence is stored per section, so auditors can see exactly which documents support each part of the assessment.',
    },
    {
      type: 'heading',
      id: 'snapshots',
      level: 2,
      text: 'Saving snapshots',
    },
    {
      type: 'paragraph',
      text: 'Snapshots are point-in-time copies of your entire assessment. Save one before a review meeting, after completing a major section or whenever you want a record you can compare against later.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Save snapshot** above the assessment sections.' },
        { text: 'Optionally add a note (e.g., "Completed sections 1-4" or "Pre-review baseline").' },
        { text: 'Click **Save snapshot** to confirm.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Snapshots vs auto-save',
      text: 'Auto-save continuously saves your latest changes. Snapshots are manual checkpoints you create when you want a permanent record of the assessment at a specific point in time.',
    },
    {
      type: 'heading',
      id: 'version-history',
      level: 2,
      text: 'Viewing version history',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Version history** above the assessment sections.' },
        { text: 'A modal shows all saved snapshots with their note, author, and date.' },
        { text: 'Click any row to expand it and see what changed from the previous version.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The diff view shows changed fields side by side: the old value (with strikethrough) and the new value (in green). It also tracks rights flagging changes and risk item count changes between versions.',
    },
    {
      type: 'heading',
      id: 'risk-score',
      level: 2,
      text: 'How the risk score is calculated',
    },
    {
      type: 'paragraph',
      text: 'The risk score (0-100) combines two factors:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Flagged rights', text: 'Each flagged right contributes (severity x 15) + (confidence x 5) points.' },
        { bold: 'Risk items', text: 'Each risk item contributes likelihood x severity x 3 points, where Low=1, Medium=2, High=3.' },
      ],
    },
    {
      type: 'table',
      columns: [
        { key: 'score', label: 'Score range', width: '30%' },
        { key: 'level', label: 'Risk level', width: '30%' },
        { key: 'meaning', label: 'What it means', width: '40%' },
      ],
      rows: [
        { score: '0-29', level: 'Low', meaning: 'Minimal rights impact identified' },
        { score: '30-59', level: 'Medium', meaning: 'Some rights concerns that need attention' },
        { score: '60-100', level: 'High', meaning: 'Significant rights impact requiring review' },
      ],
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
        { action: 'View the FRIA', roles: 'Any authenticated user' },
        { action: 'Edit assessment fields', roles: 'Admin or Editor' },
        { action: 'Add/edit/delete risk items', roles: 'Admin or Editor' },
        { action: 'Update rights matrix', roles: 'Admin or Editor' },
        { action: 'Save snapshots', roles: 'Admin or Editor' },
        { action: 'Attach evidence', roles: 'Admin or Editor' },
        { action: 'View version history', roles: 'Any authenticated user' },
      ],
    },
    {
      type: 'heading',
      id: 'next-steps',
      level: 2,
      text: 'Next steps',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'compliance',
          articleId: 'eu-ai-act',
          title: 'EU AI Act compliance',
          description: 'Understand the broader EU AI Act requirements beyond FRIA.',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'Learn about use case risk assessments that feed into the FRIA.',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'evidence-collection',
          title: 'Evidence collection',
          description: 'Manage the evidence files you attach to FRIA sections.',
        },
      ],
    },
  ],
};
