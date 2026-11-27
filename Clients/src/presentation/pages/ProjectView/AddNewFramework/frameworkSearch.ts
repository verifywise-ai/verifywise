/**
 * Whether a framework card matches the AI Frameworks dialog search: the
 * trimmed query, case-insensitive, in the name or the description. An empty
 * query matches everything.
 */
export const matchesFrameworkSearch = (
  query: string,
  name?: string | null,
  description?: string | null,
): boolean => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    (name ?? "").toLowerCase().includes(needle) ||
    (description ?? "").toLowerCase().includes(needle)
  );
};
