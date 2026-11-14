import { beforeEach, describe, expect, it } from "vitest";
import { clearNoticeMarkers, clearViewMarker, markViewRequested } from "../noticeStorage";
import { failView, mayRequestView, resetViewDecisions } from "../viewDecision";

beforeEach(() => {
  sessionStorage.clear();
  resetViewDecisions();
});

describe("noticeStorage", () => {
  it("marks a view once per tab session", () => {
    expect(markViewRequested("a")).toBe(true);
    expect(markViewRequested("a")).toBe(false);
  });

  it("clearNoticeMarkers removes every marker and nothing else", () => {
    markViewRequested("a");
    markViewRequested("b");
    sessionStorage.setItem("other", "1");
    clearNoticeMarkers();
    expect(markViewRequested("a")).toBe(true);
    expect(markViewRequested("b")).toBe(true);
    expect(sessionStorage.getItem("other")).toBe("1");
  });

  it("clearViewMarker removes one marker", () => {
    markViewRequested("a");
    markViewRequested("b");
    clearViewMarker("a");
    expect(markViewRequested("a")).toBe(true);
    expect(markViewRequested("b")).toBe(false);
  });
});

describe("failView", () => {
  it("frees the marker for the next page load and stops asking in this one", () => {
    expect(mayRequestView("a")).toBe(true);
    failView("a");
    expect(sessionStorage.getItem("vw-change-notice-requested:a")).toBeNull();
    expect(mayRequestView("a")).toBe(false);
    resetViewDecisions();
    expect(mayRequestView("a")).toBe(true);
  });
});
