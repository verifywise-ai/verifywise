import type { ArticleContent } from '../../contentTypes';

export const policyTemplatesContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'A policy template is a complete policy document you can start a new policy from. VerifyWise includes 15 built-in templates covering common AI governance topics. Your organization can also keep its own templates. You copy them from a built-in one or save them from an existing policy, then edit them like any policy.',
    },
    {
      type: 'paragraph',
      text: 'Templates live in the **Policy templates** tab of the policy manager, in two sections:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'System templates', text: 'The 15 built-in templates. They can\'t be edited or deleted. Their ID column shows a **System** label.' },
        { bold: 'Our templates', text: 'Your organization\'s own templates. Only members of your organization see them.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Creating a policy from a template copies the template\'s content. Editing or deleting the template later does not change policies already created from it.',
    },
    {
      type: 'heading',
      id: 'why-templates',
      level: 2,
      text: 'Why use policy templates?',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Save time', text: 'Start from complete, structured content instead of an empty editor' },
        { bold: 'Cover blind spots', text: 'The built-in templates cover governance topics that are easy to miss when writing from scratch' },
        { bold: 'Consistency', text: 'Keep your organization\'s wording and structure in one template, then reuse it for every new policy of that kind' },
        { bold: 'Customizable', text: 'Every policy created from a template can be edited before you save it' },
      ],
    },
    {
      type: 'heading',
      id: 'accessing-templates',
      level: 2,
      text: 'Opening the templates tab',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to **Policy manager** from the sidebar.' },
        { text: 'Click the **Policy templates** tab at the top of the page.' },
        { text: 'Choose **System templates** or **Our templates**.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Both sections use the same table, with ID, title, tags, description and actions columns.',
    },
    {
      type: 'heading',
      id: 'template-categories',
      level: 2,
      text: 'Template categories',
    },
    {
      type: 'paragraph',
      text: 'Every template has a category. The built-in templates use the 5 below. For your own templates you can also pick **Industry packs**.',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Shield',
          title: 'Core AI governance policies',
          description: 'Foundational policies for AI ethics, risk management, accountability and transparency. These are typically the first policies an organization puts in place.',
        },
        {
          icon: 'Repeat',
          title: 'Model lifecycle policies',
          description: 'Policies covering model validation, testing, approval, release and post-deployment monitoring.',
        },
        {
          icon: 'Lock',
          title: 'Data and security AI policies',
          description: 'Data governance, sensitive data handling, training data sourcing and incident response for AI systems.',
        },
        {
          icon: 'Scale',
          title: 'Legal and compliance',
          description: 'Regulatory compliance requirements and vendor risk assessment for AI vendors.',
        },
        {
          icon: 'Users',
          title: 'People and organization',
          description: 'Roles, responsibilities, accountability structures and user transparency requirements.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'available-templates',
      level: 2,
      text: 'Built-in templates',
    },
    {
      type: 'paragraph',
      text: 'The **System templates** section lists these 15 templates:',
    },
    {
      type: 'table',
      columns: [
        { key: 'title', label: 'Template', width: '35%' },
        { key: 'category', label: 'Category', width: '25%' },
        { key: 'tags', label: 'Tags', width: '40%' },
      ],
      rows: [
        { title: 'AI Ethical Use Charter', category: 'Core AI governance policies', tags: 'AI ethics, Fairness' },
        { title: 'AI Governance Policy', category: 'Core AI governance policies', tags: 'AI governance, Policy framework' },
        { title: 'AI Risk Management Policy', category: 'Core AI governance policies', tags: 'Risk management, AI safety' },
        { title: 'Model Approval and Release Policy', category: 'Core AI governance policies', tags: 'Model release, Approval' },
        { title: 'Responsible AI Principles', category: 'Core AI governance policies', tags: 'AI ethics, Responsible AI' },
        { title: 'Model Validation and Testing Policy', category: 'Model lifecycle policies', tags: 'Testing, Validation' },
        { title: 'Post Market Monitoring Policy', category: 'Model lifecycle policies', tags: 'Monitoring, Post-deployment' },
        { title: 'AI Data Use Policy', category: 'Data and security AI policies', tags: 'Privacy, Data governance' },
        { title: 'AI Sensitive Data Handling Policy', category: 'Data and security AI policies', tags: 'Sensitive data, Privacy' },
        { title: 'AI Training Data Sourcing Policy', category: 'Data and security AI policies', tags: 'Training data, Sourcing' },
        { title: 'Incident Response for AI Systems Policy', category: 'Data and security AI policies', tags: 'Incident response, Security' },
        { title: 'AI Regulatory Compliance Policy', category: 'Legal and compliance', tags: 'Compliance, Regulation' },
        { title: 'AI Vendor Risk Policy', category: 'Legal and compliance', tags: 'Vendor risk, Third-party' },
        { title: 'AI Accountability and Roles Policy', category: 'People and organization', tags: 'Accountability, AI ethics' },
        { title: 'AI Transparency and User Notice Policy', category: 'People and organization', tags: 'Transparency, Users' },
      ],
    },
    {
      type: 'heading',
      id: 'filtering-templates',
      level: 2,
      text: 'Filtering and searching templates',
    },
    {
      type: 'paragraph',
      text: 'The toolbar above the table works the same way in both sections.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Filter', text: 'Filter by title (free text) or by category.' },
        { bold: 'Group by', text: 'Group templates by category into collapsible sections.' },
        { bold: 'Column selector', text: 'Show or hide the ID, tags, description and actions columns. **Title** is always visible. Your choice is saved in your browser.' },
        { bold: 'Search', text: 'Filters templates by title as you type.' },
      ],
    },
    {
      type: 'heading',
      id: 'creating-from-template',
      level: 2,
      text: 'Creating a policy from a template',
    },
    {
      type: 'paragraph',
      text: 'This works the same for system templates and your own. You need permission to create policies.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click a row in the templates table.' },
        { text: 'The policy editor opens with the template\'s title, tags and content filled in. The page title reads "New policy from template".' },
        { text: 'Change the title, content and tags to fit your organization.' },
        { text: 'Set the status (usually Draft for a new policy).' },
        { text: 'Click **Save in organizational policies**.' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Customization tip',
      text: 'The built-in templates use general language. Replace it with your own team names, processes and thresholds before you publish.',
    },
    {
      type: 'heading',
      id: 'own-templates',
      level: 2,
      text: 'Your organization\'s templates',
    },
    {
      type: 'paragraph',
      text: 'You can add a template to **Our templates** in two ways: duplicate a system template, or save an existing policy as a template.',
    },
    {
      type: 'heading',
      id: 'duplicate-template',
      level: 3,
      text: 'Duplicate a system template',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open **Policy templates** > **System templates**.' },
        { text: 'In the template\'s row, click the copy icon (tooltip "Duplicate into our templates").' },
        { text: 'The copy appears under **Our templates** with "(copy)" after its name. It keeps the original\'s category, description, content and tags.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Template names must be unique within your organization. If you duplicate the same template again, the new copy is named "(copy 2)", "(copy 3)" and so on.',
    },
    {
      type: 'heading',
      id: 'save-as-template',
      level: 3,
      text: 'Save a policy as a template',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open **Policy manager** > **Organizational policies**.' },
        { text: 'In the policy\'s row, click the "Save as template" icon.' },
        { text: 'In the **Save as template** dialog, enter a **Template name** and pick a **Category**. The name starts as the policy title followed by "(template)". The category starts as Core AI governance policies.' },
        { text: 'Click **Save template**. You see "The policy was saved as an organization template." The policy\'s content and tags are copied into the template.' },
      ],
    },
    {
      type: 'heading',
      id: 'edit-template',
      level: 3,
      text: 'Edit a template',
    },
    {
      type: 'paragraph',
      text: 'Each row under **Our templates** has two edit actions:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Edit details', text: 'Opens the **Edit template details** dialog. Change the **Name**, **Description** or **Category** and click **Save**.' },
        { bold: 'Edit content', text: 'Opens the template in the same rich text editor that policies use. Make your changes and click **Save template**. **Back to policy templates** returns you to the list.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'A system template opened in the content editor is read-only and shows: "System templates are read-only. Duplicate this template into your templates to change it."',
    },
    {
      type: 'heading',
      id: 'delete-template',
      level: 3,
      text: 'Delete a template',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Under **Our templates**, click the trash icon (tooltip "Delete template") in the template\'s row.' },
        { text: 'Click **Delete** in the "Delete this template?" dialog.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The template leaves your organization\'s library. Policies already created from it are not affected.',
    },
    {
      type: 'heading',
      id: 'template-rules',
      level: 2,
      text: 'Template rules',
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Field', width: '25%' },
        { key: 'rule', label: 'Rule', width: '75%' },
      ],
      rows: [
        { field: 'Name', rule: 'Required, 2 to 255 characters, unique within your organization' },
        { field: 'Category', rule: 'Required, at most 100 characters' },
        { field: 'Description', rule: 'Optional, at most 2,000 characters' },
        { field: 'Tags', rule: 'At most 50 tags, each at most 100 characters' },
      ],
    },
    {
      type: 'paragraph',
      text: 'If a save breaks one of these rules, the server\'s error message appears under the form.',
    },
    {
      type: 'heading',
      id: 'permissions',
      level: 2,
      text: 'Who can manage templates',
    },
    {
      type: 'paragraph',
      text: 'Everyone in the organization can browse both sections. Duplicating, editing and deleting templates needs the "Create, update and delete organization policy templates" permission (module **Policy templates**). By default **Admin** and **Editor** have it; Reviewer and Auditor do not. Without it, the action icons are hidden.',
    },
    {
      type: 'heading',
      id: 'policy-editor',
      level: 2,
      text: 'The policy editor',
    },
    {
      type: 'paragraph',
      text: 'When you create a policy from a template (or a blank policy), the policy editor opens. It\'s a rich text editor with a familiar toolbar. The template content editor uses the same toolbar.',
    },
    {
      type: 'heading',
      id: 'editor-toolbar',
      level: 3,
      text: 'Editor toolbar',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Text formatting', text: 'Bold, italic, underline, strikethrough, superscript, subscript and text color' },
        { bold: 'Headings', text: 'Paragraph, Heading 1, Heading 2, Heading 3 from the dropdown' },
        { bold: 'Lists', text: 'Bullet lists, numbered lists and task lists (checklists)' },
        { bold: 'Alignment', text: 'Left, center and right alignment' },
        { bold: 'Links and images', text: 'Insert hyperlinks, upload images directly into the policy' },
        { bold: 'Tables', text: 'Insert and edit tables with rows, columns, merge and split cells' },
        { bold: 'Quotes and code', text: 'Block quotes, inline code and code blocks' },
        { bold: 'Horizontal rule', text: 'Insert a divider line between sections' },
        { bold: 'Highlight', text: 'Highlight text for emphasis' },
        { bold: 'History', text: 'Undo, redo and view the full change history' },
        { bold: 'Find and replace', text: 'Search within the document and replace text' },
      ],
    },
    {
      type: 'heading',
      id: 'editor-sidebar',
      level: 3,
      text: 'Policy metadata sidebar',
    },
    {
      type: 'paragraph',
      text: 'On the right side of the policy editor, a metadata panel lets you set:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Title', text: 'The policy name shown in the policy list' },
        { bold: 'Status', text: 'Current lifecycle status (Draft, Under review, Approved, Published, Archived, Deprecated)' },
        { bold: 'Next review date', text: 'When this policy should next be reviewed' },
        { bold: 'Reviewer', text: 'The person responsible for reviewing this policy' },
        { bold: 'Tags', text: 'Categorization tags for filtering and organization' },
      ],
    },
    {
      type: 'heading',
      id: 'editor-features',
      level: 3,
      text: 'Other editor features',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Import DOCX', text: 'Upload an existing Word document to import its content into the editor' },
        { bold: 'Export', text: 'Download the policy as PDF or DOCX for sharing outside VerifyWise. PDFs include images you uploaded, but not images loaded from an external web address' },
        { bold: 'Character count', text: 'Shown at the bottom of the editor' },
        { bold: 'Change history', text: 'Click the history icon to view all changes made to the policy over time' },
        { bold: 'Image upload', text: 'Drag and drop images or use the image button to upload files directly' },
        { bold: 'Image resize', text: 'Click an image and drag the corner handle to resize it' },
      ],
    },
    {
      type: 'heading',
      id: 'template-to-policy-workflow',
      level: 2,
      text: 'Recommended workflow',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Pick templates', text: 'Find the system templates that match your governance priorities' },
        { bold: 'Make them yours', text: 'Duplicate the ones you\'ll reuse and adapt their content once' },
        { bold: 'Create policies', text: 'Click a template to create a draft policy from it' },
        { bold: 'Review', text: 'Set the status to Under review and assign a reviewer' },
        { bold: 'Approve and publish', text: 'Move the policy to Approved, then Published' },
        { bold: 'Schedule reviews', text: 'Set a next review date so policies don\'t go stale' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Start small',
      text: 'You don\'t need all 15 policies at once. Start with three or four core governance policies and add more as your program matures.',
    },
    {
      type: 'heading',
      id: 'template-tags-reference',
      level: 2,
      text: 'Tag reference',
    },
    {
      type: 'paragraph',
      text: 'Built-in templates come with tags that carry over when you create a policy. Common ones:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'AI ethics, Fairness, Transparency, Explainability' },
        { text: 'Bias mitigation, Privacy, Data governance' },
        { text: 'Model risk, Accountability, Security' },
        { text: 'LLM, Human oversight, Red teaming' },
        { text: 'EU AI Act, ISO 42001, NIST RMF' },
        { text: 'Audit, Monitoring, Vendor management' },
      ],
    },
    {
      type: 'heading',
      id: 'empty-state',
      level: 2,
      text: 'When no templates match',
    },
    {
      type: 'paragraph',
      text: 'If a search or filter returns nothing, or **Our templates** is empty, the page shows "No policy templates found." with a few tips. Under **Our templates**, the tip suggests saving a policy as a template or duplicating a system template.',
    },
    {
      type: 'heading',
      id: 'deep-link',
      level: 2,
      text: 'Linking to a template',
    },
    {
      type: 'paragraph',
      text: 'A link like `/policies/templates?templateId=system-5` or `/policies/templates?templateId=organization-12` opens the policy editor with that template loaded. The prefix names the section the template is in. A link with a number only, such as `?templateId=5`, opens a system template.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'policies',
          articleId: 'policy-management',
          title: 'Policy management basics',
          description: 'Create and organize policies from scratch',
        },
        {
          collectionId: 'policies',
          articleId: 'policy-versioning',
          title: 'Policy lifecycle',
          description: 'Understand the policy status workflow and review scheduling',
        },
        {
          collectionId: 'settings',
          articleId: 'role-configuration',
          title: 'Role configuration',
          description: 'See what each role is allowed to do',
        },
      ],
    },
  ],
};
