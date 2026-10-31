import { useState } from "react";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ReviewTimeField, { getReviewDaysError } from "../ReviewTimeField";
import { DEFAULT_REVIEW_DAYS } from "../../../../domain/intake/reviewTime";

let latest: number | undefined;
let setFromOutside: (value: number) => void = () => {};

const Harness = ({ initial = DEFAULT_REVIEW_DAYS }: { initial?: number }) => {
  const [value, setValue] = useState(initial);
  setFromOutside = setValue;
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

const input = () => screen.getByLabelText("Review time (business days)");

describe("getReviewDaysError", () => {
  it("accepts whole numbers from 1 to 30", () => {
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

  it("shows the default of 3", () => {
    renderWithProviders(<Harness />);
    expect(input()).toHaveValue(3);
  });

  it("reports a new value and flags one out of range", () => {
    renderWithProviders(<Harness />);

    fireEvent.change(input(), { target: { value: "5" } });
    expect(latest).toBe(5);
    expect(screen.queryByText("Use a whole number from 1 to 30")).not.toBeInTheDocument();

    fireEvent.change(input(), { target: { value: "31" } });
    expect(latest).toBe(31);
    expect(screen.getByText("Use a whole number from 1 to 30")).toBeInTheDocument();
  });

  it("lets the field be emptied, which cannot be saved", () => {
    renderWithProviders(<Harness />);
    fireEvent.change(input(), { target: { value: "" } });
    expect(input()).toHaveValue(null);
    expect(Number.isNaN(latest)).toBe(true);
    expect(screen.getByText("Use a whole number from 1 to 30")).toBeInTheDocument();
  });

  it("shows a value set from outside instead of the old draft", () => {
    renderWithProviders(<Harness />);
    fireEvent.change(input(), { target: { value: "5" } });
    expect(input()).toHaveValue(5);

    // e.g. the stored review time arrives after the user typed
    act(() => setFromOutside(12));
    expect(input()).toHaveValue(12);
  });
});
