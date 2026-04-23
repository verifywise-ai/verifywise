import type { ArticleContent } from '../../contentTypes';

export const assessmentsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise supports multiple compliance frameworks to help you meet regulatory requirements and show responsible AI governance. Each framework gives you a structured way to evaluate your AI systems against specific standards or regulations.',
    },
    {
      type: 'paragraph',
      text: 'Compliance isn\'t a one-time event. VerifyWise lets you track progress over time, spot gaps and show auditors exactly where you stand on each requirement.',
    },
    {
      type: 'heading',
      id: 'available-frameworks',
      level: 2,
      text: 'Available frameworks',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise includes support for the following compliance frameworks:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Scale',
          title: 'EU AI Act',
          description: 'The European Union\'s regulation governing AI systems with risk-based requirements.',
        },
        {
          icon: 'Award',
          title: 'ISO 42001',
          description: 'The international standard for AI management systems, enabling third-party certification.',
        },
        {
          icon: 'Shield',
          title: 'ISO 27001',
          description: 'Information security management extended to cover AI-specific security concerns.',
        },
        {
          icon: 'Target',
          title: 'NIST AI RMF',
          description: 'Voluntary risk management framework with practical guidance for trustworthy AI.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'choosing-framework',
      level: 2,
      text: 'Choosing a framework',
    },
    {
      type: 'paragraph',
      text: 'The right framework depends on your regulatory obligations, business needs and AI governance maturity:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'EU AI Act', text: 'Required if you deploy AI systems in the EU or affecting EU citizens. Start here if you need to comply with European AI regulation' },
        { bold: 'ISO 42001', text: 'Choose this if you want third-party certification to demonstrate AI governance maturity to customers and partners' },
        { bold: 'ISO 27001', text: 'Extend your existing information security management system to cover AI-specific security requirements' },
        { bold: 'NIST AI RMF', text: 'Ideal as a flexible starting point for AI risk management, especially for US organizations or government contractors' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Using multiple frameworks',
      text: 'Many organizations implement multiple frameworks. For example, you might use NIST AI RMF as your operational risk management approach while pursuing ISO 42001 certification and ensuring EU AI Act compliance. The frameworks complement each other.',
    },
    {
      type: 'heading',
      id: 'framework-comparison',
      level: 2,
      text: 'Framework comparison',
    },
    {
      type: 'paragraph',
      text: 'Key differences between the frameworks:',
    },
    {
      type: 'table',
      columns: [
        { key: 'framework', label: 'Framework', width: '1.5fr' },
        { key: 'type', label: 'Type', width: '1fr' },
        { key: 'mandatory', label: 'Mandatory', width: '0.8fr' },
        { key: 'certifiable', label: 'Certifiable', width: '0.8fr' },
        { key: 'region', label: 'Primary region', width: '1fr' },
      ],
      rows: [
        { framework: 'EU AI Act', type: 'Regulation', mandatory: '✓', certifiable: '—', region: 'European Union' },
        { framework: 'ISO 42001', type: 'Standard', mandatory: '—', certifiable: '✓', region: 'Global' },
        { framework: 'ISO 27001', type: 'Standard', mandatory: '—', certifiable: '✓', region: 'Global' },
        { framework: 'NIST AI RMF', type: 'Framework', mandatory: '—', certifiable: '—', region: 'United States' },
      ],
    },
    {
      type: 'heading',
      id: 'getting-started',
      level: 2,
      text: 'Getting started with compliance',
    },
    {
      type: 'paragraph',
      text: 'To begin compliance tracking in VerifyWise:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Create a use case for your AI system' },
        { text: 'Select the compliance framework(s) you need to address' },
        { text: 'VerifyWise creates an assessment with all applicable requirements' },
        { text: 'Assign owners to controls and begin implementation' },
        { text: 'Track progress and link evidence as you work' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/use-case-assessments.png',
      alt: 'Use case general view showing the Frameworks/regulations tab with EU AI Act assessment questions, progress tracking and rich text editor for responses',
      caption: 'The use case assessments view shows compliance progress and allows you to answer assessment questions directly.',
    },
    {
      type: 'heading',
      id: 'common-elements',
      level: 2,
      text: 'Common elements across frameworks',
    },
    {
      type: 'paragraph',
      text: 'While each framework has its own structure and terminology, they share common elements in VerifyWise:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Requirements', text: 'Controls, subclauses, or subcategories that define what you need to address' },
        { bold: 'Status tracking', text: 'Progress from not started through implementation to completion' },
        { bold: 'Assignments', text: 'Owner, reviewer and approver roles for accountability' },
        { bold: 'Evidence linking', text: 'Attach documents from your Evidence Hub to demonstrate compliance' },
        { bold: 'Risk linking', text: 'Connect use case risks to show how controls address identified risks' },
        { bold: 'Progress metrics', text: 'Track completion, assignments and overdue items' },
      ],
    },
    {
      type: 'heading',
      id: 'continuous-compliance',
      level: 2,
      text: 'Continuous compliance',
    },
    {
      type: 'paragraph',
      text: 'Compliance isn\'t something you finish once. VerifyWise supports ongoing compliance management:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Monitor controls to ensure they remain effective as your AI systems change' },
        { text: 'Update implementation details when processes evolve' },
        { text: 'Refresh evidence to reflect current practices' },
        { text: 'Track regulatory updates and adjust controls accordingly' },
        { text: 'Prepare for periodic audits with up-to-date documentation' },
      ],
    },
    {
      type: 'article-links',
      title: 'Framework documentation',
      items: [
        {
          collectionId: 'compliance',
          articleId: 'eu-ai-act',
          title: 'EU AI Act',
          description: 'Risk-based regulation for AI systems',
        },
        {
          collectionId: 'compliance',
          articleId: 'iso-42001',
          title: 'ISO 42001',
          description: 'AI management system certification',
        },
        {
          collectionId: 'compliance',
          articleId: 'iso-27001',
          title: 'ISO 27001',
          description: 'Information security for AI',
        },
        {
          collectionId: 'compliance',
          articleId: 'nist-ai-rmf',
          title: 'NIST AI RMF',
          description: 'AI risk management framework',
        },
      ],
    },
  ],
};
