import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AIContentReviewPanel from "../index";
import type { AIContentMetadata } from "../../../../domain/interfaces/i.aiContent";

vi.mock("../../Chip", () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock("../../AIContentBadge", () => ({
  default: ({ badgeType }: { badgeType: string }) => <span>{badgeType}</span>,
}));

const baseItem: AIContentMetadata = {
  id: 1,
  entity_type: "risk_assessment",
  entity_id: 42,
  field_name: "description",
  badge_type: "generated",
  model_used: "gpt-4",
  model_provider: "OpenAI",
  tool_name: "AITool",
  confidence_score: 92,
  prompt_summary: "Generated content for risk assessment",
  human_reviewed: false,
  reviewed_by: null,
  reviewed_at: null,
  review_action: null,
  created_by: 1,
  created_at: "2024-01-15T10:30:00",
};

describe("AIContentReviewPanel", () => {
  it("renders formatted entity type and id", () => {
    renderWithProviders(<AIContentReviewPanel item={baseItem} onReview={vi.fn()} />);
    expect(screen.getByText(/Risk Assessment/)).toBeInTheDocument();
    expect(screen.getByText(/#42/)).toBeInTheDocument();
  });

  it("renders field name chip", () => {
    renderWithProviders(<AIContentReviewPanel item={baseItem} onReview={vi.fn()} />);
    expect(screen.getByText("description")).toBeInTheDocument();
  });

  it("does not render chip when field_name is null", () => {
    renderWithProviders(
      <AIContentReviewPanel item={{ ...baseItem, field_name: null }} onReview={vi.fn()} />,
    );
    expect(screen.queryByText("description")).not.toBeInTheDocument();
  });

  it("renders model_used tag", () => {
    renderWithProviders(<AIContentReviewPanel item={baseItem} onReview={vi.fn()} />);
    expect(screen.getByText("gpt-4")).toBeInTheDocument();
  });

  it("does not render model_used when null", () => {
    renderWithProviders(
      <AIContentReviewPanel item={{ ...baseItem, model_used: null }} onReview={vi.fn()} />,
    );
    expect(screen.queryByText("gpt-4")).not.toBeInTheDocument();
  });

  it("renders model_provider tag", () => {
    renderWithProviders(<AIContentReviewPanel item={baseItem} onReview={vi.fn()} />);
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
  });

  it("does not render model_provider when null", () => {
    renderWithProviders(
      <AIContentReviewPanel item={{ ...baseItem, model_provider: null }} onReview={vi.fn()} />,
    );
    expect(screen.queryByText("OpenAI")).not.toBeInTheDocument();
  });

  it("renders tool_name tag", () => {
    renderWithProviders(<AIContentReviewPanel item={baseItem} onReview={vi.fn()} />);
    expect(screen.getByText("AITool")).toBeInTheDocument();
  });

  it("does not render tool_name when null", () => {
    renderWithProviders(
      <AIContentReviewPanel item={{ ...baseItem, tool_name: null }} onReview={vi.fn()} />,
    );
    expect(screen.queryByText("AITool")).not.toBeInTheDocument();
  });

  it("renders confidence_score as percentage", () => {
    renderWithProviders(<AIContentReviewPanel item={baseItem} onReview={vi.fn()} />);
    expect(screen.getByText("92%")).toBeInTheDocument();
  });

  it("does not render confidence_score when null", () => {
    renderWithProviders(
      <AIContentReviewPanel item={{ ...baseItem, confidence_score: null }} onReview={vi.fn()} />,
    );
    expect(screen.queryByText("%")).not.toBeInTheDocument();
  });

  it("renders prompt summary", () => {
    renderWithProviders(<AIContentReviewPanel item={baseItem} onReview={vi.fn()} />);
    expect(screen.getByText("Generated content for risk assessment")).toBeInTheDocument();
  });

  it("renders created date", () => {
    renderWithProviders(<AIContentReviewPanel item={baseItem} onReview={vi.fn()} />);
    expect(screen.getByText(/2024/)).toBeInTheDocument();
  });

  it("shows review buttons when not human_reviewed", () => {
    renderWithProviders(<AIContentReviewPanel item={baseItem} onReview={vi.fn()} />);
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /modified/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  it("shows reviewed state when human_reviewed and no review buttons", () => {
    const reviewedItem: AIContentMetadata = {
      ...baseItem,
      human_reviewed: true,
      review_action: "approved",
      reviewed_at: "2024-01-16",
    };
    renderWithProviders(<AIContentReviewPanel item={reviewedItem} onReview={vi.fn()} />);
    expect(screen.getByText(/Approved/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /modified/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reject/i })).not.toBeInTheDocument();
  });

  it("calls onReview with approved when approve is clicked", async () => {
    const handleReview = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<AIContentReviewPanel item={baseItem} onReview={handleReview} />);
    await user.click(screen.getByRole("button", { name: /approve/i }));
    expect(handleReview).toHaveBeenCalledWith(1, "approved", undefined);
  });

  it("calls onReview with modified when modified is clicked", async () => {
    const handleReview = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<AIContentReviewPanel item={baseItem} onReview={handleReview} />);
    await user.click(screen.getByRole("button", { name: /modified/i }));
    expect(handleReview).toHaveBeenCalledWith(1, "modified", undefined);
  });

  it("calls onReview with rejected when reject is clicked", async () => {
    const handleReview = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<AIContentReviewPanel item={baseItem} onReview={handleReview} />);
    await user.click(screen.getByRole("button", { name: /reject/i }));
    expect(handleReview).toHaveBeenCalledWith(1, "rejected", undefined);
  });

  it("includes notes when provided before approving", async () => {
    const handleReview = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<AIContentReviewPanel item={baseItem} onReview={handleReview} />);
    const textarea = screen.getByPlaceholderText(/Add review notes/);
    await user.type(textarea, "Looks good");
    await user.click(screen.getByRole("button", { name: /approve/i }));
    expect(handleReview).toHaveBeenCalledWith(1, "approved", "Looks good");
  });

  it("disables all buttons when isReviewing is true", () => {
    renderWithProviders(<AIContentReviewPanel item={baseItem} onReview={vi.fn()} isReviewing />);
    expect(screen.getByRole("button", { name: /approve/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /modified/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /reject/i })).toBeDisabled();
  });
});
