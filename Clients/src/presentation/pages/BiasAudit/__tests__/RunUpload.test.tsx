import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const { readHeaders } = vi.hoisted(() => ({ readHeaders: vi.fn() }));

vi.mock("../csvHeaders", () => ({ readCsvHeaders: readHeaders }));

vi.mock("../../../../application/hooks/useAedtBiasAudit", () => ({
  useCreateAedtRun: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
}));

import RunUpload from "../RunUpload";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const csv = (name: string) => new File(["a,b\n1,2\n"], name, { type: "text/csv" });

function renderUpload(metric: "selection_rate" | "scoring_rate" | null = "selection_rate") {
  renderWithProviders(
    <RunUpload projectId={7} metric={metric} canEdit blockedReason={null} onCreated={vi.fn()} />,
  );
}

describe("RunUpload", () => {
  beforeEach(() => readHeaders.mockReset());

  it("keeps the later file when an earlier file's header read finishes last", async () => {
    const slow = deferred<string[]>();
    const fast = deferred<string[]>();
    readHeaders.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    renderUpload();
    const input = screen.getByTestId("aedt-dataset-input");

    fireEvent.change(input, { target: { files: [csv("first.csv")] } });
    fireEvent.change(input, { target: { files: [csv("second.csv")] } });
    await act(async () => fast.resolve(["sex", "race", "picked"]));
    await act(async () => slow.resolve(["old_col"]));

    expect(screen.getByText("second.csv")).toBeInTheDocument();
    expect(screen.queryByText("first.csv")).not.toBeInTheDocument();
  });

  it("states the rate the attested profile forces", () => {
    renderUpload("scoring_rate");
    expect(
      screen.getByText(/attested cutoff answer means this run computes scoring rates/),
    ).toBeInTheDocument();
  });

  it("explains a missing rate and withholds the run", () => {
    renderUpload(null);
    expect(screen.getByText(/does not say who applies the cutoff/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /choose csv file/i })).toBeDisabled();
  });
});
