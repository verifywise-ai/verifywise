import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import MLFlowTab from "../mlflow/MLFlowTab";
import AzureAIFoundryTab from "../azure-ai-foundry/AzureAIFoundryTab";

const granted = new Set<string>();
vi.mock("../../../../application/hooks/useCan", () => ({
  useCan: (key: string) => granted.has(key),
  useCanCheck: () => (key: string) => granted.has(key),
}));

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

vi.mock("../../../../application/hooks/useFormattedDate", () => ({
  default: () => (d: Date) => d.toISOString(),
}));

const notConfigured = { data: { data: { configured: false, models: [] } } };

const tabs = [
  ["MLflow", MLFlowTab, "Ask an Admin to set up MLflow."],
  ["Azure AI Foundry", AzureAIFoundryTab, "Ask an Admin to set up Azure AI Foundry."],
] as const;

describe.each(tabs)("%s tab", (_name, Tab, askText) => {
  beforeEach(() => {
    granted.clear();
    mockGet.mockReset();
    mockGet.mockResolvedValue(notConfigured);
    mockPost.mockReset();
    mockPost.mockResolvedValue({ data: {} });
  });

  it("hides Sync and the settings link from a read-only role", async () => {
    renderWithProviders(<Tab />);

    expect(await screen.findByText(askText)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sync/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Open settings")).not.toBeInTheDocument();
  });

  it("shows Sync to a role with model.edit, without the settings link", async () => {
    granted.add("model.edit");
    renderWithProviders(<Tab />);

    expect(await screen.findByText(askText)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sync/i })).toBeInTheDocument();
    expect(screen.queryByText("Open settings")).not.toBeInTheDocument();
  });

  it("gives an Admin Sync and the settings link", async () => {
    granted.add("model.edit");
    granted.add("extension.admin");
    renderWithProviders(<Tab />);

    expect(await screen.findByText("Open settings")).toBeInTheDocument();
    expect(screen.queryByText(askText)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sync/i })).toBeInTheDocument();
  });

  it("keeps the sync failure reason after reloading the list", async () => {
    granted.add("model.edit");
    mockPost.mockRejectedValue({ response: { error: "connection failed" } });
    renderWithProviders(<Tab />);

    fireEvent.click(await screen.findByRole("button", { name: /sync/i }));

    // "Sync failed" and the reason are separate text nodes so the static part
    // translates (MLflow: alert title and body; Azure: two nodes in one line).
    expect(await screen.findByText(/connection failed/)).toBeInTheDocument();
    expect(screen.getByText(/^Sync failed/)).toBeInTheDocument();
    expect(mockGet.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("MLflow model details", () => {
  beforeEach(() => {
    granted.clear();
    mockGet.mockReset();
    mockGet.mockResolvedValue({
      data: {
        data: {
          configured: true,
          models: [
            {
              id: 1,
              model_name: "churn-model",
              version: "3",
              lifecycle_stage: "Production",
              run_id: "run-1",
              experiment_id: "7",
              experiment_name: "churn",
              artifact_location: "s3://bucket/churn",
              creation_timestamp: 0,
              last_updated_timestamp: 0,
            },
          ],
        },
      },
    });
  });

  it("opens the details in a modal with sentence-case headings and closes it", async () => {
    renderWithProviders(<MLFlowTab />);
    fireEvent.click(await screen.findByText("churn-model"));

    expect(await screen.findByText("Basic information")).toBeInTheDocument();
    expect(screen.getByText("Experiment information")).toBeInTheDocument();
    expect(screen.getByText("Experiment name:")).toBeInTheDocument();
    expect(screen.getByText("Artifact location:")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByText("Basic information")).toBeNull());
  });
});
