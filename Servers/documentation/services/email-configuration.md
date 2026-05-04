# Email Service Configuration

The VerifyWise email service supports multiple email providers through a simple configuration system.

## Supported Providers

### 1. Resend (Default)

High-deliverability email service with simple API.

**Environment Variables:**

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=your_resend_api_key
EMAIL_ID=noreply@yourdomain.com
```

### 2. SMTP

Standard SMTP configuration for any email server.

**Environment Variables:**

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_SECURE=true
EMAIL_ID=noreply@yourdomain.com
```

## Configuration Options

| Variable         | Required | Description                       | Default  |
| ---------------- | -------- | --------------------------------- | -------- |
| `EMAIL_PROVIDER` | No       | Provider type: `resend` or `smtp` | `resend` |
| `EMAIL_ID`       | Yes      | From email address                | -        |

### Resend Provider

| Variable         | Required | Description    |
| ---------------- | -------- | -------------- |
| `RESEND_API_KEY` | Yes      | Resend API key |

### SMTP Provider

| Variable      | Required | Description                           |
| ------------- | -------- | ------------------------------------- |
| `SMTP_HOST`   | Yes      | SMTP server hostname                  |
| `SMTP_PORT`   | Yes      | SMTP server port (usually 587 or 465) |
| `SMTP_USER`   | Yes      | SMTP username/email                   |
| `SMTP_PASS`   | Yes      | SMTP password                         |
| `SMTP_SECURE` | No       | Use TLS (true/false)                  |

## Examples

### Gmail SMTP

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_SECURE=true
EMAIL_ID=noreply@yourdomain.com
```

### Office 365 SMTP

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@company.com
SMTP_PASS=your-password
SMTP_SECURE=true
EMAIL_ID=noreply@company.com
```

### Local Development (MailHog)

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=test
SMTP_PASS=test
SMTP_SECURE=false
EMAIL_ID=test@localhost
```

## Usage

The email service automatically detects the configured provider and uses it transparently. No code changes are needed when switching providers.

```typescript
import { sendEmail } from "../services/emailService";

// This works with any configured provider
await sendEmail("user@example.com", "Welcome to VerifyWise", templateContent, templateData);
```
