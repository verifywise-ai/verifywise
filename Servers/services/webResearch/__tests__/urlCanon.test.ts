import {
  acceptCanonical,
  crossSiteCanonical,
  resolveAddress,
  sameDocument,
  sourceKey,
} from "../urlCanon";

const href = (raw: string) => {
  const resolved = resolveAddress(raw);
  if (!resolved.ok) throw new Error(`expected ${raw} to resolve, got ${resolved.reason}`);
  return resolved.url.href;
};

describe("resolveAddress", () => {
  describe("the policy", () => {
    it("passes on the refusal of the URL policy as not_allowed", () => {
      for (const raw of [
        "ftp://acme.com/a",
        "https://127.0.0.1/a",
        "https://user:secret@acme.com/a",
        "https://acme.com:8443/a",
        "https://localhost/a",
        "not a url",
      ]) {
        expect(resolveAddress(raw)).toEqual({ ok: false, reason: "not_allowed" });
      }
    });

    it("drops the fragment and the default port, as the policy does", () => {
      expect(href("https://acme.com:443/trust#soc2")).toBe("https://acme.com/trust");
      expect(href("http://acme.com:80/trust")).toBe("http://acme.com/trust");
    });
  });

  describe("tracking parameters", () => {
    it("removes the campaign and click parameters of the common trackers", () => {
      expect(
        href(
          "https://news.example.com/story?utm_source=newsletter&utm_medium=email&utm_campaign=q3&fbclid=abc&gclid=def&msclkid=ghi",
        ),
      ).toBe("https://news.example.com/story");
    });

    it("keeps the parameters that name the page, in their order", () => {
      expect(href("https://news.example.com/read?id=42&utm_source=x&page=2&fbclid=y")).toBe(
        "https://news.example.com/read?id=42&page=2",
      );
    });

    it("reads the names without regard to case, and only whole prefixes", () => {
      expect(href("https://a.example.com/x?UTM_Source=a&Fbclid=b&utmost=1")).toBe(
        "https://a.example.com/x?utmost=1",
      );
    });

    it("leaves an address without tracking parameters as it is", () => {
      expect(href("https://a.example.com/x?q=soc+2&lang=en")).toBe(
        "https://a.example.com/x?q=soc+2&lang=en",
      );
    });

    it("drops the question mark when nothing else is left", () => {
      expect(href("https://a.example.com/x?utm_source=a")).toBe("https://a.example.com/x");
    });

    it("removes a parameter that has no value and keeps its neighbours' encoding", () => {
      expect(href("https://a.example.com/x?gclid&q=a%20b")).toBe("https://a.example.com/x?q=a%20b");
    });
  });

  describe("amp", () => {
    it("removes the markers of an amp page that sit in the query", () => {
      expect(href("https://a.example.com/story?amp=1")).toBe("https://a.example.com/story");
      expect(href("https://a.example.com/story?outputType=amp&id=7")).toBe(
        "https://a.example.com/story?id=7",
      );
      expect(href("https://a.example.com/story?output=amp")).toBe("https://a.example.com/story");
    });

    it("keeps a parameter that only looks like one", () => {
      expect(href("https://a.example.com/story?amp=false")).toBe(
        "https://a.example.com/story?amp=false",
      );
      expect(href("https://a.example.com/story?output=pdf")).toBe(
        "https://a.example.com/story?output=pdf",
      );
    });

    it("unwraps the address that the Google AMP viewer and cache give", () => {
      expect(href("https://www.google.com/amp/s/news.example.com/story?id=1")).toBe(
        "https://news.example.com/story?id=1",
      );
      expect(href("https://news-example-com.cdn.ampproject.org/c/s/news.example.com/story")).toBe(
        "https://news.example.com/story",
      );
    });

    it("leaves a path called amp and a host called m or amp alone: a guess can name another page or site", () => {
      expect(href("https://acme.com/products/amp")).toBe("https://acme.com/products/amp");
      expect(href("https://m.media-amazon.com/x")).toBe("https://m.media-amazon.com/x");
      expect(href("https://amp.example.com/story")).toBe("https://amp.example.com/story");
    });
  });

  describe("an address that cannot be opened", () => {
    it("refuses an address that ends in a quotation mark, in any of its encodings", () => {
      for (const raw of [
        "https://platform.opendeck.ai/%E2%80%9D",
        "https://platform.opendeck.ai/docs%E2%80%9C",
        "https://acme.com/trust%22",
        "https://acme.com/trust%27",
        "https://acme.com/trust%E2%80%99",
        "https://acme.com/trust%C2%BB",
        "https://acme.com/trust%3E",
        "https://acme.com/search?q=soc2%22",
        "https://acme.com/trust%e2%80%9d",
        "https://acme.com/trust%E2%80%9D/",
      ]) {
        expect(resolveAddress(raw)).toEqual({ ok: false, reason: "bad_address" });
      }
    });

    it("also refuses the quotation mark when it is written as the character", () => {
      expect(resolveAddress("https://acme.com/trust”")).toEqual({
        ok: false,
        reason: "bad_address",
      });
      expect(resolveAddress('https://acme.com/trust"')).toEqual({
        ok: false,
        reason: "bad_address",
      });
    });

    it("keeps an address with the character in the middle, and one that ends in a bracket", () => {
      expect(href("https://acme.com/a%E2%80%9Db")).toBe("https://acme.com/a%E2%80%9Db");
      expect(href("https://en.wikipedia.org/wiki/Okta_(company)")).toBe(
        "https://en.wikipedia.org/wiki/Okta_(company)",
      );
    });

    it("looks at the end of the address as it was written, so a tracking parameter cannot hide the mark", () => {
      expect(resolveAddress("https://acme.com/trust?utm_source=a%E2%80%9D")).toEqual({
        ok: false,
        reason: "bad_address",
      });
      expect(resolveAddress("https://acme.com/trust%E2%80%9D?utm_source=a")).toEqual({
        ok: false,
        reason: "bad_address",
      });
    });
  });

  it("is idempotent: the canonical form resolves to itself", () => {
    for (const raw of [
      "https://news.example.com/story?utm_source=a&id=1#top",
      "https://www.google.com/amp/s/news.example.com/story?amp=1",
      "http://acme.com:80/trust",
    ]) {
      const once = href(raw);
      expect(href(once)).toBe(once);
    }
  });

  it("re-checks the policy on an unwrapped address", () => {
    expect(resolveAddress("https://www.google.com/amp/s/127.0.0.1/story")).toEqual({
      ok: false,
      reason: "not_allowed",
    });
    expect(resolveAddress("https://www.google.com/amp/s/localhost/story")).toEqual({
      ok: false,
      reason: "not_allowed",
    });
  });
});

describe("sameDocument", () => {
  const same = (a: string, b: string) => sameDocument(new URL(a), new URL(b));

  it("sees a trailing slash, an index file and the amp form of a path as one document", () => {
    expect(same("https://a.example.com/story", "https://a.example.com/story/")).toBe(true);
    expect(same("https://a.example.com/news/", "https://a.example.com/news/index.html")).toBe(true);
    expect(same("https://a.example.com/story/amp", "https://a.example.com/story")).toBe(true);
    expect(same("https://a.example.com/story/amp/", "https://a.example.com/story")).toBe(true);
    expect(same("https://a.example.com/amp/story", "https://a.example.com/story")).toBe(true);
    expect(same("https://a.example.com/story.amp.html", "https://a.example.com/story.html")).toBe(
      true,
    );
  });

  it("sees the www, m, mobile and amp forms of a host as one site", () => {
    expect(same("https://m.example.com/story", "https://www.example.com/story")).toBe(true);
    expect(same("https://amp.example.com/story", "https://example.com/story")).toBe(true);
    expect(same("https://mobile.example.com/story", "https://www.example.com/story")).toBe(true);
    expect(same("http://example.com/story", "https://example.com/story")).toBe(true);
  });

  it("does not mistake two pages of one site, or two sites, for one document", () => {
    expect(same("https://example.com/pricing", "https://example.com/")).toBe(false);
    expect(same("https://example.com/a", "https://example.com/b")).toBe(false);
    expect(same("https://example.com/story", "https://evil.example.net/story")).toBe(false);
    expect(same("https://example.com/story", "https://sub.example.com/story")).toBe(false);
  });

  it("compares the query: a page of a list is not the list", () => {
    expect(same("https://example.com/news?page=2", "https://example.com/news")).toBe(false);
    expect(same("https://example.com/read?id=2", "https://example.com/read?id=2")).toBe(true);
    expect(same("https://example.com/read", "https://example.com/read?id=2")).toBe(false);
  });
});

describe("sourceKey", () => {
  /** Pairs that `sameDocument` sees as one document, and a few spellings it is never asked about. */
  const SAME: Array<[string, string]> = [
    ["https://a.example.com/story", "https://a.example.com/story/"],
    ["https://a.example.com/news/", "https://a.example.com/news/index.html"],
    ["https://a.example.com/story/amp", "https://a.example.com/story"],
    ["https://m.example.com/story", "https://www.example.com/story"],
    ["http://example.com/story", "https://example.com/story"],
    ["https://EXAMPLE.com/story", "https://example.com/story"],
    ["https://example.com/story#part", "https://example.com/story"],
    ["https://example.com:443/story", "https://example.com/story"],
    ["https://example.com/story?utm_source=news&id=2", "https://example.com/story?id=2"],
    ["https://www.google.com/amp/s/example.com/story", "https://example.com/story"],
  ];

  it("is one key for the spellings of a document", () => {
    for (const [a, b] of SAME) {
      expect([a, sourceKey(a)]).not.toEqual([a, null]);
      expect([a, b, sourceKey(a)]).toEqual([a, b, sourceKey(b)]);
    }
  });

  it("agrees with sameDocument on the pairs that it knows", () => {
    for (const [a, b] of SAME.slice(0, 5)) expect(sameDocument(new URL(a), new URL(b))).toBe(true);
  });

  it("is another key for another page, another site or another query", () => {
    const keys = [
      "https://example.com/",
      "https://example.com/pricing",
      "https://example.com/Pricing",
      "https://example.com/pricing/plans",
      "https://example.com/read",
      "https://example.com/read?id=2",
      "https://example.com/read?id=3",
      "https://sub.example.com/pricing",
      "https://example.net/pricing",
    ].map((raw) => sourceKey(raw));

    expect(keys.every((key) => key !== null)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // The key goes into a column and a set, and the address of the scheme and the fragment say nothing
  // about which document is meant, so the key shows the site, the path and the query, in that order.
  it("is the site, the path of the document and the query, without the scheme or the fragment", () => {
    expect(sourceKey("https://www.Example.com/Story/?a=1#x")).toBe("example.com/Story?a=1");
    expect(sourceKey("http://example.com")).toBe("example.com/");
    expect(sourceKey("https://example.com/news/index.html")).toBe("example.com/news");
  });

  it("is null for an address that the policy refuses or that cannot be opened", () => {
    for (const raw of [
      "ftp://acme.com/a",
      "https://127.0.0.1/a",
      "https://user:secret@acme.com/a",
      "https://localhost/a",
      "not a url",
      "",
      'https://acme.com/story"',
    ]) {
      expect([raw, sourceKey(raw)]).toEqual([raw, null]);
    }
  });
});

describe("acceptCanonical", () => {
  const asked = new URL("https://m.example.com/story/amp");
  const answered = "https://m.example.com/story/amp";

  it("takes the address a page claims for itself when it is the same document on the same site", () => {
    const accepted = acceptCanonical({
      asked,
      answered,
      claimed: "https://www.example.com/story",
    });
    expect(accepted?.href).toBe("https://www.example.com/story");
  });

  it("resolves the claim against the policy and the tracking list", () => {
    const accepted = acceptCanonical({
      asked,
      answered,
      claimed: "https://www.example.com/story?utm_source=feed",
    });
    expect(accepted?.href).toBe("https://www.example.com/story");
  });

  it("takes a claim that matches the address that answered after a redirect", () => {
    const accepted = acceptCanonical({
      asked: new URL("http://example.com/a"),
      answered: "https://www.example.com/a/",
      claimed: "https://www.example.com/a/",
    });
    expect(accepted?.href).toBe("https://www.example.com/a/");
  });

  it("refuses a claim on another site: a page cannot take the address of someone else's", () => {
    expect(
      acceptCanonical({ asked, answered, claimed: "https://www.bbc.co.uk/news/story" }),
    ).toBeNull();
    expect(
      acceptCanonical({ asked, answered, claimed: "https://example.com.evil.example/story" }),
    ).toBeNull();
  });

  it("refuses a claim on another page of the site, such as the home page that a broken template names", () => {
    expect(acceptCanonical({ asked, answered, claimed: "https://www.example.com/" })).toBeNull();
    expect(
      acceptCanonical({ asked, answered, claimed: "https://www.example.com/other" }),
    ).toBeNull();
  });

  it("refuses a claim that drops the parameters that name the page", () => {
    expect(
      acceptCanonical({
        asked: new URL("https://example.com/news?page=2"),
        answered: "https://example.com/news?page=2",
        claimed: "https://example.com/news",
      }),
    ).toBeNull();
  });

  it("refuses a claim that is no address, is not allowed, or ends in a quotation mark", () => {
    for (const claimed of [
      "",
      "javascript:alert(1)",
      "https://127.0.0.1/story",
      "https://www.example.com/story%22",
    ]) {
      expect(acceptCanonical({ asked, answered, claimed })).toBeNull();
    }
  });

  it("has nothing to take when there is no claim or it names the address already asked for", () => {
    expect(acceptCanonical({ asked, answered, claimed: null })).toBeNull();
    expect(acceptCanonical({ asked, answered, claimed: asked.href })).toBeNull();
  });
});

describe("crossSiteCanonical", () => {
  it("gives the address on another site that a page claims, cleaned as every address is", () => {
    expect(
      crossSiteCanonical({
        answered: "https://www.portal.example/en-us/news/x",
        claimed: "https://wire.example/article/x?utm_source=portal",
      }),
    ).toBe("https://wire.example/article/x");
  });

  it.each([
    ["https://www.portal.example/a", "https://portal.example/b"],
    ["https://m.portal.example/a", "https://www.portal.example/b"],
  ])("gives nothing for a claim on the same site: %s claims %s", (answered, claimed) => {
    expect(crossSiteCanonical({ answered, claimed })).toBeNull();
  });

  it("a copy that names another site's home page as its canonical address is not credited", () => {
    expect(
      crossSiteCanonical({
        answered: "https://www.msn.com/en-us/news/x",
        claimed: "https://www.reuters.com/",
      }),
    ).toBeNull();
    expect(
      crossSiteCanonical({
        answered: "https://www.msn.com/en-us/news/x",
        claimed: "https://www.reuters.com",
      }),
    ).toBeNull();
  });

  it.each([[null], ["  "], ["javascript:alert(1)"], ["not a url"]])(
    "gives nothing for no claim or one that is not an address it may read: %j",
    (claimed) => {
      expect(
        crossSiteCanonical({ answered: "https://www.portal.example/en-us/news/x", claimed }),
      ).toBeNull();
    },
  );
});
