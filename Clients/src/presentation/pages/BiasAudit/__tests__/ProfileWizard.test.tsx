import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ProfileWizard from "../ProfileWizard";
import type {
  AedtProfileAnswer,
  AedtQuestion,
} from "../../../../infrastructure/api/aedtBiasAuditService";

const IN_SCOPE = { not: { equals: { key: "scope.weighting", value: "one_of_several" } } };

const QUESTIONS: AedtQuestion[] = [
  {
    key: "role.party",
    scope: "profile",
    weight: "veto",
    statutoryRef: "5-303",
    prompt: "Do you use this tool to hire your own staff?",
    notesRequired: true,
    notesPrompt: "In your own words, describe who uses the tool.",
    allowDontKnow: true,
    options: [
      {
        value: "employer",
        label: "We use it to hire our own staff",
        consequence: "The duty to publish a summary of results falls on you.",
      },
      {
        value: "vendor",
        label: "We supply it to employers",
        consequence: "The publication duty falls on each employer deploying the tool.",
      },
    ],
  },
  {
    key: "scope.weighting",
    scope: "profile",
    weight: "veto",
    prompt: "How much does the result matter?",
    notesRequired: true,
    allowDontKnow: true,
    options: [
      { value: "only", label: "It is the only thing looked at", consequence: "First limb." },
      {
        value: "one_of_several",
        label: "It is one of several, with no extra weight",
        consequence: "You receive a scope determination rather than a set of figures.",
      },
    ],
  },
  {
    key: "independence.auditor",
    scope: "profile",
    weight: "veto",
    prompt: "Who is performing this test?",
    notesRequired: true,
    allowDontKnow: false,
    options: [
      { value: "self", label: "We are, on our own tool", consequence: "Not a bias audit." },
      { value: "third_party", label: "An independent auditor", consequence: "Independent." },
    ],
  },
  {
    key: "data.held",
    scope: "profile",
    weight: "veto",
    prompt: "What demographic data do you hold?",
    notesRequired: true,
    allowDontKnow: true,
    options: [
      { value: "none", label: "None", consequence: "Test data basis." },
      { value: "all_sufficient", label: "All of it, in volume", consequence: "Historical." },
    ],
  },
  {
    key: "cutoff.applied_by",
    scope: "profile",
    weight: "high",
    prompt: "Who applies the cutoff?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: IN_SCOPE,
    options: [
      { value: "platform", label: "The platform", consequence: "Selection rates apply." },
      { value: "person", label: "A person", consequence: "Scoring rates apply." },
    ],
  },
  {
    key: "cutoff.planned",
    scope: "profile",
    weight: "standard",
    prompt: "Is automation of the cutoff planned?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: {
      all: [IN_SCOPE, { equals: { key: "cutoff.applied_by", value: "person" } }],
    },
    options: [
      { value: "no", label: "No", consequence: "The result describes the tool as it runs today." },
      { value: "planned", label: "Planned", consequence: "The result carries a dated statement." },
    ],
  },
  {
    key: "pipeline.input_form",
    scope: "profile",
    weight: "high",
    prompt: "What does the tool score?",
    notesRequired: false,
    allowDontKnow: false,
    appliesWhen: IN_SCOPE,
    options: [
      { value: "resume", label: "Resumes", consequence: "Resume corpus." },
      { value: "audio", label: "Audio", consequence: "Generation is not available." },
    ],
  },
];

const answer = (
  questionKey: string,
  value: string | null,
  extra: Partial<AedtProfileAnswer> = {},
): AedtProfileAnswer => ({
  questionKey,
  value,
  notes: value === null ? null : "Our own words.",
  dontKnow: false,
  notApplicable: false,
  answeredByUserId: 1,
  answeredAt: "2026-10-01T10:00:00.000Z",
  ...extra,
});

const ALL_VETOES: AedtProfileAnswer[] = [
  answer("role.party", "employer"),
  answer("scope.weighting", "only"),
  answer("independence.auditor", "self"),
  answer("data.held", "none"),
];

function renderWizard(props: Partial<Parameters<typeof ProfileWizard>[0]> = {}) {
  const onSave = vi.fn();
  const onAttest = vi.fn();
  renderWithProviders(
    <ProfileWizard
      questions={QUESTIONS}
      answers={[]}
      profileStatus={null}
      canEdit
      canAttest
      onSave={onSave}
      onAttest={onAttest}
      {...props}
    />,
  );
  return { onSave, onAttest };
}

const question = (key: string) => screen.getByTestId(`question-${key}`);
const queryQuestion = (key: string) => screen.queryByTestId(`question-${key}`);

describe("ProfileWizard: consequences", () => {
  it("shows each option's consequence beside it before anything is selected", () => {
    renderWizard();
    const party = question("role.party");
    for (const radio of within(party).getAllByRole("radio")) {
      expect(radio).not.toBeChecked();
    }
    expect(
      within(party).getByText("The duty to publish a summary of results falls on you."),
    ).toBeVisible();
    expect(
      within(party).getByText("The publication duty falls on each employer deploying the tool."),
    ).toBeVisible();
  });
});

describe("ProfileWizard: notes on veto questions", () => {
  it("withholds saving while a veto answer has no notes, and names the question", () => {
    const { onSave } = renderWizard();
    fireEvent.click(
      within(question("role.party")).getByRole("radio", {
        name: /We use it to hire our own staff/,
      }),
    );

    const save = screen.getByRole("button", { name: /save answers/i });
    expect(save).toBeDisabled();
    const reason = screen.getByTestId("save-blocked-reason");
    expect(within(reason).getByText(/notes are required/i)).toBeInTheDocument();
    expect(within(reason).getByText("Your role")).toBeInTheDocument();

    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves once the notes are written, sending the customer's own words", () => {
    const { onSave } = renderWizard();
    const party = question("role.party");
    fireEvent.click(within(party).getByRole("radio", { name: /We use it to hire our own staff/ }));
    fireEvent.change(within(party).getByRole("textbox"), {
      target: { value: "We hire our own sales staff with it." },
    });

    const save = screen.getByRole("button", { name: /save answers/i });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith([
      {
        questionKey: "role.party",
        value: "employer",
        notes: "We hire our own sales staff with it.",
        dontKnow: false,
      },
    ]);
  });

  it('does not require notes for an "I don\'t know" answer', () => {
    const { onSave } = renderWizard();
    fireEvent.click(within(question("role.party")).getByRole("radio", { name: /I don't know/ }));
    fireEvent.click(screen.getByRole("button", { name: /save answers/i }));
    expect(onSave).toHaveBeenCalledWith([
      { questionKey: "role.party", value: null, notes: null, dontKnow: true },
    ]);
  });
});

describe('ProfileWizard: "I don\'t know"', () => {
  it("is offered only where the question allows it", () => {
    renderWizard();
    expect(
      within(question("role.party")).getByRole("radio", { name: /I don't know/ }),
    ).toBeInTheDocument();
    expect(
      within(question("independence.auditor")).queryByRole("radio", { name: /I don't know/ }),
    ).not.toBeInTheDocument();
    expect(
      within(question("pipeline.input_form")).queryByRole("radio", { name: /I don't know/ }),
    ).not.toBeInTheDocument();
  });
});

describe("ProfileWizard: conditional questions", () => {
  it("shows a follow-up only while the answer it depends on holds", () => {
    renderWizard();
    expect(queryQuestion("cutoff.planned")).not.toBeInTheDocument();

    const cutoff = question("cutoff.applied_by");
    fireEvent.click(within(cutoff).getByRole("radio", { name: /A person/ }));
    expect(question("cutoff.planned")).toBeInTheDocument();

    fireEvent.click(within(cutoff).getByRole("radio", { name: /The platform/ }));
    expect(queryQuestion("cutoff.planned")).not.toBeInTheDocument();
  });

  it("hides every in-scope question once the tool is answered as one of several", () => {
    renderWizard();
    expect(question("cutoff.applied_by")).toBeInTheDocument();
    fireEvent.click(
      within(question("scope.weighting")).getByRole("radio", { name: /one of several/ }),
    );
    expect(queryQuestion("cutoff.applied_by")).not.toBeInTheDocument();
    expect(queryQuestion("pipeline.input_form")).not.toBeInTheDocument();
    // The vetoes themselves stay.
    expect(question("independence.auditor")).toBeInTheDocument();
  });
});

describe("ProfileWizard: attest", () => {
  it("is disabled while a veto is unanswered, and names which", () => {
    renderWizard({
      answers: [answer("role.party", "employer"), answer("scope.weighting", "only")],
      profileStatus: "draft",
    });
    expect(screen.getByRole("button", { name: /attest/i })).toBeDisabled();
    const reason = screen.getByTestId("attest-blocked-reason");
    expect(within(reason).getByText("Who is performing this test")).toBeInTheDocument();
    expect(within(reason).getByText("Demographic data you hold")).toBeInTheDocument();
    expect(within(reason).queryByText("Your role")).not.toBeInTheDocument();
  });

  it('names a veto answered "I don\'t know" as still open', () => {
    renderWizard({
      answers: [
        answer("role.party", null, { dontKnow: true }),
        answer("scope.weighting", "only"),
        answer("independence.auditor", "self"),
        answer("data.held", "none"),
      ],
      profileStatus: "draft",
    });
    expect(screen.getByRole("button", { name: /attest/i })).toBeDisabled();
    const reason = screen.getByTestId("attest-blocked-reason");
    expect(within(reason).getByText("Your role")).toBeInTheDocument();
  });

  it("is enabled once every veto has an answer, and attests on click", () => {
    const { onAttest } = renderWizard({ answers: ALL_VETOES, profileStatus: "draft" });
    const attest = screen.getByRole("button", { name: /attest/i });
    expect(attest).toBeEnabled();
    expect(screen.queryByTestId("attest-blocked-reason")).not.toBeInTheDocument();
    fireEvent.click(attest);
    expect(onAttest).toHaveBeenCalledTimes(1);
  });

  it("is disabled while answers are unsaved, since attest records the saved profile", () => {
    renderWizard({ answers: ALL_VETOES, profileStatus: "draft" });
    fireEvent.click(within(question("cutoff.applied_by")).getByRole("radio", { name: /A person/ }));
    expect(screen.getByRole("button", { name: /attest/i })).toBeDisabled();
    expect(
      within(screen.getByTestId("attest-blocked-reason")).getByText(/save your answers/i),
    ).toBeInTheDocument();
  });

  // Notes on a question with no answer cannot be saved, so they must not
  // leave Save and Attest both disabled.
  it("is not held back by notes typed on an unanswered question", () => {
    const { onAttest } = renderWizard({ answers: ALL_VETOES, profileStatus: "draft" });
    fireEvent.change(within(question("cutoff.applied_by")).getByRole("textbox"), {
      target: { value: "Still checking with the vendor." },
    });
    expect(screen.getByRole("button", { name: /save answers/i })).toBeDisabled();
    const attest = screen.getByRole("button", { name: /attest/i });
    expect(attest).toBeEnabled();
    fireEvent.click(attest);
    expect(onAttest).toHaveBeenCalledTimes(1);
  });

  it("explains why when the caller may not attest", () => {
    renderWizard({ answers: ALL_VETOES, profileStatus: "draft", canAttest: false });
    expect(screen.getByRole("button", { name: /attest/i })).toBeDisabled();
    expect(
      within(screen.getByTestId("attest-blocked-reason")).getByText(/only an admin/i),
    ).toBeInTheDocument();
  });
});
