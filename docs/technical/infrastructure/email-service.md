# Email Service

## Overview

VerifyWise uses a multi-provider email service supporting MJML templates, multiple email providers (Resend, SMTP, AWS SES, Azure, Exchange), and enterprise-grade security features. The service handles transactional emails, automation workflows, and notification delivery with rate limiting and credential rotation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EMAIL SERVICE FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                       │
│  │   Application    │                                                       │
│  │   (Controller)   │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           │ 1. sendEmail() or sendAutomationEmail()                         │
│           ▼                                                                 │
│  ┌──────────────────┐                                                       │
│  │  Notification    │                                                       │
│  │  Service         │                                                       │
│  │  (Rate Limiting) │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           │ 2. Queue with rate limiting (2 emails/sec)                      │
│           ▼                                                                 │
│  ┌──────────────────┐     ┌──────────────────┐                             │
│  │  MJML Compiler   │────►│  HTML Output     │                             │
│  │  (Templates)     │     │                  │                             │
│  └────────┬─────────┘     └──────────────────┘                             │
│           │                                                                 │
│           │ 3. Variable replacement: {{key}} → escaped value                │
│           ▼                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      Email Provider Factory                           │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐             │  │
│  │  │  Resend  │  │   SMTP   │  │ AWS SES  │  │  Azure   │  ...        │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│           │                                                                 │
│           │ 4. Send via configured provider                                 │
│           ▼                                                                 │
│  ┌──────────────────┐                                                       │
│  │  Email Delivery  │                                                       │
│  └──────────────────┘                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Email Providers

### Provider Comparison

| Provider | Environment Variables | Use Case |
|----------|----------------------|----------|
| **Resend** | `RESEND_API_KEY` | Modern API, development (default) |
| **SMTP** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Gmail, SendGrid, Mailgun |
| **Exchange Online** | `EXCHANGE_ONLINE_USER`, `EXCHANGE_ONLINE_PASS`, `EXCHANGE_ONLINE_TENANT_ID` | Microsoft 365 |
| **On-Prem Exchange** | `EXCHANGE_ONPREM_HOST`, `EXCHANGE_ONPREM_PORT`, ... | Self-hosted Exchange |
| **AWS SES** | `AWS_SES_REGION`, `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY` | AWS environments |
| **Azure** | `AZURE_COMMUNICATION_CONNECTION_STRING` | Azure cloud |

### Provider Selection

```env
# Set provider (defaults to "resend" if not set)
EMAIL_PROVIDER=resend

# Required for all providers
EMAIL_ID=noreply@yourdomain.com
```

### Resend Configuration

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_ID=noreply@yourdomain.com
```

### SMTP Configuration

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_SECURE=false
EMAIL_ID=noreply@yourdomain.com
```

### AWS SES Configuration

```env
EMAIL_PROVIDER=ses
AWS_SES_REGION=us-east-1
AWS_SES_ACCESS_KEY_ID=AKIAXXXXXXXX
AWS_SES_SECRET_ACCESS_KEY=xxxxxxxxxx
AWS_CREDENTIAL_REFRESH_INTERVAL_MS=3600000  # 1 hour (optional)
SES_CONFIGURATION_SET=my-config-set  # Optional
EMAIL_ID=noreply@yourdomain.com
```

### Azure Configuration

```env
EMAIL_PROVIDER=azure
AZURE_COMMUNICATION_CONNECTION_STRING=endpoint=https://xxx.communication.azure.com/;accesskey=xxx
EMAIL_ID=noreply@yourdomain.com
```

### Exchange Online Configuration

```env
EMAIL_PROVIDER=exchange_online
EXCHANGE_ONLINE_USER=user@domain.com
EXCHANGE_ONLINE_PASS=password
EXCHANGE_ONLINE_TENANT_ID=tenant-guid
EMAIL_ID=noreply@domain.com
```

### On-Premises Exchange Configuration

```env
EMAIL_PROVIDER=exchange_onprem
EXCHANGE_ONPREM_HOST=mail.company.com
EXCHANGE_ONPREM_PORT=587
EXCHANGE_ONPREM_USER=domain\username
EXCHANGE_ONPREM_PASS=password
EXCHANGE_ONPREM_DOMAIN=DOMAIN
EXCHANGE_ONPREM_SECURE=false
# Optional custom CA certificate
EXCHANGE_CUSTOM_CA_PATH=/certs/company-ca.pem
EXCHANGE_CA_ALLOWED_DIR=/certs
EXCHANGE_ALLOW_SELF_SIGNED=false
EMAIL_ID=noreply@company.com
```

## MJML Templates

### Template Location

Templates are stored in `Servers/templates/` as `.mjml` files.

### Available Templates

| Template | Purpose | Key Variables |
|----------|---------|---------------|
| `account-creation-email.mjml` | New account invitation | `{{link}}`, plus translated copy (`{{heading}}`, `{{greeting}}`, `{{intro}}`, `{{instruction}}`, `{{button}}`, `{{ignore}}`, `{{thanks}}`, `{{footer}}`) |
| `password-reset-email.mjml` | Password reset | `{{name}}`, `{{email}}`, `{{url}}` |
| `project-created-admin.mjml` | New project notification | `{{admin_name}}`, `{{project_name}}`, `{{project_url}}` |
| `user-added-project-admin.mjml` | Added as admin | `{{user_name}}`, `{{project_name}}`, `{{actor_name}}` |
| `user-added-project-editor.mjml` | Added as editor | Same as above |
| `user-added-project-reviewer.mjml` | Added as reviewer | Same as above |
| `user-added-project-auditor.mjml` | Added as auditor | Same as above |
| `member-role-changed-editor-to-admin.mjml` | Role change | `{{user_name}}`, `{{project_name}}`, `{{new_role}}` |
| `policy-due-soon.mjml` | Policy deadline | `{{admin_name}}`, `{{policy_name}}`, `{{due_date}}` |
| `pmm-initial-notification.mjml` | PMM cycle start | `{{stakeholder_name}}`, `{{use_case_title}}`, `{{cycle_number}}` |
| `pmm-reminder.mjml` | PMM reminder | Same as above + `{{days_remaining}}` |
| `pmm-escalation.mjml` | PMM escalation | Escalation details |
| `pmm-completed.mjml` | PMM completed | `{{completed_by_name}}`, `{{completed_at}}` |
| `pmm-flagged-concern.mjml` | Concern flagged | `{{flagged_questions_html}}` |

**Language.** `sendInviteEmail` fills the invitation copy from the backend dictionaries. A known recipient gets the language saved in Settings. An address with no user yet gets the inviter's language. Spanish is a frontend language, so a saved Spanish preference is sent in English, the same as other backend mail.

**Link lifetimes.** An invitation link (`account-creation-email.mjml`) is valid for 30 days after it is sent or resent (`INVITATION_LIFETIME_MS` in `Servers/utils/jwt.utils.ts`). The same constant sets `invitations.expires_at`, which the Team page uses to show "Pending" or "Expired". Invitations sent before this was raised from 7 days keep their original 7-day link; resending issues a new 30-day one. Password-reset links last 1 hour.

### Template Structure

Templates on the shared palette use one `<mj-head>` (fonts, default attributes and the CSS classes below) through `Servers/templates/partials/email-head.mjml`. Colors come from the shared palette as `{{color...}}` tokens, never as hex. Not every template is migrated yet: the account, access, approval, review and training emails are; others (for example `pmm-*`, `mrm-*`, `intake-*`, `task-*`) still carry their own head and hex colors until they move over.

```xml
<!-- Illustrative template using the shared head -->
<mjml>
<mj-include path="./partials/email-head.mjml" />
  <mj-body background-color="{{colorPageBackground}}">
    <mj-wrapper css-class="email-card" padding="40px">
      <mj-section>
        <mj-column width="100%">
          <mj-text>
            <h2 class="email-heading">Reminder: Post-market monitoring due soon</h2>
            <p class="email-body">Hi {{stakeholder_name}},</p>
            <p style="margin: 28px 0 24px 0;">
              <a href="{{monitoring_link}}" class="btn btn-primary">Complete monitoring</a>
            </p>
          </mj-text>
        </mj-column>
      </mj-section>
    </mj-wrapper>
  </mj-body>
</mjml>
```

### Template Colors

`compileMjmlToHtml` first expands `<mj-include path="./partials/<name>.mjml" />` (only files in `templates/partials/`; a missing partial throws), then replaces every `{{colorX}}` token with its value from `emailColorTokens` in `Servers/tools/emailColors.ts`. Those values come from the shared palette in `shared/design-tokens`.

- **Use the role tokens for page and buttons:** `colorPageBackground`, `colorButtonText`, `colorButtonPrimary`, `colorButtonSuccess`, `colorButtonError`, `colorButtonWarning`, `colorButtonInfo`. Their mapping to palette colors lives in one place, `emailColorTokens`.
- **Use the CSS classes from the shared head** (`email-card`, `email-heading`, `email-body`, `box-*`, `btn btn-*`) instead of inline colors.
- **Server-built HTML** inserted through a `*Html` / `*_html` key is not tokenized (it is inserted after the token step). Build its inline colors from `emailColorTokens` in TypeScript.
- An unknown token is left in place and logged once. `Servers/services/tests/emailTemplates.palette.test.ts` fails on an unknown token and on any hex color in a template that uses tokens or the shared head.

### Template Variable Replacement

`compileMjmlToHtml(template, data)` in `Servers/tools/mjmlCompiler.ts` fills every `{{key}}` in one pass:

- **Values are HTML-escaped by default.** Names, titles, descriptions and other user-entered text can never inject markup, in element content or in attributes such as `href="{{url}}"`. Pass plain text; don't escape it yourself, or it will be escaped twice.
- **Keys ending in `Html` or `_html` are inserted raw** (for example `downloadButtonHtml`, `entity_links_html`, `changedSectionHtml`). Use this suffix only for markup the server builds itself, and escape every piece of user text inside it with `escapeHtml` from `Servers/utils/sanitization.utils.ts`.
- Values are inserted literally: a `$&` or `$'` in a value is not a replacement pattern, and a `{{key}}` inside a value is not substituted.
- Placeholders with no matching key are left as they are.

```typescript
// Plain text: escaped automatically
await compileMjmlToHtml(template, { use_case_title: title, url: link });

// Server-built markup: suffix the key, escape the user text inside
const rowsHtml = items.map((i) => `<tr><td>${escapeHtml(i.name)}</td></tr>`).join("");
await compileMjmlToHtml(template, { items_html: rowsHtml });
```

User-configured automation emails (the `send_email` action) don't use MJML. Their body is plain text from the automation's textarea, with `{{entity.field}}` values filled in by `replaceTemplateVariables`. `actions/sendEmail.ts` escapes the whole body, then turns line breaks into `<br>`.

### Template Constants

```typescript
// File: Servers/constants/emailTemplates.ts

export const EMAIL_TEMPLATES = {
  ACCOUNT_CREATION: "account-creation-email.mjml",
  PASSWORD_RESET: "password-reset-email.mjml",
  PROJECT_CREATED_ADMIN: "project-created-admin.mjml",
  USER_ADDED_PROJECT_ADMIN: "user-added-project-admin.mjml",
  USER_ADDED_PROJECT_AUDITOR: "user-added-project-auditor.mjml",
  USER_ADDED_PROJECT_EDITOR: "user-added-project-editor.mjml",
  USER_ADDED_PROJECT_REVIEWER: "user-added-project-reviewer.mjml",
  MEMBER_ROLE_CHANGED_EDITOR_TO_ADMIN: "member-role-changed-editor-to-admin.mjml",
  POLICY_DUE_SOON: "policy-due-soon.mjml",
};

export const getEmailTemplate = (key: EmailTemplateKey): string => {
  return EMAIL_TEMPLATES[key];
};
```

## Email Service Functions

### Template-Based Email

```typescript
// File: Servers/services/emailService.ts

import { sendEmail } from "./emailService";

// Usage
await sendEmail(
  "user@example.com",                    // Recipient
  "Welcome to VerifyWise",               // Subject
  accountCreationTemplate,                // MJML template content
  {                                       // Template variables
    name: "John Doe",
    link: "https://app.verifywise.ai/setup",
  }
);
```

`sendEmail` compiles its third argument as MJML source. Passing a file name such as `EMAIL_TEMPLATES.X` fails with "Parsing failed. Check your mjml." — to send by file name, use `notificationService.sendEmailWithTemplate` (below), which reads the file from `Servers/templates/`.

### Automation Email (HTML Body)

```typescript
import { sendAutomationEmail } from "./emailService";

// Usage
await sendAutomationEmail(
  ["user1@example.com", "user2@example.com"],  // Recipients
  "Scheduled Report",                           // Subject
  "<p>Please find attached your report.</p>",  // HTML body
  [                                             // Optional attachments
    {
      filename: "report.pdf",
      content: pdfBuffer,
      contentType: "application/pdf",
    },
  ]
);
```

### Notification Service (Rate Limited)

```typescript
// File: Servers/services/notificationService.ts

import { notificationService } from "./notificationService";

// Uses rate limiting (2 emails/second max)
await notificationService.sendEmailWithTemplate(
  "user@example.com",
  "Policy Due Soon",
  "policy-due-soon.mjml",
  {
    admin_name: "John",
    policy_name: "Data Privacy Policy",
    due_date: "2024-01-15",
  }
);
```

## Rate Limiting

The notification service implements token bucket rate limiting:

```typescript
// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  maxTokens: 3,              // Max burst capacity
  refillRate: 1,             // Tokens per interval
  refillInterval: 500,       // 500ms = 2 emails/second
  minDelay: 600,             // Minimum delay between sends
  maxBackoff: 10000,         // Max delay on failures
};

// Exponential backoff on failures
// 600ms → 1.2s → 2.4s → ... → max 10s
```

### Persistent Rate Limit State

Rate limit state is saved to `.rate-limit-state.json` for restart resilience.

## Security Features

### Email Validation

```typescript
// File: Servers/services/email/types.ts

// RFC 5322 compliant validation
// - Max 320 characters total
// - Local part: max 64 chars, no consecutive dots
// - Domain: max 255 chars, valid TLD
// - ASCII only (prevents homograph attacks)

// Injection prevention
// - No newlines in to/from/subject (header injection)
// - Block malicious patterns: javascript:, data:, vbscript:, onload=
// - Subject max 998 characters
// - HTML content max 1MB
```

### TLS Configuration (SMTP)

```typescript
// Secure defaults for SMTP providers
const tlsConfig = {
  minVersion: "TLSv1.2",
  ciphers: "HIGH:!aNULL:!MD5:!3DES",
  rejectUnauthorized: process.env.NODE_ENV === "production",
};
```

### Credential Rotation (AWS SES)

```typescript
// AWS SES supports automatic credential refresh
interface RefreshableCredentials {
  refreshCredentials(): Promise<void>;
}

// Triggered on authentication failures:
// - InvalidClientTokenId
// - SignatureDoesNotMatch
```

### Error Sanitization

```typescript
// PII removal from error logs
const sanitizedError = errorMessage.replace(
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  "[REDACTED]"
);
```

## Provider Factory

```typescript
// File: Servers/services/email/providers/EmailProviderFactory.ts

import { EmailProvider } from "../types";

export const createEmailProvider = (): EmailProvider => {
  const provider = process.env.EMAIL_PROVIDER || "resend";

  switch (provider.toLowerCase()) {
    case "resend":
      return new ResendProvider();
    case "smtp":
      return new SMTPProvider();
    case "ses":
      return new AmazonSESProvider();
    case "azure":
      return new AzureCommunicationServicesProvider();
    case "exchange_online":
      return new ExchangeOnlineProvider();
    case "exchange_onprem":
      return new OnPremisesExchangeProvider();
    default:
      throw new Error(`Unknown email provider: ${provider}`);
  }
};
```

## Controller Usage Example

```typescript
// File: Servers/controllers/vwmailer.ctrl.ts

export const sendAccountCreationEmail = async (req: Request, res: Response) => {
  const { email, name } = req.body;

  try {
    // Read template
    const templatePath = path.join(TEMPLATES_DIR, "account-creation-email.mjml");
    const template = fs.readFileSync(templatePath, "utf8");

    // Generate setup link
    const token = generateSetupToken(email);
    const link = `${process.env.APP_URL}/setup?token=${token}`;

    // Send email
    await sendEmail(email, "Welcome to VerifyWise", template, {
      name,
      link,
    });

    res.status(200).json({ message: "Email sent successfully" });
  } catch (error) {
    console.error("Failed to send email:", error);
    res.status(500).json({ message: "Failed to send email" });
  }
};
```

## Adding a New Template

1. **Create MJML file** in `Servers/templates/`:

```xml
<!-- my-new-template.mjml -->
<mjml>
  <mj-head>
    <mj-font name="Roboto" href="https://fonts.googleapis.com/css?family=Roboto:300,500" />
    <mj-attributes>
      <mj-all font-family="Roboto, Helvetica, sans-serif" />
      <mj-text font-weight="300" font-size="14px" color="#616161" />
    </mj-attributes>
  </mj-head>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>
          <h2>Hello {{user_name}}</h2>
          <p>{{message_content}}</p>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

2. **Add to constants** (optional):

```typescript
// Servers/constants/emailTemplates.ts
export const EMAIL_TEMPLATES = {
  // ...existing templates
  MY_NEW_TEMPLATE: "my-new-template.mjml",
};
```

3. **Use in code**:

```typescript
import { sendEmail } from "./services/emailService";
import { EMAIL_TEMPLATES } from "./constants/emailTemplates";

const template = fs.readFileSync(
  path.join(TEMPLATES_DIR, EMAIL_TEMPLATES.MY_NEW_TEMPLATE),
  "utf8"
);

await sendEmail(recipient, subject, template, {
  user_name: "John",
  message_content: "Your message here",
});
```

## Testing

### Test Script

```bash
# Test email sending
cd Servers
ts-node scripts/testEmailProviders.ts test@example.com
```

### Quick Test

```bash
ts-node scripts/quickEmailTest.ts your-test@email.com
```

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `nodemailer` | 7.0.11 | SMTP transport |
| `resend` | 4.6.0 | Resend API |
| `mjml` | 4.16.1 | Template compiler |
| `@aws-sdk/client-ses` | 3.901.0 | AWS SES |
| `@azure/communication-email` | 1.1.0 | Azure email |

## Key Files

| File | Purpose |
|------|---------|
| `Servers/services/emailService.ts` | Main email service |
| `Servers/services/notificationService.ts` | Rate-limited sending |
| `Servers/services/email/providers/` | Provider implementations |
| `Servers/services/email/types.ts` | Interfaces and validation |
| `Servers/tools/mjmlCompiler.ts` | MJML compilation |
| `Servers/constants/emailTemplates.ts` | Template constants |
| `Servers/templates/` | MJML template files |

## Related Documentation

- [Architecture Overview](../architecture/overview.md)
- [Automations](./automations.md)
- [Post-Market Monitoring](../domains/post-market-monitoring.md)
