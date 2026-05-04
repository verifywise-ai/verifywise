export interface Tip {
  header: string;
  content: string;
}

export interface EntityTips {
  [entityName: string]: Tip[];
}

export const ENTITY_TIPS: EntityTips = {
  dashboard: [
    {
      header: "The Dashboard gives you a real-time snapshot of your AI governance health.",
      content:
        "Your dashboard automatically updates as tasks complete, risks change, and compliance deadlines approach. Use the overview cards to quickly identify areas needing attention. Click any metric to drill down into detailed views and take action.",
    },
    {
      header: "Quick actions are available from every dashboard card.",
      content:
        "Hover over any dashboard metric to reveal quick action buttons. You can add new items, view details, or export data without navigating away. This saves time when you need to act on urgent items.",
    },
    {
      header: "Dashboard widgets can be customized to match your workflow.",
      content:
        "The dashboard displays the most critical metrics for AI governance. As you use the system, you'll see trends and patterns that help predict compliance gaps before they become issues.",
    },
  ],
  tasks: [
    {
      header: "Tasks automatically track your AI governance workload.",
      content:
        "Tasks are generated from policies, frameworks, and risk assessments to ensure nothing falls through the cracks. Overdue tasks appear in red, and upcoming tasks help you plan ahead. Complete tasks on time to maintain compliance momentum.",
    },
    {
      header: "Task priorities help you focus on what matters most.",
      content:
        "High-priority tasks require immediate attention and often tie to regulatory deadlines or critical risks. Use filters to view tasks by priority, assignee, or due date. Completing high-priority tasks first reduces compliance risk.",
    },
  ],
  overview: [
    {
      header: "Use Cases define where and how AI is used in your organization.",
      content:
        "Every AI deployment should have a documented use case. This creates visibility into AI activities and helps identify potential risks before deployment. Start by documenting your most critical or highest-risk AI systems.",
    },
    {
      header: "Use Cases connect to all other governance activities.",
      content:
        "When you create a use case, it automatically links to relevant risks, policies, and compliance requirements. This creates a connected governance ecosystem where changes in one area update related items. Think of use cases as the foundation of your AI governance.",
    },
    {
      header: "Use Case status tracking shows your AI lifecycle stages.",
      content:
        "Track use cases from planning through production to retirement. Status indicators help you see which AI systems are active, which are in development, and which need review. Regular status updates ensure governance stays current.",
    },
    {
      header: "Grouping use cases reveals patterns and shared risks.",
      content:
        "Use the group-by feature to organize use cases by risk level or status. This reveals patterns like common risk factors across systems or lifecycle stage distribution. These insights inform governance strategy.",
    },
  ],
  framework: [
    {
      header: "Frameworks map your compliance requirements to actions.",
      content:
        "Each framework (like NIST AI RMF or EU AI Act) contains controls that translate regulatory requirements into specific tasks and policies. Select frameworks relevant to your industry to automatically generate compliance workstreams.",
    },
    {
      header: "Framework progress shows your compliance maturity.",
      content:
        "The completion percentage for each framework indicates how well you meet regulatory standards. Focus on frameworks with lower scores or upcoming deadlines. Gradual improvement is normal. Aim for consistent progress rather than perfection.",
    },
    {
      header: "Sub-controls break complex requirements into manageable steps.",
      content:
        "Each framework control contains sub-controls that define specific actions needed for compliance. Click into any control to see what's required, assign owners, and track completion. This granular approach prevents overwhelming teams with massive compliance initiatives.",
    },
  ],
  vendors: [
    {
      header: "Vendor risk assessments protect your organization from third-party AI risks.",
      content:
        "AI vendors introduce unique risks around data handling, model bias, and security. Regular vendor assessments ensure these risks are identified and managed. Many frameworks require documented vendor due diligence, making this essential for compliance.",
    },
    {
      header: "Vendor reviews should happen at least annually.",
      content:
        "Set review dates for each vendor to ensure regular reassessment. Vendors change their practices, acquire new technology, or face security incidents. Annual reviews help you catch these changes before they impact your organization.",
    },
    {
      header: "Risk scores help prioritize vendor management efforts.",
      content:
        "High-risk vendors require more frequent review and stricter controls. Use risk scores to determine which vendors need enhanced due diligence, contract terms, or monitoring. This risk-based approach allocates your team's time effectively.",
    },
  ],
  "model-inventory": [
    {
      header: "Model Inventory creates visibility into all AI models in use.",
      content:
        "Many organizations don't know how many AI models they're using or where they're deployed. This registry provides that critical visibility. Start by inventorying production models, then expand to development and experimental models.",
    },
    {
      header: "Evidence Hub stores model certificates and metadata.",
      content:
        "Upload model certificates, metadata, training data documentation, and other evidence to the Evidence Hub. This centralized repository enables better risk assessment and performance tracking. Having all model evidence in one place is essential for audits and demonstrating responsible AI practices.",
    },
    {
      header: "Link models to use cases and frameworks.",
      content:
        "Connect your AI models to the use cases where they're deployed and the compliance frameworks they must meet. These links create traceability from models through use cases to regulatory requirements. This connection is essential for comprehensive AI governance.",
    },
  ],
  "risk-management": [
    {
      header: "Risk identification is the foundation of responsible AI.",
      content:
        "AI systems introduce unique risks around bias, privacy, security, and accuracy. Proactively identifying these risks before deployment prevents incidents and builds stakeholder trust. Use risk templates to ensure you're considering all categories.",
    },
    {
      header: "Risk ratings determine mitigation priority.",
      content:
        "Not all risks require immediate action. High and critical risks need urgent mitigation, while lower risks can be monitored or accepted. This prioritization ensures your team focuses on what matters most. Review ratings quarterly as context changes.",
    },
    {
      header: "Mitigation plans turn risk awareness into action.",
      content:
        "Every identified risk should have a mitigation plan with clear owners and timelines. Without plans, risk registers become shelf-ware. Document specific controls, compensating measures, or monitoring approaches for each risk.",
    },
    {
      header: "Residual risk shows what remains after controls.",
      content:
        "Even with mitigations, some risk remains. This is residual risk. Tracking residual risk helps leadership make informed decisions about risk acceptance. If residual risk is too high, additional controls may be needed.",
    },
  ],
  training: [
    {
      header: "Training records prove your team understands AI governance.",
      content:
        "Regulators and auditors want evidence that personnel are trained on AI policies and responsible practices. The training registry tracks who completed which training and when. This documentation is essential for compliance and reduces organizational risk.",
    },
    {
      header: "Annual training refreshers keep policies top of mind.",
      content:
        "Even well-trained teams forget policy details over time. Annual refresher training ensures everyone stays current on AI governance requirements. Many frameworks mandate annual training, making this a compliance necessity.",
    },
    {
      header: "Role-based training ensures relevant skills for each person.",
      content:
        "Different roles need different AI governance training. Developers need technical training on bias testing and security, while executives need strategic training on AI risk oversight. Tailor training to roles for maximum effectiveness.",
    },
    {
      header: "Track training completion for audit readiness.",
      content:
        'When auditors ask "How do you ensure staff competence?", point to training records showing completion dates, topics covered, and assessment scores. This objective evidence is much stronger than anecdotal responses.',
    },
  ],
  "file-manager": [
    {
      header: "Centralized evidence storage speeds up audits.",
      content:
        "When auditors request documentation, you need to find it quickly. Storing all AI governance evidence in one place (assessments, approvals, test results) makes audit responses faster and reduces stress. Tag files clearly for easy retrieval.",
    },
    {
      header: "Link evidence to related items for context.",
      content:
        "Connect evidence files to the policies, risks, or models they support. These links create a documented trail showing how evidence supports governance activities. Auditors follow these trails to verify your governance claims.",
    },
    {
      header: "Version control prevents using outdated documents.",
      content:
        "Upload new versions of documents when they're updated and mark old versions as superseded. This prevents teams from accidentally using outdated policies or procedures. Version history also shows how your practices evolved over time.",
    },
    {
      header: "Retention policies keep evidence available when needed.",
      content:
        "Different regulations have different retention requirements. Some require 3 years, others 7 or more. Set retention policies for evidence based on regulatory requirements. Don't delete evidence prematurely, as you may need it for audits years later.",
    },
  ],
  reporting: [
    {
      header: "Reports communicate AI governance status to stakeholders.",
      content:
        "Executives, boards, and regulators need regular updates on AI governance activities. Pre-built reports summarize key metrics, risks, and compliance status. Schedule regular reporting to keep stakeholders informed and engaged.",
    },
    {
      header: "Export reports for presentations and documentation.",
      content:
        "Export reports to Word documents for sharing in presentations, board meetings, or regulatory submissions. Customized reports show stakeholders exactly what they need to know without overwhelming them with details.",
    },
    {
      header: "Trend reports reveal governance progress over time.",
      content:
        "Month-over-month comparisons show whether your governance program is maturing. Look for trends like decreasing high-priority risks, increasing control completion, or faster task closure. These trends demonstrate program effectiveness.",
    },
  ],
  "ai-trust-center": [
    {
      header: "The AI Trust Center builds public confidence in your AI.",
      content:
        "Transparency about AI use, safety measures, and governance practices builds trust with customers, regulators, and the public. The Trust Center publishes information about your AI practices externally. Use it to demonstrate responsible AI leadership.",
    },
    {
      header: "Public transparency can be a competitive advantage.",
      content:
        "Organizations that openly share their AI governance practices stand out in the market. Trust Center content shows customers you're serious about responsible AI. This transparency can differentiate you from competitors who hide their AI practices.",
    },
    {
      header: "Control what information is published externally.",
      content:
        "Not all governance information should be public. The Trust Center lets you selectively publish high-level information about policies, principles, and oversight while keeping sensitive details internal. Review published content regularly to ensure accuracy.",
    },
    {
      header: "Trust Center content should stay current.",
      content:
        "Outdated Trust Center information damages credibility. Update published content when policies change, new AI systems deploy, or governance practices evolve. Regular updates show ongoing commitment to responsible AI.",
    },
  ],
  policies: [
    {
      header: "Policies set clear expectations for responsible AI use.",
      content:
        "Without clear policies, teams make inconsistent AI decisions that create risk. Policy Manager helps you create, approve, and distribute AI governance policies. Start with essential policies like acceptable use, data handling, and bias testing.",
    },
    {
      header: "Policies have renewal dates to make it easier to prepare for compliance goals.",
      content:
        "It's a best practice to have personnel acknowledge policies at least once a year, and many frameworks require it. Tasks and tests are automated based on renewal dates to help you stay on top of your goals. Default renewal dates are 1 year from the last approval or creation date, but you can change them as needed.",
    },
    {
      header: "Policy acknowledgment creates accountability.",
      content:
        "Require team members to acknowledge policies after reading them. This acknowledgment creates individual accountability and provides audit evidence that policies were communicated. Track who has and hasn't acknowledged each policy.",
    },
    {
      header: "Link policies to controls for complete governance.",
      content:
        'Policies define "what" should happen, while controls define "how" to implement policies. Linking policies to framework controls ensures policies support compliance requirements. This connection creates a cohesive governance system.',
    },
  ],
  "ai-incident-managements": [
    {
      header: "Incident tracking helps you learn from AI failures.",
      content:
        "When AI systems fail, cause harm, or behave unexpectedly, document these incidents. Incident records help you identify patterns, improve systems, and demonstrate responsible practices to regulators. Every incident is a learning opportunity.",
    },
    {
      header: "Incident severity determines response requirements.",
      content:
        "Not all incidents require the same response. High-severity incidents need immediate action, stakeholder notification, and detailed investigation. Lower-severity incidents may just need documentation and monitoring. Use severity ratings to allocate response resources.",
    },
    {
      header: "Root cause analysis prevents recurring incidents.",
      content:
        "Document what caused each incident and what corrective actions you're taking. Root cause analysis helps prevent the same incident from happening again. Regulators want to see that you learn from incidents and improve over time.",
    },
  ],
  "event-tracker": [
    {
      header: "Event tracking creates a complete AI governance timeline.",
      content:
        "Events capture important milestones like model deployments, policy updates, audits, and training sessions. This timeline helps you understand how your governance program evolved and provides context for auditors reviewing your practices.",
    },
    {
      header: "Automated events reduce documentation burden.",
      content:
        "Many events are logged automatically when you complete tasks, approve policies, or update risks. This automation ensures consistent documentation without extra work. You can also manually log important events that happen outside the system.",
    },
    {
      header: "Event history supports audit responses.",
      content:
        'When auditors ask "When did you implement this control?" or "How did you respond to that incident?", event logs provide definitive answers. Detailed event history eliminates reliance on memory and creates objective evidence.',
    },
    {
      header: "Filter events to find relevant information quickly.",
      content:
        "With many events logged over time, filters help you find what you need. Filter by date range, event type, or related entity to quickly locate specific governance activities. Export filtered events for reports or documentation.",
    },
  ],
  settings: [
    {
      header: "Settings customize VerifyWise to your organization's needs.",
      content:
        "Configure user roles and system defaults to match your governance workflows. Taking time to properly configure settings upfront saves time and reduces confusion later. Review settings periodically as your organization grows.",
    },
    {
      header: "User roles control access to sensitive information.",
      content:
        "Not everyone needs access to all governance data. Use roles to grant appropriate access levels: viewers for stakeholders, editors for governance team members, and admins for system owners. Role-based access protects sensitive information.",
    },
  ],
  "shadow-ai-insights": [
    {
      header: "Shadow AI insights reveal hidden AI usage across your organization.",
      content:
        "The insights dashboard aggregates data from network traffic, proxy logs, and browser activity to show which AI tools are being used, by whom, and how often. Use the period selector to compare activity over different time ranges.",
    },
    {
      header: "Risk scores help prioritize which tools need attention first.",
      content:
        "Tools with higher risk scores may be handling sensitive data or lack enterprise security features. Focus governance efforts on high-risk tools first, then work through the list systematically.",
    },
  ],
  "shadow-ai-user-activity": [
    {
      header: "Track individual user AI activity to identify training opportunities.",
      content:
        "Users with high prompt counts may need guidance on approved AI tools and data handling policies. Use this view to identify power users who can become AI governance champions in their departments.",
    },
    {
      header: "Department breakdowns reveal organizational AI adoption patterns.",
      content:
        "Some departments adopt AI tools faster than others. Understanding these patterns helps you tailor training programs and governance policies to each department's needs and risk profile.",
    },
  ],
  "shadow-ai-tools": [
    {
      header: "Review detected tools to decide which should be approved or blocked.",
      content:
        "Each detected tool shows usage statistics, risk score, and which departments are using it. Update tool status to approved, restricted, or blocked based on your organization's security and compliance requirements.",
    },
    {
      header: "Start governance directly from a detected tool to bring it under formal management.",
      content:
        "When you find a tool worth governing, use the 'Start governance' button to create a model inventory entry. This connects the tool to your existing compliance frameworks and risk management processes.",
    },
  ],
  "shadow-ai-rules": [
    {
      header: "Alert rules notify you automatically when specific conditions are met.",
      content:
        "Set up rules to get alerted when new AI tools are detected, usage thresholds are exceeded, or sensitive departments start using unapproved tools. Early detection prevents data leaks and compliance violations.",
    },
    {
      header: "Review alert history to understand patterns and adjust rules.",
      content:
        "Frequent alerts may indicate rules need fine-tuning, while no alerts might mean thresholds are too high. Check alert history regularly and adjust trigger conditions to maintain an effective monitoring balance.",
    },
  ],
  "shadow-ai-settings": [
    {
      header: "API keys authenticate your network monitoring infrastructure.",
      content:
        "Generate API keys for each data source (proxy, firewall, browser extension) to feed network traffic data into Shadow AI detection. Each key can be labeled and revoked independently for security.",
    },
    {
      header: "Syslog sources define where your network traffic data comes from.",
      content:
        "Configure syslog sources for each network monitoring point in your infrastructure. Select the appropriate parser type to ensure events are correctly parsed and attributed to the right AI tools.",
    },
  ],
  "evals-overview": [
    {
      header: "Monitor trends to track progress over time.",
      content:
        "The overview highlights performance trends across your experiments. Watch for improvements after model updates or regressions that need investigation. Consistent monitoring catches issues before they impact production.",
    },
  ],
  "evals-experiments": [
    {
      header: "Compare experiments to understand what changed.",
      content:
        "When you update prompts, models, or configurations, run new experiments to measure the impact. Comparing results side-by-side reveals whether changes improved or degraded performance.",
    },
    {
      header: "Use multiple scorers for comprehensive evaluation.",
      content:
        "A single metric rarely tells the whole story. Combine scorers for accuracy, relevance, safety, and task-specific criteria to get a complete picture of model quality. Different use cases need different evaluation approaches.",
    },
  ],
  "evals-datasets": [
    {
      header: "Start with templates to accelerate dataset creation.",
      content:
        "Built-in dataset templates provide professionally designed test cases for common AI tasks. Use them as starting points, then customize with your own examples to match your specific use case.",
    },
    {
      header: "Include both expected successes and known challenges.",
      content:
        "Good evaluation datasets test both what models should handle well and where they might struggle. Include adversarial examples, edge cases, and boundary conditions to stress-test your models thoroughly.",
    },
  ],
  "evals-scorers": [
    {
      header: "LLM-based scorers evaluate nuanced quality aspects.",
      content:
        "Some qualities like helpfulness or tone are hard to measure with rules. LLM scorers use AI to judge these subjective aspects consistently. They work well for evaluating open-ended or creative outputs.",
    },
    {
      header: "Calibrate scorers against human judgment.",
      content:
        "Periodically compare scorer results to human evaluations. If scorers and humans disagree consistently, adjust thresholds or scorer configurations. Well-calibrated scorers save time while maintaining quality standards.",
    },
  ],
  "ai-gateway-endpoints": [
    {
      header: "Endpoints route LLM requests through a unified gateway.",
      content:
        "Each endpoint maps to a specific provider and model combination. Configure endpoints for different use cases — a production endpoint for GPT-4o, a testing endpoint for a lighter model. All requests are logged with cost and token usage.",
    },
    {
      header: "Use slugs to reference endpoints in your applications.",
      content:
        "When you create an endpoint, it gets a URL-safe slug (e.g., prod-gpt4o). Your applications use this slug to route requests through the gateway. Changing the underlying model only requires updating the endpoint configuration, not your application code.",
    },
    {
      header: "System prompts are prepended to every request automatically.",
      content:
        "Add a system prompt to an endpoint to enforce consistent behavior across all requests. This is useful for adding safety guardrails, response formatting instructions, or context that should apply to every interaction.",
    },
  ],
  "ai-gateway-dashboard": [
    {
      header: "Analytics gives you a unified view of all LLM usage and costs.",
      content:
        "The analytics dashboard aggregates costs, request volume, token usage, and latency from every provider and model into a single view. Use the period selector to compare daily, weekly, or monthly trends and identify unexpected usage spikes.",
    },
    {
      header: "Cost breakdowns by model help optimize your provider strategy.",
      content:
        "See which models consume the most budget. Often, switching to a lighter model for simple tasks can dramatically reduce costs without affecting quality. Use the per-model breakdown to identify optimization opportunities.",
    },
    {
      header: "Top users and endpoint breakdowns reveal usage patterns.",
      content:
        "Understand who is consuming the most tokens and which endpoints handle the most traffic. These insights help you allocate budgets, identify power users, and plan capacity for high-traffic endpoints.",
    },
  ],
  "ai-gateway-playground": [
    {
      header: "Test endpoints before deploying them in production.",
      content:
        "The playground lets you send test messages to any configured endpoint and see the response in real-time. Use it to verify model behavior, test system prompts, and compare responses across different endpoints before routing production traffic.",
    },
    {
      header: "Cost per message helps you estimate production expenses.",
      content:
        "Every playground message shows its cost and token usage. Use this to estimate what production traffic will cost at scale. If a conversation costs $0.02 per exchange, multiply by your expected daily volume to forecast monthly spend.",
    },
  ],
  "ai-gateway-settings": [
    {
      header: "API keys connect the gateway to LLM providers.",
      content:
        "Add your provider API keys here — OpenAI, Anthropic, Google, and more. Keys are encrypted at rest and never exposed in logs. Each key is labeled so you can track which key is used by which endpoints.",
    },
    {
      header: "Budgets prevent unexpected cost overruns.",
      content:
        "Set a monthly spending limit to control costs. When the hard limit is enabled, requests are rejected once the budget is exceeded. Use the alert threshold to get early warnings before hitting the limit.",
    },
  ],
  "ai-gateway-virtual-keys": [
    {
      header: "Give every developer a governed AI endpoint in minutes.",
      content:
        "Create a virtual key, share it with a developer, and they swap their OpenAI base URL to the gateway. Every request flows through your guardrails, budget controls, and audit logs — without anyone needing a VerifyWise account.",
    },
    {
      header: "Control costs per team, project, or environment.",
      content:
        "Each virtual key can carry its own monthly budget cap and rate limit. When a key exhausts its budget only that key is blocked — other keys and the Playground keep working. Budgets reset automatically on the 1st of each month.",
    },
    {
      header: "Works with any OpenAI-compatible SDK or HTTP client.",
      content:
        "Virtual keys follow the OpenAI API format. Set the base URL to the gateway, pass the virtual key as the API key, and use your endpoint slug as the model name. Python, Node, Go, curl — anything that speaks the OpenAI protocol works out of the box.",
    },
  ],
  "ai-gateway-prompts": [
    {
      header: "Version your system prompts without changing application code.",
      content:
        "Create message templates with {{variables}} that get resolved at request time. Each save creates a new version, so you can compare results, roll back, or A/B test different instructions.",
    },
    {
      header: "Test with real responses before you publish.",
      content:
        "The editor has a built-in test chat. Pick an endpoint, fill in your variables, and send a message. You'll see the streaming response, token count, and cost right there.",
    },
    {
      header: "Bind a prompt to an endpoint and it just works.",
      content:
        "Published prompts are resolved server-side. The gateway prepends the prompt's messages to every request through the bound endpoint. Variables come from the request metadata.",
    },
  ],
  "ai-gateway-logs": [
    {
      header: "Every request through the gateway is logged here.",
      content:
        "Each log entry shows the endpoint, model, user or virtual key, token counts, cost, status, and timestamp. Click a row to expand and see the full request messages, response text, and any errors.",
    },
    {
      header: "Use filters to find what you're looking for.",
      content:
        "Filter by status (success or error), source (playground or virtual key), and search by endpoint name or model. Logs are grouped by day with Today and Yesterday labels.",
    },
    {
      header: "Turn on live updates to watch requests come in.",
      content:
        'The "Live updates" toggle refreshes the log list every 10 seconds. Useful when you\'re testing a new endpoint or prompt and want to see requests as they happen.',
    },
  ],
  "ai-gateway-guardrails": [
    {
      header: "Guardrails protect every AI request automatically.",
      content:
        "PII detection and content filters run on every request before it reaches the LLM provider. Scanning happens within your gateway infrastructure, so no data leaves your network. Use the Test button to preview what your rules catch before enabling them.",
    },
    {
      header: "PII detection stays within your infrastructure.",
      content:
        "Text is analyzed for personal data patterns (email, phone, credit card, names, IBAN, Turkish TCKN) within your gateway infrastructure. No data leaves your network for scanning.",
    },
    {
      header: "Content filters support exact keywords and regex patterns.",
      content:
        "Block specific words with word-boundary matching (prevents false positives like 'kill' matching 'skilled'). Or define regex patterns to catch formats like internal project codes, employee IDs, or API keys.",
    },
  ],
};
