import type { ArticleContent } from '../../contentTypes';

export const vendorRisksContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Vendor risk assessment looks at the risks that come from relying on third-party providers for AI capabilities. When you use external AI services, models or platforms, you inherit risks from those relationships, and they\'re different from the risks of systems you build and control yourself.',
    },
    {
      type: 'paragraph',
      text: 'Third-party AI creates dependencies that can affect your compliance, security and operations. A vendor security breach could expose your data. A vendor going out of business could disrupt your services. Changes to a vendor\'s model could alter your system\'s behavior in unexpected ways. You need to understand and manage these risks.',
    },
    {
      type: 'heading',
      id: 'why-assess-vendor-risks',
      level: 2,
      text: 'Why assess vendor risks?',
    },
    {
      type: 'paragraph',
      text: 'Vendor risk assessment helps you:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Maintain compliance', text: 'Under regulations like the EU AI Act, you remain responsible for AI systems even when using third-party components' },
        { bold: 'Protect sensitive data', text: 'Knowing what data flows to vendors helps you make better decisions about data sharing' },
        { bold: 'Plan for continuity', text: 'Spotting critical vendor dependencies helps you prepare contingency plans' },
        { bold: 'Prioritize oversight', text: 'Risk scores help you focus review efforts on the vendors that matter most' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Vendor risk scores are calculated based on the scorecard fields on each vendor record. Update these fields regularly to maintain accurate risk profiles.',
    },
    {
      type: 'heading',
      id: 'scorecard-dimensions',
      level: 2,
      text: 'Scorecard dimensions',
    },
    {
      type: 'image',
      src: '/images/user-guide/vendor-scorecard.png',
      alt: 'Vendor scorecard advanced section showing dropdown fields for data sensitivity, business criticality, past issues, and regulatory exposure',
      caption: 'The vendor scorecard captures risk factors to calculate an overall risk score.',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise assesses vendor risk across four dimensions:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Database',
          title: 'Data sensitivity',
          description: 'The sensitivity level of data shared with or processed by the vendor.',
        },
        {
          icon: 'AlertTriangle',
          title: 'Business criticality',
          description: 'How critical the vendor is to your core business operations.',
        },
        {
          icon: 'Clock',
          title: 'Past issues',
          description: 'Historical incidents or problems with this vendor relationship.',
        },
        {
          icon: 'Scale',
          title: 'Regulatory exposure',
          description: 'Which regulations apply to this vendor relationship.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'data-sensitivity-assessment',
      level: 2,
      text: 'Assessing data sensitivity',
    },
    {
      type: 'paragraph',
      text: 'Higher data sensitivity increases vendor risk. Classify the most sensitive data shared with the vendor:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'None', text: 'No sensitive data (lowest risk)' },
        { bold: 'Internal only', text: 'Internal business data' },
        { bold: 'Personally identifiable information (PII)', text: 'Names, emails, identifiers and other personal data' },
        { bold: 'Financial data', text: 'Financial records, transactions or payment information' },
        { bold: 'Health data (e.g. HIPAA)', text: 'Health and medical information subject to privacy regulation' },
        { bold: 'Model weights or AI assets', text: 'Proprietary model parameters or training data (highest risk)' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Minimize data shared with vendors when possible. Consider data anonymization or synthetic data for development and testing environments.',
    },
    {
      type: 'heading',
      id: 'criticality-assessment',
      level: 2,
      text: 'Assessing business criticality',
    },
    {
      type: 'paragraph',
      text: 'Evaluate how dependent your operations are on this vendor:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Low (vendor supports non-core functions)', text: 'Non-essential services; alternatives are readily available' },
        { bold: 'Medium (affects operations but is replaceable)', text: 'Important but not critical; disruption would be manageable' },
        { bold: 'High (critical to core services or products)', text: 'Disruption would significantly impact business' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Consider these factors when assessing criticality:',
    },
    {
      type: 'checklist',
      items: [
        'Number of projects depending on this vendor',
        'Availability of alternative vendors',
        'Time required to switch providers',
        'Revenue impact if vendor services are unavailable',
      ],
    },
    {
      type: 'heading',
      id: 'past-issues-assessment',
      level: 2,
      text: 'Recording past issues',
    },
    {
      type: 'paragraph',
      text: 'Document any historical incidents with the vendor to inform future risk decisions:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'None', text: 'No known issues (best)' },
        { bold: 'Minor incident (e.g. small delay, minor bug)', text: 'Small issues that were resolved satisfactorily' },
        { bold: 'Major incident (e.g. data breach, legal issue)', text: 'Significant incidents affecting operations or compliance' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Important',
      text: 'A history of major incidents significantly increases vendor risk. Consider whether the vendor has addressed root causes before continuing the relationship.',
    },
    {
      type: 'heading',
      id: 'regulatory-assessment',
      level: 2,
      text: 'Tracking regulatory exposure',
    },
    {
      type: 'paragraph',
      text: 'Identify which regulations apply to your relationship with this vendor:',
    },
    {
      type: 'checklist',
      items: [
        'GDPR, European data protection requirements',
        'HIPAA, US healthcare data requirements',
        'SOC 2, security and availability controls',
        'ISO 27001, information security management',
        'EU AI Act, European AI regulation',
        'CCPA, California consumer privacy',
      ],
    },
    {
      type: 'paragraph',
      text: 'More regulatory exposure means higher risk and more oversight. Make sure vendors can demonstrate compliance with all applicable regulations.',
    },
    {
      type: 'heading',
      id: 'risk-score-calculation',
      level: 2,
      text: 'Understanding risk scores',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise calculates an overall risk score from the scorecard inputs. Higher scores mean greater risk. Things that push the score up include:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Higher data sensitivity levels' },
        { text: 'High business criticality' },
        { text: 'History of past issues' },
        { text: 'Multiple regulatory exposures' },
      ],
    },
    {
      type: 'heading',
      id: 'acting-on-scores',
      level: 2,
      text: 'Acting on risk scores',
    },
    {
      type: 'paragraph',
      text: 'Use risk scores to guide vendor oversight intensity:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Low scores', text: 'Annual reviews; standard monitoring' },
        { bold: 'Medium scores', text: 'Semi-annual reviews; enhanced monitoring' },
        { bold: 'High scores', text: 'Quarterly reviews; active oversight and mitigation planning' },
      ],
    },
    {
      type: 'heading',
      id: 'review-workflow',
      level: 2,
      text: 'Risk review workflow',
    },
    {
      type: 'paragraph',
      text: 'Use the vendor review workflow to track risk assessments:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Assign a reviewer to conduct the assessment' },
        { text: 'Update review status to "In review"' },
        { text: 'Complete the scorecard fields based on current information' },
        { text: 'Document findings in the review result' },
        { text: 'Set status to "Reviewed" or "Requires follow-up"' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Schedule vendor risk reviews based on risk score. High-risk vendors should be reviewed more frequently than low-risk vendors.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'risk-management',
          articleId: 'vendor-management',
          title: 'Vendor management',
          description: 'Manage your complete vendor registry',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'General risk assessment methodology',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-mitigation',
          title: 'Risk mitigation strategies',
          description: 'Implement controls for identified risks',
        },
      ],
    },
  ],
};
