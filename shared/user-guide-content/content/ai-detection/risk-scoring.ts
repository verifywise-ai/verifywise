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
      text: 'The governance score (AGRS) grades scan findings across multiple risk dimensions into a single score (0 to 100) and letter grade (A through F). Higher is better: 100 means no penalties. It gives your team a quick read on the governance risk of a scanned repository.',
    },
    {
      type: 'paragraph',
      text: 'Every completed scan gets a score automatically, whether you started it, it ran on a schedule, or a webhook triggered it. The score appears on the scan completion card, in Scan results and on the scan details page. Turn on LLM-enhanced analysis for written summaries, recommendations and suggested risks.',
    },
    {
      type: 'heading',
      id: 'score-cards',
      level: 2,
      text: 'Score cards',
    },
    {
      type: 'paragraph',
      text: 'Four cards display across the top of the scan details page:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Governance score', text: 'Score from 0 to 100 with a risk label: Low risk (80+), Moderate risk (60 to 79), or High risk (below 60). A partial score shows why instead (see below).' },
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
        { bold: 'Data sovereignty', text: 'Penalized when data goes to external cloud APIs. High-risk library imports, calls to external providers and hardcoded secrets all count.' },
        { bold: 'Transparency', text: 'Penalized when AI usage is poorly documented or hard to audit. Undocumented model references, missing licenses and low-confidence findings add up.' },
        { bold: 'Security', text: 'Penalized by model file vulnerabilities, hardcoded credentials and security findings. Severity (Critical, High, Medium, Low) determines penalty weight.' },
        { bold: 'Autonomy', text: 'Penalized when autonomous AI agents show up. Agent frameworks, MCP servers and tool-using agents increase this dimension\'s risk.' },
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
      id: 'partial-score',
      level: 2,
      text: 'Partial scores',
    },
    {
      type: 'paragraph',
      text: 'LLM vulnerability checks feed the score. When they didn\'t run for a scan, the score only reflects the rest of the findings, so it\'s marked partial. The score card says why, for example **Partial: vulnerability checks off**, and links to the setting. The grade stays visible, labelled **Grade (partial)**, and Scan results shows a **Partial** marker next to the score.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Vulnerability checks off', text: 'Vulnerability detection is off or hasn\'t been turned on yet, AI detection has no LLM key, or every vulnerability type is turned off. Turn it on in **AI Detection → Settings → Risk scoring**, then scan again.' },
        { bold: 'Vulnerability checks didn\'t finish', text: 'The checks were on but the LLM analysis failed for some or all vulnerability types, for example because the key no longer works. Findings from the types that finished are still listed, but the scan wasn\'t fully checked.' },
        { bold: 'Changed files not checked for vulnerabilities', text: 'Incremental scans don\'t run the checks. Vulnerability findings for unchanged files carry over from the last full scan; changed files weren\'t checked. Run a full scan for a complete score. When vulnerability detection is off, an incremental scan is marked **vulnerability checks off** instead.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Scans made before this was recorded have no partial marker, because the app can\'t tell whether their checks ran.',
    },
    {
      type: 'heading',
      id: 'calculating',
      level: 2,
      text: 'Recalculating the score',
    },
    {
      type: 'paragraph',
      text: 'The rule-based score is calculated as the last step of each scan. If it couldn\'t be calculated, the score card says so. On the scan details page, click **Recalculate score** to calculate it again. It takes a moment and the page stays usable while it runs.',
    },
    {
      type: 'paragraph',
      text: 'Recalculate whenever you want, for example after enabling LLM analysis, adjusting dimension weights or changing finding statuses. The old score gets replaced. Recalculating doesn\'t rerun vulnerability checks; scan again for that.',
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
      text: 'LLM analysis runs in the background after the rule-based score is saved, so it never holds up a scan. While it runs, the score card reads **AI analysis is running** and the page refreshes the score when it finishes, on the scan details page and on the scan page right after a scan. **Recalculate score** is unavailable until it finishes, so each analysis is paid for once. If it doesn\'t finish, the card says so and the rule-based score stays.',
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
      text: 'Click **Add to risk register** on any suggestion to open the risk form with pre-filled values (name, description, category, lifecycle phase, likelihood, severity, impact and mitigation plan). Adjust as needed, then save.',
    },
    {
      type: 'paragraph',
      text: 'The review notes field gets filled in automatically with a reference to the scan (for example "Suggested by AI Detection scan #12 (acme/app).") and the findings behind the suggestion.',
    },
    {
      type: 'paragraph',
      text: 'When you save, the risk is created and linked to the suggestion in one step, and the link is saved on the scan, so it stays handled after a reload. A suggestion that is already linked to a risk can\'t be added again: if someone else added it in the meantime, you see a message and the suggestion shows as added. If that risk is later deleted, the suggestion is offered again.',
    },
    {
      type: 'heading',
      id: 'dismissing-suggestions',
      level: 3,
      text: 'Ignoring suggestions',
    },
    {
      type: 'paragraph',
      text: 'Click **Ignore** on a suggestion and pick a reason: "This has already been added before" or "This is not a real risk". The reason is saved with the suggestion. Ignoring a suggestion doesn\'t change the score. **Ignore**, **Restore** and **Add to risk register** are shown only to users whose role can edit AI Detection; **Add to risk register** also needs permission to edit risks.',
    },
    {
      type: 'heading',
      id: 'handled-suggestions',
      level: 3,
      text: 'Added and ignored suggestions',
    },
    {
      type: 'paragraph',
      text: 'Handled suggestions are summarised in one line, such as "2 added to the risk register, 1 ignored". Click **Show added** to see the added ones, each marked "Added to risk register" with a **View risk** link that opens the risk. Click **Show ignored** to see the ignored ones with their reason; click **Restore** to bring an ignored suggestion back to the list.',
    },
    {
      type: 'paragraph',
      text: 'This record belongs to the scan. A new scan of the same repository gets its own suggestions, so check the risk register before adding one that looks familiar.',
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
          description: 'Configure LLM analysis, vulnerability detection and dimension weights',
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
