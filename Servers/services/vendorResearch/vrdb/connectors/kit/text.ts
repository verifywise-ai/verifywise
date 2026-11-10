/**
 * The text of a downloaded file, for the readers of the list kit: the bytes of one file of a
 * download decoded as the page reader decodes a page (`decodeBody`, which `bodyText` of the
 * connectors calls too): the charset that the Content-Type names, else the one a `<meta charset>`
 * in the first 2 KB names, else UTF-8, a byte that is not valid in the charset becoming U+FFFD,
 * never an error. A byte order mark that is left at the start of the text (a second one, or one that
 * a charset gave) is taken off, so that a first cell or a first key is never preceded by a
 * character nobody sees; nothing else is taken off. A file that is not in the download is not the
 * list.
 */
import { decodeBody } from "../../../../webResearch/readPage";
import { NotTheListError } from "../types";
import type { Fetched } from "./fileConnector";

const BYTE_ORDER_MARK = 0xfeff;

/** The text of file `index` of a download (`Fetched.buffers`), with the byte order mark off. */
export function textOf(fetched: Fetched, index: number): string {
  const { buffers, contentTypes } = fetched;
  if (!Number.isInteger(index) || index < 0 || index >= buffers.length) {
    throw new NotTheListError();
  }
  const text = decodeBody(buffers[index], contentTypes[index] ?? "");
  let start = 0;
  while (text.charCodeAt(start) === BYTE_ORDER_MARK) start += 1;
  return start === 0 ? text : text.slice(start);
}
