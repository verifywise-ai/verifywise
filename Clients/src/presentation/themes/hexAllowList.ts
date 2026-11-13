/**
 * Screen files that may hold hex colours. Everything else under
 * `presentation/pages`, `presentation/components` and `presentation/utils` uses a token
 * (see `noHexInScreens.test.ts`).
 *
 * `file` is a path relative to `src/presentation`; a trailing slash allows a
 * whole folder. `literal` narrows an entry to one exact piece of text in that
 * file: the test ignores that text and still checks the rest of the file.
 * Add an entry only for a value that no token can stand in for, and say why.
 */
export interface HexAllowListEntry {
  file: string;
  reason: string;
  literal?: string;
}

export const HEX_ALLOW_LIST: readonly HexAllowListEntry[] = [
  {
    file: "pages/StyleGuide/",
    reason:
      "Internal reference page whose content is the colour values: it shows literal hex as swatches and copyable code.",
  },
  {
    file: "pages/IntakeFormBuilder/DesignPanel.tsx",
    reason:
      "Colour presets for the intake form colour picker. The choice is stored with the form, so the values are user data.",
  },
  {
    file: "components/UserGuide/WhatsNewSection.tsx",
    literal: "#306",
    reason: "Release-note prose naming React error #306. It is an issue number, not a colour.",
  },
  {
    file: "utils/providers/index.ts",
    reason:
      "LLM provider brand colours shown beside each provider's logo. They identify a third-party brand, so they stay the same in both looks.",
  },
];
