import { MAX_SCRIPTED_CHARS, extractScriptedText } from "../scriptedText";

const SECURITY =
  "Acme encrypts customer data at rest and in transit, and it never uses that data to train models.";
const CERTIFIED = "Acme has held ISO 27001 certification since 2021 and is audited every year.";
const ANSWER =
  "Yes. Acme keeps its subprocessors listed on this page and gives thirty days notice.";

/** JSON as Next.js and the makers of JSON-LD write it into a page: `<` is escaped, so that no string can close the script. */
const embedded = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** The data that Next.js writes into a page, with the props of the page in it. */
const nextData = (pageProps: unknown, extra: Record<string, unknown> = {}) =>
  `<script id="__NEXT_DATA__" type="application/json">${embedded({
    props: { pageProps },
    page: "/security",
    buildId: "x1y2z3",
    ...extra,
  })}</script>`;

const jsonLd = (data: unknown) => `<script type="application/ld+json">${embedded(data)}</script>`;

const page = (...parts: string[]) =>
  `<html><head><title>Acme</title></head><body><div id="__next"></div>${parts.join("")}</body></html>`;

describe("extractScriptedText", () => {
  describe("the data of a Next.js page", () => {
    it("is the sentences of the props of the page, in order", () => {
      const html = page(
        nextData({
          hero: { title: "Security is how we work at Acme", body: SECURITY },
          sections: [{ text: CERTIFIED }, { text: ANSWER }],
        }),
      );

      expect(extractScriptedText(html)).toBe(
        `Security is how we work at Acme\n\n${SECURITY}\n\n${CERTIFIED}\n\n${ANSWER}`,
      );
    });

    it("leaves out what is not prose: addresses, identifiers, class lists, code and short labels", () => {
      const html = page(
        nextData({
          link: "https://acme.com/security/overview-of-the-whole-security-program",
          slug: "security",
          id: "9f1c2d3e-4b5a-6789-8abc-def012345678",
          token: "abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567",
          classes: "text-lg font-bold mt-4 flex items-center justify-between",
          script: "function () { return window.location.href; }",
          json: '{"a": 1, "b": [1, 2, 3, 4, 5, 6]}',
          label: "Learn more",
          numbers: "1 2 3 4 5 6 7 8 9 10 11 12 13 14 15",
          body: SECURITY,
        }),
      );

      expect(extractScriptedText(html)).toBe(SECURITY);
    });

    it.each([
      ["braces", "if (user is not signed in) { show the login form again }"],
      ["an arrow", "items.map(item => render the item name again today)"],
      ["a function", "function (event) call the handler of the page again"],
      ["a declaration", "var counter = zero and increment it every second"],
      ["a let declaration", "let total = zero and add every price to it"],
      ["a const declaration", "const limit = ten and stop at that number"],
    ])("leaves out code that has words in it: %s", (_name, code) => {
      expect(extractScriptedText(page(nextData({ code, body: SECURITY })))).toBe(SECURITY);
    });

    it.each([
      "Please enable JavaScript in your browser to see the full page.",
      "JavaScript has been disabled in this browser by the user settings.",
      "This site requires JavaScript to show the content of its pages.",
      "We need Javascript to run the application in your browser.",
      "Your browser does not support the features that this site needs.",
      "Your browser doesn't support the features that this site needs.",
    ])("leaves out the notice of a page that needs a script: %s", (notice) => {
      expect(extractScriptedText(page(nextData({ notice, body: SECURITY })))).toBe(SECURITY);
    });

    it("reads the props of the page and nothing else of the data", () => {
      const html = page(
        nextData(
          { body: SECURITY },
          { runtimeConfig: { note: ANSWER }, props2: CERTIFIED, gssp: true },
        ),
      );

      expect(extractScriptedText(html)).toBe(SECURITY);
    });

    it("takes a string for a sentence from five words and 25 characters", () => {
      const html = page(
        nextData({
          fourWords: "Acme encrypts customer records.",
          twentyFour: "We do not sell any data.",
          twentyFive: "We do not sell your data.",
          fiveWords: "Acme encrypts every customer record.",
        }),
      );

      expect(extractScriptedText(html)).toBe(
        "We do not sell your data.\n\nAcme encrypts every customer record.",
      );
    });

    it("leaves out a string that is mostly numbers and signs", () => {
      const html = page(
        nextData({
          sku: "ref 12 34 56 and note 78 90 ok",
          prices: "SKU 123456 and 789012 plus 345678 or 901234",
          body: SECURITY,
        }),
      );

      expect(extractScriptedText(html)).toBe(SECURITY);
    });

    it("keeps a sentence with a few words joined by hyphens, and leaves out a list of class names", () => {
      const html = page(
        nextData({
          one: "Acme offers well-known and state-of-the-art encryption for every customer.",
          two: "We use industry-standard, peer-reviewed, third-party-audited controls.",
          classes: "text-lg font-bold mt-4 flex items-center justify-between",
        }),
      );

      expect(extractScriptedText(html)).toBe(
        "Acme offers well-known and state-of-the-art encryption for every customer.\n\nWe use industry-standard, peer-reviewed, third-party-audited controls.",
      );
    });

    it.each([
      "@context",
      "@id",
      "@type",
      "alt",
      "asPath",
      "assetPrefix",
      "buildId",
      "canonical",
      "class",
      "className",
      "color",
      "contentType",
      "href",
      "icon",
      "id",
      "image",
      "images",
      "lang",
      "locale",
      "locales",
      "logo",
      "path",
      "pathname",
      "query",
      "sameAs",
      "slug",
      "src",
      "srcset",
      "style",
      "url",
    ])("does not read what is under the key %s", (key) => {
      const html = page(
        nextData({ body: SECURITY, [key]: "This is a sentence under a key that carries no text." }),
      );

      expect(extractScriptedText(html)).toBe(SECURITY);
    });

    it("does not read the keys that carry the routes, the styles and the images", () => {
      const html = page(
        nextData({
          body: SECURITY,
          query: { text: ANSWER },
          className: "This is a sentence in the class name key of the page",
          image: { alt: "A picture of the security team at work in the office" },
        }),
      );

      expect(extractScriptedText(html)).toBe(SECURITY);
    });

    it("reads the text of rich text, which a content system writes as markup", () => {
      const html = page(
        nextData({
          body: `<p>We <b>do not</b> train models on &amp; with your data.</p><p>${CERTIFIED}</p><script>alert("this is not text")</script>`,
        }),
      );

      expect(extractScriptedText(html)).toBe(
        `We do not train models on & with your data.\n\n${CERTIFIED}`,
      );
    });

    it("keeps a sentence once, wherever it is repeated", () => {
      const html = page(nextData({ a: SECURITY, b: [CERTIFIED, SECURITY], c: { d: CERTIFIED } }));

      expect(extractScriptedText(html)).toBe(`${SECURITY}\n\n${CERTIFIED}`);
    });

    it.each([
      ["no props", { page: "/x", buildId: "b" }],
      ["no page props", { props: {} }],
      ["props that are not an object", { props: { pageProps: "just text with many words in it" } }],
    ])("has nothing when the data has %s", (_name, data) => {
      const html = page(
        `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`,
      );

      expect(extractScriptedText(html)).toBe("");
    });

    it("is found with single quotes, other attribute order and capital letters", () => {
      const html = `<html><body><SCRIPT type='application/json' ID='__NEXT_DATA__'>${JSON.stringify({ props: { pageProps: { body: SECURITY } } })}</SCRIPT></body></html>`;

      expect(extractScriptedText(html)).toBe(SECURITY);
    });

    it("is not read from a script that has another id", () => {
      const html = page(
        `<script id="other" type="application/json">${JSON.stringify({ props: { pageProps: { body: SECURITY } } })}</script>`,
      );

      expect(extractScriptedText(html)).toBe("");
    });
  });

  describe("structured data", () => {
    it("is the questions and answers of an FAQ", () => {
      const html = page(
        jsonLd({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Does Acme use customer data to train models?",
              acceptedAnswer: { "@type": "Answer", text: SECURITY },
            },
            {
              "@type": "Question",
              name: "Which certifications does Acme hold?",
              acceptedAnswer: { "@type": "Answer", text: CERTIFIED },
            },
          ],
        }),
      );

      expect(extractScriptedText(html)).toBe(
        `Does Acme use customer data to train models?\n\n${SECURITY}\n\nWhich certifications does Acme hold?\n\n${CERTIFIED}`,
      );
    });

    it("is read from a graph and from a list of objects", () => {
      const html = page(
        jsonLd({ "@graph": [{ "@type": "Organization", description: SECURITY }] }),
        jsonLd([{ "@type": "Article", articleBody: CERTIFIED }]),
      );

      expect(extractScriptedText(html)).toBe(`${SECURITY}\n\n${CERTIFIED}`);
    });

    it("leaves out the logo, the profiles and the addresses of the organization", () => {
      const html = page(
        jsonLd({
          "@type": "Organization",
          name: "Acme Analytics Limited",
          url: "https://www.acme.com/",
          logo: "https://www.acme.com/assets/logo-for-the-whole-site.png",
          sameAs: ["https://www.linkedin.com/company/acme-analytics-limited-of-london"],
          description: SECURITY,
        }),
      );

      expect(extractScriptedText(html)).toBe(SECURITY);
    });

    it("is in the order of the page when there is more than one script", () => {
      const html = page(jsonLd({ description: CERTIFIED }), nextData({ body: SECURITY }));

      expect(extractScriptedText(html)).toBe(`${CERTIFIED}\n\n${SECURITY}`);
    });

    it("is found whatever the case of its type", () => {
      const html = page(
        `<script type=" Application/LD+JSON ">${JSON.stringify({ description: SECURITY })}</script>`,
      );

      expect(extractScriptedText(html)).toBe(SECURITY);
    });

    it("is passed over when it is not JSON", () => {
      const html = page(
        `<script type="application/ld+json">{ this is not json, but it has many words in it</script>`,
        jsonLd({ description: SECURITY }),
      );

      expect(extractScriptedText(html)).toBe(SECURITY);
    });

    it("is not read from a script of another type", () => {
      const html = page(
        `<script type="text/javascript">var text = "${SECURITY}";</script>`,
        `<script>{"description": "${CERTIFIED}"}</script>`,
      );

      expect(extractScriptedText(html)).toBe("");
    });
  });

  describe("the text for browsers that run no script", () => {
    it("is read", () => {
      const html = page(`<noscript><h1>Security at Acme</h1><p>${SECURITY}</p></noscript>`);

      expect(extractScriptedText(html)).toBe(`Security at Acme\n\n${SECURITY}`);
    });

    it.each([
      "<noscript>You need to enable JavaScript to run this app.</noscript>",
      "<noscript>JavaScript is disabled in your browser, and this page requires it.</noscript>",
      '<noscript><img height="1" width="1" src="https://www.facebook.com/tr?id=1&ev=PageView"></noscript>',
      '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-X" height="0"></iframe></noscript>',
      "<noscript><style>.hidden{display:none}</style></noscript>",
      "<noscript></noscript>",
    ])("is passed over when it is only a notice or a pixel: %s", (markup) => {
      expect(extractScriptedText(page(markup))).toBe("");
    });

    it("is read together with the data, in the order of the page", () => {
      const html = page(`<noscript><p>${CERTIFIED}</p></noscript>`, nextData({ body: SECURITY }));

      expect(extractScriptedText(html)).toBe(`${CERTIFIED}\n\n${SECURITY}`);
    });
  });

  describe("the limits", () => {
    it("has nothing for a page with no script data", () => {
      expect(extractScriptedText("<html><body><p>Just a page.</p></body></html>")).toBe("");
      expect(extractScriptedText("")).toBe("");
    });

    it("is cut at the most it returns", () => {
      const sentences = Array.from(
        { length: 2000 },
        (_, n) => `Sentence number ${n} says that Acme keeps the records of the customer safe.`,
      );

      const text = extractScriptedText(page(nextData({ sentences })));

      expect(text.length).toBeLessThanOrEqual(MAX_SCRIPTED_CHARS);
      expect(text.length).toBeGreaterThan(MAX_SCRIPTED_CHARS - 200);
      // The cut falls between sentences.
      expect(text.endsWith("safe.")).toBe(true);
    });

    it("does not read data that nests deeper than a page does", () => {
      let deep: unknown = { text: "This sentence is too deep in the data to be read at all." };
      for (let level = 0; level < 100; level += 1) deep = { child: deep };

      expect(extractScriptedText(page(nextData({ body: SECURITY, deep })))).toBe(SECURITY);
    });

    it("reads data that is nested as deep as a page nests it", () => {
      const deep = { a: { b: { c: { d: { e: { f: { g: { h: { text: SECURITY } } } } } } } } };

      expect(extractScriptedText(page(nextData(deep)))).toBe(SECURITY);
    });

    it("keeps a sentence that fills the text exactly, and ends the text at the one that does not fit", () => {
      const sentence = (word: string, length: number) =>
        `${`${word} `.repeat(Math.ceil(length / (word.length + 1)))}`.slice(0, length - 1) + "x";
      const half = (MAX_SCRIPTED_CHARS - 2) / 2;
      const first = sentence("alpha", half);
      const second = sentence("bravo", half);

      const text = extractScriptedText(page(nextData({ first, second })));

      expect(first).toHaveLength(half);
      expect(text).toBe(`${first}\n\n${second}`);
      expect(text).toHaveLength(MAX_SCRIPTED_CHARS);
    });

    it("ends the text at the first sentence that does not fit, and reads no later one", () => {
      const sentence = (word: string, length: number) =>
        `${`${word} `.repeat(Math.ceil(length / (word.length + 1)))}`.slice(0, length - 1) + "x";
      const first = sentence("alpha", 49_999);
      const toolong = sentence("bravo", 60_000);

      const text = extractScriptedText(page(nextData({ first, toolong, last: SECURITY })));

      expect(text).toBe(first);
    });

    it("walks at most 50,000 values of the data", () => {
      const numbers = Array.from({ length: 60_000 }, () => 1);

      const html = page(nextData({ before: SECURITY, numbers, after: CERTIFIED }));

      expect(extractScriptedText(html)).toBe(SECURITY);
    });

    it("keeps at most 5000 strings of the data", () => {
      const filler = Array.from({ length: 5000 }, (_, n) => `s${n}`);

      const html = page(nextData({ filler, body: SECURITY }));

      expect(extractScriptedText(html)).toBe("");
    });

    it("reads at most 50 data scripts", () => {
      const sentence = (n: number) =>
        `Sentence number ${n} says that Acme keeps the records of the customer safe.`;
      const fifty = Array.from({ length: 50 }, (_, n) => jsonLd({ description: sentence(n) }));

      const text = extractScriptedText(page(...fifty, jsonLd({ description: SECURITY })));

      expect(text.split("\n\n")).toEqual(Array.from({ length: 50 }, (_, n) => sentence(n)));
    });

    it("reads at most 50 blocks for browsers that run no script", () => {
      const sentence = (n: number) =>
        `Sentence number ${n} says that Acme keeps the records of the customer safe.`;
      const fifty = Array.from(
        { length: 50 },
        (_, n) => `<noscript><p>${sentence(n)}</p></noscript>`,
      );

      const text = extractScriptedText(page(...fifty, `<noscript><p>${SECURITY}</p></noscript>`));

      expect(text.split("\n\n")).toEqual(Array.from({ length: 50 }, (_, n) => sentence(n)));
    });

    it("passes over a block for browsers that run no script of a size no page has", () => {
      const huge = `<noscript><p>${"word ".repeat(400_000)}</p></noscript>`;

      expect(extractScriptedText(page(huge, `<noscript><p>${SECURITY}</p></noscript>`))).toBe(
        SECURITY,
      );
    });

    it("reads a script of ordinary size and not one of a size no page has", () => {
      const huge = `<script type="application/ld+json">{"description": "${"word ".repeat(400_000)}"}</script>`;

      expect(extractScriptedText(page(huge, nextData({ body: SECURITY })))).toBe(SECURITY);
    });

    it("is quick on a page of unclosed scripts, which would make a naive search quadratic", () => {
      const html = `<html><body>${'<script type="application/ld+json">'.repeat(50_000)}</body></html>`;

      const started = Date.now();
      const text = extractScriptedText(html);

      expect(text).toBe("");
      expect(Date.now() - started).toBeLessThan(2000);
    });

    it("is quick on a page of many scripts that are not data", () => {
      const html = `<html><body>${"<script>var a = 1;</script>".repeat(40_000)}${nextData({ body: SECURITY })}</body></html>`;

      const started = Date.now();
      const text = extractScriptedText(html);

      expect(text).toBe(SECURITY);
      expect(Date.now() - started).toBeLessThan(2000);
    });

    it("is cleaned like any text that a third party wrote", () => {
      const html = page(
        nextData({ body: `Acme\u0000 keeps\u0001 the records of the customer safe.` }),
      );

      expect(extractScriptedText(html)).toBe("Acme keeps the records of the customer safe.");
    });
  });
});
