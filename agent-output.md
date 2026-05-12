# Frontend Dashboard Blank Screen Fix — Implementation Report

> **Date:** 2026-05-12

## Problem

Opening the VerifyWise dashboard resulted in a completely blank screen. The browser console showed:

```
Uncaught SyntaxError: The requested module '/node_modules/.vite/deps/@assistant-ui_react.js?v=55590ccb'
does not provide an export named 'useAssistantState'
(at CustomMessage.tsx:3:48)
```

The broken import caused the entire frontend bundle to fail loading, leaving the dashboard unusable.

## Root Cause

`useAssistantState` was an API from an older version of `@assistant-ui/react` that has been removed in the currently installed version (`0.14.0`). The package no longer exports this hook, so Vite could not resolve the module dependency.

## Fix

Updated `Clients/src/presentation/components/AdvisorChat/CustomMessage.tsx` to use the replacement hook provided by the current version of `@assistant-ui/react`:

| Before | After |
|--------|-------|
| `import { ..., useAssistantState } from "@assistant-ui/react"` | `import { ..., useAuiState } from "@assistant-ui/react"` |
| `useAssistantState(({ message }) => message)` | `useAuiState((s) => s.message)` |

This maps directly to the library's v0.12+ migration guide (the deprecated `useMessage` hook's JSDoc explicitly points to `useAuiState((s) => s.message)` as the replacement).

## Verification

- TypeScript type check passes: `cd Clients && npx tsc --noEmit`
- No other files in the codebase reference the removed `useAssistantState` hook.

## Commits

```
<commit-hash> fix(advisor-chat): replace removed useAssistantState with useAuiState
<commit-hash> docs: rewrite agent-output.md with task report
```
