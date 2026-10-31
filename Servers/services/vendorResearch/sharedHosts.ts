/**
 * The hosts on which many people or companies have pages: the platforms of the source registry
 * where users publish (G6–G9), and the platforms that host their users' sites under a path or a
 * subdomain of their own. Such a host says nothing about who a page on it is: its brand is the
 * platform's, and two addresses on it are as likely two companies as one. So it is never a brand
 * of a vendor (records/match.ts) and never a key of a match by website (vrdb/keys.ts), on the
 * vendor's side or on a list's (spec D2.3, D4.5: a website match is strong only against the
 * vendor's own verified domain). A host under one of them (`acme.github.io`) is one too.
 */
import { REGISTRY } from "./sourceRegistry/entries";

/**
 * Platforms that host their users' sites or pages and are no publisher of the registry: code
 * hosts, site builders, app hosts and the networks where a page is a path (`t.me/<name>`).
 */
const HOSTING_PLATFORMS: readonly string[] = [
  "github.com",
  "github.io",
  "gitlab.com",
  "gitlab.io",
  "sites.google.com",
  "netlify.app",
  "vercel.app",
  "pages.dev",
  "herokuapp.com",
  "wixsite.com",
  "webflow.io",
  "notion.site",
  "myshopify.com",
  "t.me",
  "vk.com",
  "linktr.ee",
];

const SHARED_HOSTS: readonly string[] = [
  ...REGISTRY.filter((entry) => entry.userContent === true).flatMap((entry) => entry.hosts),
  ...HOSTING_PLATFORMS,
];

/** True when a host is, or is under, a host where many have pages. */
export function isSharedHost(host: string): boolean {
  const lower = host.toLowerCase().replace(/\.$/, "");
  const bare = lower.startsWith("www.") ? lower.slice("www.".length) : lower;
  return SHARED_HOSTS.some((shared) => bare === shared || bare.endsWith(`.${shared}`));
}
