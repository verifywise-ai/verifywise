import { renderHook, waitFor, act } from "@testing-library/react";
import { render } from "@testing-library/react";
import React from "react";
import { ThemeProvider } from "@mui/material/styles";
import { light } from "../../themes";
import {
  formatEntityType,
  getProviderIcon,
  ProviderIcon,
  useCardSx,
  useGatewayModels,
  slugify,
  extractVars,
  extractPromptRefs,
  resolveMessageVariables,
  getLabelVariant,
  streamPromptTest,
  GATEWAY_URL,
} from "./shared";

const mockGet = vi.fn();

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: (...args: any[]) => mockGet(...args),
  },
}));

const mockGetAuthToken = vi.fn(() => "test-token");

vi.mock("../../../application/redux/auth/getAuthToken", () => ({
  getAuthToken: () => mockGetAuthToken(),
}));

describe("AIGateway shared utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("formatEntityType", () => {
    it("returns 'Unknown' for undefined", () => {
      expect(formatEntityType(undefined)).toBe("Unknown");
    });

    it("returns 'Unknown' for null", () => {
      expect(formatEntityType(null)).toBe("Unknown");
    });

    it("returns 'Unknown' for empty string", () => {
      expect(formatEntityType("")).toBe("Unknown");
    });

    it("replaces underscores with spaces", () => {
      expect(formatEntityType("credit_card_number")).toBe("credit card number");
    });

    it("leaves strings without underscores unchanged", () => {
      expect(formatEntityType("email")).toBe("email");
    });
  });

  describe("getProviderIcon", () => {
    it("returns an icon component for a known provider", () => {
      const icon = getProviderIcon("openai");
      expect(icon).not.toBeNull();
    });

    it("is case-insensitive", () => {
      const lower = getProviderIcon("anthropic");
      const upper = getProviderIcon("ANTHROPIC");
      expect(lower).toBe(upper);
      expect(upper).not.toBeNull();
    });

    it("returns null for an unknown provider", () => {
      expect(getProviderIcon("totally-unknown-provider")).toBeNull();
    });
  });

  describe("ProviderIcon", () => {
    it("renders an svg icon for a known provider", () => {
      const { container } = render(React.createElement(ProviderIcon, { provider: "openai" }));
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    it("renders nothing for an unknown provider", () => {
      const { container } = render(
        React.createElement(ProviderIcon, { provider: "not-a-real-provider" }),
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("applies the given size to width/height", () => {
      const { container } = render(
        React.createElement(ProviderIcon, { provider: "openai", size: 32 }),
      );
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("width", "32");
      expect(svg).toHaveAttribute("height", "32");
    });
  });

  describe("useCardSx", () => {
    it("returns a style object derived from the theme", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(ThemeProvider, { theme: light }, children);
      const { result } = renderHook(() => useCardSx(), { wrapper });

      expect(result.current).toMatchObject({
        p: "16px",
        boxShadow: "none",
      });
      expect(result.current.background).toBe(light.palette.background.paper);
      expect(result.current.border).toContain(light.palette.border.light);
      expect(result.current.borderRadius).toBe(light.shape.borderRadius);
    });
  });

  describe("useGatewayModels", () => {
    it("starts in a loading state", () => {
      mockGet.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useGatewayModels());
      expect(result.current.loading).toBe(true);
      expect(result.current.providers).toEqual([]);
    });

    it("loads and filters providers/models on success", async () => {
      mockGet.mockResolvedValue({
        data: {
          data: {
            providers: ["openai", "anthropic", "empty-provider"],
            models: {
              openai: [
                { id: "gpt-4o", mode: "chat" },
                { id: "text-embedding-3", mode: "embedding" },
                { id: "gpt-3.5-turbo-instruct", mode: "completion" },
              ],
              anthropic: [{ id: "claude-3-opus", mode: "chat" }],
              "empty-provider": [{ id: "x", mode: "embedding" }],
            },
          },
        },
      });

      const { result } = renderHook(() => useGatewayModels());

      await waitFor(() => expect(result.current.loading).toBe(false));

      // empty-provider had no chat/completion models so it's filtered out
      expect(result.current.providers).toEqual(["anthropic", "openai"]);
      expect(result.current.modelsByProvider.openai.map((m) => m.id)).toEqual([
        "gpt-3.5-turbo-instruct",
        "gpt-4o",
      ]);
      expect(result.current.modelsByProvider["empty-provider"]).toBeUndefined();
      expect(result.current.error).toBeNull();

      expect(result.current.providerItems).toEqual([
        { _id: "anthropic", name: "anthropic" },
        { _id: "openai", name: "openai" },
      ]);
      expect(result.current.getModelsForProvider("anthropic")).toEqual([
        { _id: "anthropic/claude-3-opus", name: "claude-3-opus" },
      ]);
      expect(result.current.getModelsForProvider("unknown")).toEqual([]);
    });

    it("sets an error message when the request fails", async () => {
      mockGet.mockRejectedValue(new Error("network down"));

      const { result } = renderHook(() => useGatewayModels());

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBe("Unable to load AI Gateway providers.");
      expect(result.current.providers).toEqual([]);
    });

    it("does not update state after the component unmounts (abort)", async () => {
      let resolveFn: (value: any) => void = () => {};
      mockGet.mockReturnValue(
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
      );

      const { result, unmount } = renderHook(() => useGatewayModels());
      expect(result.current.loading).toBe(true);

      unmount();

      // Resolve after unmount — the abort-guard branches should prevent any
      // state updates (and thus no act() warnings).
      await act(async () => {
        resolveFn({ data: { data: { providers: ["openai"], models: {} } } });
        await Promise.resolve();
      });

      // No assertion needed beyond "did not throw" — state after unmount is
      // inaccessible via `result.current` updates, this exercises the aborted
      // branches in the load() callback and cleanup in useEffect.
      expect(mockGet).toHaveBeenCalled();
    });

    it("reload() re-triggers the fetch", async () => {
      mockGet.mockResolvedValue({ data: { data: { providers: [], models: {} } } });
      const { result } = renderHook(() => useGatewayModels());
      await waitFor(() => expect(result.current.loading).toBe(false));

      mockGet.mockClear();
      await act(async () => {
        await result.current.reload();
      });
      expect(mockGet).toHaveBeenCalledWith(
        "/ai-gateway/providers",
        expect.objectContaining({ signal: undefined }),
      );
    });

    it("handles a response with no data gracefully", async () => {
      mockGet.mockResolvedValue({ data: {} });
      const { result } = renderHook(() => useGatewayModels());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.providers).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  describe("slugify", () => {
    it("lowercases and replaces non-alphanumeric runs with a single dash", () => {
      expect(slugify("My Cool Prompt!!")).toBe("my-cool-prompt");
    });

    it("strips leading and trailing dashes", () => {
      expect(slugify("--Hello World--")).toBe("hello-world");
    });

    it("collapses multiple separators", () => {
      expect(slugify("a___b   c")).toBe("a-b-c");
    });

    it("handles an already-slugified string", () => {
      expect(slugify("already-a-slug")).toBe("already-a-slug");
    });
  });

  describe("extractVars", () => {
    it("extracts unique {{var}} tokens across messages", () => {
      const vars = extractVars([
        { content: "Hello {{name}}, your order {{orderId}} shipped." },
        { content: "Reminder for {{name}}." },
      ]);
      expect(vars).toEqual(["name", "orderId"]);
    });

    it("returns an empty array when no variables are present", () => {
      expect(extractVars([{ content: "no variables here" }])).toEqual([]);
    });
  });

  describe("extractPromptRefs", () => {
    it("extracts unique @prompt:slug references", () => {
      const refs = extractPromptRefs([
        { content: "Use @prompt:greeting and @prompt:signature." },
        { content: "Also @prompt:greeting again." },
      ]);
      expect(refs).toEqual(["greeting", "signature"]);
    });

    it("returns an empty array when there are no references", () => {
      expect(extractPromptRefs([{ content: "nothing to see here" }])).toEqual([]);
    });
  });

  describe("resolveMessageVariables", () => {
    it("replaces variables with provided values", () => {
      const resolved = resolveMessageVariables(
        [{ role: "user", content: "Hi {{name}}, welcome to {{place}}." }],
        { name: "Ada", place: "VerifyWise" },
      );
      expect(resolved[0].content).toBe("Hi Ada, welcome to VerifyWise.");
    });

    it("leaves unresolved variables as-is when no value is provided", () => {
      const resolved = resolveMessageVariables(
        [{ role: "user", content: "Hi {{name}}." }],
        {},
      );
      expect(resolved[0].content).toBe("Hi {{name}}.");
    });

    it("does not mutate the original messages array", () => {
      const original = [{ role: "user", content: "Hi {{name}}." }];
      const resolved = resolveMessageVariables(original, { name: "Ada" });
      expect(original[0].content).toBe("Hi {{name}}.");
      expect(resolved[0].content).toBe("Hi Ada.");
    });
  });

  describe("getLabelVariant", () => {
    it("returns 'success' for production", () => {
      expect(getLabelVariant("production")).toBe("success");
    });

    it("returns 'warning' for staging", () => {
      expect(getLabelVariant("staging")).toBe("warning");
    });

    it("returns 'info' for any other label", () => {
      expect(getLabelVariant("development")).toBe("info");
      expect(getLabelVariant("")).toBe("info");
    });
  });

  describe("GATEWAY_URL", () => {
    it("is a non-empty string", () => {
      expect(typeof GATEWAY_URL).toBe("string");
      expect(GATEWAY_URL.length).toBeGreaterThan(0);
    });
  });

  describe("streamPromptTest", () => {
    const encoder = new TextEncoder();

    function makeReader(chunks: string[]) {
      let i = 0;
      return {
        read: vi.fn(async () => {
          if (i < chunks.length) {
            const value = encoder.encode(chunks[i]);
            i += 1;
            return { done: false, value };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };
    }

    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("accumulates streamed delta content and reports usage/cost", async () => {
      const reader = makeReader([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}\n` +
          `data: ${JSON.stringify({ usage: { total_tokens: 42 }, cost_usd: 0.002 })}\n` +
          `data: [DONE]\n`,
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      }) as any;

      const onDelta = vi.fn();
      const result = await streamPromptTest({
        endpointSlug: "my-endpoint",
        messages: [{ role: "user", content: "hi" }],
        onDelta,
      });

      expect(result.content).toBe("Hello");
      expect(result.tokens).toBe(42);
      expect(result.cost).toBe(0.002);
      expect(onDelta).toHaveBeenCalledWith("Hel");
      expect(onDelta).toHaveBeenCalledWith("Hello");
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/ai-gateway/prompts/test",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        }),
      );
    });

    it("skips unparseable SSE chunks without throwing", async () => {
      const reader = makeReader([
        `data: not-json\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n`,
      ]);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      }) as any;

      const result = await streamPromptTest({
        endpointSlug: "e",
        messages: [],
        onDelta: vi.fn(),
      });
      expect(result.content).toBe("ok");
    });

    it("returns an error result when the response is not ok", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        text: async () => "Bad request",
      }) as any;

      const result = await streamPromptTest({
        endpointSlug: "e",
        messages: [],
        onDelta: vi.fn(),
      });
      expect(result.content).toBe("Error: Bad request");
      expect(result.tokens).toBe(0);
      expect(result.cost).toBe(0);
    });

    it("returns empty content when the response has no readable body", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: null,
      }) as any;

      const result = await streamPromptTest({
        endpointSlug: "e",
        messages: [],
        onDelta: vi.fn(),
      });
      expect(result.content).toBe("");
    });

    it("falls back to a 'no response' message when the stream ends with no content", async () => {
      const reader = makeReader([]);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      }) as any;

      const onDelta = vi.fn();
      const result = await streamPromptTest({ endpointSlug: "e", messages: [], onDelta });
      expect(result.content).toBe(
        "No response received from the model. Check that the endpoint has a valid API key configured.",
      );
      expect(onDelta).toHaveBeenCalledWith(result.content);
    });

    it("surfaces a chunk-level error when the stream ends with no content", async () => {
      const reader = makeReader([
        `data: ${JSON.stringify({ error: "guardrail blocked" })}\n`,
      ]);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      }) as any;

      const onDelta = vi.fn();
      const result = await streamPromptTest({ endpointSlug: "e", messages: [], onDelta });
      expect(result.content).toBe("Error: guardrail blocked");
      expect(onDelta).toHaveBeenCalledWith("Error: guardrail blocked");
    });

    it("releases the reader lock even if reading fails midway", async () => {
      const reader = {
        read: vi.fn().mockRejectedValue(new Error("stream broke")),
        releaseLock: vi.fn(),
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      }) as any;

      await expect(
        streamPromptTest({ endpointSlug: "e", messages: [], onDelta: vi.fn() }),
      ).rejects.toThrow("stream broke");
      expect(reader.releaseLock).toHaveBeenCalled();
    });
  });
});
