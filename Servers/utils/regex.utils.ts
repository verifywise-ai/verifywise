/** Escape every regex metacharacter so `value` matches itself literally. */
export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
