import React from "react";
import type { Editor } from "@tiptap/react";
import {
  Underline as UnderlineIcon,
  Bold,
  Italic,
  Strikethrough,
  ListOrdered,
  List,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link,
  Unlink,
  Image,
  Redo2,
  Undo2,
  Quote,
  Highlighter,
  Table,
  Code,
  Minus,
  ListChecks,
  SuperscriptIcon,
  SubscriptIcon,
  Palette,
  Search,
} from "lucide-react";
import { type ToolbarKey } from "./toolbarTypes";

export interface ToolbarAction {
  key: ToolbarKey;
  title: string;
  icon: React.ReactNode;
  action: () => void;
}

export function getToolbarConfig(options: {
  editor: Editor | null;
  isUploadingImage: boolean;
  onInsertImage: () => void;
  onOpenLink: (selectedText: string) => void;
}): ToolbarAction[] {
  const { editor, isUploadingImage, onInsertImage, onOpenLink } = options;

  return [
    {
      key: "undo",
      title: "Undo",
      icon: <Undo2 size={16} />,
      action: () => editor?.chain().focus().undo().run(),
    },
    {
      key: "redo",
      title: "Redo",
      icon: <Redo2 size={16} />,
      action: () => editor?.chain().focus().redo().run(),
    },
    {
      key: "bold",
      title: "Bold",
      icon: <Bold size={16} />,
      action: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      key: "italic",
      title: "Italic",
      icon: <Italic size={16} />,
      action: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      key: "underline",
      title: "Underline",
      icon: <UnderlineIcon size={16} />,
      action: () => editor?.chain().focus().toggleUnderline().run(),
    },
    {
      key: "strike",
      title: "Strikethrough",
      icon: <Strikethrough size={16} />,
      action: () => editor?.chain().focus().toggleStrike().run(),
    },
    {
      key: "superscript",
      title: "Superscript",
      icon: <SuperscriptIcon size={16} />,
      action: () => editor?.chain().focus().toggleSuperscript().run(),
    },
    {
      key: "subscript",
      title: "Subscript",
      icon: <SubscriptIcon size={16} />,
      action: () => editor?.chain().focus().toggleSubscript().run(),
    },
    {
      key: "highlight",
      title: "Highlight",
      icon: <Highlighter size={16} />,
      action: () => editor?.chain().focus().toggleHighlight().run(),
    },
    {
      key: "code",
      title: "Code block",
      icon: <Code size={16} />,
      action: () => editor?.chain().focus().toggleCodeBlock().run(),
    },
    {
      key: "ol",
      title: "Numbered list",
      icon: <ListOrdered size={16} />,
      action: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      key: "ul",
      title: "Bulleted list",
      icon: <List size={16} />,
      action: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      key: "taskList",
      title: "Task list",
      icon: <ListChecks size={16} />,
      action: () => editor?.chain().focus().toggleTaskList().run(),
    },
    {
      key: "blockquote",
      title: "Blockquote",
      icon: <Quote size={16} />,
      action: () => editor?.chain().focus().toggleBlockquote().run(),
    },
    {
      key: "hr",
      title: "Horizontal rule",
      icon: <Minus size={16} />,
      action: () => editor?.chain().focus().setHorizontalRule().run(),
    },
    {
      key: "align-left",
      title: "Align left",
      icon: <AlignLeft size={16} />,
      action: () => editor?.chain().focus().setTextAlign("left").run(),
    },
    {
      key: "align-center",
      title: "Align center",
      icon: <AlignCenter size={16} />,
      action: () => editor?.chain().focus().setTextAlign("center").run(),
    },
    {
      key: "align-right",
      title: "Align right",
      icon: <AlignRight size={16} />,
      action: () => editor?.chain().focus().setTextAlign("right").run(),
    },
    {
      key: "link",
      title: editor?.isActive("link") ? "Remove link" : "Insert link",
      icon: editor?.isActive("link") ? <Unlink size={16} /> : <Link size={16} />,
      action: () => {
        if (!editor) return;
        if (editor.isActive("link")) {
          editor.chain().focus().unsetLink().run();
          return;
        }
        const { from, to } = editor.state.selection;
        onOpenLink(from !== to ? editor.state.doc.textBetween(from, to) : "");
      },
    },
    {
      key: "image",
      title: isUploadingImage ? "Uploading..." : "Insert image",
      icon: <Image size={16} />,
      action: () => {
        if (!isUploadingImage) onInsertImage();
      },
    },
    {
      key: "table",
      title: "Insert table",
      icon: <Table size={16} />,
      action: () =>
        editor?.chain().focus().insertTable({ rows: 3, cols: 4, withHeaderRow: true }).run(),
    },
    {
      key: "color",
      title: "Text color",
      icon: <Palette size={16} />,
      action: () => {},
    },
    {
      key: "search",
      title: "Find & replace",
      icon: <Search size={16} />,
      action: () => {},
    },
  ];
}
