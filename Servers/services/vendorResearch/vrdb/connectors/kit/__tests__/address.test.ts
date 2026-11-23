/**
 * The host pin of the list kit (kit/address.ts): whether the address that answered, after
 * redirects, is the operator's own.
 */
import { type Pin, isPinned } from "../address";

const NHTSA: Pin = { hosts: ["static.nhtsa.gov"], pathPrefixes: ["/odi/ffdd/sgo-2021-01/"] };
const FILE = "https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_ADS.csv";

describe("isPinned", () => {
  describe("an address of the operator", () => {
    it("is pinned when it is https, on the host, under a path prefix", () => {
      expect(isPinned(FILE, NHTSA)).toBe(true);
      expect(isPinned("https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/other.csv?x=1#y", NHTSA)).toBe(
        true,
      );
    });

    it("takes any path under the default prefix", () => {
      const pin: Pin = { hosts: ["data.example.org"] };
      expect(isPinned("https://data.example.org/", pin)).toBe(true);
      expect(isPinned("https://data.example.org/a/b/c.json", pin)).toBe(true);
      expect(isPinned("https://data.example.org", pin)).toBe(true);
    });

    it("takes any of several hosts and any of several prefixes", () => {
      const pin: Pin = {
        hosts: ["files.example.org", "cdn.example.org"],
        pathPrefixes: ["/lists/", "/archive/"],
      };
      expect(isPinned("https://files.example.org/lists/a.csv", pin)).toBe(true);
      expect(isPinned("https://cdn.example.org/archive/a.csv", pin)).toBe(true);
      expect(isPinned("https://cdn.example.org/lists/a.csv", pin)).toBe(true);
      expect(isPinned("https://cdn.example.org/other/a.csv", pin)).toBe(false);
      expect(isPinned("https://www.example.org/lists/a.csv", pin)).toBe(false);
    });

    it("reads the host without regard to case, as hosts have none", () => {
      expect(isPinned(FILE.replace("static.nhtsa.gov", "STATIC.NHTSA.GOV"), NHTSA)).toBe(true);
      expect(isPinned(FILE.replace("https", "HTTPS"), NHTSA)).toBe(true);
      const upper: Pin = { hosts: ["Static.NHTSA.gov"], pathPrefixes: NHTSA.pathPrefixes };
      expect(isPinned(FILE, upper)).toBe(true);
    });

    it("reads a host written in Unicode as the host it is", () => {
      const pin: Pin = { hosts: ["xn--bcher-kva.example"] };
      expect(isPinned(`https://b${String.fromCodePoint(0xfc)}cher.example/x`, pin)).toBe(true);
    });

    it("takes the port that https has by default, which the address cannot be told from", () => {
      expect(isPinned(FILE.replace("static.nhtsa.gov", "static.nhtsa.gov:443"), NHTSA)).toBe(true);
    });
  });

  describe("an address that is not", () => {
    it.each([
      ["plain http", FILE.replace("https", "http")],
      ["another scheme", FILE.replace("https", "ftp")],
      ["no scheme", "static.nhtsa.gov/odi/ffdd/sgo-2021-01/a.csv"],
      ["a protocol-relative address", "//static.nhtsa.gov/odi/ffdd/sgo-2021-01/a.csv"],
      ["another port", FILE.replace("static.nhtsa.gov", "static.nhtsa.gov:8443")],
      ["a user name", FILE.replace("https://", "https://user@")],
      ["a user name and a password", FILE.replace("https://", "https://user:secret@")],
      ["a password alone", FILE.replace("https://", "https://:secret@")],
      ["another host", FILE.replace("static.nhtsa.gov", "example.test")],
      [
        "a host that only starts like it",
        FILE.replace("static.nhtsa.gov", "static.nhtsa.gov.example.test"),
      ],
      [
        "a look-alike host that holds it as a label",
        FILE.replace("static.nhtsa.gov", "static.nhtsa.gov.attacker.net"),
      ],
      ["a host that ends like it", FILE.replace("static.nhtsa.gov", "evilstatic.nhtsa.gov")],
      ["a subdomain of it", FILE.replace("static.nhtsa.gov", "www.static.nhtsa.gov")],
      ["a parent of it", FILE.replace("static.nhtsa.gov", "nhtsa.gov")],
      ["a host with a trailing dot", FILE.replace("static.nhtsa.gov", "static.nhtsa.gov.")],
      [
        "the host as a user name",
        "https://static.nhtsa.gov@example.test/odi/ffdd/sgo-2021-01/a.csv",
      ],
      ["the host in a path", "https://example.test/static.nhtsa.gov/odi/ffdd/sgo-2021-01/a.csv"],
      [
        "the host in a query",
        "https://example.test/?https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/",
      ],
      ["an IP address", "https://192.0.2.1/odi/ffdd/sgo-2021-01/a.csv"],
    ])("is not pinned: %s", (_name, address) => {
      expect(isPinned(address, NHTSA)).toBe(false);
    });

    it.each([
      ["another directory", "https://static.nhtsa.gov/odi/other/a.csv"],
      ["the directory below another one", "https://static.nhtsa.gov/x/odi/ffdd/sgo-2021-01/a.csv"],
      [
        "a directory that only starts like it",
        "https://static.nhtsa.gov/odi/ffdd/sgo-2021-01-x/a.csv",
      ],
      ["the directory without its closing slash", "https://static.nhtsa.gov/odi/ffdd/sgo-2021-01"],
      ["the root", "https://static.nhtsa.gov/"],
      ["a path of another case", "https://static.nhtsa.gov/ODI/ffdd/sgo-2021-01/a.csv"],
      [
        "a path that climbs out with dot segments",
        "https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/../../evil.csv",
      ],
      [
        "a path that climbs out with encoded dot segments",
        "https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/%2e%2e/%2E%2E/evil.csv",
      ],
      ["a path with an encoded slash", "https://static.nhtsa.gov/odi%2Fffdd/sgo-2021-01/a.csv"],
    ])("is not pinned: %s", (_name, address) => {
      expect(isPinned(address, NHTSA)).toBe(false);
    });

    it.each([
      ["an empty text", ""],
      ["a word", "not an address"],
      ["a scheme alone", "https://"],
      ["a scheme and a colon", "https:"],
      ["a port without a host", "https://:443/"],
      ["a lone slash", "/"],
    ])("is not pinned, and does not throw, for %s", (_name, address) => {
      expect(isPinned(address, NHTSA)).toBe(false);
    });

    it("is not pinned for a value that is no text, and does not throw", () => {
      for (const value of [undefined, null, 5, {}, []]) {
        expect(isPinned(value as unknown as string, NHTSA)).toBe(false);
      }
    });

    it("pins nothing when no host is given, or no prefix", () => {
      expect(isPinned(FILE, { hosts: [] })).toBe(false);
      expect(isPinned(FILE, { hosts: ["static.nhtsa.gov"], pathPrefixes: [] })).toBe(false);
    });
  });

  it("keeps a path that stays inside its directory after dot segments are resolved", () => {
    expect(isPinned("https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/x/../a.csv", NHTSA)).toBe(true);
  });
});
