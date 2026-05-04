import type { ArticleContent } from '../../contentTypes';

export const iso27001Content: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'ISO/IEC 27001 is the leading international standard for information security management systems (ISMS). It isn\'t AI-specific, but it provides the security foundations that AI governance builds on. If you already have ISO 27001 certification, you can extend your ISMS to cover AI-specific security concerns.',
    },
    {
      type: 'paragraph',
      text: 'AI systems bring security challenges that traditional information security may not fully cover. Training data can be poisoned, models can be stolen or reverse-engineered and adversarial attacks can manipulate AI outputs. Integrating AI governance with ISO 27001 makes sure these risks get proper attention within your security framework.',
    },
    {
      type: 'heading',
      id: 'why-integrate',
      level: 2,
      text: 'Why integrate AI governance with ISO 27001?',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Build on existing work', text: 'Extend your ISMS rather than creating parallel governance structures' },
        { bold: 'Unified security approach', text: 'Manage AI security alongside other information security risks' },
        { bold: 'Regulatory alignment', text: 'Both EU AI Act and ISO 42001 reference information security requirements' },
        { bold: 'Audit efficiency', text: 'Combined audits reduce effort and show integrated governance' },
        { bold: 'Consistent risk treatment', text: 'Apply proven security controls to AI-specific threats' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'The 2022 update to ISO 27001 introduced Annex A controls more relevant to emerging technologies, making integration with AI governance more natural.',
    },
    {
      type: 'heading',
      id: 'ai-security-risks',
      level: 2,
      text: 'AI-specific security risks',
    },
    {
      type: 'paragraph',
      text: 'AI systems introduce security considerations that should be addressed within your ISMS:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Database',
          title: 'Training data security',
          description: 'Protecting the confidentiality, integrity and availability of data used to train AI models.',
        },
        {
          icon: 'Brain',
          title: 'Model protection',
          description: 'Preventing theft, copying, or unauthorized access to trained AI models.',
        },
        {
          icon: 'Shield',
          title: 'Adversarial robustness',
          description: 'Defending against inputs designed to manipulate or deceive AI systems.',
        },
        {
          icon: 'Lock',
          title: 'Inference security',
          description: 'Protecting AI outputs and preventing inference attacks that reveal training data.',
        },
        {
          icon: 'Activity',
          title: 'Supply chain risks',
          description: 'Managing security risks from third-party models, data and AI services.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'relevant-controls',
      level: 2,
      text: 'Relevant ISO 27001 controls',
    },
    {
      type: 'paragraph',
      text: 'Several ISO 27001 Annex A controls are particularly relevant to AI security:',
    },
    {
      type: 'checklist',
      items: [
        'A.5 - Organizational controls for AI governance policies',
        'A.6 - People controls for AI training and awareness',
        'A.7 - Physical controls for AI infrastructure protection',
        'A.8 - Technological controls for AI system security',
      ],
    },
    {
      type: 'heading',
      id: 'extending-controls',
      level: 3,
      text: 'Extending controls for AI',
    },
    {
      type: 'paragraph',
      text: 'Consider how existing controls apply to AI-specific scenarios:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Access control', text: 'Extend to cover access to AI models, training pipelines and inference APIs' },
        { bold: 'Cryptography', text: 'Apply to model encryption, secure model serving and federated learning' },
        { bold: 'Supplier management', text: 'Include AI vendors, model providers and training data suppliers' },
        { bold: 'Change management', text: 'Cover model updates, retraining and version management' },
        { bold: 'Incident management', text: 'Address AI-specific incidents like model failures or adversarial attacks' },
      ],
    },
    {
      type: 'heading',
      id: 'verifywise-support',
      level: 2,
      text: 'How VerifyWise supports integration',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise helps you extend your ISO 27001 ISMS to cover AI systems:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Control mapping', text: 'Map AI governance controls to ISO 27001 requirements' },
        { bold: 'Risk register integration', text: 'Track AI security risks alongside other information security risks' },
        { bold: 'Evidence collection', text: 'Gather AI-specific security evidence for integrated audits' },
        { bold: 'Vendor assessment', text: 'Evaluate AI vendors against security requirements' },
        { bold: 'Incident tracking', text: 'Document AI security incidents within your ISMS incident process' },
      ],
    },
    {
      type: 'heading',
      id: 'implementation-approach',
      level: 2,
      text: 'Implementation approach',
    },
    {
      type: 'paragraph',
      text: 'To integrate AI governance with your ISO 27001 ISMS:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Review your current ISMS scope and determine how AI systems fit' },
        { text: 'Identify AI-specific assets (models, training data, inference systems)' },
        { text: 'Conduct AI-specific risk assessment within your ISMS framework' },
        { text: 'Extend existing controls or add new controls for AI-specific risks' },
        { text: 'Update documentation to reflect AI considerations' },
        { text: 'Train security personnel on AI-specific threats and controls' },
        { text: 'Include AI systems in internal audits and surveillance activities' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Work with your ISO 27001 auditor early to understand how they will assess AI-related controls. Some certification bodies have specific guidance for AI security.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'compliance',
          articleId: 'iso-42001',
          title: 'ISO 42001 certification',
          description: 'The AI-specific management system standard',
        },
        {
          collectionId: 'risk-management',
          articleId: 'vendor-risks',
          title: 'Vendor risk assessment',
          description: 'Assess AI vendor security',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'incident-management',
          title: 'AI incident management',
          description: 'Handle AI security incidents',
        },
      ],
    },
  ],
};
