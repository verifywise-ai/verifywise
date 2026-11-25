/**
 * The host pin of the list kit: a list is the operator's own file only when the address that
 * answered, after the redirects, is the operator's. The page guard follows redirects and says where
 * the answer came from; a connector checks that address, a 304 included, and fails the download as
 * not allowed when it is not (the error holds no address: it can carry a token).
 */

/** Where a list may come from. */
export interface Pin {
  /** The hosts, in lower case, exactly: `data.example.org` is not `www.data.example.org`. */
  hosts: readonly string[];
  /**
   * The paths the file may be under, each a directory with its closing slash (`/odi/ffdd/`: the
   * prefix `/odi` would also let `/odi-other/` through). Default every path.
   */
  pathPrefixes?: readonly string[];
}

const DEFAULT_PATH_PREFIXES: readonly string[] = ["/"];

/**
 * Whether an address is the operator's: https, no user name or password, no port other than the one
 * https has by default (an address cannot be told from it), a host that is one of `hosts` exactly
 * (host names have no case, and an address in Unicode is read as the host it is), and a path that
 * begins with one of the prefixes. The path is the one the address has after its dot segments are
 * resolved, so `/a/../b` is `/b`. Anything that does not parse is not pinned.
 */
export function isPinned(url: string, pin: Pin): boolean {
  try {
    const address = new URL(url);
    if (
      address.protocol !== "https:" ||
      address.username !== "" ||
      address.password !== "" ||
      address.port !== ""
    ) {
      return false;
    }
    const prefixes = pin.pathPrefixes ?? DEFAULT_PATH_PREFIXES;
    return (
      pin.hosts.some((host) => host.toLowerCase() === address.hostname) &&
      prefixes.some((prefix) => address.pathname.startsWith(prefix))
    );
  } catch {
    return false;
  }
}
