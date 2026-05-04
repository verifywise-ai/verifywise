import type { ArticleContent } from '../../contentTypes';

export const vendorManagementContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Vendor management is about tracking, evaluating and overseeing your relationships with third-party providers. For AI governance, that means knowing who supplies your AI capabilities, what data they can access and how their services affect your compliance obligations.',
    },
    {
      type: 'paragraph',
      text: 'Most AI systems rely on external providers for models, training data, compute or complete AI services. Each relationship creates dependencies you need to understand. Without proper vendor management, you might not know which vendors access sensitive data, which use cases depend on which services or how a vendor change could disrupt your operations.',
    },
    {
      type: 'heading',
      id: 'why-manage-vendors',
      level: 2,
      text: 'Why manage AI vendors?',
    },
    {
      type: 'paragraph',
      text: 'Good vendor management helps you:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Maintain visibility', text: 'Know exactly which vendors support your AI systems and what they provide' },
        { bold: 'Manage dependencies', text: 'Understand which use cases rely on which vendors and plan for changes' },
        { bold: 'Control data flows', text: 'Track what data is shared with each vendor and ensure appropriate protections' },
        { bold: 'Support compliance', text: 'Document vendor relationships for regulatory audits and assessments' },
        { bold: 'Reduce risk', text: 'Identify and address vendor-related risks before they become problems' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Under the EU AI Act, organizations using third-party AI systems are still responsible for compliance. Proper vendor management helps you demonstrate due diligence.',
    },
    {
      type: 'heading',
      id: 'vendor-registry',
      level: 2,
      text: 'The vendor registry',
    },
    {
      type: 'paragraph',
      text: 'Open the vendor registry from the sidebar to view and manage all your AI vendors. The registry shows:',
    },
    {
      type: 'checklist',
      items: [
        'Complete list of registered vendors',
        'Risk scores and review status',
        'Assignee responsible for each vendor',
        'Use case associations',
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/vendor-list.png',
      alt: 'Vendor list page showing a table with vendor names, assignees, status, risk scores, scorecards, and review dates',
      caption: 'The vendor registry lists all registered AI vendors with their risk scores and review status.',
    },
    {
      type: 'heading',
      id: 'adding-vendors',
      level: 2,
      text: 'Adding vendors',
    },
    {
      type: 'paragraph',
      text: 'To register a new vendor, click "Add vendor" and fill in:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Vendor name', text: 'The official company or product name' },
        { bold: 'Vendor provides', text: 'Description of what the vendor supplies' },
        { bold: 'Assignee', text: 'Person responsible for managing this vendor relationship' },
        { bold: 'Website', text: 'Vendor\'s official website URL' },
        { bold: 'Vendor contact person', text: 'Primary contact at the vendor' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/add-vendor.png',
      alt: 'Add new vendor modal with fields for vendor name, use cases, website, contact person, assignee, description, review status, reviewer, review date, and result',
      caption: 'Register new vendors with complete contact and review information.',
    },
    {
      type: 'heading',
      id: 'review-workflow',
      level: 2,
      text: 'Review workflow',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise has a built-in review workflow for vendor assessments:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Circle',
          title: 'Not started',
          description: 'Vendor has been added but review has not begun.',
        },
        {
          icon: 'Clock',
          title: 'In review',
          description: 'Vendor assessment is currently in progress.',
        },
        {
          icon: 'CheckCircle',
          title: 'Reviewed',
          description: 'Vendor assessment has been completed.',
        },
        {
          icon: 'AlertTriangle',
          title: 'Requires follow-up',
          description: 'Review identified issues that need additional attention.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'Each review captures:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Reviewer', text: 'The person conducting the assessment' },
        { bold: 'Review date', text: 'When the review was performed' },
        { bold: 'Review result', text: 'Findings and conclusions from the review' },
      ],
    },
    {
      type: 'heading',
      id: 'vendor-scorecard',
      level: 2,
      text: 'Vendor scorecard',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise uses a scorecard to assess vendor risk. Each vendor gets evaluated across several dimensions:',
    },
    {
      type: 'heading',
      id: 'data-sensitivity',
      level: 3,
      text: 'Data sensitivity',
    },
    {
      type: 'paragraph',
      text: 'Classify the sensitivity of data shared with or processed by the vendor:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'None', text: 'No sensitive data is shared' },
        { bold: 'Internal only', text: 'Internal business data only' },
        { bold: 'PII', text: 'Personally identifiable information' },
        { bold: 'Financial', text: 'Financial data or records' },
        { bold: 'Health', text: 'Health-related information' },
        { bold: 'Model weights', text: 'Proprietary model parameters' },
        { bold: 'Other', text: 'Other sensitive data types' },
      ],
    },
    {
      type: 'heading',
      id: 'business-criticality',
      level: 3,
      text: 'Business criticality',
    },
    {
      type: 'paragraph',
      text: 'Rate how critical this vendor is to your operations:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Low (vendor supports non-core functions)', text: 'Easy to replace; alternatives are readily available' },
        { bold: 'Medium (affects operations but is replaceable)', text: 'Important but not critical; disruption would be manageable' },
        { bold: 'High (critical to core services or products)', text: 'Disruption would significantly impact business' },
      ],
    },
    {
      type: 'heading',
      id: 'past-issues',
      level: 3,
      text: 'Past issues',
    },
    {
      type: 'paragraph',
      text: 'Document any historical incidents with the vendor:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'None', text: 'No past incidents' },
        { bold: 'Minor incident (e.g. small delay, minor bug)', text: 'Small issues that were resolved' },
        { bold: 'Major incident (e.g. data breach, legal issue)', text: 'Significant incidents affecting operations' },
      ],
    },
    {
      type: 'heading',
      id: 'regulatory-exposure',
      level: 3,
      text: 'Regulatory exposure',
    },
    {
      type: 'paragraph',
      text: 'Track which regulations apply to this vendor relationship:',
    },
    {
      type: 'checklist',
      items: [
        'GDPR, General Data Protection Regulation',
        'HIPAA, Health Insurance Portability and Accountability Act',
        'SOC 2, Service Organization Control 2',
        'ISO 27001, Information Security Management',
        'EU AI Act, European AI Regulation',
        'CCPA, California Consumer Privacy Act',
      ],
    },
    {
      type: 'heading',
      id: 'risk-score',
      level: 2,
      text: 'Risk score',
    },
    {
      type: 'paragraph',
      text: 'Based on the scorecard inputs, VerifyWise calculates an overall risk score for each vendor. Higher scores mean greater risk and more oversight needed.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Keep scorecard values up to date as your vendor relationship evolves. Changes in data sharing, criticality or regulatory requirements should trigger a scorecard review.',
    },
    {
      type: 'heading',
      id: 'project-linking',
      level: 2,
      text: 'Linking vendors to projects',
    },
    {
      type: 'paragraph',
      text: 'Associate vendors with the projects that use their services. This lets you see:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Which projects depend on which vendors' },
        { text: 'Impact assessment when vendor issues arise' },
        { text: 'Vendor concentration across your portfolio' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Important',
      text: 'When a vendor experiences an incident or regulatory action, review all linked projects to assess potential impact.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'risk-management',
          articleId: 'vendor-risks',
          title: 'Vendor risk assessment',
          description: 'Assess and track vendor-specific risks',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'model-inventory',
          title: 'Managing model inventory',
          description: 'Link vendors to your AI models',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'evidence-collection',
          title: 'Evidence collection',
          description: 'Store vendor due diligence documentation',
        },
      ],
    },
  ],
};
