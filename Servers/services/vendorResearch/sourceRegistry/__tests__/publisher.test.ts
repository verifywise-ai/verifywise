/**
 * The publisher behind an address (M3 Part B): the key under which two sources count as one when
 * the credibility rule asks for independent publishers. It moved here from sourceTiers.ts.
 */
import { publisherKey } from "../publisher";

describe("publisherKey", () => {
  it.each([
    ["https://www.bbc.co.uk/news/a", "bbc"],
    ["https://www.bbc.com/news/a", "bbc"],
    ["https://news.example.com/a", "example"],
    ["https://legal.example.org/a", "example"],
    ["https://acme.com/", "acme"],
    ["https://trust.acme.com/soc2", "acme"],
    ["https://acme.co.uk/", "acme"],
    ["https://www.acme.com.au/", "acme"],
    ["https://WWW.Acme.COM/", "acme"],
    ["https://acme.com:8443/", "acme"],
    ["https://localhost/", "localhost"],
  ])("reads %s as %s", (url, key) => {
    expect(publisherKey(url)).toBe(key);
  });

  it("is null for an address that is not one", () => {
    expect(publisherKey("not a url")).toBeNull();
    expect(publisherKey("")).toBeNull();
  });

  it("ignores the top-level domain, so one name on two domains is one publisher", () => {
    expect(publisherKey("https://bbc.co.uk/a")).toBe(publisherKey("https://bbc.com/b"));
    expect(publisherKey("https://acme.com/")).toBe(publisherKey("https://acme.org/"));
  });

  it("takes every tenant of a hosting platform for one publisher, which can only lower a label", () => {
    expect(publisherKey("https://acme.github.io/")).toBe("github");
    expect(publisherKey("https://other.github.io/")).toBe("github");
  });
});
