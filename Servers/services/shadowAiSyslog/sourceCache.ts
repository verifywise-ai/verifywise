/**
 * Cache of active syslog sources used by the listener to authenticate lines.
 * The listener fills this in; until then there is nothing to invalidate.
 */

/** Drop the cached sources so the next line reloads them. */
export function invalidateSourceCache(): void {
  // Filled in with the listener.
}
