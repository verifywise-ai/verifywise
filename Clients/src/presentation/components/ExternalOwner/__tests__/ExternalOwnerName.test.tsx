import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ExternalOwnerName from "../ExternalOwnerName";

describe("ExternalOwnerName", () => {
  it("shows the name marked as external, with a mail icon", () => {
    const { container } = render(<ExternalOwnerName name="Ada Lovelace" />);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("(external)")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("can drop the icon for inline sentences", () => {
    const { container } = render(<ExternalOwnerName name="Ada Lovelace" showIcon={false} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("(external)")).toBeInTheDocument();
  });
});
