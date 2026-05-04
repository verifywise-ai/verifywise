import type { ArticleContent } from '../../contentTypes';

export const integrationGuideContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'This guide walks you through connecting your network infrastructure to VerifyWise Shadow AI detection, from creating your first API key to verifying that events are flowing into the dashboard. There are two integration paths: the REST API (for custom integrations, browser extensions and SIEM webhooks) and syslog forwarding (for network proxies and firewalls).',
    },
    {
      type: 'time-estimate',
      text: 'Estimated setup time: 15-30 minutes',
    },
    {
      type: 'heading',
      id: 'prerequisites',
      level: 2,
      text: 'Prerequisites',
    },
    {
      type: 'checklist',
      items: [
        'Admin or Editor role in VerifyWise',
        'Access to your network proxy, firewall, or SIEM configuration',
        'Network connectivity from your data source to the VerifyWise server',
      ],
    },

    // ─── REST API integration ──────────────────────────────────────────

    {
      type: 'heading',
      id: 'rest-api-integration',
      level: 2,
      text: 'REST API integration',
    },
    {
      type: 'paragraph',
      text: 'The REST API is the most flexible integration method. Use it when your data source can make HTTP requests, for example a SIEM webhook action, a custom script or a browser extension.',
    },

    {
      type: 'heading',
      id: 'step-1-create-api-key',
      level: 3,
      text: 'Step 1: Create an API key',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Navigate to Shadow AI → Settings' },
        { text: 'In the "API keys" section, click "Create API key"' },
        { text: 'Enter a label that identifies the data source (e.g., "Zscaler webhook" or "Browser extension prod")' },
        { text: 'Click "Create"' },
        { text: 'Copy the full key immediately and store it securely, it won\'t be shown again' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Key security',
      text: 'Treat the API key like a password. Store it in a secrets manager or environment variable. Never commit it to source control.',
    },

    {
      type: 'heading',
      id: 'step-2-send-events',
      level: 3,
      text: 'Step 2: Send events',
    },
    {
      type: 'paragraph',
      text: 'Send a `POST` request to the ingestion endpoint with your events. The endpoint accepts batches of up to 10,000 events per request.',
    },
    {
      type: 'paragraph',
      text: '**Endpoint:** `POST /v1/shadow-ai/events`',
    },
    {
      type: 'paragraph',
      text: '**Headers:**',
    },
    {
      type: 'table',
      columns: [
        { key: 'header', label: 'Header', width: '30%' },
        { key: 'value', label: 'Value', width: '70%' },
      ],
      rows: [
        { header: 'Content-Type', value: 'application/json' },
        { header: 'X-API-Key', value: 'Your API key from step 1' },
      ],
    },
    {
      type: 'paragraph',
      text: '**Example request body:**',
    },
    {
      type: 'code',
      language: 'json',
      code: `{
  "events": [
    {
      "user_email": "alice@company.com",
      "destination": "chat.openai.com",
      "timestamp": "2026-02-09T14:32:00Z",
      "uri_path": "/v1/chat",
      "http_method": "POST",
      "action": "allowed",
      "department": "Engineering",
      "job_title": "Senior Engineer",
      "manager_email": "bob@company.com"
    }
  ]
}`,
    },
    {
      type: 'paragraph',
      text: '**Required fields:** `user_email`, `destination`, `timestamp`. All other fields are optional but improve the accuracy of risk scoring and department-level reporting.',
    },

    {
      type: 'heading',
      id: 'step-3-verify-rest',
      level: 3,
      text: 'Step 3: Verify ingestion',
    },
    {
      type: 'paragraph',
      text: 'A successful request returns a `200` response with the number of events ingested and tools matched:',
    },
    {
      type: 'code',
      language: 'json',
      code: `{
  "data": {
    "ingested": 1,
    "tools_matched": 1
  }
}`,
    },
    {
      type: 'paragraph',
      text: 'After sending events, verify they appear in the system:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to Shadow AI → Insights and check that the summary cards update (unique apps, AI users)' },
        { text: 'Go to Shadow AI → AI tools and confirm the destination domain appears as a detected tool' },
        { text: 'Go to Shadow AI → User activity and confirm the user email appears in the users list' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Dashboard refresh',
      text: 'Insights dashboard metrics may take a few seconds to update after ingestion. Refresh the page if you do not see the data immediately.',
    },

    {
      type: 'heading',
      id: 'rest-api-errors',
      level: 3,
      text: 'REST API error responses',
    },
    {
      type: 'table',
      columns: [
        { key: 'status', label: 'Status code', width: '15%' },
        { key: 'cause', label: 'Cause', width: '35%' },
        { key: 'fix', label: 'How to fix', width: '50%' },
      ],
      rows: [
        { status: '400', cause: 'Missing required field or invalid email', fix: 'Check that every event has user_email, destination and timestamp. Verify the email format.' },
        { status: '401', cause: 'Missing or invalid API key', fix: 'Ensure the X-API-Key header is set with a valid, non-revoked key.' },
        { status: '413', cause: 'Batch too large', fix: 'Reduce to 10,000 or fewer events per request.' },
        { status: '429', cause: 'Rate limit exceeded', fix: 'Wait until the next hour window, or increase the rate limit in Settings → Rate limiting.' },
      ],
    },

    // ─── Syslog integration ────────────────────────────────────────────

    {
      type: 'heading',
      id: 'syslog-integration',
      level: 2,
      text: 'Syslog integration',
    },
    {
      type: 'paragraph',
      text: 'Syslog integration is ideal for network proxies and firewalls that natively support syslog forwarding (Zscaler Internet Access, Netskope, Squid proxy). The VerifyWise server runs a TCP syslog listener that receives log lines, parses them using the configured parser and feeds them into the same event pipeline as the REST API.',
    },

    {
      type: 'heading',
      id: 'syslog-step-1',
      level: 3,
      text: 'Step 1: Verify the syslog listener is running',
    },
    {
      type: 'paragraph',
      text: 'The syslog listener is controlled by the `SHADOW_AI_SYSLOG_PORT` environment variable on the VerifyWise server. By default it listens on port **5514**. Set the variable to `0` to disable it.',
    },
    {
      type: 'paragraph',
      text: 'Confirm the listener is running by checking the server logs for the message: `Syslog listener started on port 5514`. If you do not see it, verify the environment variable is set and the server has been restarted.',
    },

    {
      type: 'heading',
      id: 'syslog-step-2',
      level: 3,
      text: 'Step 2: Add a syslog source in VerifyWise',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Navigate to Shadow AI → Settings' },
        { text: 'In the "Syslog sources" section, click "Add source"' },
        { text: 'Enter the **source identifier**, which must be the IP address of the machine that will send syslog messages (e.g., `10.0.1.50`). The syslog listener matches incoming connections by source IP.' },
        { text: 'Select the **parser type** that matches your data source (Zscaler, Netskope, Squid proxy, or Generic key-value)' },
        { text: 'Click "Add"' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Source identifier must match',
      text: 'The source identifier must exactly match the IP address that the syslog listener sees for incoming connections. If your proxy routes through a load balancer or NAT, use the IP address that reaches the VerifyWise server, not the proxy\'s internal IP. Messages from unrecognized IPs are silently dropped.',
    },

    {
      type: 'heading',
      id: 'syslog-step-3',
      level: 3,
      text: 'Step 3: Configure your proxy to forward logs',
    },
    {
      type: 'paragraph',
      text: 'Configure your network proxy or firewall to send syslog messages over TCP to the VerifyWise server. Below are configuration notes for each supported source.',
    },

    // Zscaler
    {
      type: 'heading',
      id: 'config-zscaler',
      level: 3,
      text: 'Zscaler Internet Access',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'In the ZIA admin portal, navigate to Administration → Nanolog Streaming Service' },
        { text: 'Add a new NSS feed or edit an existing one' },
        { text: 'Set the feed output type to **Syslog**' },
        { text: 'Set the syslog destination to your VerifyWise server IP and port (default 5514), protocol TCP' },
        { text: 'In the log format, include at minimum: `user`, `dst`, `method`, `uri`, `action`. Optionally include `department` for department-level reporting' },
        { text: 'Save and activate the feed' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Expected log line format:',
    },
    {
      type: 'code',
      language: 'text',
      code: 'user=alice@company.com dst=chat.openai.com method=POST uri=https://chat.openai.com/v1/chat action=allowed department=Engineering',
    },

    // Netskope
    {
      type: 'heading',
      id: 'config-netskope',
      level: 3,
      text: 'Netskope',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'In the Netskope admin console, navigate to Settings → Tools → SIEM' },
        { text: 'Add a new SIEM profile with type **Syslog**' },
        { text: 'Set the destination to your VerifyWise server IP and port (default 5514), protocol TCP' },
        { text: 'Set the format to **JSON**' },
        { text: 'Select the event types to forward (at minimum: page events and application events)' },
        { text: 'Save and enable the profile' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Expected log line format (JSON embedded in syslog frame):',
    },
    {
      type: 'code',
      language: 'json',
      code: `{"user":"alice@company.com","url":"https://chat.openai.com/v1/chat","method":"POST","activity":"allowed","department":"Engineering","timestamp":"2026-02-09T14:32:00Z"}`,
    },

    // Squid
    {
      type: 'heading',
      id: 'config-squid',
      level: 3,
      text: 'Squid proxy',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Edit your Squid configuration file (`squid.conf`)' },
        { text: 'Add or modify the `access_log` directive to forward to a syslog destination via TCP: `access_log tcp://VERIFYWISE_IP:5514`' },
        { text: 'Ensure the log format includes the user identity field (`%un`). Squid must be configured with authentication (LDAP, Kerberos or basic) for user emails to be captured' },
        { text: 'Reload the Squid configuration: `squid -k reconfigure`' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Expected log line format (standard Squid access log):',
    },
    {
      type: 'code',
      language: 'text',
      code: '1707489120.000 200 10.0.0.1 TCP_MISS/200 1024 POST https://chat.openai.com/v1/chat alice@company.com DIRECT/chat.openai.com',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Authentication required',
      text: 'The Squid parser expects the 8th space-delimited field to be the user email. If your Squid proxy does not use authentication, this field may be a dash (`-`) and events will fail to parse.',
    },

    // Generic
    {
      type: 'heading',
      id: 'config-generic',
      level: 3,
      text: 'Generic key-value (CEF-like)',
    },
    {
      type: 'paragraph',
      text: 'The generic key-value parser handles CEF-style log lines and any source that outputs `key=value` pairs. Use this for firewalls, DLP systems or custom log forwarders that don\'t match the Zscaler, Netskope or Squid formats.',
    },
    {
      type: 'paragraph',
      text: 'The parser looks for the following CEF-standard field names:',
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Source field', width: '30%' },
        { key: 'maps_to', label: 'Maps to', width: '30%' },
        { key: 'required', label: 'Required', width: '15%' },
        { key: 'example', label: 'Example', width: '25%' },
      ],
      rows: [
        { field: 'suser', maps_to: 'user_email', required: 'Yes', example: 'alice@company.com' },
        { field: 'dhost', maps_to: 'destination', required: 'Yes', example: 'chat.openai.com' },
        { field: 'requestMethod', maps_to: 'http_method', required: 'No', example: 'POST' },
        { field: 'act', maps_to: 'action', required: 'No', example: 'allowed' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Example log line:',
    },
    {
      type: 'code',
      language: 'text',
      code: 'suser=alice@company.com dhost=chat.openai.com requestMethod=POST act=allowed',
    },

    // ─── Verification ──────────────────────────────────────────────────

    {
      type: 'heading',
      id: 'syslog-step-4',
      level: 3,
      text: 'Step 4: Verify syslog ingestion',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'After configuring your proxy, generate some test traffic by visiting a known AI tool (e.g., chat.openai.com) through the monitored network' },
        { text: 'Wait 5-10 seconds for the syslog batch to flush (events are batched in 2-second intervals with a batch size of 50)' },
        { text: 'Go to Shadow AI → Insights and verify the summary cards show updated numbers' },
        { text: 'Go to Shadow AI → AI tools and confirm the test domain appears' },
        { text: 'If events do not appear, check the server logs for parse errors: look for messages containing "Syslog parse failed" which indicate a parser mismatch' },
      ],
    },

    // ─── Troubleshooting ───────────────────────────────────────────────

    {
      type: 'heading',
      id: 'troubleshooting',
      level: 2,
      text: 'Troubleshooting',
    },
    {
      type: 'table',
      columns: [
        { key: 'symptom', label: 'Symptom', width: '30%' },
        { key: 'cause', label: 'Likely cause', width: '30%' },
        { key: 'fix', label: 'Resolution', width: '40%' },
      ],
      rows: [
        {
          symptom: 'REST API returns 401',
          cause: 'Invalid or revoked API key',
          fix: 'Verify the key is correct and has not been revoked in Settings → API keys. Create a new key if needed.',
        },
        {
          symptom: 'REST API returns 429',
          cause: 'Rate limit exceeded',
          fix: 'Check Settings → Rate limiting. Increase the limit or wait until the next hour window.',
        },
        {
          symptom: 'Events sent but nothing in dashboard',
          cause: 'Tool not matched to a known domain',
          fix: 'The destination domain must resolve to a known AI tool. Check the AI tools page. If the tool shows as "Detected", events are being processed. Insights metrics may need a page refresh.',
        },
        {
          symptom: 'Syslog events not appearing',
          cause: 'Source IP not registered',
          fix: 'The source identifier in syslog configuration must match the IP the server sees. Check for NAT or load balancer translation. Server logs will show "Syslog message from unknown source: <IP>".',
        },
        {
          symptom: 'Syslog parse failed in logs',
          cause: 'Wrong parser type selected',
          fix: 'Verify the parser type in Settings → Syslog sources matches the actual log format. Try the generic key-value parser if unsure.',
        },
        {
          symptom: 'Syslog listener not starting',
          cause: 'Port conflict or disabled',
          fix: 'Check that SHADOW_AI_SYSLOG_PORT is set (default: 5514) and no other process is using the port. Set to 0 explicitly to disable.',
        },
        {
          symptom: 'Risk scores are all zero',
          cause: 'Nightly recalculation has not run',
          fix: 'Risk scores are recalculated nightly. New tools will have a score of 0 until the next calculation cycle runs.',
        },
        {
          symptom: 'Department data missing',
          cause: 'Department field not included in events',
          fix: 'The department field is optional but required for department-level reporting and sensitive department alerts. Include it in your event payload or syslog format.',
        },
      ],
    },

    // ─── Best practices ────────────────────────────────────────────────

    {
      type: 'heading',
      id: 'best-practices',
      level: 2,
      text: 'Best practices',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Use descriptive API key labels', text: 'Label each key with the source system and environment (e.g., "Zscaler prod" or "Browser ext staging") so you can quickly identify and rotate keys' },
        { bold: 'Include optional fields', text: 'The department, job_title and manager_email fields aren\'t required but they significantly improve risk scoring accuracy and enable department-level alerts' },
        { bold: 'Start with a single source', text: 'Integrate one data source first, verify events are flowing, then add additional sources' },
        { bold: 'Set up alert rules early', text: 'Create at least a "New tool detected" rule immediately after integration so you are notified when new AI tools appear in your network' },
        { bold: 'Monitor the rate limit', text: 'If you are ingesting from a high-volume proxy, configure the rate limit in Settings to prevent accidental overload during initial rollout' },
        { bold: 'Rotate API keys regularly', text: 'Revoke and recreate API keys periodically. When rotating, create the new key first, update the data source config, then revoke the old key' },
      ],
    },

    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'shadow-ai',
          articleId: 'settings',
          title: 'Settings',
          description: 'API keys, syslog sources, data formats and rate limiting',
        },
        {
          collectionId: 'shadow-ai',
          articleId: 'rules',
          title: 'Alert rules',
          description: 'Set up automated alerts for Shadow AI events',
        },
        {
          collectionId: 'shadow-ai',
          articleId: 'insights',
          title: 'Insights',
          description: 'Verify integration by checking dashboard metrics',
        },
        {
          collectionId: 'shadow-ai',
          articleId: 'ai-tools',
          title: 'AI tools',
          description: 'View and manage detected tools',
        },
      ],
    },
  ],
};
