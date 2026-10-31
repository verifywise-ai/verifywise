import {
  EXCERPT_GAP,
  MAX_EXCERPT_CHARS,
  MAX_EXTRA_PARTS,
  MAX_PAGE_CONTENT_CHARS,
  MAX_PAGE_PARTS,
  PageLink,
  decodeEntities,
  extractPageText,
  looksLikeJavaScriptShell,
  pageParts,
  relevantLinks,
  selectExcerpt,
} from "../pageText";
import { MAX_URL_CHARS } from "../publicUrl";

const BASE = "https://acme.com/trust/";

/** A page whose only job is to carry one date source; `head` goes into <head>. */
const pageWith = (head: string, body = "<p>Hello</p>") =>
  `<html><head><title>T</title>${head}</head><body>${body}</body></html>`;

describe("decodeEntities", () => {
  it.each([
    ["&amp;", "&"],
    ["&lt;", "<"],
    ["&gt;", ">"],
    ["&quot;", '"'],
    ["&#39;", "'"],
    ["&#x27;", "'"],
    ["&nbsp;", " "],
    ["&ndash;", "–"],
    ["&mdash;", "—"],
    ["&hellip;", "…"],
    ["&rsquo;", "’"],
    ["&copy;", "©"],
  ])("decodes %s", (entity, expected) => {
    expect(decodeEntities(entity)).toBe(expected);
  });

  it("decodes numeric references in decimal and hexadecimal, in either case of x", () => {
    expect(decodeEntities("&#65;&#x41;&#X41;&#x1F600;&#128512;")).toBe("AAA\u{1F600}\u{1F600}");
  });

  it("decodes in one pass, so an escaped reference is not decoded twice", () => {
    expect(decodeEntities("&amp;lt;")).toBe("&lt;");
    expect(decodeEntities("&amp;amp;")).toBe("&amp;");
    expect(decodeEntities("&amp;#65;")).toBe("&#65;");
  });

  it("leaves an unknown name, an invalid number and a reference without a semicolon as written", () => {
    expect(decodeEntities("&nope;")).toBe("&nope;");
    expect(decodeEntities("&#99999999;")).toBe("&#99999999;");
    expect(decodeEntities("&#9999999;")).toBe("&#9999999;");
    expect(decodeEntities("&#x110000;")).toBe("&#x110000;");
    expect(decodeEntities("&#xD800;")).toBe("&#xD800;");
    expect(decodeEntities("&#0;")).toBe("&#0;");
    expect(decodeEntities("&amp")).toBe("&amp");
    expect(decodeEntities("a &amp; b &nope; c")).toBe("a & b &nope; c");
  });

  it("does not take a name from Object.prototype for an entity", () => {
    expect(decodeEntities("&toString;")).toBe("&toString;");
    expect(decodeEntities("&valueOf;")).toBe("&valueOf;");
  });
});

describe("extractPageText", () => {
  const PAGE =
    "<head><title>Trust &amp; Security | Acme</title><style>body{color:red}</style>" +
    '<script>var x="</p>";</script></head>' +
    "<body><nav>Menu</nav><h1>Security</h1><p>We are SOC&nbsp;2 Type&nbsp;I certified.</p>" +
    "<p>Data &lt;may&gt; be used to <b>train</b> models.</p><ul><li>One</li><li>Two</li></ul>" +
    "<noscript>Enable JS</noscript><svg><text>ICON</text></svg><footer>(c) Acme</footer></body>";

  it("reads the title, drops the boilerplate and keeps the text of the page", () => {
    const page = extractPageText(PAGE, BASE);
    expect(page.title).toBe("Trust & Security | Acme");
    expect(page.text).toBe(
      [
        "Security",
        "We are SOC 2 Type I certified.",
        "Data <may> be used to train models.",
        "One",
        "Two",
      ].join("\n\n"),
    );
    for (const gone of ["Menu", "Enable JS", "ICON", "(c) Acme", "var x", "color"]) {
      expect(page.text).not.toContain(gone);
    }
  });

  it("leaves no run of three newlines, no double space and no space beside a newline in an indented page", () => {
    const html = `
      <html>
        <head>
          <title>
            Indented
            page
          </title>
        </head>
        <body>
          <div>
            <h1>   Heading   </h1>

            <p>
              First    paragraph,
              on two lines.
            </p>
            <p>\t<span> Second </span>\t</p>
          </div>
        </body>
      </html>`;
    const page = extractPageText(html, BASE);
    expect(page.title).toBe("Indented page");
    // A line break in the source is a space to a browser; here it stays a single line break.
    const paragraphs = page.text.split("\n\n").map((paragraph) => paragraph.replace(/\s+/g, " "));
    expect(paragraphs).toEqual(["Heading", "First paragraph, on two lines.", "Second"]);
    expect(page.text).not.toMatch(/\n{3}/);
    expect(page.text).not.toMatch(/ {2}/);
    expect(page.text).not.toMatch(/[ \t]\n|\n[ \t]/);
  });

  it("decodes an entity once, also after the HTML parser has decoded it", () => {
    const page = extractPageText("<p>&amp;lt;b&amp;gt; and &lt;i&gt;</p>", BASE);
    expect(page.text).toBe("&lt;b&gt; and <i>");
  });

  it("ends a tag at the first > outside its quotes, so an attribute can hold a >", () => {
    const html =
      '<div x-show="count > 0" title=\'a > b\'>Shown</div><p data-x="1">Para</p>' +
      '<a x-on:click="n > 1" href="/privacy" title="Go > on">Privacy</a>';
    const page = extractPageText(html, BASE);
    expect(page.text).toBe("Shown\n\nPara\nPrivacy");
    expect(page.links).toEqual([{ text: "Privacy", url: "https://acme.com/privacy" }]);
  });

  it("still reads a tag with an odd quote in an unquoted value", () => {
    const html = "<p title=Bob's>Odd</p><p>Next</p><a title=Bob's href=\"/x\">Link</a>";
    const page = extractPageText(html, BASE);
    expect(page.text).toBe("Odd\n\nNext\nLink");
    expect(page.links).toEqual([{ text: "Link", url: "https://acme.com/x" }]);
  });

  it("puts the terms and descriptions of a list, and the summary of a details element, on lines of their own", () => {
    const list = extractPageText(
      "<dl><dt>Encryption at rest</dt><dd>AES-256</dd><dt>Last audit</dt><dd>2026-01-01</dd></dl>",
      BASE,
    );
    expect(list.text.split(/\n+/)).toEqual([
      "Encryption at rest",
      "AES-256",
      "Last audit",
      "2026-01-01",
    ]);
    const details = extractPageText(
      "<details><summary>Subprocessors</summary>Amazon Web Services</details>",
      BASE,
    );
    expect(details.text.split(/\n+/)).toEqual(["Subprocessors", "Amazon Web Services"]);
  });

  it.each([
    "figure",
    "figcaption",
    "address",
    "fieldset",
    "legend",
    "caption",
    "dialog",
    "hgroup",
    "menu",
  ])("makes a line break at <%s>", (tag) => {
    expect(extractPageText(`a<${tag}>b</${tag}>c`, BASE).text.split(/\n+/)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("makes a line break at <hr>", () => {
    expect(extractPageText("a<hr>b<hr/>c", BASE).text.split(/\n+/)).toEqual(["a", "b", "c"]);
  });

  it("does not take a tag whose name only starts like a block tag for one", () => {
    expect(extractPageText("<p>a<dlg>x</dlg>b</p>", BASE).text).toBe("axb");
  });

  it("takes the first h1 as the title when there is no title, else an empty title", () => {
    expect(extractPageText("<h1>Hello <i>and</i> &amp; welcome</h1><p>x</p>", BASE).title).toBe(
      "Hello and & welcome",
    );
    expect(extractPageText("<h1>First</h1><h1>Second</h1>", BASE).title).toBe("First");
    expect(extractPageText("<p>No heading</p>", BASE).title).toBe("");
    expect(extractPageText("<title> </title><h1>From h1</h1>", BASE).title).toBe("From h1");
  });

  it("returns an empty page for empty input", () => {
    expect(extractPageText("", BASE)).toEqual({
      title: "",
      text: "",
      publishedAt: null,
      links: [],
      canonicalUrl: null,
    });
  });

  it("does not let a character reference put a control character into the text", () => {
    const page = extractPageText("<p>a&#0;b&#1;c&#8;d</p>", BASE);
    expect(page.text).not.toMatch(/[\u0000-\u0008]/);
    expect(page.text).toMatch(/^a.?b.?c.?d$/);
  });

  describe("publication date", () => {
    it("reads a meta tag, with the attributes in either order and under name, property or itemprop", () => {
      const date = "2026-03-04T10:00:00.000Z";
      for (const tag of [
        '<meta property="article:published_time" content="2026-03-04T10:00:00Z">',
        '<meta content="2026-03-04T10:00:00Z" property="article:published_time">',
        "<meta name='article:published_time' content='2026-03-04T10:00:00Z'/>",
        '<meta itemprop="datePublished" content="2026-03-04T10:00:00Z">',
        '<meta name="DC.date.issued" content="2026-03-04T10:00:00Z">',
      ]) {
        expect(extractPageText(pageWith(tag), BASE).publishedAt).toBe(date);
      }
    });

    it("reads the datePublished of JSON-LD", () => {
      const ld =
        '<script type="application/ld+json">{"@type":"Article","datePublished":"2026-03-05"}</script>';
      expect(extractPageText(pageWith(ld), BASE).publishedAt).toBe("2026-03-05T00:00:00.000Z");
      const spaced =
        '<script type="application/ld+json">{ "datePublished" : "2026-03-05" }</script>';
      expect(extractPageText(pageWith(spaced), BASE).publishedAt).toBe("2026-03-05T00:00:00.000Z");
    });

    it("reads a time element", () => {
      const page = extractPageText(
        pageWith("", '<p>Posted <time datetime="2026-03-06">March 6</time></p>'),
        BASE,
      );
      expect(page.publishedAt).toBe("2026-03-06T00:00:00.000Z");
    });

    it("prefers the meta tag, then JSON-LD, then the time element", () => {
      const meta = '<meta property="article:published_time" content="2026-03-04T10:00:00Z">';
      const ld = '<script type="application/ld+json">{"datePublished":"2026-03-05"}</script>';
      const time = '<time datetime="2026-03-06">March 6</time>';
      expect(extractPageText(pageWith(ld + meta, time), BASE).publishedAt).toBe(
        "2026-03-04T10:00:00.000Z",
      );
      expect(extractPageText(pageWith(ld, time), BASE).publishedAt).toBe(
        "2026-03-05T00:00:00.000Z",
      );
      expect(extractPageText(pageWith("", time), BASE).publishedAt).toBe(
        "2026-03-06T00:00:00.000Z",
      );
    });

    it("gives null for a value that cannot be parsed, and for no date", () => {
      expect(
        extractPageText(pageWith('<meta property="article:published_time" content="soon">'), BASE)
          .publishedAt,
      ).toBeNull();
      expect(
        extractPageText(pageWith('<time datetime="yesterday">x</time>'), BASE).publishedAt,
      ).toBeNull();
      expect(extractPageText(pageWith(""), BASE).publishedAt).toBeNull();
    });

    it("goes on to the next source when one source holds a value that cannot be parsed", () => {
      const bad = '<meta property="article:published_time" content="soon">';
      const time = '<time datetime="2026-03-06">March 6</time>';
      expect(extractPageText(pageWith(bad, time), BASE).publishedAt).toBe(
        "2026-03-06T00:00:00.000Z",
      );
    });

    it("accepts an offset, treats a time without one as UTC and refuses a date that does not exist", () => {
      const at = (value: string) =>
        extractPageText(pageWith(`<time datetime="${value}">x</time>`), BASE).publishedAt;
      expect(at("2026-03-04T10:00:00+02:00")).toBe("2026-03-04T08:00:00.000Z");
      expect(at("2026-03-04T10:00:00")).toBe("2026-03-04T10:00:00.000Z");
      expect(at("2026-03-04 10:00")).toBe("2026-03-04T10:00:00.000Z");
      expect(at("2026-02-30")).toBeNull();
      expect(at("2026-13-01")).toBeNull();
      expect(at("12")).toBeNull();
    });
  });

  describe("links", () => {
    const links = (html: string, base = BASE) => extractPageText(html, base).links;

    it("resolves relative and absolute links against the base URL and drops fragments and duplicates", () => {
      const html =
        '<a href="/privacy">Privacy</a><a href="terms#cookies">Terms</a>' +
        '<a href="https://other.example/x?a=1&amp;b=2#top">Other</a><a href="/privacy#again">Again</a>' +
        '<a href="../up">Up</a><a href="#top">Top</a>';
      expect(links(html)).toEqual([
        { text: "Privacy", url: "https://acme.com/privacy" },
        { text: "Terms", url: "https://acme.com/trust/terms" },
        { text: "Other", url: "https://other.example/x?a=1&b=2" },
        { text: "Up", url: "https://acme.com/up" },
        { text: "Top", url: "https://acme.com/trust/" },
      ]);
    });

    it("drops mailto, javascript, tel and other links that are not http or https, and anchors without a href", () => {
      const html =
        '<a href="mailto:a@acme.com">Mail</a><a href="javascript:void(0)">JS</a>' +
        '<a href="tel:+123">Call</a><a href="data:text/html,x">Data</a><a href="ftp://acme.com/x">Ftp</a>' +
        '<a name="anchor">None</a><a href="/ok">Ok</a>';
      expect(links(html)).toEqual([{ text: "Ok", url: "https://acme.com/ok" }]);
    });

    it("strips tags from the link text, collapses whitespace, decodes entities and cuts at 80 characters", () => {
      const html =
        '<a href="/a"><span>Trust</span>\n  <b>center</b> &amp; more</a>' +
        `<a href="/b">${"x".repeat(120)}</a><a href="/c"><img src="i.png" alt="Logo"></a>` +
        `<a href="/d">${"\u{1F600}".repeat(60)}</a>`;
      const result = links(html);
      expect(result[0]).toEqual({ text: "Trust center & more", url: "https://acme.com/a" });
      expect(result[1].text).toBe("x".repeat(80));
      expect(result[2].text).toBe("");
      expect(result[3].text.length).toBe(80);
      expect(result[3].text).toBe("\u{1F600}".repeat(40));
    });

    it("finds links in the navigation and the footer, which the text leaves out", () => {
      const html =
        '<nav><a href="/pricing">Pricing</a></nav><p>Body</p><footer><a href="/privacy">Privacy</a></footer>';
      const page = extractPageText(html, BASE);
      expect(page.text).toBe("Body");
      expect(page.links.map((link) => link.url)).toEqual([
        "https://acme.com/pricing",
        "https://acme.com/privacy",
      ]);
    });

    it("reads the attributes of an anchor whatever their order and quoting", () => {
      const html =
        "<a class=btn href=/one>One</a><a data-x='1' href='/two' rel=\"nofollow\">Two</a>" +
        '<A HREF="/three">Three</A>';
      expect(links(html).map((link) => link.url)).toEqual([
        "https://acme.com/one",
        "https://acme.com/two",
        "https://acme.com/three",
      ]);
    });

    it("scans at most 500 anchors", () => {
      const html = Array.from({ length: 600 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join("");
      const result = links(html);
      expect(result).toHaveLength(500);
      expect(result[499].url).toBe("https://acme.com/p499");
    });

    it("counts an anchor without a usable href among the 500 it scans", () => {
      const html = '<a name="x">n</a>'.repeat(500) + '<a href="/late">Late</a>';
      expect(links(html)).toEqual([]);
    });
  });

  describe("the address the page claims for itself", () => {
    const claimed = (head: string) => extractPageText(pageWith(head), BASE).canonicalUrl;

    it("reads <link rel=canonical>, resolved against the base URL and without a fragment", () => {
      expect(claimed('<link rel="canonical" href="https://www.acme.com/trust">')).toBe(
        "https://www.acme.com/trust",
      );
      expect(claimed('<link rel="canonical" href="/trust/soc2#top">')).toBe(
        "https://acme.com/trust/soc2",
      );
      expect(claimed('<link rel="canonical" href="../security">')).toBe(
        "https://acme.com/security",
      );
    });

    it("finds the link whatever the order and the quoting of its attributes and the case of its rel", () => {
      expect(claimed("<link href=/a rel=canonical>")).toBe("https://acme.com/a");
      expect(claimed('<LINK REL="Canonical" HREF="/b">')).toBe("https://acme.com/b");
      expect(claimed("<link href='/c' rel='alternate canonical'>")).toBe("https://acme.com/c");
      expect(claimed('<link rel="canonical" href="/d&amp;e=1">')).toBe("https://acme.com/d&e=1");
    });

    it("ignores the other links of the head", () => {
      expect(
        claimed(
          '<link rel="stylesheet" href="/s.css"><link rel="alternate" href="/amp"><link rel="amphtml" href="/story/amp">',
        ),
      ).toBeNull();
    });

    it("falls back to og:url, and prefers the link when both are there", () => {
      expect(claimed('<meta property="og:url" content="https://acme.com/og">')).toBe(
        "https://acme.com/og",
      );
      expect(
        claimed(
          '<meta property="og:url" content="https://acme.com/og"><link rel="canonical" href="https://acme.com/link">',
        ),
      ).toBe("https://acme.com/link");
      expect(claimed('<meta content="/relative" property="og:url">')).toBe(
        "https://acme.com/relative",
      );
    });

    it("takes the first claim of each kind", () => {
      expect(
        claimed('<link rel="canonical" href="/first"><link rel="canonical" href="/second">'),
      ).toBe("https://acme.com/first");
    });

    it("does not take a claim that is not an http or https address, or is empty", () => {
      expect(claimed('<link rel="canonical" href="javascript:alert(1)">')).toBeNull();
      expect(claimed('<link rel="canonical" href="">')).toBeNull();
      expect(claimed('<link rel="canonical">')).toBeNull();
      expect(claimed('<meta property="og:url" content="mailto:a@acme.com">')).toBeNull();
    });

    it("is null for a page that claims nothing", () => {
      expect(claimed("")).toBeNull();
    });

    it("looks at no more than 50 link tags", () => {
      const filler = '<link rel="stylesheet" href="/s.css">'.repeat(50);
      expect(claimed(`${filler}<link rel="canonical" href="/late">`)).toBeNull();
    });
  });
});

describe("relevantLinks", () => {
  const link = (text: string, url: string): PageLink => ({ text, url });
  const SELF = "https://acme.com/";

  it("keeps the links on the domain whose text or path is about security, trust, privacy or the like", () => {
    const links = [
      link("Security", "https://acme.com/a"),
      link("Go", "https://acme.com/trust-center"),
      link("Privacy policy", "https://acme.com/b"),
      link("Read", "https://acme.com/legal/dpa"),
      link("Terms of service", "https://acme.com/c"),
      link("Sub-processors", "https://acme.com/subprocessors"),
      link("Our SOC 2 report", "https://acme.com/d"),
      link("Report", "https://acme.com/soc2"),
      link("Report", "https://acme.com/ISO-27001"),
      link("AI policy", "https://acme.com/e"),
      link("More", "https://acme.com/ai/safety"),
      link("System status", "https://acme.com/f"),
      link("Incident history", "https://acme.com/g"),
      link("Vulnerability disclosure", "https://acme.com/h"),
      link("Certifications", "https://acme.com/i"),
      link("GDPR", "https://acme.com/j"),
      link("Cookie settings", "https://acme.com/k"),
      link("Compliance", "https://acme.com/l"),
    ];
    expect(relevantLinks(links, "acme.com", SELF, 25)).toEqual(links);
  });

  it("matches case-insensitively", () => {
    const links = [link("SECURITY", "https://acme.com/a"), link("x", "https://acme.com/TRUST")];
    expect(relevantLinks(links, "acme.com", SELF)).toEqual(links);
  });

  it("drops links whose text and path say nothing about these topics", () => {
    const links = [
      link("Pricing", "https://acme.com/pricing"),
      link("Careers", "https://acme.com/careers"),
      link("Blog", "https://acme.com/blog/launch"),
      link("Contact us", "https://acme.com/contact"),
      link("Products", "https://acme.com/products"),
    ];
    expect(relevantLinks(links, "acme.com", SELF)).toEqual([]);
  });

  it("takes the short words ai, soc, iso and dpa as words, not as parts of other words", () => {
    const links = [
      link("Email preferences", "https://acme.com/email-preferences"),
      link("Available plans", "https://acme.com/available"),
      link("Product details", "https://acme.com/detail"),
      link("Social media", "https://acme.com/social"),
      link("Advisory board", "https://acme.com/advisory"),
      link("Isolation", "https://acme.com/isolation"),
      link("Maintenance", "https://acme.com/maintenance"),
    ];
    expect(relevantLinks(links, "acme.com", SELF)).toEqual([]);
  });

  it("keeps the links on the domain and its subdomains only", () => {
    const links = [
      link("Trust", "https://acme.com/trust"),
      link("Trust", "https://trust.acme.com/"),
      link("Trust", "https://www.acme.com/trust"),
      link("Trust", "https://acme.com.evil.example/trust"),
      link("Trust", "https://notacme.com/trust"),
      link("Trust", "https://other.example/trust"),
    ];
    expect(relevantLinks(links, "acme.com", SELF).map((l) => l.url)).toEqual([
      "https://acme.com/trust",
      "https://trust.acme.com/",
      "https://www.acme.com/trust",
    ]);
  });

  it("leaves out the page itself, whatever fragment the URL of the page has", () => {
    const links = [
      link("Security", "https://acme.com/security"),
      link("Privacy", "https://acme.com/privacy"),
    ];
    expect(relevantLinks(links, "acme.com", "https://acme.com/security").map((l) => l.url)).toEqual(
      ["https://acme.com/privacy"],
    );
    expect(
      relevantLinks(links, "acme.com", "https://acme.com/security#top").map((l) => l.url),
    ).toEqual(["https://acme.com/privacy"]);
  });

  it("keeps the order of the page and returns at most max links, 25 by default", () => {
    const links = Array.from({ length: 40 }, (_, i) => link("Privacy", `https://acme.com/p${i}`));
    expect(relevantLinks(links, "acme.com", SELF)).toEqual(links.slice(0, 25));
    expect(relevantLinks(links, "acme.com", SELF, 3)).toEqual(links.slice(0, 3));
    expect(relevantLinks(links, "acme.com", SELF, 0)).toEqual([]);
  });

  it("copes with a link whose URL cannot be parsed and with a self URL that is not a URL", () => {
    const links = [link("Privacy", "not a url"), link("Privacy", "https://acme.com/privacy")];
    expect(relevantLinks(links, "acme.com", "nope")).toEqual([links[1]]);
  });

  it("drops a link whose URL is longer than 2,048 characters, and does not count it", () => {
    // 4,000 characters that a URL cannot carry become 36,000 once they are percent-encoded.
    const long = Array.from({ length: 25 }, (_, i) =>
      link(`Security ${i}`, new URL(`https://acme.com/security/${i}/${"中".repeat(4000)}`).href),
    );
    expect(long[0].url.length).toBeGreaterThan(36_000);
    const normal = [
      link("Security", "https://acme.com/security"),
      link("Privacy", "https://acme.com/privacy"),
      link("Trust", "https://acme.com/trust"),
    ];
    expect(relevantLinks(long, "acme.com", SELF)).toEqual([]);
    expect(relevantLinks([...long, ...normal], "acme.com", SELF)).toEqual(normal);
  });

  it("keeps a link whose URL is exactly 2,048 characters", () => {
    const prefix = "https://acme.com/security/";
    const atTheLimit = link("Security", prefix + "a".repeat(MAX_URL_CHARS - prefix.length));
    expect(relevantLinks([atTheLimit], "acme.com", SELF)).toEqual([atTheLimit]);
  });
});

describe("selectExcerpt", () => {
  const FILLER = "Filler sentence about nothing in particular that pads the page out.";
  const WEAK = "Staff training takes place every year, in January.";
  const MEDIUM = "Customer data stays in the region where the customer chose to keep it.";
  const STRONG = "Training on customer data is not done, and the data is never used for training.";
  const INSIDE_HEAD = "Customer data is encrypted at rest.";

  function pageOf(special: Record<number, string>, count = 430): string {
    return Array.from({ length: count }, (_, i) => special[i] ?? `${FILLER} ${i}`).join("\n\n");
  }

  const TEXT = pageOf({ 5: INSIDE_HEAD, 40: WEAK, 200: MEDIUM, 380: STRONG });

  it("fixture is long enough and keeps the keywords out of the filler", () => {
    expect(TEXT.length).toBeGreaterThan(30_000);
    expect(TEXT.indexOf(INSIDE_HEAD) + INSIDE_HEAD.length).toBeLessThan(1000);
    expect(FILLER.toLowerCase()).not.toMatch(/training|customer|data/);
  });

  it("returns a text within the limit whole, with or without a focus", () => {
    expect(selectExcerpt("short text")).toEqual({ excerpt: "short text", truncated: false });
    expect(selectExcerpt("short text", { focus: "text" })).toEqual({
      excerpt: "short text",
      truncated: false,
    });
    const exact = "x".repeat(MAX_EXCERPT_CHARS);
    expect(selectExcerpt(exact)).toEqual({ excerpt: exact, truncated: false });
  });

  it("cuts a long text at the limit without a focus, and does not split a surrogate pair", () => {
    const long = "a".repeat(MAX_EXCERPT_CHARS + 500);
    expect(selectExcerpt(long)).toEqual({
      excerpt: "a".repeat(MAX_EXCERPT_CHARS),
      truncated: true,
    });
    const emoji = "a".repeat(99) + "\u{1F600}" + "b".repeat(100);
    const { excerpt, truncated } = selectExcerpt(emoji, { maxChars: 100 });
    expect(truncated).toBe(true);
    expect(excerpt).toBe("a".repeat(99));
  });

  it("starts with the first 1,000 characters and adds the paragraphs that mention the focus, in page order", () => {
    const { excerpt, truncated } = selectExcerpt(TEXT, { focus: "training customer data" });
    expect(truncated).toBe(true);
    expect(excerpt.startsWith(TEXT.slice(0, 1000))).toBe(true);
    expect(excerpt.slice(1000)).toBe(
      [WEAK, MEDIUM, STRONG].map((paragraph) => EXCERPT_GAP + paragraph).join(""),
    );
    expect(excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS);
  });

  it("does not repeat a paragraph that the first 1,000 characters already hold", () => {
    const { excerpt } = selectExcerpt(TEXT, { focus: "customer data" });
    expect(excerpt.split(INSIDE_HEAD)).toHaveLength(2);
  });

  it("keeps the paragraphs with the most hits when they do not all fit, then restores page order", () => {
    const one = selectExcerpt(TEXT, {
      focus: "training customer data",
      maxChars: 1000 + EXCERPT_GAP.length + STRONG.length,
    });
    expect(one.excerpt).toBe(TEXT.slice(0, 1000) + EXCERPT_GAP + STRONG);
    expect(one.truncated).toBe(true);

    const two = selectExcerpt(TEXT, {
      focus: "training customer data",
      maxChars: 1000 + 2 * EXCERPT_GAP.length + MEDIUM.length + STRONG.length,
    });
    expect(two.excerpt).toBe(TEXT.slice(0, 1000) + EXCERPT_GAP + MEDIUM + EXCERPT_GAP + STRONG);
  });

  it("cuts the last paragraph to the room that is left rather than going over", () => {
    const maxChars = 1000 + EXCERPT_GAP.length + 20;
    const { excerpt } = selectExcerpt(TEXT, { focus: "training customer data", maxChars });
    expect(excerpt.length).toBe(maxChars);
    expect(excerpt.endsWith(STRONG.slice(0, 20))).toBe(true);
  });

  it("puts no gap marker between two paragraphs that are next to each other on the page", () => {
    const text = pageOf({ 100: MEDIUM, 101: STRONG });
    const { excerpt } = selectExcerpt(text, { focus: "customer data" });
    expect(excerpt.slice(1000)).toBe(`${EXCERPT_GAP}${MEDIUM}\n\n${STRONG}`);
  });

  it("matches the focus case-insensitively and ignores words of fewer than three letters", () => {
    const { excerpt } = selectExcerpt(TEXT, { focus: "TRAINING, of it!" });
    expect(excerpt.slice(1000)).toBe(
      [WEAK, STRONG].map((paragraph) => EXCERPT_GAP + paragraph).join(""),
    );
  });

  it("behaves as without a focus when no paragraph matches it, or when the focus has no usable word", () => {
    const plain = selectExcerpt(TEXT);
    expect(plain.excerpt).toBe(TEXT.slice(0, MAX_EXCERPT_CHARS));
    expect(selectExcerpt(TEXT, { focus: "blockchain quantum" })).toEqual(plain);
    expect(selectExcerpt(TEXT, { focus: "" })).toEqual(plain);
    expect(selectExcerpt(TEXT, { focus: "a! ?? 1" })).toEqual(plain);
  });

  it("does not take the focus for a pattern", () => {
    expect(() => selectExcerpt(TEXT, { focus: "(((.*[ ^$|" })).not.toThrow();
    expect(selectExcerpt(TEXT, { focus: "train.*" })).toEqual(
      selectExcerpt(TEXT, { focus: "train" }),
    );
  });

  it("looks at only a few words of the focus", () => {
    const focus = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ") + " training";
    expect(selectExcerpt(TEXT, { focus })).toEqual(selectExcerpt(TEXT));
  });

  it("selects within a long text quickly", () => {
    const huge = pageOf({ 90_000: STRONG }, 100_000);
    const start = performance.now();
    const { excerpt } = selectExcerpt(huge, { focus: "training customer data" });
    expect(performance.now() - start).toBeLessThan(1000);
    expect(excerpt.endsWith(STRONG)).toBe(true);
  });

  it("honours a maxChars smaller than the first 1,000 characters", () => {
    const { excerpt, truncated } = selectExcerpt(TEXT, { maxChars: 200, focus: "training" });
    expect(truncated).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(200);
    expect(excerpt).toBe(TEXT.slice(0, 200));
  });
});

describe("the parts of a long page", () => {
  it("has the limits the loop is told about", () => {
    expect(MAX_PAGE_PARTS).toBe(40);
    expect(MAX_EXTRA_PARTS).toBe(2);
    // The first excerpt and the extra parts, each with the gap marker that joins it to the rest.
    expect(MAX_PAGE_CONTENT_CHARS).toBe(
      MAX_EXCERPT_CHARS * (1 + MAX_EXTRA_PARTS) + EXCERPT_GAP.length * MAX_EXTRA_PARTS,
    );
  });

  describe("pageParts", () => {
    const paragraph = (n: number, chars: number) => `P${n} `.padEnd(chars, "x");

    it("is one part, as it is, for a text that fits a part", () => {
      expect(pageParts("short text")).toEqual(["short text"]);
      const exact = "a".repeat(MAX_EXCERPT_CHARS);
      expect(pageParts(exact)).toEqual([exact]);
      expect(pageParts("")).toEqual([""]);
    });

    it("cuts a longer text at the last blank line of the window, when that is past the middle", () => {
      const text = [paragraph(1, 3000), paragraph(2, 3000), paragraph(3, 3000), paragraph(4, 500)];

      const parts = pageParts(text.join("\n\n"));

      // The window holds the first two paragraphs and the start of the third; it is cut after the second.
      expect(parts).toEqual([`${text[0]}\n\n${text[1]}`, `${text[2]}\n\n${text[3]}`]);
    });

    it("cuts at a line break when there is no blank line past the middle, and then at a space", () => {
      const lines = pageParts(`${"a".repeat(5000)}\n${"b".repeat(5000)}`);
      expect(lines).toEqual(["a".repeat(5000), "b".repeat(5000)]);

      const words = pageParts(`${"a".repeat(5000)} ${"b".repeat(5000)}`);
      expect(words).toEqual(["a".repeat(5000), "b".repeat(5000)]);
    });

    it("cuts a text with no break past the middle at the end of the window, never inside a surrogate pair", () => {
      // The first letter moves the pairs by one unit, so the window of 8,000 units ends between the
      // halves of an emoji.
      const text = `a${"😀".repeat(MAX_EXCERPT_CHARS)}`;

      const parts = pageParts(text);

      expect(parts.length).toBeGreaterThan(1);
      for (const part of parts) {
        expect(part.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS);
        expect(part).toMatch(/^a?(?:😀)+$/u);
      }
      expect(parts.join("")).toBe(text);
    });

    it("drops whitespace of any kind at a cut, not only the space or the line break it cut at", () => {
      // The window ends in a tab: no space or line break is past the middle, so the cut is at the end.
      const parts = pageParts(`${"a".repeat(MAX_EXCERPT_CHARS - 1)}\t${"b".repeat(100)}`);

      expect(parts).toEqual(["a".repeat(MAX_EXCERPT_CHARS - 1), "b".repeat(100)]);
    });

    it("gives parts that neither start nor end with whitespace, hold all the text but the cuts, and are never longer than a window", () => {
      const text = Array.from({ length: 30 }, (_, n) => paragraph(n, 1400)).join("\n\n");

      const parts = pageParts(text);

      expect(parts.length).toBeGreaterThan(3);
      for (const part of parts) {
        expect(part.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS);
        expect(part).toBe(part.trim());
      }
      expect(parts.join("\n\n").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
    });

    it("keeps the first MAX_PAGE_PARTS parts of a very long page and drops the rest", () => {
      const parts = pageParts("a".repeat(MAX_EXCERPT_CHARS * (MAX_PAGE_PARTS + 3)));

      expect(parts).toHaveLength(MAX_PAGE_PARTS);
      expect(parts.every((part) => part.length === MAX_EXCERPT_CHARS)).toBe(true);
    });

    it("takes the size of a window from its argument", () => {
      expect(pageParts("aaaa bbbb cccc", 9)).toEqual(["aaaa bbbb", "cccc"]);
    });
  });
});

describe("looksLikeJavaScriptShell", () => {
  it("is true for a large page with almost no text", () => {
    expect(looksLikeJavaScriptShell("x".repeat(50_000), "y".repeat(100))).toBe(true);
    expect(looksLikeJavaScriptShell("x".repeat(50_000), "")).toBe(true);
  });

  it("is false for a small page, however little text it has", () => {
    expect(looksLikeJavaScriptShell("x".repeat(5_000), "y".repeat(100))).toBe(false);
    expect(looksLikeJavaScriptShell("<html></html>", "")).toBe(false);
  });

  it("is false for a large page with a fair amount of text", () => {
    expect(looksLikeJavaScriptShell("x".repeat(50_000), "y".repeat(5_000))).toBe(false);
    expect(looksLikeJavaScriptShell("x".repeat(50_000), "y".repeat(1_000))).toBe(false);
  });
});

describe("extractPageText on hostile input", () => {
  const MEGABYTE_2 = 2 * 1024 * 1024;
  const repeated = (unit: string) => unit.repeat(Math.ceil(MEGABYTE_2 / unit.length));
  const spans = (count: number) => "<span>".repeat(count);
  // `start`, then `unit` as often as fits in 2 MB, so that the page is not cut in the middle of one.
  const filled = (start: string, unit: string) =>
    start + unit.repeat(Math.floor((MEGABYTE_2 - start.length) / unit.length));

  // The HTML parser underneath is quadratic in how deeply tags stay open, and a regular expression
  // that scans on from every unclosed start is quadratic in the input. Each of these would take
  // seconds to minutes without the guards.
  //
  // The parser also searches its whole stack of open tags for every end tag and every `<form`, and
  // fires no event when it finds nothing. The four cases with a deep stack below are about that:
  // each took seconds before the depth a page may have was tied to its number of `<`.
  const CASES: Array<[string, string]> = [
    ["unclosed anchors", repeated('<a href="')],
    ["divs", repeated("<div>")],
    ["spans left open", repeated("<span>")],
    ["spans with text left open", repeated("<span>x")],
    ["navs left open", repeated("<nav>")],
    ["options left open", repeated("<option>x")],
    ["stray closing tags", repeated("</b>")],
    ["tags that name another tag in an attribute", repeated('<span a="<">')],
    ["tags with an odd name", repeated('<a"x">')],
    ["end tags inside a quoted attribute", repeated('<b title="</b>">')],
    ["end tags inside comments", repeated("<b><!--</b>-->")],
    ["end tags inside a script", repeated("<b><script></b></script>")],
    ["end tags inside a declaration", repeated("<b><!x</b>")],
    ["end tags that close nothing, on a stack 9,990 deep", spans(9_990) + repeated("</b>")],
    [
      "end tags and text that close nothing, on a stack 9,990 deep",
      spans(9_990) + repeated("</i>x"),
    ],
    [
      "forms that are ignored, on a stack 9,990 deep",
      '<form a="<">' + spans(9_990) + repeated('<form a="<">'),
    ],
    [
      "end tags of svg names in a foreignObject, on a stack 9,900 deep",
      "<svg><foreignObject>" + spans(9_900) + repeated("</clippath>"),
    ],
    ["unclosed block tags with a quote", repeated('<div title="')],
    ["unclosed block tags with a single quote", repeated("<p x='")],
    ["quoted values with a >", repeated('<a title="x>')],
    ["unclosed meta tags", repeated("<meta ")],
    ["unclosed titles", repeated("<title ")],
    ["anchors with no end", repeated("<a href=x>y")],
    ["a single tag name", "<" + "a".repeat(MEGABYTE_2)],
    ["a single tag with a long attribute", '<meta content="' + "a".repeat(MEGABYTE_2)],
    ["unclosed comments", repeated("<!--")],
    ["entities", repeated("&amp;")],
    ["unclosed scripts", repeated("<script>")],
    ["textareas", repeated("<textarea>")],
    ["iframes", repeated("<iframe>")],
    ["dates", repeated('"datePublished" :')],
  ];

  beforeAll(() => {
    extractPageText("<p>warm up</p><a href='/x'>x</a>", BASE);
  });

  it.each(CASES)("reads 2 MB of %s in under a second", (_name, html) => {
    const start = performance.now();
    extractPageText(html, BASE);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  // Pages with a stack nearly as deep as the limit allows for their number of `<`. A page that
  // nests deeper gives no text (see below), so these are about the most work that a page can cause.
  const NEAR_THE_LIMIT: Array<[string, string]> = [
    ["end tags that close nothing, 80 deep", filled("head text " + spans(80), "</b>")],
    [
      "forms that are ignored, 120 deep",
      filled('head text <form a="<">' + spans(120), '<form a="<">'),
    ],
    [
      "end tags of svg names in a foreignObject, 180 deep",
      filled("head text <svg><foreignObject>" + spans(180), "</fetile>"),
    ],
  ];

  it.each(NEAR_THE_LIMIT)("reads 2 MB of %s, in under a second", (_name, html) => {
    const start = performance.now();
    const { text } = extractPageText(html, BASE);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(text).toBe("head text");
  });

  it("lets a page nest less deep the more `<` it holds", () => {
    const deep = (ending: string) => spans(150) + "deep text" + ending;
    expect(extractPageText(deep("</span>".repeat(150)), BASE).text).toBe("deep text");
    expect(extractPageText(filled(deep(""), "</b>"), BASE).text).toBe("");
  });

  it("still reads a large ordinary page", () => {
    const paragraph = "<p>Some <b>bold</b> and <i>italic</i> text, <a href='/x'>a link</a>.</p>";
    const { text } = extractPageText(filled("", paragraph), BASE);
    expect(text.startsWith("Some bold and italic text, a link.\n\nSome bold")).toBe(true);
    expect(text.length).toBeGreaterThan(1_000_000);
  });

  it("still reads a deeply nested page that is not hostile", () => {
    const html = "<span>".repeat(2000) + "deep text" + "</span>".repeat(2000);
    expect(extractPageText(html, BASE).text).toBe("deep text");
  });

  it("gives no text for a page that nests too deep, but still its title and links", () => {
    const head = '<head><title>Deep</title></head><nav><a href="/x">x</a></nav>';
    const reads = extractPageText(head + spans(5_000) + "deep text", BASE);
    expect(reads.text).toBe("deep text");
    const gives = extractPageText(head + spans(8_000) + "deep text", BASE);
    expect(gives).toEqual({
      title: "Deep",
      text: "",
      publishedAt: null,
      links: [{ text: "x", url: "https://acme.com/x" }],
      canonicalUrl: null,
    });
  });

  it("reads only the first 2 MB of a larger page", () => {
    const html = `<p>first</p>${"<!-- -->".repeat(MEGABYTE_2 / 8)}<p>last</p>`;
    expect(extractPageText(html, BASE).text).toBe("first");
  });
});
