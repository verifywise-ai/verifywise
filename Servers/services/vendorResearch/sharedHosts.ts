/**
 * The hosts on which many people or companies have pages: the platforms of the source registry
 * where users publish (G6–G9), and the platforms that host their users' sites under a path or a
 * subdomain of their own. Such a host says nothing about who a page on it is: its brand is the
 * platform's, and two addresses on it are as likely two companies as one. So it is never a brand
 * of a vendor (records/match.ts) and never a key of a match by website (vrdb/keys.ts), on the
 * vendor's side or on a list's (spec D2.3, D4.5: a website match is strong only against the
 * vendor's own verified domain). A host under one of them (`acme.github.io`) is one too.
 *
 * Whose site a host is, is another question: `acme.github.io` is one user's site, though its brand
 * is the platform's. So a host is no site of the vendor's own when it is one of these hosts or is
 * under one that gives no user a subdomain of their own (`isSharedPlatformHost`), while it says
 * nothing about who a page or a record is when it is one or is under one (`isSharedHost`).
 */
import { REGISTRY } from "./sourceRegistry/entries";

/**
 * Platforms that host their users' sites or pages and are no publisher of the registry: code
 * hosts, site builders, app hosts and the networks where a page is a path (`t.me/<name>`), and the
 * hosts where unrelated people and companies publish code, models, packages, documents and apps
 * (TR4-LLM-2). A company that runs one of them often has its own site there too (Hugging Face on
 * huggingface.co), but every other page of the host is a stranger's, so the host is shared. Where
 * the tenants' host is a subdomain of the company's own domain, that subdomain is listed and the
 * domain is not (`hub.docker.com`, `apps.apple.com`, never `docker.com` or `apple.com`).
 */
const HOSTING_PLATFORMS: readonly string[] = [
  "github.com",
  "github.io",
  "githubusercontent.com",
  "gitlab.com",
  "gitlab.io",
  "bitbucket.org",
  "bitbucket.io",
  "codeberg.org",
  "codeberg.page",
  "sourceforge.net",
  "gitee.com",
  // Models and data.
  "huggingface.co",
  "hf.space",
  "kaggle.com",
  "replicate.com",
  // Packages.
  "npmjs.com",
  "pypi.org",
  "crates.io",
  "rubygems.org",
  "nuget.org",
  "packagist.org",
  "pkg.go.dev",
  "hub.docker.com",
  // Documents.
  "docs.google.com",
  "drive.google.com",
  "notion.so",
  "readthedocs.org",
  "readthedocs.io",
  "gitbook.io",
  // Apps.
  "apps.apple.com",
  "play.google.com",
  "chromewebstore.google.com",
  "marketplace.visualstudio.com",
  // Sites.
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

/** A host as it is compared: lower case, without a trailing dot and without `www.`. */
const bareHost = (host: string): string => {
  const lower = host.toLowerCase().replace(/\.$/, "");
  return lower.startsWith("www.") ? lower.slice("www.".length) : lower;
};

/**
 * True when a host is, or is under, a host where many have pages. For what a host says about who
 * a page or a record is (records/match.ts, vrdb/keys.ts, the records of HIBP and of a status page
 * in records/index.ts): the brand of `acme.github.io` is the platform's as much as that of
 * `github.com` is.
 */
export function isSharedHost(host: string): boolean {
  const bare = bareHost(host);
  return SHARED_HOSTS.some((shared) => bare === shared || bare.endsWith(`.${shared}`));
}

/**
 * The platforms that give each user a subdomain of their own: the whole of `acme.github.io` is one
 * user's site. A host under any other shared host (`en.wikipedia.org`, `uk.linkedin.com`,
 * `gist.github.com`) belongs to the platform, as the host itself does.
 */
const PER_USER_SUBDOMAIN_PLATFORMS: readonly string[] = [
  "bitbucket.io",
  "blogspot.com",
  "codeberg.page",
  "gitbook.io",
  "github.io",
  "gitlab.io",
  "herokuapp.com",
  "hf.space",
  "medium.com",
  "myshopify.com",
  "netlify.app",
  "notion.site",
  "pages.dev",
  "readthedocs.io",
  "substack.com",
  "tumblr.com",
  "vercel.app",
  "webflow.io",
  "wixsite.com",
  "wordpress.com",
];

/**
 * True when no single user or company owns the whole of a host: it is exactly a host where many
 * have pages (`github.com`, `www.notion.site`), or it is under one that gives no user a subdomain
 * of their own (`en.wikipedia.org`, `gist.github.com`). For whose site a host is (the vendor's own
 * pages in webResearch/webSession.ts and policySnapshots.ts, the vendor's domain as a term of
 * identity.ts): every page of those is as likely a stranger's as the vendor's, while the whole of
 * `acme.github.io` or `acme.substack.com` is one user's site.
 */
export function isSharedPlatformHost(host: string): boolean {
  const bare = bareHost(host);
  if (SHARED_HOSTS.includes(bare)) return true;
  const parent = SHARED_HOSTS.find((shared) => bare.endsWith(`.${shared}`));
  return parent !== undefined && !PER_USER_SUBDOMAIN_PLATFORMS.includes(parent);
}
