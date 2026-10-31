import { DESCRIPTION_MAX, DESCRIPTION_MIN } from "./jiraIncidents.constants";

type AdfNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
};

const BLOCK_SEPARATOR = "\n\n";

function inline(nodes: AdfNode[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === "text") return n.text ?? "";
      if (n.type === "hardBreak") return "\n";
      if (n.type === "mention") return String(n.attrs?.text ?? "");
      if (n.type === "emoji") return String(n.attrs?.text ?? n.attrs?.shortName ?? "");
      if (n.type === "inlineCard") return String(n.attrs?.url ?? "");
      return inline(n.content);
    })
    .join("");
}

function block(node: AdfNode): string {
  switch (node.type) {
    case "paragraph":
    case "heading":
    case "codeBlock":
      return inline(node.content);
    case "bulletList":
      return (node.content ?? []).map((item) => `- ${listItem(item)}`).join("\n");
    case "orderedList":
      return (node.content ?? []).map((item, i) => `${i + 1}. ${listItem(item)}`).join("\n");
    case "blockquote":
    case "panel":
      return blocks(node.content);
    case "rule":
      return "";
    default:
      return node.content ? blocks(node.content) : inline([node]);
  }
}

function listItem(item: AdfNode): string {
  return (item.content ?? []).map(block).filter(Boolean).join(" ");
}

function blocks(nodes: AdfNode[] | undefined): string {
  return (nodes ?? [])
    .map(block)
    .filter((s) => s.trim() !== "")
    .join(BLOCK_SEPARATOR);
}

/** Plain text from an Atlassian Document Format value; a plain string passes through. */
export function adfToText(doc: unknown): string {
  if (typeof doc === "string") return doc;
  if (!doc || typeof doc !== "object") return "";
  return blocks((doc as AdfNode).content).trim();
}

/** Summary, a blank line, then the body; padded with the key below 5 characters; cut to 32,767. */
export function buildIncidentDescription(
  summary: string,
  adfDescription: unknown,
  issueKey: string,
): string {
  const head = (summary ?? "").trim();
  const body = adfToText(adfDescription);
  let text = [head, body].filter(Boolean).join(BLOCK_SEPARATOR);
  if (text.trim().length < DESCRIPTION_MIN)
    text = text.trim() ? `${text.trim()} (${issueKey})` : issueKey;
  return text.slice(0, DESCRIPTION_MAX);
}
