import React from "react";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Box, Divider, IconButton, Tooltip, alpha } from "@mui/material";
import {
  Plus,
  X,
  Rows3,
  Columns3,
  TableCellsMerge,
  TableCellsSplit,
  ToggleLeft,
  Trash2,
} from "lucide-react";
import { palette } from "../../../themes/palette";

const { text, background, border, status } = palette;

interface TableToolbarItem {
  key: string;
  title: string;
  icon: React.ReactNode;
  action: () => void;
  separator?: boolean;
  danger?: boolean;
}

function getTableToolbarConfig(editor: Editor): TableToolbarItem[] {
  return [
    {
      key: "addRowBefore",
      title: "Add row above",
      icon: <Plus size={14} />,
      action: () => editor.chain().focus().addRowBefore().run(),
    },
    {
      key: "addRowAfter",
      title: "Add row below",
      icon: <Rows3 size={14} />,
      action: () => editor.chain().focus().addRowAfter().run(),
    },
    {
      key: "deleteRow",
      title: "Delete row",
      icon: <X size={14} />,
      action: () => editor.chain().focus().deleteRow().run(),
      separator: true,
    },
    {
      key: "addColumnBefore",
      title: "Add column left",
      icon: <Plus size={14} />,
      action: () => editor.chain().focus().addColumnBefore().run(),
    },
    {
      key: "addColumnAfter",
      title: "Add column right",
      icon: <Columns3 size={14} />,
      action: () => editor.chain().focus().addColumnAfter().run(),
    },
    {
      key: "deleteColumn",
      title: "Delete column",
      icon: <X size={14} />,
      action: () => editor.chain().focus().deleteColumn().run(),
      separator: true,
    },
    {
      key: "mergeCells",
      title: "Merge cells",
      icon: <TableCellsMerge size={14} />,
      action: () => editor.chain().focus().mergeCells().run(),
    },
    {
      key: "splitCell",
      title: "Split cell",
      icon: <TableCellsSplit size={14} />,
      action: () => editor.chain().focus().splitCell().run(),
      separator: true,
    },
    {
      key: "toggleHeaderRow",
      title: "Toggle header row",
      icon: <ToggleLeft size={14} />,
      action: () => editor.chain().focus().toggleHeaderRow().run(),
    },
    {
      key: "toggleHeaderColumn",
      title: "Toggle header column",
      icon: <ToggleLeft size={14} />,
      action: () => editor.chain().focus().toggleHeaderColumn().run(),
      separator: true,
    },
    {
      key: "deleteTable",
      title: "Delete table",
      icon: <Trash2 size={14} />,
      action: () => editor.chain().focus().deleteTable().run(),
      danger: true,
    },
  ];
}

export interface PolicyTableBubbleMenuProps {
  editor: Editor;
}

/** Floating TipTap bubble menu for table editing actions. */
export function PolicyTableBubbleMenu({ editor }: PolicyTableBubbleMenuProps) {
  const tableToolbarConfig = getTableToolbarConfig(editor);

  return (
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
          backgroundColor: background.main,
          border: "1px solid",
          borderColor: border.dark,
          borderRadius: "6px",
          boxShadow: `0 4px 12px ${alpha(text.black, 0.12)}, 0 1px 3px ${alpha(text.black, 0.08)}`,
        }}
      >
        {tableToolbarConfig.map(({ key, title, icon, action, separator, danger }) => (
          <React.Fragment key={key}>
            <Tooltip title={title} placement="top" arrow>
              <IconButton
                onMouseDown={(e) => {
                  e.preventDefault();
                  action();
                }}
                size="small"
                sx={{
                  "padding": "5px",
                  "borderRadius": "4px",
                  "color": danger ? status.error.text : text.secondary,
                  "&:hover": {
                    backgroundColor: danger ? status.error.bg : background.hover,
                  },
                }}
              >
                {icon}
              </IconButton>
            </Tooltip>
            {separator && (
              <Divider
                orientation="vertical"
                flexItem
                sx={{ mx: "2px", borderColor: status.default.border }}
              />
            )}
          </React.Fragment>
        ))}
      </Box>
    </BubbleMenu>
  );
}
