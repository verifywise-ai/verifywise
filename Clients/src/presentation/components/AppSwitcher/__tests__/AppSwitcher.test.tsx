import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AppSwitcher from "../index";
import { AppModule } from "../../../../application/redux/ui/uiSlice";

describe("AppSwitcher", () => {
  const defaultProps = {
    activeModule: "main" as AppModule,
    onModuleChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all 7 module buttons, LL 144 bias audit last", () => {
    renderWithProviders(<AppSwitcher {...defaultProps} />);

    expect(screen.getByLabelText("Governance")).toBeInTheDocument();
    expect(screen.getByLabelText("LLM Evals")).toBeInTheDocument();
    expect(screen.getByLabelText("AI Detection")).toBeInTheDocument();
    expect(screen.getByLabelText("Shadow AI")).toBeInTheDocument();
    expect(screen.getByLabelText("AI Gateway")).toBeInTheDocument();
    expect(screen.getByLabelText("AI Trust Index")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(7);
    expect(buttons[6]).toHaveAccessibleName("LL 144 bias audit");
  });

  it("calls onModuleChange with bias-audit when the LL 144 button is clicked", () => {
    renderWithProviders(<AppSwitcher {...defaultProps} />);

    fireEvent.click(screen.getByLabelText("LL 144 bias audit"));
    expect(defaultProps.onModuleChange).toHaveBeenCalledWith("bias-audit");
  });

  it("does not render super admin button by default", () => {
    renderWithProviders(<AppSwitcher {...defaultProps} />);

    expect(screen.queryByLabelText("Super Admin")).not.toBeInTheDocument();
  });

  it("renders super admin button when isSuperAdmin is true", () => {
    renderWithProviders(<AppSwitcher {...defaultProps} isSuperAdmin={true} />);

    expect(screen.getByLabelText("Super Admin")).toBeInTheDocument();
  });

  it("calls onModuleChange when a module button is clicked", () => {
    renderWithProviders(<AppSwitcher {...defaultProps} />);

    fireEvent.click(screen.getByLabelText("LLM Evals"));
    expect(defaultProps.onModuleChange).toHaveBeenCalledWith("evals");
  });

  it("marks the active module button with the active class", () => {
    renderWithProviders(<AppSwitcher {...defaultProps} activeModule="evals" />);

    const evalsButton = screen.getByLabelText("LLM Evals");
    expect(evalsButton).toHaveClass("active");
  });

  it("calls onModuleChange with super-admin when super admin button is clicked", () => {
    renderWithProviders(<AppSwitcher {...defaultProps} isSuperAdmin={true} />);

    fireEvent.click(screen.getByLabelText("Super Admin"));
    expect(defaultProps.onModuleChange).toHaveBeenCalledWith("super-admin");
  });
});
