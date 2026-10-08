import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import Result from "./Result";
import type {
  ClassificationLevel,
  ClassificationResult,
} from "../../../../domain/types/euAiActClassification";

const make = (
  level: ClassificationLevel,
  extra: Partial<ClassificationResult> = {},
): ClassificationResult => ({
  questionnaireVersion: 2,
  level,
  role: null,
  reasons: [],
  obligations: [],
  ...extra,
});

const renderResult = (result: ClassificationResult) =>
  renderWithProviders(<Result result={result} />);

describe("Result", () => {
  it.each([
    ["Prohibited", "Prohibited AI system"],
    ["High risk", "High-risk AI system"],
    ["Limited risk", "Limited risk"],
    ["Minimal risk", "Minimal risk"],
    ["Out of scope", "Outside the EU AI Act"],
  ] as const)("renders the title for %s", (level, title) => {
    renderResult(make(level));
    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it("describes a prohibited result without claiming a date", () => {
    renderResult(make("Prohibited"));
    expect(
      screen.getByText("The system falls under a prohibited practice in Article 5."),
    ).toBeInTheDocument();
  });

  it("lists each reason's article and text", () => {
    renderResult(
      make("High risk", {
        reasons: [
          { article: "Article 6(2)", text: "Annex III use." },
          { article: "Article 9", text: "Risk management." },
        ],
      }),
    );
    expect(screen.getByText("Article 6(2)")).toBeInTheDocument();
    expect(screen.getByText("Annex III use.")).toBeInTheDocument();
    expect(screen.getByText("Article 9")).toBeInTheDocument();
  });

  it("lists obligations and shows appliesFrom as separate text nodes", () => {
    renderResult(
      make("High risk", {
        obligations: [
          { article: "Article 26", text: "Deployer duties.", appliesFrom: "2027-12-02" },
        ],
      }),
    );
    expect(screen.getByText("Article 26")).toBeInTheDocument();
    expect(screen.getByText("Deployer duties.")).toBeInTheDocument();
    expect(screen.getByText("Applies from")).toBeInTheDocument();
    expect(screen.getByText("2 Dec 2027")).toBeInTheDocument();
  });

  it("hides the obligations section when there are none", () => {
    renderResult(make("Minimal risk"));
    expect(screen.queryByText("Obligations")).not.toBeInTheDocument();
  });
});
