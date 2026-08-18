import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../test/renderWithProviders";
import EvidenceHubTable from "./evidenceHubTable";
import { EvidenceHubModel } from "../../../domain/models/Common/evidenceHub/evidenceHub.model";
import { ModelInventoryStatus } from "../../../domain/enums/modelInventory.enum";
import type { IModelInventory } from "../../../domain/interfaces/i.modelInventory";

vi.mock("../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));

const modelInventoryData: IModelInventory[] = [
  {
    id: 1,
    provider: "OpenAI",
    model: "GPT-4",
    version: "1.0",
    capabilities: [],
    security_assessment: true,
    status: ModelInventoryStatus.APPROVED,
    status_date: new Date("2026-01-01"),
    projects: [],
    frameworks: [],
  },
];

const evidence1 = new EvidenceHubModel({
  id: 1,
  evidence_name: "SOC2 report",
  evidence_type: "Audit",
  evidence_files: [
    {
      id: 1,
      filename: "soc2.pdf",
      size: 1024,
      mimetype: "application/pdf",
      uploaded_by: 1,
      upload_date: "2026-07-01T00:00:00Z",
    },
  ],
  mapped_model_ids: [1],
  tags: ["compliance", "soc2", "annual"],
  expiry_date: new Date("2026-12-01"),
});

const evidence2 = new EvidenceHubModel({
  id: 2,
  evidence_name: "Change log",
  evidence_type: "Log",
  evidence_files: [],
});

describe("EvidenceHubTable", () => {
  it("shows a skeleton while loading", () => {
    const { container } = renderWithProviders(
      <EvidenceHubTable data={[]} isLoading modelInventoryData={modelInventoryData} />,
    );
    expect(container.querySelector(".MuiSkeleton-root")).toBeTruthy();
  });

  it("shows an empty state when there is no evidence", () => {
    renderWithProviders(
      <EvidenceHubTable data={[]} isLoading={false} modelInventoryData={modelInventoryData} />,
    );
    expect(screen.getByText(/No evidence yet/)).toBeInTheDocument();
  });

  it("renders evidence rows with mapped model names and tags", () => {
    renderWithProviders(
      <EvidenceHubTable
        data={[evidence1, evidence2]}
        isLoading={false}
        modelInventoryData={modelInventoryData}
      />,
    );

    expect(screen.getByText("SOC2 report")).toBeInTheDocument();
    expect(screen.getByText("OpenAI - GPT-4")).toBeInTheDocument();
    expect(screen.getByText("compliance")).toBeInTheDocument();
    expect(screen.getByText("soc2")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("Change log")).toBeInTheDocument();
  });

  it("falls back to a dash for evidence with no files, mapping, or tags", () => {
    renderWithProviders(
      <EvidenceHubTable
        data={[evidence2]}
        isLoading={false}
        modelInventoryData={modelInventoryData}
      />,
    );
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("resolves mapped training names when trainingData is provided", () => {
    const evidenceWithTraining = new EvidenceHubModel({
      id: 3,
      evidence_name: "Training record",
      evidence_type: "Training",
      mapped_training_ids: [7],
    });

    renderWithProviders(
      <EvidenceHubTable
        data={[evidenceWithTraining]}
        isLoading={false}
        modelInventoryData={modelInventoryData}
        trainingData={[{ id: 7, training_name: "Annual AI ethics training" }]}
      />,
    );

    expect(screen.getByText("Annual AI ethics training")).toBeInTheDocument();
  });

  it("sorts by evidence name when the column header is clicked", () => {
    renderWithProviders(
      <EvidenceHubTable
        data={[evidence1, evidence2]}
        isLoading={false}
        modelInventoryData={modelInventoryData}
      />,
    );

    fireEvent.click(screen.getByText("EVIDENCE NAME"));

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Change log");
  });

  it("hides pagination and honours visibleColumns", () => {
    renderWithProviders(
      <EvidenceHubTable
        data={[evidence1]}
        isLoading={false}
        modelInventoryData={modelInventoryData}
        hidePagination
        visibleColumns={new Set(["evidence_name", "evidence_type"])}
      />,
    );
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
    expect(screen.queryByText("REVIEWER")).not.toBeInTheDocument();
  });
});
