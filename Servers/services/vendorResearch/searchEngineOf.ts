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
 */
import { detectProvider } from "../../advisor/llmModelFactory";

/** The engines a key can have: Claude's own web search, or the news of the GDELT Project. */
export type SearchEngineChoice = "anthropic" | "gdelt";

/** How a run searches. The pipeline hands it to the researcher, which builds the engine of the run. */
export interface SearchSpec {
  readonly engine: SearchEngineChoice;
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
