import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { PolicyToolbar } from "../PolicyToolbar";

function createMockEditor(overrides: Partial<Record<string, any>> = {}) {
  const chain: any = {
    focus: vi.fn(() => chain),
    toggleBold: vi.fn(() => chain),
    setParagraph: vi.fn(() => chain),
    toggleHeading: vi.fn(() => chain),
    run: vi.fn(),
  };
  const listeners: Record<string, Array<() => void>> = {};

  return {
    chain: vi.fn(() => chain),
    __chain: chain,
    isActive: vi.fn(() => false),
    state: { selection: { from: 0, to: 0 } },
    storage: { characterCount: { words: () => 12, characters: () => 64 } },
    on: vi.fn((event: string, cb: () => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    off: vi.fn(),
    __emit: (event: string) => (listeners[event] || []).forEach((cb) => cb()),
    ...overrides,
  } as any;
}

describe("PolicyToolbar", () => {
  const baseProps = {
    isUploadingImage: false,
    onInsertImage: vi.fn(),
    onOpenLink: vi.fn(),
    onOpenFindReplace: vi.fn(),
  };

  it("renders the block-type select and formatting buttons", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyToolbar editor={editor} {...baseProps} />);
    expect(screen.getByLabelText("Bold")).toBeInTheDocument();
    expect(screen.getByLabelText("Insert table")).toBeInTheDocument();
  });

  it("shows word and character counts when an editor is present", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyToolbar editor={editor} {...baseProps} />);
    expect(screen.getByText("12 words")).toBeInTheDocument();
    expect(screen.getByText("64 characters")).toBeInTheDocument();
  });

  it("does not show word counts when there is no editor", () => {
    renderWithProviders(<PolicyToolbar editor={null} {...baseProps} />);
    expect(screen.queryByText(/words/)).not.toBeInTheDocument();
  });

  it("registers selectionUpdate/transaction listeners on mount and cleans them up on unmount", () => {
    const editor = createMockEditor();
    const { unmount } = renderWithProviders(<PolicyToolbar editor={editor} {...baseProps} />);
    expect(editor.on).toHaveBeenCalledWith("selectionUpdate", expect.any(Function));
    expect(editor.on).toHaveBeenCalledWith("transaction", expect.any(Function));
    unmount();
    expect(editor.off).toHaveBeenCalledWith("selectionUpdate", expect.any(Function));
    expect(editor.off).toHaveBeenCalledWith("transaction", expect.any(Function));
  });

  it("invokes the bold action when the bold button is clicked", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyToolbar editor={editor} {...baseProps} />);
    fireEvent.click(screen.getByLabelText("Bold"));
    expect(editor.__chain.toggleBold).toHaveBeenCalled();
    expect(editor.__chain.run).toHaveBeenCalled();
  });

  it("opens the color picker popover when the color swatch button is clicked", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyToolbar editor={editor} {...baseProps} />);
    fireEvent.click(screen.getByLabelText("Text color"));
    expect(screen.getByText("Reset to default")).toBeInTheDocument();
  });

  it("calls onOpenFindReplace when the search button is clicked", () => {
    const editor = createMockEditor();
    const onOpenFindReplace = vi.fn();
    renderWithProviders(
      <PolicyToolbar editor={editor} {...baseProps} onOpenFindReplace={onOpenFindReplace} />,
    );
    fireEvent.click(screen.getByLabelText("Find & replace"));
    expect(onOpenFindReplace).toHaveBeenCalled();
  });

  it("switches to a heading block type via the select", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyToolbar editor={editor} {...baseProps} />);
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Header 1"));
    expect(editor.__chain.toggleHeading).toHaveBeenCalledWith({ level: 1 });
  });

  it("switches back to paragraph text via the select", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyToolbar editor={editor} {...baseProps} />);
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Header 2"));
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Text"));
    expect(editor.__chain.setParagraph).toHaveBeenCalled();
  });

  it("reflects the active heading level from the editor state", () => {
    const editor = createMockEditor({
      isActive: vi.fn((name: string, attrs?: any) => name === "heading" && attrs?.level === 2),
    });
    renderWithProviders(<PolicyToolbar editor={editor} {...baseProps} />);
    expect(screen.getByText("Header 2")).toBeInTheDocument();
  });

  it("recomputes toolbar state when the editor emits a transaction event", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyToolbar editor={editor} {...baseProps} />);
    editor.isActive = vi.fn((name: string) => name === "bold");
    editor.__emit("transaction");
    // Should not throw and should still render the toolbar
    expect(screen.getByLabelText("Bold")).toBeInTheDocument();
  });

  it("shows the uploading title on the image button while uploading", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyToolbar editor={editor} {...baseProps} isUploadingImage={true} />);
    expect(screen.getByLabelText("Uploading...")).toBeInTheDocument();
  });
});
