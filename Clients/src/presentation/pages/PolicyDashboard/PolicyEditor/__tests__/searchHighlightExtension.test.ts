import { DecorationSet } from "@tiptap/pm/view";
import { Schema } from "@tiptap/pm/model";
import { createSearchHighlightExtension, searchHighlightKey } from "../searchHighlightExtension";

/** Minimal real ProseMirror schema/doc so DecorationSet.create has a genuine node tree to walk. */
const testSchema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: {},
  },
});

function buildDoc(text: string) {
  return testSchema.node("doc", null, [
    testSchema.node("paragraph", null, [testSchema.text(text)]),
  ]);
}

/** Extracts the raw ProseMirror plugin from the TipTap extension without mounting an editor. */
function getPlugin() {
  const extension = createSearchHighlightExtension();
  const plugins = (extension.config.addProseMirrorPlugins as () => any[]).call(extension);
  expect(plugins).toHaveLength(1);
  return plugins[0];
}

describe("createSearchHighlightExtension", () => {
  it("creates an extension named 'searchHighlight'", () => {
    const extension = createSearchHighlightExtension();
    expect(extension.name).toBe("searchHighlight");
  });

  it("registers exactly one ProseMirror plugin keyed by searchHighlightKey", () => {
    const plugin = getPlugin();
    expect(plugin.spec.key).toBe(searchHighlightKey);
  });

  it("initializes plugin state with an empty term and empty decoration set", () => {
    const plugin = getPlugin();
    const initialState = plugin.spec.state.init();
    expect(initialState.term).toBe("");
    expect(initialState.decorations).toBe(DecorationSet.empty);
  });

  it("returns empty decorations when meta term is an empty string", () => {
    const plugin = getPlugin();
    const prev = plugin.spec.state.init();
    const tr = {
      getMeta: vi.fn(() => ""),
      doc: { descendants: vi.fn() },
      docChanged: false,
    };
    const next = plugin.spec.state.apply(tr, prev);
    expect(next.term).toBe("");
    expect(next.decorations).toBe(DecorationSet.empty);
  });

  it("builds decorations for each occurrence of the search term", () => {
    const plugin = getPlugin();
    const prev = plugin.spec.state.init();
    const doc = buildDoc("the fox and the hound");
    const tr = {
      getMeta: vi.fn(() => "the"),
      doc,
      docChanged: false,
    };
    const next = plugin.spec.state.apply(tr, prev);
    expect(next.term).toBe("the");
    expect(next.decorations).not.toBe(DecorationSet.empty);
    expect(next.decorations.find().length).toBe(2);
  });

  it("is case-insensitive when matching the search term", () => {
    const plugin = getPlugin();
    const prev = plugin.spec.state.init();
    const doc = buildDoc("Fox FOX fox");
    const tr = {
      getMeta: vi.fn(() => "fox"),
      doc,
      docChanged: false,
    };
    const next = plugin.spec.state.apply(tr, prev);
    expect(next.decorations.find().length).toBe(3);
  });

  it("remaps existing decorations when the doc changes without new meta", () => {
    const plugin = getPlugin();
    const decorations = { map: vi.fn(() => "remapped") } as any;
    const prev = { term: "fox", decorations };
    const tr = {
      getMeta: vi.fn(() => undefined),
      docChanged: true,
      mapping: {},
      doc: {},
    };
    const next = plugin.spec.state.apply(tr, prev);
    expect(decorations.map).toHaveBeenCalledWith(tr.mapping, tr.doc);
    expect(next.decorations).toBe("remapped");
  });

  it("returns previous state unchanged when doc has not changed and there is no meta", () => {
    const plugin = getPlugin();
    const prev = { term: "fox", decorations: DecorationSet.empty };
    const tr = {
      getMeta: vi.fn(() => undefined),
      docChanged: false,
    };
    const next = plugin.spec.state.apply(tr, prev);
    expect(next).toBe(prev);
  });

  it("exposes decorations via the props.decorations accessor", () => {
    const plugin = getPlugin();
    const fakeState = { term: "x", decorations: DecorationSet.empty };
    const getState = vi.fn(() => fakeState);
    const boundPlugin = { getState };
    const decorations = plugin.spec.props.decorations.call(boundPlugin, {});
    expect(decorations).toBe(DecorationSet.empty);
  });

  it("falls back to an empty DecorationSet when plugin state is missing", () => {
    const plugin = getPlugin();
    const getState = vi.fn(() => undefined);
    const boundPlugin = { getState };
    const decorations = plugin.spec.props.decorations.call(boundPlugin, {});
    expect(decorations).toBe(DecorationSet.empty);
  });
});
