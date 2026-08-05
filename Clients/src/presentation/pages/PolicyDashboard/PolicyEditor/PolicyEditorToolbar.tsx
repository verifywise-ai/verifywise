import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import Select from "../../../components/Inputs/Select";
import { palette } from "../../../themes/palette";
import { defaultToolbarState } from "./toolbarTypes";
import { getToolbarConfig } from "./toolbarConfig";
import { ColorPickerPopover } from "./ColorPickerPopover";

const { background, brand, risk } = palette;
const TOOLBAR_ACTIVE_BG = risk.veryLow.bg;

export interface PolicyEditorToolbarProps {
  editor: Editor | null;
  isUploadingImage: boolean;
  onInsertImage: () => void;
  onOpenLink: (selectedText: string) => void;
  onOpenFindReplace: (anchorEl: HTMLElement) => void;
}

/** Main TipTap toolbar: block type, formatting actions, color picker, word count. */
export function PolicyEditorToolbar({
  editor,
  isUploadingImage,
  onInsertImage,
  onOpenLink,
  onOpenFindReplace,
}: PolicyEditorToolbarProps) {
  const [toolbarState, setToolbarState] = useState(defaultToolbarState);
  const [currentBlockType, setCurrentBlockType] = useState<string>("p");
  const [colorAnchorEl, setColorAnchorEl] = useState<HTMLElement | null>(null);

  const updateToolbarState = useCallback(() => {
    if (!editor) return;
    try {
      let blockType = "p";
      if (editor.isActive("heading", { level: 1 })) blockType = "h1";
      else if (editor.isActive("heading", { level: 2 })) blockType = "h2";
      else if (editor.isActive("heading", { level: 3 })) blockType = "h3";
      else if (editor.isActive("blockquote")) blockType = "blockquote";

      setCurrentBlockType(blockType);
      setToolbarState({
        "bold": editor.isActive("bold"),
        "italic": editor.isActive("italic"),
        "underline": editor.isActive("underline"),
        "strike": editor.isActive("strike"),
        "ol": editor.isActive("orderedList"),
        "ul": editor.isActive("bulletList"),
        "align-left": editor.isActive({ textAlign: "left" }),
        "align-center": editor.isActive({ textAlign: "center" }),
        "align-right": editor.isActive({ textAlign: "right" }),
        "link": editor.isActive("link"),
        "highlight": editor.isActive("highlight"),
        "blockquote": blockType === "blockquote",
        "code": editor.isActive("codeBlock"),
        "undo": false,
        "redo": false,
        "image": false,
        "table": editor.isActive("table"),
        "hr": false,
        "taskList": editor.isActive("taskList"),
        "superscript": editor.isActive("superscript"),
        "subscript": editor.isActive("subscript"),
        "color": false,
        "search": false,
      });
    } catch {
      // ignore
    }
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    updateToolbarState();
    editor.on("selectionUpdate", updateToolbarState);
    editor.on("transaction", updateToolbarState);
    return () => {
      editor.off("selectionUpdate", updateToolbarState);
      editor.off("transaction", updateToolbarState);
    };
  }, [editor, updateToolbarState]);

  const handleBlockTypeChange = (event: { target: { value: string | number } }) => {
    const newType = String(event.target.value);
    setCurrentBlockType(newType);
    if (!editor) return;
    if (newType === "p") editor.chain().focus().setParagraph().run();
    else if (newType === "h1") editor.chain().focus().toggleHeading({ level: 1 }).run();
    else if (newType === "h2") editor.chain().focus().toggleHeading({ level: 2 }).run();
    else if (newType === "h3") editor.chain().focus().toggleHeading({ level: 3 }).run();
    setTimeout(() => updateToolbarState(), 0);
  };

  const toolbarConfig = getToolbarConfig({
    editor,
    isUploadingImage,
    onInsertImage,
    onOpenLink,
  });

  return (
    <>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 0.5,
          mb: "8px",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <Box sx={{ mr: 2 }}>
          <Select
            id="block-type-select"
            value={currentBlockType}
            onChange={handleBlockTypeChange}
            items={[
              { _id: "p", name: "Text" },
              { _id: "h1", name: "Header 1" },
              { _id: "h2", name: "Header 2" },
              { _id: "h3", name: "Header 3" },
            ]}
            sx={{ width: 120, height: "34px" }}
          />
        </Box>

        {toolbarConfig.map(({ key, title, icon, action }) => (
          <Tooltip key={key} title={title}>
            <IconButton
              onClick={(e) => {
                if (key === "color") {
                  setColorAnchorEl(e.currentTarget);
                  return;
                }
                if (key === "search") {
                  onOpenFindReplace(e.currentTarget);
                  return;
                }
                action?.();
                setTimeout(() => updateToolbarState(), 0);
              }}
              size="small"
              sx={{
                "padding": "6px",
                "borderRadius": "3px",
                "backgroundColor": toolbarState[key] ? TOOLBAR_ACTIVE_BG : background.main,
                "border": "1px solid",
                "borderColor": toolbarState[key] ? brand.primary : "transparent",
                "&:hover": { backgroundColor: background.surface },
              }}
            >
              {icon}
            </IconButton>
          </Tooltip>
        ))}

        {editor && (
          <Box sx={{ ml: "auto", display: "flex", gap: 2, alignItems: "center" }}>
            <Typography sx={{ fontSize: 11, color: "text.muted" }}>
              {editor.storage.characterCount.words()} words
            </Typography>
            <Typography sx={{ fontSize: 11, color: "text.muted" }}>
              {editor.storage.characterCount.characters()} characters
            </Typography>
          </Box>
        )}
      </Box>

      <ColorPickerPopover
        editor={editor}
        anchorEl={colorAnchorEl}
        onClose={() => setColorAnchorEl(null)}
      />
    </>
  );
}
