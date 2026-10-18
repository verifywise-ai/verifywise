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
    expect(onSave).toHaveBeenCalledWith(
      [
        {
          questionKey: "role.party",
          value: "employer",
          notes: "We hire our own sales staff with it.",
          dontKnow: false,
        },
      ],
      expect.any(Function),
    );
  });

  it('does not require notes for an "I don\'t know" answer', () => {
    const { onSave } = renderWizard();
    fireEvent.click(within(question("role.party")).getByRole("radio", { name: /I don't know/ }));
    fireEvent.click(screen.getByRole("button", { name: /save answers/i }));
    expect(onSave).toHaveBeenCalledWith(
      [{ questionKey: "role.party", value: null, notes: null, dontKnow: true }],
      expect.any(Function),
    );
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

  it("explains why when the caller may not attest", () => {
    renderWizard({ answers: ALL_VETOES, profileStatus: "draft", canAttest: false });
    expect(screen.getByRole("button", { name: /attest/i })).toBeDisabled();
    expect(
      within(screen.getByTestId("attest-blocked-reason")).getByText(/only an admin/i),
    ).toBeInTheDocument();
  });
});

describe("ProfileWizard: edits that cannot be saved", () => {
  // An edit put back to the saved answer is no change: saving it would file
  // a new version with the same answers and re-attribute the answer.
  // Save trims notes, so whitespace alone would file an identical version.
  it("treats notes that differ only in surrounding whitespace as unchanged", () => {
    renderWizard({ answers: ALL_VETOES, profileStatus: "draft" });
    fireEvent.change(within(question("role.party")).getByRole("textbox"), {
      target: { value: "  Our own words.  " },
    });
    expect(screen.getByRole("button", { name: /save answers/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /attest/i })).toBeEnabled();
  });

  it("treats an answer changed and then changed back as unchanged", () => {
    const { onAttest } = renderWizard({
      answers: [...ALL_VETOES, answer("cutoff.applied_by", "person")],
      profileStatus: "draft",
    });
    const cutoff = question("cutoff.applied_by");
    fireEvent.click(within(cutoff).getByRole("radio", { name: /The platform/ }));
    expect(screen.getByRole("button", { name: /save answers/i })).toBeEnabled();
    fireEvent.click(within(cutoff).getByRole("radio", { name: /A person/ }));
    expect(screen.getByRole("button", { name: /save answers/i })).toBeDisabled();
    const attest = screen.getByRole("button", { name: /attest/i });
    expect(attest).toBeEnabled();
    fireEvent.click(attest);
    expect(onAttest).toHaveBeenCalledTimes(1);
  });

  // Attest records the saved profile and the wizard restarts afterwards, so
  // an edit Save cannot send would be lost without a word.
  it("blocks attest over notes typed on an unanswered question, and names it", () => {
    renderWizard({ answers: ALL_VETOES, profileStatus: "draft" });
    fireEvent.change(within(question("cutoff.applied_by")).getByRole("textbox"), {
      target: { value: "Still checking with the vendor." },
    });
    expect(screen.getByRole("button", { name: /save answers/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /attest/i })).toBeDisabled();
    expect(
      within(screen.getByTestId("attest-blocked-reason")).getByText(/some edits cannot be saved/i),
    ).toBeInTheDocument();
    const list = screen.getByTestId("unsaveable-edits");
    expect(list).toHaveTextContent("Who applies the cutoff");
    expect(list).toHaveTextContent("(notes without an answer)");
  });

  it("lets the edits be discarded, which clears the block", () => {
    const { onAttest } = renderWizard({ answers: ALL_VETOES, profileStatus: "draft" });
    const notes = within(question("cutoff.applied_by")).getByRole("textbox");
    fireEvent.change(notes, { target: { value: "Still checking." } });
    fireEvent.click(screen.getByRole("button", { name: /discard these edits/i }));
    expect(notes).toHaveValue("");
    expect(screen.queryByTestId("unsaveable-edits")).not.toBeInTheDocument();
    const attest = screen.getByRole("button", { name: /attest/i });
    expect(attest).toBeEnabled();
    fireEvent.click(attest);
    expect(onAttest).toHaveBeenCalledTimes(1);
  });

  it("does not count notes typed and then removed again", () => {
    renderWizard({ answers: ALL_VETOES, profileStatus: "draft" });
    const notes = within(question("cutoff.applied_by")).getByRole("textbox");
    fireEvent.change(notes, { target: { value: "x" } });
    fireEvent.change(notes, { target: { value: "" } });
    expect(screen.queryByTestId("unsaveable-edits")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /attest/i })).toBeEnabled();
  });

  it("names an answer to a question a later answer has hidden, and discards only that", () => {
    const { onSave } = renderWizard({
      answers: [...ALL_VETOES, answer("cutoff.applied_by", "person")],
      profileStatus: "draft",
    });
    fireEvent.click(within(question("cutoff.planned")).getByRole("radio", { name: /Planned/ }));
    fireEvent.click(
      within(question("cutoff.applied_by")).getByRole("radio", { name: /The platform/ }),
    );
    expect(queryQuestion("cutoff.planned")).not.toBeInTheDocument();
    const list = screen.getByTestId("unsaveable-edits");
    expect(list).toHaveTextContent("Planned automation");
    expect(list).toHaveTextContent("(no longer applies)");
    // A save that files a new version restarts the wizard, so Save waits
    // until the edit is answered or discarded rather than drop it.
    expect(screen.getByRole("button", { name: /save answers/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /discard these edits/i }));
    expect(screen.queryByTestId("unsaveable-edits")).not.toBeInTheDocument();
    // The visible change is untouched and still saves.
    fireEvent.click(screen.getByRole("button", { name: /save answers/i }));
    expect(onSave).toHaveBeenCalledWith(
      [
        {
          questionKey: "cutoff.applied_by",
          value: "platform",
          notes: "Our own words.",
          dontKnow: false,
        },
      ],
      expect.any(Function),
    );
  });
});

describe("ProfileWizard: deciding questions match the server's attest rule", () => {
  // The server's attest check counts every deciding question, with no
  // applicability (VETO_KEYS in profileService.attestProfile). The wizard
  // must hold attest on exactly the same set.
  const CONDITIONAL_VETO: AedtQuestion = {
    key: "agency.notice",
    scope: "profile",
    weight: "veto",
    prompt: "Do you give candidates the notice?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: { equals: { key: "role.party", value: "employer" } },
    options: [{ value: "yes", label: "Yes", consequence: "Recorded." }],
  };

  it("holds attest on an unanswered deciding question even where its condition does not hold", () => {
    renderWizard({
      questions: [...QUESTIONS, CONDITIONAL_VETO],
      answers: ALL_VETOES.map((a) =>
        a.questionKey === "role.party" ? answer("role.party", "vendor") : a,
      ),
      profileStatus: "draft",
    });
    expect(screen.getByRole("button", { name: /attest/i })).toBeDisabled();
    expect(
      within(screen.getByTestId("attest-blocked-reason")).getByText("agency.notice"),
    ).toBeInTheDocument();
  });
});

describe("ProfileWizard: new saved answers without a remount", () => {
  // A refetch passes new answers in place; untouched questions follow them,
  // and an edit in progress stays.
  it("takes new saved answers for untouched questions and keeps edits in progress", () => {
    const props = {
      questions: QUESTIONS,
      profileStatus: "draft",
      canEdit: true,
      canAttest: true,
      onSave: vi.fn(),
      onAttest: vi.fn(),
    };
    const { rerender } = renderWithProviders(<ProfileWizard {...props} answers={ALL_VETOES} />);
    fireEvent.click(within(question("cutoff.applied_by")).getByRole("radio", { name: /A person/ }));
    rerender(
      <ProfileWizard
        {...props}
        answers={ALL_VETOES.map((a) =>
          a.questionKey === "role.party" ? answer("role.party", "vendor") : a,
        )}
      />,
    );
    expect(
      within(question("role.party")).getByRole("radio", { name: /We supply it to employers/ }),
    ).toBeChecked();
    expect(
      within(question("cutoff.applied_by")).getByRole("radio", { name: /A person/ }),
    ).toBeChecked();
    expect(screen.getByRole("button", { name: /save answers/i })).toBeEnabled();
  });
});

describe("ProfileWizard: Save blocked by an edit it cannot send", () => {
  it("says why under the Save button", () => {
    renderWizard({ answers: ALL_VETOES, profileStatus: "draft" });
    fireEvent.change(within(question("cutoff.applied_by")).getByRole("textbox"), {
      target: { value: "Still checking." },
    });
    expect(screen.getByTestId("save-blocked-unsaveable")).toHaveTextContent(
      "Answer or discard the edits below before saving.",
    );
  });
});

describe("ProfileWizard: while a save or attest is pending", () => {
  it.each([
    ["save", { isSaving: true }],
    ["attest", { isAttesting: true }],
  ])("locks every input, Save and Attest during a pending %s", (_n, flags) => {
    renderWizard({ answers: ALL_VETOES, profileStatus: "draft", ...flags });
    for (const radio of within(question("role.party")).getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
    expect(within(question("role.party")).getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: /save answers/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /attest/i })).toBeDisabled();
  });
});
