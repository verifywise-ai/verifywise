vi.mock("@tiptap/react/menus", () => ({
  BubbleMenu: ({ children }: any) => <div data-testid="bubble-menu">{children}</div>,
}));

import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { PolicyTableBubbleMenu } from "../PolicyTableBubbleMenu";

function createMockEditor() {
  const chain: any = {
    focus: vi.fn(() => chain),
    addRowBefore: vi.fn(() => chain),
    addRowAfter: vi.fn(() => chain),
    deleteRow: vi.fn(() => chain),
    addColumnBefore: vi.fn(() => chain),
    addColumnAfter: vi.fn(() => chain),
    deleteColumn: vi.fn(() => chain),
    mergeCells: vi.fn(() => chain),
    splitCell: vi.fn(() => chain),
    toggleHeaderRow: vi.fn(() => chain),
    toggleHeaderColumn: vi.fn(() => chain),
    deleteTable: vi.fn(() => chain),
    run: vi.fn(),
  };
  return { chain: vi.fn(() => chain), __chain: chain, isActive: vi.fn(() => true) } as any;
}

describe("PolicyTableBubbleMenu", () => {
  it("renders the table editing toolbar inside the bubble menu", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyTableBubbleMenu editor={editor} />);
    expect(screen.getByTestId("bubble-menu")).toBeInTheDocument();
    expect(screen.getByLabelText("Add row above")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete table")).toBeInTheDocument();
  });

  it("adds a row above when 'Add row above' is clicked", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyTableBubbleMenu editor={editor} />);
    fireEvent.mouseDown(screen.getByLabelText("Add row above"));
    expect(editor.__chain.addRowBefore).toHaveBeenCalled();
    expect(editor.__chain.run).toHaveBeenCalled();
  });

  it("deletes the table when 'Delete table' is clicked", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyTableBubbleMenu editor={editor} />);
    fireEvent.mouseDown(screen.getByLabelText("Delete table"));
    expect(editor.__chain.deleteTable).toHaveBeenCalled();
  });

  it("merges cells when 'Merge cells' is clicked", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyTableBubbleMenu editor={editor} />);
    fireEvent.mouseDown(screen.getByLabelText("Merge cells"));
    expect(editor.__chain.mergeCells).toHaveBeenCalled();
  });

  it("toggles the header row and column", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyTableBubbleMenu editor={editor} />);
    fireEvent.mouseDown(screen.getByLabelText("Toggle header row"));
    fireEvent.mouseDown(screen.getByLabelText("Toggle header column"));
    expect(editor.__chain.toggleHeaderRow).toHaveBeenCalled();
    expect(editor.__chain.toggleHeaderColumn).toHaveBeenCalled();
  });

  it("adds and deletes columns", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyTableBubbleMenu editor={editor} />);
    fireEvent.mouseDown(screen.getByLabelText("Add column left"));
    fireEvent.mouseDown(screen.getByLabelText("Add column right"));
    fireEvent.mouseDown(screen.getByLabelText("Delete column"));
    expect(editor.__chain.addColumnBefore).toHaveBeenCalled();
    expect(editor.__chain.addColumnAfter).toHaveBeenCalled();
    expect(editor.__chain.deleteColumn).toHaveBeenCalled();
  });

  it("splits a cell and adds/deletes rows", () => {
    const editor = createMockEditor();
    renderWithProviders(<PolicyTableBubbleMenu editor={editor} />);
    fireEvent.mouseDown(screen.getByLabelText("Split cell"));
    fireEvent.mouseDown(screen.getByLabelText("Add row below"));
    fireEvent.mouseDown(screen.getByLabelText("Delete row"));
    expect(editor.__chain.splitCell).toHaveBeenCalled();
    expect(editor.__chain.addRowAfter).toHaveBeenCalled();
    expect(editor.__chain.deleteRow).toHaveBeenCalled();
  });
});
