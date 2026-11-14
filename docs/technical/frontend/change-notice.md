# Change notices

A change notice is a small "What's changed" card that tells a user about a restyle or restructure the first few times they open the affected page. It is shown in the new look only, one card at a time, and stops on its own. Every PR that moves, renames or restyles a page adds an entry to the registry.

## How a notice behaves

- Shown in the new look only. It is hidden in the classic look (`isClassicUi()`).
- One card at a time. The global new look card (the entry with `global: true`) goes first. A page notice is asked about only once the global card is not showing. When the welcome card is dismissed (or the user switches back to the classic look from it), the page notice is held back only on that path (`pageDeferredAt === pathname` in `index.tsx`); the hold is cleared on the next route change, so the notice can appear on another page or on a later visit.
- A notice stops after the user dismisses it, after 3 visits, or 90 days after the user's own first view, whichever comes first.
- Accounts created after anyone in the organization first saw a notice are skipped for that notice, so most new users never see changes they never experienced. The first users of a new organization, and everyone invited before anyone's first view, can still see it.
- "Show me" highlights the sidebar item named by `showMeTestId`. The button is hidden when that element is not in the DOM.
- Dismissing a notice offers an Undo strip for 6 seconds. Undo restores the notice.
- `localStorage["vw-change-notices"] = "off"` suppresses all notices. The E2E setup (`Clients/e2e/global.setup.ts`) sets it, and so should video recordings.

## Add a notice

1. Add an entry to `CHANGE_NOTICES` in `Clients/src/presentation/components/ChangeNotice/notices.ts`.
2. Add the de, fr and es text for every new string to `Clients/src/i18n/modules/changeNotice.ts` (English is the key). Run `cd Clients && npm run i18n:audit:strict`.
3. Make sure the `showMeTestId` element exists (see below).
4. Add the guide article, if any, and set `guidePath`.

```ts
{
  id: "ai-gateway-2026-11",
  routes: ["/ai-gateway"],
  variant: "moved",
  title: "AI Gateway is now in the sidebar",
  body: "It used to be a separate app. Find it under Enforce.",
  moved: { item: "AI Gateway", before: "App switcher", now: "Enforce" },
  showMeTestId: "nav-item-ai-gateway",
}
```

### Entry fields

The type is `ChangeNoticeEntry` in `Clients/src/domain/types/changeNotice.types.ts`.

| Field | Meaning |
| --- | --- |
| `id` | Lowercase slug, `<area>-<yyyy-mm>` (for example `home-2026-11`). Must match `^[a-z0-9][a-z0-9-]{0,63}$`; the server answers 400 otherwise. It is the key the state is stored under, so never reuse or rename an id that has shipped. |
| `routes` | Route prefixes the entry applies to. Empty for a global entry. When several entries match a path, the longest matching prefix wins (`resolveNotice.ts`), so `/ai-gateway/mcp/runs` gets the Agent controls notice, not the AI Gateway one. |
| `global` | Eligible on any page and shown before page entries. The registry has one (`GLOBAL_NOTICE` is the first match). |
| `variant` | `standard` (title and bullet `items`), `rename` (uses `rename: { from, to }`), `moved` (uses `moved: { item, before, now }` for the before and now strip) or `welcome` (the global new look card, with Keep the new look and Switch back). |
| `title`, `body`, `items` | English source text, rendered through `t()`. |
| `showMeTestId` | `data-testid` of the element "Show me" highlights. |
| `guidePath` | User guide article opened by "Read the guide" (for example `getting-started/home`). |

### Show me test id

The unified sidebar renders each item with `data-testid="nav-item-<item id>"` (`Clients/src/presentation/components/UnifiedSidebar/index.tsx`). `__tests__/notices.test.ts` checks every `showMeTestId` against the sidebar's item ids, so a wrong id fails the unit tests. If the element is missing, for example the item is hidden for the user's role or feature flags, the card shows without Show me. The container checks on mount and again after 400 ms and 1200 ms, because the sidebar can mount after the card.

## Where the rules live

State is stored per user in `user_preferences.preferences->'change_notices'`, keyed by notice id: `{ first_seen_at, views, dismissed_at }`.

| What | Where |
| --- | --- |
| Constants `MAX_VIEWS` (3), `MAX_DAYS` (90), `MAX_KEYS` (200), `NOTICE_ID_RE`, and `decideShow` | `Servers/services/changeNotice/rules.ts` |
| Applying the rules for one visit (`viewNotice`, `setDismissed`) | `Servers/services/changeNotice/index.ts` |
| Queries on `user_preferences` | `Servers/utils/changeNotice.utils.ts` |
| Handlers (id check, body check, token user and organization) | `Servers/controllers/changeNotice.ctrl.ts` |
| Routes | `Servers/routes/v1/changeNotice.route.ts`, mounted at `/api/v1/change-notices` |
| Types, repository, React Query hooks | `Clients/src/domain/types/changeNotice.types.ts`, `Clients/src/application/repository/changeNotice.repository.ts`, `Clients/src/application/hooks/useChangeNotice.ts` |
| Container, card, strips, highlight | `Clients/src/presentation/components/ChangeNotice/` (`index.tsx`, `ChangeNoticeCard.tsx`, `MovedStrip.tsx`, `ShowMeHighlight.tsx`, `WelcomePreview.tsx`) |
| Registry and path resolution | `ChangeNotice/notices.ts`, `ChangeNotice/resolveNotice.ts` |
| Off-switch and once-per-session guard | `ChangeNotice/noticeStorage.ts`, `ChangeNotice/viewDecision.ts` |
| Translations | `Clients/src/i18n/modules/changeNotice.ts` |
| Mount | `Clients/src/presentation/containers/Dashboard/index.tsx` |

### Endpoints

Both require a valid token and are open to every role. A user only touches their own state; user and organization come from the token.

| Endpoint | Behaviour |
| --- | --- |
| `POST /api/v1/change-notices/:id/view` | Returns `{ show }`. Records the visit (first view time and view count) only when the answer is `show: true`; a refusal writes nothing. A pure super admin has no organization and always gets `show: false`. |
| `PUT /api/v1/change-notices/:id/dismissed` | Body `{ dismissed: boolean }`. `true` dismisses; `false` restores (Undo). Dismissing an id the user never viewed stores `first_seen_at: null`, so the 90 day clock does not start. `dismissed: false` on an unseen id is a no-op. Dismissing respects the 200 key cap (only `dismissed: true` can create a key). |

The client asks once per notice per session: `markViewRequested` (session storage) and the React Query cache (`staleTime: Infinity`, no refetch) keep re-renders, StrictMode double mounts and remounts from counting as extra visits.

## Checks when you change a notice

- Open the page as a user who has not seen the notice and confirm the card, Show me and Undo.
- Open it again: views count up, and after the third visit the card is gone.
- Check a narrow window and long translated text (de, fr).
- Confirm the card never shows in the classic look and that E2E still runs with the off-switch.
