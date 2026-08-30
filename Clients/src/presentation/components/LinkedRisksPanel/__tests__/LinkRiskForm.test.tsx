import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material";
import { light } from "../../../themes";
import { RiskLink } from "../../../../domain/interfaces/i.riskLink";

const mockCreate = vi.fn();
const mockGetAllProjectRisks = vi.fn();

vi.mock("../../../../application/hooks/useRiskLinks", () => ({
  useCreateRiskLink: () => ({ mutate: mockCreate, isPending: false }),
}));

vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisks: (...args: unknown[]) => mockGetAllProjectRisks(...args),
}));

import LinkRiskForm from "../LinkRiskForm";

// The app theme is required, not decorative: AutoCompleteField reads
// theme.palette.border.dark, which MUI's default theme does not define, so a
// bare render throws before any assertion runs.
const wrap = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={light}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </ThemeProvider>,
  );
};

const link = (overrides: Partial<RiskLink>): RiskLink => ({
  id: 1,
  status: "confirmed",
  source: "user",
  relationType: "related_to",
  score: 0,
  reasons: [],
  direction: "undirected",
  decidedAt: null,
  lastComputedAt: null,
  dismissReason: null,
  dismissNote: null,
  relatedRisk: { id: 9, entityType: "risk", name: "Model drift", riskLevel: null, ownerId: null },
  ...overrides,
});

// getAllProjectRisks returns response.data, and the array sits one level deeper
// inside that — the payload is { message, data: [...] }.
const risksResponse = (risks: { id: number; risk_name: string }[]) => ({ data: risks });

// Queried by placeholder, not by accessible name: AutoCompleteField renders its
// `label` as a detached <Typography> above the field and passes only
// `placeholder` down to the TextField, so the combobox has no accessible name.
const pick = async (name: string) => {
  const input = screen.getByPlaceholderText("Search risks");
  await userEvent.click(input);
  await userEvent.click(await screen.findByText(name));
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllProjectRisks.mockResolvedValue(
    risksResponse([
      { id: 42, risk_name: "Subject risk" },
      { id: 9, risk_name: "Model drift" },
      { id: 10, risk_name: "Data quality" },
      { id: 11, risk_name: "Vendor outage" },
    ]),
  );
});

describe("LinkRiskForm payloads", () => {
  it("sends the subject as source for Related to", async () => {
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await pick("Data quality");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(mockCreate).toHaveBeenCalledWith(
      { sourceRiskId: 42, targetRiskId: 10, relationType: "related_to" },
      expect.anything(),
    );
  });

  it("sends the subject as source for Inherits from", async () => {
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("radio", { name: "Inherits from" }));
    await pick("Data quality");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(mockCreate).toHaveBeenCalledWith(
      { sourceRiskId: 42, targetRiskId: 10, relationType: "inherits_from" },
      expect.anything(),
    );
  });

  // The one place the client expresses direction. Getting this backwards stores
  // the inheritance the wrong way round with no visible symptom.
  it("swaps the ids for Is inherited by", async () => {
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("radio", { name: "Is inherited by" }));
    await pick("Data quality");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(mockCreate).toHaveBeenCalledWith(
      { sourceRiskId: 10, targetRiskId: 42, relationType: "inherits_from" },
      expect.anything(),
    );
  });
});

describe("LinkRiskForm candidates", () => {
  it("never offers the subject itself", async () => {
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await userEvent.click(screen.getByPlaceholderText("Search risks"));

    expect(await screen.findByText("Data quality")).toBeInTheDocument();
    expect(screen.queryByText("Subject risk")).not.toBeInTheDocument();
  });

  it("excludes a risk already related, for the Related to choice only", async () => {
    const existing = [link({ relationType: "related_to", relatedRisk: { id: 9, entityType: "risk", name: "Model drift", riskLevel: null, ownerId: null } })];
    wrap(<LinkRiskForm riskId={42} existingLinks={existing} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await userEvent.click(screen.getByPlaceholderText("Search risks"));
    expect(screen.queryByText("Model drift")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    // A pair may legitimately hold both a related_to and an inherits_from.
    await userEvent.click(screen.getByRole("radio", { name: "Inherits from" }));
    await userEvent.click(screen.getByPlaceholderText("Search risks"));
    expect(await screen.findByText("Model drift")).toBeInTheDocument();
  });

  // A SUGGESTED incoming inherits_from blocks both inheritance choices: one would
  // be the duplicate the server refuses, the other a rule violation. Suggested,
  // not confirmed — a confirmed row now disables both radios outright (the
  // grouping rule), so the exclusion this test is about could never be reached
  // through a confirmed fixture.
  it("excludes a risk holding the reverse inheritance from both inheritance choices", async () => {
    const existing = [
      link({
        status: "suggested",
        relationType: "inherits_from",
        direction: "incoming",
        relatedRisk: { id: 11, entityType: "risk", name: "Vendor outage", riskLevel: null, ownerId: null },
      }),
    ];
    wrap(<LinkRiskForm riskId={42} existingLinks={existing} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("radio", { name: "Inherits from" }));
    await userEvent.click(screen.getByPlaceholderText("Search risks"));
    expect(screen.queryByText("Vendor outage")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("radio", { name: "Is inherited by" }));
    await userEvent.click(screen.getByPlaceholderText("Search risks"));
    expect(screen.queryByText("Vendor outage")).not.toBeInTheDocument();
  });

  // The exclusions are computed from suggested + confirmed only, so a dismissed
  // partner stays selectable on purpose — the 409 explains it (§6.4).
  it("keeps a risk selectable when its only link is dismissed", async () => {
    const existing = [
      link({ status: "dismissed", relationType: "related_to",
             relatedRisk: { id: 9, entityType: "risk", name: "Model drift", riskLevel: null, ownerId: null } }),
    ];
    // The panel does not pass dismissed links down; simulate that by passing none.
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await userEvent.click(screen.getByPlaceholderText("Search risks"));
    expect(await screen.findByText("Model drift")).toBeInTheDocument();
    expect(existing[0].status).toBe("dismissed");
  });
});

describe("LinkRiskForm errors", () => {
  it("shows the server's 409 message inline", async () => {
    mockCreate.mockImplementation((_input: unknown, options: any) =>
      options.onError({
        status: 409,
        message:
          'These risks are already linked. If the link was dismissed, use "Show dismissed" to restore it.',
      }),
    );
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await pick("Data quality");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(
      await screen.findByText(
        'These risks are already linked. If the link was dismissed, use "Show dismissed" to restore it.',
      ),
    ).toBeInTheDocument();
  });

  it("shows the cycle message on the other 409", async () => {
    mockCreate.mockImplementation((_input: unknown, options: any) =>
      options.onError({ status: 409, message: "These risks would inherit from each other" }),
    );
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("radio", { name: "Inherits from" }));
    await pick("Data quality");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(
      await screen.findByText("These risks would inherit from each other"),
    ).toBeInTheDocument();
  });

  it("rewrites a 404 into its own message", async () => {
    mockCreate.mockImplementation((_input: unknown, options: any) =>
      options.onError({ status: 404, message: "Risk not found" }),
    );
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await pick("Data quality");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(await screen.findByText("One of these risks no longer exists")).toBeInTheDocument();
  });

  it("closes on success", async () => {
    const onClose = vi.fn();
    mockCreate.mockImplementation((_input: unknown, options: any) => options.onSuccess());
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={onClose} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await pick("Data quality");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("disables Link until a risk is chosen", async () => {
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Link" })).toBeDisabled();
  });

  const parentLink = link({ relationType: "inherits_from", direction: "outgoing" });
  const childLink = link({ relationType: "inherits_from", direction: "incoming" });

  it("disables both hierarchy choices when the risk already has a parent", async () => {
    mockGetAllProjectRisks.mockResolvedValue(risksResponse([{ id: 9, risk_name: "Model drift" }]));
    wrap(<LinkRiskForm riskId={1} existingLinks={[parentLink]} onClose={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Inherits from" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Is inherited by" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Relates to" })).toBeEnabled();
  });

  it("disables only 'Inherits from' when the risk has children", async () => {
    // A parent may still gain more children, so "Is inherited by" stays open.
    mockGetAllProjectRisks.mockResolvedValue(risksResponse([{ id: 9, risk_name: "Model drift" }]));
    wrap(<LinkRiskForm riskId={1} existingLinks={[childLink]} onClose={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Inherits from" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Is inherited by" })).toBeEnabled();
  });

  it("explains why a choice is unavailable", async () => {
    mockGetAllProjectRisks.mockResolvedValue(risksResponse([{ id: 9, risk_name: "Model drift" }]));
    wrap(<LinkRiskForm riskId={1} existingLinks={[parentLink]} onClose={vi.fn()} />);
    expect(
      screen.getByText("This risk already has a parent, so it can only relate to other risks."),
    ).toBeInTheDocument();
  });

  it("disables nothing when the only inheritance link is a suggestion", async () => {
    // Suggestions are allowed to conflict — that is what lets a future agent
    // offer a choice between candidate parents.
    mockGetAllProjectRisks.mockResolvedValue(risksResponse([{ id: 9, risk_name: "Model drift" }]));
    wrap(
      <LinkRiskForm
        riskId={1}
        existingLinks={[{ ...parentLink, status: "suggested" }]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: "Inherits from" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Is inherited by" })).toBeEnabled();
  });

  it("falls back to 'Relates to' when the selected choice becomes disabled", async () => {
    mockGetAllProjectRisks.mockResolvedValue(risksResponse([{ id: 9, risk_name: "Model drift" }]));
    // Not using `wrap` here: it builds its QueryClient internally, and rerendering
    // with a fresh client remounts the provider and refetches. Hold one client so
    // the rerender is a prop change and nothing else.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (links: RiskLink[]) => (
      <ThemeProvider theme={light}>
        <QueryClientProvider client={client}>
          <LinkRiskForm riskId={1} existingLinks={links} onClose={vi.fn()} />
        </QueryClientProvider>
      </ThemeProvider>
    );

    const { rerender } = render(tree([]));
    await userEvent.click(screen.getByRole("radio", { name: "Inherits from" }));
    expect(screen.getByRole("radio", { name: "Inherits from" })).toBeChecked();

    // The panel refetched while the form was open and a parent appeared.
    rerender(tree([parentLink]));
    expect(screen.getByRole("radio", { name: "Relates to" })).toBeChecked();
  });
});
