import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Shared PluginKey so find/replace can update highlight decorations via transaction meta. */
export const searchHighlightKey = new PluginKey("searchHighlight");

export function createSearchHighlightExtension() {
  return Extension.create({
    name: "searchHighlight",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: searchHighlightKey,
          state: {
            init() {
              return { term: "", decorations: DecorationSet.empty };
            },
            apply(tr, prev) {
              const meta = tr.getMeta(searchHighlightKey);
              if (meta !== undefined) {
                const term = meta as string;
                if (!term) return { term: "", decorations: DecorationSet.empty };
                const decorations: Decoration[] = [];
                const searchLower = term.toLowerCase();
                tr.doc.descendants((node, pos) => {
                  if (!node.isText || !node.text) return;
                  const text = node.text.toLowerCase();
                  let idx = text.indexOf(searchLower);
                  while (idx !== -1) {
                    decorations.push(
                      Decoration.inline(pos + idx, pos + idx + term.length, {
                        class: "search-highlight",
                      }),
                    );
                    idx = text.indexOf(searchLower, idx + term.length);
                  }
                });
                return { term, decorations: DecorationSet.create(tr.doc, decorations) };
              }
              // Remap existing decorations on doc change
              if (tr.docChanged && prev.decorations !== DecorationSet.empty) {
                return { ...prev, decorations: prev.decorations.map(tr.mapping, tr.doc) };
              }
              return prev;
            },
          },
          props: {
            decorations(state) {
              return this.getState(state)?.decorations ?? DecorationSet.empty;
            },
          },
        }),
      ];
    },
  });
}
