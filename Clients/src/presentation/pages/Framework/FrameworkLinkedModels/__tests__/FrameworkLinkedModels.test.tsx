import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import FrameworkLinkedModels from "../index";

const mockGetAllEntities = vi.fn();

vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: (...args: any[]) => mockGetAllEntities(...args),
}));

vi.mock("../../../../components/LinkedModelsView", () => ({
  LinkedModelsView: ({ fetchModels, headerContent, emptyMessage }: any) => (
    <div data-testid="linked-models-view">
      <div data-testid="header-content">{headerContent}</div>
      <button
        onClick={async () => {
          const models = await fetchModels();
          (globalThis as any).__lastModels = models;
        }}
      >
        fetch
      </button>
      <span>{emptyMessage}</span>
    </div>
  ),
}));

vi.mock("../../../../components/button-toggle", () => ({
  ButtonToggle: ({ options, value, onChange }: any) => (
    <div data-testid="button-toggle">
      {options.map((opt: any) => (
        <button
          key={opt.value}
          data-selected={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  ),
}));

const filteredFrameworks = [
  { id: "1", is_demo: false, project_id: "1", framework_id: "1", name: "ISO 42001", description: "", is_organizational: true },
  { id: "2", is_demo: false, project_id: "1", framework_id: "2", name: "ISO 27001", description: "", is_organizational: true },
] as any;

describe("FrameworkLinkedModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as any).__lastModels;
  });

  it("renders the linked models view with the empty message", () => {
    renderWithProviders(
      <FrameworkLinkedModels
        organizationalProject={{ id: 1 } as any}
        filteredFrameworks={filteredFrameworks}
        selectedFramework={0}
        onFrameworkSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("linked-models-view")).toBeInTheDocument();
    expect(screen.getByText("No AI models linked to this framework yet")).toBeInTheDocument();
  });

  it("renders the framework toggle when frameworks are available", () => {
    renderWithProviders(
      <FrameworkLinkedModels
        organizationalProject={{ id: 1 } as any}
        filteredFrameworks={filteredFrameworks}
        selectedFramework={0}
        onFrameworkSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("button-toggle")).toBeInTheDocument();
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
    expect(screen.getByText("ISO 27001")).toBeInTheDocument();
  });

  it("does not render the toggle when there are no frameworks", () => {
    renderWithProviders(
      <FrameworkLinkedModels
        organizationalProject={{ id: 1 } as any}
        filteredFrameworks={[]}
        selectedFramework={0}
        onFrameworkSelect={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("button-toggle")).not.toBeInTheDocument();
  });

  it("calls onFrameworkSelect when a toggle option is clicked", async () => {
    const onFrameworkSelect = vi.fn();
    renderWithProviders(
      <FrameworkLinkedModels
        organizationalProject={{ id: 1 } as any}
        filteredFrameworks={filteredFrameworks}
        selectedFramework={0}
        onFrameworkSelect={onFrameworkSelect}
      />,
    );
    screen.getByText("ISO 27001").click();
    expect(onFrameworkSelect).toHaveBeenCalledWith(1);
  });

  it("fetches linked models for the selected framework", async () => {
    mockGetAllEntities.mockResolvedValue({ data: [{ id: 1, name: "Model 1" }] });
    renderWithProviders(
      <FrameworkLinkedModels
        organizationalProject={{ id: 1 } as any}
        filteredFrameworks={filteredFrameworks}
        selectedFramework={0}
        onFrameworkSelect={vi.fn()}
      />,
    );
    await screen.getByText("fetch").click();
    expect(mockGetAllEntities).toHaveBeenCalledWith({
      routeUrl: "/modelInventory/by-frameworkId/1",
    });
  });

  it("returns an empty array when there is no selected framework id", async () => {
    renderWithProviders(
      <FrameworkLinkedModels
        organizationalProject={{ id: 1 } as any}
        filteredFrameworks={[]}
        selectedFramework={0}
        onFrameworkSelect={vi.fn()}
      />,
    );
    await screen.getByText("fetch").click();
    expect(mockGetAllEntities).not.toHaveBeenCalled();
  });
});
