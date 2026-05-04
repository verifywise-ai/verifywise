import { vi } from "vitest";

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn().mockReturnValue(null),
  EditorContent: ({ editor }: any) => (
    <div data-testid="editor-content">{editor ? "loaded" : "empty"}</div>
  ),
}));
vi.mock("@tiptap/react/menus", () => ({
  BubbleMenu: () => null,
}));
vi.mock("@tiptap/starter-kit", () => ({ default: { configure: () => ({}) } }));
vi.mock("@tiptap/extension-table", () => ({
  Table: { configure: () => ({}) },
  TableRow: {},
  TableCell: {},
  TableHeader: {},
}));
vi.mock("@tiptap/extension-underline", () => ({ Underline: {} }));
vi.mock("@tiptap/extension-link", () => ({ Link: { configure: () => ({}) } }));
vi.mock("@tiptap/extension-placeholder", () => ({ Placeholder: { configure: () => ({}) } }));
vi.mock("@tiptap/extension-highlight", () => ({ Highlight: {} }));
vi.mock("@tiptap/extension-text-align", () => ({ TextAlign: { configure: () => ({}) } }));
vi.mock("@tiptap/extension-subscript", () => ({ Subscript: {} }));
vi.mock("@tiptap/extension-superscript", () => ({ Superscript: {} }));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import RichTextEditor from "../index";

describe("RichTextEditor", () => {
  it("renders editor content area", () => {
    renderWithProviders(<RichTextEditor initialContent="" onContentChange={vi.fn()} />);
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
  });
});
