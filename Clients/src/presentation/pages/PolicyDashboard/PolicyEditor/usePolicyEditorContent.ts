import { ChangeEvent, Dispatch, SetStateAction, useCallback, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TipTapUnderline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import TipTapLink from "@tiptap/extension-link";
import {
  Table as TipTapTable,
  TableRow as TipTapTableRow,
  TableCell as TipTapTableCell,
  TableHeader as TipTapTableHeader,
} from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CharacterCount from "@tiptap/extension-character-count";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import TypographyExtension from "@tiptap/extension-typography";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { sanitizeRichText } from "../../../../application/utils/richTextSanitizer";
import { uploadFileToManager } from "../../../../application/repository/file.repository";
import { PolicyManagerModel } from "../../../../domain/models/Common/policy/policyManager.model";
import { PolicyFormData } from "../../../types/interfaces/i.policy";
import { AuthImageExtension } from "./AuthImage";
import { normalizeSlateHtml } from "./normalizeSlateHtml";
import { createSearchHighlightExtension } from "./searchHighlightExtension";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export interface UsePolicyEditorContentParams {
  policy: PolicyManagerModel | null;
  template: { title: string; tags: string[]; content: string } | undefined;
  setFormData: Dispatch<SetStateAction<PolicyFormData>>;
}

/** Owns the TipTap editor instance, image upload/insertion, and link modal state. */
export function usePolicyEditorContent({
  policy,
  template,
  setFormData,
}: UsePolicyEditorContentParams) {
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [openLink, setOpenLink] = useState(false);
  const [selectedTextForLink, setSelectedTextForLink] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isLoadingContentRef = useRef(false);

  // ── Shared image upload + insert helper ───────────────────────────
  // Single implementation backing drop, paste, and file-input uploads.
  const uploadAndInsertImage = async (
    file: File,
    insert: (attrs: { src: string; alt: string }) => void,
  ) => {
    setIsUploadingImage(true);
    try {
      const response = await uploadFileToManager({
        file,
        model_id: null,
        source: "policy_editor",
        signal: undefined,
      });
      const fileId = response.data.id;
      insert({ src: `/api/file-manager/${fileId}`, alt: file.name });
    } catch {
      // ignore
    } finally {
      setIsUploadingImage(false);
    }
  };

  // ── Compute initial editor content ──────────────────────────────
  const initialContent = (() => {
    const raw = policy?.content_html || template?.content || "";
    if (!raw) return "";
    return sanitizeRichText(normalizeSlateHtml(raw));
  })();

  // ── TipTap editor ─────────────────────────────────────────────────
  // Pass `deps` array so the editor re-creates when content changes
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        TipTapUnderline,
        Highlight,
        TextAlign.configure({ types: ["heading", "paragraph", "blockquote"] }),
        TipTapLink.configure({
          openOnClick: false,
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        }),
        AuthImageExtension.configure({ inline: false, allowBase64: true }),
        TipTapTable.configure({ resizable: true }),
        TipTapTableRow,
        TipTapTableCell,
        TipTapTableHeader,
        Placeholder.configure({ placeholder: "Start typing your policy content..." }),
        TaskList,
        TaskItem.configure({ nested: true }),
        CharacterCount,
        Superscript,
        Subscript,
        TypographyExtension,
        TextStyle,
        Color,
        createSearchHighlightExtension(),
      ],
      content: initialContent,
      autofocus: false,
      onUpdate: ({ editor: e }) => {
        if (isLoadingContentRef.current) return;
        setFormData((prev) => ({ ...prev, content: e.getHTML() }));
      },
      editorProps: {
        handleDrop: (view, event, _slice, moved) => {
          if (moved || !event.dataTransfer?.files?.length) return false;
          const file = event.dataTransfer.files[0];
          if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_SIZE) return false;
          event.preventDefault();
          // Capture position before async upload
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const dropPos = coords?.pos ?? view.state.selection.anchor;
          (async () => {
            await uploadAndInsertImage(file, (attrs) => {
              const node = view.state.schema.nodes.image.create(attrs);
              const tr = view.state.tr.insert(Math.min(dropPos, view.state.doc.content.size), node);
              view.dispatch(tr);
            });
          })();
          return true;
        },
        handlePaste: (view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;
          for (const item of Array.from(items)) {
            if (!item.type.startsWith("image/")) continue;
            const file = item.getAsFile();
            if (!file || file.size > MAX_IMAGE_SIZE) continue;
            event.preventDefault();
            (async () => {
              await uploadAndInsertImage(file, (attrs) => {
                const node = view.state.schema.nodes.image.create(attrs);
                const tr = view.state.tr.replaceSelectionWith(node);
                view.dispatch(tr);
              });
            })();
            return true;
          }
          return false;
        },
      },
    },
    [initialContent],
  );

  // ── Image upload handler (file input) ─────────────────────────────
  const handleImageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    if (!file.type.startsWith("image/")) return;
    if (file.size > MAX_IMAGE_SIZE) return;

    await uploadAndInsertImage(file, (attrs) => {
      editor?.chain().focus().setImage(attrs).run();
    });
  };

  // ── Link modal ────────────────────────────────────────────────────
  const handleOpenLink = useCallback((selectedText: string) => {
    setSelectedTextForLink(selectedText);
    setOpenLink(true);
  }, []);

  const handleCloseLink = useCallback(() => {
    setOpenLink(false);
    setSelectedTextForLink("");
  }, []);

  const handleInsertLink = useCallback(
    (url: string, text?: string) => {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      if (from !== to && !text) {
        editor.chain().focus().setLink({ href: url, target: "_blank" }).run();
      } else {
        const linkText = text || url;
        editor
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: linkText,
            marks: [
              {
                type: "link",
                attrs: {
                  href: url,
                  target: "_blank",
                  rel: "noopener noreferrer",
                },
              },
            ],
          })
          .run();
      }
    },
    [editor],
  );

  return {
    editor,
    imageInputRef,
    isUploadingImage,
    handleImageFileChange,
    openLink,
    selectedTextForLink,
    handleOpenLink,
    handleCloseLink,
    handleInsertLink,
  };
}
