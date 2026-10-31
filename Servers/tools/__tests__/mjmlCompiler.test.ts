import { compileMjmlToHtml } from "../mjmlCompiler";

const template = (body: string) =>
  `<mjml><mj-body><mj-section><mj-column><mj-text>${body}</mj-text></mj-column></mj-section></mj-body></mjml>`;

describe("compileMjmlToHtml", () => {
  it("fills every placeholder", async () => {
    const html = await compileMjmlToHtml(template("{{a}} and {{b}} and {{a}}"), {
      a: "one",
      b: "two",
    });
    expect(html).toContain("one and two and one");
  });

  it("inserts replacement patterns like $& and $' literally", async () => {
    const html = await compileMjmlToHtml(template("[{{name}}] tail"), { name: "Cash$'App $& $$" });
    expect(html).toContain("[Cash$&#39;App $&amp; $$] tail");
  });

  it("escapes plain values so user text cannot inject markup", async () => {
    const html = await compileMjmlToHtml(template("{{use_case_title}}"), {
      use_case_title: '<a href="https://evil.example">Review concerns</a>',
    });
    expect(html).toContain(
      "&lt;a href=&quot;https://evil.example&quot;&gt;Review concerns&lt;/a&gt;",
    );
    expect(html).not.toContain('<a href="https://evil.example">');
  });

  it("escapes a value inside an attribute", async () => {
    const html = await compileMjmlToHtml(template('<a href="{{url}}">Open</a>'), {
      url: 'https://x.example/?a=1&b=2" onclick="alert(1)',
    });
    expect(html).toContain('href="https://x.example/?a=1&amp;b=2&quot; onclick=&quot;alert(1)"');
  });

  it("inserts keys ending in Html or _html as raw HTML", async () => {
    const html = await compileMjmlToHtml(template("{{buttonHtml}}{{rows_html}}"), {
      buttonHtml: '<a class="btn" href="#">Go</a>',
      rows_html: "<table><tr><td>Row</td></tr></table>",
    });
    expect(html).toContain('<a class="btn" href="#">Go</a>');
    expect(html).toContain("<td>Row</td>");
  });

  it("does not substitute a placeholder that appears inside a value", async () => {
    const html = await compileMjmlToHtml(template("{{name}} {{url}}"), {
      name: "{{url}}",
      url: "https://example.com",
    });
    expect(html).toContain("{{url}} https://example.com");
  });

  it("leaves placeholders without data untouched", async () => {
    const html = await compileMjmlToHtml(template("{{missing}}"), {});
    expect(html).toContain("{{missing}}");
  });
});
