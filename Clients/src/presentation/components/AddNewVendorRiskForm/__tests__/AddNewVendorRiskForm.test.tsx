import { vi } from "vitest";
import React from "react";

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, useSearchParams: () => [new URLSearchParams(), vi.fn()] };
});
vi.mock("../../../../application/validations/selectValidation", () => ({
  default: vi.fn().mockReturnValue(""),
}));
vi.mock("../../../../application/validations/stringValidation", () => ({
  checkStringValidation: vi.fn().mockReturnValue(""),
}));
vi.mock("../../../../application/repository/vendorRisk.repository", () => ({
  createVendorRisk: vi.fn().mockResolvedValue({}),
  updateVendorRisk: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../../../application/contexts/VerifyWise.context", () => ({
  VerifyWiseContext: React.createContext({
    inputValues: {},
    dashboardValues: {
      vendors: [{ id: 1, vendor_name: "Test Vendor" }],
    },
  }),
}));
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 1, name: "John", surname: "Doe" }] }),
}));
vi.mock("../../../../application/hooks/useFrameworks", () => ({
  default: () => ({ frameworks: [] }),
}));
vi.mock("../../../../application/tools/alertUtils", () => ({
  handleAlert: vi.fn(),
}));
vi.mock("../../Inputs/Field", () => ({
  default: (props: any) => <input data-testid={`field-${props.id || "field"}`} />,
}));
vi.mock("../../Inputs/Datepicker", () => ({
  default: () => <div data-testid="datepicker" />,
}));
vi.mock("../../Inputs/Select", () => ({
  default: () => <div data-testid="select" />,
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import AddNewVendorRiskForm from "../index";

describe("AddNewVendorRiskForm", () => {
  const defaultProps = {
    closePopup: vi.fn(),
    onSuccess: vi.fn(),
    popupStatus: "new" as const,
  };

  it("renders the form without crashing", () => {
    renderWithProviders(<AddNewVendorRiskForm {...defaultProps} />);
    expect(document.body).toBeTruthy();
  });
});
