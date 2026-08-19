import { AuthImageExtension } from "../AuthImage";

describe("AuthImageExtension", () => {
  it("extends TipTap's image extension with a 'width' attribute", () => {
    const attrs = AuthImageExtension.config.addAttributes!.call({} as any) as any;
    expect(attrs).toHaveProperty("width");
    expect(attrs.width.default).toBeNull();
  });

  it("parses the width attribute from an HTML element", () => {
    const attrs = AuthImageExtension.config.addAttributes!.call({} as any) as any;
    const el = document.createElement("img");
    el.setAttribute("width", "250");
    expect(attrs.width.parseHTML(el)).toBe(250);
  });

  it("returns null when the width attribute is absent from the element", () => {
    const attrs = AuthImageExtension.config.addAttributes!.call({} as any) as any;
    const el = document.createElement("img");
    expect(attrs.width.parseHTML(el)).toBeNull();
  });

  it("renders the width attribute back onto HTML when present", () => {
    const attrs = AuthImageExtension.config.addAttributes!.call({} as any) as any;
    expect(attrs.width.renderHTML({ width: 300 })).toEqual({ width: 300 });
  });

  it("omits the width attribute from rendered HTML when not set", () => {
    const attrs = AuthImageExtension.config.addAttributes!.call({} as any) as any;
    expect(attrs.width.renderHTML({ width: null })).toEqual({});
  });

  it("registers a React node view renderer", () => {
    const nodeView = AuthImageExtension.config.addNodeView!.call({} as any);
    expect(typeof nodeView).toBe("function");
  });

  it("is named after the base TipTap image extension", () => {
    expect(AuthImageExtension.name).toBe("image");
  });
});
