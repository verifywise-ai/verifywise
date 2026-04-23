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
      text: 'VerifyWise comes with a library of pre-built policy templates covering common AI governance topics. They give you a starting point for creating your own organizational policies, saving time and helping you cover the governance areas that matter.',
    },
    {
      type: 'paragraph',
      text: 'Templates are organized by category, covering everything from AI ethics and fairness to regulatory compliance and vendor management. You can use them as-is or customize them to fit your needs.',
    },
    {
      type: 'heading',
      id: 'why-templates',
      level: 2,
      text: 'Why use policy templates?',
    },
    {
      type: 'paragraph',
      text: 'Writing AI governance policies from scratch takes real expertise in both AI technology and regulatory requirements. Templates give you a foundation built on industry best practices and governance standards. They help you cover topics you might otherwise miss and provide language that\'s been refined through real-world use.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Save time', text: 'Start with professionally written content rather than a blank page' },
        { bold: 'Cover key topics', text: 'Templates cover governance areas you might otherwise miss' },
        { bold: 'Industry alignment', text: 'Templates reflect best practices from AI governance frameworks and regulations' },
        { bold: 'Consistency', text: 'Multiple policies built from templates share a consistent structure and tone' },
        { bold: 'Customizable', text: 'Adapt template content to your organization\'s specific context and requirements' },
      ],
    },
    {
      type: 'heading',
      id: 'template-categories',
      level: 2,
      text: 'Template categories',
    },
    {
      type: 'paragraph',
      text: 'Policy templates are organized into the following categories:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Shield',
          title: 'Core AI governance policies',
          description: 'Foundational policies covering AI principles, ethics, accountability and organizational governance structures.',
        },
        {
          icon: 'Repeat',
          title: 'Model lifecycle policies',
          description: 'Policies for model development, testing, deployment, monitoring and retirement.',
        },
        {
          icon: 'Lock',
          title: 'Data and security AI policies',
          description: 'Data governance, privacy, security controls and access management for AI systems.',
        },
        {
          icon: 'Scale',
          title: 'Legal and compliance',
          description: 'Regulatory compliance, contractual requirements and legal considerations for AI.',
        },
        {
          icon: 'Users',
          title: 'People and organization',
          description: 'Roles, responsibilities, training requirements and organizational structures for AI governance.',
        },
        {
          icon: 'Building',
          title: 'Industry packs',
          description: 'Sector-specific policies for healthcare, finance and other regulated industries.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'browsing-templates',
      level: 2,
      text: 'Browsing templates',
    },
    {
      type: 'paragraph',
      text: 'To browse available templates:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Navigate to the Policy Manager' },
        { text: 'Click the "Policy templates" tab' },
        { text: 'Use the filter to narrow by category' },
        { text: 'Use search to find templates by title' },
        { text: 'Click on a template to view its full content' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/policy-templates.png',
      alt: 'Policy Templates tab showing a list of pre-built templates with columns for ID, Title, Tags, and Description covering topics like AI safety, governance, transparency, and security',
      caption: 'The policy templates library has ready-to-use policies covering common AI governance topics.',
    },
    {
      type: 'heading',
      id: 'template-details',
      level: 2,
      text: 'Template information',
    },
    {
      type: 'paragraph',
      text: 'Each template in the list displays:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'ID', text: 'A unique identifier for the template' },
        { bold: 'Title', text: 'The policy name describing its purpose' },
        { bold: 'Tags', text: 'Categories and topics the template covers' },
        { bold: 'Description', text: 'A summary of what the policy addresses' },
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
      text: 'To create a new organizational policy from a template:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click on a template in the templates list to open it' },
        { text: 'Review the template content in the preview' },
        { text: 'The title and content will be pre-filled from the template' },
        { text: 'Customize the title if needed for your organization' },
        { text: 'Edit the content to match your specific requirements' },
        { text: 'Select appropriate tags (some may be pre-selected based on the template)' },
        { text: 'Set the status (typically Draft for new policies)' },
        { text: 'Save to create your new policy' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Customization tip',
      text: 'Templates include placeholder text and guidance that you should replace with your organization\'s specific details. Look for bracketed text like [Organization Name] or [Specific Requirement] and replace with your actual information.',
    },
    {
      type: 'heading',
      id: 'common-templates',
      level: 2,
      text: 'Commonly used templates',
    },
    {
      type: 'paragraph',
      text: 'Some frequently used policy templates include:',
    },
    {
      type: 'checklist',
      items: [
        'AI ethics policy, principles for responsible AI development and use',
        'AI risk management policy, framework for identifying and managing AI risks',
        'Model development policy, standards for building and testing AI models',
        'Data governance policy, rules for data collection, storage and use in AI',
        'AI security policy, security controls specific to AI systems',
        'Vendor AI assessment policy, requirements for evaluating third-party AI',
        'Human oversight policy, when and how humans review AI decisions',
        'AI incident response policy, procedures for handling AI-related incidents',
      ],
    },
    {
      type: 'heading',
      id: 'template-tags',
      level: 2,
      text: 'Template tags',
    },
    {
      type: 'paragraph',
      text: 'Templates are tagged with relevant topics so you can find policies for specific governance areas. Common tags include:',
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
      type: 'callout',
      variant: 'info',
      text: 'Templates are read-only. When you create a policy from a template, a copy is made that you can edit. The original template remains unchanged for future use.',
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
          articleId: 'policy-versioning',
          title: 'Policy lifecycle',
          description: 'Understand the policy status workflow',
        },
      ],
    },
  ],
};
