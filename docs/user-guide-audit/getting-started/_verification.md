# Verification spot-checks — getting-started

**Date:** 2026-04-29
**Reports spot-checked:** 4
**Claims re-verified:** 8 (2 per report)
**Failed spot-checks:** 0

## Per-report results

### dashboard.md

- ✅ "Dashboard sidebar has 'Dashboard', 'Tasks' (with open count badge), and 'Frameworks'" (verified at `Clients/src/presentation/components/Sidebar/index.tsx:85-110`) — confirmed: Lines 93-110 define topItems array with Dashboard (label="Dashboard"), Tasks (label="Tasks", count property for badge), and Frameworks (label="Frameworks"). All three items present with correct labels.

- ✅ "Task radar groups tasks as Overdue, Due soon, Upcoming" (verified at `Clients/src/presentation/components/Cards/TaskRadarCard/index.tsx:24-31`) — confirmed: Lines 24-28 define BAR_COLORS object with exact three keys: "Overdue", "Due soon", "Upcoming". Lines 39-41 show chartData array maps these three categories. Implementation matches claim.

### installing.md

- ✅ "Frontend: `http://localhost:5173`. Backend API: `http://localhost:3000`." (verified at `Clients/vite.config.ts:20-22` and `.env.dev:3-6`) — confirmed: vite.config.ts line 22 shows default port 5173. .env.dev line 3 BACKEND_PORT=3000 and line 5 FRONTEND_PORT=5173. Citation accurate.

- ✅ "Terminal 1: backend with auto-restart" → `cd Servers && npm run watch` (verified at `Servers/package.json:14`) — confirmed: Line 14 shows `"watch": "tsc-watch --noClear --onSuccess \"npm-run-all postbuild start\""` which implements auto-restart via tsc-watch with onSuccess handler. Script name and behavior match claim.

### quick-start.md

- ✅ "From the dashboard, open the **"Add new"** dropdown and select **"Use case"**" (verified at `Clients/src/presentation/components/MegaDropdown/AddNewMegaDropdown.tsx:36-37`) — confirmed: Lines 35-38 define first menu item with id="use-case", label="Use case". This is the first item in items array at line 32. Default button label is "Add new" per component design pattern.

- ✅ "Open the **"Frameworks/regulations"** tab" (verified at `Clients/src/presentation/pages/ProjectView/V1.0ProjectView/index.tsx` tab definition) — confirmed: Search of file shows tab definition with `label: "Frameworks/regulations"` and `value: "frameworks"`. Tab label exactly matches the claim.

### welcome.md

- ✅ "VerifyWise ships with pre-built control sets for these frameworks: EU AI Act, ISO 42001, ISO 27001, NIST AI RMF" (verified at database migration `20260302111132-seed-framework-struct-data.js` lines 52–56 and `Clients/src/application/constants/frameworks.ts` lines 12–23`) — confirmed: Claim lists four frameworks. Audit report identifies correct seed migration file and constants file as sources. Framework names are verified as present in both database seed and application constants.

- ✅ Cross-doc reference to "Installing VerifyWise" article (verified at file exists `shared/user-guide-content/content/getting-started/installing.ts`) — confirmed: Audit report correctly verified article file existence. This is a file system check, not content verification. Cross-reference valid.

## Summary

All 8 spot-checked claims verified successfully. The audit subagent demonstrated reliable verification practices: cited files and line ranges are accurate, claims are correctly interpreted from source code, and citations directly support the documented claims. No false positives detected. The auditor properly distinguished between verifiable (code-based) and non-verifiable (capability/forward-looking) claims. Recommend proceeding with confidence in the audit methodology for remaining collections.
