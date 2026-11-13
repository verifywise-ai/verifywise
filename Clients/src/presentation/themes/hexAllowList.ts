/**
 * Screen files that may hold hex colours. Everything else under
 * `presentation/pages` and `presentation/components` uses a token
 * (see `noHexInScreens.test.ts`).
 *
 * `file` is a path relative to `src/presentation`; a trailing slash allows a
 * whole folder. Add an entry only for a value that no token can stand in for,
 * and say why.
 */
export interface HexAllowListEntry {
  file: string;
  reason: string;
}

export const HEX_ALLOW_LIST: readonly HexAllowListEntry[] = [
  {
    file: "pages/StyleGuide/",
    reason:
      "The design-system reference page. It shows literal token values as swatches and copyable code.",
  },
  {
    file: "pages/IntakeFormBuilder/DesignPanel.tsx",
    reason:
      "Colour presets for the intake form colour picker. The choice is stored with the form, so the values are user data.",
  },
  {
    file: "components/EmptyState/EmptyIllustration.tsx",
    reason: "Illustration artwork with a light and a dark variant. It is a drawing, not UI state.",
  },
  {
    file: "components/UserGuide/WhatsNewSection.tsx",
    reason: "Release notes text. Issue numbers such as #306 match the hex pattern.",
  },
  {
    file: "components/VendorLogo/index.tsx",
    reason:
      "The classic look keeps its 12 avatar colours; phase 1 uses chartTheme.series. Remove with the classic look in January 2027.",
  },
  {
    file: "pages/EvalsDashboard/components/PerformanceChart.tsx",
    reason:
      "The classic look keeps its 15 line colours (and phase 1 its tail past nine). Remove with the classic look in January 2027.",
  },
];
