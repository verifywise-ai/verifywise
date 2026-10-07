/**
 * Coercions for raw `sequelize.query` rows. pg returns BIGINT/NUMERIC (and
 * COUNT) as strings, and can hand JSONB_AGG back as a string, so every utils
 * file reading such columns normalises them here rather than in its own copy.
 */

export const toNumber = (value: unknown): number =>
  typeof value === "number" ? value : Number(value ?? 0);

/** A JSON array column or aggregate as an array; anything unparseable is []. */
export const toJsonArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};
