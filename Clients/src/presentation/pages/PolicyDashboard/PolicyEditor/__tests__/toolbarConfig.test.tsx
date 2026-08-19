import { getToolbarConfig } from "../toolbarConfig";
import { defaultToolbarState } from "../toolbarTypes";

function createMockEditor(overrides: Partial<Record<string, any>> = {}) {
  const chainMethods: Record<string, any> = {};
  const chain: any = {
    focus: vi.fn(() => chain),
    toggleBold: vi.fn(() => chain),
    toggleItalic: vi.fn(() => chain),
    toggleUnderline: vi.fn(() => chain),
    toggleStrike: vi.fn(() => chain),
    toggleSuperscript: vi.fn(() => chain),
    toggleSubscript: vi.fn(() => chain),
    toggleHighlight: vi.fn(() => chain),
    toggleCodeBlock: vi.fn(() => chain),
    toggleOrderedList: vi.fn(() => chain),
    toggleBulletList: vi.fn(() => chain),
    toggleTaskList: vi.fn(() => chain),
    toggleBlockquote: vi.fn(() => chain),
    setHorizontalRule: vi.fn(() => chain),
    setTextAlign: vi.fn(() => chain),
    unsetLink: vi.fn(() => chain),
    insertTable: vi.fn(() => chain),
    undo: vi.fn(() => chain),
    redo: vi.fn(() => chain),
    run: vi.fn(),
  };
  Object.assign(chainMethods, chain);

  return {
    chain: vi.fn(() => chain),
    isActive: vi.fn(() => false),
    state: { selection: { from: 0, to: 0 } },
    ...overrides,
    __chain: chain,
  } as any;
}

describe("getToolbarConfig", () => {
  const baseOptions = {
    isUploadingImage: false,
    onInsertImage: vi.fn(),
    onOpenLink: vi.fn(),
  };

  it("returns an entry for every known toolbar key", () => {
    const editor = createMockEditor();
    const config = getToolbarConfig({ editor, ...baseOptions });
    const keys = config.map((c) => c.key);
    Object.keys(defaultToolbarState).forEach((key) => {
      expect(keys).toContain(key);
    });
  });

  it("handles a null editor gracefully for every action", () => {
    const config = getToolbarConfig({ editor: null, ...baseOptions });
    config.forEach((entry) => {
      expect(() => entry.action()).not.toThrow();
    });
  });

  it("invokes chain().focus().toggleBold().run() for the bold action", () => {
    const editor = createMockEditor();
    const config = getToolbarConfig({ editor, ...baseOptions });
    const bold = config.find((c) => c.key === "bold")!;
    bold.action();
    expect(editor.chain).toHaveBeenCalled();
    expect(editor.__chain.focus).toHaveBeenCalled();
    expect(editor.__chain.toggleBold).toHaveBeenCalled();
    expect(editor.__chain.run).toHaveBeenCalled();
  });

  it("invokes insertTable with the expected default dimensions", () => {
    const editor = createMockEditor();
    const config = getToolbarConfig({ editor, ...baseOptions });
    const table = config.find((c) => c.key === "table")!;
    table.action();
    expect(editor.__chain.insertTable).toHaveBeenCalledWith({
      rows: 3,
      cols: 4,
      withHeaderRow: true,
    });
  });

  it("shows 'Insert link' title and calls onOpenLink with empty text when no link active and no selection", () => {
    const editor = createMockEditor({ isActive: vi.fn(() => false) });
    const onOpenLink = vi.fn();
    const config = getToolbarConfig({ editor, ...baseOptions, onOpenLink });
    const link = config.find((c) => c.key === "link")!;
    expect(link.title).toBe("Insert link");
    link.action();
    expect(onOpenLink).toHaveBeenCalledWith("");
  });

  it("shows 'Remove link' and unsets the link when link mark active", () => {
    const editor = createMockEditor({ isActive: vi.fn(() => true) });
    const onOpenLink = vi.fn();
    const config = getToolbarConfig({ editor, ...baseOptions, onOpenLink });
    const link = config.find((c) => c.key === "link")!;
    expect(link.title).toBe("Remove link");
    link.action();
    expect(editor.__chain.unsetLink).toHaveBeenCalled();
    expect(onOpenLink).not.toHaveBeenCalled();
  });

  it("passes selected text to onOpenLink when there is a text selection", () => {
    const editor = createMockEditor({
      isActive: vi.fn(() => false),
      state: {
        selection: { from: 0, to: 5 },
        doc: { textBetween: vi.fn(() => "selected") },
      },
    });
    const onOpenLink = vi.fn();
    const config = getToolbarConfig({ editor, ...baseOptions, onOpenLink });
    const link = config.find((c) => c.key === "link")!;
    link.action();
    expect(onOpenLink).toHaveBeenCalledWith("selected");
  });

  it("shows 'Uploading...' title and skips onInsertImage while uploading", () => {
    const editor = createMockEditor();
    const onInsertImage = vi.fn();
    const config = getToolbarConfig({
      editor,
      ...baseOptions,
      isUploadingImage: true,
      onInsertImage,
    });
    const image = config.find((c) => c.key === "image")!;
    expect(image.title).toBe("Uploading...");
    image.action();
    expect(onInsertImage).not.toHaveBeenCalled();
  });

  it("calls onInsertImage when not uploading", () => {
    const editor = createMockEditor();
    const onInsertImage = vi.fn();
    const config = getToolbarConfig({
      editor,
      ...baseOptions,
      isUploadingImage: false,
      onInsertImage,
    });
    const image = config.find((c) => c.key === "image")!;
    expect(image.title).toBe("Insert image");
    image.action();
    expect(onInsertImage).toHaveBeenCalled();
  });

  it("color and search actions are no-ops that do not throw", () => {
    const editor = createMockEditor();
    const config = getToolbarConfig({ editor, ...baseOptions });
    expect(() => config.find((c) => c.key === "color")!.action()).not.toThrow();
    expect(() => config.find((c) => c.key === "search")!.action()).not.toThrow();
  });

  it("invokes undo/redo/align actions without error", () => {
    const editor = createMockEditor();
    const config = getToolbarConfig({ editor, ...baseOptions });
    [
      "undo",
      "redo",
      "align-left",
      "align-center",
      "align-right",
      "hr",
      "ol",
      "ul",
      "taskList",
      "blockquote",
      "code",
      "italic",
      "underline",
      "strike",
      "superscript",
      "subscript",
      "highlight",
    ].forEach((key) => {
      const entry = config.find((c) => c.key === key)!;
      expect(() => entry.action()).not.toThrow();
    });
  });
});

describe("defaultToolbarState", () => {
  it("initializes every toolbar key to false", () => {
    Object.values(defaultToolbarState).forEach((value) => {
      expect(value).toBe(false);
    });
  });
});
