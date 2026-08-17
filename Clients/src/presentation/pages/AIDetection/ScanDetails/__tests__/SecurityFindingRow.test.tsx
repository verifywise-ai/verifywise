import { render, screen, fireEvent } from "@testing-library/react";
import { SecurityFindingRow } from "../SecurityFindingRow";
import type { SecurityFinding } from "../../../../../domain/ai-detection/types";

const baseFinding: SecurityFinding = {
  id: 1,
  finding_type: "model_security",
  category: "Model security",
  name: "unsafe_pickle_load",
  provider: "PyTorch",
  confidence: "high",
  description: "Model file uses unsafe pickle deserialization.",
  file_count: 2,
  file_paths: [
    { path: "models/model.pt", line_number: 5, matched_text: "pickle.load(f)" },
    { path: "models/other.pt", line_number: null, matched_text: "" },
  ],
  severity: "critical",
  cwe_id: "CWE-502",
  cwe_name: "Deserialization of Untrusted Data",
  owasp_ml_id: "ML06",
  owasp_ml_name: "AI Supply Chain Attacks",
  threat_type: "Arbitrary code execution",
  operator_name: "torch.load",
  module_name: "torch",
};

describe("SecurityFindingRow", () => {
  it("renders the finding name, module, cwe and owasp ids", () => {
    render(
      <SecurityFindingRow
        finding={baseFinding}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    expect(screen.getByText("unsafe_pickle_load")).toBeInTheDocument();
    expect(screen.getByText("in torch")).toBeInTheDocument();
    expect(screen.getByText("CWE-502")).toBeInTheDocument();
    expect(screen.getByText("ML06")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
  });

  it("shows singular file label when file_count is 1", () => {
    render(
      <SecurityFindingRow
        finding={{ ...baseFinding, file_count: 1 }}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    expect(screen.getByText("1 file")).toBeInTheDocument();
  });

  it("expands to show description, details and file paths on click", () => {
    render(
      <SecurityFindingRow
        finding={baseFinding}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    expect(screen.queryByText("Found in:")).not.toBeVisible();

    fireEvent.click(screen.getByText("unsafe_pickle_load"));

    expect(screen.getByText("Model file uses unsafe pickle deserialization.")).toBeVisible();
    expect(screen.getByText("Arbitrary code execution")).toBeInTheDocument();
    expect(screen.getByText("torch.load")).toBeInTheDocument();
    expect(screen.getByText("models/model.pt")).toBeInTheDocument();
    expect(screen.getByText("models/other.pt")).toBeInTheDocument();
  });

  it("renders CWE and OWASP reference links with correct hrefs", () => {
    render(
      <SecurityFindingRow
        finding={baseFinding}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    fireEvent.click(screen.getByText("unsafe_pickle_load"));

    const cweLink = screen.getByText(/CWE-502: Deserialization of Untrusted Data/);
    expect(cweLink.closest("a")).toHaveAttribute(
      "href",
      "https://cwe.mitre.org/data/definitions/502.html",
    );

    const owaspLink = screen.getByText(/ML06: AI Supply Chain Attacks/);
    expect(owaspLink.closest("a")).toHaveAttribute(
      "href",
      "https://owasp.org/www-project-machine-learning-security-top-10/",
    );
  });

  it("truncates file paths beyond 20 entries with an overflow message", () => {
    const manyFiles = Array.from({ length: 25 }, (_, i) => ({
      path: `models/file-${i}.pt`,
      line_number: null,
      matched_text: "",
    }));

    render(
      <SecurityFindingRow
        finding={{ ...baseFinding, file_paths: manyFiles }}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    fireEvent.click(screen.getByText("unsafe_pickle_load"));
    expect(screen.getByText("And 5 more files...")).toBeInTheDocument();
  });
});
