import { useState } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ImageLightbox from "../ImageLightbox";

const TINY_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

describe("ImageLightbox", () => {
  it("exposes a modal dialog labelled by the image alt text", () => {
    renderWithProviders(
      <ImageLightbox src={TINY_GIF} alt="Architecture diagram" onClose={vi.fn()} />,
    );

    const dialog = screen.getByRole("dialog", { name: "Architecture diagram" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("img", { name: "Architecture diagram" })).toBeInTheDocument();
  });

  it("describes the dialog with the caption when one is provided", () => {
    renderWithProviders(
      <ImageLightbox
        src={TINY_GIF}
        alt="Architecture diagram"
        caption="VerifyWise architecture"
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Architecture diagram" });
    const caption = screen.getByText("VerifyWise architecture");
    expect(dialog).toHaveAttribute("aria-describedby", caption.id);
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <ImageLightbox src={TINY_GIF} alt="Architecture diagram" onClose={onClose} />,
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is activated", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <ImageLightbox src={TINY_GIF} alt="Architecture diagram" onClose={onClose} />,
    );

    await user.click(screen.getByRole("button", { name: "Close image lightbox" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab focus inside the dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <button type="button">Outside</button>
        <ImageLightbox src={TINY_GIF} alt="Architecture diagram" onClose={vi.fn()} />
      </>,
    );

    const dialog = screen.getByRole("dialog", { name: "Architecture diagram" });
    const outside = screen.getByRole("button", { name: "Outside", hidden: true });

    expect(outside.closest("[aria-hidden='true']")).not.toBeNull();

    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(outside).not.toHaveFocus();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("returns focus to the trigger when closed with Escape", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open image
          </button>
          {open && (
            <ImageLightbox
              src={TINY_GIF}
              alt="Architecture diagram"
              onClose={() => setOpen(false)}
            />
          )}
        </>
      );
    }

    renderWithProviders(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open image" });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Architecture diagram" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Architecture diagram" }),
      ).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });
});
