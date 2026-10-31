/**
 * The XML scanner of the VRDB connectors (Ruling 9 of the M1 plan): it reads a list of any size in
 * time in proportion to its size, yields the elements of one name with their subtrees, and never
 * expands an entity a document declares.
 */
import { type XmlElement, childText, childTexts, decodeEntities, scanElements } from "../xmlScan";

/** The elements of the name, and what the scan reported. */
function scan(
  xml: string,
  name: string,
): { elements: XmlElement[]; errors: number; root: string | null } {
  const elements: XmlElement[] = [];
  const { errors, root } = scanElements(xml, name, (element) => elements.push(element));
  return { elements, errors, root };
}

describe("scanElements", () => {
  it("yields every element of the name with its subtree, in order", () => {
    const { elements, errors } = scan(
      `<list><item id="1"><name>Acme</name><alias><name>Acme Co</name></alias></item>` +
        `<other/><item id="2"><name>Beta</name></item></list>`,
      "item",
    );

    expect(errors).toBe(0);
    expect(elements.map((element) => element.attributes.id)).toEqual(["1", "2"]);
    expect(elements[0]).toEqual({
      name: "item",
      attributes: { id: "1" },
      text: "",
      children: [
        { name: "name", attributes: {}, text: "Acme", children: [] },
        {
          name: "alias",
          attributes: {},
          text: "",
          children: [{ name: "name", attributes: {}, text: "Acme Co", children: [] }],
        },
      ],
    });
  });

  it("decodes the five entities and numeric references, and leaves an unknown one as written", () => {
    const { elements } = scan(
      `<r><item a="&quot;q&quot;">&lt;b&gt; &amp; &apos;s&apos; &#65;&#x42; &nbsp; &#xZZ;</item></r>`,
      "item",
    );

    expect(elements[0].attributes.a).toBe('"q"');
    expect(elements[0].text).toBe("<b> & 's' AB &nbsp; &#xZZ;");
  });

  it("reads CDATA as text", () => {
    const { elements } = scan(`<r><item>a <![CDATA[<b> & &amp;]]> c</item></r>`, "item");

    expect(elements[0].text).toBe("a <b> & &amp; c");
  });

  it("drops namespace prefixes", () => {
    const { elements, root } = scan(
      `<ns:list xmlns:ns="urn:x" xmlns="urn:y"><ns:item ns:id="7"><ns:name>Acme</ns:name></ns:item></ns:list>`,
      "item",
    );

    expect(root).toBe("list");
    expect(elements[0]).toEqual({
      name: "item",
      attributes: { id: "7" },
      text: "",
      children: [{ name: "name", attributes: {}, text: "Acme", children: [] }],
    });
  });

  it("reads self-closing elements and both quotes of attributes", () => {
    const { elements } = scan(`<r><item a='1' b="2" c = 'x"y'/><item/></r>`, "item");

    expect(elements).toEqual([
      { name: "item", attributes: { a: "1", b: "2", c: 'x"y' }, text: "", children: [] },
      { name: "item", attributes: {}, text: "", children: [] },
    ]);
  });

  it("skips comments and processing instructions", () => {
    const { elements, errors, root } = scan(
      `<?xml version="1.0"?><!-- a <item>commented</item> --><?style x?>` +
        `<r><item>a<!-- b -->c<?pi d?></item></r>`,
      "item",
    );

    expect(errors).toBe(0);
    expect(root).toBe("r");
    expect(elements.map((element) => element.text)).toEqual(["ac"]);
  });

  it("refuses a DOCTYPE with an internal subset (no entity expansion)", () => {
    const { elements, errors } = scan(
      `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x "boom">]><r><item>&x;</item></r>`,
      "item",
    );

    expect(errors).toBe(1);
    expect(elements).toEqual([]);
  });

  it("reads past a DOCTYPE without an internal subset", () => {
    const { elements, errors } = scan(`<!DOCTYPE r SYSTEM "r.dtd"><r><item>a</item></r>`, "item");

    expect(errors).toBe(0);
    expect(elements).toHaveLength(1);
  });

  it("reports the root element's name", () => {
    expect(scan(`<?xml version="1.0"?>\n<!-- c --><Export><x/></Export>`, "item").root).toBe(
      "Export",
    );
    expect(scan("", "item").root).toBeNull();
  });

  it("reports the root element's attributes, without namespace declarations", () => {
    const result = scanElements(
      `<?xml version="1.0"?><export xmlns="urn:x" generationDate="2026-10-23T15:10:13" globalFileId="7"><item/></export>`,
      "item",
      () => undefined,
    );

    expect(result.rootAttributes).toEqual({
      generationDate: "2026-10-23T15:10:13",
      globalFileId: "7",
    });
    expect(scanElements("", "item", () => undefined).rootAttributes).toEqual({});
  });

  it("counts an unclosed element as an error", () => {
    expect(scan(`<r><item><name>A</name>`, "item")).toEqual({
      elements: [],
      errors: 1,
      root: "r",
    });
    const crossed = scan(`<r><item><name>A</item></name><item>B</item></r>`, "item");
    expect(crossed.errors).toBe(1);
    expect(crossed.elements.map((element) => element.text)).toEqual(["B"]);
  });

  it("counts a document whose root is never closed as an error: it was cut short", () => {
    const cut = scan(`<r><head>x</head><item>A</item><item>B</item>`, "item");

    expect(cut.errors).toBe(1);
    // The elements read before the cut are still given; the error is what refuses the copy.
    expect(cut.elements.map((element) => element.text)).toEqual(["A", "B"]);
    expect(scan(`<r><head>x</head><item>A</item></r>`, "item").errors).toBe(0);
    expect(scan(`<r/>`, "item").errors).toBe(0);
  });

  it("keeps an attribute named __proto__ as an ordinary attribute", () => {
    const { elements } = scan(`<r><item __proto__="x" constructor="y"/></r>`, "item");

    expect(Object.getPrototypeOf(elements[0].attributes)).toBeNull();
    expect(elements[0].attributes.__proto__).toBe("x");
    expect(elements[0].attributes.constructor).toBe("y");
  });

  it("200,000 '<' characters scan in under 200 ms", () => {
    for (const xml of ["<".repeat(200_000), `<r><item>${"<".repeat(200_000)}</item></r>`]) {
      const startedAt = performance.now();
      scan(xml, "item");
      expect(performance.now() - startedAt).toBeLessThan(200);
    }
  });

  it("200,000 '&' characters and an unclosed attribute scan in under 200 ms", () => {
    const xmls = [
      `<r><item>${"&".repeat(200_000)};</item></r>`,
      `<r><item a="${"<item ".repeat(40_000)}`,
      `<r>${"<item a='1' ".repeat(40_000)}`,
    ];
    for (const xml of xmls) {
      const startedAt = performance.now();
      scan(xml, "item");
      expect(performance.now() - startedAt).toBeLessThan(200);
    }
  });

  it("50,000 elements scan in under a second", () => {
    const xml = `<list>${'<item id="1"><name>A &amp; B</name><v>x</v></item>'.repeat(50_000)}</list>`;
    const startedAt = performance.now();
    const { elements, errors } = scan(xml, "item");
    expect(performance.now() - startedAt).toBeLessThan(1000);
    expect(elements).toHaveLength(50_000);
    expect(errors).toBe(0);
  });
});

describe("childText and childTexts", () => {
  const { elements } = scan(
    `<r><item><names><name> Acme </name><name>Acme Co</name><name/></names>` +
      `<names><name>Acme Ltd</name></names></item></r>`,
    "item",
  );

  it("gives the first text on the path that is not empty, trimmed, or null", () => {
    expect(childText(elements[0], ["names", "name"])).toBe("Acme");
    expect(childText(elements[0], ["names", "missing"])).toBeNull();
  });

  it("gives every non-empty text on the path, in order", () => {
    expect(childTexts(elements[0], ["names", "name"])).toEqual(["Acme", "Acme Co", "Acme Ltd"]);
  });
});

describe("decodeEntities", () => {
  it("decodes once: an escaped reference stays a reference", () => {
    expect(decodeEntities("&amp;lt; &#38;amp;")).toBe("&lt; &amp;");
  });

  it("leaves a reference with a character that is no digit as written", () => {
    const text = `&#65${String.fromCharCode(0x10)}; &#x4${String.fromCharCode(0x01)};`;
    expect(decodeEntities(text)).toBe(text);
  });

  it("leaves a reference to no character as written", () => {
    expect(decodeEntities("&#0; &#xD800; &#x110000;")).toBe("&#0; &#xD800; &#x110000;");
  });
});
