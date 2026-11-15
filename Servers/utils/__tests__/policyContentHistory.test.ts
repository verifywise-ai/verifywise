import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { htmlExcerpt, getEntityConfig } from "../../config/changeHistory.config";
import { trackEntityChanges } from "../changeHistory.base.utils";

describe("htmlExcerpt", () => {
  it("strips tags, decodes basic entities and collapses whitespace", () => {
    expect(
      htmlExcerpt("<h1>Data  &amp; AI</h1>\n<p>Use&nbsp;it &lt;well&gt; &quot;now&quot;</p>"),
    ).toBe('Data & AI Use it <well> "now"');
  });

  it("strips nested tags until none is left and keeps encoded text as text", () => {
    expect(htmlExcerpt("<scr<script>ipt>x</p>")).not.toMatch(/<[a-z]/i);
    expect(htmlExcerpt("<p>score &lt; 5 and risk &gt; 3</p>")).toBe("score < 5 and risk > 3");
    expect(htmlExcerpt("1 &amp;lt;b&amp;gt; 2")).toBe("1 &lt;b&gt; 2");
    const started = Date.now();
    expect(htmlExcerpt("<".repeat(200_000) + "x")).toBe(`${"<".repeat(120)}…`);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("cuts to 120 characters with a trailing ellipsis", () => {
    const out = htmlExcerpt(`<p>${"a".repeat(200)}</p>`);
    expect(out).toBe(`${"a".repeat(120)}…`);
    expect(htmlExcerpt("b".repeat(120))).toBe("b".repeat(120));
  });

  it("keeps a word whole across inline tags but splits at block tags", () => {
    expect(htmlExcerpt("<p>Wo<b>rd</b> and <a href='x'>link</a></p><p>Next</p>a<br>b")).toBe(
      "Word and link Next a b",
    );
  });

  it("is - for empty text", () => {
    expect(htmlExcerpt("<p> </p>")).toBe("-");
  });
});

describe("policy content history", () => {
  it("tracks content_html under the label Content", () => {
    const config = getEntityConfig("policy");
    expect(config.fieldsToTrack).toContain("content_html");
    expect(config.fieldLabels.content_html).toBe("Content");
  });

  it("records an edit as an excerpt of old and new text", async () => {
    const changes = await trackEntityChanges(
      "policy",
      { content_html: "<p>Old text</p>" },
      { content_html: "<p>New <b>text</b></p>" },
    );
    expect(changes).toEqual([{ fieldName: "Content", oldValue: "Old text", newValue: "New text" }]);
  });

  it("records nothing when the content is absent or equal", async () => {
    expect(await trackEntityChanges("policy", { content_html: "<p>x</p>" }, {})).toEqual([]);
    expect(
      await trackEntityChanges(
        "policy",
        { content_html: "<p>x</p>" },
        { content_html: "<p>x</p> " },
      ),
    ).toEqual([]);
    expect(
      await trackEntityChanges("policy", { content_html: null }, { content_html: "" }),
    ).toEqual([]);
  });

  it("records an edit past the excerpt even though both excerpts are equal", async () => {
    const head = "a".repeat(130);
    const changes = await trackEntityChanges(
      "policy",
      { content_html: `<p>${head}1</p>` },
      { content_html: `<p>${head}2</p>` },
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].oldValue).toBe(changes[0].newValue);
  });
});
