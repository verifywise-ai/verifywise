import { vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

vi.setConfig({ testTimeout: 10000 });

const mockFormData = {
  info: {
    intro_visible: true,
    compliance_badges_visible: true,
    company_description_visible: true,
    terms_and_contact_visible: true,
    header_color: "#000000",
    id: 1,
    resources_visible: true,
    subprocessor_visible: true,
    title: "Trust Center",
    visible: true,
  },
  intro: {
    purpose_visible: true,
    purpose_text: "Purpose of our trust center",
    our_statement_visible: true,
    our_statement_text: "Our statement content",
    our_mission_visible: true,
    our_mission_text: "Our mission content",
  },
  compliance_badges: {
    ccpa: true,
    eu_ai_act: false,
    gdpr: true,
    hipaa: false,
    iso_27001: true,
    iso_42001: false,
    soc2_type_i: true,
    soc2_type_ii: false,
  },
  company_description: {
    background_visible: true,
    background_text: "Company background",
    core_benefits_visible: true,
    core_benefits_text: "Core benefits text",
    compliance_doc_visible: true,
    compliance_doc_text: "Compliance doc text",
  },
  terms_and_contact: {
    terms_visible: true,
    terms_text: "Terms of service URL https://example.com/terms long enough for validation",
    privacy_visible: true,
    privacy_text: "Privacy policy URL https://example.com/privacy long enough for validation",
    email_visible: true,
    email_text: "contact@company.com",
  },
};

let mockQueryLoading = false;
let mockQueryError: Error | null = null;
let mockQueryData: any = mockFormData;
const mockMutateAsync = vi.fn();

vi.mock("../../../../../application/hooks/useAITrustCentreOverviewQuery", () => ({
  useAITrustCentreOverviewQuery: () => ({
    data: mockQueryData,
    isLoading: mockQueryLoading,
    error: mockQueryError,
  }),
  useAITrustCentreOverviewMutation: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

import AITrustCenterOverview from "../index";

describe("AITrustCenterOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryLoading = false;
    mockQueryError = null;
    mockQueryData = mockFormData;
    mockMutateAsync.mockResolvedValue({});
  });

  it("renders loading spinner while data is loading", () => {
    mockQueryLoading = true;
    mockQueryData = null;
    renderWithProviders(<AITrustCenterOverview />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText("Introduction")).not.toBeInTheDocument();
  });

  it("renders error alert overlay when query returns an error", async () => {
    mockQueryError = new Error("Failed to fetch data");
    renderWithProviders(<AITrustCenterOverview />);
    await waitFor(() => {
      expect(screen.getByText("Failed to fetch data")).toBeInTheDocument();
    });
    expect(screen.getByText("Introduction")).toBeInTheDocument();
  });

  it("renders all sections with form data", async () => {
    renderWithProviders(<AITrustCenterOverview />);
    expect(screen.getByText("Introduction")).toBeInTheDocument();
    expect(screen.getByText("Compliance and certification badges")).toBeInTheDocument();
    expect(screen.getByText("Company description and values")).toBeInTheDocument();
    expect(
      screen.getByText("Privacy policy, terms of service, and contact information"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Purpose of our trust center")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("Our statement content")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Our mission content")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Company background")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Core benefits text")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Compliance doc text")).toBeInTheDocument();
    expect(screen.getByDisplayValue("contact@company.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue(mockFormData.terms_and_contact.terms_text)).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(mockFormData.terms_and_contact.privacy_text),
    ).toBeInTheDocument();
  });

  it("renders compliance badges with correct labels", () => {
    renderWithProviders(<AITrustCenterOverview />);
    expect(screen.getByText("SOC2 Type I")).toBeInTheDocument();
    expect(screen.getByText("SOC2 Type II")).toBeInTheDocument();
    expect(screen.getByText("ISO 27001")).toBeInTheDocument();
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
    expect(screen.getByText("CCPA")).toBeInTheDocument();
    expect(screen.getByText("GDPR")).toBeInTheDocument();
    expect(screen.getByText("HIPAA")).toBeInTheDocument();
    expect(screen.getByText("EU AI Act")).toBeInTheDocument();
  });

  it("disables save button when there are no unsaved changes", () => {
    renderWithProviders(<AITrustCenterOverview />);
    const saveButton = screen.getByText("Save").closest("button");
    expect(saveButton).toBeDisabled();
  });

  it("enables save button after making a change", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<AITrustCenterOverview />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Purpose of our trust center")).toBeInTheDocument();
    });
    const input = screen.getByDisplayValue("Purpose of our trust center");
    await user.clear(input);
    await user.type(input, "Updated purpose text");
    await waitFor(() => {
      const saveButton = screen.getByText("Save").closest("button");
      expect(saveButton).not.toBeDisabled();
    });
  });

  it("shows validation error for empty terms text when terms are visible", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<AITrustCenterOverview />);
    await waitFor(() => {
      expect(
        screen.getByDisplayValue(mockFormData.terms_and_contact.terms_text),
      ).toBeInTheDocument();
    });
    const termsInput = screen.getByDisplayValue(mockFormData.terms_and_contact.terms_text);
    await user.clear(termsInput);
    await user.type(termsInput, "short");
    const saveButton = screen.getByText("Save").closest("button")!;
    await user.click(saveButton);
    await waitFor(() => {
      expect(
        screen.getByText("Terms text must be at least 10 characters long."),
      ).toBeInTheDocument();
    });
  });

  it("shows validation error for invalid email", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<AITrustCenterOverview />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("contact@company.com")).toBeInTheDocument();
    });
    const emailInput = screen.getByDisplayValue("contact@company.com");
    await user.clear(emailInput);
    await user.type(emailInput, "not-an-email");
    const saveButton = screen.getByText("Save").closest("button")!;
    await user.click(saveButton);
    await waitFor(() => {
      expect(screen.getByText("Email must be a valid email address.")).toBeInTheDocument();
    });
  });

  it("calls mutateAsync and shows success alert on save", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<AITrustCenterOverview />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Purpose of our trust center")).toBeInTheDocument();
    });
    const input = screen.getByDisplayValue("Purpose of our trust center");
    await user.clear(input);
    await user.type(input, "Updated purpose text");
    await user.click(screen.getByText("Save").closest("button")!);
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByText("AI Trust Centre data saved successfully!")).toBeInTheDocument();
    });
  });
});
