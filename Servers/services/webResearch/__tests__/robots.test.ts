import { ALLOW_ALL, DISALLOW_ALL, createRobotsChecker, parseRobots } from "../robots";

type FetchRobots = (robotsUrl: string) => Promise<{ status: number; text: string }>;

/** A fetchRobots that answers every origin with the same status and text and records the URLs. */
function fetchAnswering(status: number, text = ""): jest.Mock<ReturnType<FetchRobots>, [string]> {
  return jest.fn<ReturnType<FetchRobots>, [string]>(async () => ({ status, text }));
}

describe("parseRobots", () => {
  describe("group choice", () => {
    const BOTH = [
      "User-agent: *",
      "Disallow: /private",
      "Allow: /private/public",
      "",
      "User-agent: VerifyWiseResearchBot",
      "Disallow: /bot-only",
    ].join("\n");

    it("uses the group for our bot and ignores the * group when there is one", () => {
      const rules = parseRobots(BOTH);
      expect(rules.isAllowed("/bot-only")).toBe(false);
      expect(rules.isAllowed("/bot-only/x")).toBe(false);
      expect(rules.isAllowed("/private")).toBe(true);
      expect(rules.isAllowed("/private/page")).toBe(true);
    });

    it("uses the * group when no group names our bot", () => {
      const rules = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/public");
      expect(rules.isAllowed("/private")).toBe(false);
      expect(rules.isAllowed("/private/page")).toBe(false);
      expect(rules.isAllowed("/private/public/x")).toBe(true);
      expect(rules.isAllowed("/other")).toBe(true);
    });

    it("allows everything when no group names our bot and there is no * group", () => {
      const rules = parseRobots("User-agent: SomeOtherBot\nDisallow: /");
      expect(rules.isAllowed("/")).toBe(true);
      expect(rules.isAllowed("/anything")).toBe(true);
    });

    it("shares the rules between consecutive User-agent lines", () => {
      const text = "User-agent: OtherBot\nUser-agent: VerifyWiseResearchBot\nDisallow: /shared";
      expect(parseRobots(text).isAllowed("/shared")).toBe(false);
      expect(parseRobots(text, "OtherBot").isAllowed("/shared")).toBe(false);
      expect(parseRobots(text, "ThirdBot").isAllowed("/shared")).toBe(true);
    });

    it("starts a new group at a User-agent line that follows a rule", () => {
      const text =
        "User-agent: OtherBot\nDisallow: /other\nUser-agent: VerifyWiseResearchBot\nDisallow: /mine";
      const rules = parseRobots(text);
      expect(rules.isAllowed("/mine")).toBe(false);
      expect(rules.isAllowed("/other")).toBe(true);
    });

    it("starts a new group at a User-agent line that follows an empty Disallow", () => {
      const text =
        "User-agent: OtherBot\nDisallow:\nUser-agent: VerifyWiseResearchBot\nDisallow: /x";
      expect(parseRobots(text, "OtherBot").isAllowed("/x")).toBe(true);
      expect(parseRobots(text).isAllowed("/x")).toBe(false);
    });

    it("reads field names and the agent token case-insensitively", () => {
      const text = "USER-AGENT: verifywiseresearchbot\nDISALLOW: /x\nallow: /x/y";
      const rules = parseRobots(text);
      expect(rules.isAllowed("/x")).toBe(false);
      expect(rules.isAllowed("/x/y")).toBe(true);
      expect(parseRobots("User-agent: VERIFYWISERESEARCHBOT\nDisallow: /z").isAllowed("/z")).toBe(
        false,
      );
    });

    // RFC 9309, 2.2.1: a group is ours when it names our product token, not a part of it.
    it.each([
      "VerifyWiseResearchBot",
      "verifywiseresearchbot/1.0",
      "VerifyWiseResearchBot /2",
      "  VERIFYWISERESEARCHBOT/1.0  ",
    ])("takes the group named %p as ours, not the * group", (name) => {
      const rules = parseRobots(
        `User-agent: *\nDisallow: /star\n\nUser-agent: ${name}\nDisallow: /ours`,
      );
      expect(rules.isAllowed("/ours")).toBe(false);
      expect(rules.isAllowed("/star")).toBe(true);
    });

    it.each([
      "bot",
      "wise",
      "search",
      "VerifyWise",
      "VerifyWiseResearch",
      "VerifyWiseResearchBot2",
    ])("leaves the group named %p to another agent, and keeps the * group for us", (name) => {
      const rules = parseRobots(
        `User-agent: ${name}\nAllow: /\nDisallow: /theirs\n\nUser-agent: *\nDisallow: /private`,
      );
      expect(rules.isAllowed("/private")).toBe(false);
      expect(rules.isAllowed("/theirs")).toBe(true);
    });

    it("does not read a version suffix on the * group as the * group", () => {
      const rules = parseRobots("User-agent: */1.0\nDisallow: /star");
      expect(rules.isAllowed("/star")).toBe(true);
    });

    it("allows everything when our own group is empty, whatever the * group says", () => {
      const rules = parseRobots(
        "User-agent: VerifyWiseResearchBot\nDisallow:\n\nUser-agent: *\nDisallow: /",
      );
      expect(rules.isAllowed("/anything")).toBe(true);
    });

    it("combines the rules of groups that name our token with and without a version", () => {
      const text =
        "User-agent: VerifyWiseResearchBot\nDisallow: /a\n\nUser-agent: verifywiseresearchbot/1.0\nDisallow: /b";
      const rules = parseRobots(text);
      expect(rules.isAllowed("/a")).toBe(false);
      expect(rules.isAllowed("/b")).toBe(false);
    });

    it("takes the agent token from the second argument", () => {
      const text = "User-agent: *\nDisallow: /star\n\nUser-agent: TestBot\nDisallow: /test";
      const rules = parseRobots(text, "TestBot");
      expect(rules.isAllowed("/test")).toBe(false);
      expect(rules.isAllowed("/star")).toBe(true);
    });

    it("combines the rules of several groups that name the same agent", () => {
      const text = [
        "User-agent: *",
        "Disallow: /a",
        "",
        "User-agent: *",
        "Disallow: /b",
        "",
        "User-agent: VerifyWiseResearchBot",
        "Disallow: /c",
        "",
        "User-agent: verifywiseresearchbot",
        "Disallow: /d",
      ].join("\n");
      const ours = parseRobots(text);
      expect(ours.isAllowed("/c")).toBe(false);
      expect(ours.isAllowed("/d")).toBe(false);
      expect(ours.isAllowed("/a")).toBe(true);
      const star = parseRobots(text, "SomeoneElse");
      expect(star.isAllowed("/a")).toBe(false);
      expect(star.isAllowed("/b")).toBe(false);
      expect(star.isAllowed("/c")).toBe(true);
    });

    it("does not let an empty User-agent value match every agent", () => {
      const text = "User-agent:\nAllow: /\n\nUser-agent: *\nDisallow: /closed";
      expect(parseRobots(text).isAllowed("/closed")).toBe(false);
    });

    it("ignores a rule that comes before any User-agent line", () => {
      const text = "Disallow: /orphan\nUser-agent: *\nDisallow: /listed";
      const rules = parseRobots(text);
      expect(rules.isAllowed("/orphan")).toBe(true);
      expect(rules.isAllowed("/listed")).toBe(false);
    });
  });

  describe("syntax", () => {
    it("ignores comments, blank lines and CRLF line ends", () => {
      const text =
        "# a comment\r\n\r\nUser-agent: * # everyone\r\n\r\n# between\r\nDisallow: /a # not a\r\nAllow: /a/b\r\n";
      const rules = parseRobots(text);
      expect(rules.isAllowed("/a")).toBe(false);
      expect(rules.isAllowed("/a/x")).toBe(false);
      expect(rules.isAllowed("/a/b")).toBe(true);
      expect(rules.isAllowed("/c")).toBe(true);
    });

    it("reads a file with old Mac line ends", () => {
      expect(parseRobots("User-agent: *\rDisallow: /a\r").isAllowed("/a")).toBe(false);
    });

    it("reads a file that starts with a byte order mark", () => {
      expect(parseRobots("\uFEFFUser-agent: *\nDisallow: /a").isAllowed("/a")).toBe(false);
    });

    it("ignores Crawl-delay, Sitemap and unknown fields without ending the group", () => {
      const text = [
        "User-agent: *",
        "Crawl-delay: 10",
        "Sitemap: https://a.example/sitemap.xml",
        "Host: a.example",
        "Noindex: /ignored",
        "no colon on this line",
        "Disallow: /a",
      ].join("\n");
      const rules = parseRobots(text);
      expect(rules.isAllowed("/a")).toBe(false);
      expect(rules.isAllowed("/ignored")).toBe(true);
    });

    it("does not let an ignored field end the list of agents", () => {
      const text =
        "User-agent: OtherBot\nCrawl-delay: 5\nUser-agent: VerifyWiseResearchBot\nDisallow: /x";
      expect(parseRobots(text, "OtherBot").isAllowed("/x")).toBe(false);
      expect(parseRobots(text).isAllowed("/x")).toBe(false);
    });

    it("keeps a colon inside the value", () => {
      expect(parseRobots("User-agent: *\nDisallow: /a:b").isAllowed("/a:b")).toBe(false);
    });
  });

  describe("longest match", () => {
    it("lets the longer rule win", () => {
      const rules = parseRobots("User-agent: *\nDisallow: /a\nAllow: /a/b");
      expect(rules.isAllowed("/a/b/c")).toBe(true);
      expect(rules.isAllowed("/a/b")).toBe(true);
      expect(rules.isAllowed("/a/x")).toBe(false);
      expect(rules.isAllowed("/a")).toBe(false);
    });

    it("lets the longer Disallow beat a shorter Allow", () => {
      const rules = parseRobots("User-agent: *\nAllow: /a\nDisallow: /a/b");
      expect(rules.isAllowed("/a/b/c")).toBe(false);
      expect(rules.isAllowed("/a/x")).toBe(true);
    });

    it("does not depend on the order of the rules", () => {
      const rules = parseRobots("User-agent: *\nAllow: /a/b\nDisallow: /a");
      expect(rules.isAllowed("/a/b/c")).toBe(true);
      expect(rules.isAllowed("/a/x")).toBe(false);
    });

    it("lets Allow win a tie", () => {
      const first = parseRobots("User-agent: *\nDisallow: /x\nAllow: /x");
      expect(first.isAllowed("/x")).toBe(true);
      const second = parseRobots("User-agent: *\nAllow: /x\nDisallow: /x");
      expect(second.isAllowed("/x")).toBe(true);
    });

    it("matches from the start of the path", () => {
      const rules = parseRobots("User-agent: *\nDisallow: /admin");
      expect(rules.isAllowed("/admin")).toBe(false);
      expect(rules.isAllowed("/administrator")).toBe(false);
      expect(rules.isAllowed("/x/admin")).toBe(true);
    });

    it("scores a wildcard rule by the length of its pattern as written", () => {
      // "/*.pdf$" is 7 characters: longer than "/files" (6), a tie with "/files/" (7).
      const longer = parseRobots("User-agent: *\nDisallow: /*.pdf$\nAllow: /files");
      expect(longer.isAllowed("/files/a.pdf")).toBe(false);
      expect(longer.isAllowed("/files/a.html")).toBe(true);
      const tie = parseRobots("User-agent: *\nDisallow: /*.pdf$\nAllow: /files/");
      expect(tie.isAllowed("/files/a.pdf")).toBe(true);
    });
  });

  describe("wildcards", () => {
    it("anchors a pattern that ends in $ to the end of the path and query", () => {
      const rules = parseRobots("User-agent: *\nDisallow: /*.pdf$");
      expect(rules.isAllowed("/x.pdf")).toBe(false);
      expect(rules.isAllowed("/dir/sub/x.pdf")).toBe(false);
      expect(rules.isAllowed("/x.pdf?y=1")).toBe(true);
      expect(rules.isAllowed("/x.pdfx")).toBe(true);
      expect(rules.isAllowed("/x.html")).toBe(true);
    });

    it("lets * match any run of characters, including slashes and none", () => {
      const rules = parseRobots("User-agent: *\nDisallow: /a*b");
      expect(rules.isAllowed("/a/zz/b")).toBe(false);
      expect(rules.isAllowed("/ab")).toBe(false);
      expect(rules.isAllowed("/a/zz/b/more")).toBe(false);
      expect(rules.isAllowed("/a/zz/c")).toBe(true);
      expect(rules.isAllowed("/b")).toBe(true);
    });

    it("matches an exact path when the pattern ends in $ and has no wildcard", () => {
      const rules = parseRobots("User-agent: *\nDisallow: /exact$");
      expect(rules.isAllowed("/exact")).toBe(false);
      expect(rules.isAllowed("/exact/")).toBe(true);
      expect(rules.isAllowed("/exactly")).toBe(true);
    });

    it("finds the pieces of a pattern in order without overlap", () => {
      const rules = parseRobots("User-agent: *\nDisallow: /a*ab*c$");
      expect(rules.isAllowed("/aabc")).toBe(false);
      expect(rules.isAllowed("/a-ab-c")).toBe(false);
      expect(rules.isAllowed("/abc")).toBe(true);
      expect(rules.isAllowed("/aab")).toBe(true);
      const anchored = parseRobots("User-agent: *\nDisallow: /ab*bc$");
      expect(anchored.isAllowed("/abc")).toBe(true);
      expect(anchored.isAllowed("/abbc")).toBe(false);
    });

    it("treats a $ inside the pattern, and . and ?, as literal characters", () => {
      const rules = parseRobots(
        "User-agent: *\nDisallow: /a$b\nDisallow: /q?id=1\nDisallow: /v1.0",
      );
      expect(rules.isAllowed("/a$b")).toBe(false);
      expect(rules.isAllowed("/ab")).toBe(true);
      expect(rules.isAllowed("/q?id=1&x=2")).toBe(false);
      expect(rules.isAllowed("/qid=1")).toBe(true);
      expect(rules.isAllowed("/v1.0")).toBe(false);
      expect(rules.isAllowed("/v1x0")).toBe(true);
    });

    it("allows everything for an empty Disallow and for an empty file", () => {
      expect(parseRobots("User-agent: *\nDisallow:").isAllowed("/anything")).toBe(true);
      expect(parseRobots("User-agent: *\nDisallow:\nAllow:").isAllowed("/anything")).toBe(true);
      expect(parseRobots("").isAllowed("/anything")).toBe(true);
      expect(parseRobots("\n\n# only a comment\n").isAllowed("/anything")).toBe(true);
    });

    it("disallows everything for Disallow: /", () => {
      const rules = parseRobots("User-agent: *\nDisallow: /");
      expect(rules.isAllowed("/")).toBe(false);
      expect(rules.isAllowed("/a/b?c=d")).toBe(false);
    });

    it("answers in good time to a pattern with very many wildcards", () => {
      const pattern = `/${"*a".repeat(5000)}*b`;
      const rules = parseRobots(`User-agent: *\nDisallow: ${pattern}`);
      const path = `/${"a".repeat(2000)}`;
      const started = Date.now();
      expect(rules.isAllowed(path)).toBe(true);
      expect(Date.now() - started).toBeLessThan(1000);
    });
  });

  describe("percent-encoding", () => {
    it("lets a non-ASCII pattern block the percent-encoded path that a URL carries", () => {
      const rules = parseRobots("User-agent: *\nDisallow: /café");
      expect(rules.isAllowed("/caf%C3%A9")).toBe(false);
      expect(rules.isAllowed("/caf%C3%A9/p")).toBe(false);
      expect(rules.isAllowed("/caf%c3%a9/p")).toBe(false);
      expect(rules.isAllowed("/café/p")).toBe(false);
      expect(rules.isAllowed("/cafe/p")).toBe(true);
    });

    it("lets a percent-encoded pattern block the non-ASCII path", () => {
      const rules = parseRobots("User-agent: *\nDisallow: /caf%c3%a9");
      expect(rules.isAllowed("/caf%C3%A9")).toBe(false);
      expect(rules.isAllowed("/café")).toBe(false);
    });

    it("reads the percent-encoded form of an unreserved character as that character", () => {
      const encoded = parseRobots("User-agent: *\nDisallow: /%7Euser");
      expect(encoded.isAllowed("/~user")).toBe(false);
      expect(encoded.isAllowed("/%7euser")).toBe(false);
      expect(encoded.isAllowed("/%7Euser")).toBe(false);
      expect(encoded.isAllowed("/user")).toBe(true);
      const plain = parseRobots("User-agent: *\nDisallow: /~user");
      expect(plain.isAllowed("/%7Euser")).toBe(false);
      expect(plain.isAllowed("/%7euser")).toBe(false);
      const letter = parseRobots("User-agent: *\nDisallow: /%63afe");
      expect(letter.isAllowed("/cafe")).toBe(false);
      expect(parseRobots("User-agent: *\nDisallow: /cafe").isAllowed("/%63afe")).toBe(false);
    });

    it("ignores the case of the hex digits of a reserved character", () => {
      const lower = parseRobots("User-agent: *\nDisallow: /a%2fb");
      expect(lower.isAllowed("/a%2Fb")).toBe(false);
      expect(lower.isAllowed("/a%2fb")).toBe(false);
      const upper = parseRobots("User-agent: *\nDisallow: /a%2Fb");
      expect(upper.isAllowed("/a%2fb")).toBe(false);
      expect(upper.isAllowed("/a%2Fb")).toBe(false);
    });

    it("keeps a reserved character apart from its percent-encoded form", () => {
      const encoded = parseRobots("User-agent: *\nDisallow: /a%2Fb");
      expect(encoded.isAllowed("/a/b")).toBe(true);
      const plain = parseRobots("User-agent: *\nDisallow: /a/b");
      expect(plain.isAllowed("/a%2Fb")).toBe(true);
    });

    it("keeps a % that does not start an octet", () => {
      const rules = parseRobots("User-agent: *\nDisallow: /100%\nDisallow: /x%zz");
      expect(rules.isAllowed("/100%")).toBe(false);
      expect(rules.isAllowed("/x%zz")).toBe(false);
      expect(rules.isAllowed("/100")).toBe(true);
    });

    it("encodes a space and the other characters that a URL cannot carry", () => {
      const rules = parseRobots('User-agent: *\nDisallow: /a b\nDisallow: /q|"');
      expect(rules.isAllowed("/a%20b")).toBe(false);
      expect(rules.isAllowed("/a b")).toBe(false);
      expect(rules.isAllowed("/q%7C%22")).toBe(false);
      expect(rules.isAllowed("/q|")).toBe(true);
    });

    it("keeps * and a trailing $ working in a non-ASCII pattern", () => {
      const rules = parseRobots("User-agent: *\nDisallow: /café*.pdf$");
      expect(rules.isAllowed("/caf%C3%A9/x.pdf")).toBe(false);
      expect(rules.isAllowed("/caf%C3%A9/x.pdf?y=1")).toBe(true);
      expect(rules.isAllowed("/caf%C3%A9/x.html")).toBe(true);
    });

    it("weighs two spellings of one pattern alike, so that Allow wins their tie", () => {
      const tilde = parseRobots("User-agent: *\nDisallow: /%7Euser\nAllow: /~user");
      expect(tilde.isAllowed("/~user")).toBe(true);
      const accent = parseRobots("User-agent: *\nDisallow: /café\nAllow: /caf%C3%A9");
      expect(accent.isAllowed("/caf%C3%A9")).toBe(true);
    });

    it("weighs a rule by its octets, whichever way a non-ASCII rule is written", () => {
      // "/café/x" is 7 characters as written and 12 once encoded, "/caf%C3%A9" is 10 either way.
      const rules = parseRobots("User-agent: *\nDisallow: /café/x\nAllow: /caf%C3%A9");
      expect(rules.isAllowed("/caf%C3%A9/x")).toBe(false);
      expect(rules.isAllowed("/caf%C3%A9/y")).toBe(true);
    });

    it("does not throw on a lone surrogate in a pattern or in a path", () => {
      const rules = parseRobots("User-agent: *\nDisallow: /a\uD800b");
      expect(() => rules.isAllowed("/a\uDC00b")).not.toThrow();
      expect(rules.isAllowed("/a\uD800b")).toBe(false);
    });
  });

  describe("ALLOW_ALL and DISALLOW_ALL", () => {
    it("allows every path", () => {
      expect(ALLOW_ALL.isAllowed("/")).toBe(true);
      expect(ALLOW_ALL.isAllowed("/a/b?c=d")).toBe(true);
    });

    it("disallows every path", () => {
      expect(DISALLOW_ALL.isAllowed("/")).toBe(false);
      expect(DISALLOW_ALL.isAllowed("/a/b?c=d")).toBe(false);
    });
  });
});

describe("createRobotsChecker", () => {
  const PAGE = new URL("https://a.example/page");

  describe("the answer of the robots.txt request", () => {
    it("parses a 200 answer", async () => {
      const checker = createRobotsChecker(
        fetchAnswering(200, "User-agent: *\nDisallow: /private\nAllow: /private/public"),
      );
      expect(await checker.isAllowed(new URL("https://a.example/private/x"))).toBe(false);
      expect(await checker.isAllowed(new URL("https://a.example/private/public/x"))).toBe(true);
      expect(await checker.isAllowed(new URL("https://a.example/other"))).toBe(true);
    });

    it("parses any 2xx answer", async () => {
      const checker = createRobotsChecker(fetchAnswering(203, "User-agent: *\nDisallow: /"));
      expect(await checker.isAllowed(PAGE)).toBe(false);
    });

    it.each([404, 403, 401, 410])("allows everything on a %i answer", async (status) => {
      const checker = createRobotsChecker(fetchAnswering(status, "User-agent: *\nDisallow: /"));
      expect(await checker.isAllowed(PAGE)).toBe(true);
    });

    it.each([500, 502, 503, 599])("disallows everything on a %i answer", async (status) => {
      const checker = createRobotsChecker(fetchAnswering(status, "User-agent: *\nAllow: /"));
      expect(await checker.isAllowed(PAGE)).toBe(false);
    });

    it.each([100, 301, 304])("disallows everything on a %i answer", async (status) => {
      const checker = createRobotsChecker(fetchAnswering(status));
      expect(await checker.isAllowed(PAGE)).toBe(false);
    });

    it("disallows everything when the request rejects", async () => {
      const fetchRobots = jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));
      const checker = createRobotsChecker(fetchRobots);
      expect(await checker.isAllowed(PAGE)).toBe(false);
    });

    it("disallows everything when the request throws before it returns a promise", async () => {
      const checker = createRobotsChecker(() => {
        throw new Error("boom");
      });
      expect(await checker.isAllowed(PAGE)).toBe(false);
    });

    it("uses the agent token it was given", async () => {
      const text = "User-agent: TestBot\nDisallow: /test\n\nUser-agent: *\nDisallow: /star";
      const withToken = createRobotsChecker(fetchAnswering(200, text), "TestBot");
      expect(await withToken.isAllowed(new URL("https://a.example/test"))).toBe(false);
      expect(await withToken.isAllowed(new URL("https://a.example/star"))).toBe(true);
      const byDefault = createRobotsChecker(fetchAnswering(200, text));
      expect(await byDefault.isAllowed(new URL("https://a.example/test"))).toBe(true);
      expect(await byDefault.isAllowed(new URL("https://a.example/star"))).toBe(false);
    });
  });

  describe("the cache", () => {
    it("fetches robots.txt once for all pages of an origin", async () => {
      const fetchRobots = fetchAnswering(200, "User-agent: *\nDisallow: /y");
      const checker = createRobotsChecker(fetchRobots);
      expect(await checker.isAllowed(new URL("https://a.example/x"))).toBe(true);
      expect(await checker.isAllowed(new URL("https://a.example/y"))).toBe(false);
      expect(fetchRobots).toHaveBeenCalledTimes(1);
      expect(fetchRobots).toHaveBeenCalledWith("https://a.example/robots.txt");
    });

    it("fetches the robots.txt of each origin on its own", async () => {
      const fetchRobots = fetchAnswering(404);
      const checker = createRobotsChecker(fetchRobots);
      await checker.isAllowed(new URL("https://a.example/"));
      await checker.isAllowed(new URL("http://a.example/"));
      await checker.isAllowed(new URL("https://b.example/"));
      await checker.isAllowed(new URL("https://www.a.example/"));
      expect(fetchRobots.mock.calls.map(([url]) => url)).toEqual([
        "https://a.example/robots.txt",
        "http://a.example/robots.txt",
        "https://b.example/robots.txt",
        "https://www.a.example/robots.txt",
      ]);
    });

    it("shares one request between concurrent calls for one origin", async () => {
      let answer!: (value: { status: number; text: string }) => void;
      const fetchRobots = jest.fn(
        () =>
          new Promise<{ status: number; text: string }>((resolve) => {
            answer = resolve;
          }),
      );
      const checker = createRobotsChecker(fetchRobots);
      const first = checker.isAllowed(new URL("https://a.example/x"));
      const second = checker.isAllowed(new URL("https://a.example/y"));
      await new Promise((resolve) => setImmediate(resolve));
      expect(fetchRobots).toHaveBeenCalledTimes(1);
      answer({ status: 200, text: "User-agent: *\nDisallow: /y" });
      expect(await first).toBe(true);
      expect(await second).toBe(false);
      expect(fetchRobots).toHaveBeenCalledTimes(1);
    });

    it("keeps the answer for an origin whose request rejected, and does not ask again", async () => {
      const fetchRobots = jest.fn().mockRejectedValue(new Error("timeout"));
      const checker = createRobotsChecker(fetchRobots);
      expect(await checker.isAllowed(new URL("https://a.example/x"))).toBe(false);
      expect(await checker.isAllowed(new URL("https://a.example/y"))).toBe(false);
      expect(fetchRobots).toHaveBeenCalledTimes(1);
    });

    it("does not share a cache between two checkers", async () => {
      const fetchRobots = fetchAnswering(404);
      await createRobotsChecker(fetchRobots).isAllowed(PAGE);
      await createRobotsChecker(fetchRobots).isAllowed(PAGE);
      expect(fetchRobots).toHaveBeenCalledTimes(2);
    });
  });

  describe("the path that is checked", () => {
    it("includes the query string", async () => {
      const checker = createRobotsChecker(
        fetchAnswering(200, "User-agent: *\nDisallow: /*?\nAllow: /open?"),
      );
      expect(await checker.isAllowed(new URL("https://a.example/p?q=1"))).toBe(false);
      expect(await checker.isAllowed(new URL("https://a.example/p"))).toBe(true);
      expect(await checker.isAllowed(new URL("https://a.example/open?q=1"))).toBe(true);
    });

    it("leaves out the fragment", async () => {
      const checker = createRobotsChecker(fetchAnswering(200, "User-agent: *\nDisallow: /p$"));
      expect(await checker.isAllowed(new URL("https://a.example/p#section"))).toBe(false);
    });

    it("compares the percent-encoded path of the URL with the pattern", async () => {
      const checker = createRobotsChecker(
        fetchAnswering(200, "User-agent: *\nDisallow: /café\nDisallow: /%7Euser\nDisallow: /a%2fb"),
      );
      expect(await checker.isAllowed(new URL("https://a.example/café/p"))).toBe(false);
      expect(await checker.isAllowed(new URL("https://a.example/~user"))).toBe(false);
      expect(await checker.isAllowed(new URL("https://a.example/%7euser"))).toBe(false);
      expect(await checker.isAllowed(new URL("https://a.example/a%2Fb"))).toBe(false);
      expect(await checker.isAllowed(new URL("https://a.example/cafe"))).toBe(true);
    });

    it("checks / for a bare origin", async () => {
      const checker = createRobotsChecker(fetchAnswering(200, "User-agent: *\nDisallow: /$"));
      expect(await checker.isAllowed(new URL("https://a.example"))).toBe(false);
      expect(await checker.isAllowed(new URL("https://a.example/p"))).toBe(true);
    });
  });
});
