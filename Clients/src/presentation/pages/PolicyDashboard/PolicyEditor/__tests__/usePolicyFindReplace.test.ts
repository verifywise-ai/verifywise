import { renderHook, act } from "@testing-library/react";
import { usePolicyFindReplace } from "../usePolicyFindReplace";

/** Minimal text node used to drive doc.descendants callbacks. */
function textNode(text: string) {
  return { isText: true, text };
}

/** Builds a fake TipTap editor whose doc contains the given text nodes at given positions. */
function createMockEditor(nodes: Array<{ pos: number; text: string }>, selection = { from: 0, to: 0 }) {
  const dispatch = vi.fn();
  const chain: any = {
    setTextSelection: vi.fn(() => chain),
    scrollIntoView: vi.fn(() => chain),
    deleteSelection: vi.fn(() => chain),
    insertContent: vi.fn(() => chain),
    run: vi.fn(),
  };

  const doc = {
    descendants: vi.fn((cb: (node: any, pos: number) => void | false) => {
      for (const n of nodes) {
        const res = cb(textNode(n.text), n.pos);
        if (res === false) break;
      }
    }),
    textBetween: vi.fn((from: number, to: number) => "match"),
  };

  const tr: any = { setMeta: vi.fn(() => tr), replaceWith: vi.fn(() => tr) };

  const editor: any = {
    state: {
      doc,
      selection,
      tr,
      schema: { text: vi.fn((t: string) => ({ text: t })) },
    },
    view: { dispatch },
    chain: vi.fn(() => chain),
    __chain: chain,
  };
  return editor;
}

describe("usePolicyFindReplace", () => {
  it("returns zero matches and default state when editor is null", () => {
    const { result } = renderHook(() => usePolicyFindReplace(null));
    expect(result.current.searchMatchCount).toBe(0);
    expect(result.current.searchAnchorEl).toBeNull();
    expect(result.current.searchText).toBe("");
    expect(result.current.replaceText).toBe("");
  });

  it("opens and closes the find/replace popover, resetting search state", () => {
    const { result } = renderHook(() => usePolicyFindReplace(null));
    const el = document.createElement("button");

    act(() => {
      result.current.openFindReplace(el);
    });
    expect(result.current.searchAnchorEl).toBe(el);

    act(() => {
      result.current.setSearchText("policy");
      result.current.setReplaceText("rule");
    });
    expect(result.current.searchText).toBe("policy");
    expect(result.current.replaceText).toBe("rule");

    act(() => {
      result.current.closeFindReplace();
    });
    expect(result.current.searchAnchorEl).toBeNull();
    expect(result.current.searchText).toBe("");
    expect(result.current.replaceText).toBe("");
  });

  it("counts matches across text nodes when searchText changes", () => {
    const editor = createMockEditor([
      { pos: 0, text: "the quick fox jumps over the lazy fox" },
    ]);
    const { result } = renderHook(() => usePolicyFindReplace(editor));

    act(() => {
      result.current.setSearchText("fox");
    });

    expect(result.current.searchMatchCount).toBe(2);
    expect(editor.view.dispatch).toHaveBeenCalled();
  });

  it("auto-selects the first match when searchText is set", () => {
    const editor = createMockEditor([{ pos: 10, text: "hello world" }]);
    const { result } = renderHook(() => usePolicyFindReplace(editor));

    act(() => {
      result.current.setSearchText("world");
    });

    expect(editor.__chain.setTextSelection).toHaveBeenCalledWith({ from: 16, to: 21 });
    expect(editor.__chain.scrollIntoView).toHaveBeenCalled();
    expect(editor.__chain.run).toHaveBeenCalled();
  });

  it("resets match count to 0 when searchText is cleared", () => {
    const editor = createMockEditor([{ pos: 0, text: "hello world" }]);
    const { result } = renderHook(() => usePolicyFindReplace(editor));

    act(() => {
      result.current.setSearchText("world");
    });
    expect(result.current.searchMatchCount).toBe(1);

    act(() => {
      result.current.setSearchText("");
    });
    expect(result.current.searchMatchCount).toBe(0);
  });

  it("handleSearchNext finds the next match after the current selection", () => {
    const editor = createMockEditor(
      [{ pos: 0, text: "cat dog cat" }],
      { from: 0, to: 0 },
    );
    const { result } = renderHook(() => usePolicyFindReplace(editor));

    act(() => {
      result.current.setSearchText("cat");
    });
    editor.__chain.setTextSelection.mockClear();

    act(() => {
      result.current.handleSearchNext();
    });

    expect(editor.__chain.setTextSelection).toHaveBeenCalled();
  });

  it("handleSearchNext does nothing when there is no search text", () => {
    const editor = createMockEditor([{ pos: 0, text: "cat dog cat" }]);
    const { result } = renderHook(() => usePolicyFindReplace(editor));

    act(() => {
      result.current.handleSearchNext();
    });
    expect(editor.chain).not.toHaveBeenCalled();
  });

  it("handleSearchPrev finds a match before the current selection", () => {
    const editor = createMockEditor(
      [{ pos: 0, text: "cat dog cat" }],
      { from: 11, to: 11 },
    );
    const { result } = renderHook(() => usePolicyFindReplace(editor));

    act(() => {
      result.current.setSearchText("cat");
    });
    editor.__chain.setTextSelection.mockClear();

    act(() => {
      result.current.handleSearchPrev();
    });

    expect(editor.__chain.setTextSelection).toHaveBeenCalled();
  });

  it("handleSearchPrev wraps to the last match when nothing precedes the cursor", () => {
    const editor = createMockEditor(
      [{ pos: 0, text: "cat dog cat" }],
      { from: 0, to: 0 },
    );
    const { result } = renderHook(() => usePolicyFindReplace(editor));

    act(() => {
      result.current.setSearchText("cat");
    });
    editor.__chain.setTextSelection.mockClear();

    act(() => {
      result.current.handleSearchPrev();
    });

    expect(editor.__chain.setTextSelection).toHaveBeenCalled();
  });

  it("handleReplaceCurrent replaces the selected text when it matches the search term", () => {
    const editor = createMockEditor(
      [{ pos: 0, text: "cat dog cat" }],
      { from: 0, to: 3 },
    );
    editor.state.doc.textBetween = vi.fn(() => "cat");
    const { result } = renderHook(() => usePolicyFindReplace(editor));

    act(() => {
      result.current.setSearchText("cat");
      result.current.setReplaceText("dog");
    });

    act(() => {
      result.current.handleReplaceCurrent();
    });

    expect(editor.__chain.deleteSelection).toHaveBeenCalled();
    expect(editor.__chain.insertContent).toHaveBeenCalledWith("dog");
  });

  it("handleReplaceCurrent advances to next match when selection doesn't match", () => {
    const editor = createMockEditor(
      [{ pos: 0, text: "cat dog cat" }],
      { from: 4, to: 7 },
    );
    editor.state.doc.textBetween = vi.fn(() => "dog");
    const { result } = renderHook(() => usePolicyFindReplace(editor));

    act(() => {
      result.current.setSearchText("cat");
    });
    editor.__chain.setTextSelection.mockClear();

    act(() => {
      result.current.handleReplaceCurrent();
    });

    expect(editor.__chain.deleteSelection).not.toHaveBeenCalled();
  });

  it("handleReplaceCurrent is a no-op without search text", () => {
    const editor = createMockEditor([{ pos: 0, text: "cat dog cat" }]);
    const { result } = renderHook(() => usePolicyFindReplace(editor));

    act(() => {
      result.current.handleReplaceCurrent();
    });
    expect(editor.__chain.deleteSelection).not.toHaveBeenCalled();
  });

  it("handleReplaceAll replaces every occurrence and dispatches once", () => {
    const editor = createMockEditor([{ pos: 0, text: "cat dog cat" }]);
    const { result } = renderHook(() => usePolicyFindReplace(editor));

    act(() => {
      result.current.setSearchText("cat");
      result.current.setReplaceText("fish");
    });
    editor.view.dispatch.mockClear();

    act(() => {
      result.current.handleReplaceAll();
    });

    expect(editor.view.dispatch).toHaveBeenCalled();
  });

  it("handleReplaceAll does nothing when there are no matches", () => {
    const editor = createMockEditor([{ pos: 0, text: "no matches here" }]);
    const { result } = renderHook(() => usePolicyFindReplace(editor));

    act(() => {
      result.current.setSearchText("zzz");
    });
    editor.view.dispatch.mockClear();

    act(() => {
      result.current.handleReplaceAll();
    });

    expect(editor.view.dispatch).not.toHaveBeenCalled();
  });

  it("handleReplaceAll is a no-op without search text", () => {
    const editor = createMockEditor([{ pos: 0, text: "cat dog cat" }]);
    const { result } = renderHook(() => usePolicyFindReplace(editor));
    editor.view.dispatch.mockClear();

    act(() => {
      result.current.handleReplaceAll();
    });
    expect(editor.view.dispatch).not.toHaveBeenCalled();
  });
});
