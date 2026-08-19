import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { Routes, Route } from "react-router";
import StyleGuide from "../index";

const mockNavigate = vi.fn();

vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderStyleGuide = (route = "/style-guide/form-inputs") =>
  renderWithProviders(
    <Routes>
      <Route path="/style-guide/:section" element={<StyleGuide />} />
    </Routes>,
    { route },
  );

describe("StyleGuide", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("renders without crashing and defaults to the form inputs section", () => {
    renderStyleGuide();
    expect(screen.getByText("Dev only")).toBeInTheDocument();
    // "Form inputs" appears in both the sidebar nav and the section title
    expect(screen.getAllByText("Form inputs").length).toBeGreaterThan(0);
  });

  it("renders the design system / resources top tabs", () => {
    renderStyleGuide();
    expect(screen.getByText("Design system")).toBeInTheDocument();
    expect(screen.getByText("Resources")).toBeInTheDocument();
  });

  it("renders the component and foundation nav groups", () => {
    renderStyleGuide();
    expect(screen.getByText("Components")).toBeInTheDocument();
    expect(screen.getByText("Foundations")).toBeInTheDocument();
    expect(screen.getByText("Buttons")).toBeInTheDocument();
    expect(screen.getByText("Colors")).toBeInTheDocument();
  });

  it("renders the requested section based on the route param", () => {
    renderStyleGuide("/style-guide/colors");
    expect(screen.getAllByText("Colors").length).toBeGreaterThan(0);
  });

  it("navigates when a sidebar nav item is clicked", () => {
    renderStyleGuide();
    fireEvent.click(screen.getByText("Buttons"));
    expect(mockNavigate).toHaveBeenCalledWith("/style-guide/buttons");
  });

  it("navigates to the resources tab when clicked", () => {
    renderStyleGuide();
    fireEvent.click(screen.getByText("Resources"));
    expect(mockNavigate).toHaveBeenCalledWith("/style-guide/dos-and-donts");
  });

  it("renders the resources sidebar and section when on a resources route", () => {
    renderStyleGuide("/style-guide/dos-and-donts");
    expect(screen.getByText("Guidelines and patterns")).toBeInTheDocument();
    expect(screen.getAllByText("Do's and don'ts").length).toBeGreaterThan(0);
  });

  it("filters the sidebar when searching", () => {
    renderStyleGuide();
    // The "form inputs" section itself renders a SearchBox demo with the same
    // placeholder, so the top nav search bar is the first match in the DOM.
    const [searchInput] = screen.getAllByPlaceholderText("Search...");
    fireEvent.change(searchInput, { target: { value: "color" } });
    expect(screen.getAllByText("Colors").length).toBeGreaterThan(0);
    expect(screen.queryByText("Breadcrumbs")).not.toBeInTheDocument();
  });

  it("shows a no results message when the search matches nothing", () => {
    renderStyleGuide();
    const [searchInput] = screen.getAllByPlaceholderText("Search...");
    fireEvent.change(searchInput, { target: { value: "zzzznomatch" } });
    expect(screen.getByText("No sections found")).toBeInTheDocument();
  });
});
