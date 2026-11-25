/**
 * Which search a research run uses, told from the key it researches with. A run still needs
 * nothing beyond the LLM key of the organization, and every run searches:
 *
 * - **anthropic**: the key is Anthropic's own and points at its API (or at no address, which is
 *   the same API). The model of the key can run Claude's `web_search` tool, which is billed to the
 *   key (see webResearch/providerSearch.ts).
 * - **gdelt**: every other key. OpenRouter, a Custom key (DeepSeek, a local model), a key that
 *   points at a proxy or a gateway, and OpenAI's: the news of the last three months, through the
 *   GDELT Project, at no charge (see webResearch/gdeltSearch.ts). It is also where an Anthropic run
 *   goes when the key turns out not to be allowed to search.
 *
 * An OpenAI key has no search of its own here. Its Responses API has a web search tool, but
 * OpenAI's Service Terms were not read (their site refuses an automated reader), so nothing is
 * built on them until a person has read them in a browser. Until then an OpenAI key searches the
 * news through GDELT like the keys that have no search at all.
 *
 * Only a name and an address are read. The key itself never comes in here, so it cannot leave.
 *
 * An organization can also store a Brave Search key (see utils/vendorResearch.utils.ts). A key
 * that would search GDELT then searches with Brave (`brave`), and GDELT stays behind it; a key of
 * Anthropic keeps Claude's search, with Brave behind it before GDELT (see `createRunSearch`). The
 * Brave key goes into the `SearchSpec` of the run only, as a property that is not enumerable, so
 * that a log line, a JSON copy or a trace that takes the spec whole never holds it.
 */
import { detectProvider } from "../../advisor/llmModelFactory";

/**
 * The engines a run can search with: Claude's own web search, Brave Search with the organization's
 * key, or the news of the GDELT Project.
 */
export type SearchEngineChoice = "anthropic" | "brave" | "gdelt";

/** How a run searches. The pipeline hands it to the researcher, which builds the engine of the run. */
export interface SearchSpec {
  readonly engine: SearchEngineChoice;
  /**
   * The organization's Brave Search key: the engine of `brave`, and the fallback of `anthropic`
   * before GDELT. Absent when the organization has none. Never logged, traced or stored; built by
   * `searchSpecOf`, it is not enumerable, so `JSON.stringify` and a log of the spec leave it out.
   */
  readonly braveKey?: string;
}

/** The only host whose API runs Claude's search tool. */
const ANTHROPIC_API_HOST = "api.anthropic.com";

/** The row of `llm_keys` as far as the choice reads it: what the key is called and where it points. */
export interface KeyRowForSearch {
  name?: string | null;
  url?: string | null;
}

/**
 * Whether the address of a key is the API of Anthropic. No address is: the SDK then calls its own
 * default, the same API. An address that cannot be read is not, and neither is any other host: a
 * proxy or a gateway is not trusted to run the tool, and the host is compared whole, so a name
 * that only starts or ends like it, a login before it or a path after it does not pass.
 */
function pointsAtAnthropic(url: unknown): boolean {
  if (url === undefined || url === null || url === "") return true;
  if (typeof url !== "string") return false;
  try {
    return new URL(url).hostname === ANTHROPIC_API_HOST;
  } catch {
    return false;
  }
}

/**
 * The search engine of a research key: `anthropic` for a key of Anthropic that calls its own API,
 * `gdelt` for every other key. The provider is told by `detectProvider`, which is also what picks
 * the SDK that builds the model, so a key is searched with Claude only when Claude's SDK calls it.
 * It never throws.
 */
export function searchEngineOf(row: KeyRowForSearch): SearchEngineChoice {
  const name = typeof row?.name === "string" ? row.name : null;
  return detectProvider(name) === "Anthropic" && pointsAtAnthropic(row?.url)
    ? "anthropic"
    : "gdelt";
}

/**
 * The engine of a research key once the organization's Brave key is counted: a key that would
 * search GDELT searches with Brave when the organization has a Brave key; a key of Anthropic keeps
 * Claude's search (Brave is then its fallback, which the spec carries). It never throws.
 */
export function searchEngineWith(
  row: KeyRowForSearch,
  braveConfigured: boolean,
): SearchEngineChoice {
  const own = searchEngineOf(row);
  return own === "gdelt" && braveConfigured ? "brave" : own;
}

/**
 * The search of a run, from the row of its research key and the organization's Brave key (null or
 * empty for none). The Brave key is put on the spec as a property that is not enumerable (see
 * `SearchSpec.braveKey`); it is left off an engine that cannot use it.
 */
export function searchSpecOf(row: KeyRowForSearch, braveKey: string | null): SearchSpec {
  const usable = typeof braveKey === "string" && braveKey !== "" ? braveKey : null;
  const spec: { engine: SearchEngineChoice; braveKey?: string } = {
    engine: searchEngineWith(row, usable !== null),
  };
  if (usable !== null) {
    Object.defineProperty(spec, "braveKey", { value: usable, enumerable: false });
  }
  return spec;
}

/**
 * The spec without Brave: a run whose search answers are recorded to a file (the evaluation's
 * `--record`) must not search with Brave, whose answers may not be kept. A `brave` spec becomes
 * the news of GDELT, and an `anthropic` one loses its Brave fallback.
 */
export function withoutBrave(spec: SearchSpec | undefined): SearchSpec | undefined {
  if (spec === undefined) return undefined;
  return { engine: spec.engine === "brave" ? "gdelt" : spec.engine };
}
