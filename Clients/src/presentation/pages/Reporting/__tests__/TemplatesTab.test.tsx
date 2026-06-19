import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../../../application/hooks/useReporting", () => ({
  useTemplates: () => ({
    data: [
      {
        id: 1,
        name: "Daily Governance Pulse",
        category: "operational",
        recommended_frequency: "daily",
      },
    ],
    isLoading: false,
  }),
}));

import TemplatesTab from "../TemplatesTab";

describe("TemplatesTab", () => {
  it("renders template cards", () => {
    render(<TemplatesTab onUse={() => {}} />);
    expect(screen.getByText("Daily Governance Pulse")).toBeInTheDocument();
    expect(screen.getByText(/Use Template/i)).toBeInTheDocument();
  });
});
