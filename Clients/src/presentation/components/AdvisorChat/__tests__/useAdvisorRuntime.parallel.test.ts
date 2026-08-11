import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Capture the transport constructor options so we can assert the body flag.
let capturedOptions: { body?: unknown } | undefined;

vi.mock("ai", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    DefaultChatTransport: class {
      constructor(options: { body?: unknown }) {
        capturedOptions = options;
      }
    },
  };
});

vi.mock("@assistant-ui/react-ai-sdk", () => ({
  useChatRuntime: () => ({ mocked: true }),
}));

import { useAdvisorRuntime } from "../useAdvisorRuntime";

describe("useAdvisorRuntime parallel flag", () => {
  it("sends parallel:true in the transport body when enabled", () => {
    renderHook(() => useAdvisorRuntime(7, "governance" as never, true));
    expect(capturedOptions?.body).toEqual({ llmKeyId: 7, parallel: true });
  });

  it("defaults parallel to false when omitted", () => {
    renderHook(() => useAdvisorRuntime(7, "governance" as never));
    expect(capturedOptions?.body).toEqual({ llmKeyId: 7, parallel: false });
  });
});
