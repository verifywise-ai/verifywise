import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../shared", async () => {
  const actual: any = await vi.importActual("../shared");
  return { ...actual, streamPromptTest: vi.fn() };
});

import { apiServices } from "../../../../infrastructure/api/networkServices";
import { streamPromptTest } from "../shared";
import TestDatasetPanel from "./TestDatasetPanel";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiServices.post as unknown as ReturnType<typeof vi.fn>;
const mockPatch = apiServices.patch as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiServices.delete as unknown as ReturnType<typeof vi.fn>;
const mockStreamPromptTest = streamPromptTest as unknown as ReturnType<typeof vi.fn>;

const baseProps = {
  promptId: "1",
  messages: [{ role: "user", content: "Hello {{name}}" }],
  detectedVars: ["name"],
  variableValues: {},
  endpoints: [{ slug: "prod", display_name: "Prod" }],
  selectedEndpoint: "prod",
  config: {},
};

describe("TestDatasetPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { test_datasets: [] } });
  });

  it("starts with a single blank test case row for a new dataset", async () => {
    renderWithProviders(<TestDatasetPanel {...baseProps} />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith("/ai-gateway/prompts/1/test-datasets");
    });

    expect(screen.getByLabelText("Name")).toHaveValue("New dataset");
    expect(screen.getByPlaceholderText("name")).toBeInTheDocument();
    expect(screen.getByText("{{name}}")).toBeInTheDocument();
  });

  it("loads existing datasets into the selector", async () => {
    mockGet.mockResolvedValue({
      data: {
        test_datasets: [
          { id: 5, name: "Regression suite", test_cases: [{ variables: { name: "Alice" } }] },
        ],
      },
    });
    renderWithProviders(<TestDatasetPanel {...baseProps} />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });

    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[0]);
    fireEvent.click(screen.getByRole("option", { name: "Regression suite" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Regression suite");
    expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
  });

  it("adds and removes test case rows", async () => {
    renderWithProviders(<TestDatasetPanel {...baseProps} />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Add test case"));

    expect(screen.getAllByPlaceholderText("name")).toHaveLength(2);

    const removeButtons = screen.getAllByRole("button", { name: "" });
    const rowRemoveButton = removeButtons.find((b) => b.querySelector("svg.lucide-trash-2"));
    fireEvent.click(rowRemoveButton!);

    expect(screen.getAllByPlaceholderText("name")).toHaveLength(1);
  });

  it("edits a row's variable and expected output values", async () => {
    renderWithProviders(<TestDatasetPanel {...baseProps} />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText("name"), { target: { value: "Bob" } });
    fireEvent.change(screen.getByPlaceholderText("Optional"), {
      target: { value: "Hello Bob" },
    });

    expect(screen.getByDisplayValue("Bob")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Hello Bob")).toBeInTheDocument();
  });

  it("saves a new dataset and switches the selector to the created id", async () => {
    mockPost.mockResolvedValue({
      data: { test_dataset: { id: 9, name: "New dataset", test_cases: [] } },
    });
    renderWithProviders(<TestDatasetPanel {...baseProps} />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Save dataset"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/prompts/1/test-datasets",
        expect.objectContaining({ name: "New dataset" }),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Delete/ })).toBeInTheDocument();
    });
  });

  it("updates an existing dataset via patch", async () => {
    mockGet.mockResolvedValue({
      data: { test_datasets: [{ id: 5, name: "Regression suite", test_cases: [] }] },
    });
    mockPatch.mockResolvedValue({ data: {} });
    renderWithProviders(<TestDatasetPanel {...baseProps} />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[0]);
    fireEvent.click(screen.getByRole("option", { name: "Regression suite" }));

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed suite" } });
    fireEvent.click(screen.getByText("Save dataset"));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(
        "/ai-gateway/prompts/1/test-datasets/5",
        expect.objectContaining({ name: "Renamed suite" }),
      );
    });
  });

  it("deletes the selected dataset and resets to a new blank one", async () => {
    mockGet.mockResolvedValue({
      data: { test_datasets: [{ id: 5, name: "Regression suite", test_cases: [] }] },
    });
    mockDelete.mockResolvedValue({ data: {} });
    renderWithProviders(<TestDatasetPanel {...baseProps} />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[0]);
    fireEvent.click(screen.getByRole("option", { name: "Regression suite" }));

    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/ai-gateway/prompts/1/test-datasets/5");
    });
    expect(screen.getByLabelText("Name")).toHaveValue("New dataset");
  });

  it("runs all test cases and displays streamed results", async () => {
    mockStreamPromptTest.mockResolvedValue({
      content: "Hello Alice",
      tokens: 12,
      cost: 0.0021,
      latency: 340,
    });
    renderWithProviders(<TestDatasetPanel {...baseProps} />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Run all"));

    await waitFor(() => {
      expect(screen.getByText("Hello Alice")).toBeInTheDocument();
    });
    expect(screen.getByText("340ms")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("$0.0021")).toBeInTheDocument();
  });

  it("shows an error result when a test run fails", async () => {
    mockStreamPromptTest.mockRejectedValue(new Error("Endpoint unavailable"));
    renderWithProviders(<TestDatasetPanel {...baseProps} />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Run all"));

    await waitFor(() => {
      expect(screen.getByText("Error: Endpoint unavailable")).toBeInTheDocument();
    });
  });

  it("disables Run all when no endpoint is selected", async () => {
    renderWithProviders(<TestDatasetPanel {...baseProps} selectedEndpoint="" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Run all" })).toBeDisabled();
  });
});
