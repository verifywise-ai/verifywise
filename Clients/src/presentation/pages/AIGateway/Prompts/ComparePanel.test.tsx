import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ComparePanel from "./ComparePanel";

interface Version {
  id: number;
  version: number;
  content: Array<{ role: string; content: string }>;
  variables: string[] | null;
  model: string | null;
  config: Record<string, any> | null;
}

const versions: Version[] = [
  {
    id: 1,
    version: 1,
    content: [{ role: "system", content: "You are v1." }],
    variables: null,
    model: "openai/gpt-4",
    config: { temperature: 0.5 },
  },
  {
    id: 2,
    version: 2,
    content: [{ role: "system", content: "You are v2." }],
    variables: null,
    model: "openai/gpt-4-turbo",
    config: { temperature: 0.9 },
  },
];

const endpoints = [{ slug: "prod", display_name: "Production" }];

/** Builds a fetch Response-like object simulating the SSE stream shape consumed by streamPromptTest. */
function makeSSEResponse(opts: {
  deltas?: string[];
  usage?: number;
  cost?: number;
  ok?: boolean;
  errorText?: string;
}) {
  const { deltas = [], usage, cost, ok = true, errorText } = opts;
  if (!ok) {
    return { ok: false, text: async () => errorText || "Something went wrong" };
  }
  const encoder = new TextEncoder();
  const lines: Uint8Array[] = [];
  deltas.forEach((d, i) => {
    const chunk: Record<string, any> = { choices: [{ delta: { content: d } }] };
    if (i === deltas.length - 1) {
      if (usage) chunk.usage = { total_tokens: usage };
      if (cost) chunk.cost_usd = cost;
    }
    lines.push(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
  });
  lines.push(encoder.encode("data: [DONE]\n\n"));

  let i = 0;
  const reader = {
    read: vi.fn(async () => {
      if (i < lines.length) return { done: false, value: lines[i++] };
      return { done: true, value: undefined };
    }),
    releaseLock: vi.fn(),
  };
  return { ok: true, body: { getReader: () => reader } };
}

/**
 * The shared Select component does not wire aria-labelledby to its visible
 * label, so the "Version A"/"Version B" comboboxes have no accessible name.
 * Select them by DOM order instead: Version A is first, Version B second.
 */
function selectVersions() {
  const comboboxes = screen.getAllByRole("combobox");
  fireEvent.mouseDown(comboboxes[0]);
  fireEvent.click(screen.getByRole("option", { name: "v1 — openai/gpt-4" }));
  fireEvent.mouseDown(comboboxes[1]);
  fireEvent.click(screen.getByRole("option", { name: "v2 — openai/gpt-4-turbo" }));
}

describe("ComparePanel", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("shows placeholder states before any version is selected", () => {
    renderWithProviders(
      <ComparePanel
        versions={versions}
        endpoints={endpoints}
        selectedEndpoint=""
        detectedVars={[]}
        variableValues={{}}
      />,
    );

    expect(screen.getByText("Select versions and send a message")).toBeInTheDocument();
    expect(screen.getByText("Output appears here")).toBeInTheDocument();
    // "Version A"/"Version B" appear twice each: the select label and the result column header
    expect(screen.getAllByText("Version A")).toHaveLength(2);
    expect(screen.getAllByText("Version B")).toHaveLength(2);
  });

  it("shows helper text about picking two versions when no variables are detected", () => {
    renderWithProviders(
      <ComparePanel
        versions={versions}
        endpoints={endpoints}
        selectedEndpoint="prod"
        detectedVars={[]}
        variableValues={{}}
      />,
    );
    expect(
      screen.getByText("Pick two prompt versions to compare their responses to the same input."),
    ).toBeInTheDocument();
  });

  it("shows variable-values helper text when variables are detected", () => {
    renderWithProviders(
      <ComparePanel
        versions={versions}
        endpoints={endpoints}
        selectedEndpoint="prod"
        detectedVars={["topic"]}
        variableValues={{ topic: "cats" }}
      />,
    );
    expect(
      screen.getByText("Variable values from the chat tab will be used for both versions."),
    ).toBeInTheDocument();
  });

  it("disables the send button until endpoint and both versions are selected", () => {
    renderWithProviders(
      <ComparePanel
        versions={versions}
        endpoints={endpoints}
        selectedEndpoint=""
        detectedVars={[]}
        variableValues={{}}
      />,
    );
    // The send control is icon-only (no accessible text), so find it among all buttons.
    const buttons = screen.getAllByRole("button");
    const send = buttons.find((b) => !b.textContent) as HTMLButtonElement;
    expect(send).toBeDisabled();
  });

  it("runs both versions on send and displays results with metrics", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeSSEResponse({ deltas: ["Hello A"], usage: 10, cost: 0.001 }))
      .mockResolvedValueOnce(makeSSEResponse({ deltas: ["Hello B"], usage: 20, cost: 0.002 }));

    renderWithProviders(
      <ComparePanel
        versions={versions}
        endpoints={endpoints}
        selectedEndpoint="prod"
        detectedVars={[]}
        variableValues={{}}
      />,
    );

    selectVersions();

    const textarea = screen.getByPlaceholderText("Type a message to compare...");
    fireEvent.change(textarea, { target: { value: "Hi there" } });

    const buttons = screen.getAllByRole("button");
    const send = buttons.find((b) => !b.textContent) as HTMLButtonElement;
    fireEvent.click(send);

    await waitFor(() => {
      expect(screen.getByText("Hello A")).toBeInTheDocument();
    });
    expect(screen.getByText("Hello B")).toBeInTheDocument();
    expect(screen.getByText("10 tokens")).toBeInTheDocument();
    expect(screen.getByText("20 tokens")).toBeInTheDocument();
    expect(screen.getByText("$0.0010")).toBeInTheDocument();
    expect(screen.getByText("$0.0020")).toBeInTheDocument();

    // Input is cleared after send
    expect((textarea as HTMLTextAreaElement).value).toBe("");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("sends message on Enter key press without Shift", async () => {
    global.fetch = vi.fn().mockResolvedValue(makeSSEResponse({ deltas: ["ok"] }));

    renderWithProviders(
      <ComparePanel
        versions={versions}
        endpoints={endpoints}
        selectedEndpoint="prod"
        detectedVars={[]}
        variableValues={{}}
      />,
    );

    selectVersions();

    const textarea = screen.getByPlaceholderText("Type a message to compare...");
    fireEvent.change(textarea, { target: { value: "Hi" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it("shows an error fallback in both columns when the stream request fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network down"));

    renderWithProviders(
      <ComparePanel
        versions={versions}
        endpoints={endpoints}
        selectedEndpoint="prod"
        detectedVars={[]}
        variableValues={{}}
      />,
    );

    selectVersions();

    const buttons = screen.getAllByRole("button");
    const send = buttons.find((b) => !b.textContent) as HTMLButtonElement;
    fireEvent.click(send);

    await waitFor(() => {
      expect(screen.getAllByText("Error: Network down").length).toBeGreaterThan(0);
    });
  });

  it("allows overriding the endpoint locally via the endpoint select", () => {
    renderWithProviders(
      <ComparePanel
        versions={versions}
        endpoints={[...endpoints, { slug: "staging", display_name: "Staging" }]}
        selectedEndpoint="prod"
        detectedVars={[]}
        variableValues={{}}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Select endpoint" }));
    fireEvent.click(screen.getByRole("option", { name: "Staging (staging)" }));

    expect(screen.getByRole("combobox", { name: "Select endpoint" })).toHaveTextContent(
      "Staging (staging)",
    );
  });
});
