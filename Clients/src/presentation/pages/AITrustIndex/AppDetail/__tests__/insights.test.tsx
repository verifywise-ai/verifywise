import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { VerdictLine, WatchOuts, ComparisonStrip } from "../insights";
import type { TrustIndexAppData } from "../../shared";

const app = (over: Partial<TrustIndexAppData> = {}): TrustIndexAppData => ({
  slug: "x",
  name: "X",
  vendor: "V",
  domain: "x.com",
  category: "Assistant",
  scoreOutOf100: 82,
  letterGrade: "B",
  displayedGrade: "B",
  confidence: "High",
  dealbreakerFlags: [],
  summary: "s",
  highlights: [],
  policyUrl: "https://x.com",
  policyLastUpdated: null,
  modalities: ["text"],
  processesBiometrics: false,
  ...over,
});

describe("VerdictLine", () => {
  it("states the grade and a band-consistent reason", () => {
    renderWithProviders(<VerdictLine app={app({ displayedGrade: "B", scoreOutOf100: 82 })} />);
    expect(screen.getByText(/earns/i)).toBeInTheDocument();
    expect(screen.getByText(/B \(82\/100\)/)).toBeInTheDocument();
  });
});

describe("WatchOuts", () => {
  it("renders nothing without indicators", () => {
    const { container } = renderWithProviders(<WatchOuts indicators={null} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("lists gap phrases for zero/half indicators", () => {
    renderWithProviders(
      <WatchOuts indicators={{ "D7.2": { award: "zero", subFlag: "SILENT" } }} />,
    );
    expect(screen.getByText(/Not stated: breach notification/i)).toBeInTheDocument();
  });
});

describe("ComparisonStrip", () => {
  it("excludes the app itself from the peer average", () => {
    const a = app({ slug: "a", category: "Assistant", scoreOutOf100: 90 });
    const peers = [
      a,
      app({ slug: "b", category: "Assistant", scoreOutOf100: 70 }),
      app({ slug: "c", category: "Assistant", scoreOutOf100: 80 }),
    ];
    renderWithProviders(<ComparisonStrip app={a} allApps={peers} />);
    // peer avg of b,c = 75; vs = +15
    expect(screen.getByText(/\+15/)).toBeInTheDocument();
  });
});
