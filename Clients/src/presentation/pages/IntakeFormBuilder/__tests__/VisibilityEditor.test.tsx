import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import {
  VisibilityEditor,
  operatorLabel,
  visibilitySummary,
  withOperator,
} from "../VisibilityEditor";
import type { FormField } from "../types";

const PERSONAL: FormField = {
  id: "personal",
  type: "select",
  label: "Personal data?",
  order: 0,
  options: [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
  ],
};

describe("VisibilityEditor", () => {
  it("adds a condition on the first other field with its first operator and option", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <VisibilityEditor visibility={undefined} otherFields={[PERSONAL]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    expect(onChange).toHaveBeenCalledWith({
      match: "all",
      conditions: [{ fieldId: "personal", operator: "equals", value: "yes" }],
    });
  });

  it("clears the rules when the last condition is removed", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <VisibilityEditor
        visibility={{
          match: "all",
          conditions: [{ fieldId: "personal", operator: "equals", value: "yes" }],
        }}
        otherFields={[PERSONAL]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove condition" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("explains when there is no other field to depend on", () => {
    renderWithProviders(
      <VisibilityEditor visibility={undefined} otherFields={[]} onChange={vi.fn()} />,
    );
    expect(screen.getByText("Add another field to create a rule")).toBeInTheDocument();
  });

  it("keeps leftover conditions removable once no other field exists", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <VisibilityEditor
        visibility={{
          match: "all",
          conditions: [{ fieldId: "personal", operator: "equals", value: "yes" }],
        }}
        otherFields={[]}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Add another field to create a rule")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add condition" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove condition" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("offers no new rule when blocked, and says why", () => {
    renderWithProviders(
      <VisibilityEditor
        visibility={undefined}
        otherFields={[PERSONAL]}
        onChange={vi.fn()}
        blockedReason="This field is always shown"
      />,
    );
    expect(screen.getByText("This field is always shown")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add condition" })).toBeNull();
  });

  it("words operators for authors", () => {
    expect(operatorLabel("multiselect", "equals")).toBe("includes");
    expect(operatorLabel("select", "not_equals")).toBe("is not");
    expect(operatorLabel("number", "gte")).toBe("≥");
  });

  it("summarises the rules", () => {
    expect(visibilitySummary(undefined)).toBe("Always shown");
    expect(
      visibilitySummary({ match: "any", conditions: [{ fieldId: "a", operator: "is_empty" }] }),
    ).toBe("Shown when any condition matches");
  });

  it("does not dress a removed field up as another field's condition", () => {
    renderWithProviders(
      <VisibilityEditor
        visibility={{
          match: "all",
          conditions: [{ fieldId: "gone", operator: "equals", value: "x" }],
        }}
        otherFields={[PERSONAL]}
        onChange={vi.fn()}
      />,
    );
    expect(document.getElementById("condition-operator-0")).toBeNull();
    expect(document.getElementById("condition-value-0")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove condition" })).toBeInTheDocument();
  });

  it("keeps the chosen value when only the operator changes", () => {
    expect(
      withOperator(
        { fieldId: "personal", operator: "equals", value: "no" },
        PERSONAL,
        "not_equals",
      ),
    ).toEqual({ fieldId: "personal", operator: "not_equals", value: "no" });
    expect(
      withOperator({ fieldId: "personal", operator: "equals", value: "no" }, PERSONAL, "one_of"),
    ).toEqual({ fieldId: "personal", operator: "one_of", value: ["no"] });
    expect(
      withOperator(
        { fieldId: "personal", operator: "one_of", value: ["no", "yes"] },
        PERSONAL,
        "equals",
      ),
    ).toEqual({ fieldId: "personal", operator: "equals", value: "no" });
    expect(
      withOperator({ fieldId: "personal", operator: "equals", value: "no" }, PERSONAL, "is_empty"),
    ).toEqual({ fieldId: "personal", operator: "is_empty" });
  });

  it("does not crash on stored rules without a conditions list", () => {
    expect(visibilitySummary({ match: "all" } as never)).toBe("Always shown");
    renderWithProviders(
      <VisibilityEditor
        visibility={{ match: "all" } as never}
        otherFields={[PERSONAL]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Add condition" })).toBeInTheDocument();
  });
});
