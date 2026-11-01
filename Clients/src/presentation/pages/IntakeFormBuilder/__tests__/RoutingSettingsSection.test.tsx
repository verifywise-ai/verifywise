import { useEffect, useState } from "react";
import { vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import RoutingSettingsSection, { getRoutingErrors } from "../routing/RoutingSettingsSection";
import type { FormRouting } from "../types";
import { SCORE_BANDS } from "../../../../application/utils/intakeScoring/scoreMath";

const reviewers = [
  { _id: 1, name: "Ada Lovelace", email: "ada@example.com" },
  { _id: 2, name: "Grace Hopper", email: "grace@example.com" },
];

let mockRole = "Admin";
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockRole }),
}));

let latest: FormRouting | null = null;

const Harness = ({
  initial = null,
  loaded = true,
}: {
  initial?: FormRouting | null;
  loaded?: boolean;
}) => {
  const [value, setValue] = useState<FormRouting | null>(initial);
  useEffect(() => {
    latest = value;
  }, [value]);
  return (
    <RoutingSettingsSection
      value={value}
      onChange={setValue}
      reviewers={reviewers}
      reviewersLoaded={loaded}
    />
  );
};

const on = (patch: Partial<FormRouting> = {}): FormRouting => ({
  enabled: true,
  seniorReviewerIds: [1],
  standardReviewerIds: [2],
  threshold: 50,
  closeCallMargin: 10,
  secondReviewRate: 10,
  ...patch,
});

describe("RoutingSettingsSection for a non-Admin", () => {
  afterEach(() => {
    mockRole = "Admin";
  });

  it("shows the settings read-only with a helper line", () => {
    mockRole = "Editor";
    renderWithProviders(<Harness initial={on()} />);
    expect(screen.getByText("Only an Admin can change reviewer assignment.")).toBeInTheDocument();
    expect(screen.getByLabelText("Threshold")).toBeDisabled();
    expect(screen.getByLabelText("Close-call margin")).toBeDisabled();
    expect(document.querySelectorAll(".vw-multi-select .Mui-disabled").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Assign reviewers by risk score"));
    expect(latest?.enabled).toBe(true);
  });

  it("hides the helper line for an Admin", () => {
    renderWithProviders(<Harness initial={on()} />);
    expect(
      screen.queryByText("Only an Admin can change reviewer assignment."),
    ).not.toBeInTheDocument();
  });
});

describe("RoutingSettingsSection stale reviewers", () => {
  it("shows a saved reviewer who is not eligible as a removable Former user", () => {
    renderWithProviders(<Harness initial={on({ seniorReviewerIds: [1, 9] })} />);
    expect(screen.getByText("Former user")).toBeInTheDocument();
    fireEvent.click(
      screen.getByText("Former user").closest(".MuiChip-root")!.querySelector("svg")!,
    );
    expect(latest?.seniorReviewerIds).toEqual([1]);
  });

  it("leaves the value alone and marks nothing when the reviewer list did not load", () => {
    renderWithProviders(<Harness initial={on({ seniorReviewerIds: [1, 9] })} loaded={false} />);
    expect(screen.queryByText("Former user")).not.toBeInTheDocument();
    expect(latest?.seniorReviewerIds).toEqual([1, 9]);
  });
});

describe("RoutingSettingsSection", () => {
  it("is off by default and hides the fields", () => {
    renderWithProviders(<Harness />);
    expect(screen.getByText("Assign reviewers by risk score")).toBeInTheDocument();
    expect(screen.queryByLabelText("Threshold")).not.toBeInTheDocument();
    expect(screen.queryByText("Expert reviewers")).not.toBeInTheDocument();
  });

  it("shows the fields with 50, 10 and 10 when turned on", () => {
    renderWithProviders(<Harness />);
    fireEvent.click(screen.getByText("Assign reviewers by risk score"));
    expect(screen.getByLabelText("Threshold")).toHaveValue(50);
    expect(screen.getByLabelText("Close-call margin")).toHaveValue(10);
    expect(screen.getByLabelText("Second review share %")).toHaveValue(10);
    expect(screen.getByText("Expert reviewers")).toBeInTheDocument();
    expect(screen.getByText("Regular reviewers")).toBeInTheDocument();
  });

  it("asks for at least one senior and one standard reviewer when on with none", () => {
    renderWithProviders(<Harness />);
    fireEvent.click(screen.getByText("Assign reviewers by risk score"));
    expect(screen.getByText("Pick at least one expert reviewer")).toBeInTheDocument();
    expect(screen.getByText("Pick at least one regular reviewer")).toBeInTheDocument();
  });

  it("flags a threshold of 0", () => {
    renderWithProviders(<Harness initial={on()} />);
    fireEvent.change(screen.getByLabelText("Threshold"), { target: { value: "0" } });
    expect(screen.getByText("Use a number from 1 to 99")).toBeInTheDocument();
  });

  it("flags a cleared margin instead of treating it as zero", () => {
    renderWithProviders(<Harness initial={on()} />);
    fireEvent.change(screen.getByLabelText("Close-call margin"), { target: { value: "" } });
    expect(screen.getByText("Use a number from 0 to 25")).toBeInTheDocument();
  });

  it("updates the helper line when the threshold changes", () => {
    renderWithProviders(<Harness initial={on()} />);
    expect(screen.getByTestId("routing-helper")).toHaveTextContent(
      "Scores of 50 or more, prohibited practices and scores less than 10 points from 50 go to expert reviewers.",
    );
    fireEvent.change(screen.getByLabelText("Threshold"), { target: { value: "60" } });
    expect(screen.getByTestId("routing-helper")).toHaveTextContent(
      "Scores of 60 or more, prohibited practices and scores less than 10 points from 60 go to expert reviewers.",
    );
  });

  it("shows no errors for valid settings", () => {
    renderWithProviders(<Harness initial={on()} />);
    expect(screen.queryByText(/Use a number from/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pick at least one/)).not.toBeInTheDocument();
  });

  it("resets a cleared number to its default when routing is turned off", () => {
    renderWithProviders(<Harness initial={on()} />);
    fireEvent.change(screen.getByLabelText("Threshold"), { target: { value: "" } });
    expect(screen.getByText("Use a number from 1 to 99")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Assign reviewers by risk score"));
    expect(latest?.enabled).toBe(false);
    expect(latest?.threshold).toBe(50);
    expect(getRoutingErrors(latest)).toEqual({});
  });

  it("reports out-of-range numbers even while routing is off, so a save is blocked", () => {
    expect(getRoutingErrors(on({ enabled: false, threshold: 0 }))).toEqual({
      threshold: "Use a number from 1 to 99",
    });
    expect(getRoutingErrors(on({ enabled: false, seniorReviewerIds: [] }))).toEqual({});
  });

  it("renders the helper line as separate text fragments", () => {
    renderWithProviders(<Harness initial={on()} />);
    expect(screen.getByText("Scores of")).toBeInTheDocument();
    expect(screen.getByText("points from")).toBeInTheDocument();
    expect(screen.getByText("go to expert reviewers.")).toBeInTheDocument();
  });
});

describe("RoutingSettingsSection number tooltips", () => {
  it("gives each number a real info button outside its label", () => {
    renderWithProviders(<Harness initial={on()} />);
    for (const name of [
      "About the threshold",
      "About the close-call margin",
      "About the second review share",
    ]) {
      const trigger = screen.getByRole("button", { name });
      expect(trigger.tagName).toBe("BUTTON");
      expect(trigger.closest("label")).toBeNull();
    }
    // The labels still name the inputs.
    expect(screen.getByLabelText("Threshold")).toHaveValue(50);
  });

  it("opens on click (tap, Enter, Space) and closes on a second click or Escape", async () => {
    renderWithProviders(<Harness initial={on()} />);
    const trigger = screen.getByRole("button", { name: "About the close-call margin" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(await screen.findByTestId("routing-info-closeCallMargin")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("explains the threshold with the close-call exception, the 0-100 scale and every band", async () => {
    renderWithProviders(<Harness initial={on()} />);
    fireEvent.mouseOver(screen.getByRole("button", { name: "About the threshold" }));
    const info = await screen.findByTestId("routing-info-threshold");
    expect(info).toHaveTextContent("Scores at or above the threshold go to expert reviewers.");
    expect(info).toHaveTextContent("unless they are within the close-call margin");
    expect(info).toHaveTextContent("Risk scores run from 0 to 100");
    for (const { band, min, max } of SCORE_BANDS) {
      expect(info).toHaveTextContent(`${band}: ${min}–${max}`);
    }
    expect(info).toHaveTextContent("Prohibited practices always go to expert reviewers.");
    expect(info).toHaveTextContent(
      "So do submissions that have no score or whose AI scoring failed.",
    );
  });

  it("explains the close-call margin as a strict distance below the threshold", async () => {
    renderWithProviders(<Harness initial={on()} />);
    fireEvent.mouseOver(screen.getByRole("button", { name: "About the close-call margin" }));
    const info = await screen.findByTestId("routing-info-closeCallMargin");
    expect(info).toHaveTextContent(
      "Scores below the threshold by less than this margin also go to expert reviewers.",
    );
  });

  it("explains the second review share without the score scale", async () => {
    renderWithProviders(<Harness initial={on()} />);
    fireEvent.mouseOver(screen.getByRole("button", { name: "About the second review share" }));
    const info = await screen.findByTestId("routing-info-secondReviewRate");
    expect(info).toHaveTextContent("picked at random at this rate for a second review");
    expect(info).toHaveTextContent("Rejections aren't picked.");
    expect(info).not.toHaveTextContent("Risk scores run from 0 to 100");
  });
});
