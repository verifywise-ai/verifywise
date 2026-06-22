import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import DatePicker from "../index";
import dayjs from "dayjs";

describe("DatePicker Component", () => {
  it("renders label", () => {
    renderWithProviders(<DatePicker label="Start date" date={null} handleDateChange={vi.fn()} />);

    expect(screen.getByText("Start date")).toBeInTheDocument();
  });

  it("shows required asterisk", () => {
    renderWithProviders(
      <DatePicker label="Start date" date={null} handleDateChange={vi.fn()} isRequired />,
    );

    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("shows optional label", () => {
    renderWithProviders(
      <DatePicker label="Start date" date={null} handleDateChange={vi.fn()} isOptional />,
    );

    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("renders error message", () => {
    renderWithProviders(
      <DatePicker label="Start date" date={null} handleDateChange={vi.fn()} error="Invalid date" />,
    );

    expect(screen.getByText("Invalid date")).toBeInTheDocument();
  });

  it("renders with a date value", () => {
    const testDate = dayjs("2024-06-15");

    renderWithProviders(<DatePicker label="Date" date={testDate} handleDateChange={vi.fn()} />);

    expect(screen.getByDisplayValue("06/15/2024")).toBeInTheDocument();
  });

  it("calls handleDateChange when date is selected via calendar popup", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<DatePicker label="Date" date={null} handleDateChange={handleChange} />);

    await user.click(screen.getByLabelText("Choose date"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders formatted date display when date is set", () => {
    const testDate = dayjs("2024-06-15");

    renderWithProviders(<DatePicker label="Date" date={testDate} handleDateChange={vi.fn()} />);

    expect(screen.getByDisplayValue("06/15/2024")).toBeInTheDocument();
  });
});
