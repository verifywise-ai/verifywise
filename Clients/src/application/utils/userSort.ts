interface NamedUser {
  id: number | string;
  name?: string | null;
  surname?: string | null;
}

/** Display name by user id (as a string), built once so a sort does not search the list per comparison. */
export const buildUserSortNames = (users: NamedUser[]): Map<string, string> =>
  new Map(users.map((u) => [String(u.id), `${u.name ?? ""} ${u.surname ?? ""}`.trim()]));

/** The display name a person column sorts by; empty when the user is unknown. */
export const userSortName = (
  names: Map<string, string>,
  id: number | string | null | undefined,
): string => (id === null || id === undefined ? "" : (names.get(String(id)) ?? ""));

/** Case-insensitive, locale-aware comparison of two display names. */
export const compareNames = (a: string, b: string): number =>
  a.toLowerCase().localeCompare(b.toLowerCase());
