/**
 * The tabs of the Vendors page: their values, the path each one is a route of, and the text the
 * page shows for each. Kept apart from the page so that a path and a string can be tested without
 * rendering it.
 */

/** The tabs of the page. Each one is a route of its own, so a link can open it. */
export const TAB_VENDORS = "1";
export const TAB_RISKS = "2";
export const TAB_FINDINGS = "3";
export const TAB_INSIGHTS = "4";

export const TAB_PATHS: Record<string, string> = {
  [TAB_VENDORS]: "/vendors",
  [TAB_RISKS]: "/vendors/risks",
  [TAB_FINDINGS]: "/vendors/research-findings",
  [TAB_INSIGHTS]: "/vendors/insights",
};

/** The tabs that are not the vendors list, which is where every other path ends up. */
const OTHER_TABS = [TAB_RISKS, TAB_FINDINGS, TAB_INSIGHTS];

/**
 * A path as the router matches it: each segment decoded (`/vendors/research%2Dfindings` is the
 * Research findings route). A segment that is not valid encoding is left as it is.
 */
const decodePath = (pathname: string): string =>
  pathname
    .split("/")
    .map((segment) => {
      try {
        // An encoded slash stays one, as the router keeps it: it is part of a name, not a separator.
        return decodeURIComponent(segment).replace(/\//g, "%2F");
      } catch {
        return segment;
      }
    })
    .join("/");

/**
 * The tab a path is on: the vendors list for `/vendors` and for any path that is not another tab's.
 * The router matches a path without regard to case, with or without a trailing slash, and after
 * decoding it, so `/Vendors/Risks/` and `/vendors/%72isks` are the Risks route; the tab is read the
 * same way, or the page would show the vendors list on the Risks route.
 */
export const tabOfPath = (pathname: string): string => {
  const path = decodePath(pathname).toLowerCase().replace(/\/+$/, "");
  const tab = OTHER_TABS.find(
    (candidate) => path === TAB_PATHS[candidate] || path.startsWith(`${TAB_PATHS[candidate]}/`),
  );
  return tab ?? TAB_VENDORS;
};

/** What the page says about itself above each tab. */
export const TAB_HEADERS: Record<string, { title: string; description: string }> = {
  [TAB_VENDORS]: {
    title: "Vendor list",
    description:
      "This table includes a list of external entities that provide AI-related products, services, or components. You can create and manage all vendors here.",
  },
  [TAB_RISKS]: {
    title: "Vendor risks list",
    description:
      "This table includes a list of risks related to a vendor. You can create and manage all vendor risks here.",
  },
  [TAB_FINDINGS]: {
    title: "Research findings",
    description:
      "Risks that the research agent suggested for your vendors. Review each finding, then add it to the vendor risk register or dismiss it.",
  },
  [TAB_INSIGHTS]: {
    title: "Vendor risk insights",
    description: "Heat map, blast radius, duplicates and framework coverage of vendor risks.",
  },
};

/** The descriptions of the headers, by tab. */
export const TAB_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_HEADERS).map(([tab, header]) => [tab, header.description]),
);

/** The name of each tab, and what its tooltip says it is for. */
export const TAB_TEXT: Record<string, { label: string; tooltip: string }> = {
  [TAB_VENDORS]: {
    label: "Vendors",
    tooltip: "Third-party AI suppliers and their review status",
  },
  [TAB_RISKS]: {
    label: "Risks",
    tooltip: "Security and compliance risks from vendor relationships",
  },
  [TAB_FINDINGS]: {
    label: "Research findings",
    tooltip: "Risks the research agent suggested, waiting for your decision",
  },
  [TAB_INSIGHTS]: {
    label: "Insights",
    tooltip: "Heat map, blast radius, duplicates and framework coverage of vendor risks",
  },
};
