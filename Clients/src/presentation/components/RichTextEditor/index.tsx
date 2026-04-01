import React, { useEffect, useCallback } from "react";
import { Box, Tooltip, IconButton, Stack, useTheme, Select as MuiSelect, MenuItem } from "@mui/material";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table";
import { TableHeader } from "@tiptap/extension-table";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
  Table as TableIcon,
  Link as LinkIcon,
  Undo2,
  Redo2,
  Strikethrough,
  Plus,
  X,
  Rows3,
  Columns3,
  Trash2,
  Superscript as SuperscriptIcon,
  Subscript as SubscriptIcon,
  Highlighter,
  Code,
  Quote,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import "./index.css";
import { IRichTextEditorProps } from "../../types/interfaces/i.editor";
import { border as borderPalette } from "../../themes/palette";

const ICON_SIZE = 16;

interface ToolbarItem {
  key: string;
  title: string;
  icon: React.ReactNode;
  action: () => void;
  isActive?: boolean;
  dividerAfter?: boolean;
}

const RichTextEditor: React.FC<IRichTextEditorProps> = ({
  onContentChange,
  headerSx,
  initialContent = "",
  isEditable = true,
  toolbar = "basic",
  height = "90px",
  placeholder,
}) => {
  const theme = useTheme();
  const isFull = toolbar === "full";

  const extensions = [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    ...(isFull
      ? [
          Table.configure({ resizable: true }),
          TableRow,
          TableCell,
          TableHeader,
          Underline,
          Link.configure({ openOnClick: false }),
          Highlight,
          TextAlign.configure({ types: ["heading", "paragraph"] }),
          Subscript,
          Superscript,
        ]
      : []),
    ...(placeholder
      ? [Placeholder.configure({ placeholder, showOnlyWhenEditable: true, showOnlyCurrent: true })]
      : []),
  ];

  const editor = useEditor({
    extensions,
    content: initialContent,
    autofocus: false,
    immediatelyRender: true,
    editable: isEditable,
    onUpdate: ({
      editor,
    }: {
      editor: NonNullable<ReturnType<typeof useEditor>>;
    }) => {
      onContentChange?.(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor) {
      editor.setEditable(isEditable);
    }
  }, [editor, isEditable]);

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  const run = useCallback(
    (fn: () => void) => {
      if (!editor || !isEditable) return;
      fn();
    },
    [editor, isEditable]
  );

  // Build toolbar items based on variant
  const basicItems: ToolbarItem[] = editor
    ? [
        {
          key: "undo",
          title: "Undo",
          icon: <Undo2 size={ICON_SIZE} />,
          action: () => run(() => editor.chain().focus().undo().run()),
        },
        {
          key: "redo",
          title: "Redo",
          icon: <Redo2 size={ICON_SIZE} />,
          action: () => run(() => editor.chain().focus().redo().run()),
          dividerAfter: true,
        },
        {
          key: "bold",
          title: "Bold",
          icon: <Bold size={ICON_SIZE} />,
          action: () => run(() => editor.chain().focus().toggleBold().run()),
          isActive: editor.isActive("bold"),
        },
        {
          key: "italic",
          title: "Italic",
          icon: <Italic size={ICON_SIZE} />,
          action: () => run(() => editor.chain().focus().toggleItalic().run()),
          isActive: editor.isActive("italic"),
        },
        {
          key: "strike",
          title: "Strikethrough",
          icon: <Strikethrough size={ICON_SIZE} />,
          action: () => run(() => editor.chain().focus().toggleStrike().run()),
          isActive: editor.isActive("strike"),
          dividerAfter: true,
        },
        {
          key: "ul",
          title: "Bullet list",
          icon: <List size={ICON_SIZE} />,
          action: () =>
            run(() => editor.chain().focus().toggleBulletList().run()),
          isActive: editor.isActive("bulletList"),
        },
        {
          key: "ol",
          title: "Numbered list",
          icon: <ListOrdered size={ICON_SIZE} />,
          action: () =>
            run(() => editor.chain().focus().toggleOrderedList().run()),
          isActive: editor.isActive("orderedList"),
        },
      ]
    : [];

  const fullExtras: ToolbarItem[] =
    editor && isFull
      ? [
          {
            key: "underline",
            title: "Underline",
            icon: <UnderlineIcon size={ICON_SIZE} />,
            action: () =>
              run(() => editor.chain().focus().toggleUnderline().run()),
            isActive: editor.isActive("underline"),
          },
          {
            key: "superscript",
            title: "Superscript",
            icon: <SuperscriptIcon size={ICON_SIZE} />,
            action: () =>
              run(() => editor.chain().focus().toggleSuperscript().run()),
            isActive: editor.isActive("superscript"),
          },
          {
            key: "subscript",
            title: "Subscript",
            icon: <SubscriptIcon size={ICON_SIZE} />,
            action: () =>
              run(() => editor.chain().focus().toggleSubscript().run()),
            isActive: editor.isActive("subscript"),
          },
          {
            key: "highlight",
            title: "Highlight",
            icon: <Highlighter size={ICON_SIZE} />,
            action: () =>
              run(() => editor.chain().focus().toggleHighlight().run()),
            isActive: editor.isActive("highlight"),
          },
          {
            key: "code",
            title: "Code block",
            icon: <Code size={ICON_SIZE} />,
            action: () =>
              run(() => editor.chain().focus().toggleCodeBlock().run()),
            isActive: editor.isActive("codeBlock"),
            dividerAfter: true,
          },
          {
            key: "blockquote",
            title: "Blockquote",
            icon: <Quote size={ICON_SIZE} />,
            action: () =>
              run(() => editor.chain().focus().toggleBlockquote().run()),
            isActive: editor.isActive("blockquote"),
          },
          {
            key: "hr",
            title: "Horizontal rule",
            icon: <Minus size={ICON_SIZE} />,
            action: () =>
              run(() => editor.chain().focus().setHorizontalRule().run()),
            dividerAfter: true,
          },
          {
            key: "align-left",
            title: "Align left",
            icon: <AlignLeft size={ICON_SIZE} />,
            action: () =>
              run(() => editor.chain().focus().setTextAlign("left").run()),
          },
          {
            key: "align-center",
            title: "Align center",
            icon: <AlignCenter size={ICON_SIZE} />,
            action: () =>
              run(() => editor.chain().focus().setTextAlign("center").run()),
          },
          {
            key: "align-right",
            title: "Align right",
            icon: <AlignRight size={ICON_SIZE} />,
            action: () =>
              run(() => editor.chain().focus().setTextAlign("right").run()),
            dividerAfter: true,
          },
          {
            key: "link",
            title: editor.isActive("link") ? "Remove link" : "Insert link",
            icon: <LinkIcon size={ICON_SIZE} />,
            action: () =>
              run(() => {
                if (editor.isActive("link")) {
                  editor.chain().focus().unsetLink().run();
                  return;
                }
                const url = window.prompt("Enter URL:");
                if (url) {
                  editor
                    .chain()
                    .focus()
                    .setLink({ href: url })
                    .run();
                }
              }),
            isActive: editor.isActive("link"),
          },
          {
            key: "table",
            title: "Insert table",
            icon: <TableIcon size={ICON_SIZE} />,
            action: () =>
              run(() =>
                editor
                  .chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run()
              ),
          },
        ]
      : [];

  const allItems = [...basicItems, ...fullExtras];

  return (
    <Stack className="vw-rich-text-editor">
      {/* Toolbar — matches Policy Editor design */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: "2px",
          padding: "4px",
          border: `1px solid ${borderPalette.dark}`,
          borderBottom: "none",
          borderRadius: `${theme.shape.borderRadius}px ${theme.shape.borderRadius}px 0 0`,
          backgroundColor: theme.palette.background.default,
          ...headerSx,
        }}
      >
        {/* Heading selector — only in full toolbar */}
        {isFull && editor && (
          <>
            <MuiSelect
              size="small"
              value={
                editor.isActive("heading", { level: 1 }) ? "h1" :
                editor.isActive("heading", { level: 2 }) ? "h2" :
                editor.isActive("heading", { level: 3 }) ? "h3" : "p"
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val === "p") editor.chain().focus().setParagraph().run();
                else if (val === "h1") editor.chain().focus().toggleHeading({ level: 1 }).run();
                else if (val === "h2") editor.chain().focus().toggleHeading({ level: 2 }).run();
                else if (val === "h3") editor.chain().focus().toggleHeading({ level: 3 }).run();
              }}
              disabled={!isEditable}
              sx={{
                height: "28px",
                fontSize: 12,
                minWidth: 90,
                "& .MuiSelect-select": { py: "4px" },
              }}
            >
              <MenuItem value="p" sx={{ fontSize: 12 }}>Text</MenuItem>
              <MenuItem value="h1" sx={{ fontSize: 12 }}>Header 1</MenuItem>
              <MenuItem value="h2" sx={{ fontSize: 12 }}>Header 2</MenuItem>
              <MenuItem value="h3" sx={{ fontSize: 12 }}>Header 3</MenuItem>
            </MuiSelect>
            <Box sx={{ width: "1px", height: "28px", backgroundColor: borderPalette.light, mx: "2px", alignSelf: "center" }} />
          </>
        )}
        {allItems.map(({ key, title, icon, action, isActive, dividerAfter }) => (
          <React.Fragment key={key}>
            <Tooltip title={title}>
              <span>
                <IconButton
                  onClick={action}
                  size="small"
                  disabled={!isEditable}
                  sx={{
                    padding: "6px",
                    borderRadius: "3px",
                    backgroundColor: isActive
                      ? "#E0F7FA"
                      : "transparent",
                    border: "1px solid",
                    borderColor: isActive
                      ? theme.palette.primary.main
                      : "transparent",
                    "&:hover": {
                      backgroundColor: theme.palette.action.hover,
                    },
                  }}
                >
                  {icon}
                </IconButton>
              </span>
            </Tooltip>
            {dividerAfter && (
              <Box
                sx={{
                  width: "1px",
                  height: "28px",
                  backgroundColor: borderPalette.light,
                  mx: "2px",
                  alignSelf: "center",
                }}
              />
            )}
          </React.Fragment>
        ))}
      </Box>

      {/* Editor content */}
      <EditorContent
        className="vw-tiptap-content"
        editor={editor}
        style={{
          border: `1px solid ${borderPalette.dark}`,
          minHeight: height,
          overflowY: "auto",
          padding: "8px 12px",
          borderTop: "none",
          borderRadius: `0 0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px`,
          outline: "none",
          fontSize: "13px",
        }}
      />

      {/* Floating table toolbar — appears when cursor is inside a table */}
      {editor && isFull && (
        <BubbleMenu
          editor={editor}
          pluginKey="tableMenu"
          shouldShow={({ editor: e }) => e.isActive("table")}
          updateDelay={100}
        >
          <Box
            sx={{
              display: "flex",
              gap: "2px",
              p: "4px",
              alignItems: "center",
              backgroundColor: theme.palette.background.default,
              border: `1px solid ${borderPalette.dark}`,
              borderRadius: "6px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            {[
              { key: "addRowBefore", title: "Add row above", icon: <Plus size={14} />, action: () => editor.chain().focus().addRowBefore().run() },
              { key: "addRowAfter", title: "Add row below", icon: <Rows3 size={14} />, action: () => editor.chain().focus().addRowAfter().run() },
              { key: "deleteRow", title: "Delete row", icon: <X size={14} />, action: () => editor.chain().focus().deleteRow().run(), separator: true },
              { key: "addColBefore", title: "Add column left", icon: <Plus size={14} />, action: () => editor.chain().focus().addColumnBefore().run() },
              { key: "addColAfter", title: "Add column right", icon: <Columns3 size={14} />, action: () => editor.chain().focus().addColumnAfter().run() },
              { key: "deleteCol", title: "Delete column", icon: <X size={14} />, action: () => editor.chain().focus().deleteColumn().run(), separator: true },
              { key: "deleteTable", title: "Delete table", icon: <Trash2 size={14} />, action: () => editor.chain().focus().deleteTable().run(), danger: true },
            ].map(({ key, title, icon, action, separator, danger }: { key: string; title: string; icon: React.ReactNode; action: () => void; separator?: boolean; danger?: boolean }) => (
              <React.Fragment key={key}>
                <Tooltip title={title} placement="top" arrow>
                  <IconButton
                    onMouseDown={(e) => { e.preventDefault(); action(); }}
                    size="small"
                    sx={{
                      padding: "5px",
                      borderRadius: "4px",
                      color: danger ? "#dc2626" : "#374151",
                      "&:hover": { backgroundColor: danger ? "#fef2f2" : theme.palette.action.hover },
                    }}
                  >
                    {icon}
                  </IconButton>
                </Tooltip>
                {separator && (
                  <Box sx={{ width: "1px", height: "20px", backgroundColor: borderPalette.light, mx: "2px" }} />
                )}
              </React.Fragment>
            ))}
          </Box>
        </BubbleMenu>
      )}

      <style>
        {`
          .vw-tiptap-content .ProseMirror {
            outline: none !important;
            box-shadow: none !important;
            min-height: ${height};
          }
          .vw-tiptap-content .ProseMirror p {
            margin: 4px 0;
            font-size: 13px;
            line-height: 1.5;
          }
          .vw-tiptap-content .ProseMirror p.is-editor-empty:first-child::before {
            content: attr(data-placeholder);
            color: #98A2B3;
            pointer-events: none;
            float: left;
            height: 0;
            font-size: 13px;
          }
          .vw-tiptap-content .ProseMirror table {
            border-collapse: collapse;
            width: 100%;
            margin: 8px 0;
          }
          .vw-tiptap-content .ProseMirror th,
          .vw-tiptap-content .ProseMirror td {
            border: 1px solid ${borderPalette.dark};
            padding: 6px 8px;
            font-size: 13px;
            min-width: 60px;
          }
          .vw-tiptap-content .ProseMirror th {
            background-color: #f3f4f6;
            font-weight: 600;
          }
          .vw-tiptap-content .ProseMirror ul,
          .vw-tiptap-content .ProseMirror ol {
            padding-left: 20px;
            margin: 4px 0;
            font-size: 13px;
          }
          .vw-tiptap-content .ProseMirror a {
            color: #13715B;
            text-decoration: underline;
          }
        `}
      </style>
    </Stack>
  );
};

export default RichTextEditor;
