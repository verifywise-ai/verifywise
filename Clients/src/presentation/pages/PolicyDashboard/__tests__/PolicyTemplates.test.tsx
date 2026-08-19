import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../../components/Table/PolicyTable", () => ({
  default: ({ data, renderRow }: any) => (
    <table>
      <tbody>{data.rows.map((row: any) => renderRow(row, undefined))}</tbody>
    </table>
  ),
}));

import PolicyTemplates from "../PolicyTemplates";

const sampleTemplates = [
  {
    id: 1,
    title: "AI Ethics Policy",
    description: "Guidance on ethical AI use",
    tags: ["AI ethics", "Fairness"],
    category: "Core AI governance policies",
    content: "<p>content 1</p>",
  },
  {
    id: 2,
    title: "Data Governance Policy",
    description: "Rules for governing data",
    tags: ["Data governance"],
    category: "Data and security AI policies",
    content: "<p>content 2</p>",
  },
];

describe("PolicyTemplates", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(sampleTemplates),
    }) as any;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders templates fetched from the JSON data file", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
    });
    expect(screen.getByText("Data Governance Policy")).toBeInTheDocument();
  });

  it("shows a loading skeleton while isLoading is true", () => {
    renderWithProviders(<PolicyTemplates tags={[]} isLoading />, {
      route: "/policies/templates",
    });
    expect(screen.queryByText("AI Ethics Policy")).not.toBeInTheDocument();
  });

  it("shows an empty state message when there are no templates", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) }) as any;
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("No policy templates found.")).toBeInTheDocument();
    });
  });

  it("navigates to the new-policy editor with the template id when a row is clicked", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("AI Ethics Policy"));
    expect(mockNavigate).toHaveBeenCalledWith("/policies/new?templateId=1");
  });

  it("filters templates by search term", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText("Search policy templates"), {
      target: { value: "governance" },
    });
    expect(screen.queryByText("AI Ethics Policy")).not.toBeInTheDocument();
    expect(screen.getByText("Data Governance Policy")).toBeInTheDocument();
  });

  it("redirects to the editor when a templateId query param is present", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, {
      route: "/policies/templates?templateId=7",
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/policies/new?templateId=7");
    });
  });

  it("renders tag chips for each template's tags", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
    });
    expect(screen.getByText("Fairness")).toBeInTheDocument();
  });
});
