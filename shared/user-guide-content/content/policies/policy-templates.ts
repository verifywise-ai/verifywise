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
      text: 'VerifyWise ships with a library of 15 pre-built policy templates covering the most common AI governance topics. Each template is a full policy document you can copy into your organization\'s policy list, customize and publish. Templates save you from starting with a blank page every time you need a new policy.',
    },
    {
      type: 'paragraph',
      text: 'You\'ll find the templates in the **Policy templates** tab inside the policy manager. They\'re organized by category so you can quickly find the one that fits your needs.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Templates are read-only starting points. When you select a template, VerifyWise creates a copy in your organizational policies. The original template stays unchanged for future use.',
    },
    {
      type: 'heading',
      id: 'why-templates',
      level: 2,
      text: 'Why use policy templates?',
    },
    {
      type: 'paragraph',
      text: 'Writing AI governance policies from scratch requires deep knowledge of both AI technology and regulatory requirements. Templates give you professionally written content built on industry best practices. They cover governance areas you might otherwise overlook and use language refined through real-world deployments.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Save time', text: 'Start with complete, structured content rather than an empty editor' },
        { bold: 'Cover blind spots', text: 'Templates address governance topics that are easy to miss when writing from scratch' },
        { bold: 'Regulatory alignment', text: 'Content reflects requirements from the EU AI Act, ISO 42001 and other frameworks' },
        { bold: 'Consistency', text: 'Policies created from templates share a consistent structure and tone across your organization' },
        { bold: 'Customizable', text: 'Every template can be edited to match your organization\'s specific context after copying' },
      ],
    },
    {
      type: 'heading',
      id: 'accessing-templates',
      level: 2,
      text: 'Accessing the templates tab',
    },
    {
      type: 'paragraph',
      text: 'To open the template library:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to **Policy manager** from the sidebar' },
        { text: 'Click the **Policy templates** tab at the top of the page' },
        { text: 'The tab badge shows the total number of available templates' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The templates tab shows a table with four columns: ID, title, tags and description. Each row represents one template you can use as a starting point.',
    },
    {
      type: 'heading',
      id: 'template-categories',
      level: 2,
      text: 'Template categories',
    },
    {
      type: 'paragraph',
      text: 'Templates are organized into five categories. You can use the filter button to narrow the list by category or search by title.',
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
      text: 'Available templates',
    },
    {
      type: 'paragraph',
      text: 'Here\'s the full list of templates included with VerifyWise:',
    },
    {
      type: 'table',
      columns: [
        { key: 'title', label: 'Template', width: '35%' },
        { key: 'category', label: 'Category', width: '25%' },
        { key: 'tags', label: 'Tags', width: '40%' },
      ],
      rows: [
        { title: 'AI Ethical Use Charter', category: 'Core AI governance', tags: 'AI ethics, Fairness' },
        { title: 'AI Governance Policy', category: 'Core AI governance', tags: 'AI governance, Policy framework' },
        { title: 'AI Risk Management Policy', category: 'Core AI governance', tags: 'Risk management, AI safety' },
        { title: 'Model Approval and Release Policy', category: 'Core AI governance', tags: 'Model release, Approval' },
        { title: 'Responsible AI Principles', category: 'Core AI governance', tags: 'AI ethics, Responsible AI' },
        { title: 'Model Validation and Testing Policy', category: 'Model lifecycle', tags: 'Testing, Validation' },
        { title: 'Post Market Monitoring Policy', category: 'Model lifecycle', tags: 'Monitoring, Post-deployment' },
        { title: 'AI Data Use Policy', category: 'Data and security', tags: 'Privacy, Data governance' },
        { title: 'AI Sensitive Data Handling Policy', category: 'Data and security', tags: 'Sensitive data, Privacy' },
        { title: 'AI Training Data Sourcing Policy', category: 'Data and security', tags: 'Training data, Sourcing' },
        { title: 'Incident Response for AI Systems Policy', category: 'Data and security', tags: 'Incident response, Security' },
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
      text: 'The toolbar above the templates table has several tools to help you find the right template.',
    },
    {
      type: 'heading',
      id: 'filter-by',
      level: 3,
      text: 'Filter by',
    },
    {
      type: 'paragraph',
      text: 'Click the **Filter** button to open the filter panel. You can filter by:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Title', text: 'Free text search within template titles' },
        { bold: 'Category', text: 'Select one of the five template categories to narrow the list' },
      ],
    },
    {
      type: 'heading',
      id: 'group-by',
      level: 3,
      text: 'Group by',
    },
    {
      type: 'paragraph',
      text: 'Click the **Group by** button to group templates by category. Groups appear as collapsible sections in the table, making it easy to scan all templates within a specific governance area.',
    },
    {
      type: 'heading',
      id: 'column-selector',
      level: 3,
      text: 'Column selector',
    },
    {
      type: 'paragraph',
      text: 'Click the column selector button to show or hide table columns. The **Title** column is always visible. You can toggle the ID, tags and description columns based on your preference. Your column choices are saved in your browser and persist across sessions.',
    },
    {
      type: 'heading',
      id: 'search',
      level: 3,
      text: 'Search',
    },
    {
      type: 'paragraph',
      text: 'The search box filters templates by title as you type. Combine search with category filtering to narrow results quickly.',
    },
    {
      type: 'heading',
      id: 'creating-from-template',
      level: 2,
      text: 'Creating a policy from a template',
    },
    {
      type: 'paragraph',
      text: 'To create a new organizational policy based on a template:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click any row in the templates table' },
        { text: 'VerifyWise opens the policy editor with the template\'s title, tags and content pre-filled' },
        { text: 'The page title shows "New policy from template" to confirm you\'re working from a template' },
        { text: 'Edit the title to match your organization\'s naming convention' },
        { text: 'Review and customize the content. Replace any placeholder text with your organization\'s specifics' },
        { text: 'Adjust the tags if needed. Template tags are pre-applied but you can add or remove them' },
        { text: 'Set the policy status (usually Draft for new policies)' },
        { text: 'Click **Save in organizational policies** to create the policy' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Customization tip',
      text: 'Templates include placeholder text and general language you should replace with your organization\'s specific details. Look for generic references and replace them with your actual team names, processes and requirements.',
    },
    {
      type: 'heading',
      id: 'policy-editor',
      level: 2,
      text: 'The policy editor',
    },
    {
      type: 'paragraph',
      text: 'When you select a template (or create a blank policy), the full-featured policy editor opens. It\'s a rich text editor built on TipTap with a familiar toolbar.',
    },
    {
      type: 'heading',
      id: 'editor-toolbar',
      level: 3,
      text: 'Editor toolbar',
    },
    {
      type: 'paragraph',
      text: 'The toolbar at the top of the editor gives you formatting controls:',
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
      text: 'On the right side of the editor, a metadata panel lets you configure:',
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
        { bold: 'Export', text: 'Download the policy as DOCX for sharing outside VerifyWise' },
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
      type: 'paragraph',
      text: 'Here\'s a workflow that works well for most organizations:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Pick templates', text: 'Browse the template library and select the templates that match your governance priorities' },
        { bold: 'Create policies', text: 'Click each template to create a draft policy. Start with core governance policies before moving to specialized ones' },
        { bold: 'Customize content', text: 'Replace generic language with your organization\'s specific teams, processes and thresholds' },
        { bold: 'Internal review', text: 'Set the status to Under review and assign a reviewer to check the content' },
        { bold: 'Approve and publish', text: 'Once reviewed, move the policy to Approved and then Published' },
        { bold: 'Schedule reviews', text: 'Set a next review date so policies don\'t go stale' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Start small',
      text: 'Don\'t try to create all 15 policies at once. Start with 3-4 core governance policies (AI Ethics, AI Risk Management, AI Governance) and add more as your program matures.',
    },
    {
      type: 'heading',
      id: 'template-tags-reference',
      level: 2,
      text: 'Tag reference',
    },
    {
      type: 'paragraph',
      text: 'Templates come with pre-applied tags that carry over when you create a policy. Common tags you\'ll see across the library:',
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
      text: 'If your search or filter returns no results, the page shows an empty state with helpful tips:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'What are policy templates?', text: 'Pre-built policy documents covering common AI governance topics. Copy a template, customize it and publish.' },
        { bold: 'Filter by framework', text: 'Templates are grouped by framework (EU AI Act, ISO 42001, etc.). Use the search bar to find templates relevant to your compliance needs.' },
        { bold: 'Build your own', text: 'If no template fits, create a policy from scratch in the organizational policies tab.' },
      ],
    },
    {
      type: 'heading',
      id: 'deep-link',
      level: 2,
      text: 'Deep linking to templates',
    },
    {
      type: 'paragraph',
      text: 'Templates support deep linking via URL parameters. If you share a link like `/policies/templates?templateId=5`, the recipient will be redirected straight to the policy editor with that template pre-loaded. This is useful when sharing specific templates with colleagues or bookmarking a frequently used template.',
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
          collectionId: 'compliance',
          articleId: 'eu-ai-act',
          title: 'EU AI Act compliance',
          description: 'Learn about the regulation that many policy templates align with',
        },
      ],
    },
  ],
};
