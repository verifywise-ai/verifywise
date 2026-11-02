import type { ArticleContent } from '../../contentTypes';

export const settingsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Settings page is where you configure data sources, access controls and operational parameters for Shadow AI detection. It\'s divided into six sections: API keys, syslog sources, data formats, rate limiting, data retention and risk score calculation. Only Admins can manage API keys, syslog sources and the rate limit.',
    },
    {
      type: 'heading',
      id: 'api-keys',
      level: 2,
      text: 'API keys',
    },
    {
      type: 'paragraph',
      text: 'API keys authenticate events sent to the REST API, for example from a SIEM webhook, a script or a browser extension. Syslog sources do not use these keys; each source has its own key (see below).',
    },
    {
      type: 'heading',
      id: 'creating-keys',
      level: 3,
      text: 'Creating a key',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click "Create API key"' },
        { text: 'Optionally enter a label (e.g., "Zscaler proxy")' },
        { text: 'Click "Create"' },
        { text: 'Copy the full key immediately, it won\'t be shown again' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Important',
      text: 'The full API key is only displayed once at creation time. Store it securely. If you lose it, revoke the old key and create a new one.',
    },
    {
      type: 'heading',
      id: 'managing-keys',
      level: 3,
      text: 'Managing keys',
    },
    {
      type: 'paragraph',
      text: 'The API keys table shows each key\'s prefix, label, status (Active or Revoked), creation date and last-used date. You can:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Revoke', text: 'Deactivates the key. Integrations using this key will stop working. This cannot be undone. The server you are connected to refuses the key at once; with several backend replicas, the others can accept it for up to 5 minutes.' },
        { bold: 'Delete', text: 'Permanently removes a revoked key from the list. Only revoked keys can be deleted.' },
      ],
    },
    {
      type: 'heading',
      id: 'syslog-sources',
      level: 2,
      text: 'Syslog sources',
    },
    {
      type: 'paragraph',
      text: 'Syslog sources define where network traffic data comes from. Each source has a parser type, a secret key that every log line carries, and an optional allowed sender IP. Only Admins can manage them. The setup steps are in the Integration guide.',
    },
    {
      type: 'paragraph',
      text: 'A line above the table shows whether the syslog listener is on and where to send logs (port 6514 by default, over TLS or plain TCP). The listener is off until the server operator sets `SHADOW_AI_SYSLOG_ENABLED=true`. If it is turned on but could not start, the line says so; the server log has the reason. The hosted service does not offer syslog yet.',
    },
    {
      type: 'heading',
      id: 'parser-types',
      level: 3,
      text: 'Parser types',
    },
    {
      type: 'table',
      columns: [
        { key: 'parser', label: 'Parser', width: '30%' },
        { key: 'description', label: 'Description', width: '70%' },
      ],
      rows: [
        { parser: 'Zscaler', description: 'Reads key=value lines with user, dst, method, uri, action, department and timestamp' },
        { parser: 'Netskope', description: 'Reads a JSON object with user, url (else domain or site), method, action, department and timestamp' },
        { parser: 'Squid proxy', description: 'Reads the native Squid access log. A `DENIED` result code is blocked, anything else is allowed' },
        { parser: 'Generic key-value', description: 'Reads key=value lines and CEF extensions with suser, dhost, request, requestMethod, act, department and timestamp (or CEF rt, end, start). The default for a new source' },
      ],
    },
    {
      type: 'heading',
      id: 'syslog-source-table',
      level: 3,
      text: 'The source table',
    },
    {
      type: 'table',
      columns: [
        { key: 'column', label: 'Column', width: '30%' },
        { key: 'meaning', label: 'Meaning', width: '70%' },
      ],
      rows: [
        { column: 'Allowed sender IP', meaning: 'If set, lines from other IPs are dropped. A value that is not an IP address is flagged for you to clear or fix.' },
        { column: 'Parser', meaning: 'The parser type for this source.' },
        { column: 'Key', meaning: 'The first characters of the key, or "No key yet". Use "Generate key" or "Regenerate key" to create one.' },
        { column: 'Last received', meaning: 'When the last event from this source was stored, or "Never".' },
        { column: 'Accepted', meaning: 'Events stored.' },
        { column: 'Dropped', meaning: 'Lines that could not become events.' },
        { column: 'Last drop reason', meaning: 'Why the last line was dropped, in plain words (see the table below).' },
        { column: 'Status', meaning: 'Active or Inactive.' },
      ],
    },
    {
      type: 'table',
      columns: [
        { key: 'reason', label: 'Last drop reason', width: '45%' },
        { key: 'meaning', label: 'Meaning', width: '55%' },
      ],
      rows: [
        { reason: 'No user email in the log line', meaning: 'The user field is missing, empty or not an email address.' },
        { reason: 'No destination host in the log line', meaning: 'The line has no destination host or URL.' },
        { reason: 'Line does not match the parser type', meaning: 'The parser could not read the line, or the line repeats a field such as user, destination, action, method, department or timestamp.' },
        { reason: 'Sent from an IP that isn\'t allowed or is shared with another source', meaning: 'The sender IP is not the source\'s Allowed sender IP, or two sources share an IP in IP-only mode.' },
        { reason: 'Over the hourly event limit', meaning: 'The hourly rate limit was reached, or the listener\'s queue was full.' },
      ],
    },
    {
      type: 'heading',
      id: 'syslog-source-keys',
      level: 3,
      text: 'Source keys',
    },
    {
      type: 'paragraph',
      text: 'When you add a source, the "Your source key" dialog shows the key once, with a copy button and a ready-made `vw_source=<key>` line. VerifyWise stores only a hash and the first characters of the key, so it cannot show the key again. If you lose it, click "Regenerate key". The old key stops working at once on the server you used and within 60 seconds on any other replica. Removing a source stops processing events from it.',
    },

    // ─── Data Formats ──────────────────────────────────────────────────

    {
      type: 'heading',
      id: 'data-formats',
      level: 2,
      text: 'Data formats',
    },
    {
      type: 'paragraph',
      text: 'This section documents the exact data formats VerifyWise expects when ingesting Shadow AI events, whether through the REST API or via syslog forwarding.',
    },

    // REST API event schema
    {
      type: 'heading',
      id: 'rest-api-schema',
      level: 3,
      text: 'REST API event schema',
    },
    {
      type: 'paragraph',
      text: 'Send events via `POST /api/v1/shadow-ai/events` with a JSON request body containing an `events` array of up to 10,000 events. Authenticate using the `X-API-Key` header with a valid API key.',
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
      type: 'table',
      columns: [
        { key: 'field', label: 'Field', width: '25%' },
        { key: 'required', label: 'Required', width: '15%' },
        { key: 'description', label: 'Description', width: '60%' },
      ],
      rows: [
        { field: 'user_email', required: 'Yes', description: 'Email address of the user who made the request. Stored in lowercase, with surrounding spaces removed. Up to 255 characters' },
        { field: 'destination', required: 'Yes', description: 'Hostname or domain of the AI tool (e.g., chat.openai.com). Stored in lowercase. Up to 512 characters' },
        { field: 'timestamp', required: 'Yes', description: 'ISO 8601 timestamp of the event. A timestamp that cannot be read fails the whole request' },
        { field: 'uri_path', required: 'No', description: 'URL path of the request (e.g., /v1/chat). Left out if longer than 2,048 characters' },
        { field: 'http_method', required: 'No', description: 'HTTP method (GET, POST, etc.). Stored in upper case' },
        { field: 'action', required: 'No', description: '"blocked" if the proxy refused the request. Any other value, or none, is stored as "allowed"' },
        { field: 'department', required: 'No', description: 'Department of the user (e.g., Engineering, Finance). Used in risk scoring and department alerts' },
        { field: 'job_title', required: 'No', description: 'Job title of the user' },
        { field: 'manager_email', required: 'No', description: 'Email address of the user\'s manager. Stored in lowercase' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Authentication',
      text: 'All requests must include the `X-API-Key` header with a valid API key created from the API keys section above. Requests without a valid key receive a 401 response. The Integration guide lists every error response.',
    },

    // Syslog format examples
    {
      type: 'heading',
      id: 'syslog-formats',
      level: 3,
      text: 'Syslog format examples',
    },
    {
      type: 'paragraph',
      text: 'Syslog messages arrive over TCP (TLS by default), newline-delimited or octet-counted, up to 64 KiB each. An RFC 3164 or RFC 5424 header is removed when present. Every line must carry the source key as `vw_source=<key>` at the start or the end of the line, or as a top-level `"vw_source"` member when the line is a JSON object. A key anywhere else is ignored. VerifyWise removes the key before parsing and never stores it. Below is one example per parser, with the field added.',
    },
    {
      type: 'heading',
      id: 'syslog-zscaler',
      level: 3,
      text: 'Zscaler (key=value)',
    },
    {
      type: 'code',
      language: 'text',
      code: 'user=alice@company.com dst=chat.openai.com method=POST uri=https://chat.openai.com/v1/chat action=allowed department=Engineering vw_source=YOUR_SOURCE_KEY',
    },
    {
      type: 'heading',
      id: 'syslog-netskope',
      level: 3,
      text: 'Netskope (JSON-in-syslog)',
    },
    {
      type: 'code',
      language: 'json',
      code: `{"user":"alice@company.com","url":"https://chat.openai.com/v1/chat","method":"POST","action":"allow","department":"Engineering","timestamp":"2026-02-09T14:32:00Z","vw_source":"YOUR_SOURCE_KEY"}`,
    },
    {
      type: 'paragraph',
      text: 'Send the whole object on one line. With newline-delimited framing, a pretty-printed object is split into lines that cannot be read.',
    },
    {
      type: 'heading',
      id: 'syslog-squid',
      level: 3,
      text: 'Squid (space-delimited)',
    },
    {
      type: 'code',
      language: 'text',
      code: '1707489120.000 200 10.0.0.1 TCP_MISS/200 1024 POST https://chat.openai.com/v1/chat alice@company.com DIRECT/chat.openai.com vw_source=YOUR_SOURCE_KEY',
    },
    {
      type: 'heading',
      id: 'syslog-generic',
      level: 3,
      text: 'Generic key-value (CEF-style)',
    },
    {
      type: 'code',
      language: 'text',
      code: 'suser=alice@company.com dhost=chat.openai.com requestMethod=POST act=allowed vw_source=YOUR_SOURCE_KEY',
    },

    // Field mapping table
    {
      type: 'heading',
      id: 'syslog-field-mapping',
      level: 3,
      text: 'Field mapping',
    },
    {
      type: 'paragraph',
      text: 'Each parser maps its fields to the normalized event schema. The user must be a valid email address; it is stored in lowercase. For the action, the first word of the value decides: block, deny, drop, reset or reject (and forms such as blocked, denied or dropped) become blocked, and allow, permit, pass or accept (and forms such as allowed or permitted) become allowed, so `Blocked by policy` is blocked. A negated allow such as `Not allowed` or `disallowed` is also blocked. Any other value, including words that only begin with one of these such as `password_reset`, or no action at all, is stored as allowed. The timestamp comes from the payload field when present, then from the syslog header, then from the time VerifyWise received the line. A timestamp without a time zone is read as UTC; a zone it states (an offset, `Z`, `PST`, `CEST`, also in brackets such as `(Tokyo JST)`) is used. A zone name VerifyWise does not know, such as `IST`, makes the payload time unreadable, so send an offset or `Z` if your source logs in another zone. A timestamp more than a year before the time the line was received, or more than a day after it, is ignored. A destination can be a host name, an IPv4 or IPv6 address (bare or in brackets) or a URL, and is stored in lowercase. A destination of `-`, `N/A` or `none` is skipped and the next field (such as the URL) is used. An email address longer than 255 characters or a destination longer than 512 drops the line, and a department is cut to 255 characters.',
    },
    {
      type: 'table',
      columns: [
        { key: 'normalized', label: 'Normalized field', width: '20%' },
        { key: 'zscaler', label: 'Zscaler', width: '20%' },
        { key: 'netskope', label: 'Netskope', width: '20%' },
        { key: 'squid', label: 'Squid', width: '20%' },
        { key: 'generic', label: 'Generic KV', width: '20%' },
      ],
      rows: [
        { normalized: 'user_email', zscaler: 'user', netskope: 'user', squid: 'field 8', generic: 'suser' },
        { normalized: 'destination', zscaler: 'dst, else host of uri', netskope: 'url (hostname), else domain or site', squid: 'url (hostname)', generic: 'dhost, else host of request' },
        { normalized: 'uri_path', zscaler: 'uri (path)', netskope: 'url (path)', squid: 'url (path)', generic: 'request (path)' },
        { normalized: 'http_method', zscaler: 'method', netskope: 'method', squid: 'field 6', generic: 'requestMethod' },
        { normalized: 'action', zscaler: 'action', netskope: 'action, else activity', squid: 'field 4 (result code)', generic: 'act' },
        { normalized: 'timestamp', zscaler: 'timestamp', netskope: 'timestamp', squid: 'field 1 (epoch)', generic: 'timestamp, else CEF rt, end or start' },
        { normalized: 'department', zscaler: 'department', netskope: 'department', squid: '—', generic: 'department' },
      ],
    },

    {
      type: 'heading',
      id: 'rate-limiting',
      level: 2,
      text: 'Rate limiting',
    },
    {
      type: 'paragraph',
      text: 'Rate limiting caps how many events your organization can ingest per hour, across the REST API and syslog. It protects the system from a misconfigured data source or a traffic spike. Only Admins can change it.',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Set a number to cap hourly ingestion. Set 0 or leave the field empty for no limit (the default).' },
        { text: 'The hour starts with the first event counted, not on the clock hour.' },
        { text: 'A REST request that would go over the limit is refused whole with a 429 response. Syslog events over the limit are dropped and show "Over the hourly event limit" on the source.' },
        { text: 'A change applies to the REST API at once and to syslog within 30 seconds.' },
      ],
    },
    {
      type: 'heading',
      id: 'data-retention',
      level: 2,
      text: 'Data retention',
    },
    {
      type: 'paragraph',
      text: 'Data retention settings control how long different types of Shadow AI data are stored before automatic cleanup. Three categories can be configured independently:',
    },
    {
      type: 'table',
      columns: [
        { key: 'category', label: 'Category', width: '25%' },
        { key: 'default', label: 'Default', width: '15%' },
        { key: 'description', label: 'Description', width: '60%' },
      ],
      rows: [
        { category: 'Raw events', default: '30 days', description: 'Individual event records from ingestion (highest volume)' },
        { category: 'Daily rollups', default: '365 days', description: 'Aggregated daily statistics (lower volume)' },
        { category: 'Alert history', default: '90 days', description: 'Records of triggered alert rules' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Set a value to 0 or leave it empty to keep data indefinitely. Cleanup runs once a day, so a change applies at the next run. Raw events are removed by the time of the event, not the time it arrived. Admins can change these periods, and so can a custom role that has the organization admin permission. Each change is recorded in the audit ledger.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Storage tip',
      text: 'Raw events consume the most storage. If disk space is a concern, consider a shorter retention period for raw events while keeping daily rollups longer for trend analysis.',
    },
    {
      type: 'heading',
      id: 'risk-score',
      level: 2,
      text: 'Risk score calculation',
    },
    {
      type: 'paragraph',
      text: 'The bottom of the Settings page explains how the risk score is calculated. Each AI tool receives a score from 0 to 100, recalculated nightly using four weighted factors:',
    },
    {
      type: 'table',
      columns: [
        { key: 'factor', label: 'Factor', width: '30%' },
        { key: 'weight', label: 'Weight', width: '15%' },
        { key: 'description', label: 'Description', width: '55%' },
      ],
      rows: [
        { factor: 'Approval status', weight: '40%', description: 'Unapproved tools (not in model inventory or not approved) receive the maximum score.' },
        { factor: 'Data & compliance', weight: '25%', description: 'Based on training-on-data policy, SOC 2, GDPR, SSO and encryption at rest.' },
        { factor: 'Usage volume', weight: '15%', description: 'Normalized against the organization average. Higher usage increases the score.' },
        { factor: 'Department sensitivity', weight: '20%', description: 'Uses the highest sensitivity among departments that used the tool in the last 30 days. Finance, Legal and HR are rated highest (80). Events without a department add nothing here.' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'shadow-ai',
          articleId: 'ai-tools',
          title: 'AI tools',
          description: 'See risk scores in context',
        },
        {
          collectionId: 'shadow-ai',
          articleId: 'rules',
          title: 'Rules',
          description: 'Set up risk score threshold alerts',
        },
        {
          collectionId: 'shadow-ai',
          articleId: 'insights',
          title: 'Insights',
          description: 'View organization-wide metrics',
        },
      ],
    },
  ],
};
