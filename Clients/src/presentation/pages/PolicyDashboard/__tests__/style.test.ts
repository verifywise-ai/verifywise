import { searchBoxStyle, inputStyle } from "../style";

const fakeTheme = {
  palette: { border: { dark: "#d0d5dd" } },
  shape: { borderRadius: 4 },
} as any;

describe("searchBoxStyle", () => {
  it("expands the box and left-aligns content when the search bar is visible", () => {
    const styleFn = searchBoxStyle(true);
    const result = (styleFn as (theme: any) => Record<string, unknown>)(fakeTheme);
    expect(result.justifyContent).toBe("flex-start");
    expect(result.width).toBe("300px");
    expect(result.p).toBe("6px 8px");
  });

  it("collapses the box and centers content when the search bar is hidden", () => {
    const styleFn = searchBoxStyle(false);
    const result = (styleFn as (theme: any) => Record<string, unknown>)(fakeTheme);
    expect(result.justifyContent).toBe("center");
    expect(result.width).toBe("34px");
    expect(result.p).toBe("0");
  });

  it("includes the theme border color in the border style", () => {
    const styleFn = searchBoxStyle(true);
    const result = (styleFn as (theme: any) => Record<string, unknown>)(fakeTheme);
    expect(result.border).toBe("1px solid #d0d5dd");
  });
});

describe("inputStyle", () => {
  it("is fully opaque when the search bar is visible", () => {
    expect((inputStyle(true) as Record<string, unknown>).opacity).toBe(1);
  });

  it("is transparent when the search bar is hidden", () => {
    expect((inputStyle(false) as Record<string, unknown>).opacity).toBe(0);
  });
});
