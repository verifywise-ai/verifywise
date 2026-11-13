/**
 * Client entry for the shared semantic palette.
 * Existing imports of this file stay valid.
 *
 * Hands out the phase 1 token set, or the classic set when the user has
 * switched back to the old look (see ./uiStyle.ts). Both sets share one shape;
 * values are widened to `string` so either can stand behind the same type.
 */
import * as phase1Palette from "@design-tokens/palette";
import * as classicPalette from "@design-tokens/classic/palette";
import * as phase1Primitives from "@design-tokens/primitives";
import * as classicPrimitives from "@design-tokens/classic/primitives";
import { isClassicUi } from "./uiStyle";

type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends readonly (infer U)[]
      ? readonly Widen<U>[]
      : { readonly [K in keyof T]: Widen<T[K]> };

type PaletteModule = Widen<Omit<typeof phase1Palette, "default">>;
type PrimitivesModule = Widen<Omit<typeof phase1Primitives, "default">>;

const classic = isClassicUi();

const tokens: PaletteModule = classic ? classicPalette : phase1Palette;

/** Raw colour scales for the active look. Screens should prefer the semantic tokens. */
export const primitives: PrimitivesModule = classic ? classicPrimitives : phase1Primitives;

export const {
  status,
  risk,
  severity,
  accent,
  chart,
  text,
  icon,
  background,
  border,
  brand,
  button,
  editor,
  userTextColors,
  riskMark,
  stage,
  score,
  part,
  radius,
  palette,
} = tokens;

/**
 * Corner radius as CSS strings for the active look. Phase 1: 2px on buttons,
 * cards, inputs, menus and modals; 8px on the table search field; 9px on the
 * top corners of tabs; fully round pills. Classic: 4px, with 6px (md) and 8px (lg) for inner and large panels.
 */
export const radiusPx = {
  sm: `${radius.sm}px`,
  md: `${radius.md}px`,
  lg: `${radius.lg}px`,
  search: `${radius.search}px`,
  tab: `${radius.tab}px`,
  pill: `${radius.pill}px`,
} as const;

export default palette;
