import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import VersionDiffModal from "./VersionDiffModal";

interface Message {
  role: string;
  content: string;
}
interface Version {
  version: number;
  content: Message[];
  model: string | null;
  config: Record<string, any> | null;
}

const versionA: Version = {
  version: 1,
  content: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Summarize {{topic}}." },
  ],
  model: "openai/gpt-4",
  config: { temperature: 0.7 },
};

const versionB: Version = {
  version: 2,
  content: [
    { role: "system", content: "You are a very helpful assistant." },
    { role: "user", content: "Summarize {{topic}}." },
    { role: "assistant", content: "Sure, I can help with that." },
  ],
  model: "openai/gpt-4-turbo",
  config: { temperature: 0.9, max_tokens: 512 },
};

describe("VersionDiffModal", () => {
  it("renders nothing when versionA is null", () => {
    renderWithProviders(
      <VersionDiffModal isOpen={true} onClose={vi.fn()} versionA={null} versionB={versionB} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/vs v/)).not.toBeInTheDocument();
  });

  it("renders nothing when versionB is null", () => {
    renderWithProviders(
      <VersionDiffModal isOpen={true} onClose={vi.fn()} versionA={versionA} versionB={null} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not render modal content when isOpen is false", () => {
    renderWithProviders(
      <VersionDiffModal
        isOpen={false}
        onClose={vi.fn()}
        versionA={versionA}
        versionB={versionB}
      />,
    );
    expect(screen.queryByText("v1 vs v2")).not.toBeInTheDocument();
  });

  it("shows title, version headers, changed and added rows, and config diff", () => {
    renderWithProviders(
      <VersionDiffModal isOpen={true} onClose={vi.fn()} versionA={versionA} versionB={versionB} />,
    );

    expect(screen.getByText("v1 vs v2")).toBeInTheDocument();

    // Changed row: system message content differs between A and B
    expect(screen.getByText("You are a helpful assistant.")).toBeInTheDocument();
    expect(screen.getByText("You are a very helpful assistant.")).toBeInTheDocument();

    // Unchanged row: identical user message appears once per side
    expect(screen.getAllByText("Summarize {{topic}}.")).toHaveLength(2);

    // Added row: assistant message only present in B
    expect(screen.getByText("Sure, I can help with that.")).toBeInTheDocument();
    expect(screen.getByText("(not present)")).toBeInTheDocument();

    // Config diff section — model and temperature changed, max_tokens added
    expect(screen.getByText("Configuration changes")).toBeInTheDocument();
    expect(screen.getByText("Model:")).toBeInTheDocument();
    expect(screen.getByText("openai/gpt-4")).toBeInTheDocument();
    expect(screen.getByText("openai/gpt-4-turbo")).toBeInTheDocument();
  });

  it("shows removed placeholder when versionA has more messages than versionB", () => {
    const shorter: Version = { ...versionB, content: [versionB.content[0]] };
    renderWithProviders(
      <VersionDiffModal isOpen={true} onClose={vi.fn()} versionA={versionA} versionB={shorter} />,
    );
    expect(screen.getByText("(removed)")).toBeInTheDocument();
  });

  it("shows empty diff state when both versions have identical, empty content and config", () => {
    const same: Version = { version: 1, content: [], model: null, config: null };
    const same2: Version = { version: 1, content: [], model: null, config: null };
    renderWithProviders(
      <VersionDiffModal isOpen={true} onClose={vi.fn()} versionA={same} versionB={same2} />,
    );
    expect(screen.getByText("No differences found")).toBeInTheDocument();
    expect(screen.queryByText("Configuration changes")).not.toBeInTheDocument();
  });

  it("does not render config diff section when model and config are identical", () => {
    const identicalContent: Version = {
      ...versionA,
      content: [{ role: "system", content: "Same" }],
    };
    const identicalContent2: Version = {
      ...versionA,
      content: [{ role: "system", content: "Different" }],
    };
    renderWithProviders(
      <VersionDiffModal
        isOpen={true}
        onClose={vi.fn()}
        versionA={identicalContent}
        versionB={identicalContent2}
      />,
    );
    expect(screen.queryByText("Configuration changes")).not.toBeInTheDocument();
  });

  it("shows (empty) placeholder for a message with blank content", () => {
    const withEmpty: Version = { ...versionA, content: [{ role: "user", content: "" }] };
    const withEmpty2: Version = { ...versionB, content: [{ role: "user", content: "" }] };
    renderWithProviders(
      <VersionDiffModal isOpen={true} onClose={vi.fn()} versionA={withEmpty} versionB={withEmpty2} />,
    );
    expect(screen.getAllByText("(empty)")).toHaveLength(2);
  });
});
