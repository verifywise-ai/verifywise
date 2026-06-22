import { describe, it, expect } from "vitest";
import { Theme } from "@mui/material/styles";
import {
  getInputStyles,
  getSelectStyles,
  getDatePickerStyles,
  getAutocompleteStyles,
  getSearchBoxStyles,
  getInputCursor,
} from "../inputStyles";

const mockTheme = {
  palette: {
    border: { dark: "#d0d5dd" },
    primary: { main: "#13715B" },
    error: { main: "#D32F2F" },
    status: { error: { border: "#F5B8B8" } },
    grey: { 50: "#F9FAFB", 300: "#D1D5DB" },
  },
  shape: { borderRadius: 2 },
} as unknown as Theme;

describe("getInputStyles", () => {
  it("returns default styles without options", () => {
    const styles = getInputStyles(mockTheme);
    expect(styles).toHaveProperty("& fieldset");
    expect(styles["& fieldset"]).toMatchObject({
      borderColor: "#d0d5dd",
      borderRadius: 2,
    });
  });

  it("applies error border when hasError is true", () => {
    const styles = getInputStyles(mockTheme, { hasError: true });
    expect(styles["& fieldset"]).toMatchObject({
      borderColor: "#F5B8B8",
    });
  });

  it("applies custom hoverBorderColor", () => {
    const styles = getInputStyles(mockTheme, {
      hoverBorderColor: "#FF0000",
    });
    expect(styles).toHaveProperty(
      "&:not(:has(.Mui-disabled)):not(:has(.Mui-focused)) .MuiOutlinedInput-root:hover fieldset",
    );
  });

  it("skips hover styles when disableHover is true", () => {
    const styles = getInputStyles(mockTheme, { disableHover: true });
    expect(styles).not.toHaveProperty(
      "&:not(:has(.Mui-disabled)):not(:has(.Mui-focused)) .MuiOutlinedInput-root:hover fieldset",
    );
  });

  it("skips focus ring when disableFocusRing is true", () => {
    const styles = getInputStyles(mockTheme, { disableFocusRing: true });
    const fieldset = styles["& .MuiOutlinedInput-root.Mui-focused fieldset"] as Record<
      string,
      unknown
    >;
    expect(fieldset).not.toHaveProperty("boxShadow");
  });

  it("includes disabled state styles", () => {
    const styles = getInputStyles(mockTheme);
    expect(styles).toHaveProperty("& .MuiOutlinedInput-root.Mui-disabled");
  });

  it("applies error border in hover when hasError is true", () => {
    const styles = getInputStyles(mockTheme, { hasError: true });
    const hoverKey =
      "&:not(:has(.Mui-disabled)):not(:has(.Mui-focused)) .MuiOutlinedInput-root:hover fieldset" as const;
    expect(styles[hoverKey]).toMatchObject({
      borderColor: "#F5B8B8",
    });
  });
});

describe("getSelectStyles", () => {
  it("returns default select styles", () => {
    const styles = getSelectStyles(mockTheme);
    expect(styles).toHaveProperty("& .MuiOutlinedInput-notchedOutline");
    expect(styles["& .MuiOutlinedInput-notchedOutline"]).toMatchObject({
      borderColor: "#d0d5dd",
      borderRadius: 2,
    });
  });

  it("applies error border when hasError is true", () => {
    const styles = getSelectStyles(mockTheme, { hasError: true });
    expect(styles["& .MuiOutlinedInput-notchedOutline"]).toMatchObject({
      borderColor: "#F5B8B8",
    });
  });

  it("skips hover styles when disableHover is true", () => {
    const styles = getSelectStyles(mockTheme, { disableHover: true });
    expect(styles).not.toHaveProperty(
      "&:not(.Mui-disabled):hover .MuiOutlinedInput-notchedOutline",
    );
  });

  it("includes disabled state styles", () => {
    const styles = getSelectStyles(mockTheme);
    expect(styles).toHaveProperty("&.Mui-disabled");
  });

  it("applies custom focusBorderColor", () => {
    const styles = getSelectStyles(mockTheme, {
      focusBorderColor: "#00FF00",
    });
    expect(styles["&.Mui-focused .MuiOutlinedInput-notchedOutline"]).toMatchObject({
      borderColor: "#00FF00 !important",
    });
  });
});

describe("getDatePickerStyles", () => {
  it("delegates to getInputStyles", () => {
    const styles = getDatePickerStyles(mockTheme);
    expect(styles).toHaveProperty("& fieldset");
    expect(styles["& fieldset"]).toMatchObject({
      borderColor: "#d0d5dd",
    });
  });

  it("forwards hasError option", () => {
    const styles = getDatePickerStyles(mockTheme, { hasError: true });
    expect(styles["& fieldset"]).toMatchObject({
      borderColor: "#F5B8B8",
    });
  });
});

describe("getAutocompleteStyles", () => {
  it("returns default autocomplete styles", () => {
    const styles = getAutocompleteStyles(mockTheme);
    expect(styles).toHaveProperty("& .MuiOutlinedInput-root");
    const root = styles["& .MuiOutlinedInput-root"] as Record<string, unknown>;
    expect(root).toHaveProperty("& fieldset");
  });

  it("applies error border when hasError is true", () => {
    const styles = getAutocompleteStyles(mockTheme, { hasError: true });
    const root = styles["& .MuiOutlinedInput-root"] as Record<string, unknown>;
    expect((root["& fieldset"] as Record<string, unknown>).borderColor).toBe("#F5B8B8");
  });

  it("skips hover when disableHover is true", () => {
    const styles = getAutocompleteStyles(mockTheme, {
      disableHover: true,
    });
    const root = styles["& .MuiOutlinedInput-root"] as Record<string, unknown>;
    expect(root).not.toHaveProperty("&:not(.Mui-disabled):hover fieldset");
  });

  it("includes disabled state", () => {
    const styles = getAutocompleteStyles(mockTheme);
    const root = styles["& .MuiOutlinedInput-root"] as Record<string, unknown>;
    expect(root).toHaveProperty("&.Mui-disabled");
  });
});

describe("getSearchBoxStyles", () => {
  it("returns default search box styles", () => {
    const styles = getSearchBoxStyles(mockTheme);
    expect(styles).toHaveProperty("border", "1px solid #d0d5dd");
    expect(styles).toHaveProperty("borderRadius", 2);
  });

  it("skips hover when disableHover is true", () => {
    const styles = getSearchBoxStyles(mockTheme, { disableHover: true });
    expect(styles).not.toHaveProperty("&:hover");
  });

  it("skips focus ring when disableFocusRing is true", () => {
    const styles = getSearchBoxStyles(mockTheme, {
      disableFocusRing: true,
    });
    const focusStyles = styles["&:focus-within"] as Record<string, unknown>;
    expect(focusStyles).not.toHaveProperty("boxShadow");
  });
});

describe("getInputCursor", () => {
  it('returns "pointer" for select type', () => {
    expect(getInputCursor("select")).toBe("pointer");
  });

  it('returns "pointer" for datepicker type', () => {
    expect(getInputCursor("datepicker")).toBe("pointer");
  });

  it('returns "pointer" for button type', () => {
    expect(getInputCursor("button")).toBe("pointer");
  });

  it('returns "text" for text type', () => {
    expect(getInputCursor("text")).toBe("text");
  });

  it('returns "text" as default for unknown type', () => {
    expect(getInputCursor("unknown" as any)).toBe("text");
  });
});
