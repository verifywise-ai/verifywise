// Servers/utils/__tests__/aiTrustIndexHash.test.ts
import { computeHashes, canonicalize } from "../aiTrustIndexHash";
import { ITrustIndexAppData } from "../../domain.layer/interfaces/i.aiTrustIndex";

const baseApp: ITrustIndexAppData = {
  slug: "claude",
  name: "Claude",
  vendor: "Anthropic",
  domain: "claude.ai",
  category: "Assistant",
  scoreOutOf100: 83,
  letterGrade: "B",
  displayedGrade: "B",
  confidence: "High",
  dealbreakerFlags: [],
  summary: "Strong policy.",
  highlights: [
    { label: "Training", text: "Opt-out." },
    { label: "Deletion", text: "30 days." },
  ],
  policyUrl: "https://anthropic.com/legal/privacy",
  policyLastUpdated: "2026-06-08",
  modalities: ["text", "image"],
  processesBiometrics: false,
  iconUrl: "https://icons.duckduckgo.com/ip3/claude.ai.ico",
};

describe("canonicalize", () => {
  it("sorts arrays of objects deterministically regardless of element/key order", () => {
    const a = canonicalize([
      { label: "B", text: "y" },
      { label: "A", text: "x" },
    ]);
    const b = canonicalize([
      { text: "x", label: "A" },
      { text: "y", label: "B" },
    ]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("computeHashes", () => {
  it("is stable across object key and array ordering (no false 'changed')", () => {
    const a = computeHashes(baseApp);
    const reordered: ITrustIndexAppData = {
      ...baseApp,
      modalities: [...baseApp.modalities].reverse(),
      highlights: [...baseApp.highlights].reverse(),
      dealbreakerFlags: [],
    };
    const b = computeHashes(reordered);
    expect(b.fullHash).toBe(a.fullHash);
    expect(b.materialHash).toBe(a.materialHash);
  });

  it("ignores iconUrl in both hashes (cosmetic/derived)", () => {
    const a = computeHashes(baseApp);
    const b = computeHashes({ ...baseApp, iconUrl: "https://example.com/other.ico" });
    expect(b.fullHash).toBe(a.fullHash);
    expect(b.materialHash).toBe(a.materialHash);
  });

  it("ignores policyUrl query/fragment in full hash", () => {
    const a = computeHashes(baseApp);
    const b = computeHashes({ ...baseApp, policyUrl: baseApp.policyUrl + "?v=2#section" });
    expect(b.fullHash).toBe(a.fullHash);
  });

  it("changes full hash but NOT material hash when only summary is reworded", () => {
    const a = computeHashes(baseApp);
    const b = computeHashes({ ...baseApp, summary: "A reworded summary." });
    expect(b.materialHash).toBe(a.materialHash);
    expect(b.fullHash).not.toBe(a.fullHash);
  });

  it("changes material hash when grade changes", () => {
    const a = computeHashes(baseApp);
    const b = computeHashes({
      ...baseApp,
      letterGrade: "C",
      displayedGrade: "C",
      scoreOutOf100: 60,
    });
    expect(b.materialHash).not.toBe(a.materialHash);
  });

  it("normalizes the slug in both hashes (case/whitespace insensitive)", () => {
    const a = computeHashes({ ...baseApp, slug: "ChatGPT" });
    const b = computeHashes({ ...baseApp, slug: "  chatgpt  " });
    expect(b.fullHash).toBe(a.fullHash);
    expect(b.materialHash).toBe(a.materialHash);
  });

  it("ignores the feedVersion-2 history field in both hashes (volatile metadata)", () => {
    const a = computeHashes(baseApp);
    const withHistory = {
      ...baseApp,
      history: {
        firstAssessed: "2026-06-08",
        lastChecked: "2026-06-19",
        assessmentCount: 3,
        scoreHistory: [{ date: "2026-06-19", score: 83, grade: "B" }],
      },
    } as ITrustIndexAppData;
    const b = computeHashes(withHistory);
    // A later run that only refreshed history's lastChecked must not change either hash.
    const laterCheck = {
      ...withHistory,
      history: { ...(withHistory as any).history, lastChecked: "2026-06-26" },
    } as ITrustIndexAppData;
    const c = computeHashes(laterCheck);
    expect(b.fullHash).toBe(a.fullHash);
    expect(b.materialHash).toBe(a.materialHash);
    expect(c.fullHash).toBe(a.fullHash);
  });
});
