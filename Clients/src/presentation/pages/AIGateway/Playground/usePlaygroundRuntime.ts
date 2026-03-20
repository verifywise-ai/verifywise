/**
 * Custom assistant-ui runtime for the AI Gateway Playground.
 *
 * Uses useLocalRuntime with a ChatModelAdapter that streams from our
 * Express /api/ai-gateway/chat/stream endpoint (OpenAI-compatible SSE).
 */

import { useRef } from "react";
import { useLocalRuntime, type ChatModelAdapter } from "@assistant-ui/react";
import { useSelector } from "react-redux";
import { RootState } from "../../../../application/redux/store";
import { ENV_VARs } from "../../../../../env.vars";

interface PlaygroundConfig {
  endpointSlug: string;
  temperature: number;
  maxTokens: number;
}

/**
 * Get the direct backend URL, bypassing Vite proxy for SSE.
 */
const getStreamUrl = (): string => {
  if (import.meta.env.PROD) {
    return `${ENV_VARs.URL}/api/ai-gateway/chat/stream`;
  }
  const devBase =
    import.meta.env.VITE_APP_API_BASE_URL || "http://localhost:3000";
  return `${devBase}/api/ai-gateway/chat/stream`;
};

export function usePlaygroundRuntime(configRef: React.RefObject<PlaygroundConfig>) {
  const authToken = useSelector(
    (state: RootState) => state.auth.authToken
  );
  const tokenRef = useRef(authToken);
  tokenRef.current = authToken;

  const adapter: ChatModelAdapter = {
    async *run({ messages, abortSignal }) {
      const config = configRef.current;
      if (!config?.endpointSlug) {
        yield { content: [{ type: "text" as const, text: "Select an endpoint first." }] };
        return;
      }

      // Convert assistant-ui messages to our API format
      const apiMessages = messages.map((m) => ({
        role: m.role,
        content: m.content
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("\n"),
      }));

      const response = await fetch(getStreamUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          endpoint_slug: config.endpointSlug,
          messages: apiMessages,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage: string;
        try {
          const parsed = JSON.parse(errorText);
          errorMessage = parsed.guardrail_blocked
            ? `Blocked by guardrail: ${parsed.message}`
            : parsed.message || `Error ${response.status}`;
        } catch {
          errorMessage = `Error ${response.status}: ${errorText.slice(0, 200)}`;
        }
        yield { content: [{ type: "text" as const, text: errorMessage }] };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        yield { content: [{ type: "text" as const, text: "No response body" }] };
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ") || line === "data: [DONE]") continue;

            try {
              const parsed = JSON.parse(line.slice(6));

              // Skip cost/usage metadata events
              if (parsed.cost_usd !== undefined && !parsed.choices) continue;

              // Content delta
              if (parsed.choices?.[0]?.delta?.content) {
                accumulated += parsed.choices[0].delta.content;
                yield {
                  content: [{ type: "text" as const, text: accumulated }],
                };
              }
            } catch {
              // Ignore malformed SSE chunks
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };

  return useLocalRuntime(adapter);
}
