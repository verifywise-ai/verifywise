import { describe, it, expect } from "vitest";
import { resolveNotice } from "../resolveNotice";
import type { ChangeNoticeEntry } from "../../../../domain/types/changeNotice.types";

describe("resolveNotice", () => {
  it.each([
    ["/home", "home-2026-11"],
    ["/ai-gateway/mcp/runs", "agent-controls-2026-11"],
    ["/ai-gateway/dashboard", "ai-gateway-2026-11"],
    ["/ai-gateway", "ai-gateway-2026-11"],
    ["/shadow-ai/insights", "ai-detection-2026-11"],
    ["/ai-detection/scan", "ai-detection-2026-11"],
    ["/ai-trust-index", "ai-trust-index-2026-11"],
    ["/evals", "llm-evals-2026-11"],
  ])("%s resolves to %s", (path, id) => {
    expect(resolveNotice(path)?.id).toBe(id);
  });

  it("returns null when no entry matches", () => {
    expect(resolveNotice("/vendors")).toBeNull();
  });

  it("does not match a sibling path that only shares a string prefix", () => {
    expect(resolveNotice("/homework")).toBeNull();
  });

  it("ignores global entries", () => {
    expect(resolveNotice("/anything")?.id).not.toBe("new-look-2026-11");
  });

  it("picks the longest prefix, never both", () => {
    const mk = (id: string, routes: string[]): ChangeNoticeEntry => ({
      id,
      routes,
      variant: "standard",
      title: id,
    });
    const entries = [mk("short", ["/a"]), mk("long", ["/a/b"])];
    expect(resolveNotice("/a/b/c", entries)?.id).toBe("long");
    expect(resolveNotice("/a/x", entries)?.id).toBe("short");
  });
});
