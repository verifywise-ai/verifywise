import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import {
  AdvisorMessage,
  ConversationSummary,
  listConversationsAPI,
  getConversationByIdAPI,
  createConversationAPI,
  updateConversationAPI,
  deleteConversationAPI,
} from '../repository/advisor.repository';
// `createConversationAPI` is still used by `ensureActiveConversation` to
// create a row on the first message of a brand-new chat. Don't remove it
// from the import even though `startNewConversation` no longer calls it.
import { AdvisorDomain } from '../../presentation/components/AdvisorChat/advisorConfig';

/**
 * Per-domain state held by the context.
 *
 * - `conversations` is the list shown in the history dropdown (summaries only).
 * - `activeId` is which conversation is currently open in the runtime. `null`
 *   means "no conversation selected yet" — e.g. first visit with no history,
 *   or right after the user clicked "new chat" but hasn't sent the first
 *   message yet.
 * - `activeMessages` are the messages of the active conversation, held
 *   locally so the assistant-ui runtime can hydrate from them on (re)mount.
 */
interface DomainState {
  conversations: ConversationSummary[];
  activeId: number | null;
  activeMessages: AdvisorMessage[];
  isLoading: boolean;
  isLoaded: boolean;
}

interface AdvisorConversationContextType {
  /** List of past conversations for a given domain (summaries). */
  getConversations: (domain: AdvisorDomain) => ConversationSummary[];
  /** Id of the currently-open conversation in the given domain, or null. */
  getActiveId: (domain: AdvisorDomain) => number | null;
  /** Messages of the currently-open conversation. */
  getMessages: (domain: AdvisorDomain) => AdvisorMessage[];

  /** Has the list for this domain been fetched at least once? */
  isLoaded: (domain: AdvisorDomain | undefined) => boolean;
  /** Is a list/fetch currently in flight? */
  isLoading: (domain: AdvisorDomain | undefined) => boolean;

  /**
   * Fetch the conversation list for a domain, then auto-open the most
   * recent one (if any) so the user lands in a familiar chat. Safe to
   * call repeatedly — skips work when already loaded.
   */
  loadDomain: (domain: AdvisorDomain) => Promise<void>;

  /**
   * Switch the active conversation to a specific id. Fetches its full
   * messages from the backend.
   */
  selectConversation: (domain: AdvisorDomain, id: number) => Promise<void>;

  /**
   * Create a fresh empty conversation in the given domain and set it as
   * active. The assistant-ui runtime will re-mount (via `activeId` as its
   * key) and show the welcome state.
   */
  startNewConversation: (domain: AdvisorDomain) => Promise<void>;

  /**
   * Delete a conversation. If the deleted one was active, the next most
   * recent one becomes active; if there are none left, `activeId` goes to
   * null.
   */
  deleteConversation: (domain: AdvisorDomain, id: number) => Promise<void>;

  /**
   * Append a message to the active conversation and persist it.
   *
   * If there is no active conversation yet (activeId === null), we create
   * one on the fly. That lets the frontend fire `addMessage` unconditionally
   * on the very first turn without a pre-flight create.
   */
  addMessage: (domain: AdvisorDomain, message: AdvisorMessage) => Promise<void>;
}

const AdvisorConversationContext = createContext<AdvisorConversationContextType | null>(null);

const EMPTY_CONVERSATIONS: ConversationSummary[] = [];
const EMPTY_MESSAGES: AdvisorMessage[] = [];

export const AdvisorConversationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<Record<string, DomainState>>({});

  // Synchronous mirror of `state`, read by async paths that can't wait for
  // React to flush a setState. React's setState is not immediately visible
  // to the next line after `setState(...)` — reading from a ref is the only
  // way two rapid-fire async calls in the same tick can see each other's
  // updates. Written on every render AND inline after any setState below.
  const stateRef = useRef<Record<string, DomainState>>(state);
  stateRef.current = state;

  // Tracks which domains are mid-load so parallel callers don't stampede.
  const loadingDomainsRef = useRef<Set<string>>(new Set());
  // Tracks which conversation ids are mid-fetch for the same reason.
  const loadingConversationsRef = useRef<Set<string>>(new Set());
  // Holds the in-flight "create on first turn" promise per domain. Rapid-
  // fire `addMessage` calls (user + assistant in the same onFinish loop)
  // both await the same promise and receive the same conversation id,
  // instead of the old "sleep 50ms and hope" scheme.
  const creatingPromisesRef = useRef<Record<string, Promise<number | null> | undefined>>({});

  // Per-domain PUT serialization chain. When `addMessage` is called twice
  // in the same tick (user + assistant from onFinish), naive fire-and-
  // forget PUTs race on the network — whichever arrives second wins, and
  // if that's the one with the SHORTER array the assistant message is
  // silently lost. We chain PUTs per domain so they land in order, and
  // each queued task reads the LATEST messages from `stateRef` at the
  // moment it runs, so even the first PUT already contains everything.
  const putQueuesRef = useRef<Record<string, Promise<unknown>>>({});

  const getConversations = useCallback(
    (domain: AdvisorDomain): ConversationSummary[] =>
      state[domain]?.conversations ?? EMPTY_CONVERSATIONS,
    [state],
  );

  const getActiveId = useCallback(
    (domain: AdvisorDomain): number | null =>
      state[domain]?.activeId ?? null,
    [state],
  );

  const getMessages = useCallback(
    (domain: AdvisorDomain): AdvisorMessage[] =>
      state[domain]?.activeMessages ?? EMPTY_MESSAGES,
    [state],
  );

  const isLoaded = useCallback(
    (domain: AdvisorDomain | undefined): boolean =>
      !!domain && !!state[domain]?.isLoaded,
    [state],
  );

  const isLoading = useCallback(
    (domain: AdvisorDomain | undefined): boolean =>
      !!domain && !!state[domain]?.isLoading,
    [state],
  );

  /**
   * Internal helper: apply a partial patch to a domain's state, preserving
   * whatever's already there.
   */
  const patchDomain = useCallback(
    (domain: AdvisorDomain, patch: Partial<DomainState>) => {
      setState((prev) => {
        const current: DomainState = prev[domain] ?? {
          conversations: [],
          activeId: null,
          activeMessages: [],
          isLoading: false,
          isLoaded: false,
        };
        return { ...prev, [domain]: { ...current, ...patch } };
      });
    },
    [],
  );

  const loadDomain = useCallback(
    async (domain: AdvisorDomain): Promise<void> => {
      if (loadingDomainsRef.current.has(domain)) return;

      // Check current state without committing to anything yet.
      let shouldLoad = false;
      setState((prev) => {
        if (prev[domain]?.isLoaded || prev[domain]?.isLoading) {
          return prev;
        }
        shouldLoad = true;
        loadingDomainsRef.current.add(domain);
        return {
          ...prev,
          [domain]: {
            conversations: prev[domain]?.conversations ?? [],
            activeId: prev[domain]?.activeId ?? null,
            activeMessages: prev[domain]?.activeMessages ?? [],
            isLoading: true,
            isLoaded: false,
          },
        };
      });

      if (!shouldLoad) return;

      try {
        const listResp = await listConversationsAPI(domain);
        const conversations = listResp.data?.conversations ?? [];

        // Auto-open the most recent conversation if one exists. The list is
        // already sorted by `last_message_at DESC` in the backend.
        if (conversations.length > 0) {
          const mostRecent = conversations[0];
          const convResp = await getConversationByIdAPI(domain, mostRecent.id);
          const conv = convResp.data?.conversation;

          patchDomain(domain, {
            conversations,
            activeId: mostRecent.id,
            activeMessages: conv?.messages ?? [],
            isLoading: false,
            isLoaded: true,
          });
        } else {
          patchDomain(domain, {
            conversations: [],
            activeId: null,
            activeMessages: [],
            isLoading: false,
            isLoaded: true,
          });
        }
      } catch (error) {
        console.error(`Failed to load conversations for ${domain}:`, error);
        patchDomain(domain, {
          conversations: [],
          activeId: null,
          activeMessages: [],
          isLoading: false,
          isLoaded: true,
        });
      } finally {
        loadingDomainsRef.current.delete(domain);
      }
    },
    [patchDomain],
  );

  const selectConversation = useCallback(
    async (domain: AdvisorDomain, id: number): Promise<void> => {
      const key = `${domain}:${id}`;
      if (loadingConversationsRef.current.has(key)) return;
      loadingConversationsRef.current.add(key);

      try {
        const resp = await getConversationByIdAPI(domain, id);
        const conv = resp.data?.conversation;
        patchDomain(domain, {
          activeId: id,
          activeMessages: conv?.messages ?? [],
        });
      } catch (error) {
        console.error(
          `Failed to load conversation ${id} in ${domain}:`,
          error,
        );
      } finally {
        loadingConversationsRef.current.delete(key);
      }
    },
    [patchDomain],
  );

  const startNewConversation = useCallback(
    async (domain: AdvisorDomain): Promise<void> => {
      // No backend round-trip. We don't create an empty row up front —
      // that would clutter the history with "Untitled chat" placeholders
      // every time the user clicks "new chat" without actually saying
      // anything. Instead, just clear local state and set activeId to
      // null. The first call to `addMessage` will create the row via
      // `ensureActiveConversation`.
      patchDomain(domain, {
        activeId: null,
        activeMessages: [],
      });
    },
    [patchDomain],
  );

  const deleteConversation = useCallback(
    async (domain: AdvisorDomain, id: number): Promise<void> => {
      try {
        await deleteConversationAPI(domain, id);
      } catch (error) {
        console.error(`Failed to delete conversation ${id} in ${domain}:`, error);
        return;
      }

      setState((prev) => {
        const current = prev[domain];
        if (!current) return prev;

        const nextConversations = current.conversations.filter((c) => c.id !== id);

        // If the deleted row was the active one, pick the next most recent.
        let nextActiveId = current.activeId;
        let nextActiveMessages = current.activeMessages;
        if (current.activeId === id) {
          nextActiveId = nextConversations[0]?.id ?? null;
          nextActiveMessages = [];
        }

        return {
          ...prev,
          [domain]: {
            ...current,
            conversations: nextConversations,
            activeId: nextActiveId,
            activeMessages: nextActiveMessages,
          },
        };
      });

      // If there's a new active id after deletion, fetch its messages.
      // Done outside the setState updater because updaters must stay pure.
      setState((prev) => {
        const nextActive = prev[domain]?.activeId;
        if (nextActive != null && nextActive !== id) {
          // Fire-and-forget: the UI already switched, the messages will
          // arrive shortly.
          getConversationByIdAPI(domain, nextActive)
            .then((resp) => {
              const conv = resp.data?.conversation;
              patchDomain(domain, { activeMessages: conv?.messages ?? [] });
            })
            .catch((err) => {
              console.error(
                `Failed to load conversation ${nextActive} in ${domain}:`,
                err,
              );
            });
        }
        return prev;
      });
    },
    [patchDomain],
  );

  /**
   * Internal: ensure the domain has an active conversation, creating one
   * on the fly if not. Used by `addMessage` to support "first turn in a
   * brand new chat" without forcing callers to orchestrate a pre-create.
   */
  const ensureActiveConversation = useCallback(
    async (domain: AdvisorDomain): Promise<number | null> => {
      // Read via ref so the latest activeId is visible even if a previous
      // addMessage call already committed one but React hasn't re-rendered
      // this hook yet.
      const existing = stateRef.current[domain]?.activeId ?? null;
      if (existing != null) return existing;

      // Another call in the same tick may already be creating. Piggy-back
      // on its promise so both callers get the same new id.
      if (creatingPromisesRef.current[domain]) {
        return creatingPromisesRef.current[domain];
      }

      const creationPromise: Promise<number | null> = (async () => {
        try {
          const resp = await createConversationAPI(domain);
          const conv = resp.data?.conversation;
          if (!conv) return null;

          const summary: ConversationSummary = {
            id: conv.id,
            title: conv.title,
            last_message_at: conv.last_message_at,
            message_count: 0,
            created_at: conv.created_at,
            updated_at: conv.updated_at,
          };

          // Update the ref synchronously BEFORE scheduling the setState
          // so any subsequent addMessage in the same tick sees the new id.
          const prevDomain = stateRef.current[domain] ?? {
            conversations: [],
            activeId: null,
            activeMessages: [],
            isLoading: false,
            isLoaded: true,
          };
          const nextDomain: DomainState = {
            ...prevDomain,
            conversations: [summary, ...prevDomain.conversations],
            activeId: conv.id,
          };
          stateRef.current = { ...stateRef.current, [domain]: nextDomain };

          setState((prev) => {
            const current = prev[domain] ?? {
              conversations: [],
              activeId: null,
              activeMessages: [],
              isLoading: false,
              isLoaded: true,
            };
            return {
              ...prev,
              [domain]: {
                ...current,
                conversations: [summary, ...current.conversations],
                activeId: conv.id,
              },
            };
          });
          return conv.id;
        } catch (error) {
          console.error(
            `Failed to auto-create conversation in ${domain}:`,
            error,
          );
          return null;
        }
      })();

      creatingPromisesRef.current[domain] = creationPromise;
      try {
        return await creationPromise;
      } finally {
        delete creatingPromisesRef.current[domain];
      }
    },
    [],
  );

  const addMessage = useCallback(
    async (domain: AdvisorDomain, message: AdvisorMessage): Promise<void> => {
      // 1. Figure out which conversation id we're writing to. Create one
      //    if we don't have an active conversation yet.
      const activeId = await ensureActiveConversation(domain);
      if (activeId == null) return;

      // 2. Compute nextMessages from the ref (not from inside a setState
      //    updater — those run asynchronously and a mutated-in-updater
      //    outer variable is still empty when we PUT). The ref is the
      //    authoritative "latest messages" view across rapid-fire calls
      //    in the same tick.
      const currentDomain = stateRef.current[domain];
      if (!currentDomain) return;
      const nextMessages: AdvisorMessage[] = [...currentDomain.activeMessages, message];

      // Recompute the conversation summary list so history reflects fresh
      // activity immediately.
      const updatedSummary = currentDomain.conversations.find(
        (c) => c.id === activeId,
      );
      const nextConversations = updatedSummary
        ? [
            {
              ...updatedSummary,
              message_count: nextMessages.length,
              last_message_at: new Date().toISOString(),
              title:
                updatedSummary.title ??
                (message.role === 'user' && message.content
                  ? message.content.slice(0, 80)
                  : updatedSummary.title),
            },
            ...currentDomain.conversations.filter((c) => c.id !== activeId),
          ]
        : currentDomain.conversations;

      // 3. Update the ref synchronously so a subsequent addMessage in the
      //    same tick reads the new messages array.
      stateRef.current = {
        ...stateRef.current,
        [domain]: {
          ...currentDomain,
          activeMessages: nextMessages,
          conversations: nextConversations,
        },
      };

      // 4. Schedule the React render.
      setState((prev) => {
        const current = prev[domain];
        if (!current) return prev;
        return {
          ...prev,
          [domain]: {
            ...current,
            activeMessages: nextMessages,
            conversations: nextConversations,
          },
        };
      });

      // 5. Persist to the backend. Queue behind any in-flight PUT for
      //    this domain so concurrent `addMessage` calls don't race. The
      //    queued task reads the LATEST snapshot from `stateRef` at run
      //    time, not the `nextMessages` value captured when it was
      //    enqueued — that way even the first queued PUT already includes
      //    any messages added by subsequent calls in the same tick.
      const previous = putQueuesRef.current[domain] ?? Promise.resolve();
      const next = previous
        .catch(() => undefined)
        .then(async () => {
          const latest = stateRef.current[domain]?.activeMessages ?? nextMessages;
          try {
            await updateConversationAPI(domain, activeId, latest);
          } catch (error) {
            console.error(`Auto-save failed for ${domain}:`, error);
          }
        });
      putQueuesRef.current[domain] = next;
      await next;
      // Clear the slot only if we're still the tail of the chain — if a
      // later PUT has already been enqueued behind us, leave it be.
      if (putQueuesRef.current[domain] === next) {
        delete putQueuesRef.current[domain];
      }
    },
    [ensureActiveConversation],
  );

  const value = useMemo<AdvisorConversationContextType>(
    () => ({
      getConversations,
      getActiveId,
      getMessages,
      isLoaded,
      isLoading,
      loadDomain,
      selectConversation,
      startNewConversation,
      deleteConversation,
      addMessage,
    }),
    [
      getConversations,
      getActiveId,
      getMessages,
      isLoaded,
      isLoading,
      loadDomain,
      selectConversation,
      startNewConversation,
      deleteConversation,
      addMessage,
    ],
  );

  return (
    <AdvisorConversationContext.Provider value={value}>
      {children}
    </AdvisorConversationContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAdvisorConversation = (): AdvisorConversationContextType => {
  const context = useContext(AdvisorConversationContext);
  if (!context) {
    throw new Error('useAdvisorConversation must be used within an AdvisorConversationProvider');
  }
  return context;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAdvisorConversationSafe = (): AdvisorConversationContextType | null => {
  return useContext(AdvisorConversationContext);
};
