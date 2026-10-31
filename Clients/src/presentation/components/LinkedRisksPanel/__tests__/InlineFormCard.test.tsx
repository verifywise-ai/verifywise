import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material";
import { light } from "../../../themes";
import InlineFormCard, { InlineFormActions } from "../InlineFormCard";

// The app theme is required: the card reads background.alt and border.dark, which MUI's default
// theme does not define.
const wrap = (ui: React.ReactElement) => render(<ThemeProvider theme={light}>{ui}</ThemeProvider>);

describe("InlineFormCard", () => {
  // These forms open between a toolbar and lists, or under a list row, and without a frame they
  // read as part of the list. The frame is the house one: the default border, not the light one,
  // with the 4px radius.
  it("frames its content with the house border and a 4px radius", () => {
    wrap(
      <InlineFormCard title="Link a risk">
        <p>Body</p>
      </InlineFormCard>,
    );

    const card = screen.getByText("Link a risk").parentElement!;
    // The house border of CLAUDE.md, whatever the case the token is written in.
    expect(light.palette.border.dark.toLowerCase()).toBe("#d0d5dd");
    expect(card).toHaveStyle({ borderColor: light.palette.border.dark, borderRadius: "4px" });
  });

  it("shows the title, the description when there is one, and the content", () => {
    wrap(
      <InlineFormCard title="Why dismiss this suggestion?" description="Optional.">
        <p>Body</p>
      </InlineFormCard>,
    );

    expect(screen.getByText("Why dismiss this suggestion?")).toBeInTheDocument();
    expect(screen.getByText("Optional.")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });
});

describe("InlineFormActions", () => {
  // Cancel, then the primary action, on the right: the order of StandardModal's footer.
  it("keeps the order it is given and sits on the right", () => {
    wrap(
      <InlineFormActions>
        <button>Cancel</button>
        <button>Link</button>
      </InlineFormActions>,
    );

    const row = screen.getByRole("button", { name: "Cancel" }).parentElement!;
    expect(Array.from(row.children).map((child) => child.textContent)).toEqual(["Cancel", "Link"]);
    expect(row).toHaveStyle({ justifyContent: "flex-end" });
  });
});
