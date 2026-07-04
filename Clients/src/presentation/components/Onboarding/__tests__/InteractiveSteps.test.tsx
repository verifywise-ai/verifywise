import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SampleProjectStep from "../steps/SampleProjectStep";
import CompletionStep from "../steps/CompletionStep";
import InviteTeamStep from "../steps/InviteTeamStep";

let mockSendInviteEmail = vi.fn().mockResolvedValue({});

vi.mock("../../../../application/hooks/useFrameworks", () => ({
  default: () => ({
    allFrameworks: [
      { id: 1, name: "EU AI Act" },
      { id: 2, name: "ISO 42001" },
    ],
  }),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ organizationId: 1, userId: 1 }),
}));

vi.mock("../../../../application/hooks/useRoles", () => ({
  useRoles: () => ({ roles: [{ id: 1, name: "admin" }] }),
}));

vi.mock("../../../../application/repository/mail.repository", () => ({
  sendInviteEmail: (...args: any[]) => mockSendInviteEmail(...args),
}));

vi.mock("../../button/customizable-button", () => ({
  CustomizableButton: ({
    text,
    onClick,
    isDisabled,
  }: {
    text: string;
    onClick?: () => void;
    isDisabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={isDisabled} data-testid="customizable-button">
      {text}
    </button>
  ),
}));

vi.mock("../../Inputs/Select", () => ({
  default: ({ value, items, onChange, placeholder }: any) => (
    <select data-testid="select" value={value} onChange={onChange}>
      <option value="">{placeholder}</option>
      {items.map((item: any) => (
        <option key={item._id} value={item._id}>
          {item.name}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("../../Inputs/Field", () => ({
  default: ({ id, value, placeholder, onChange }: any) => (
    <input
      id={id}
      data-testid="field"
      value={value}
      placeholder={placeholder}
      onChange={onChange}
    />
  ),
}));

vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

const defaultStepProps = {
  onNext: vi.fn(),
  onBack: vi.fn(),
  onSkip: vi.fn(),
  isFirstStep: false,
  isLastStep: true,
  currentStep: 5,
  totalSteps: 5,
};

describe("SampleProjectStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the heading", () => {
    renderWithProviders(
      <SampleProjectStep {...defaultStepProps} sampleProject={{}} updateSampleProject={vi.fn()} />,
    );
    expect(screen.getByText("Create your first demo project")).toBeInTheDocument();
  });

  it("renders the demo project banner", () => {
    renderWithProviders(
      <SampleProjectStep {...defaultStepProps} sampleProject={{}} updateSampleProject={vi.fn()} />,
    );
    expect(
      screen.getByText("This is a demo project - you can delete it anytime"),
    ).toBeInTheDocument();
  });

  it("renders use case select", () => {
    renderWithProviders(
      <SampleProjectStep {...defaultStepProps} sampleProject={{}} updateSampleProject={vi.fn()} />,
    );
    expect(screen.getByText(/Demo use case/)).toBeInTheDocument();
  });

  it("renders framework checkboxes", () => {
    renderWithProviders(
      <SampleProjectStep {...defaultStepProps} sampleProject={{}} updateSampleProject={vi.fn()} />,
    );
    expect(screen.getByText("EU AI Act")).toBeInTheDocument();
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
  });

  it("shows validation message when no selections made", () => {
    renderWithProviders(
      <SampleProjectStep {...defaultStepProps} sampleProject={{}} updateSampleProject={vi.fn()} />,
    );
    expect(
      screen.getByText("Please select both a use case and at least one framework to continue."),
    ).toBeInTheDocument();
  });
});

describe("CompletionStep", () => {
  it("renders the congratulations heading", () => {
    renderWithProviders(<CompletionStep {...defaultStepProps} />);
    expect(screen.getByText("Congratulations!")).toBeInTheDocument();
  });

  it("renders the message", () => {
    renderWithProviders(<CompletionStep {...defaultStepProps} />);
    expect(
      screen.getByText(
        "You are ready to work with VerifyWise and manage your AI governance process",
      ),
    ).toBeInTheDocument();
  });

  it("renders Finish button", () => {
    renderWithProviders(<CompletionStep {...defaultStepProps} />);
    expect(screen.getByText("Finish")).toBeInTheDocument();
  });

  it("calls onNext when Finish is clicked", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderWithProviders(<CompletionStep {...defaultStepProps} onNext={onNext} />);
    await user.click(screen.getByText("Finish"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe("InviteTeamStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the heading", () => {
    renderWithProviders(<InviteTeamStep {...defaultStepProps} />);
    expect(screen.getByText("Invite team members")).toBeInTheDocument();
  });

  it("renders the description", () => {
    renderWithProviders(<InviteTeamStep {...defaultStepProps} />);
    expect(screen.getByText(/Invite up to 5 people to your organization/)).toBeInTheDocument();
  });

  it("renders email input fields", () => {
    renderWithProviders(<InviteTeamStep {...defaultStepProps} />);
    const fields = screen.getAllByTestId("field");
    expect(fields.length).toBeGreaterThan(0);
  });

  it("renders invite button", () => {
    renderWithProviders(<InviteTeamStep {...defaultStepProps} />);
    expect(screen.getByText("Invite teammates")).toBeInTheDocument();
  });

  it("renders role selects", () => {
    renderWithProviders(<InviteTeamStep {...defaultStepProps} />);
    const selects = screen.getAllByTestId("select");
    expect(selects.length).toBeGreaterThan(0);
  });

  it("shows sending state when button is clicked", async () => {
    mockSendInviteEmail = vi.fn().mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(<InviteTeamStep {...defaultStepProps} />);
    await user.type(screen.getAllByTestId("field")[0], "test@example.com");
    await user.click(screen.getByText("Invite teammates"));
    expect(screen.getByText("Sending...")).toBeInTheDocument();
  });

  it("renders skip info text", () => {
    renderWithProviders(<InviteTeamStep {...defaultStepProps} />);
    expect(
      screen.getByText(/You can skip this step and invite team members later/),
    ).toBeInTheDocument();
  });
});
