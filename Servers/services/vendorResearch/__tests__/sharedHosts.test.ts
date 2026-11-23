/**
 * The hosts where many people or companies have pages (spec D2.3, D4.5: a website match is strong
 * only against the vendor's own verified domain): the platforms of the source registry where users
 * publish (G6–G9), and the platforms that host their users' sites.
 */
import { REGISTRY } from "../sourceRegistry/entries";
import { isSharedHost, isSharedPlatformHost } from "../sharedHosts";

describe("isSharedHost", () => {
  it("holds every host of a platform where users publish (G6–G9), and every host under it", () => {
    const platforms = REGISTRY.filter((entry) => entry.userContent === true).flatMap(
      (entry) => entry.hosts,
    );
    expect(platforms).toEqual(expect.arrayContaining(["linkedin.com", "substack.com"]));
    for (const host of platforms) {
      expect(isSharedHost(host)).toBe(true);
      expect(isSharedHost(`acme.${host}`)).toBe(true);
    }
  });

  it("holds a platform that hosts its users' sites or pages", () => {
    for (const host of [
      "acme-analytics.github.io",
      "github.com",
      "sites.google.com",
      "t.me",
      "vk.com",
      "acme.netlify.app",
      "acme.wixsite.com",
    ]) {
      expect(isSharedHost(host)).toBe(true);
    }
  });

  it("reads a host as a domain key does: any case, with www. and a trailing dot", () => {
    expect(isSharedHost("WWW.LinkedIn.com.")).toBe(true);
  });

  it("does not hold a company's own domain, a domain whose name merely ends like a platform's, or the parent of a platform", () => {
    for (const host of [
      "acme-analytics.example",
      "notlinkedin.com",
      "linkedin.com.example",
      "google.com",
      "www.google.com",
      "",
    ]) {
      expect(isSharedHost(host)).toBe(false);
    }
  });
});

describe("isSharedPlatformHost", () => {
  it("holds a host where many have pages, in any case, with www. and a trailing dot", () => {
    for (const host of [
      "github.com",
      "WWW.GitHub.com.",
      "sites.google.com",
      "notion.site",
      "linkedin.com",
      "t.me",
    ]) {
      expect(isSharedPlatformHost(host)).toBe(true);
    }
  });

  it("holds a host under a platform that gives no user a subdomain of their own: it is the platform's", () => {
    for (const host of [
      "en.wikipedia.org",
      "uk.linkedin.com",
      "m.facebook.com",
      "gist.github.com",
      "old.reddit.com",
      "WWW.Gist.GitHub.com.",
    ]) {
      expect(isSharedPlatformHost(host)).toBe(true);
    }
  });

  it("does not hold a user's site under one, nor a company's own domain", () => {
    for (const host of [
      "acme.github.io",
      "acme.myshopify.com",
      "acme.substack.com",
      "acme.medium.com",
      "acme.blogspot.com",
      "acme.wordpress.com",
      "a.b.github.io",
      "notlinkedin.com",
      "google.com",
      "",
    ]) {
      expect(isSharedPlatformHost(host)).toBe(false);
    }
  });
});

/**
 * The hosts of code, models, packages, documents and apps (TR4-LLM-2): on each, unrelated people
 * and companies publish under one host, by a path (`huggingface.co/<org>`, `pypi.org/project/<name>`)
 * or by a subdomain of their own (`<org>.readthedocs.io`). A vendor whose website is a path on one
 * of them owns no page of the host.
 */
describe("the hosts of code, models, packages, documents and apps (TR4-LLM-2)", () => {
  const UNDER_A_PATH = [
    // code
    "bitbucket.org",
    "codeberg.org",
    "sourceforge.net",
    "gitee.com",
    "raw.githubusercontent.com",
    // models and data
    "huggingface.co",
    "kaggle.com",
    "replicate.com",
    // packages
    "npmjs.com",
    "pypi.org",
    "crates.io",
    "rubygems.org",
    "nuget.org",
    "packagist.org",
    "pkg.go.dev",
    "hub.docker.com",
    // documents
    "docs.google.com",
    "drive.google.com",
    "notion.so",
    "readthedocs.org",
    "gitbook.io",
    "readthedocs.io",
    // apps
    "apps.apple.com",
    "play.google.com",
    "chromewebstore.google.com",
    "marketplace.visualstudio.com",
  ];
  const A_SUBDOMAIN_EACH = [
    "hf.space",
    "bitbucket.io",
    "codeberg.page",
    "readthedocs.io",
    "gitbook.io",
  ];

  it.each(UNDER_A_PATH)("%s is shared, and no one owns the whole of it", (host) => {
    expect(isSharedHost(host)).toBe(true);
    expect(isSharedPlatformHost(host)).toBe(true);
    expect(isSharedPlatformHost(`WWW.${host.toUpperCase()}.`)).toBe(true);
  });

  it.each(UNDER_A_PATH.filter((host) => !A_SUBDOMAIN_EACH.includes(host)))(
    "a host under %s is the platform's too",
    (host) => {
      expect(isSharedHost(`help.${host}`)).toBe(true);
      expect(isSharedPlatformHost(`help.${host}`)).toBe(true);
    },
  );

  it.each(A_SUBDOMAIN_EACH)(
    "a subdomain of %s is one user's site: shared as a brand, owned as a site",
    (host) => {
      expect(isSharedHost(host)).toBe(true);
      expect(isSharedPlatformHost(host)).toBe(true);
      expect(isSharedHost(`acme-widgets.${host}`)).toBe(true);
      expect(isSharedPlatformHost(`acme-widgets.${host}`)).toBe(false);
    },
  );

  it("holds the tenants' host of a company, not the company's own domain", () => {
    for (const host of [
      "docker.com",
      "www.docker.com",
      "google.com",
      "apple.com",
      "www.apple.com",
      "visualstudio.com",
      "githubusercontent.com.example",
      "nothuggingface.co",
      "pypi.org.example",
    ]) {
      expect(isSharedHost(host)).toBe(false);
      expect(isSharedPlatformHost(host)).toBe(false);
    }
  });

  it("keeps the per-user subdomains of the platforms that were shared before", () => {
    for (const host of ["acme.github.io", "acme.netlify.app", "acme.notion.site"]) {
      expect(isSharedHost(host)).toBe(true);
      expect(isSharedPlatformHost(host)).toBe(false);
    }
    expect(isSharedPlatformHost("gist.github.com")).toBe(true);
  });
});
