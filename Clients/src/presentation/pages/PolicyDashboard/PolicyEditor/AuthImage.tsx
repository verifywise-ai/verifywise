import React, { useEffect, useState, useCallback, useRef } from "react";
import { NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import TipTapImage from "@tiptap/extension-image";
import { alpha } from "@mui/material";
import { store } from "../../../../application/redux/store";
import { palette } from "../../../themes/palette";

const { editor: editorColors, text } = palette;

/** Auth-aware TipTap image node view with drag-to-resize. */
const AuthImage: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const src = node.attrs.src || "";
  const alt = node.attrs.alt || "";
  const width = node.attrs.width as number | null;
  const isApiUrl = src.startsWith("/api/") || src.includes("/api/file-manager/");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    if (!isApiUrl || !src) return;
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const token = store.getState().auth.authToken;
        const res = await fetch(src, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (!cancelled) setBlobUrl(URL.createObjectURL(blob));
      } catch (e: any) {
        if (e.name !== "AbortError" && !cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [src, isApiUrl]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startXRef.current = e.clientX;
      startWidthRef.current = imgRef.current?.offsetWidth || 300;

      const onMove = (ev: MouseEvent) => {
        const diff = ev.clientX - startXRef.current;
        const newWidth = Math.max(100, startWidthRef.current + diff);
        updateAttributes({ width: newWidth });
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [updateAttributes],
  );

  const displaySrc = isApiUrl ? blobUrl : src;

  return (
    <NodeViewWrapper>
      {error ? (
        <div
          style={{
            background: editorColors.imageErrorBg,
            color: editorColors.imageErrorText,
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: "0.9rem",
            textAlign: "center",
            margin: "12px 0",
          }}
        >
          Image not found
        </div>
      ) : displaySrc ? (
        <div
          style={{
            position: "relative",
            display: "inline-block",
            margin: "12px 0",
            outline: selected ? "2px solid brand.primary" : "none",
            borderRadius: 8,
          }}
        >
          <img
            ref={imgRef}
            src={displaySrc}
            alt={alt}
            style={{
              display: "block",
              width: width ? `${width}px` : undefined,
              maxWidth: "100%",
              borderRadius: 8,
            }}
          />
          {selected && (
            <div
              onMouseDown={handleResizeStart}
              style={{
                position: "absolute",
                right: -5,
                bottom: -5,
                width: 12,
                height: 12,
                backgroundColor: "brand.primary",
                border: "2px solid background.main",
                borderRadius: 2,
                cursor: "nwse-resize",
                boxShadow: `0 1px 3px ${alpha(text.black, 0.3)}`,
              }}
            />
          )}
        </div>
      ) : (
        <div
          style={{
            background: editorColors.imagePlaceholderBg,
            color: editorColors.imagePlaceholderText,
            padding: "16px 24px",
            borderRadius: 6,
            textAlign: "center",
            fontSize: "0.9rem",
            margin: "12px 0",
          }}
        >
          Loading image...
        </div>
      )}
    </NodeViewWrapper>
  );
};

export const AuthImageExtension = TipTapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => (el.getAttribute("width") ? Number(el.getAttribute("width")) : null),
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(AuthImage);
  },
});
