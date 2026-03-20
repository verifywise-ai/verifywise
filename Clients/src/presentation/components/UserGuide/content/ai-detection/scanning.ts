import type { ArticleContent } from '@user-guide-content/contentTypes';

export const scanningContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'AI Detection scans GitHub repositories for AI and machine learning usage in your codebase. It finds "shadow AI" (AI usage that hasn\'t been formally documented or approved) and keeps an inventory of detected AI technologies.',
    },
    {
      type: 'paragraph',
      text: 'The scanner checks source files, dependency manifests, CI/CD workflows, container definitions, and model files against 100+ AI/ML patterns (OpenAI, TensorFlow, PyTorch, LangChain, etc.). A 2-phase LLM vulnerability pipeline also checks for the 10 OWASP LLM Top 10 vulnerability types. All results are stored and can be reviewed from the scan results page.',
    },
    {
      type: 'heading',
      id: 'starting-scan',
      level: 2,
      text: 'Starting a scan',
    },
    {
      type: 'paragraph',
      text: 'To scan a repository, enter the GitHub URL in the input field. You can use either the full URL format (`https://github.com/owner/repo`) or the short format (`owner/repo`). Click **Scan** to begin the analysis.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'By default, only public repositories can be scanned. To scan private repositories, configure a GitHub Personal Access Token in **AI Detection → Settings**.',
    },
    {
      type: 'image',
      src: '/images/user-guide/ai-detection-scan-page.png',
      alt: 'AI Detection scan page with repository URL input field',
      caption: 'Enter a GitHub repository URL to start scanning',
    },
    {
      type: 'heading',
      id: 'scan-progress',
      level: 2,
      text: 'Scan progress',
    },
    {
      type: 'paragraph',
      text: 'The scan runs through a few stages. A progress indicator shows which file is being analyzed, how many files have been processed, and how many findings have been found so far.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Cloning', text: 'Downloads the repository to a temporary cache' },
        { bold: 'Scanning', text: 'Analyzes files for AI/ML patterns and security issues' },
        { bold: 'Completed', text: 'Results are ready for review' },
      ],
    },
    {
      type: 'paragraph',
      text: 'You can cancel an in-progress scan at any time by clicking **Cancel**. The partial results are discarded and the scan is marked as cancelled in the history.',
    },
    {
      type: 'image',
      src: '/images/user-guide/ai-detection-scan-progress.png',
      alt: 'Scan progress indicator showing files being analyzed',
      caption: 'Real-time progress shows current file, total processed, and findings discovered',
    },
    {
      type: 'heading',
      id: 'statistics-dashboard',
      level: 2,
      text: 'Statistics dashboard',
    },
    {
      type: 'paragraph',
      text: 'The scan page shows statistics about your AI Detection activity in card form:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Total scans', text: 'Number of scans performed, with a count of completed scans' },
        { bold: 'Repositories', text: 'Unique repositories that have been scanned' },
        { bold: 'Total findings', text: 'Total AI/ML detections across all scans' },
        { bold: 'Libraries', text: 'AI/ML library imports and dependencies detected' },
        { bold: 'API calls', text: 'Direct API calls to AI providers (OpenAI, Anthropic, etc.)' },
        { bold: 'Security issues', text: 'Hardcoded secrets and model file vulnerabilities' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Statistics are only displayed after you have completed at least one scan. The dashboard automatically updates as new scans are completed.',
    },
    {
      type: 'heading',
      id: 'understanding-results',
      level: 2,
      text: 'Understanding results',
    },
    {
      type: 'paragraph',
      text: 'Scan results are organized into nine tabs covering different aspects of AI/ML usage in your codebase:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Libraries', text: 'Detected AI/ML frameworks and packages' },
        { bold: 'Vulnerabilities', text: 'OWASP LLM Top 10 vulnerability findings detected via 2-phase LLM analysis' },
        { bold: 'API calls', text: 'Direct integrations with AI provider APIs' },
        { bold: 'Models', text: 'References to AI/ML model files and pre-trained models' },
        { bold: 'RAG', text: 'Retrieval-Augmented Generation components and vector databases' },
        { bold: 'Agents', text: 'AI agent frameworks and autonomous system components' },
        { bold: 'Secrets', text: 'Hardcoded API keys and credentials' },
        { bold: 'Security', text: 'Model file vulnerabilities and security issues' },
        { bold: 'Compliance', text: 'EU AI Act compliance mapping and checklist' },
      ],
    },
    {
      type: 'heading',
      id: 'libraries-tab',
      level: 3,
      text: 'Libraries tab',
    },
    {
      type: 'paragraph',
      text: 'The Libraries tab lists all detected AI/ML technologies. Each row shows the library name, provider, risk level, confidence, and file count. Click a row to see specific file paths and line numbers. The scanner checks source imports, dependency manifests, Dockerfiles, and docker-compose files.',
    },
    {
      type: 'paragraph',
      text: 'Risk levels indicate the potential data exposure:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'High risk', text: 'Data is sent to external cloud APIs. Potential for data leakage and compliance issues.' },
        { bold: 'Medium risk', text: 'Can connect to cloud APIs depending on how it\'s configured. Check your usage.' },
        { bold: 'Low risk', text: 'Runs locally. Data stays on your infrastructure.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Confidence levels indicate detection certainty:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'High', text: 'Direct match, like an explicit import or dependency declaration' },
        { bold: 'Medium', text: 'Likely match but with some ambiguity (generic utility imports, etc.)' },
        { bold: 'Low', text: 'Possible match; needs manual verification' },
      ],
    },
    {
      type: 'heading',
      id: 'governance-status',
      level: 3,
      text: 'Governance status',
    },
    {
      type: 'paragraph',
      text: 'You can assign a governance status to any library finding to track your review. Click the status icon on a row to change it:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Reviewed', text: 'Finding has been examined but no decision made yet' },
        { bold: 'Approved', text: 'Usage is authorized and compliant with organization policies' },
        { bold: 'Flagged', text: 'Requires attention or is not approved for use' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/ai-detection-libraries-tab.png',
      alt: 'Libraries tab showing detected AI/ML frameworks with risk and confidence levels',
      caption: 'Detected AI/ML libraries with provider, risk level, confidence, and governance status',
    },
    {
      type: 'heading',
      id: 'vulnerabilities-tab',
      level: 3,
      text: 'Vulnerabilities tab',
    },
    {
      type: 'paragraph',
      text: 'The Vulnerabilities tab shows findings from the 2-phase LLM vulnerability pipeline. Phase 1 runs a regex pre-filter against known patterns. Phase 2 sends candidates to an LLM for analysis using type-specific rubric prompts.',
    },
    {
      type: 'paragraph',
      text: 'It covers all 10 OWASP LLM Top 10 vulnerability types:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'LLM01: Prompt injection', text: 'Untrusted input concatenated into prompts without sanitization' },
        { bold: 'LLM02: Insecure output handling', text: 'LLM output passed to dangerous sinks (eval, SQL, shell commands)' },
        { bold: 'LLM03: Training data poisoning', text: 'Insecure deserialization or untrusted model sources' },
        { bold: 'LLM04: Model denial of service', text: 'Missing token limits, timeouts, or rate limiting on LLM calls' },
        { bold: 'LLM05: Supply chain', text: 'Unpinned dependency versions, untrusted model URLs, missing checksum validation' },
        { bold: 'LLM06: Sensitive info disclosure', text: 'PII, session tokens, or credentials passed to LLM context' },
        { bold: 'LLM07: Insecure plugin design', text: 'Tools or plugins that accept raw input without validation or schemas' },
        { bold: 'LLM08: Excessive agency', text: 'Agents with broad tool access, no human-in-the-loop, auto-approve patterns' },
        { bold: 'LLM09: Overreliance', text: 'No human review, no confidence thresholds, silent failures without fallbacks' },
        { bold: 'LLM10: Model theft', text: 'Model files in public directories or served without authentication' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Each finding shows severity, confidence, a description, and a suggested fix. Findings that share file paths with library, agent, or security findings get a cross-reference badge so you can see related detections together.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'LLM vulnerability detection needs an LLM key configured and vulnerability scanning enabled in **AI Detection → Settings**. Without it, only the regex pre-filter runs, and findings may be less accurate.',
    },
    {
      type: 'heading',
      id: 'api-calls-tab',
      level: 3,
      text: 'API Calls tab',
    },
    {
      type: 'paragraph',
      text: 'The API Calls tab shows direct calls to AI provider APIs found in your code, like OpenAI, Anthropic, and Google AI.',
    },
    {
      type: 'paragraph',
      text: 'API call findings include:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'REST API endpoints', text: 'Direct HTTP calls to AI provider APIs (e.g., api.openai.com)' },
        { bold: 'SDK method calls', text: 'Usage of official SDKs (e.g., openai.chat.completions.create() or client.chat.completions.create())' },
        { bold: 'Framework integrations', text: 'LangChain, LlamaIndex, and other framework API calls' },
        { bold: 'CI/CD pipeline usage', text: 'AI service secrets referenced in GitHub Actions workflows (e.g., ${{ secrets.OPENAI_API_KEY }})' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'All API call findings are marked as high confidence since they indicate direct integration with AI services.',
    },
    {
      type: 'heading',
      id: 'secrets-tab',
      level: 3,
      text: 'Secrets tab',
    },
    {
      type: 'paragraph',
      text: 'The Secrets tab finds hardcoded API keys and credentials in your code. Move these to environment variables or a secrets manager.',
    },
    {
      type: 'paragraph',
      text: 'The scanner detects common AI provider API key patterns:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'OpenAI API keys', text: 'Keys starting with sk-...' },
        { bold: 'Anthropic API keys', text: 'Keys starting with sk-ant-...' },
        { bold: 'Google AI API keys', text: 'Keys starting with AIza...' },
        { bold: 'Other provider keys', text: 'AWS, Azure, Cohere, and other AI service credentials' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Security risk',
      text: 'Hardcoded secrets get exposed if the repository goes public or is accessed by someone it shouldn\'t be. Rotate any exposed credentials right away.',
    },
    {
      type: 'heading',
      id: 'security-tab',
      level: 3,
      text: 'Security tab',
    },
    {
      type: 'paragraph',
      text: 'The Security tab shows findings from model file analysis. Serialized model files (`.pkl`, `.pt`, `.h5`) can contain malicious code that runs when loaded. The scanner looks for system command execution, network access, and code injection patterns.',
    },
    {
      type: 'paragraph',
      text: 'Security findings include severity levels and compliance references:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Critical', text: 'Direct code execution risk. Investigate immediately.' },
        { bold: 'High', text: 'Indirect execution or data exfiltration risk' },
        { bold: 'Medium', text: 'Potentially dangerous depending on context' },
        { bold: 'Low', text: 'Informational, minimal risk' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Security risk',
      text: 'Don\'t load model files flagged as Critical until you\'ve verified them. Malicious models can run arbitrary code on your system when loaded with standard ML frameworks.',
    },
    {
      type: 'image',
      src: '/images/user-guide/ai-detection-security-tab.png',
      alt: 'Security tab showing model file vulnerabilities with severity levels',
      caption: 'Security findings with severity, CWE references, and OWASP ML Top 10 mappings',
    },
    {
      type: 'heading',
      id: 'models-tab',
      level: 3,
      text: 'Models tab',
    },
    {
      type: 'paragraph',
      text: 'The Models tab lists AI/ML model file references found in your code: pre-trained models, checkpoints, and model loading patterns.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Pre-trained models', text: 'References to Hugging Face models, OpenAI models, and other hosted models' },
        { bold: 'Local model files', text: 'Model weights stored in the repository (.pt, .h5, .onnx, etc.)' },
        { bold: 'Model loading code', text: 'Code that loads or initializes ML models' },
      ],
    },
    {
      type: 'heading',
      id: 'rag-tab',
      level: 3,
      text: 'RAG tab',
    },
    {
      type: 'paragraph',
      text: 'The RAG (Retrieval-Augmented Generation) tab lists components used in RAG systems, which combine retrieval with generative AI.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Vector databases', text: 'Integrations with Pinecone, Qdrant, Chroma, Weaviate, and other vector stores' },
        { bold: 'Embedding models', text: 'Code that generates embeddings for documents or queries' },
        { bold: 'Retrieval pipelines', text: 'LangChain retrievers, LlamaIndex query engines, and similar patterns' },
      ],
    },
    {
      type: 'heading',
      id: 'agents-tab',
      level: 3,
      text: 'Agents tab',
    },
    {
      type: 'paragraph',
      text: 'The Agents tab shows AI agent frameworks and autonomous system components found in the repo.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Agent frameworks', text: 'LangChain agents, CrewAI (including @agent and @crew decorators), AutoGen, Swarm, and similar frameworks' },
        { bold: 'MCP servers', text: 'Model Context Protocol server implementations and configuration files (mcp.json, claude_desktop_config.json)' },
        { bold: 'Tool usage', text: 'Code that defines or uses tools for AI agents' },
        { bold: 'Planning components', text: 'Task planning and execution orchestration code' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'AI agents often have access to external systems and data. Review agent implementations for security and compliance issues.',
    },
    {
      type: 'heading',
      id: 'compliance-tab',
      level: 3,
      text: 'Compliance tab',
    },
    {
      type: 'paragraph',
      text: 'The Compliance tab maps scan findings to EU AI Act requirements and generates a checklist based on the AI technologies found in your code.',
    },
    {
      type: 'paragraph',
      text: 'The compliance mapping covers key requirement categories:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Transparency', text: 'Requirements for disclosing AI system usage and capabilities' },
        { bold: 'Data governance', text: 'Requirements for data quality, bias prevention, and privacy' },
        { bold: 'Documentation', text: 'Technical documentation and record-keeping obligations' },
        { bold: 'Human oversight', text: 'Requirements for human supervision of AI systems' },
        { bold: 'Security', text: 'Cybersecurity and resilience requirements' },
      ],
    },
    {
      type: 'heading',
      id: 'infrastructure-detection',
      level: 2,
      text: 'Infrastructure and CI/CD detection',
    },
    {
      type: 'paragraph',
      text: 'The scanner also checks infrastructure and CI/CD config files, catching AI usage that lives in deployment pipelines and containers rather than application code.',
    },
    {
      type: 'heading',
      id: 'github-actions',
      level: 3,
      text: 'GitHub Actions workflows',
    },
    {
      type: 'paragraph',
      text: 'YAML workflow files (.yml, .yaml) are checked for AI service references: GitHub Actions that call AI providers, and secrets like OPENAI_API_KEY or ANTHROPIC_API_KEY in workflow environment variables.',
    },
    {
      type: 'heading',
      id: 'docker-containers',
      level: 3,
      text: 'Docker and container images',
    },
    {
      type: 'paragraph',
      text: 'Dockerfiles and docker-compose files are scanned for AI/ML container images. Detected images include:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'GPU compute', text: 'NVIDIA CUDA and NGC container images' },
        { bold: 'ML frameworks', text: 'PyTorch, TensorFlow, and Hugging Face container images' },
        { bold: 'Inference servers', text: 'Ollama, vLLM, and NVIDIA Triton Inference Server' },
        { bold: 'ML operations', text: 'MLflow tracking and serving containers' },
      ],
    },
    {
      type: 'heading',
      id: 'mcp-configuration',
      level: 3,
      text: 'MCP server configuration',
    },
    {
      type: 'paragraph',
      text: 'The scanner picks up Model Context Protocol (MCP) config files like mcp.json and claude_desktop_config.json. These define MCP servers that give AI assistants access to external tools and data, so they\'re flagged as agent-type findings.',
    },
    {
      type: 'heading',
      id: 'export-options',
      level: 2,
      text: 'Export and visualization',
    },
    {
      type: 'paragraph',
      text: 'After a scan completes, you can:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Risk scoring', text: 'Calculate an AI Governance Risk Score (AGRS) across 5 risk dimensions. You can also enable LLM-enhanced analysis for written summaries, recommendations, and suggested risks to add to your risk register.' },
        { bold: 'View graph', text: 'Open an interactive dependency graph. Nodes are findings, edges are inferred dependencies based on shared files and providers.' },
        { bold: 'Export AI-BOM', text: 'Download scan results as an AI Bill of Materials (AI-BOM) in JSON. The format is CycloneDX-inspired and includes all detected components, providers, risk levels, and file locations.' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'AI-BOM for compliance',
      text: 'The AI-BOM export gives you a structured inventory of AI components you can use for regulatory submissions, vendor assessments, or internal documentation.',
    },
    {
      type: 'heading',
      id: 'compliance-references',
      level: 2,
      text: 'Compliance references',
    },
    {
      type: 'paragraph',
      text: 'Security findings include standard reference IDs for compliance reporting:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'CWE', text: 'Common Weakness Enumeration, the standard catalog for software security weaknesses (e.g., CWE-502 for deserialization)' },
        { bold: 'OWASP ML Top 10', text: 'OWASP Machine Learning Security Top 10, covering the top ML security risks (e.g., ML06 for AI Supply Chain Attacks)' },
      ],
    },
    {
      type: 'heading',
      id: 'private-repositories',
      level: 2,
      text: 'Scanning private repositories',
    },
    {
      type: 'paragraph',
      text: 'To scan private repositories, you must configure a GitHub Personal Access Token (PAT) with the `repo` scope. Navigate to **AI Detection → Settings** to add your token. The token is encrypted at rest and used only for git clone operations.',
    },
    {
      type: 'paragraph',
      text: 'For instructions on creating a GitHub PAT, see the official GitHub documentation at `https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token`.',
    },
    {
      type: 'image',
      src: '/images/user-guide/ai-detection-settings.png',
      alt: 'AI Detection settings page with GitHub token configuration',
      caption: 'Configure GitHub Personal Access Token for private repository scanning',
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
          articleId: 'history',
          title: 'Scan results',
          description: 'View and manage past scan results',
        },
        {
          collectionId: 'ai-detection',
          articleId: 'repositories',
          title: 'Repositories',
          description: 'Register and schedule repository scans',
        },
        {
          collectionId: 'compliance',
          articleId: 'eu-ai-act',
          title: 'EU AI Act compliance',
          description: 'How AI Detection supports regulatory requirements',
        },
      ],
    },
  ],
};
