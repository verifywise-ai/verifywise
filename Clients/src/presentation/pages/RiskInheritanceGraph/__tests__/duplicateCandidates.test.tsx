import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import userEvent from "@testing-library/user-event";
import { summariseTerms, similarityPercent } from "../DuplicateCandidates";
import type { DuplicateReport } from "../../../../domain/interfaces/i.riskLink";

const mockGetDuplicateCandidates = vi.fn();
const mockCreateRiskLink = vi.fn();
const mockDeleteEntityById = vi.fn();
const mockNavigate = vi.fn();

vi.mock("../../../../application/repository/riskLink.repository", () => ({
  getDuplicateCandidates: (...args: unknown[]) => mockGetDuplicateCandidates(...args),
  createRiskLink: (...args: unknown[]) => mockCreateRiskLink(...args),
}));

vi.mock("../../../../application/repository/entity.repository", () => ({
  deleteEntityById: (...args: unknown[]) => mockDeleteEntityById(...args),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => mockNavigate,
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [{ id: 7, name: "Ada", surname: "Lovelace", email: "ada@x.io", roleId: 1 }],
    loading: false,
    error: null,
    refreshUsers: vi.fn(),
  }),
}));

import DuplicateCandidates from "../DuplicateCandidates";

describe("duplicate candidate helpers", () => {
  it("caps a long term list and counts the rest instead of scrolling it", () => {
    const terms = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(summariseTerms(terms)).toBe("a, b, c, d, e, f +2 more");
    expect(summariseTerms(terms.slice(0, 6))).toBe("a, b, c, d, e, f");
  });

  it("renders a dash rather than a blank cell for no shared terms", () => {
    expect(summariseTerms([])).toBe("—");
  });

  it("reads the 0-1 ratio as a whole percent", () => {
    expect(similarityPercent(0.25)).toBe(25);
    expect(similarityPercent(0.335)).toBe(34);
    expect(similarityPercent(1)).toBe(100);
  });
});

describe("DuplicateCandidates rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const report = (overrides: Partial<DuplicateReport> = {}): DuplicateReport => ({
    organization_id: 1,
    scanned: 12,
    compared: 30,
    matched: 0,
    truncated: false,
    candidates: [],
    ...overrides,
  });

  const pair = {
    risk_a: { id: 11, risk_name: "Model drift unnoticed", risk_owner: 7 },
    risk_b: { id: 12, risk_name: "Model drift undetected", risk_owner: null },
    similarity: 0.62,
    shared_tokens: ["model", "drift"],
    also_shares: ["category: Operational risk", "project"],
  };

  const expand = async () => {
    renderWithProviders(<DuplicateCandidates />);
    await userEvent.click(await screen.findByText("Duplicate candidates"));
  };

  it("resolves both owners — a known id by name, a null one as unassigned", async () => {
    mockGetDuplicateCandidates.mockResolvedValue(report({ candidates: [pair] }));
    await expand();

    expect(await screen.findByText("Model drift unnoticed")).toBeInTheDocument();
    expect(screen.getByText(/#11 · Ada Lovelace/)).toBeInTheDocument();
    expect(screen.getByText(/#12 · Unassigned/)).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
  });

  it("falls back to the id when the user list does not carry the owner", async () => {
    mockGetDuplicateCandidates.mockResolvedValue(
      report({
        candidates: [{ ...pair, risk_a: { ...pair.risk_a, risk_owner: 999 } }],
      }),
    );
    await expand();

    expect(await screen.findByText(/#11 · User #999/)).toBeInTheDocument();
  });

  it("says the scan was capped rather than passing a sample off as the whole org", async () => {
    mockGetDuplicateCandidates.mockResolvedValue(
      report({ truncated: true, matched: 80, candidates: [pair] }),
    );
    await expand();

    expect(await screen.findByRole("status")).toHaveTextContent(/size limit/i);
    expect(screen.queryByText(/closest of/)).not.toBeInTheDocument();
  });

  it("says a complete scan kept only the closest pairs, and how many matched", async () => {
    mockGetDuplicateCandidates.mockResolvedValue(report({ matched: 1770, candidates: [pair] }));
    await expand();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Showing the 1 closest of 1,770 matching pairs.",
    );
    expect(screen.queryByText(/size limit/i)).not.toBeInTheDocument();
  });

  it("shows no notice when every matching pair is listed", async () => {
    mockGetDuplicateCandidates.mockResolvedValue(report({ matched: 1, candidates: [pair] }));
    await expand();

    expect(await screen.findByText("Model drift unnoticed")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reports no duplicates as a result, quoting how many pairs were compared", async () => {
    mockGetDuplicateCandidates.mockResolvedValue(report());
    await expand();

    expect(await screen.findByText(/No likely duplicates/)).toBeInTheDocument();
    expect(screen.getByText(/30 pairs compared/)).toBeInTheDocument();
  });

  it("distinguishes an empty organization from a clean scan", async () => {
    mockGetDuplicateCandidates.mockResolvedValue(report({ scanned: 0, compared: 0 }));
    await expand();

    expect(await screen.findByText("No risks to scan yet.")).toBeInTheDocument();
  });

  it("surfaces a failed fetch instead of an empty table", async () => {
    mockGetDuplicateCandidates.mockRejectedValue(new Error("boom"));
    await expand();

    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});

describe("DuplicateCandidates row actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const pair = {
    risk_a: { id: 11, risk_name: "Model drift unnoticed", risk_owner: 7 },
    risk_b: { id: 12, risk_name: "Model drift undetected", risk_owner: null },
    similarity: 0.62,
    shared_tokens: ["model", "drift"],
    also_shares: ["project"],
  };

  const report = (candidates = [pair]): DuplicateReport => ({
    organization_id: 1,
    scanned: 12,
    compared: 30,
    matched: candidates.length,
    truncated: false,
    candidates,
  });

  const openActions = async () => {
    renderWithProviders(<DuplicateCandidates />);
    await userEvent.click(await screen.findByText("Duplicate candidates"));
    await userEvent.click(await screen.findByRole("button", { name: "Duplicate pair actions" }));
  };

  it("opens either risk in Risk Management", async () => {
    mockGetDuplicateCandidates.mockResolvedValue(report());
    await openActions();

    await userEvent.click(screen.getByRole("menuitem", { name: "Open risk #12" }));
    expect(mockNavigate).toHaveBeenCalledWith("/risk-management?riskId=12");
  });

  it("links the pair as related", async () => {
    mockGetDuplicateCandidates.mockResolvedValue(report());
    mockCreateRiskLink.mockResolvedValue({ id: 99 });
    await openActions();

    await userEvent.click(screen.getByRole("menuitem", { name: "Link as related" }));
    expect(mockCreateRiskLink).toHaveBeenCalledWith({
      sourceRiskId: 11,
      targetRiskId: 12,
      relationType: "related_to",
    });
    expect(await screen.findByText(/now linked as related/)).toBeInTheDocument();
  });

  it("shows the server's reason when linking fails", async () => {
    mockGetDuplicateCandidates.mockResolvedValue(report());
    mockCreateRiskLink.mockRejectedValue(new Error("These risks are already linked"));
    await openActions();

    await userEvent.click(screen.getByRole("menuitem", { name: "Link as related" }));
    expect(await screen.findByText("These risks are already linked")).toBeInTheDocument();
  });

  it("deletes one side only after confirmation, then reloads the report", async () => {
    mockGetDuplicateCandidates.mockResolvedValueOnce(report()).mockResolvedValueOnce(report([]));
    mockDeleteEntityById.mockResolvedValue({ status: 200 });
    await openActions();

    await userEvent.click(screen.getByRole("menuitem", { name: "Delete risk #12" }));
    expect(mockDeleteEntityById).not.toHaveBeenCalled();
    expect(screen.getByText(/stays\./)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete risk" }));
    expect(mockDeleteEntityById).toHaveBeenNthCalledWith(1, { routeUrl: "/projectRisks/12" });
    expect(mockDeleteEntityById).toHaveBeenNthCalledWith(2, {
      routeUrl: "/policy-linked/risk/12/unlink-all",
    });
    expect(await screen.findByText('Deleted "Model drift undetected".')).toBeInTheDocument();
    expect(mockGetDuplicateCandidates).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/No likely duplicates/)).toBeInTheDocument();
  });
});
