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
      text: 'Use syslog when a network proxy or firewall (Zscaler Internet Access, Netskope, Squid, or anything that writes key=value lines) can forward its logs. VerifyWise runs a TCP syslog listener on port **6514**. Each log line carries a secret key that tells VerifyWise which organization and which source it belongs to. Parsed lines go into the same pipeline as the REST API.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'The listener is off until the server operator turns it on',
      text: 'The syslog listener is disabled by default. On a self-hosted deployment, whoever runs the server enables it (see Step 1). The hosted service at app.verifywise.ai does not offer syslog yet. If you use the hosted service, send events with the REST API.',
    },

    {
      type: 'heading',
      id: 'syslog-step-1',
      level: 3,
      text: 'Step 1: Check that the listener is on',
    },
    {
      type: 'paragraph',
      text: 'Open Shadow AI → Settings → Syslog sources. A line above the table shows the state. When it is on, it reads "Syslog listener is on. Send to host:6514 over TLS." (or "over plain TCP"). When it is off, it reads "Syslog listener is off. Set SHADOW_AI_SYSLOG_ENABLED=true on the server to turn it on."',
    },
    {
      type: 'paragraph',
      text: 'To turn it on, set these environment variables on the VerifyWise backend and restart it. A boolean is on only for the exact value `true`.',
    },
    {
      type: 'table',
      columns: [
        { key: 'variable', label: 'Variable', width: '40%' },
        { key: 'meaning', label: 'Meaning', width: '60%' },
      ],
      rows: [
        { variable: 'SHADOW_AI_SYSLOG_ENABLED', meaning: 'Set to `true` to start the listener. Default: off.' },
        { variable: 'SHADOW_AI_SYSLOG_PORT', meaning: 'TCP port. Default: 6514.' },
        { variable: 'SHADOW_AI_SYSLOG_TLS_CERT_FILE', meaning: 'Path to the TLS certificate (PEM). Set together with the key file.' },
        { variable: 'SHADOW_AI_SYSLOG_TLS_KEY_FILE', meaning: 'Path to the TLS private key (PEM).' },
        { variable: 'SHADOW_AI_SYSLOG_ALLOW_PLAINTEXT', meaning: 'Set to `true` to accept unencrypted TCP. Needed if you set no certificate. Default: off.' },
        { variable: 'SHADOW_AI_SYSLOG_ALLOW_IP_ONLY', meaning: 'Set to `true` to match lines without a key by sender IP. Self-hosted, single-tenant only. Default: off.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The listener starts without a certificate only when plaintext is allowed. It does not start with `SHADOW_AI_SYSLOG_ALLOW_IP_ONLY=true` when `MULTI_TENANCY_ENABLED=true`. If it does not start, the server log names the variable to fix. The listener accepts TCP only. There is no UDP. TLS is detected on its own, so one port serves TLS and, if allowed, plain TCP.',
    },
    {
      type: 'paragraph',
      text: 'Publish the port to your proxy. With Docker Compose, publish `6514:6514` on the backend. With the Helm chart, set `shadowAiSyslog.enabled=true` and `shadowAiSyslog.tlsSecretName`.',
    },

    {
      type: 'heading',
      id: 'syslog-step-2',
      level: 3,
      text: 'Step 2: Add a source and copy its key',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to Shadow AI → Settings. You need the Admin role to manage syslog sources.' },
        { text: 'In "Syslog sources", click "Add source".' },
        { text: 'Choose the **Parser type**: Zscaler, Netskope, Squid proxy or Generic key-value.' },
        { text: 'Optionally enter an **Allowed sender IP**. If you set one, lines from any other IP are dropped. Leave it empty to accept the key from anywhere.' },
        { text: 'Click "Add". The "Your source key" dialog shows the key and a ready-made `vw_source=<key>` line. **Copy it now. You cannot see the key again.**' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Create one source per proxy or log format. Each source has its own key. To replace a key, click "Regenerate key" on the source and confirm. The old key stops working. The server you are connected to stops accepting it at once. Other server replicas can keep accepting it for up to 60 seconds. Removing a source works the same way.',
    },

    {
      type: 'heading',
      id: 'syslog-step-3',
      level: 3,
      text: 'Step 3: Add the key to your log lines and forward them',
    },
    {
      type: 'paragraph',
      text: 'Configure your proxy to send logs over TCP to your VerifyWise host on port 6514, using TLS, and to include `vw_source=<your key>` in every line. The field can sit anywhere in the line, as long as it is separated by a space. VerifyWise removes it before the line is stored. The examples below show one line per product, with the field added.',
    },

    // Zscaler
    {
      type: 'heading',
      id: 'config-zscaler',
      level: 3,
      text: 'Zscaler Internet Access',
    },
    {
      type: 'paragraph',
      text: 'Create a Nanolog Streaming Service feed that sends to your VerifyWise host over TCP. In the feed output format, include the fields `user`, `dst`, `method`, `uri` and `action` as `name=value` pairs, optionally `department`, and add the literal text `vw_source=<key>`.',
    },
    {
      type: 'code',
      language: 'text',
      code: 'user=alice@company.com dst=chat.openai.com method=POST uri=https://chat.openai.com/v1/chat action=allowed department=Engineering vw_source=YOUR_SOURCE_KEY',
    },

    // Netskope
    {
      type: 'heading',
      id: 'config-netskope',
      level: 3,
      text: 'Netskope',
    },
    {
      type: 'paragraph',
      text: 'Send the events as JSON over syslog. The line must contain a JSON object with `user`, `url`, `method` and `activity`, optionally `department` and `timestamp`. Put the key inside the object as `"vw_source"`, or write `vw_source=<key>` before the object.',
    },
    {
      type: 'code',
      language: 'json',
      code: `{"user":"alice@company.com","url":"https://chat.openai.com/v1/chat","method":"POST","activity":"allowed","department":"Engineering","timestamp":"2026-02-09T14:32:00Z","vw_source":"YOUR_SOURCE_KEY"}`,
    },

    // Squid
    {
      type: 'heading',
      id: 'config-squid',
      level: 3,
      text: 'Squid proxy',
    },
    {
      type: 'paragraph',
      text: 'The Squid parser reads the native access log format: time, elapsed, client, result code, bytes, method, URL, user. Append `vw_source=<key>` to the line with a custom `logformat`, then send it with an `access_log` line that points at your VerifyWise host and port. Squid must authenticate users so that the user field holds an email address.',
    },
    {
      type: 'code',
      language: 'text',
      code: '1707489120.000 200 10.0.0.1 TCP_MISS/200 1024 POST https://chat.openai.com/v1/chat alice@company.com DIRECT/chat.openai.com vw_source=YOUR_SOURCE_KEY',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Squid lines have no allowed or blocked action',
      text: 'The Squid access log has no field for allowed or blocked, so Squid events are stored without an action. If the user field is a dash (`-`), the line is dropped because it has no user email. Squid\'s `access_log tcp://` output is not encrypted, so the server operator must allow plaintext, or you must put a TLS forwarder between Squid and VerifyWise.',
    },

    // Generic
    {
      type: 'heading',
      id: 'config-generic',
      level: 3,
      text: 'Generic key-value (CEF-style)',
    },
    {
      type: 'paragraph',
      text: 'Use this parser for firewalls, DLP systems and custom forwarders that write `key=value` pairs or CEF extensions. It reads these fields:',
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
        { field: 'dhost (or host of request)', maps_to: 'destination', required: 'Yes', example: 'chat.openai.com' },
        { field: 'requestMethod', maps_to: 'http_method', required: 'No', example: 'POST' },
        { field: 'act', maps_to: 'action', required: 'No', example: 'allowed' },
        { field: 'department', maps_to: 'department', required: 'No', example: 'Engineering' },
      ],
    },
    {
      type: 'code',
      language: 'text',
      code: 'suser=alice@company.com dhost=chat.openai.com requestMethod=POST act=allowed vw_source=YOUR_SOURCE_KEY',
    },

    {
      type: 'heading',
      id: 'syslog-ip-only',
      level: 3,
      text: 'Proxies that cannot add the key (IP-only mode)',
    },
    {
      type: 'paragraph',
      text: 'On a self-hosted, single-tenant server where the operator set `SHADOW_AI_SYSLOG_ALLOW_IP_ONLY=true`, a line without a key is matched by the IP it was sent from. Enter that IP as the source\'s Allowed sender IP. If two sources list the same IP, neither can claim the line and both count it as dropped. IP-only mode is refused when multi-tenancy is on. Behind a load balancer or NAT the listener sees the balancer\'s address, so use a key instead.',
    },

    // ─── Verification ──────────────────────────────────────────────────

    {
      type: 'heading',
      id: 'syslog-step-4',
      level: 3,
      text: 'Step 4: Check that lines arrive',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Generate some traffic through the proxy, for example by opening chat.openai.com.' },
        { text: 'Wait a few seconds. VerifyWise writes events in batches, every 2 seconds or at 500 events.' },
        { text: 'In Shadow AI → Settings → Syslog sources, check the source\'s row. **Last received** shows the time, **Accepted** counts stored events and **Dropped** counts lines that were refused.' },
        { text: 'If Dropped goes up, read **Last drop reason**. The reasons are listed below.' },
        { text: 'Open Shadow AI → Insights. Only events to a destination that matches a known AI tool count as AI usage. Other events are stored but do not appear in those counts.' },
      ],
    },
    {
      type: 'table',
      columns: [
        { key: 'reason', label: 'Last drop reason', width: '45%' },
        { key: 'fix', label: 'What to check', width: '55%' },
      ],
      rows: [
        { reason: 'No user email in the log line', fix: 'The user field is empty, a dash, or not an email address. Check proxy authentication and the field names for the parser.' },
        { reason: 'No destination host in the log line', fix: 'The destination field (or URL) is missing from the line.' },
        { reason: 'Line does not match the parser type', fix: 'The Parser type does not fit the log format, or the line repeats a field such as user or dst. Try the Generic key-value parser.' },
        { reason: 'Sent from an IP that isn\'t allowed or is shared with another source', fix: 'The line came from an IP other than the source\'s Allowed sender IP, or two sources list the same IP in IP-only mode. Behind a load balancer, clear the Allowed sender IP.' },
        { reason: 'Over the hourly event limit', fix: 'The hourly rate limit in Settings was reached, or the server is writing events slower than they arrive.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Lines with no valid key do not belong to any source, so they do not show in these counts. VerifyWise closes a connection that sends 100 such lines, or no valid line within 60 seconds.',
    },
    {
      type: 'heading',
      id: 'syslog-limits',
      level: 3,
      text: 'Limits',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Message size', text: 'Up to 64 KiB per message. Larger messages are discarded.' },
        { bold: 'Connections', text: 'Up to 500 at the same time per server process. A connection with no traffic for 5 minutes is closed, and a TLS handshake must finish within 30 seconds.' },
        { bold: 'Framing', text: 'Newline-delimited and octet-counted messages are both accepted. An RFC 3164 or RFC 5424 header is removed when present.' },
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
          symptom: 'Syslog source shows "Never" under Last received',
          cause: 'The listener is off, the port is not reachable, or the lines carry no valid key',
          fix: 'Check the status line above the table in Settings. Confirm your proxy reaches the host on port 6514 over TCP and that every line contains `vw_source=<key>` with the key you copied. If you lost the key, click "Regenerate key". Lines with no valid key are not counted anywhere.',
        },
        {
          symptom: 'Dropped count rises',
          cause: 'Lines reach VerifyWise but cannot be turned into events',
          fix: 'Read Last drop reason on the source row and follow the table in Step 4.',
        },
        {
          symptom: 'A key stopped working',
          cause: 'The key was regenerated or the source was removed',
          fix: 'Use the new key. A server replica other than the one you used can accept the old key for up to 60 seconds.',
        },
        {
          symptom: 'Syslog listener is off in Settings',
          cause: 'SHADOW_AI_SYSLOG_ENABLED is not set to true, or the listener could not start',
          fix: 'Set SHADOW_AI_SYSLOG_ENABLED=true, add a TLS certificate and key (or SHADOW_AI_SYSLOG_ALLOW_PLAINTEXT=true) and restart. The server log names the variable that blocked the start. The hosted service does not offer syslog yet.',
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
