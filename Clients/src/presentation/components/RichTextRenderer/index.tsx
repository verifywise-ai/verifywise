import React, { useEffect } from "react";
import { useRichTextSanitizer } from "../../../application/utils/richTextSanitizer";

export interface RichTextRendererProps {
  /** Raw HTML content to sanitize and render. */
  html: string;
  /**
   * Optional CSS class for the wrapping element.
   *
   * When `sandbox` is true, the class is applied to the iframe.
   * Otherwise it is applied to the div that hosts the sanitized HTML.
   */
  className?: string;
  /**
   * Render inside a sandboxed iframe for extra isolation.
   *
   * The iframe uses `sandbox="allow-same-origin"` so that same-origin
   * styles/resources still work, but scripts cannot execute.
   *
   * @default false
   */
  sandbox?: boolean;
  /**
   * Called when the sanitizer strips content from the provided HTML.
   *
   * Use this to show a warning banner/toast in the UI (e.g. Inna's UI).
   */
  onStripped?: () => void;
}

/**
 * Shared rich-text renderer for user-generated HTML.
 *
 * Sanitizes the provided HTML using the same allowlist as the backend and
 * renders the result. Optionally renders inside a sandboxed iframe for
 * defense-in-depth isolation.
 */
export const RichTextRenderer: React.FC<RichTextRendererProps> = ({
  html,
  className,
  sandbox = false,
  onStripped,
}) => {
  const { sanitizedHtml, wasStripped } = useRichTextSanitizer(html);

  useEffect(() => {
    if (wasStripped && onStripped) {
      onStripped();
    }
  }, [wasStripped, onStripped]);

  if (!sanitizedHtml) {
    return null;
  }

  if (sandbox) {
    return (
      <iframe
        className={className}
        srcDoc={sanitizedHtml}
        sandbox="allow-same-origin"
        style={{
          border: "none",
          width: "100%",
          minHeight: "80px",
        }}
        title="Rich text content"
      />
    );
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
};

export default RichTextRenderer;
