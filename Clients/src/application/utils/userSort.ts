interface NamedUser {
  id: number | string;
  name?: string | null;
  surname?: string | null;
}

/** The display name a person column sorts by; empty when the user is unknown. */
export const userSortName = (
  users: NamedUser[],
  id: number | string | null | undefined,
): string => {
  if (id === null || id === undefined) return "";
  const user = users.find((u) => String(u.id) === String(id));
  return user ? `${user.name ?? ""} ${user.surname ?? ""}`.trim() : "";
};

/** Case-insensitive, locale-aware comparison of two display names. */
export const compareNames = (a: string, b: string): number =>
  a.toLowerCase().localeCompare(b.toLowerCase());
