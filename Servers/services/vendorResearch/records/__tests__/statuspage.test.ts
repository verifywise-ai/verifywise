import {
  STATUS_FEED_MAX_BYTES,
  type StatusEntry,
  type StatusFeed,
  parseStatusFeed,
  statusFeedUrl,
  statusHistoryUrl,
  statusFeedNamesVendor,
  statusHostsOf,
  statusRecords,
} from "../statuspage";
import { MAX_RECORDS } from "../types";

const NOW = new Date("2031-04-20T12:00:00Z");
const CUTOFF = "2030-04-20";

/** The update of an incident as Atlassian Statuspage writes it: HTML, escaped inside the feed. */
const update = (label: string, month: string, day: string, time: string, text: string): string =>
  `&lt;p&gt; &lt;small&gt;${month} &lt;var data-var='date'&gt;${day}&lt;/var&gt;, &lt;var data-var='time'&gt;${time}&lt;/var&gt; UTC&lt;/small&gt;&lt;br&gt; &lt;strong&gt;${label}&lt;/strong&gt; - ${text} &lt;/p&gt;`;

interface EntryFields {
  published?: string | null;
  updated?: string | null;
  href?: string | null;
  title?: string;
  content?: string;
}

const entry = (fields: EntryFields = {}): string => {
  const {
    published = "2031-04-12T09:30:00Z",
    updated = "2031-04-12T11:00:00Z",
    href = "https://status.acme.com/incidents/abc123def456",
    title = "Elevated errors in the API",
    content = update("Resolved", "Apr", "12", "11:00", "API requests failed for 90 minutes."),
  } = fields;
  return `<entry>
    <id>tag:status.acme.com,2005:Incident/1001</id>
    ${published === null ? "" : `<published>${published}</published>`}
    ${updated === null ? "" : `<updated>${updated}</updated>`}
    ${href === null ? "" : `<link rel="alternate" type="text/html" href="${href}"/>`}
    <title>${title}</title>
    <content type="html">${content}</content>
  </entry>`;
};

const feedOf = (
  entries: string[],
  title = "Acme Status - Incident History",
): string => `<?xml version="1.0" encoding="UTF-8"?>
<feed xml:lang="en-US" xmlns="http://www.w3.org/2005/Atom">
  <id>tag:status.acme.com,2005:/history</id>
  <link rel="alternate" type="text/html" href="https://status.acme.com"/>
  <link rel="self" type="application/atom+xml" href="https://status.acme.com/history.atom"/>
  <title>${title}</title>
  <updated>2031-04-19T10:00:00Z</updated>
  <author>
    <name>Acme</name>
  </author>
  ${entries.join("\n  ")}
</feed>`;

const MAINTENANCE = entry({
  published: "2031-04-10T20:00:00Z",
  updated: "2031-04-10T22:00:00Z",
  href: "https://status.acme.com/incidents/mmm000111222",
  title: "Database Scheduled Maintenance",
  content:
    update("Completed", "Apr", "10", "22:00", "The scheduled maintenance has been completed.") +
    update("Scheduled", "Apr", "9", "08:00", "We will upgrade the database."),
});

describe("statusFeedUrl and statusHistoryUrl", () => {
  it("name the feed of the incident history and the page that shows it, on the host asked", () => {
    expect(statusFeedUrl("status.acme.com")).toBe("https://status.acme.com/history.atom");
    expect(statusHistoryUrl("status.acme.com")).toBe("https://status.acme.com/history");
  });

  it("reads at most two megabytes of a feed", () => {
    expect(STATUS_FEED_MAX_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe("statusHostsOf", () => {
  it("guesses the status page under the domain, the tenant of Statuspage for the brand and the status site named for it", () => {
    expect(statusHostsOf("acme.com")).toEqual([
      { host: "status.acme.com", own: true },
      { host: "acme.statuspage.io", own: false },
      { host: "acmestatus.com", own: false },
    ]);
  });

  it("takes the brand of the domain: the label before the suffix, and a hyphen is dropped from the status site", () => {
    expect(statusHostsOf("www.acme-cloud.co.uk")).toEqual([
      { host: "status.www.acme-cloud.co.uk", own: true },
      { host: "acme-cloud.statuspage.io", own: false },
      { host: "acmecloudstatus.com", own: false },
    ]);
    expect(statusHostsOf("app.acme.io").map((it) => it.host)).toEqual([
      "status.app.acme.io",
      "acme.statuspage.io",
      "acmestatus.com",
    ]);
  });

  it.each([
    ["is only a hyphen", "-.com"],
    ["begins with a hyphen", "-acme.com"],
    ["ends with a hyphen", "acme-.com"],
    ["holds a character that no host has", "my_app.com"],
    ["is longer than a label can be", `${"a".repeat(64)}.com`],
  ])("guesses only under the domain when its brand %s", (_name, domain) => {
    expect(statusHostsOf(domain)).toEqual([{ host: `status.${domain}`, own: true }]);
  });

  it("takes a brand as long as a label can be, and drops every hyphen of it from the status site", () => {
    const brand = "a".repeat(63);

    expect(statusHostsOf(`${brand}.com`).map((it) => it.host)).toEqual([
      `status.${brand}.com`,
      `${brand}.statuspage.io`,
      `${brand}status.com`,
    ]);
    expect(statusHostsOf("my-cool-app.com").map((it) => it.host)).toEqual([
      "status.my-cool-app.com",
      "my-cool-app.statuspage.io",
      "mycoolappstatus.com",
    ]);
  });
});

describe("statusFeedNamesVendor", () => {
  const feed = (name: string): StatusFeed => ({ name, entries: [] });
  const keys = ["acme", "acmecloud"];

  it("is true when the name of the feed holds a name of the vendor, in any case and spelling", () => {
    expect(statusFeedNamesVendor(feed("Acme Status"), keys)).toBe(true);
    expect(statusFeedNamesVendor(feed("ACME-Cloud system status"), keys)).toBe(true);
    expect(statusFeedNamesVendor(feed("The Acme.com status page"), keys)).toBe(true);
  });

  it("is false for the feed of another company, or of no name", () => {
    expect(statusFeedNamesVendor(feed("Other Status"), keys)).toBe(false);
    expect(statusFeedNamesVendor(feed(""), keys)).toBe(false);
    expect(statusFeedNamesVendor(feed("System status"), keys)).toBe(false);
  });

  it("does not take a name of one or two letters, which is in too many words", () => {
    expect(statusFeedNamesVendor(feed("Go status"), ["go"])).toBe(false);
    expect(statusFeedNamesVendor(feed("Cargo status"), ["go"])).toBe(false);
    expect(statusFeedNamesVendor(feed("Box status"), ["box"])).toBe(true);
  });
});

describe("parseStatusFeed", () => {
  it("reads an Atlassian Statuspage feed: the name, the incidents and their updates as text", () => {
    const feed = parseStatusFeed(
      feedOf([
        entry(),
        entry({
          published: "2031-03-02T14:00:00Z",
          updated: "2031-03-02T16:30:00Z",
          href: "https://status.acme.com/incidents/zzz999yyy888",
          title: "Dashboard unavailable",
          content:
            update("Resolved", "Mar", "2", "16:30", "The dashboard is back.") +
            update("Investigating", "Mar", "2", "14:00", "The dashboard does not load."),
        }),
      ]),
    );

    expect(feed).toEqual({
      name: "Acme Status",
      entries: [
        {
          id: "abc123def456",
          title: "Elevated errors in the API",
          day: "2031-04-12",
          text: "Apr 12, 11:00 UTC Resolved - API requests failed for 90 minutes.",
          maintenance: false,
        },
        {
          id: "zzz999yyy888",
          title: "Dashboard unavailable",
          day: "2031-03-02",
          text: "Mar 2, 16:30 UTC Resolved - The dashboard is back. Mar 2, 14:00 UTC Investigating - The dashboard does not load.",
          maintenance: false,
        },
      ],
    });
  });

  it("takes the day of an incident from published, else from updated, in UTC", () => {
    const feed = parseStatusFeed(
      feedOf([
        entry({ published: "2031-04-12T23:30:00-04:00", updated: "2031-04-20T00:00:00Z" }),
        entry({ published: null, updated: "2031-02-01T05:00:00.250Z" }),
      ]),
    ) as StatusFeed;

    expect(feed.entries.map((it) => it.day)).toEqual(["2031-04-13", "2031-02-01"]);
  });

  it("drops an entry that has no day or whose day is not a date", () => {
    const feed = parseStatusFeed(
      feedOf([
        entry({ published: null, updated: null }),
        entry({ published: "yesterday", updated: null }),
        entry({ published: "12", updated: "2031-13-45T00:00:00Z" }),
        entry({ published: "2031-04-12" }),
      ]),
    ) as StatusFeed;

    expect(feed.entries.map((it) => it.day)).toEqual(["2031-04-12"]);
  });

  it.each([
    ["a date with no time", "2031-04-12", "2031-04-12"],
    ["a time in UTC", "2031-04-12T09:30:00Z", "2031-04-12"],
    ["a time with no seconds", "2031-04-12T09:30Z", "2031-04-12"],
    ["a time with nine digits of fraction", "2031-04-12T09:30:00.123456789Z", "2031-04-12"],
    ["a time with an offset, which can move the day", "2031-04-12T23:30:00-04:00", "2031-04-13"],
    ["a date with white space around it", "\n  2031-04-10T09:30:00Z\n  ", "2031-04-10"],
  ])("reads %s as a day", (_name, published, day) => {
    const feed = parseStatusFeed(feedOf([entry({ published, updated: null })])) as StatusFeed;

    expect(feed.entries.map((it) => it.day)).toEqual([day]);
  });

  it.each([
    ["words before the date", "see 2031-04-12"],
    ["words after the date", "2031-04-12 and more"],
    ["a zone with no time", "2031-04-12Z"],
    ["a space for the T", "2031-04-12 09:30:00Z"],
    ["a time with no zone, which is a time of no known place", "2031-04-12T23:30:00"],
    ["an offset with no colon", "2031-04-12T09:30:00+0400"],
    ["more than nine digits of fraction", "2031-04-12T09:30:00.1234567890Z"],
  ])("does not read %s as a day", (_name, published) => {
    const feed = parseStatusFeed(feedOf([entry({ published, updated: null })])) as StatusFeed;

    expect(feed.entries).toEqual([]);
  });

  it.each(["Scheduled", "In progress", "Verifying", "Completed"])(
    "marks an entry whose update is labelled %s as a maintenance",
    (label) => {
      const feed = parseStatusFeed(
        feedOf([entry({ content: update(label, "Apr", "9", "08:00", "Planned work.") })]),
      ) as StatusFeed;

      expect(feed.entries[0].maintenance).toBe(true);
    },
  );

  it.each(["Investigating", "Identified", "Monitoring", "Resolved", "Postmortem"])(
    "keeps an entry with an update labelled %s an incident, next to a label of maintenance",
    (label) => {
      const feed = parseStatusFeed(
        feedOf([
          entry({
            content:
              update(label, "Apr", "9", "09:00", "Words.") +
              update("Scheduled", "Apr", "9", "08:00", "Planned work."),
          }),
        ]),
      ) as StatusFeed;

      expect(feed.entries[0].maintenance).toBe(false);
    },
  );

  it("reads a label of maintenance with white space around it, in any case", () => {
    const feed = parseStatusFeed(
      feedOf([entry({ content: update("  SCHEDULED ", "Apr", "9", "08:00", "Planned work.") })]),
    ) as StatusFeed;

    expect(feed.entries[0].maintenance).toBe(true);
  });

  it("marks maintenance by the labels of its updates, and an incident that mentions maintenance stays an incident", () => {
    const feed = parseStatusFeed(
      feedOf([
        MAINTENANCE,
        entry({
          title: "Outage during maintenance",
          content:
            update("Resolved", "Apr", "12", "11:00", "Fixed.") +
            update("Investigating", "Apr", "12", "09:30", "Looking.") +
            update("Scheduled", "Apr", "9", "08:00", "Planned."),
        }),
        entry({ title: "No labels", content: "Plain words, no markup." }),
      ]),
    ) as StatusFeed;

    expect(feed.entries.map((it) => it.maintenance)).toEqual([true, false, false]);
  });

  it("reads the feed of an incident.io status page: CDATA, no published, a double slash in the address", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
    <id>https://status.acme.com/</id>
    <title>Acme status</title>
    <updated>2031-04-19T21:25:21.966Z</updated>
    <generator>incident.io</generator>
    <link rel="alternate" href="https://status.acme.com/"/>
    <entry>
        <title type="html"><![CDATA[Degraded model performance]]></title>
        <id>https://status.acme.com//incidents/01M5YY4A3TQETEQ53DVSK8SW10</id>
        <link href="https://status.acme.com//incidents/01M5YY4A3TQETEQ53DVSK8SW10"/>
        <updated>2031-04-15T16:20:06.360Z</updated>
        <summary type="html"><![CDATA[<b>Status: Resolved</b><br/><br/>All affected services are operating normally again.]]></summary>
        <content type="html"><![CDATA[<b>Status: Resolved</b><br/><br/>All affected services are operating normally again.<br/><br/><b>Affected components</b>
          <ul>
          <li>Responses (Operational)</li>
          </ul>]]></content>
    </entry>
</feed>`;

    expect(parseStatusFeed(xml)).toEqual({
      name: "Acme status",
      entries: [
        {
          id: "01M5YY4A3TQETEQ53DVSK8SW10",
          title: "Degraded model performance",
          day: "2031-04-15",
          text: "Status: Resolved All affected services are operating normally again. Affected components Responses (Operational)",
          maintenance: false,
        },
      ],
    });
  });

  it("uses the summary when an entry has no content", () => {
    const xml = feedOf([
      `<entry><published>2031-04-12T09:30:00Z</published><link href="https://status.acme.com/incidents/abc123"/><title>T</title><summary type="text">Only a summary.</summary></entry>`,
    ]);

    expect((parseStatusFeed(xml) as StatusFeed).entries[0].text).toBe("Only a summary.");
  });

  it("takes the address of an entry from the alternate link, or from a link with no rel, and never from self", () => {
    const xml = feedOf([
      `<entry><published>2031-04-12T09:30:00Z</published>
        <link rel="self" href="https://status.acme.com/incidents/selfselfself"/>
        <link rel="alternate" type="text/html" href="https://status.acme.com/incidents/altaltalt1"/>
        <title>A</title></entry>`,
      `<entry><published>2031-04-12T09:30:00Z</published>
        <link href='https://status.acme.com/incidents/plainplain'/>
        <title>B</title></entry>`,
      `<entry><published>2031-04-12T09:30:00Z</published>
        <link rel="self" href="https://status.acme.com/incidents/onlyself"/>
        <title>C</title></entry>`,
    ]);

    expect((parseStatusFeed(xml) as StatusFeed).entries.map((it) => it.id)).toEqual([
      "altaltalt1",
      "plainplain",
      null,
    ]);
  });

  it("gives no id to an entry whose address is not an incident of the page", () => {
    const feed = parseStatusFeed(
      feedOf([
        entry({ href: "https://status.acme.com/" }),
        entry({ href: "https://status.acme.com/incidents/" }),
        entry({ href: "https://status.acme.com/incidents/has space" }),
        entry({ href: "https://status.acme.com/incidents/" + "a".repeat(65) }),
        entry({ href: "https://status.acme.com/incidents/../admin" }),
        entry({ href: "https://status.acme.com/incidents/abc123?x=1" }),
        entry({ href: "https://status.acme.com/incidents/abc_123" }),
        entry({ href: null }),
        entry({ href: "https://status.acme.com/incidents/" + "a".repeat(64) }),
      ]),
    ) as StatusFeed;

    expect(feed.entries.map((it) => it.id)).toEqual([
      null,
      null,
      null,
      null,
      null,
      "abc123",
      null,
      null,
      "a".repeat(64),
    ]);
  });

  it("takes the id of an incident with hyphens and 50 characters, and gives it a record", () => {
    const id = "b3a1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d-incident-1701";
    const feed = parseStatusFeed(
      feedOf([entry({ href: `https://status.acme.com/incidents/${id}` })]),
    ) as StatusFeed;

    const { records } = statusRecords(feed, { host: "status.acme.com", cutoff: CUTOFF, now: NOW });

    expect(id).toHaveLength(50);
    expect(feed.entries[0].id).toBe(id);
    expect(records.map((record) => record.url)).toEqual([
      "https://status.acme.com/history",
      `https://status.acme.com/incidents/${id}`,
    ]);
  });

  it("takes the id of an incident from its address with a slash at the end as well", () => {
    const feed = parseStatusFeed(
      feedOf([entry({ href: "https://status.acme.com/incidents/abc123/" })]),
    ) as StatusFeed;

    expect(feed.entries[0].id).toBe("abc123");
  });

  it("decodes the escapes in the address of a link", () => {
    const feed = parseStatusFeed(
      feedOf([entry({ href: "https://status.acme.com/incidents/&#97;bc123" })]),
    ) as StatusFeed;

    expect(feed.entries[0].id).toBe("abc123");
  });

  it("reads the attributes of a link by their whole names", () => {
    const xml = feedOf([
      `<entry><published>2031-04-12T09:30:00Z</published>
        <link data-href="https://status.acme.com/incidents/wrongwrong" href="https://status.acme.com/incidents/rightright"/>
        <title>A</title></entry>`,
      `<entry><published>2031-04-12T09:30:00Z</published>
        <link xrel="alternate" rel="self" href="https://status.acme.com/incidents/onlyself"/>
        <title>B</title></entry>`,
    ]);

    expect((parseStatusFeed(xml) as StatusFeed).entries.map((it) => it.id)).toEqual([
      "rightright",
      null,
    ]);
  });

  it("reads rel in any case, and takes the next link when a link has no address or an empty rel", () => {
    const xml = feedOf([
      `<entry><published>2031-04-12T09:30:00Z</published>
        <link rel="Alternate" href="https://status.acme.com/incidents/upperupper"/>
        <title>A</title></entry>`,
      `<entry><published>2031-04-12T09:30:00Z</published>
        <link rel="alternate" href="  "/>
        <link rel="alternate" href=""/>
        <link rel="alternate" href="https://status.acme.com/incidents/secondlink"/>
        <title>B</title></entry>`,
      `<entry><published>2031-04-12T09:30:00Z</published>
        <link rel="" href="https://status.acme.com/incidents/emptyrel"/>
        <title>C</title></entry>`,
    ]);

    expect((parseStatusFeed(xml) as StatusFeed).entries.map((it) => it.id)).toEqual([
      "upperupper",
      "secondlink",
      null,
    ]);
  });

  it("takes the address and the day of an entry from its own tags, and not from tags that its text holds", () => {
    const xml = feedOf([
      `<entry>
        <content type="html"><![CDATA[<published>2020-01-01T00:00:00Z</published><link rel="alternate" href="https://status.acme.com/incidents/fakefake1"/>]]></content>
        <published>2031-04-12T09:30:00Z</published>
        <link rel="alternate" href="https://status.acme.com/incidents/realreal1"/>
        <title>T</title>
      </entry>`,
    ]);

    const [only] = (parseStatusFeed(xml) as StatusFeed).entries;

    expect(only).toMatchObject({ id: "realreal1", day: "2031-04-12" });
  });

  it("decodes the escapes of the XML once, and drops the markup of the text", () => {
    const feed = parseStatusFeed(
      feedOf([
        entry({
          title: "Tom &amp; Jerry &lt;b&gt;slow&lt;/b&gt;",
          content:
            "&lt;p&gt;Cache &amp;amp; CDN&lt;br/&gt;&lt;script&gt;steal(1)&lt;/script&gt;down &lt;a href=&quot;http://x&quot;&gt;now&lt;/a&gt;&lt;style&gt;p{x:y}&lt;/style&gt;&nbsp;ok&lt;/p&gt;",
        }),
      ]),
    ) as StatusFeed;

    expect(feed.entries[0].title).toBe("Tom & Jerry slow");
    expect(feed.entries[0].text).toBe("Cache & CDN down now ok");
  });

  it("keeps the words of inline tags together and separates blocks", () => {
    const feed = parseStatusFeed(
      feedOf([
        entry({
          content:
            "&lt;p&gt;one&lt;strong&gt;two&lt;/strong&gt;&lt;/p&gt;&lt;p&gt;three&lt;/p&gt;&lt;ul&gt;&lt;li&gt;four&lt;/li&gt;&lt;li&gt;five&lt;/li&gt;&lt;/ul&gt;&lt;div&gt;six&lt;/div&gt;&lt;h2&gt;seven&lt;/h2&gt;eight",
        }),
      ]),
    ) as StatusFeed;

    expect(feed.entries[0].text).toBe("onetwo three four five six seven eight");
  });

  it("cuts a long update at fifteen hundred characters", () => {
    const feed = parseStatusFeed(feedOf([entry({ content: "a".repeat(1600) })])) as StatusFeed;

    expect(feed.entries[0].text).toBe("a".repeat(1500));
  });

  it("cuts the name of the feed at a hundred characters", () => {
    const feed = parseStatusFeed(feedOf([], "n".repeat(300))) as StatusFeed;

    expect(feed.name).toBe("n".repeat(100));
  });

  it("does not end a name, a title or a text with the space where it was cut", () => {
    const feed = parseStatusFeed(
      feedOf(
        [entry({ title: "abc ".repeat(100), content: "abcde ".repeat(300) })],
        "abcd ".repeat(40),
      ),
    ) as StatusFeed;

    expect(feed.name).toBe("abcd ".repeat(20).trim());
    expect(feed.entries[0].title).toBe("abc ".repeat(50).trim());
    expect(feed.entries[0].text).toBe("abcde ".repeat(250).trim());
  });

  it("reads a title that is a block as its words, with no space at either end", () => {
    const feed = parseStatusFeed(
      feedOf([entry({ title: "&lt;p&gt;Padded&lt;/p&gt;" })]),
    ) as StatusFeed;

    expect(feed.entries[0].title).toBe("Padded");
  });

  it("drops an HTML comment from the text", () => {
    const feed = parseStatusFeed(
      feedOf([entry({ content: "&lt;p&gt;one&lt;!-- an internal note --&gt;two&lt;/p&gt;" })]),
    ) as StatusFeed;

    expect(feed.entries[0].text).toBe("onetwo");
  });

  it("takes what a CDATA section holds as it is, and decodes only what is outside it", () => {
    const feed = parseStatusFeed(
      feedOf([entry({ content: "<![CDATA[<p>Fish &lt;b&gt;bold&lt;/b&gt; end</p>]]>" })]),
    ) as StatusFeed;

    expect(feed.entries[0].text).toBe("Fish <b>bold</b> end");
  });

  it("falls back to the summary when the content has no words", () => {
    const xml = feedOf([
      `<entry><published>2031-04-12T09:30:00Z</published><link href="https://status.acme.com/incidents/abc123"/><title>A</title><content type="html"/><summary type="text">The summary.</summary></entry>`,
      `<entry><published>2031-04-12T09:30:00Z</published><link href="https://status.acme.com/incidents/def456"/><title>B</title><content type="html">&lt;p&gt; &lt;/p&gt;</content><summary type="text">Another summary.</summary></entry>`,
    ]);

    expect((parseStatusFeed(xml) as StatusFeed).entries.map((it) => it.text)).toEqual([
      "The summary.",
      "Another summary.",
    ]);
  });

  it("cuts a long title at two hundred characters", () => {
    const feed = parseStatusFeed(feedOf([entry({ title: "t".repeat(500) })])) as StatusFeed;

    expect(feed.entries[0].title).toBe("t".repeat(200));
  });

  it("removes a NUL and a lone surrogate from what a page wrote", () => {
    const feed = parseStatusFeed(
      feedOf([entry({ title: "Bad\u0000title", content: "Half \ud800 pair" })]),
    ) as StatusFeed;

    expect(feed.entries[0].title).toBe("Badtitle");
    expect(feed.entries[0].text).toBe("Half \ufffd pair");
  });

  it("does not end an entry at the closing tag that a CDATA section contains", () => {
    const xml = feedOf([
      `<entry><published>2031-04-12T09:30:00Z</published><link href="https://status.acme.com/incidents/abc123"/><title>First</title>
        <content type="html"><![CDATA[<p>The feed ends with </entry> in our XML.</p>]]></content></entry>`,
      entry({ title: "Second" }),
    ]);

    const feed = parseStatusFeed(xml) as StatusFeed;
    expect(feed.entries.map((it) => it.title)).toEqual(["First", "Second"]);
    // The text of the page is read as a browser reads it: the closing tag is no text.
    expect(feed.entries[0].text).toBe("The feed ends with in our XML.");
  });

  it("does not read a tag whose name only begins like the one asked for", () => {
    const xml = feedOf([
      `<entry><published>2031-04-12T09:30:00Z</published><titlefoo>Nope</titlefoo><link href="https://status.acme.com/incidents/abc123"/><title>Right</title><contentious>Nope</contentious><content>Yes</content></entry>`,
    ]);

    const [only] = (parseStatusFeed(xml) as StatusFeed).entries;
    expect(only.title).toBe("Right");
    expect(only.text).toBe("Yes");
  });

  it("reads at most two hundred entries", () => {
    const entries = Array.from({ length: 250 }, () => entry());

    expect((parseStatusFeed(feedOf(entries)) as StatusFeed).entries).toHaveLength(200);
  });

  it("reads a feed with no entry, and gives the name from the head only", () => {
    expect(parseStatusFeed(feedOf([]))).toEqual({ name: "Acme Status", entries: [] });
    const xml = feedOf([entry({ title: "Not the name" })], "Head title");
    expect((parseStatusFeed(xml) as StatusFeed).name).toBe("Head title");
  });

  it("names a feed without a title by an empty name", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><published>2031-04-12T09:30:00Z</published><title>Only the entry has one</title></entry></feed>`;

    expect((parseStatusFeed(xml) as StatusFeed).name).toBe("");
  });

  it("takes the name of the feed from its head only, never from the title of an entry", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">${entry({ title: "First" })}${entry({ title: "Second" })}</feed>`;

    expect((parseStatusFeed(xml) as StatusFeed).name).toBe("");
  });

  it("drops the words Incident History from the end of the name of the feed, in any case", () => {
    expect((parseStatusFeed(feedOf([], "Acme - incident history")) as StatusFeed).name).toBe(
      "Acme",
    );
    expect((parseStatusFeed(feedOf([], "Acme Status")) as StatusFeed).name).toBe("Acme Status");
    expect((parseStatusFeed(feedOf([], "Incident History")) as StatusFeed).name).toBe("");
  });

  it.each([
    ["Acme \u2013 Incident History", "Acme"],
    ["Acme \u2014 Incident History", "Acme"],
    ["Acme: Incident History", "Acme"],
    ["Acme | Incident History", "Acme"],
    ["Acme-Incident History", "Acme"],
    ["Acme Incident History Portal", "Acme Incident History Portal"],
  ])("reads the name of the feed %j as %j", (title, name) => {
    expect((parseStatusFeed(feedOf([], title)) as StatusFeed).name).toBe(name);
  });

  it("accepts a byte order mark, a comment and an XML declaration before the root", () => {
    const xml = `\uFEFF<?xml version="1.0"?>\n<!-- generated -->\n<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title></feed>`;

    expect(parseStatusFeed(xml)).toEqual({ name: "T", entries: [] });
  });

  it("accepts processing instructions and comments of any number before the root", () => {
    const xml = `<?xml version="1.0"?>\n<?xml-stylesheet type="text/xsl" href="feed.xsl"?>\n<!-- one -->\n<!-- two -->\n<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title></feed>`;

    expect(parseStatusFeed(xml)).toEqual({ name: "T", entries: [] });
  });

  it.each([
    [
      "an RSS document",
      `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title></channel></rss>`,
    ],
    [
      "an HTML page",
      "<!DOCTYPE html><html><head><title>Not found</title></head><body>No.</body></html>",
    ],
    ["an empty answer", ""],
    ["text", "Service unavailable"],
    ["a JSON document", `{"feed": []}`],
    ["a feed that is not the root", `<html><feed></feed></html>`],
    ["a root that only begins like feed", `<feeds><title>T</title></feeds>`],
    ["another root that begins with feed", `<feedback><title>T</title></feedback>`],
    ["a comment that is never closed", `<!-- <feed></feed>`],
    ["a comment that is not one", `<!--><feed></feed>`],
    ["a processing instruction that is never closed after white space", ` <?xml version="1.0"`],
    ["a comment that is never closed after white space", `  <!-- never closed`],
    ["a processing instruction that is never closed", `<?xml version="1.0" <feed></feed>`],
  ])("gives nothing for %s", (_name, body) => {
    expect(parseStatusFeed(body)).toBeNull();
  });

  it("reads the entries before one that is never closed, and not that one", () => {
    const xml = feedOf([
      entry({ title: "Complete" }),
      "<entry><published>2031-04-12T09:30:00Z</published><title>Cut off",
    ]);

    expect((parseStatusFeed(xml) as StatusFeed).entries.map((it) => it.title)).toEqual([
      "Complete",
    ]);
  });

  it("gives no entry for a CDATA section that is never closed, and does not hang", () => {
    const xml = feedOf([
      `<entry><published>2031-04-12T09:30:00Z</published><title>T</title><content><![CDATA[<p>never closed</content></entry>`,
    ]);

    expect((parseStatusFeed(xml) as StatusFeed).entries).toEqual([]);
  });

  it("finds the end of a title that holds a lone <", () => {
    const feed = parseStatusFeed(feedOf([entry({ title: "x <" })])) as StatusFeed;

    expect(feed.entries[0].title).toBe("x <");
  });
});

describe("a feed made to be slow", () => {
  const LIMIT_MS = 2000;
  const entryWith = (inner: string): string =>
    feedOf([`<entry><published>2031-04-12T09:30:00Z</published>${inner}</entry>`]);

  it.each([
    ["comments in a row before the root", () => "<!---->".repeat(100_000) + "x"],
    ["links that are never closed", () => entryWith("<link ".repeat(100_000))],
    [
      "tags that are never closed in a text",
      () => entryWith(`<content>${"&lt;a".repeat(200_000)}</content>`),
    ],
    [
      "a label that is white space with a letter in it",
      () =>
        entryWith(`<content>&lt;strong&gt;${" ".repeat(100_000)}a${" ".repeat(100_000)}</content>`),
    ],
  ])("reads %s within a short time", (_name, build) => {
    const xml = build();
    const startedAt = performance.now();

    parseStatusFeed(xml);

    expect(performance.now() - startedAt).toBeLessThan(LIMIT_MS);
  });
});

describe("statusRecords", () => {
  const incident = (id: string | null, day: string, title = `Incident ${day}`): StatusEntry => ({
    id,
    title,
    day,
    text: `Resolved - text of ${title}.`,
    maintenance: false,
  });
  const maintenance = (day: string): StatusEntry => ({
    id: "maint0001",
    title: "Scheduled Maintenance",
    day,
    text: "Completed - done.",
    maintenance: true,
  });
  const feed = (entries: StatusEntry[], name = "Acme Status"): StatusFeed => ({ name, entries });
  const ask = (given: StatusFeed, input: { cutoff?: string; now?: Date } = {}) =>
    statusRecords(given, { host: "status.acme.com", cutoff: CUTOFF, now: NOW, ...input });

  it("gives a summary and the three newest incidents of the window", () => {
    const { records, omitted } = ask(
      feed([
        incident("i1", "2031-04-12"),
        incident("i2", "2031-03-01"),
        maintenance("2031-02-20"),
        incident("i3", "2030-12-24"),
        incident("i4", "2030-09-09"),
        incident("i5", "2030-06-30"),
      ]),
    );

    expect(records.map((record) => record.url)).toEqual([
      "https://status.acme.com/history",
      "https://status.acme.com/incidents/i1",
      "https://status.acme.com/incidents/i2",
      "https://status.acme.com/incidents/i3",
    ]);
    expect(omitted).toEqual({ more: 2 });
    expect(MAX_RECORDS.statuspage).toBe(4);
  });

  it("writes the summary: the entries of the feed, the incidents of the window and the maintenance", () => {
    const [summary] = ask(
      feed([
        incident("i1", "2031-04-12"),
        incident("i2", "2031-03-01"),
        maintenance("2031-02-20"),
        incident("i3", "2030-06-30"),
      ]),
    ).records;

    expect(summary).toEqual({
      url: "https://status.acme.com/history",
      title: "Acme Status: incident history",
      text: "Status page of Acme Status (status.acme.com). Incident history feed: 4 entries, from 2030-06-30 to 2031-04-12. Incidents since 2030-04-20: 3. Scheduled maintenance: 1. The feed lists only the latest entries, so earlier incidents are not counted.",
      publishedAt: "2031-04-12",
    });
  });

  it("does not say the feed lists only the latest entries when it reaches back past the window", () => {
    const [summary] = ask(
      feed([incident("i1", "2031-04-12"), incident("i2", "2029-01-01")]),
    ).records;

    expect(summary.text).toBe(
      "Status page of Acme Status (status.acme.com). Incident history feed: 2 entries, from 2029-01-01 to 2031-04-12. Incidents since 2030-04-20: 1.",
    );
  });

  it("counts an entry of the day of the cutoff as inside the window", () => {
    const { records } = ask(feed([incident("i1", CUTOFF), incident("i2", "2030-04-19")]));

    expect(records.map((record) => record.url)).toContain("https://status.acme.com/incidents/i1");
    expect(records.map((record) => record.url)).not.toContain(
      "https://status.acme.com/incidents/i2",
    );
  });

  it("writes an incident as a source: the page of the incident, its words, its day", () => {
    const records = ask(
      feed([
        { ...incident("abc123", "2031-04-12", "Elevated errors"), text: "Resolved - 90 minutes." },
      ]),
    ).records;

    expect(records[1]).toEqual({
      url: "https://status.acme.com/incidents/abc123",
      title: "Elevated errors",
      text: "Status page of Acme Status (status.acme.com). Incident: Elevated errors. Date: 2031-04-12. Updates: Resolved - 90 minutes.",
      publishedAt: "2031-04-12",
    });
  });

  it("builds the address from the host that was asked, never from a host that the feed named", () => {
    const records = ask(feed([incident("abc123", "2031-04-12")]), {}).records;

    expect(new Set(records.map((record) => new URL(record.url).host))).toEqual(
      new Set(["status.acme.com"]),
    );
  });

  it("lists the newest first whatever the order of the feed, and keeps the order of the feed for a day", () => {
    const { records } = ask(
      feed([
        incident("a", "2031-01-01"),
        incident("b", "2031-04-01"),
        incident("c", "2031-04-01"),
        incident("d", "2031-02-01"),
      ]),
    );

    expect(records.slice(1).map((record) => record.url.split("/").pop())).toEqual(["b", "c", "d"]);
    expect(records[0].publishedAt).toBe("2031-04-01");
  });

  it("counts the incidents before the cutoff as old and leaves them out", () => {
    const { records, omitted } = ask(
      feed([
        incident("i1", "2031-04-12"),
        incident("i2", "2030-04-19"),
        incident("i3", "2029-01-01"),
      ]),
    );

    expect(records).toHaveLength(2);
    expect(omitted).toEqual({ old: 2 });
  });

  it("gives no record when the window holds no incident, and counts what was before it", () => {
    expect(ask(feed([incident("i1", "2029-01-01"), maintenance("2031-04-01")]))).toEqual({
      records: [],
      omitted: { old: 1 },
    });
    expect(ask(feed([]))).toEqual({ records: [], omitted: {} });
  });

  it("leaves out an entry that is dated after today", () => {
    const { records } = ask(
      feed([
        incident("future", "2031-04-21"),
        incident("today", "2031-04-20"),
        incident("past", "2031-04-19"),
      ]),
    );

    expect(records.slice(1).map((record) => record.url.split("/").pop())).toEqual([
      "today",
      "past",
    ]);
    expect((records[0].text.match(/Incidents since 2030-04-20: (\d+)/) ?? [])[1]).toBe("2");
  });

  it("counts an incident without an id in the summary but gives it no record of its own", () => {
    const { records, omitted } = ask(
      feed([
        incident(null, "2031-04-12"),
        incident("i2", "2031-04-11"),
        incident("i3", "2031-04-10"),
      ]),
    );

    expect(records.slice(1).map((record) => record.url.split("/").pop())).toEqual(["i2", "i3"]);
    expect(records[0].text).toContain("Incidents since 2030-04-20: 3.");
    expect(omitted).toEqual({});
  });

  it("gives an incident once when the feed lists its id twice", () => {
    const { records } = ask(feed([incident("same", "2031-04-12"), incident("same", "2031-04-11")]));

    expect(records.map((record) => record.url)).toEqual([
      "https://status.acme.com/history",
      "https://status.acme.com/incidents/same",
    ]);
  });

  it("keeps the newest of the entries that share an id, whatever the order of the feed", () => {
    const { records } = ask(
      feed([
        incident("same", "2031-04-11", "Old title"),
        incident("same", "2031-04-12", "New title"),
      ]),
    );

    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({ title: "New title", publishedAt: "2031-04-12" });
  });

  it("gives each incident its own day as the day it was published, and the summary the newest", () => {
    const { records } = ask(feed([incident("a", "2031-04-12"), incident("b", "2031-03-01")]));

    expect(records.map((record) => record.publishedAt)).toEqual([
      "2031-04-12",
      "2031-04-12",
      "2031-03-01",
    ]);
  });

  it("says the feed lists only the latest entries when its oldest entry is on the day of the cutoff", () => {
    const { records } = ask(feed([incident("i1", "2031-04-12"), incident("i2", CUTOFF)]));

    expect(records[0].text).toContain("The feed lists only the latest entries");
  });

  it("has no limit on the day when it is given no cutoff, and says so", () => {
    const { records, omitted } = ask(
      feed([incident("i1", "2031-04-12"), incident("i2", "2010-01-01")]),
      {
        cutoff: undefined,
      },
    );

    expect(records).toHaveLength(3);
    expect(omitted).toEqual({});
    expect(records[0].text).toContain("Incidents in the feed: 2.");
    expect(records[0].text).not.toContain("only the latest");
  });

  it("names the page by its host when the feed has no name", () => {
    const { records } = ask(feed([incident("i1", "2031-04-12")], ""));

    expect(records[0].title).toBe("status.acme.com: incident history");
    expect(records[0].text.startsWith("Status page of status.acme.com.")).toBe(true);
    expect(records[1].text.startsWith("Status page of status.acme.com. Incident:")).toBe(true);
  });

  it("titles an incident that has no title by its day", () => {
    const { records } = ask(feed([incident("i1", "2031-04-12", "")]));

    expect(records[1].title).toBe("Incident of 2031-04-12");
    expect(records[1].text).toBe(
      "Status page of Acme Status (status.acme.com). Date: 2031-04-12. Updates: Resolved - text of.",
    );
  });

  it("leaves out an empty field instead of writing an empty sentence", () => {
    const { records } = ask(feed([{ ...incident("i1", "2031-04-12", "Title"), text: "" }]));

    expect(records[1].text).toBe(
      "Status page of Acme Status (status.acme.com). Incident: Title. Date: 2031-04-12.",
    );
  });

  it("says entry for one entry and entries for several", () => {
    const one = ask(feed([incident("i1", "2031-04-12")])).records[0].text;
    const two = ask(feed([incident("i1", "2031-04-12"), incident("i2", "2031-04-11")])).records[0]
      .text;

    expect(one).toContain("Incident history feed: 1 entry, from 2031-04-12 to 2031-04-12.");
    expect(two).toContain("Incident history feed: 2 entries, from 2031-04-11 to 2031-04-12.");
  });
});
