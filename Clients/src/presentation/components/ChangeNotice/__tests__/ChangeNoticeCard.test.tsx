import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ChangeNoticeCard from "../ChangeNoticeCard";
import type { ChangeNoticeEntry } from "../../../../domain/types/changeNotice.types";

const handlers = () => ({
  onDismiss: vi.fn(),
  onShowMe: vi.fn(),
  onOpenGuide: vi.fn(),
  showMeActive: false,
  canShowMe: true,
});

describe("ChangeNoticeCard", () => {
  it("rename variant renders both words in one title", () => {
    const entry: ChangeNoticeEntry = {
      id: "rename-test",
      routes: ["/x"],
      variant: "rename",
      title: "Extensions are now Integrations",
      body: "Same connections, and old links still work.",
      rename: { from: "Extensions", to: "Integrations" },
      guidePath: "x/y",
    };
    const props = handlers();
    renderWithProviders(<ChangeNoticeCard entry={entry} {...props} />);
    const heading = screen.getByRole("heading");
    expect(heading).toHaveTextContent("Extensions");
    expect(heading).toHaveTextContent("Integrations");
    fireEvent.click(screen.getByTestId("change-notice-got-it"));
    expect(props.onDismiss).toHaveBeenCalled();
  });

  it("moved variant renders the strip with a label naming item, before and now", () => {
    const entry: ChangeNoticeEntry = {
      id: "moved-test",
      routes: ["/x"],
      variant: "moved",
      title: "AI Gateway is now in the sidebar",
      body: "Find it under Enforce.",
      moved: { item: "AI Gateway", before: "App switcher", now: "Enforce" },
      showMeTestId: "nav-item-ai-gateway",
    };
    renderWithProviders(<ChangeNoticeCard entry={entry} {...handlers()} />);
    const strip = screen.getByRole("img");
    const label = strip.getAttribute("aria-label") ?? "";
    expect(label).toContain("AI Gateway");
    expect(label).toContain("App switcher");
    expect(label).toContain("Enforce");
    expect(screen.getByRole("status")).toHaveAccessibleName("AI Gateway is now in the sidebar");
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("after Show me, the button reads Got it and dismisses the card", () => {
    const entry: ChangeNoticeEntry = {
      id: "moved-test",
      routes: ["/x"],
      variant: "moved",
      title: "T",
      moved: { item: "AI Gateway", before: "App switcher", now: "Enforce" },
      showMeTestId: "nav-item-ai-gateway",
    };
    const props = { ...handlers(), showMeActive: true };
    renderWithProviders(<ChangeNoticeCard entry={entry} {...props} />);
    const button = screen.getByTestId("change-notice-show-me");
    expect(button).toHaveTextContent("Got it");
    fireEvent.click(button);
    expect(props.onDismiss).toHaveBeenCalled();
    expect(props.onShowMe).not.toHaveBeenCalled();
  });

  it("hides Show me when the target is not available and the guide when there is no path", () => {
    const entry: ChangeNoticeEntry = {
      id: "moved-test",
      routes: ["/x"],
      variant: "moved",
      title: "T",
      moved: { item: "A", before: "B", now: "C" },
      showMeTestId: "nav-item-a",
    };
    renderWithProviders(<ChangeNoticeCard entry={entry} {...handlers()} canShowMe={false} />);
    expect(screen.queryByTestId("change-notice-show-me")).not.toBeInTheDocument();
    expect(screen.queryByTestId("change-notice-guide")).not.toBeInTheDocument();
  });
});
