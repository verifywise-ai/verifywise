/**
 * The hosts where many people or companies have pages (spec D2.3, D4.5: a website match is strong
 * only against the vendor's own verified domain): the platforms of the source registry where users
 * publish (G6–G9), and the platforms that host their users' sites.
 */
import { REGISTRY } from "../sourceRegistry/entries";
import { isSharedHost } from "../sharedHosts";

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
