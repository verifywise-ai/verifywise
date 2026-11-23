import { describe, expect, it } from "vitest";
import { translations } from "../../../../i18n/translations";
import {
  TAB_FINDINGS,
  TAB_HEADERS,
  TAB_INSIGHTS,
  TAB_PATHS,
  TAB_RISKS,
  TAB_TEXT,
  TAB_VENDORS,
  tabOfPath,
} from "../tabs";

describe("tabOfPath", () => {
  it.each([
    ["/vendors", TAB_VENDORS],
    ["/vendors/risks", TAB_RISKS],
    ["/vendors/research-findings", TAB_FINDINGS],
    ["/vendors/insights", TAB_INSIGHTS],
  ])("reads %s as tab %s", (path, tab) => {
    expect(tabOfPath(path)).toBe(tab);
  });

  it("is the path of each tab", () => {
    for (const [tab, path] of Object.entries(TAB_PATHS)) {
      expect(tabOfPath(path)).toBe(tab);
    }
  });

  // The router matches a path without regard to case, so a link written as /Vendors/Risks opens the
  // Risks route. The tab has to be read the same way, or the page shows the vendors list there.
  it.each([
    ["/Vendors/Risks", TAB_RISKS],
    ["/VENDORS/RESEARCH-FINDINGS", TAB_FINDINGS],
    ["/vendors/Insights", TAB_INSIGHTS],
    ["/VENDORS", TAB_VENDORS],
  ])("reads %s without regard to case", (path, tab) => {
    expect(tabOfPath(path)).toBe(tab);
  });

  it.each([
    ["/vendors/", TAB_VENDORS],
    ["/vendors/risks/", TAB_RISKS],
    ["/vendors/research-findings//", TAB_FINDINGS],
    ["/Vendors/Insights/", TAB_INSIGHTS],
  ])("reads %s with a trailing slash", (path, tab) => {
    expect(tabOfPath(path)).toBe(tab);
  });

  // The router decodes the path before it matches, so a link written with encoded characters is
  // the same route.
  it.each([
    ["/vendors/research%2Dfindings", TAB_FINDINGS],
    ["/vendors/%72isks", TAB_RISKS],
    ["/%76endors/insights", TAB_INSIGHTS],
    ["/Vendors/Research%2DFindings/", TAB_FINDINGS],
  ])("reads %s as the route the router matches it to", (path, tab) => {
    expect(tabOfPath(path)).toBe(tab);
  });

  it.each(["/vendors/%E0%A4%A", "/vendors/risks%"])(
    "does not throw on %s, which is not valid encoding",
    (path) => {
      expect(() => tabOfPath(path)).not.toThrow();
    },
  );

  it.each([
    "/",
    "/vendors/unknown",
    "/vendors/risks-archive",
    "/projects/vendors/risks",
    "",
    "/vendors%2Frisks",
  ])(
    "reads %j as the vendors list, which is where a path that is not another tab's ends up",
    (path) => {
      expect(tabOfPath(path)).toBe(TAB_VENDORS);
    },
  );
});

describe("the text of the tabs", () => {
  const texts = [
    ...Object.values(TAB_HEADERS).flatMap((header) => [header.title, header.description]),
    ...Object.values(TAB_TEXT).flatMap((text) => [text.label, text.tooltip]),
  ];

  it("covers every tab", () => {
    expect(Object.keys(TAB_HEADERS).sort()).toEqual(Object.keys(TAB_PATHS).sort());
    expect(Object.keys(TAB_TEXT).sort()).toEqual(Object.keys(TAB_PATHS).sort());
  });

  // The page writes plain English and the DOM translator looks each string up whole, so a string
  // that is missing from a language is shown in English there.
  it.each(["de", "fr", "es"] as const)("is translated into %s", (lang) => {
    const missing = texts.filter((text) => !translations[lang]?.[text]);
    expect(missing).toEqual([]);
  });
});
