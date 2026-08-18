import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import FrameworkRisks from "../index";

const mockGetAllEntities = vi.fn();

vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: (...args: any[]) => mockGetAllEntities(...args),
}));

vi.mock("../../../../components/RisksView", () => ({
  default: ({ fetchRisks, headerContent, title, emptyMessage }: any) => (
    <div data-testid="risks-view">
      <div data-testid="header-content">{headerContent}</div>
      <span>{title}</span>
      <span>{emptyMessage}</span>
      <button
        onClick={async () => {
          const risks = await fetchRisks();
          (globalThis as any).__lastRisks = risks;
        }}
      >
        fetch
      </button>
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

describe("FrameworkRisks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as any).__lastRisks;
  });

  it("renders the risks view with title and empty message", () => {
    renderWithProviders(
      <FrameworkRisks
        organizationalProject={{ id: 1 } as any}
        filteredFrameworks={filteredFrameworks}
        selectedFramework={0}
        onFrameworkSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("risks-view")).toBeInTheDocument();
    expect(screen.getByText("Framework risks")).toBeInTheDocument();
    expect(screen.getByText("No framework risks yet")).toBeInTheDocument();
  });

  it("renders the framework toggle when frameworks are available", () => {
    renderWithProviders(
      <FrameworkRisks
        organizationalProject={{ id: 1 } as any}
        filteredFrameworks={filteredFrameworks}
        selectedFramework={0}
        onFrameworkSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("button-toggle")).toBeInTheDocument();
  });

  it("does not render the toggle when there are no frameworks", () => {
    renderWithProviders(
      <FrameworkRisks
        organizationalProject={{ id: 1 } as any}
        filteredFrameworks={[]}
        selectedFramework={0}
        onFrameworkSelect={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("button-toggle")).not.toBeInTheDocument();
  });

  it("calls onFrameworkSelect when a toggle option is clicked", () => {
    const onFrameworkSelect = vi.fn();
    renderWithProviders(
      <FrameworkRisks
        organizationalProject={{ id: 1 } as any}
        filteredFrameworks={filteredFrameworks}
        selectedFramework={0}
        onFrameworkSelect={onFrameworkSelect}
      />,
    );
    screen.getByText("ISO 27001").click();
    expect(onFrameworkSelect).toHaveBeenCalledWith(1);
  });

  it("fetches risks for the selected framework", async () => {
    mockGetAllEntities.mockResolvedValue({ data: [{ id: 1 }] });
    renderWithProviders(
      <FrameworkRisks
        organizationalProject={{ id: 1 } as any}
        filteredFrameworks={filteredFrameworks}
        selectedFramework={1}
        onFrameworkSelect={vi.fn()}
      />,
    );
    await screen.getByText("fetch").click();
    expect(mockGetAllEntities).toHaveBeenCalledWith({
      routeUrl: "/projectRisks/by-frameworkid/2",
    });
  });

  it("returns an empty array when there is no selected framework id", async () => {
    renderWithProviders(
      <FrameworkRisks
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
