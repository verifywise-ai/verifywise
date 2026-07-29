/** Normalize legacy Slate HTML into TipTap-friendly markup. */
export function normalizeSlateHtml(html: string): string {
  let n = html.replace(
    /<div([^>]*?)data-slate-type="(h[1-6]|p|blockquote)"([^>]*)>/gi,
    (_m, before, tag, after) => `<${tag}${before}${after}>`,
  );
  n = n.replace(/<div[^>]*class="slate-editor"[^>]*>/gi, "");
  n = n.replace(/<span[^>]*data-slate-string="true"[^>]*>([^<]*)<\/span>/gi, "$1");
  n = n.replace(/<span[^>]*data-slate-leaf="true"[^>]*>/gi, "");
  n = n.replace(/<span[^>]*data-slate-node="text"[^>]*>/gi, "");
  n = n.replace(/\s*data-slate-[a-z-]+="[^"]*"/gi, "");
  n = n.replace(/\s*data-block-id="[^"]*"/gi, "");
  n = n.replace(/\s*class="slate-[^"]*"/gi, "");
  n = n.replace(/\s*style="position:\s*relative\s*;?\s*"/gi, "");
  n = n.replace(/\s*style=""/gi, "");
  n = n.replace(/\s*class=""/gi, "");
  n = n.replace(/<div>\s*([^<])/gi, "<p>$1");
  n = n.replace(/<\/div>/gi, "</p>");
  n = n.replace(/<\/p>\s*<\/p>/gi, "</p>");
  return n;
}
