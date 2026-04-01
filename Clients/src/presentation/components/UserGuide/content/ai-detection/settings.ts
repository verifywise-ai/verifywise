import type { ArticleContent } from '@user-guide-content/contentTypes';

export const aiDetectionSettingsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'AI Detection settings',
    },
    {
      type: 'paragraph',
      text: 'The Settings page has 2 tabs: **GitHub integration** for repository access tokens, and **Risk scoring** for LLM-enhanced analysis, dimension weights, and vulnerability detection types.',
    },
    {
      type: 'heading',
      id: 'github-integration',
      level: 2,
      text: 'GitHub integration',
    },
    {
      type: 'paragraph',
      text: 'To scan private repositories, you need a GitHub Personal Access Token. Without a token, AI Detection can only scan public repositories.',
    },
    {
      type: 'heading',
      id: 'creating-token',
      level: 3,
      text: 'Creating a token',
    },
    {
      type: 'paragraph',
      text: 'Click the **Create a new token on GitHub** link to open GitHub\'s token creation page with the recommended scopes pre-selected:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'repo', text: 'Full access to private and public repositories. Required for scanning private repos.' },
        { bold: 'public_repo', text: 'Access to public repositories only. Use this if you only need to scan public repos.' },
      ],
    },
    {
      type: 'heading',
      id: 'saving-token',
      level: 3,
      text: 'Saving your token',
    },
    {
      type: 'paragraph',
      text: 'Paste your token into the **Personal access token** field. Optionally give it a descriptive name (e.g., "VerifyWise Scanner Token") to help identify it later. Click **Test token** to verify it works, then **Save token** to store it.',
    },
    {
      type: 'heading',
      id: 'managing-token',
      level: 3,
      text: 'Managing your token',
    },
    {
      type: 'paragraph',
      text: 'Once a token is configured, you\'ll see a status indicator showing it\'s active. You can update the token at any time by entering a new one and clicking **Update token**. To remove the token entirely, click the delete button.',
    },
    {
      type: 'callout',
      text: 'Tokens are stored encrypted on the server and aren\'t exposed in the browser after saving.',
    },
    {
      type: 'heading',
      id: 'risk-scoring',
      level: 2,
      text: 'Risk scoring',
    },
    {
      type: 'paragraph',
      text: 'The Risk scoring tab controls how the AI Governance Risk Score (AGRS) is calculated for your scans.',
    },
    {
      type: 'heading',
      id: 'llm-enhanced-analysis',
      level: 3,
      text: 'LLM-enhanced analysis',
    },
    {
      type: 'paragraph',
      text: 'Toggle **LLM-enhanced analysis** on to enable AI-powered scoring. The risk scoring engine will send anonymized finding summaries to your configured LLM, which produces a written analysis, recommendations, and suggested risks.',
    },
    {
      type: 'paragraph',
      text: 'Select which LLM key to use from the dropdown. LLM keys are managed in **Settings → LLM keys** at the organization level. If no keys are configured, the dropdown shows a message directing you to set one up.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Without LLM enhancement, risk scores use rule-based analysis only. The score is still accurate but won\'t include written summaries, recommendations, or suggested risks.',
    },
    {
      type: 'heading',
      id: 'dimension-weights',
      level: 3,
      text: 'Dimension weights',
    },
    {
      type: 'paragraph',
      text: 'Use the sliders to control how much each risk dimension contributes to the overall score. The 5 dimensions:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Data sovereignty', text: 'Weight for external data exposure and cloud API usage' },
        { bold: 'Transparency', text: 'Weight for documentation quality and audit readiness' },
        { bold: 'Security', text: 'Weight for vulnerabilities and credential exposure' },
        { bold: 'Autonomy', text: 'Weight for autonomous AI agent detection' },
        { bold: 'Supply chain', text: 'Weight for third-party dependencies and licensing' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Weights must total 100%. A validation message shows if they don\'t. Click **Reset to defaults** to go back to the original distribution. After changing weights, click **Save** and recalculate existing scores to apply them.',
    },
    {
      type: 'heading',
      id: 'vulnerability-types',
      level: 3,
      text: 'Vulnerability type toggles',
    },
    {
      type: 'paragraph',
      text: 'When LLM-enhanced analysis is on, a **Vulnerability detection** section appears with toggles for each OWASP LLM Top 10 type. Turn individual types on or off based on what matters to your team:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Prompt injection (LLM01)', text: 'Detect untrusted input concatenated into LLM prompts' },
        { bold: 'Insecure output handling (LLM02)', text: 'Detect LLM output passed to dangerous sinks' },
        { bold: 'Training data poisoning (LLM03)', text: 'Detect insecure model deserialization and untrusted sources' },
        { bold: 'Model denial of service (LLM04)', text: 'Detect missing token limits and timeouts' },
        { bold: 'Supply chain (LLM05)', text: 'Detect unpinned versions and untrusted model URLs' },
        { bold: 'Sensitive info disclosure (LLM06)', text: 'Detect PII and credentials passed to LLM context' },
        { bold: 'Insecure plugin design (LLM07)', text: 'Detect tools without input validation or schemas' },
        { bold: 'Excessive agency (LLM08)', text: 'Detect agents with overly broad access and no human oversight' },
        { bold: 'Overreliance (LLM09)', text: 'Detect missing human review and confidence thresholds' },
        { bold: 'Model theft (LLM10)', text: 'Detect exposed model files and unauthenticated endpoints' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Disabled types are skipped during LLM analysis, which cuts scan time and API costs. The regex pre-filter still runs for all types regardless.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Reducing noise',
      text: 'If certain types keep producing false positives for your codebase, turn them off here so you can focus on what\'s actually relevant.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-detection',
          articleId: 'risk-scoring',
          title: 'Risk scoring',
          description: 'Understanding the AI Governance Risk Score and suggested risks',
        },
        {
          collectionId: 'ai-detection',
          articleId: 'repositories',
          title: 'Repositories',
          description: 'Register and schedule repository scans',
        },
      ],
    },
  ],
};
