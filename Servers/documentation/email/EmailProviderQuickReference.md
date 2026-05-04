# Email Provider Quick Reference

## Provider Selection

| Provider             | Use Case             | Setup Complexity | Cost             | Enterprise Features |
| -------------------- | -------------------- | ---------------- | ---------------- | ------------------- |
| **Exchange Online**  | Microsoft 365 orgs   | Low              | Included in M365 | ⭐⭐⭐⭐⭐          |
| **Exchange On-Prem** | Self-hosted Exchange | Medium           | Hardware costs   | ⭐⭐⭐⭐⭐          |
| **Amazon SES**       | AWS-native apps      | Medium           | Pay-per-use      | ⭐⭐⭐⭐            |
| **Resend**           | Modern development   | Low              | Pay-per-use      | ⭐⭐⭐              |
| **SMTP Generic**     | Any other provider   | Varies           | Varies           | Varies              |

## Quick Setup Commands

### Exchange Online (Most Common)

```bash
EMAIL_PROVIDER=exchange-online
EXCHANGE_ONLINE_USER=service@company.onmicrosoft.com
EXCHANGE_ONLINE_PASS="app-password-here"
```

### Amazon SES (SaaS/AWS)

```bash
EMAIL_PROVIDER=amazon-ses
AWS_SES_REGION=us-east-1
AWS_SES_ACCESS_KEY_ID=AKIA...
AWS_SES_SECRET_ACCESS_KEY=secret...
```

### On-Premises Exchange

```bash
EMAIL_PROVIDER=exchange-onprem
EXCHANGE_ONPREM_HOST=mail.company.com
EXCHANGE_ONPREM_PORT=587
EXCHANGE_ONPREM_USER=serviceaccount
EXCHANGE_ONPREM_PASS="password"
```

## Testing

```bash
cd Servers
ts-node scripts/quickEmailTest.ts your-test@email.com
```

## Environment Variables Reference

| Variable                    | Required For     | Description                                                                         |
| --------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| `EMAIL_PROVIDER`            | All              | Provider type: `exchange-online`, `amazon-ses`, `exchange-onprem`, `smtp`, `resend` |
| `EMAIL_ID`                  | All              | Default "from" email address                                                        |
| `EXCHANGE_ONLINE_USER`      | Exchange Online  | Office 365 email address                                                            |
| `EXCHANGE_ONLINE_PASS`      | Exchange Online  | App password (recommended)                                                          |
| `AWS_SES_REGION`            | Amazon SES       | AWS region (e.g., us-east-1)                                                        |
| `AWS_SES_ACCESS_KEY_ID`     | Amazon SES       | AWS access key                                                                      |
| `AWS_SES_SECRET_ACCESS_KEY` | Amazon SES       | AWS secret key                                                                      |
| `EXCHANGE_ONPREM_HOST`      | On-Prem Exchange | Exchange server hostname                                                            |
| `EXCHANGE_ONPREM_PORT`      | On-Prem Exchange | SMTP port (usually 587)                                                             |
| `RESEND_API_KEY`            | Resend           | Resend API key                                                                      |

## Enterprise Recommendations

1. **Primary choice**: Exchange Online (if using Microsoft 365)
2. **AWS-native**: Amazon SES
3. **Self-hosted**: On-Premises Exchange
4. **Backup provider**: Generic SMTP with SendGrid/Mailgun
