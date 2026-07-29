import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { searchHighlightKey } from "./searchHighlightExtension";

/** Find & replace logic for the TipTap policy editor. */
export function usePolicyFindReplace(editor: Editor | null) {
  const [searchAnchorEl, setSearchAnchorEl] = useState<HTMLElement | null>(null);
  const [searchText, setSearchText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [searchMatchCount, setSearchMatchCount] = useState(0);

  const countMatches = useCallback(() => {
    if (!editor || !searchText) {
      setSearchMatchCount(0);
      return;
    }
    const searchLower = searchText.toLowerCase();
    let count = 0;
    editor.state.doc.descendants((node) => {
      if (!node.isText || !node.text) return;
      const text = node.text.toLowerCase();
      let idx = text.indexOf(searchLower);
      while (idx !== -1) {
        count++;
        idx = text.indexOf(searchLower, idx + searchText.length);
      }
    });
    setSearchMatchCount(count);
  }, [editor, searchText]);

  // Count matches, update decorations, and auto-find first match when searchText changes
  useEffect(() => {
    countMatches();
    if (!editor) return;
    const tr = editor.state.tr.setMeta(searchHighlightKey, searchText || "");
    editor.view.dispatch(tr);
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      let found = false;
      editor.state.doc.descendants((node, pos) => {
        if (found || !node.isText || !node.text) return;
        const text = node.text.toLowerCase();
        const idx = text.indexOf(searchLower);
        if (idx !== -1) {
          const from = pos + idx;
          const to = from + searchText.length;
          editor.chain().setTextSelection({ from, to }).scrollIntoView().run();
          found = true;
        }
      });
    }
  }, [countMatches, editor, searchText]);

  const handleSearchNext = useCallback(() => {
    if (!editor || !searchText) return;
    const { doc, selection } = editor.state;
    const searchLower = searchText.toLowerCase();
    const startFrom = selection.to;
    let found = false;

    doc.descendants((node, pos) => {
      if (found || !node.isText || !node.text) return;
      const text = node.text.toLowerCase();
      const idx =
        pos >= startFrom ? text.indexOf(searchLower) : text.indexOf(searchLower, startFrom - pos);
      if (idx !== -1 && pos + idx >= startFrom) {
        const from = pos + idx;
        const to = from + searchText.length;
        editor.chain().setTextSelection({ from, to }).scrollIntoView().run();
        found = true;
      }
    });

    if (!found) {
      doc.descendants((node, pos) => {
        if (found || !node.isText || !node.text) return;
        const text = node.text.toLowerCase();
        const idx = text.indexOf(searchLower);
        if (idx !== -1) {
          const from = pos + idx;
          const to = from + searchText.length;
          editor.chain().setTextSelection({ from, to }).scrollIntoView().run();
          found = true;
        }
      });
    }
  }, [editor, searchText]);

  const handleSearchPrev = useCallback(() => {
    if (!editor || !searchText) return;
    const { doc, selection } = editor.state;
    const searchLower = searchText.toLowerCase();
    const startBefore = selection.from;
    let lastMatch: { from: number; to: number } | null = null;

    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      const text = node.text.toLowerCase();
      let idx = text.indexOf(searchLower);
      while (idx !== -1) {
        const from = pos + idx;
        if (from < startBefore) {
          lastMatch = { from, to: from + searchText.length };
        }
        idx = text.indexOf(searchLower, idx + searchText.length);
      }
    });

    if (lastMatch) {
      editor.chain().setTextSelection(lastMatch).scrollIntoView().run();
    } else {
      doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        const text = node.text.toLowerCase();
        let idx = text.indexOf(searchLower);
        while (idx !== -1) {
          const from = pos + idx;
          lastMatch = { from, to: from + searchText.length };
          idx = text.indexOf(searchLower, idx + searchText.length);
        }
      });
      if (lastMatch) {
        editor.chain().setTextSelection(lastMatch).scrollIntoView().run();
      }
    }
  }, [editor, searchText]);

  const handleReplaceCurrent = useCallback(() => {
    if (!editor || !searchText) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to).toLowerCase();
    if (selectedText === searchText.toLowerCase()) {
      editor.chain().deleteSelection().insertContent(replaceText).run();
      countMatches();
      handleSearchNext();
    } else {
      handleSearchNext();
    }
  }, [editor, searchText, replaceText, countMatches, handleSearchNext]);

  const handleReplaceAll = useCallback(() => {
    if (!editor || !searchText) return;
    const { doc, tr } = editor.state;
    const searchLower = searchText.toLowerCase();
    let replaced = 0;

    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      const text = node.text.toLowerCase();
      let idx = text.indexOf(searchLower);
      while (idx !== -1) {
        const from = pos + idx;
        const to = from + searchText.length;
        tr.replaceWith(
          from + replaced * (replaceText.length - searchText.length),
          to + replaced * (replaceText.length - searchText.length),
          editor.state.schema.text(replaceText),
        );
        replaced++;
        idx = text.indexOf(searchLower, idx + searchText.length);
      }
    });

    if (replaced > 0) {
      editor.view.dispatch(tr);
      countMatches();
    }
  }, [editor, searchText, replaceText, countMatches]);

  const openFindReplace = useCallback((el: HTMLElement) => {
    setSearchAnchorEl(el);
  }, []);

  const closeFindReplace = useCallback(() => {
    setSearchAnchorEl(null);
    setSearchText("");
    setReplaceText("");
  }, []);

  return {
    searchAnchorEl,
    openFindReplace,
    closeFindReplace,
    searchText,
    setSearchText,
    replaceText,
    setReplaceText,
    searchMatchCount,
    handleSearchNext,
    handleSearchPrev,
    handleReplaceCurrent,
    handleReplaceAll,
  };
}
