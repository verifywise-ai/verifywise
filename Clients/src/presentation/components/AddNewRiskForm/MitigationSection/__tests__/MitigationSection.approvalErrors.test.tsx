import { vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { useState, type MutableRefObject } from "react";

const auth = vi.hoisted(() => ({ userId: 5 as number | null, isAdmin: false }));

vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [
      { id: 7, name: "Ada", surname: "Lovelace", email: "ada@example.com" },
      { id: 8, name: "Alan", surname: "Turing", email: "alan@example.com" },
    ],
    loading: false,
  }),
}));

vi.mock("../../../../../application/hooks/useCan", () => ({
  useCanCheck: () => (key: string) => (key === "organization.admin" ? auth.isAdmin : true),
}));

vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: auth.userId }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import MitigationSection from "../index";
import { mitigationInitialState } from "../../hooks/useMitigationSection";
import { RISK_APPROVAL_STATUS } from "../../projectRiskValue";
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

/** The form as it opens on a stored risk: `saved` is what the risk holds. */
const Harness = ({
  saved,
  validateRef,
}: {
  saved: MitigationFormValues;
  validateRef?: MutableRefObject<ValidateFn | null>;
}) => {
  const [values, setValues] = useState(saved);
  return (
    <MitigationSection
      mitigationValues={values}
      setMitigationValues={setValues}
      savedApproval={{ approver: saved.approver, approvalStatus: saved.approvalStatus }}
      validateRef={validateRef}
    />
  );
};

const openSelect = (testId: string) =>
  fireEvent.mouseDown(within(screen.getByTestId(testId)).getByRole("combobox"));

const option = (name: string) => screen.getByRole("option", { name });

const pick = (testId: string, name: string) => {
  openSelect(testId);
  fireEvent.click(option(name));
};

const statusShown = () =>
  within(screen.getByTestId("approval-status-select")).getByRole("combobox").textContent;

beforeEach(() => {
  auth.userId = 5;
  auth.isAdmin = false;
});

describe("MitigationSection approval fields", () => {
  it("does not require an approver, approval status or assessment date", () => {
    const { validateRef } = renderSection({ ...filled, approver: 7 });

    act(() => {
      expect(validateRef.current?.(filled)).toBe(true);
      expect(validateRef.current?.({ ...filled, approver: 7, dateOfAssessment: "" })).toBe(true);
    });
    expect(screen.queryByText("Approver is required.")).not.toBeInTheDocument();
    expect(screen.queryByText("Approval status is required.")).not.toBeInTheDocument();
    expect(screen.queryByText("Date of assessment is required.")).not.toBeInTheDocument();
  });

  it("defaults a new risk to Not required", () => {
    renderWithProviders(<Harness saved={filled} />);
    expect(statusShown()).toBe("Not required");
  });

  it("sets Pending when an approver is chosen and Not required when cleared", () => {
    auth.isAdmin = true;
    renderWithProviders(<Harness saved={filled} />);

    pick("approver-select", "Ada Lovelace");
    expect(statusShown()).toBe("Pending");

    pick("approver-select", "None");
    expect(statusShown()).toBe("Not required");
  });

  it("disables Approved and Rejected for a user who is neither the approver nor an Admin", () => {
    renderWithProviders(
      <Harness saved={{ ...filled, approver: 7, approvalStatus: RISK_APPROVAL_STATUS.Pending }} />,
    );

    openSelect("approval-status-select");
    expect(option("Approved")).toHaveAttribute("aria-disabled", "true");
    expect(option("Rejected")).toHaveAttribute("aria-disabled", "true");
    expect(option("Pending")).not.toHaveAttribute("aria-disabled", "true");
  });

  it("lets the saved approver approve or reject", () => {
    auth.userId = 7;
    renderWithProviders(
      <Harness saved={{ ...filled, approver: 7, approvalStatus: RISK_APPROVAL_STATUS.Pending }} />,
    );

    openSelect("approval-status-select");
    expect(option("Approved")).not.toHaveAttribute("aria-disabled", "true");
    expect(option("Rejected")).not.toHaveAttribute("aria-disabled", "true");
  });

  it("allows only an Admin to decide in the save that changes the approver", () => {
    // The saved approver hands the risk on: they no longer decide in this save.
    auth.userId = 7;
    const saved = { ...filled, approver: 7, approvalStatus: RISK_APPROVAL_STATUS.Pending };
    const view = renderWithProviders(<Harness saved={saved} />);
    pick("approver-select", "Alan Turing");
    openSelect("approval-status-select");
    expect(option("Approved")).toHaveAttribute("aria-disabled", "true");
    view.unmount();

    // Naming yourself does not let you approve in the same save.
    auth.userId = 8;
    const self = renderWithProviders(<Harness saved={saved} />);
    pick("approver-select", "Alan Turing");
    openSelect("approval-status-select");
    expect(option("Approved")).toHaveAttribute("aria-disabled", "true");
    self.unmount();

    auth.userId = 5;
    auth.isAdmin = true;
    renderWithProviders(<Harness saved={saved} />);
    pick("approver-select", "Alan Turing");
    openSelect("approval-status-select");
    expect(option("Approved")).not.toHaveAttribute("aria-disabled", "true");
  });

  it("keeps a decided risk's status for others but still lets them save other fields", () => {
    const validateRef: MutableRefObject<ValidateFn | null> = { current: null };
    const saved = { ...filled, approver: 7, approvalStatus: RISK_APPROVAL_STATUS.Approved };
    renderWithProviders(<Harness saved={saved} validateRef={validateRef} />);

    expect(statusShown()).toBe("Approved");
    openSelect("approval-status-select");
    expect(option("Pending")).toHaveAttribute("aria-disabled", "true");
    expect(option("Not required")).toHaveAttribute("aria-disabled", "true");
    act(() => {
      expect(validateRef.current?.({ ...saved, mitigationPlan: "Changed plan" })).toBe(true);
    });
  });

  it("restores the saved status when the saved approver is chosen again", () => {
    const saved = { ...filled, approver: 7, approvalStatus: RISK_APPROVAL_STATUS.Approved };
    renderWithProviders(<Harness saved={saved} />);

    pick("approver-select", "Alan Turing");
    expect(statusShown()).toBe("Pending");
    pick("approver-select", "Ada Lovelace");
    expect(statusShown()).toBe("Approved");
  });
});

describe("MitigationSection approval errors", () => {
  it("clears a server error about an approver the user has removed", () => {
    const started = {
      ...filled,
      approver: 7,
      approvalStatus: RISK_APPROVAL_STATUS.Pending,
      dateOfAssessment: "2026-11-01",
    };
    const serverErrors = { approver: "Approver is not a member of this organization." };
    const { rerender } = renderSection(started, serverErrors);
    expect(screen.getByText(serverErrors.approver)).toBeInTheDocument();

    rerender(
      {
        ...started,
        approver: 0,
        approvalStatus: RISK_APPROVAL_STATUS.NotRequired,
        dateOfAssessment: "",
      },
      serverErrors,
    );

    expect(screen.queryByText(serverErrors.approver)).not.toBeInTheDocument();
  });

  it("keeps a server error on a date of assessment that is still filled in", () => {
    const started = {
      ...filled,
      approver: 7,
      approvalStatus: RISK_APPROVAL_STATUS.Pending,
      dateOfAssessment: "2026-13-01",
    };
    const serverErrors = { dateOfAssessment: "Date of assessment is not a valid date." };
    const { rerender } = renderSection(started, serverErrors);

    rerender(
      { ...started, approver: 0, approvalStatus: RISK_APPROVAL_STATUS.NotRequired },
      serverErrors,
    );

    expect(screen.getByText(serverErrors.dateOfAssessment)).toBeInTheDocument();
  });

  // Relies on serverErrors not being a dependency of the clearing effect.
  it("shows a server error on an approval field that arrives while no approver is set", () => {
    const { rerender } = renderSection(filled);
    const serverErrors = { dateOfAssessment: "Date of assessment is not a valid date." };

    rerender(filled, serverErrors);

    expect(screen.getByText(serverErrors.dateOfAssessment)).toBeInTheDocument();
  });
});
