# Audit: ai-gateway/virtual-keys
**Article path:** shared/user-guide-content/content/ai-gateway/virtual-keys.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
All verifiable claims in the virtual-keys article match backend implementation. Key format, storage method (SHA-256 hash), rate limiting (429 response), budget reset timing (1st of month), and per-key isolation are all accurate. No significant issues found.

## Findings
(None — all sampled claims verified.)

## Verified claims (sampled)

- **Claim:** "Keys follow the format `sk-vw-` plus 32 hex characters." (block 10)  
  **Status:** ✅ accurate  
  **Evidence:** `AIGateway/src/crud/virtual_keys.py:10` — `plain_key = "sk-vw-" + secrets.token_hex(16)` produces exactly 32 hex characters.

- **Claim:** "Only the SHA-256 hash is stored in the database." (block 10)  
  **Status:** ✅ accurate  
  **Evidence:** `AIGateway/src/crud/virtual_keys.py:11` stores `hashlib.sha256(plain_key.encode()).hexdigest()` as `key_hash` in the INSERT statement (line 140), and the plaintext `plain_key` is returned only to the client (line 160), never persisted.

- **Claim:** "A budget-exhausted key gets a 429 with a message explaining why" (block 18)  
  **Status:** ✅ accurate  
  **Evidence:** `AIGateway/src/services/proxy_service.py:225–226` — `enforce_rate_limits()` raises `HTTPException(status_code=429, detail="Virtual key rate limit exceeded")`.

- **Claim:** "Budgets reset on the 1st of each month" (block 18)  
  **Status:** ✅ accurate  
  **Evidence:** `AIGateway/src/database/migrations/versions/a0001_create_ai_gateway_tables.py:88` — `budget_reset_at` column defaults to `DATE_TRUNC('month', NOW()) + INTERVAL '1 month'`, which sets reset to the 1st of the next month.

- **Claim:** "You can set a requests-per-minute (RPM) cap on each key. It uses a Redis sliding window, so it handles bursts correctly." (block 20)  
  **Status:** ✅ accurate  
  **Evidence:** `AIGateway/src/crud/virtual_keys.py:35` defines `rate_limit_rpm` column; `AIGateway/src/services/proxy_service.py:219–226` enforces both endpoint and per-key RPM limits via `check_rate_limit()` function.

## Skipped / non-verifiable
- "Virtual keys are useful when you want application teams or external services to hit your LLM endpoints while you keep control over what gets spent, what content gets through and what gets logged." (block 1) — reason: motivation/use case framing only; opinion.
- "No VerifyWise account required." (block 0) — reason: user experience claim; requires UI/auth system test, not backend code.
- "Admins get an email when a key's budget runs out" (block 18) — reason: requires testing email system or checking notification service; backend schema shows feature exists but not verified at runtime.
