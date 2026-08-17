import { ChangeEvent, ReactNode, RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import { Box, GlobalStyles, Stack, Typography, useTheme } from "@mui/material";
import InsertLinkModal from "../../../components/Modals/InsertLinkModal/InsertLinkModal";
import { policyEditorStyles } from "./editorStyles";
import { usePolicyFindReplace } from "./usePolicyFindReplace";
import { FindReplacePopover } from "./FindReplacePopover";
import { PolicyTableBubbleMenu } from "./PolicyTableBubbleMenu";
import { PolicyToolbar } from "./PolicyToolbar";

export interface PolicyContentEditorProps {
  editor: Editor | null;
  contentError?: string;
  imageInputRef: RefObject<HTMLInputElement | null>;
  isUploadingImage: boolean;
  onImageFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  linkModalOpen: boolean;
  selectedTextForLink: string;
  onOpenLink: (selectedText: string) => void;
  onCloseLink: () => void;
  onInsertLink: (url: string, text?: string) => void;
  findReplace: ReturnType<typeof usePolicyFindReplace>;
  /** Sidebar rendered next to the editor surface (e.g. PolicyReviewPanel). */
  children?: ReactNode;
}

/** TipTap editor region: toolbar, find/replace, link modal, editor surface. */
export function PolicyContentEditor({
  editor,
  contentError,
  imageInputRef,
  isUploadingImage,
  onImageFileChange,
  linkModalOpen,
  selectedTextForLink,
  onOpenLink,
  onCloseLink,
  onInsertLink,
  findReplace,
  children,
}: PolicyContentEditorProps) {
  const theme = useTheme();

  return (
    <>
      <InsertLinkModal
        open={linkModalOpen}
        onClose={onCloseLink}
        onInsert={onInsertLink}
        selectedText={selectedTextForLink}
      />

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={onImageFileChange}
      />

      <PolicyToolbar
        editor={editor}
        isUploadingImage={isUploadingImage}
        onInsertImage={() => imageInputRef.current?.click()}
        onOpenLink={onOpenLink}
        onOpenFindReplace={findReplace.openFindReplace}
      />

      <FindReplacePopover
        anchorEl={findReplace.searchAnchorEl}
        onClose={findReplace.closeFindReplace}
        searchText={findReplace.searchText}
        onSearchTextChange={findReplace.setSearchText}
        replaceText={findReplace.replaceText}
        onReplaceTextChange={findReplace.setReplaceText}
        searchMatchCount={findReplace.searchMatchCount}
        onSearchNext={findReplace.handleSearchNext}
        onSearchPrev={findReplace.handleSearchPrev}
        onReplaceCurrent={findReplace.handleReplaceCurrent}
        onReplaceAll={findReplace.handleReplaceAll}
      />

      {/* ── Editor + sidebar ──────────────────────────────────────── */}
      <Stack direction="row" sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Editor */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: "auto",
            border: "1px solid",
            borderColor: "border.dark",
            borderRadius: "4px",
          }}
        >
          <EditorContent editor={editor} className="policy-tiptap-editor" />
          {editor && <PolicyTableBubbleMenu editor={editor} />}
          <GlobalStyles styles={policyEditorStyles} />
        </Box>

        {contentError && (
          <Typography
            component="span"
            color={theme.palette.status?.error?.text || theme.palette.error.main}
            sx={{ opacity: 0.8, fontSize: 11, mt: 1 }}
          >
            {contentError}
          </Typography>
        )}

        {children}
      </Stack>
    </>
  );
}
