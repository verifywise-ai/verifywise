import { screen, render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material";
import { describe, expect, it, vi } from "vitest";

// The border of a badge is drawn by the classic look only: the phase 1 look is a pill with a dot and
// no border, so this file runs the badge in the classic look (read once, when the module loads).
vi.mock("../../../themes/uiStyle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../themes/uiStyle")>()),
  isClassicUi: () => true,
  getUiStyle: () => "classic",
}));

import StatusBadge from "../index";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
}

describe("StatusBadge, classic look", () => {
  it("a border colour overrides the computed border", () => {
    const { unmount } = renderWithTheme(
      <StatusBadge
        label="Official"
        variant="default"
        backgroundColor="#FFFFFF"
        borderColor="#d0d5dd"
      />,
    );
    expect(screen.getByText("Official")).toHaveStyle("border: 1px solid #d0d5dd");
    unmount();

    // Without one, the border is the background a little darker.
    renderWithTheme(<StatusBadge label="Vendor" variant="default" backgroundColor="#FFFFFF" />);
    expect(screen.getByText("Vendor")).toHaveStyle("border: 1px solid #efefef");
  });
});
