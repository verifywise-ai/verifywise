/**
 * Pluralize an entity_type string from a framework structure
 * ("control" → "Controls", "assessment_area" → "Assessment areas") for
 * use as a display label (progress cards, section headers, etc.).
 * Handles the small set of entity_type values used by generic
 * frameworks; falls back to a naive `+s` for anything unseen.
 */
export function pluralizeEntityType(entityType: string): string {
  const normalized = entityType.replace(/_/g, " ");
  const title = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  if (title.endsWith("y")) return `${title.slice(0, -1)}ies`;
  if (title.endsWith("s")) return title;
  return `${title}s`;
}
