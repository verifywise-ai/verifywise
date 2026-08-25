import { vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { VendorModel } from "../../../../../domain/models/Common/vendor/vendor.model";

// StandardModal renders a real "Save" button wired to the real `onSubmit`
// prop, so tests can drive the component's actual save flow (handleSave →
// validateAll → handleOnSave → mutateAsync) rather than just checking it
// mounts. This mirrors the real component's contract (onSubmit + submitButtonText).
vi.mock("../../StandardModal", () => ({
  default: ({ isOpen, children, title, onSubmit, submitButtonText, isSubmitting }: any) =>
    isOpen ? (
      <div data-testid="standard-modal">
        <h2>{title}</h2>
        {children}
        {onSubmit && (
          <button type="button" disabled={isSubmitting} onClick={onSubmit}>
            {submitButtonText || "Save"}
          </button>
        )}
      </div>
    ) : null,
}));
vi.mock("../../../Inputs/Select", () => ({
  default: () => <div data-testid="select" />,
}));
vi.mock("../../../Inputs/Datepicker", () => ({
  default: () => <div data-testid="datepicker" />,
}));
vi.mock("../../../HistorySidebar", () => ({
  default: () => null,
}));
vi.mock("../../../../../application/hooks/useEntityChangeHistory", () => ({
  useEntityChangeHistory: () => ({ history: [], loading: false }),
}));
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1, userRoleName: "Admin" }),
}));
vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ approvedProjects: [] }),
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));
vi.mock("../../../../../application/hooks/useDoraActive", () => ({
  default: () => ({ doraActive: true, loading: false }),
}));
vi.mock("../../../CustomFieldsSection", () => ({
  default: () => null,
}));
vi.mock("../../../CustomFieldsSection/RequiredCustomFieldsGate", () => ({
  useRequiredCustomFieldsGate: () => ({
    blocked: false,
    reason: null,
    missingLabels: [],
    onPendingChange: vi.fn(),
  }),
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));

const mockMutateAsync = vi.fn();
vi.mock("../../../../../application/hooks/useVendors", () => ({
  useCreateVendor: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateVendor: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AddNewVendor from "../index";

describe("NewVendor (AddNewVendor)", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<AddNewVendor isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });

  describe("DORA boolean payload coercion (findings 1 & 2)", () => {
    // A fully valid existing vendor so useFormValidation's real validateAll
    // passes and handleSave actually reaches handleOnSave → mutateAsync.
    // It starts flagged as an ICT provider WITH an exit plan, so toggling
    // isIctProvider off (finding 1) and hasExitPlan off (finding 2) are both
    // exercised as real state transitions, not just "already off" defaults.
    const existingVendor: VendorModel = {
      id: 42,
      vendor_name: "Acme Cloud",
      vendor_provides: "Cloud hosting",
      assignee: 1,
      website: "https://acme.example.com",
      vendor_contact_person: "Jane Doe",
      review_result: "Looks good",
      review_status: "Reviewed" as any,
      reviewer: 1,
      review_date: new Date().toISOString() as unknown as Date,
      projects: [1],
      is_ict_provider: true,
      has_exit_plan: true,
      ict_service_type: "Cloud services",
      function_criticality: "Critical",
      substitutability: "Easily substitutable",
      country_of_provision: "Germany",
      provider_lei: "5493001KJTIIGC8Y1R12",
    } as VendorModel;

    beforeEach(() => {
      mockMutateAsync.mockReset();
      mockMutateAsync.mockResolvedValue({ status: 202 });
    });

    it("sends is_ict_provider:false (not undefined) when the toggle is turned off", async () => {
      renderWithProviders(
        <AddNewVendor
          isOpen={true}
          setIsOpen={vi.fn()}
          onSuccess={vi.fn()}
          existingVendor={existingVendor}
        />,
      );

      // Turn the ICT provider toggle OFF.
      const ictToggle = screen.getByRole("switch", {
        name: "This vendor is an ICT third-party provider",
      });
      expect(ictToggle).toBeChecked();
      fireEvent.click(ictToggle);
      expect(ictToggle).not.toBeChecked();

      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

      const [{ data: payload }] = mockMutateAsync.mock.calls[0];
      expect(payload.is_ict_provider).toBe(false);
      expect(payload).toHaveProperty("is_ict_provider", false);
      // Explicitly not undefined — this is the exact regression the bug caused.
      expect(payload.is_ict_provider).not.toBeUndefined();
    });

    it("sends has_exit_plan:false (not undefined) when the exit-plan toggle is turned off", async () => {
      renderWithProviders(
        <AddNewVendor
          isOpen={true}
          setIsOpen={vi.fn()}
          onSuccess={vi.fn()}
          existingVendor={existingVendor}
        />,
      );

      // Leave isIctProvider ON, turn hasExitPlan OFF.
      const exitPlanToggle = screen.getByRole("switch", { name: "Exit plan in place" });
      expect(exitPlanToggle).toBeChecked();
      fireEvent.click(exitPlanToggle);
      expect(exitPlanToggle).not.toBeChecked();

      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

      const [{ data: payload }] = mockMutateAsync.mock.calls[0];
      expect(payload.has_exit_plan).toBe(false);
      expect(payload.has_exit_plan).not.toBeUndefined();
      // isIctProvider stayed on, so has_exit_plan must be a real boolean,
      // not dropped by the `isIctProvider ? ... : undefined` branch either.
      expect(payload.is_ict_provider).toBe(true);
    });
  });
});
