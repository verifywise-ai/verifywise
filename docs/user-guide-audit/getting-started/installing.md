# Audit: getting-started/installing
**Article path:** shared/user-guide-content/content/getting-started/installing.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The installing.ts article is accurate and comprehensive. All verifiable claims regarding environment variables, ports, installation scripts, file paths, and development setup match the actual codebase configurations. The vite default port of 5173 for development and 8080 for production are correctly documented. Scripts and env file references all exist and match the documented paths.

## Findings
None. All claims verified.

## Verified claims (sampled)
- Claim: "Frontend: `http://localhost:5173`. Backend API: `http://localhost:3000`." (block 11) — verified at `Clients/vite.config.ts:20-22` (default port 5173) and `.env.dev:3-6` (backend port 3000, frontend port 5173)
- Claim: "Terminal 1: backend with auto-restart" → `cd Servers && npm run watch` (block 7) — verified at `Servers/package.json:14` (watch script runs tsc-watch with auto-restart)
- Claim: "Terminal 2: frontend with hot reload" → `cd Clients && npm run dev` (block 7) — verified at `Clients/package.json:7-9` (dev:vite and dev scripts run vite with --host)
- Claim: "Port 3000 (backend API)" (block 3) — verified at `docker-compose.yml:36` (BACKEND_PORT maps to 3000)
- Claim: "Port 8080 (frontend, production) or 5173 (frontend, development)" (block 3) — verified at `.env.prod:5` and `.env.dev:5`

## Skipped / non-verifiable
- "Setup time: 20-30 minutes" (block 0) — opinion/time estimate; unverifiable without user testing.
- "Use this unless you plan to modify the source code" (block 4) — motivation statement; non-verifiable.
- "Use this if you want to contribute or customize" (block 4) — motivation statement; non-verifiable.
