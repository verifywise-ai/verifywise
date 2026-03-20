import type { ArticleContent } from '../../contentTypes';

export const riskScoringContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The AI Governance Risk Score (AGRS) grades scan findings across multiple risk dimensions into a single score (0 to 100) and letter grade (A through F). It gives your team a quick read on the governance risk of a scanned repository.',
    },
    {
      type: 'paragraph',
      text: 'Scores show up on the scan details page after a scan finishes. You can calculate the score manually, or turn on LLM-enhanced analysis for written summaries, recommendations, and suggested risks.',
    },
    {
      type: 'heading',
      id: 'score-cards',
      level: 2,
      text: 'Score cards',
    },
    {
      type: 'paragraph',
      text: 'Once calculated, four cards display across the top of the scan details page:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Overall score', text: 'Score from 0 to 100 with a risk label: Low risk (80+), Moderate risk (60 to 79), or High risk (below 60)' },
        { bold: 'Grade', text: 'Letter grade from A (Excellent) to F (Critical), with the calculation timestamp' },
        { bold: 'Dimensions at risk', text: 'Count of dimensions scoring below the 70-point threshold' },
        { bold: 'Dimension breakdown', text: 'Horizontal progress bars showing the score for each risk dimension' },
      ],
    },
    {
      type: 'heading',
      id: 'risk-dimensions',
      level: 2,
      text: 'Risk dimensions',
    },
    {
      type: 'paragraph',
      text: 'The score is made up of 5 weighted dimensions. Each starts at 100 and gets penalties based on what the scan finds. The engine treats **inventory items** (libraries, dependencies, API calls) differently from **risk indicators** (secrets, vulnerabilities). Inventory items only penalize when they\'re medium or high risk; low-risk ones are informational and don\'t affect the score. Vulnerability findings always count.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Data sovereignty', text: 'Penalized when data goes to external cloud APIs. High-risk library imports, calls to external providers, and hardcoded secrets all count.' },
        { bold: 'Transparency', text: 'Penalized when AI usage is poorly documented or hard to audit. Undocumented model references, missing licenses, and low-confidence findings add up.' },
        { bold: 'Security', text: 'Penalized by model file vulnerabilities, hardcoded credentials, and security findings. Severity (Critical, High, Medium, Low) determines penalty weight.' },
        { bold: 'Autonomy', text: 'Penalized when autonomous AI agents show up. Agent frameworks, MCP servers, and tool-using agents increase this dimension\'s risk.' },
        { bold: 'Supply chain', text: 'Penalized by external dependencies and 3rd-party AI components. Libraries with restrictive licenses, many external providers, and RAG components add to it.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Hover over any dimension bar in the breakdown card to see the top contributors to that dimension\'s penalties.',
    },
    {
      type: 'heading',
      id: 'grades',
      level: 2,
      text: 'Grade scale',
    },
    {
      type: 'table',
      columns: [
        { key: 'grade', label: 'Grade', width: '80px' },
        { key: 'range', label: 'Score range', width: '120px' },
        { key: 'label', label: 'Label' },
      ],
      rows: [
        { grade: 'A', range: '90 to 100', label: 'Excellent: minimal governance risk' },
        { grade: 'B', range: '75 to 89', label: 'Good: low governance risk' },
        { grade: 'C', range: '60 to 74', label: 'Moderate: some areas need attention' },
        { grade: 'D', range: '40 to 59', label: 'Poor: significant governance gaps' },
        { grade: 'F', range: '0 to 39', label: 'Critical: immediate action needed' },
      ],
    },
    {
      type: 'heading',
      id: 'calculating',
      level: 2,
      text: 'Calculating the score',
    },
    {
      type: 'paragraph',
      text: 'On the scan details page, click **Calculate risk score** (or **Recalculate score** if one already exists). A progress dialog walks through each step. The score is saved with the scan and shows up on future visits.',
    },
    {
      type: 'paragraph',
      text: 'You can recalculate whenever you want, for example after enabling LLM analysis or adjusting dimension weights. The old score gets replaced.',
    },
    {
      type: 'heading',
      id: 'llm-analysis',
      level: 2,
      text: 'LLM-enhanced analysis',
    },
    {
      type: 'paragraph',
      text: 'When enabled in **AI Detection → Settings → Risk scoring**, the scoring engine sends anonymized finding summaries to your configured LLM. The LLM returns:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Narrative summary', text: 'A written analysis of the repo\'s risk posture, with key concerns called out in bold' },
        { bold: 'Recommendations', text: 'Specific steps to improve the score' },
        { bold: 'Dimension adjustments', text: 'Score tweaks based on context that rule-based scoring alone would miss' },
        { bold: 'Suggested risks', text: 'Risk suggestions you can add to your risk register' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The analysis section appears below the score cards. Click the chevron to expand or collapse it.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'LLM analysis needs an LLM key configured in **Settings → LLM keys**. It uses your organization\'s own API key; no scan data is stored by the LLM provider.',
    },
    {
      type: 'heading',
      id: 'suggested-risks',
      level: 2,
      text: 'Suggested risks',
    },
    {
      type: 'paragraph',
      text: 'With LLM analysis on, the system may suggest specific risks based on what the scan found. These show up in a collapsible "Suggested risks" section below the analysis.',
    },
    {
      type: 'paragraph',
      text: 'Each suggestion includes:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Risk name', text: 'Short title for the risk' },
        { bold: 'Risk dimension', text: 'Which AGRS dimension it relates to' },
        { bold: 'Risk level', text: 'Likelihood and severity' },
        { bold: 'Description', text: 'What the risk is and what it could affect' },
        { bold: 'Risk categories', text: 'Tags like Cybersecurity risk, Compliance risk, etc.' },
      ],
    },
    {
      type: 'heading',
      id: 'adding-to-register',
      level: 3,
      text: 'Adding a suggestion to the risk register',
    },
    {
      type: 'paragraph',
      text: 'Click **Add to risk register** on any suggestion to open the risk form with pre-filled values (name, description, category, lifecycle phase, likelihood, severity, impact, and mitigation plan). Adjust as needed, then save.',
    },
    {
      type: 'paragraph',
      text: 'The review notes field gets filled in automatically with a reference to the scan and the findings behind the suggestion.',
    },
    {
      type: 'heading',
      id: 'dismissing-suggestions',
      level: 3,
      text: 'Dismissing suggestions',
    },
    {
      type: 'paragraph',
      text: 'Click **Ignore** on a suggestion to dismiss it. Pick a reason ("Not relevant" or "Already mitigated") from the dropdown. Dismissed suggestions are hidden but don\'t affect the score.',
    },
    {
      type: 'heading',
      id: 'cross-referencing',
      level: 2,
      text: 'Cross-referencing findings',
    },
    {
      type: 'paragraph',
      text: 'After a scan finishes, the system cross-references vulnerability findings with non-vulnerability findings (libraries, agents, security) in the same files. Matched findings get a teal "Cross-ref" badge in the Vulnerabilities tab, so you can see related detections together. For example, a prompt injection finding in the same file as a LangChain library finding.',
    },
    {
      type: 'heading',
      id: 'dimension-weights',
      level: 2,
      text: 'Customizing dimension weights',
    },
    {
      type: 'paragraph',
      text: 'Go to **AI Detection → Settings → Risk scoring** to adjust dimension weights. Use the sliders to shift weight between dimensions (they must total 100%). Click **Save**, then recalculate existing scores to apply the new weights.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Weight customization',
      text: 'Set weights to match what matters most to your organization. For example, bump Security if vulnerability management is the priority, or increase Data sovereignty if data residency is a regulatory concern.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-detection',
          articleId: 'scanning',
          title: 'Scanning repositories',
          description: 'How to scan repositories for AI/ML usage',
        },
        {
          collectionId: 'ai-detection',
          articleId: 'settings',
          title: 'AI Detection settings',
          description: 'Configure LLM analysis and dimension weights',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'Learn about the risk register and risk management workflow',
        },
      ],
    },
  ],
};
