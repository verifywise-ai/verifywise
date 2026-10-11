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
      type: 'heading',
      id: 'research-findings',
      level: 2,
      text: 'Research findings',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise can research a vendor on the web for you. An agent searches public sources for four kinds of risk: security incidents, certification gaps, legal and regulatory actions, and AI-specific risks such as customer data being used to train models. It starts by itself when you add a vendor (whoever runs your VerifyWise server can turn this off), and you can start it again whenever you like. When a run that started by itself finds something, the vendor\'s assignee gets a notification. The results appear as findings in the **Research findings** section on the **Risks** tab of the Vendors page, and nothing is added to your vendor risk register until you accept it.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Check before you accept',
      text: 'Findings are AI-suggested from web sources, so they can be wrong. Each one shows the risk, its impact and an action plan, which Accept copies into your register as written, and lists its sources with a quote from each, and a confidence level. Read all three texts, open the sources and check that they are about your vendor and say what the finding claims.',
    },
    {
      type: 'paragraph',
      text: 'For each finding, and for the research itself, you can:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Accept', text: 'Adds the finding to the vendor risk register as a normal vendor risk. The vendor\'s assignee becomes its action owner, if the assignee is a user of your organization. You can edit it afterwards like any other risk' },
        { bold: 'Dismiss', text: 'Removes the finding from the list. Choose a reason and, if you like, add a note. Similar findings are not suggested again' },
        { bold: 'Research again', text: 'Choose a vendor in the section\'s vendor filter to see what its latest run found in each category, including where it found nothing, and to start a new run. The microscope icon ("Research risks") in a vendor\'s row on the Vendors tab starts a run too, and the Risks tab then opens on that vendor so that you can follow it. While a run is working the section updates by itself for about two minutes. If it is still working after that, the section says "Still running. Check back later." and **Check again** looks again and, if the run is still working, keeps updating for another two minutes' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Admins and Editors can accept, dismiss and start research. Reviewers and Auditors can see the findings but not change them. By default a vendor can be researched again 10 minutes after its last run, and an organization can start 50 runs in 24 hours.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Setup',
      text: 'Research needs a web search provider and an LLM key. Whoever runs your VerifyWise server sets the search provider and its key in the server environment (`VENDOR_RESEARCH_SEARCH_PROVIDER` and `TAVILY_API_KEY`), and an Admin adds an LLM key under **Settings → API Keys**, in the LLM Keys section. Until both are in place, the section says vendor research is not set up and the research buttons are disabled.',
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
