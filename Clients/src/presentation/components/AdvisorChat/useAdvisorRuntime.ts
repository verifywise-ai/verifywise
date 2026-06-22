import { useMemo, useRef, useEffect, useCallback } from "react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AdvisorDomain, getWelcomeMessage } from "./advisorConfig";
import { useAdvisorConversationSafe } from "../../../application/contexts/AdvisorConversation.context";
import { store } from "../../../application/redux/store";
import { ENV_VARs } from "../../../../env.vars";

// Extended UIMessage type with optional createdAt for our use case
type ExtendedUIMessage = UIMessage & { createdAt?: Date };

/**
 * Get the direct backend URL for the AI SDK chat endpoint.
 * In development, bypass the Vite dev proxy to avoid SSE buffering.
 */
const getChatApiUrl = (): string => {
  if (import.meta.env.PROD) {
    return `${ENV_VARs.URL}/api/advisor/chat`;
  }
  const devBase = import.meta.env.VITE_APP_API_BASE_URL || "http://localhost:3000";
  return `${devBase}/api/advisor/chat`;
};

/**
 * Create a welcome UIMessage for the assistant-ui thread.
 */
const createWelcomeUIMessage = (domain?: AdvisorDomain): ExtendedUIMessage => ({
  id: "welcome",
  role: "assistant",
  parts: [{ type: "text", text: getWelcomeMessage(domain) }],
  createdAt: new Date(),
});

/**
 * Convert persisted AdvisorMessages to AI SDK UIMessage format.
 *
 * Rehydrates `toolParts` (AI SDK dynamic-tool parts persisted on the
 * previous turn) so inline approval cards survive a page refresh. The
 * text part (if any) is added first, then the tool parts in their
 * original order — that matches how assistant turns typically come out
 * of the SDK (intermediate tool results, then a closing text reply).
 */
const convertToUIMessages = (
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
    toolParts?: unknown[];
  }>,
  domain?: AdvisorDomain,
): UIMessage[] => {
  if (!messages || messages.length === 0) {
    return [createWelcomeUIMessage(domain)];
  }

  return messages.map((msg) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = [];
    if (msg.content && msg.content.length > 0) {
      parts.push({ type: "text" as const, text: msg.content });
    }
    if (Array.isArray(msg.toolParts) && msg.toolParts.length > 0) {
      parts.push(...msg.toolParts);
    }
    if (parts.length === 0) {
      // Defensive fallback — never produce a UIMessage with empty parts.
      parts.push({ type: "text" as const, text: "" });
    }
    return {
      id: msg.id,
      role: msg.role,
      parts,
      createdAt: new Date(msg.createdAt),
    } as UIMessage;
  });
};

/**
 * Extract tool parts from a UIMessage so we can persist them.
 *
 * AI SDK v5+ emits two flavors of tool UI parts:
 *   - `type: 'dynamic-tool'`  — for tools the client doesn't pre-declare
 *   - `type: 'tool-<name>'`  — for statically streamed tools (the common
 *     case with backend-defined tools). See `ai/dist/index.js`'s
 *     `isToolUIPart` which OR's `isStaticToolUIPart` (`type.startsWith("tool-")`)
 *     and `isDynamicToolUIPart` (`type === "dynamic-tool"`).
 *
 * Both flavors carry the toolCallId, state, input, and output that the
 * renderer needs to redraw the approval card on rehydration. Filtering
 * to only `dynamic-tool` was silently dropping the suggest_model_risk /
 * register_model parts so the inline cards vanished on persist+rehydrate.
 */
const extractToolPartsFromUIMessage = (message: UIMessage): unknown[] => {
  return (
    message.parts?.filter(
      (p: { type: string }) => p.type === "dynamic-tool" || p.type.startsWith("tool-"),
    ) ?? []
  );
};

/**
 * Parse the ---CHART_DATA--- separator format from the full response text.
 * Returns { markdown, chartData }.
 */
const parseChartData = (fullText: string): { markdown: string; chartData: unknown } => {
  const separator = "---CHART_DATA---";
  const separatorIndex = fullText.indexOf(separator);
  let markdown = fullText;
  let chartData: unknown = null;

  if (separatorIndex !== -1) {
    markdown = fullText.substring(0, separatorIndex).trim();
    const chartSection = fullText.substring(separatorIndex + separator.length).trim();

    if (chartSection && chartSection !== "null") {
      try {
        chartData = JSON.parse(chartSection);
      } catch {
        // Malformed chart JSON, ignore
      }
    }
  }

  return { markdown, chartData };
};

/**
 * Extract plain text content from a UIMessage.
 */
const extractTextFromUIMessage = (message: UIMessage): string => {
  return (
    message.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n") || ""
  );
};

/**
 * Extract chart data from a UIMessage's tool invocation parts.
 * Looks for a generate_chart tool with completed output.
 * Falls back to legacy ---CHART_DATA--- separator parsing.
 *
 * AI SDK UIMessage tool parts arrive as `type: 'dynamic-tool'` with a
 * `toolName` field (not `type: 'tool-generate_chart'`), because tools
 * are not statically typed on the frontend.
 */
const extractChartData = (message: UIMessage, text: string): unknown => {
  // Strategy 1: Look for the generate_chart tool invocation in parts. AI
  // SDK emits two flavors: `dynamic-tool` (with toolName field) and
  // `tool-<name>` (with toolName encoded in the type). Match either.
  const chartPart = message.parts?.find(
    (p: any) =>
      p.state === "output-available" &&
      p.output &&
      ((p.type === "dynamic-tool" && p.toolName === "generate_chart") ||
        p.type === "tool-generate_chart"),
  );

  if (chartPart) {
    return (chartPart as any).output;
  }

  // Strategy 2: Legacy separator fallback for pre-migration persisted data
  const { chartData } = parseChartData(text);
  return chartData;
};

export const useAdvisorRuntime = (selectedLLMKeyId?: number, pageContext?: AdvisorDomain) => {
  const conversationContext = useAdvisorConversationSafe();

  // Refs to avoid stale closures in callbacks
  const contextRef = useRef(conversationContext);
  const pageContextRef = useRef(pageContext);

  // Track which message IDs are already persisted to avoid duplicates
  const persistedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    contextRef.current = conversationContext;
    pageContextRef.current = pageContext;
  }, [conversationContext, pageContext]);

  // Compute initial messages from persisted conversation
  const initialMessages = useMemo(() => {
    if (conversationContext && pageContext) {
      const persistedMessages = conversationContext.getMessages(pageContext);
      if (persistedMessages.length > 0) {
        // Track already-persisted message IDs
        persistedIdsRef.current = new Set(persistedMessages.map((m) => m.id));
        return convertToUIMessages(persistedMessages, pageContext);
      }
    }
    return [createWelcomeUIMessage(pageContext)];
  }, [pageContext, conversationContext]);

  // Create transport with auth headers and extra body params
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: getChatApiUrl(),
        headers: (): Record<string, string> => {
          const token = store.getState().auth?.authToken;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        body: { llmKeyId: selectedLLMKeyId },
      }),
    [selectedLLMKeyId],
  );

  // Persist new messages when the turn settles. We persist user turns even
  // on abort/error/disconnect so the human can reload, see what they asked,
  // and retry. Only the assistant turn is skipped on failure — a partial or
  // aborted assistant response is not worth keeping.
  const onFinish = useCallback(
    ({
      messages,
      isAbort,
      isError,
      isDisconnect,
    }: {
      message: UIMessage;
      messages: UIMessage[];
      isAbort: boolean;
      isError: boolean;
      isDisconnect: boolean;
    }) => {
      const context = contextRef.current;
      const domain = pageContextRef.current;

      if (!context || !domain || !messages.length) return;

      const skipAssistant = isAbort || isError || isDisconnect;

      // Only persist messages we haven't already saved. `addMessage` is
      // async (it may create a conversation row on the first turn) but we
      // fire-and-forget here: the context batches saves per conversation
      // and any failure is logged on its end.
      for (const msg of messages) {
        if (msg.id === "welcome" || persistedIdsRef.current.has(msg.id)) continue;
        if (msg.role === "assistant" && skipAssistant) continue;

        const text = extractTextFromUIMessage(msg);

        if (msg.role === "assistant") {
          const chartData = extractChartData(msg, text);
          const toolParts = extractToolPartsFromUIMessage(msg);
          const extMsg = msg as ExtendedUIMessage;
          void context.addMessage(domain, {
            id: msg.id,
            role: "assistant",
            content: text,
            createdAt: extMsg.createdAt
              ? new Date(extMsg.createdAt).toISOString()
              : new Date().toISOString(),
            chartData: chartData || undefined,
            toolParts: toolParts.length > 0 ? toolParts : undefined,
          });
        } else if (msg.role === "user") {
          const extMsg = msg as ExtendedUIMessage;
          void context.addMessage(domain, {
            id: msg.id,
            role: "user",
            content: text,
            createdAt: extMsg.createdAt
              ? new Date(extMsg.createdAt).toISOString()
              : new Date().toISOString(),
          });
        }
      }
    },
    [],
  );

  // Surface errors that bypass the streaming protocol entirely — network
  // failures, CORS issues, 5xx before the stream opens, etc. Errors that
  // happen INSIDE the stream are already converted to user-visible text
  // by the backend's `onError` in `streamAdvisorV2`. This hook catches
  // the cases that don't reach that backend handler.
  const onError = useCallback((error: unknown) => {
    console.error("[advisor] chat runtime error:", error);
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-alert
    alert(
      `The AI advisor encountered an error: ${message}\n\n` +
        `If this keeps happening, check your LLM key in Settings or try again in a moment.`,
    );
  }, []);

  const runtime = useChatRuntime({
    transport,
    messages: initialMessages,
    onFinish,
    onError,
  });

  return runtime;
};
