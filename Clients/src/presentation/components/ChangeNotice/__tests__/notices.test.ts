import { describe, it, expect, beforeEach, vi } from "vitest";
import { CHANGE_NOTICES, GLOBAL_NOTICE } from "../notices";
import { noticesSuppressed, markViewRequested } from "../noticeStorage";
import { translations } from "../../../../i18n/translations";
import { NAV_GROUPS } from "../../UnifiedSidebar/navConfig";

const collectNavIds = (): Set<string> => {
  const ids = new Set<string>();
  const walk = (nodes: any[]) =>
    nodes.forEach((n) => {
      if (n.id) ids.add(n.id);
      if (n.children) walk(n.children);
      if (n.items) walk(n.items);
    });
  walk(NAV_GROUPS as any[]);
  return ids;
};

const strings = (e: (typeof CHANGE_NOTICES)[number]): string[] =>
  [
    e.title,
    e.body,
    ...(e.items ?? []),
    e.rename?.from,
    e.rename?.to,
    e.moved?.item,
    e.moved?.before,
    e.moved?.now,
  ].filter((s): s is string => Boolean(s));

describe("CHANGE_NOTICES", () => {
  it("has the seven shipped entries", () => {
    expect(CHANGE_NOTICES).toHaveLength(7);
  });

  it("uses unique ids that the server accepts", () => {
    const ids = CHANGE_NOTICES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/));
  });

  it("has at most one global entry, and it is the welcome card", () => {
    expect(CHANGE_NOTICES.filter((e) => e.global)).toHaveLength(1);
    expect(GLOBAL_NOTICE?.id).toBe("new-look-2026-11");
    expect(GLOBAL_NOTICE?.variant).toBe("welcome");
    expect(GLOBAL_NOTICE?.routes).toEqual([]);
  });

  it("keeps variants consistent with their data", () => {
    CHANGE_NOTICES.forEach((e) => {
      expect((e.items ?? []).length).toBeLessThanOrEqual(3);
      if (e.variant === "moved") expect(e.moved).toBeDefined();
      if (e.variant === "rename") expect(e.rename).toBeDefined();
      if (!e.global) expect(e.routes.length).toBeGreaterThan(0);
    });
  });

  it("has de, fr and es text for every notice string and chrome label", () => {
    const chrome = [
      "What's changed",
      "Show me",
      "Got it",
      "Read the guide",
      "Dismiss",
      "Undo",
      "You won't see this again on this page.",
      "Before",
      "Now",
      "New name:",
      "Keep the new look",
      "Switch back",
      "You can change this any time in Settings › Preferences.",
    ];
    const all = [...CHANGE_NOTICES.flatMap(strings), ...chrome];
    for (const lang of ["de", "fr", "es"]) {
      all.forEach((s) => {
        expect(translations[lang][s], `${lang}: ${s}`).toBeTruthy();
      });
    }
  });

  it("points Show me at a real sidebar item", () => {
    const navIds = collectNavIds();
    CHANGE_NOTICES.forEach((e) => {
      if (!e.showMeTestId) return;
      const m = /^nav-item-(.+)$/.exec(e.showMeTestId);
      expect(m, e.showMeTestId).not.toBeNull();
      expect(navIds.has(m![1])).toBe(true);
    });
  });
});

describe("storage helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("suppresses only when the off switch is 'off'", () => {
    expect(noticesSuppressed()).toBe(false);
    localStorage.setItem("vw-change-notices", "off");
    expect(noticesSuppressed()).toBe(true);
  });

  it("de-dupes view requests per session", () => {
    expect(markViewRequested("a")).toBe(true);
    expect(markViewRequested("a")).toBe(false);
    expect(markViewRequested("b")).toBe(true);
  });

  it("does not throw when storage is blocked", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(noticesSuppressed()).toBe(false);
    expect(markViewRequested("a")).toBe(true);
    get.mockRestore();
    set.mockRestore();
  });
});
