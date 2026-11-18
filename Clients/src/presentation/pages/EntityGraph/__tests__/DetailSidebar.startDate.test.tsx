import { vi, describe, it, expect, afterEach } from "vitest";
import { format } from "date-fns";

vi.mock("../../../../application/hooks/useFormattedDate", () => ({
  default: () => (date: Date) => format(date, "yyyy-MM-dd"),
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import DetailSidebar, { type EntityDetails } from "../DetailSidebar";

const originalTz = process.env.TZ;

const useCase = (start_date: string): EntityDetails => ({
  id: "project-7",
  entityType: "useCase",
  label: "Hiring tool",
  color: "#000",
  rawData: { start_date },
});

describe("DetailSidebar use case start date", () => {
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("shows a start date stored at 00:00 UTC as that day west of UTC", () => {
    process.env.TZ = "Etc/GMT+8"; // UTC-8: the instant is 16 November locally
    renderWithProviders(
      <DetailSidebar
        entity={useCase("2026-11-17T00:00:00.000Z")}
        onClose={vi.fn()}
        onNavigateToEntity={vi.fn()}
      />,
    );
    expect(screen.getByText("2026-11-17")).toBeInTheDocument();
  });
});
