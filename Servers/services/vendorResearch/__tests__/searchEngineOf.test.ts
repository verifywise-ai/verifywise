import { detectProvider } from "../../../advisor/llmModelFactory";
import { type SearchSpec, searchEngineOf } from "../searchEngineOf";

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
    const gdelt: SearchSpec = { engine: "gdelt" };
    // @ts-expect-error OpenAI has no engine here until its terms are read.
    const openai: SearchSpec = { engine: "openai" };

    expect([anthropic.engine, gdelt.engine, openai.engine]).toEqual([
      "anthropic",
      "gdelt",
      "openai",
    ]);
  });
});
