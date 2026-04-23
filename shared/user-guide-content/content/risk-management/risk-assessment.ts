import type { ArticleContent } from '@user-guide-content/contentTypes';

export const riskAssessmentContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Risk assessment is about figuring out what could go wrong with your AI systems, how likely it is to happen and how bad the consequences would be. It helps you decide which risks need immediate attention and which ones you can monitor over time.',
    },
    {
      type: 'paragraph',
      text: 'AI systems bring risks that traditional software doesn\'t, like biased decision-making or unexpected model behaviors. Identifying these risks early lets you put controls in place before problems happen rather than reacting after the fact.',
    },
    {
      type: 'heading',
      id: 'why-assess-risks',
      level: 2,
      text: 'Why assess AI risks?',
    },
    {
      type: 'paragraph',
      text: 'AI systems present challenges that make formal risk assessment worth the effort:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Regulatory compliance', text: 'Regulations like the EU AI Act require documented risk assessments for AI systems' },
        { bold: 'Stakeholder protection', text: 'Spotting risks helps protect users, customers and affected communities' },
        { bold: 'Business continuity', text: 'Knowing your risks prevents costly failures and reputation damage' },
        { bold: 'Informed decision-making', text: 'Risk data helps you prioritize resources and mitigation efforts' },
        { bold: 'Accountability', text: 'Documented assessments show auditors and regulators you\'ve done your homework' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'You can link risks in VerifyWise to both use cases and compliance frameworks, so you can track them across different contexts and regulatory requirements.',
    },
    {
      type: 'image',
      src: '/images/user-guide/risk-management.png',
      alt: 'Risk Management page showing risk level summary cards and a table of risks with severity, likelihood, mitigation status, and risk level columns',
      caption: 'The risk management page shows all identified risks across your AI use cases.',
    },
    {
      type: 'heading',
      id: 'creating-risks',
      level: 2,
      text: 'Creating a risk',
    },
    {
      type: 'paragraph',
      text: 'To create a new risk, head to the risk management section and fill in these details:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Risk name', text: 'A clear, descriptive name for the risk' },
        { bold: 'Risk owner', text: 'The person responsible for managing this risk' },
        { bold: 'Risk description', text: 'Detailed explanation of the risk and its potential consequences' },
        { bold: 'AI lifecycle phase', text: 'When in the AI lifecycle this risk applies' },
        { bold: 'Risk category', text: 'Classification of the risk type' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/add-new-risk.png',
      alt: 'Add a new risk modal showing fields for applicable use cases, frameworks, risk name, action owner, AI lifecycle phase, risk description, risk categories, potential impact, likelihood, severity, and calculated risk level',
      caption: 'The risk creation form captures everything you need to document and assess a new risk.',
    },
    {
      type: 'heading',
      id: 'lifecycle-phases',
      level: 2,
      text: 'AI lifecycle phases',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise tracks risks across the full AI system lifecycle:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'FileText',
          title: 'Problem definition and planning',
          description: 'Initial project scoping, requirements gathering, and feasibility assessment.',
        },
        {
          icon: 'Database',
          title: 'Data collection and processing',
          description: 'Data sourcing, cleaning, labeling, and preparation activities.',
        },
        {
          icon: 'Brain',
          title: 'Model development and training',
          description: 'Algorithm selection, model architecture, and training processes.',
        },
        {
          icon: 'CheckCircle',
          title: 'Model validation and testing',
          description: 'Performance evaluation, bias testing, and quality assurance.',
        },
        {
          icon: 'Rocket',
          title: 'Deployment and integration',
          description: 'Production rollout and system integration activities.',
        },
        {
          icon: 'Activity',
          title: 'Monitoring and maintenance',
          description: 'Ongoing performance monitoring and model updates.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'risk-analysis',
      level: 2,
      text: 'Risk analysis',
    },
    {
      type: 'paragraph',
      text: 'Each risk gets analyzed using likelihood and severity. VerifyWise calculates the overall risk level automatically from these inputs.',
    },
    {
      type: 'heading',
      id: 'likelihood-assessment',
      level: 3,
      text: 'Likelihood assessment',
    },
    {
      type: 'paragraph',
      text: 'Rate how probable the risk is to occur:',
    },
    {
      type: 'table',
      columns: [
        { key: 'level', label: 'Likelihood', width: '1fr' },
        { key: 'description', label: 'Description', width: '2fr' },
      ],
      rows: [
        { level: 'Rare', description: 'Highly unlikely to occur' },
        { level: 'Unlikely', description: 'Not expected but possible' },
        { level: 'Possible', description: 'May occur at some point' },
        { level: 'Likely', description: 'Expected to occur' },
        { level: 'Almost certain', description: 'Will almost definitely occur' },
      ],
    },
    {
      type: 'heading',
      id: 'severity-assessment',
      level: 3,
      text: 'Severity assessment',
    },
    {
      type: 'paragraph',
      text: 'Rate the potential impact if the risk materializes:',
    },
    {
      type: 'table',
      columns: [
        { key: 'level', label: 'Severity', width: '1fr' },
        { key: 'description', label: 'Description', width: '2fr' },
      ],
      rows: [
        { level: 'Negligible', description: 'Minimal impact, easily addressed' },
        { level: 'Minor', description: 'Limited impact, manageable consequences' },
        { level: 'Moderate', description: 'Noticeable impact requiring attention' },
        { level: 'Major', description: 'Significant impact on operations or stakeholders' },
        { level: 'Catastrophic', description: 'Severe impact with long-term consequences' },
      ],
    },
    {
      type: 'heading',
      id: 'risk-levels',
      level: 2,
      text: 'Calculated risk levels',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise calculates the risk level from your likelihood and severity ratings:',
    },
    {
      type: 'table',
      columns: [
        { key: 'level', label: 'Risk level', width: '1fr' },
        { key: 'action', label: 'Recommended action', width: '2fr' },
      ],
      rows: [
        { level: 'No risk', action: 'No action required' },
        { level: 'Very low', action: 'Monitor periodically' },
        { level: 'Low', action: 'Standard monitoring and review' },
        { level: 'Medium', action: 'Active management required' },
        { level: 'High', action: 'Priority attention needed' },
        { level: 'Very high', action: 'Immediate action required' },
      ],
    },
    {
      type: 'heading',
      id: 'linking-risks',
      level: 2,
      text: 'Linking risks to use cases and frameworks',
    },
    {
      type: 'paragraph',
      text: 'Risks can be associated with:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Use cases', text: 'Link risks to specific AI use cases in your portfolio' },
        { bold: 'Frameworks', text: 'Associate risks with compliance frameworks like EU AI Act or ISO 42001' },
        { bold: 'Assessments', text: 'Map risks to specific assessment questions and controls' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Link each risk to its relevant use case and any applicable compliance frameworks. That way, risks show up in both use case reviews and compliance assessments.',
    },
    {
      type: 'heading',
      id: 'risk-tracking',
      level: 2,
      text: 'Risk tracking',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise gives you a few ways to monitor your risks:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'View all risks across your organization' },
        { text: 'Filter risks by use case' },
        { text: 'Filter risks by compliance framework' },
        { text: 'Track risk status changes over time' },
      ],
    },
    {
      type: 'heading',
      id: 'additional-fields',
      level: 2,
      text: 'Additional risk fields',
    },
    {
      type: 'paragraph',
      text: 'Each risk record can include:',
    },
    {
      type: 'checklist',
      items: [
        'Impact description for detailed consequence analysis',
        'Assessment mapping to link to specific assessment items',
        'Controls mapping to associate with governance controls',
        'Review notes for ongoing observations',
        'Date of assessment for tracking when the risk was evaluated',
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'risk-management',
          articleId: 'quantitative-risk-assessment',
          title: 'Quantitative risk assessment (FAIR)',
          description: 'Quantify AI risks in financial terms with ALE calculations and industry benchmarks',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-mitigation',
          title: 'Risk mitigation strategies',
          description: 'Learn how to implement controls for identified risks',
        },
        {
          collectionId: 'risk-management',
          articleId: 'vendor-risks',
          title: 'Vendor risk assessment',
          description: 'Assess risks from third-party AI vendors',
        },
        {
          collectionId: 'compliance',
          articleId: 'eu-ai-act',
          title: 'EU AI Act compliance',
          description: 'Understand regulatory risk requirements',
        },
      ],
    },
  ],
};
