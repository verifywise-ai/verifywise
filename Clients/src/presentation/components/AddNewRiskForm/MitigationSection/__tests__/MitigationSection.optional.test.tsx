import { vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import type { MutableRefObject } from "react";

vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [], loading: false }),
}));

vi.mock("../../../../../application/hooks/useCan", () => ({
  useCanCheck: () => () => true,
}));

vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 5 }),
}));

vi.mock("../../../../../application/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key, lang: "en" }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import MitigationSection from "../index";
import { mitigationInitialState } from "../../hooks/useMitigationSection";
import type { MitigationFormValues } from "../../interface";

type ValidateFn = (values: MitigationFormValues) => boolean;

const renderSection = (values: MitigationFormValues) => {
  const validateRef: MutableRefObject<ValidateFn | null> = { current: null };
  const onValidityChange = vi.fn();
  renderWithProviders(
    <MitigationSection
      mitigationValues={values}
      setMitigationValues={vi.fn()}
      validateRef={validateRef}
      onValidityChange={onValidityChange}
    />,
  );
  return { validateRef, onValidityChange };
};

describe("MitigationSection optional fields", () => {
  it("lets a new risk be saved with the mitigation section left empty", () => {
    const { validateRef, onValidityChange } = renderSection(mitigationInitialState);

    expect(onValidityChange).toHaveBeenLastCalledWith(true);
    act(() => {
      expect(validateRef.current?.(mitigationInitialState)).toBe(true);
    });
    for (const label of [
      "Mitigation status",
      "Current risk level",
      "Deadline",
      "Mitigation plan",
      "Implementation strategy",
    ]) {
      expect(screen.queryByText(`${label} is required.`)).not.toBeInTheDocument();
    }
    expect(screen.queryByText("Invalid date")).not.toBeInTheDocument();
  });

  it.each([
    ["deadline", "mitigation-deadline-input"],
    ["dateOfAssessment", "mitigation-assessment-date-input"],
  ] as const)("clears a set %s to empty", (field, id) => {
    const values = { ...mitigationInitialState, [field]: "2030-01-15T12:00:00.000Z" };
    const setMitigationValues = vi.fn();
    renderWithProviders(
      <MitigationSection
        mitigationValues={values}
        setMitigationValues={setMitigationValues}
        validateRef={{ current: null }}
      />,
    );
    // The picker's clear button is the one without a "Choose date" label.
    const picker = document.getElementById(id)?.closest("[class*='MuiPickersTextField-root']");
    const clear = picker?.querySelector("button:not([aria-label])") as HTMLElement | null;
    expect(clear).toBeTruthy();
    if (!clear) return;
    fireEvent.click(clear);
    const calls = setMitigationValues.mock.calls;
    const update = calls[calls.length - 1]?.[0];
    expect(typeof update === "function" ? update(values)[field] : update?.[field]).toBe("");
  });

  it("does not mark the mitigation fields as required", () => {
    renderSection(mitigationInitialState);
    expect(screen.queryAllByText("*")).toHaveLength(0);
  });

  it.each([
    ["mitigationPlan", "Mitigation plan"],
    ["implementationStrategy", "Implementation strategy"],
  ] as const)("still limits %s to 1024 characters", (field, label) => {
    const tooLong = { ...mitigationInitialState, [field]: "a".repeat(1025) };
    const { validateRef, onValidityChange } = renderSection(tooLong);

    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    act(() => {
      expect(validateRef.current?.(tooLong)).toBe(false);
    });
    expect(screen.getByText(`${label} can't be longer than 1024 characters.`)).toBeInTheDocument();

    const atLimit = { ...mitigationInitialState, [field]: "a".repeat(1024) };
    act(() => {
      expect(validateRef.current?.(atLimit)).toBe(true);
    });
  });
});
