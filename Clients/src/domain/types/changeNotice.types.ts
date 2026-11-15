export type ChangeNoticeVariant = "standard" | "rename" | "moved" | "welcome";

/** One entry of the change notice registry. Strings are English source text, rendered through t(). */
export interface ChangeNoticeEntry {
  id: string;
  /** Eligible on any page; takes priority over page entries. */
  global?: boolean;
  /** Route prefixes the entry applies to; empty when global. */
  routes: string[];
  variant: ChangeNoticeVariant;
  title: string;
  body?: string;
  items?: string[];
  rename?: { from: string; to: string };
  moved?: { item: string; before: string; now: string };
  /** data-testid of the element "Show me" highlights. */
  showMeTestId?: string;
  /** User guide article opened by "Read the guide". */
  guidePath?: string;
}
