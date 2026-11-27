import type { ChangeNoticeEntry } from "../../../domain/types/changeNotice.types";

/**
 * Change notice registry. Every restyle or restructure PR adds an entry here.
 * Strings are English source text and are rendered through t(); each needs a
 * de, fr and es entry in i18n/modules/changeNotice.ts, and the id needs a row in
 * change_notice_releases (a migration), so accounts created later never see it.
 */
export const CHANGE_NOTICES: readonly ChangeNoticeEntry[] = [
  {
    id: "new-look-2026-11",
    global: true,
    routes: [],
    variant: "welcome",
    title: "Welcome to the new look of VerifyWise",
    items: [
      "A cleaner design across every page.",
      "One sidebar: pages grouped under Record, Track and Enforce.",
      "A new Home page with what needs you today.",
    ],
  },
  {
    id: "home-2026-11",
    routes: ["/home"],
    variant: "standard",
    title: "Welcome to Home",
    items: [
      "Everything that needs you today is in one list.",
      "Counts for Record, Track and Enforce sit underneath.",
      "Start here is now the Get started tab.",
    ],
    guidePath: "getting-started/home",
  },
  {
    id: "ai-trust-index-2026-11",
    routes: ["/ai-trust-index"],
    variant: "moved",
    title: "AI Trust Index is now in the sidebar",
    body: "It used to be a separate app. Find it under Record, below Inventory.",
    moved: { item: "AI Trust Index", before: "App switcher", now: "Record" },
    showMeTestId: "nav-item-ai-trust-index",
    guidePath: "ai-trust-index/dashboard",
  },
  {
    id: "llm-evals-2026-11",
    routes: ["/evals"],
    variant: "moved",
    title: "LLM Evals is now in the sidebar",
    body: "It used to be a separate app. Find it under Enforce; its pages open inside the sidebar.",
    moved: { item: "LLM Evals", before: "App switcher", now: "Enforce" },
    showMeTestId: "nav-item-llm-evals",
  },
  {
    id: "ai-gateway-2026-11",
    routes: ["/ai-gateway"],
    variant: "moved",
    title: "AI Gateway is now in the sidebar",
    body: "It used to be a separate app. Find it under Enforce.",
    moved: { item: "AI Gateway", before: "App switcher", now: "Enforce" },
    showMeTestId: "nav-item-ai-gateway",
  },
  {
    id: "agent-controls-2026-11",
    routes: ["/ai-gateway/mcp"],
    variant: "moved",
    title: "Agent controls has its own place",
    body: "It used to sit inside the AI Gateway app. Find it under Enforce.",
    moved: { item: "Agent controls", before: "AI Gateway", now: "Enforce" },
    showMeTestId: "nav-item-agent-controls",
  },
  {
    id: "ai-detection-2026-11",
    routes: ["/shadow-ai", "/ai-detection"],
    variant: "moved",
    title: "Shadow AI and AI Detection are together now",
    body: "They used to be two separate apps. Find both under Record › AI Detection.",
    moved: { item: "AI Detection", before: "App switcher", now: "Record" },
    showMeTestId: "nav-item-ai-detection",
  },
  {
    id: "eu-ai-act-organization-2026-11",
    routes: ["/project-view", "/framework"],
    variant: "moved",
    title: "Organization-wide EU AI Act obligations moved",
    body: "Prohibited practices, AI literacy and the quality management system are now tracked once for the organization, in EU AI Act (organization) on the Frameworks page, instead of on every use case.",
    items: [
      "Work already done on your use cases was copied there and marked for review.",
      "Only Admins and members of the organizational project can see and edit it.",
    ],
    moved: { item: "EU AI Act (organization)", before: "Every use case", now: "Frameworks" },
    showMeTestId: "nav-item-frameworks",
    guidePath: "compliance/eu-ai-act",
  },
];

export const GLOBAL_NOTICE: ChangeNoticeEntry | null =
  CHANGE_NOTICES.find((entry) => entry.global) ?? null;
