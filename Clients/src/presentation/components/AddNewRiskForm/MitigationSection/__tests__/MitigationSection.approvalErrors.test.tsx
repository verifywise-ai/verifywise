import { vi } from "vitest";
import { act, screen } from "@testing-library/react";
import type { MutableRefObject } from "react";

vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [{ id: 7, name: "Ada", surname: "Lovelace", email: "ada@example.com" }],
    loading: false,
  }),
}));

vi.mock("../../../../../application/hooks/useCan", () => ({
  useCanCheck: () => () => true,
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import MitigationSection from "../index";
import { mitigationInitialState } from "../../hooks/useMitigationSection";
import type { MitigationFormValues } from "../../interface";

type ServerErrors = Partial<Record<keyof MitigationFormValues, string>>;
type ValidateFn = (values: MitigationFormValues) => boolean;

const filled: MitigationFormValues = {
  ...mitigationInitialState,
  mitigationStatus: 1,
  currentRiskLevel: 1,
  mitigationPlan: "Retrain monthly",
  implementationStrategy: "Owner reviews drift report",
  deadline: "2026-12-01",
};

const renderSection = (values: MitigationFormValues, serverErrors?: ServerErrors) => {
  const validateRef: MutableRefObject<ValidateFn | null> = { current: null };
  const view = renderWithProviders(
    <MitigationSection
      mitigationValues={values}
      setMitigationValues={vi.fn()}
      validateRef={validateRef}
      serverErrors={serverErrors}
    />,
  );
  const rerender = (next: MitigationFormValues, nextServerErrors?: ServerErrors) =>
    view.rerender(
      <MitigationSection
        mitigationValues={next}
        setMitigationValues={vi.fn()}
        validateRef={validateRef}
        serverErrors={nextServerErrors}
      />,
    );
  return { validateRef, rerender };
};

const APPROVAL_REQUIRED = [
  "Approval status is required.",
  "Date of assessment is required.",
] as const;

describe("MitigationSection approval errors", () => {
  it("clears the required errors on the approval fields when approval is un-started", () => {
    const started = { ...filled, approver: 7 };
    const { validateRef, rerender } = renderSection(started);

    act(() => {
      expect(validateRef.current?.(started)).toBe(false);
    });
    for (const message of APPROVAL_REQUIRED) expect(screen.getByText(message)).toBeInTheDocument();

    rerender({ ...started, approver: 0 });

    for (const message of APPROVAL_REQUIRED) {
      expect(screen.queryByText(message)).not.toBeInTheDocument();
    }
  });

  it("keeps errors on other fields when approval is un-started", () => {
    const started = { ...filled, approver: 7, mitigationPlan: "" };
    const { validateRef, rerender } = renderSection(started);

    act(() => {
      validateRef.current?.(started);
    });
    rerender({ ...started, approver: 0 });

    expect(screen.getByText("Mitigation plan is required.")).toBeInTheDocument();
  });

  it("clears a server error about an approver the user has removed", () => {
    const started = { ...filled, approver: 7, approvalStatus: 1, dateOfAssessment: "2026-11-01" };
    const serverErrors = { approver: "Approver is not a member of this organization." };
    const { rerender } = renderSection(started, serverErrors);
    expect(screen.getByText(serverErrors.approver)).toBeInTheDocument();

    rerender({ ...started, approver: 0, approvalStatus: 0, dateOfAssessment: "" }, serverErrors);

    expect(screen.queryByText(serverErrors.approver)).not.toBeInTheDocument();
  });

  it("keeps a server error on a date of assessment that is still filled in", () => {
    const started = { ...filled, approver: 7, approvalStatus: 1, dateOfAssessment: "2026-13-01" };
    const serverErrors = { dateOfAssessment: "Date of assessment is not a valid date." };
    const { rerender } = renderSection(started, serverErrors);

    rerender({ ...started, approver: 0, approvalStatus: 0 }, serverErrors);

    expect(screen.getByText(serverErrors.dateOfAssessment)).toBeInTheDocument();
  });

  // Relies on serverErrors not being a dependency of the clearing effect.
  it("shows a server error on an approval field that arrives while approval is off", () => {
    const { rerender } = renderSection(filled);
    const serverErrors = { dateOfAssessment: "Date of assessment is not a valid date." };

    rerender(filled, serverErrors);

    expect(screen.getByText(serverErrors.dateOfAssessment)).toBeInTheDocument();
  });
});
