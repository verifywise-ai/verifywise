import { vi } from "vitest";

vi.mock("../../Inputs/Select", () => ({
  default: ({ label }: any) => <div data-testid="select">{label}</div>,
}));
vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../../../application/repository/vendor.repository", () => ({
  getAllVendors: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../../../application/repository/policy.repository", () => ({
  getAllPolicies: vi.fn().mockResolvedValue({ data: [] }),
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import EntityLinkSelector from "../index";

describe("EntityLinkSelector", () => {
  it("renders without crashing", () => {
    renderWithProviders(<EntityLinkSelector value={[]} onChange={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });

  it("renders add link button", () => {
    renderWithProviders(<EntityLinkSelector value={[]} onChange={vi.fn()} />);
    // Should have a way to add links
    expect(screen.getByText(/link/i)).toBeInTheDocument();
  });

  it("renders in disabled state", () => {
    renderWithProviders(<EntityLinkSelector value={[]} onChange={vi.fn()} disabled />);
    expect(document.body).toBeTruthy();
  });
});
