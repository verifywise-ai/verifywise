import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ReportPage from "../ReportPage";

const mockGetAllExperiments = vi.fn();
const mockAxiosGet = vi.fn();

vi.mock("../../../../application/repository/deepEval.repository", () => ({
  getAllExperiments: (...args: unknown[]) => mockGetAllExperiments(...args),
}));

vi.mock("../../../../infrastructure/api/customAxios", () => ({
  default: {
    get: (...args: unknown[]) => mockAxiosGet(...args),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../ReportConfigModal", () => ({ default: () => null }));

vi.mock("../../../components/Layout/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <div data-testid="page-header">{title}</div>,
}));

vi.mock("../../../components/HelperIcon", () => ({
  default: () => <div data-testid="helper-icon" />,
}));

const experiments = (statuses: string[]) => ({
  experiments: statuses.map((status, i) => ({ id: `exp_${i}`, name: `Exp ${i}`, status })),
});

const renderPage = () =>
  renderWithProviders(<ReportPage projectId="proj_1" projectName="Project" orgId="1" />);

describe("ReportPage completed experiment count", () => {
  beforeEach(() => {
    mockGetAllExperiments.mockReset();
    mockAxiosGet.mockReset();
    mockAxiosGet.mockResolvedValue({ data: [] });
  });

  it("uses the singular for one completed experiment", async () => {
    mockGetAllExperiments.mockResolvedValue(experiments(["completed", "failed"]));
    renderPage();

    expect(await screen.findByText("1 completed experiment available")).toBeInTheDocument();
    expect(
      screen.getByText(
        'You have 1 completed experiment. Click "Generate report" above to create a PDF or CSV report with AI-powered summaries.',
      ),
    ).toBeInTheDocument();
  });

  it("uses the plural for several completed experiments", async () => {
    mockGetAllExperiments.mockResolvedValue(experiments(["completed", "completed", "running"]));
    renderPage();

    expect(await screen.findByText("2 completed experiments available")).toBeInTheDocument();
    expect(
      screen.getByText(
        'You have 2 completed experiments. Click "Generate report" above to create a PDF or CSV report with AI-powered summaries.',
      ),
    ).toBeInTheDocument();
  });

  it("shows zero with the plural when nothing has completed", async () => {
    mockGetAllExperiments.mockResolvedValue(experiments(["failed"]));
    renderPage();

    expect(await screen.findByText("0 completed experiments available")).toBeInTheDocument();
    expect(screen.queryByText("Generate your first report")).not.toBeInTheDocument();
    expect(screen.queryByText(/^You have \d+ completed experiment/)).not.toBeInTheDocument();
  });

  it("shows only the number in the report history experiments column", async () => {
    mockGetAllExperiments.mockResolvedValue(experiments(["completed"]));
    mockAxiosGet.mockResolvedValue({
      data: [
        {
          id: "rep_1",
          title: "Quarterly report",
          format: "pdf",
          experiments: 3,
          fileSize: 1024,
          createdAt: "2026-11-12T10:00:00Z",
        },
      ],
    });
    renderPage();

    expect(await screen.findByText("Quarterly report")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("3 exps")).not.toBeInTheDocument();
  });
});
