import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { ColorPickerPopover } from "../ColorPickerPopover";

function createMockEditor() {
  const chain: any = {
    focus: vi.fn(() => chain),
    setColor: vi.fn(() => chain),
    unsetColor: vi.fn(() => chain),
    run: vi.fn(),
  };
  return { chain: vi.fn(() => chain), __chain: chain } as any;
}

describe("ColorPickerPopover", () => {
  it("does not render its content when anchorEl is null", () => {
    renderWithProviders(
      <ColorPickerPopover editor={createMockEditor()} anchorEl={null} onClose={vi.fn()} />,
    );
    expect(screen.queryByText("Reset to default")).not.toBeInTheDocument();
  });

  it("renders the color palette when anchorEl is set", () => {
    const anchorEl = document.createElement("button");
    document.body.appendChild(anchorEl);
    renderWithProviders(
      <ColorPickerPopover editor={createMockEditor()} anchorEl={anchorEl} onClose={vi.fn()} />,
    );
    expect(screen.getByText("Reset to default")).toBeInTheDocument();
  });

  it("applies a color and closes the popover when a swatch is clicked", () => {
    const anchorEl = document.createElement("button");
    document.body.appendChild(anchorEl);
    const editor = createMockEditor();
    const onClose = vi.fn();
    renderWithProviders(<ColorPickerPopover editor={editor} anchorEl={anchorEl} onClose={onClose} />);

    // Query the swatch grid cells directly since they carry no accessible text.
    const swatches = document.querySelectorAll(
      '.MuiPopover-paper [style*="background-color"], .MuiPopover-paper > div > div',
    );
    expect(swatches.length).toBeGreaterThan(0);
    fireEvent.click(swatches[0]);

    expect(editor.__chain.setColor).toHaveBeenCalled();
    expect(editor.__chain.run).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("resets the color and closes the popover when 'Reset to default' is clicked", () => {
    const anchorEl = document.createElement("button");
    document.body.appendChild(anchorEl);
    const editor = createMockEditor();
    const onClose = vi.fn();
    renderWithProviders(<ColorPickerPopover editor={editor} anchorEl={anchorEl} onClose={onClose} />);

    fireEvent.click(screen.getByText("Reset to default"));

    expect(editor.__chain.unsetColor).toHaveBeenCalled();
    expect(editor.__chain.run).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("does not throw when editor is null and a swatch is clicked", () => {
    const anchorEl = document.createElement("button");
    document.body.appendChild(anchorEl);
    renderWithProviders(<ColorPickerPopover editor={null} anchorEl={anchorEl} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Reset to default"));
  });
});
