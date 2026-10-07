/**
 * Names that the derived label gets wrong. Both providers compare the risk's
 * free-text mapping fields, while control coverage counts real control and
 * EU AI Act assessment links, so the plain "Shared assessment" read as one of
 * those links.
 */
const LABEL_OVERRIDES: Record<string, string> = {
  shared_assessment: "Shared assessment mapping",
  shared_control: "Shared control mapping",
};

/** Human label for a machine signal key. Derived, not a fixed map: providers
 * emit keys no static map knows about. */
export const signalLabel = (signal: string): string => {
  const override = LABEL_OVERRIDES[signal];
  if (override) return override;
  const spaced = signal.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
