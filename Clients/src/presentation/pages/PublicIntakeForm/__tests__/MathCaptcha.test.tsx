import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { MathCaptcha } from "../MathCaptcha";
import { getCaptcha } from "../../../../application/repository/intakeForm.repository";

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getCaptcha: vi.fn(),
}));

const mockedGetCaptcha = vi.mocked(getCaptcha);

describe("MathCaptcha", () => {
  beforeEach(() => {
    mockedGetCaptcha.mockReset();
    mockedGetCaptcha.mockResolvedValue({
      data: { question: "3 + 4", token: "token-1" },
    } as Awaited<ReturnType<typeof getCaptcha>>);
  });

  it("names the answer input and refresh control", async () => {
    renderWithProviders(<MathCaptcha value="" onChange={vi.fn()} />);

    expect(await screen.findByText("3 + 4")).toBeInTheDocument();
    expect(screen.getByLabelText("Captcha answer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get new question" })).toBeInTheDocument();
  });
});
