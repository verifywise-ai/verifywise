/**
 * A PDF writer for the tests of the PDF reader: a document of pages of text lines in Helvetica,
 * with the cross-reference table written out so that no reader has to repair the file.
 *
 * `info` becomes the document information dictionary (`Title`, `CreationDate`, `ModDate`).
 */
export function makePdf(pages: string[][], info: Record<string, string> = {}): Buffer {
  const objects: Array<string | null> = [];
  const add = (body: string | null): number => objects.push(body);
  const escape = (text: string) => text.replace(/([()\\])/g, "\\$1");

  const catalog = add(null);
  const pageTree = add(null);
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids: string[] = [];
  for (const lines of pages) {
    const stream = `BT /F1 11 Tf 14 TL 50 740 Td ${lines
      .map((line) => `(${escape(line)}) Tj T*`)
      .join(" ")} ET`;
    const content = add(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
    const page = add(
      `<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
    );
    kids.push(`${page} 0 R`);
  }
  objects[pageTree - 1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pageTree} 0 R >>`;

  let infoReference = "";
  const entries = Object.entries(info);
  if (entries.length > 0) {
    const id = add(
      `<< ${entries.map(([key, value]) => `/${key} (${escape(value)})`).join(" ")} >>`,
    );
    infoReference = ` /Info ${id} 0 R`;
  }

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R${infoReference} >>\n`;
  out += `startxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
