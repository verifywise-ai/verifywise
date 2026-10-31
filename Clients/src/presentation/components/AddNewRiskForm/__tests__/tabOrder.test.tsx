/**
 * The tabs of the project risk form: which there are, and in what order. The form's hook and its
 * heavy panels are stood in for, so that the test is about the tab bar alone.
 */
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";

const hook = vi.hoisted(() => ({ isQuantitative: false }));

vi.mock("../hooks/useRiskForm", () => ({
  useRiskForm: () => ({
    value: "risks",
    handleTabChange: vi.fn(),
    riskValues: {},
    setRiskValues: vi.fn(),
    mitigationValues: {},
    setMitigationValues: vi.fn(),
    quantitativeValues: {},
    setQuantitativeValues: vi.fn(),
    riskValidateRef: { current: null },
    mitigateValidateRef: { current: null },
    riskFirstInvalidFieldRef: { current: null },
    mitigationFirstInvalidFieldRef: { current: null },
    customFieldsRef: { current: null },
    customFieldsGate: { onPendingChange: vi.fn(), blocked: false },
    riskFormSubmitHandler: vi.fn(),
    isFormValid: true,
    riskServerErrors: {},
    mitigationServerErrors: {},
    handleRiskValidityChange: vi.fn(),
    handleMitigationValidityChange: vi.fn(),
    usersLoading: false,
    userRoleName: "Admin",
    isEditingDisabled: false,
    isCreatingDisabled: false,
    isQuantitative: hook.isQuantitative,
  }),
}));
vi.mock("../RisksSection", () => ({ default: () => <div /> }));
vi.mock("../MitigationSection", () => ({ default: () => <div /> }));
vi.mock("../../LinkedRisksPanel", () => ({ default: () => <div /> }));
vi.mock("../../Common/HistorySidebar", () => ({ HistorySidebar: () => <div /> }));
vi.mock("../../CustomFieldsSection", () => ({ default: () => <div /> }));
vi.mock("../../QuantitativeRiskForm", () => ({ default: () => <div /> }));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import AddNewRiskForm from "../index";

const props = { closePopup: vi.fn(), onSuccess: vi.fn() };
const tabNames = () => screen.getAllByRole("tab").map((tab) => tab.textContent);

describe("the tabs of the project risk form", () => {
  it("puts Linked risks before Activity on a risk that exists", () => {
    hook.isQuantitative = false;
    renderWithProviders(<AddNewRiskForm {...props} popupStatus="edit" entityId={7} />);

    expect(tabNames()).toEqual([
      "Risks",
      "Mitigation",
      "Custom fields",
      "Linked risks",
      "Activity",
    ]);
  });

  it("keeps the Quantitative tab before the custom fields, and Linked risks before Activity", () => {
    hook.isQuantitative = true;
    renderWithProviders(<AddNewRiskForm {...props} popupStatus="edit" entityId={7} />);

    expect(tabNames()).toEqual([
      "Risks",
      "Mitigation",
      "Quantitative",
      "Custom fields",
      "Linked risks",
      "Activity",
    ]);
  });

  it("has neither Linked risks nor Activity while the risk is being created", () => {
    hook.isQuantitative = false;
    renderWithProviders(<AddNewRiskForm {...props} popupStatus="new" />);

    expect(tabNames()).toEqual(["Risks", "Mitigation", "Custom fields"]);
  });
});
