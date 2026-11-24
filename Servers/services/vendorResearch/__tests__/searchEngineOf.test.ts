import { detectProvider } from "../../../advisor/llmModelFactory";
import { inspect } from "util";
import {
  type SearchSpec,
  searchEngineOf,
  searchEngineWith,
  searchSpecOf,
  withoutBrave,
} from "../searchEngineOf";

/** A row of `llm_keys` as the settings of an organization store it, for the fields this reads. */
const row = (name: string | null | undefined, url: string | null | undefined) => ({ name, url });

/** The URLs the app stores for the providers it knows (utils/llmKey.utils.ts). */
const STORED = {
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1/",
  openrouter: "https://openrouter.ai/api/v1/",
};

describe("searchEngineOf", () => {
  describe("a key of Anthropic", () => {
    it("searches with Claude when it points at the API of Anthropic, as the app stores it", () => {
      expect(searchEngineOf(row("Anthropic", STORED.anthropic))).toBe("anthropic");
    });

    it.each([
      "https://api.anthropic.com",
      "https://api.anthropic.com/",
      "https://api.anthropic.com/v1/",
      "https://API.Anthropic.com/v1",
      "https://api.anthropic.com:443/v1",
    ])("searches with Claude for the address %p", (url) => {
      expect(searchEngineOf(row("Anthropic", url))).toBe("anthropic");
    });

    it.each([
      ["null", null],
      ["undefined", undefined],
      ["an empty text", ""],
    ])("searches with Claude when the key has no address: %s", (_name, url) => {
      // The model of such a key goes to the API of Anthropic, which is the default of the SDK.
      expect(searchEngineOf(row("Anthropic", url))).toBe("anthropic");
    });

    it.each(["Anthropic", "anthropic", "ANTHROPIC", "Claude", "My Claude key", "anthropic (team)"])(
      "is recognised by the same rule that picks the SDK of the model: the name %p",
      (name) => {
        // detectProvider decides which SDK builds the model, so a name it calls Anthropic is a
        // model that the Anthropic SDK calls, and only that model can use the search tool.
        expect(detectProvider(name)).toBe("Anthropic");
        expect(searchEngineOf(row(name, STORED.anthropic))).toBe("anthropic");
      },
    );

    it.each([
      ["a gateway", "https://llm-gateway.example/anthropic"],
      ["a gateway that names the API in its path", "https://gateway.example/api.anthropic.com/v1"],
      ["a host that only starts like the API", "https://api.anthropic.com.evil.example/v1"],
      ["a host that only ends like the API", "https://evil-api.anthropic.com.example/v1"],
      ["a sibling host of Anthropic", "https://console.anthropic.com/v1"],
      ["the bare domain", "https://anthropic.com/v1"],
      [
        "a login that spells the API before the real host",
        "https://api.anthropic.com@evil.example/v1",
      ],
      ["a host with a trailing dot", "https://api.anthropic.com./v1"],
      ["a local proxy", "http://localhost:8080"],
      ["an address on the network", "http://10.0.0.5:4000/anthropic"],
      ["Bedrock", "https://bedrock-runtime.us-east-1.amazonaws.com"],
    ])("falls back to the news of GDELT for %s", (_name, url) => {
      // A proxy or a gateway cannot be trusted to run the search tool of the API, and the key is
      // not allowed to try: the run would only spend its time on refusals.
      expect(searchEngineOf(row("Anthropic", url))).toBe("gdelt");
    });

    it.each([
      ["no scheme", "api.anthropic.com/v1"],
      ["text that is no address", "not an address"],
      ["a scheme alone", "https://"],
      ["white space", "   "],
    ])("falls back to the news of GDELT for an address that cannot be read: %s", (_name, url) => {
      expect(searchEngineOf(row("Anthropic", url))).toBe("gdelt");
    });
  });

  describe("every other key", () => {
    it("uses GDELT for OpenAI on its own API: its search is built only after its terms are read", () => {
      expect(searchEngineOf(row("OpenAI", STORED.openai))).toBe("gdelt");
    });

    it("uses GDELT for OpenAI with no address too", () => {
      expect(searchEngineOf(row("OpenAI", null))).toBe("gdelt");
      expect(searchEngineOf(row("OpenAI", ""))).toBe("gdelt");
    });

    it("uses GDELT for OpenRouter", () => {
      expect(searchEngineOf(row("OpenRouter", STORED.openrouter))).toBe("gdelt");
    });

    it.each([
      ["DeepSeek", "https://api.deepseek.com/v1"],
      ["a local model", "http://localhost:11434/v1"],
      ["a model served on the network", "http://gpu-box.internal:8000/v1"],
      ["a vLLM server", "https://vllm.example/v1"],
    ])("uses GDELT for a Custom key that points at %s", (_name, url) => {
      expect(searchEngineOf(row("Custom", url))).toBe("gdelt");
    });

    it("uses GDELT for a Custom key even when it points at the API of Anthropic", () => {
      // Its model is built by the OpenAI SDK, not the Anthropic one, so it has no search tool.
      expect(detectProvider("Custom")).toBe("OpenAI");
      expect(searchEngineOf(row("Custom", STORED.anthropic))).toBe("gdelt");
    });

    it.each([null, undefined, ""])("uses GDELT for a key with the name %p", (name) => {
      expect(searchEngineOf(row(name, STORED.anthropic))).toBe("gdelt");
    });
  });

  it("answers anthropic or gdelt and nothing else, whatever the key", () => {
    const names = ["Anthropic", "OpenAI", "OpenRouter", "Custom", "Claude", "", null, undefined];
    const urls = [...Object.values(STORED), "https://api.deepseek.com/v1", "", null, undefined];
    const answers = new Set<string>();
    for (const name of names) for (const url of urls) answers.add(searchEngineOf(row(name, url)));

    expect([...answers].sort()).toEqual(["anthropic", "gdelt"]);
  });

  it("reads the name and the address only: the key of the row is neither read nor returned", () => {
    const key = "sk-ant-this-must-not-travel";
    const keyRow = { id: 4, name: "Anthropic", url: STORED.anthropic, key, model: "claude-x" };

    const engine = searchEngineOf(keyRow);

    expect(engine).toBe("anthropic");
    expect(JSON.stringify(engine)).not.toContain("sk-ant");
  });

  it("does not throw for a row that is not the shape the database gives", () => {
    expect(searchEngineOf({} as never)).toBe("gdelt");
    expect(searchEngineOf({ name: "Anthropic", url: 42 } as never)).toBe("gdelt");
    expect(searchEngineOf({ name: 42, url: STORED.anthropic } as never)).toBe("gdelt");
  });

  it("is a closed set for the spec of a run", () => {
    const anthropic: SearchSpec = { engine: "anthropic" };
    const brave: SearchSpec = { engine: "brave" };
    const gdelt: SearchSpec = { engine: "gdelt" };
    // @ts-expect-error OpenAI has no engine here until its terms are read.
    const openai: SearchSpec = { engine: "openai" };

    expect([anthropic.engine, brave.engine, gdelt.engine, openai.engine]).toEqual([
      "anthropic",
      "brave",
      "gdelt",
      "openai",
    ]);
  });
});

describe("searchEngineWith", () => {
  it("turns GDELT into Brave when the organization has a Brave key", () => {
    expect(searchEngineWith(row("OpenRouter", STORED.openrouter), true)).toBe("brave");
    expect(searchEngineWith(row("OpenAI", STORED.openai), true)).toBe("brave");
    expect(searchEngineWith(row("Anthropic", "https://gateway.example/anthropic"), true)).toBe(
      "brave",
    );
  });

  it("keeps Claude's search for a key of Anthropic on its own API", () => {
    expect(searchEngineWith(row("Anthropic", STORED.anthropic), true)).toBe("anthropic");
    expect(searchEngineWith(row("Anthropic", STORED.anthropic), false)).toBe("anthropic");
  });

  it("is searchEngineOf without a Brave key", () => {
    expect(searchEngineWith(row("OpenRouter", STORED.openrouter), false)).toBe("gdelt");
  });
});

describe("searchSpecOf", () => {
  const BRAVE_KEY = "BSA-this-must-not-travel";

  it("searches with Brave, with the key, for a key with no search of its own", () => {
    const spec = searchSpecOf(row("OpenRouter", STORED.openrouter), BRAVE_KEY);
    expect(spec.engine).toBe("brave");
    expect(spec.braveKey).toBe(BRAVE_KEY);
  });

  it("keeps Claude's search for a key of Anthropic, with the Brave key for the fallback", () => {
    const spec = searchSpecOf(row("Anthropic", STORED.anthropic), BRAVE_KEY);
    expect(spec.engine).toBe("anthropic");
    expect(spec.braveKey).toBe(BRAVE_KEY);
  });

  it.each([null, ""])("has no Brave key and no Brave engine with %p", (stored) => {
    const spec = searchSpecOf(row("OpenRouter", STORED.openrouter), stored);
    expect(spec).toEqual({ engine: "gdelt" });
    expect(spec.braveKey).toBeUndefined();
  });

  it("leaves the key out of a JSON copy, a log, a spread and the list of its keys", () => {
    const spec = searchSpecOf(row("OpenRouter", STORED.openrouter), BRAVE_KEY);

    expect(JSON.stringify(spec)).not.toContain(BRAVE_KEY);
    expect(inspect(spec, { depth: 5 })).not.toContain(BRAVE_KEY);
    expect(`${JSON.stringify({ ...spec })}`).not.toContain(BRAVE_KEY);
    expect(Object.keys(spec)).toEqual(["engine"]);
  });
});

describe("withoutBrave", () => {
  it("searches GDELT in place of Brave, and drops the Brave fallback of Claude's search", () => {
    const brave = searchSpecOf(row("OpenRouter", STORED.openrouter), "BSA-key-0001");
    const claude = searchSpecOf(row("Anthropic", STORED.anthropic), "BSA-key-0001");

    expect(withoutBrave(brave)).toEqual({ engine: "gdelt" });
    expect(withoutBrave(brave)?.braveKey).toBeUndefined();
    expect(withoutBrave(claude)).toEqual({ engine: "anthropic" });
    expect(withoutBrave(claude)?.braveKey).toBeUndefined();
    expect(withoutBrave(undefined)).toBeUndefined();
  });
});
