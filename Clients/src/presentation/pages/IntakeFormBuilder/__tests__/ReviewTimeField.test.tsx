import { useState } from "react";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ReviewTimeField, { getReviewDaysError } from "../ReviewTimeField";

let latest: number | undefined;

const Harness = ({ initial }: { initial?: number }) => {
  const [value, setValue] = useState<number | undefined>(initial);
  return (
    <ReviewTimeField
      value={value}
      onChange={(next) => {
        latest = next;
        setValue(next);
      }}
    />
  );
};

describe("getReviewDaysError", () => {
  it("accepts whole numbers from 1 to 30, and no value", () => {
    expect(getReviewDaysError(undefined)).toBeUndefined();
    expect(getReviewDaysError(1)).toBeUndefined();
    expect(getReviewDaysError(30)).toBeUndefined();
  });

  it.each([0, 31, 2.5, NaN, -3])("rejects %p", (value) => {
    expect(getReviewDaysError(value)).toBe("Use a whole number from 1 to 30");
  });
});

describe("ReviewTimeField", () => {
  beforeEach(() => {
    latest = undefined;
  });

  it("shows the default of 3 for a form without a value", () => {
    renderWithProviders(<Harness />);
    expect(screen.getByLabelText("Review time (business days)")).toHaveValue(3);
  });

  it("reports a new value and flags one out of range", () => {
    renderWithProviders(<Harness initial={3} />);
    const input = screen.getByLabelText("Review time (business days)");

    fireEvent.change(input, { target: { value: "5" } });
    expect(latest).toBe(5);
    expect(screen.queryByText("Use a whole number from 1 to 30")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "31" } });
    expect(latest).toBe(31);
    expect(screen.getByText("Use a whole number from 1 to 30")).toBeInTheDocument();
  });

  it("lets the field be emptied, which cannot be saved", () => {
    renderWithProviders(<Harness initial={3} />);
    const input = screen.getByLabelText("Review time (business days)");
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue(null);
    expect(Number.isNaN(latest)).toBe(true);
    expect(screen.getByText("Use a whole number from 1 to 30")).toBeInTheDocument();
  });
});
