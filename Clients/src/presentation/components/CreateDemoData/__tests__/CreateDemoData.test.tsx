import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { CreateDemoData } from "..";
import { vi } from "vitest";

describe("CreateDemoData", () => {
  const defaultProps = {
    handleCancelDemoData: vi.fn(),
    handleCreateDemoData: vi.fn(),
  };

  it("renders without crashing", () => {
    renderWithProviders(<CreateDemoData {...defaultProps} />);
    expect(screen.getByText("Do you want to create demo data?")).toBeInTheDocument();
  });

  it("renders the description text", () => {
    renderWithProviders(<CreateDemoData {...defaultProps} />);
    expect(screen.getByText(/generate demo \(mock\) data for you/i)).toBeInTheDocument();
  });

  it("renders the secondary description about projects and users", () => {
    renderWithProviders(<CreateDemoData {...defaultProps} />);
    expect(screen.getByText(/This option will create 2 projects and 2 users/i)).toBeInTheDocument();
  });

  it("renders the Cancel button", () => {
    renderWithProviders(<CreateDemoData {...defaultProps} />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("renders the Create demo data button", () => {
    renderWithProviders(<CreateDemoData {...defaultProps} />);
    expect(screen.getByText("Create demo data")).toBeInTheDocument();
  });

  it("calls handleCancelDemoData when Cancel is clicked", async () => {
    const handleCancel = vi.fn();
    renderWithProviders(
      <CreateDemoData handleCancelDemoData={handleCancel} handleCreateDemoData={vi.fn()} />,
    );
    await userEvent.click(screen.getByText("Cancel"));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it("calls handleCreateDemoData when Create demo data is clicked", async () => {
    const handleCreate = vi.fn();
    renderWithProviders(
      <CreateDemoData handleCancelDemoData={vi.fn()} handleCreateDemoData={handleCreate} />,
    );
    await userEvent.click(screen.getByText("Create demo data"));
    expect(handleCreate).toHaveBeenCalledTimes(1);
  });
});
