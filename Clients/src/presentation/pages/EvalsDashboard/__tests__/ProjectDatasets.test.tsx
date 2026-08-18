// NOTE: deepEval.mocks MUST be the first import — it exports vi.hoisted
// handles, so Vitest requires it to be imported before any other module (its
// vi.mock registrations also need to run before the component module graph
// loads).
import {
  deepEvalMocks,
  installBrowserStubs,
  resetDeepEvalMocks,
  samplePrompts,
} from "./deepEval.mocks";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { ProjectDatasets } from "../ProjectDatasets";

// Mutable auth state so tests can flip roles/super-admin per case.
const authMock = vi.hoisted(() => ({
  userRoleName: "Admin",
  isSuperAdmin: false,
}));

// ProjectDatasets reads `useAuth` for RBAC (userRoleName, isSuperAdmin).
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: authMock.userRoleName,
    isSuperAdmin: authMock.isSuperAdmin,
    userId: 1,
    userToken: { name: "Test User" },
    organizationId: "org-1",
  }),
}));

// HelperIcon consumes UserGuideSidebarContext, which renderWithProviders does
// not provide.
vi.mock("../../../components/HelperIcon", () => ({
  default: () => <div data-testid="helper-icon" />,
}));

const USER_DATASET = {
  id: "d1",
  name: "My Chatbot Dataset",
  path: "uploads/chatbot.json",
  datasetType: "chatbot",
  turnType: "single-turn",
  promptCount: 3,
  createdAt: "2025-06-01T00:00:00.000Z",
};

const MULTI_TURN_PROMPT = {
  id: "c1",
  scenario: "Customer asks about plan",
  expected_outcome: "Explain the premium plan",
  turns: [
    { role: "user", content: "Hi, what features are included?" },
    { role: "assistant", content: "The premium plan includes unlimited storage." },
  ],
};

const SINGLE_TURN_TEMPLATE = {
  key: "basic-chatbot",
  name: "Basic Chatbot",
  path: "chatbot/chatbot_basic.json",
  type: "single-turn",
  test_count: 2,
  difficulty: { easy: 2, medium: 0, hard: 0 },
  description: "Simple chatbot evals",
};

function renderDatasets() {
  return renderWithProviders(<ProjectDatasets projectId="proj-1" orgId="org-1" />);
}

function mockUserDatasets(datasets: unknown[] = [USER_DATASET]) {
  deepEvalMocks.listMyDatasets.mockResolvedValue({ datasets });
}

/** Open the kebab row menu for the given dataset row (defaults to first). */
function openRowMenu(container: HTMLElement, index = 0) {
  const icon = container.querySelectorAll("svg.lucide-ellipsis-vertical")[index];
  fireEvent.click(icon.closest("button") as HTMLButtonElement);
}

describe("ProjectDatasets", () => {
  beforeEach(() => {
    installBrowserStubs();
    resetDeepEvalMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    authMock.userRoleName = "Admin";
    authMock.isSuperAdmin = false;
    localStorage.clear();
  });

  describe("mount & empty state", () => {
    it("loads both dataset lists on mount and renders the empty state", async () => {
      deepEvalMocks.listMyDatasets.mockResolvedValue({ datasets: [] });
      deepEvalMocks.listDatasets.mockResolvedValue({ chatbot: [], rag: [], agent: [] });

      renderDatasets();

      expect(screen.getByText("Datasets")).toBeInTheDocument();
      expect(screen.getByText("My datasets")).toBeInTheDocument();
      expect(screen.getByText("Templates")).toBeInTheDocument();

      await waitFor(() => expect(deepEvalMocks.listMyDatasets).toHaveBeenCalled());
      await waitFor(() => expect(deepEvalMocks.listDatasets).toHaveBeenCalled());

      expect(screen.getByRole("button", { name: "Upload dataset" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add dataset" })).toBeInTheDocument();
      expect(await screen.findByText(/No datasets found/)).toBeInTheDocument();
    });
  });

  describe("user datasets table", () => {
    it("renders user datasets with type/use-case chips and filters by search", async () => {
      mockUserDatasets([
        { ...USER_DATASET, id: "d1", name: "Alpha Dataset", path: "uploads/a.json" },
        { ...USER_DATASET, id: "d2", name: "Beta Dataset", path: "uploads/b.json" },
      ]);

      renderDatasets();

      expect(await screen.findByText("Alpha Dataset")).toBeInTheDocument();
      expect(screen.getByText("Beta Dataset")).toBeInTheDocument();
      expect(screen.getAllByText("Single-Turn")).toHaveLength(2);
      expect(screen.getAllByText("Chatbot")).toHaveLength(2);
      expect(screen.getAllByText("3")).toHaveLength(2);

      fireEvent.change(screen.getByLabelText("Search datasets"), {
        target: { value: "alpha" },
      });

      expect(screen.getByText("Alpha Dataset")).toBeInTheDocument();
      expect(screen.queryByText("Beta Dataset")).not.toBeInTheDocument();
    });
  });

  describe("upload flow", () => {
    it("uploads a simulated multi-turn file with the selected options", async () => {
      deepEvalMocks.uploadDataset.mockResolvedValue({
        path: "uploads/sim.json",
        filename: "sim.json",
      });
      mockUserDatasets([]);

      renderDatasets();

      fireEvent.click(screen.getByRole("button", { name: "Upload dataset" }));
      expect(await screen.findByText("Conversation type")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Multi-Turn"));
      fireEvent.click(screen.getByText("Simulated"));
      fireEvent.click(screen.getByRole("button", { name: "Download example" }));
      fireEvent.click(screen.getByRole("button", { name: "Upload file" }));

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File([JSON.stringify([{ scenario: "hi", turns: [] }])], "my-dataset.json", {
        type: "application/json",
      });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => expect(deepEvalMocks.uploadDataset).toHaveBeenCalled());
      expect(deepEvalMocks.uploadDataset).toHaveBeenCalledWith(
        expect.any(File),
        "chatbot",
        "simulated",
        "org-1",
      );
      expect(await screen.findByText("Uploaded sim.json")).toBeInTheDocument();
    });

    it("shows the error message when an upload fails", async () => {
      deepEvalMocks.uploadDataset.mockRejectedValue(new Error("Upload failed: invalid"));
      mockUserDatasets([]);

      renderDatasets();

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File([JSON.stringify([{ prompt: "hi" }])], "bad.json", {
        type: "application/json",
      });
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(await screen.findByText("Upload failed: invalid")).toBeInTheDocument();
    });
  });

  describe("dataset actions", () => {
    it("opens the prompts drawer and lists the dataset prompts", async () => {
      mockUserDatasets();
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: samplePrompts });

      const { container } = renderDatasets();
      await screen.findByText(USER_DATASET.name);

      openRowMenu(container);
      fireEvent.click(screen.getByText("View prompts"));

      expect(await screen.findByText("Hello there")).toBeInTheDocument();
      expect(screen.getByText("2 prompts")).toBeInTheDocument();
      expect(deepEvalMocks.readDataset).toHaveBeenCalledWith(USER_DATASET.path);
    });

    it("shows an empty prompts message when the dataset has no prompts", async () => {
      mockUserDatasets();
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: [] });

      const { container } = renderDatasets();
      await screen.findByText(USER_DATASET.name);

      openRowMenu(container);
      fireEvent.click(screen.getByText("View prompts"));

      expect(await screen.findByText("No prompts found in this dataset.")).toBeInTheDocument();
    });

    it("deletes a dataset through the confirmation modal", async () => {
      mockUserDatasets();

      const { container } = renderDatasets();
      await screen.findByText(USER_DATASET.name);

      openRowMenu(container);
      fireEvent.click(screen.getByText("Delete"));

      expect(screen.getByText("Delete this dataset?")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() =>
        expect(deepEvalMocks.deleteDatasets).toHaveBeenCalledWith([USER_DATASET.path]),
      );
      expect(await screen.findByText("Dataset removed")).toBeInTheDocument();
    });
  });

  describe("editor", () => {
    it("opens a single-turn dataset, edits a prompt and saves a renamed copy", async () => {
      mockUserDatasets();
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: samplePrompts });

      renderDatasets();
      fireEvent.click(await screen.findByText(USER_DATASET.name));

      expect(await screen.findByText("Edit dataset")).toBeInTheDocument();
      expect(screen.getByText("Hello there")).toBeInTheDocument();

      // Edit the first prompt's expected output.
      fireEvent.click(screen.getByText("Hello there"));
      expect(screen.getByText("Edit prompt")).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Expected output"), {
        target: { value: "Updated output" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Done" }));

      fireEvent.change(screen.getByLabelText(/Dataset name/), {
        target: { value: "My Renamed Dataset" },
      });

      fireEvent.click(await screen.findByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(deepEvalMocks.deleteDatasets).toHaveBeenCalledWith([USER_DATASET.path]),
      );
      expect(deepEvalMocks.uploadDataset).toHaveBeenCalledWith(
        expect.any(File),
        "chatbot",
        "single-turn",
        "org-1",
      );
      expect(
        await screen.findByText('Dataset "My Renamed Dataset" saved successfully!'),
      ).toBeInTheDocument();
    });

    it("edits and saves a multi-turn dataset as multi-turn", async () => {
      mockUserDatasets([
        {
          ...USER_DATASET,
          name: "My Multi Dataset",
          path: "uploads/multi.json",
          turnType: "multi-turn",
        },
      ]);
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: [MULTI_TURN_PROMPT] });

      renderDatasets();
      fireEvent.click(await screen.findByText("My Multi Dataset"));

      expect(await screen.findByText("SCENARIO / TURNS")).toBeInTheDocument();
      expect(screen.getByText("2 turns")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Customer asks about plan"));
      expect(screen.getByText("Edit prompt")).toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText("Describe the conversation scenario"), {
        target: { value: "Updated scenario" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add user turn" }));
      fireEvent.click(screen.getByRole("button", { name: "Done" }));

      fireEvent.click(await screen.findByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(deepEvalMocks.deleteDatasets).toHaveBeenCalledWith(["uploads/multi.json"]),
      );
      expect(deepEvalMocks.uploadDataset).toHaveBeenCalledWith(
        expect.any(File),
        "chatbot",
        "multi-turn",
        "org-1",
      );
    });

    it("copies the dataset JSON to the clipboard and downloads it", async () => {
      mockUserDatasets();
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: samplePrompts });

      renderDatasets();
      fireEvent.click(await screen.findByText(USER_DATASET.name));
      await screen.findByText("Edit dataset");

      fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
      expect(await screen.findByText("Copied!")).toBeInTheDocument();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        JSON.stringify(samplePrompts, null, 2),
      );

      fireEvent.click(screen.getByRole("button", { name: "Download" }));
      expect(URL.createObjectURL as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    });

    it("lets you add and delete prompts from an empty dataset", async () => {
      mockUserDatasets();
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: [] });

      const { container } = renderDatasets();
      await screen.findByText(USER_DATASET.name);

      openRowMenu(container);
      fireEvent.click(screen.getByText("Open in editor"));

      expect(await screen.findByText("No prompts in this dataset yet.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Add your first prompt" }));

      expect(screen.getByText("Edit prompt")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      expect(await screen.findByText("No prompts in this dataset yet.")).toBeInTheDocument();
      expect(await screen.findByRole("button", { name: "Save" })).toBeDisabled();
    });
  });

  describe("templates", () => {
    it("previews a single-turn template and copies it to my datasets", async () => {
      deepEvalMocks.listDatasets.mockResolvedValue({
        chatbot: [SINGLE_TURN_TEMPLATE],
        rag: [],
        agent: [],
      });
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: samplePrompts });
      deepEvalMocks.uploadDataset.mockResolvedValue({
        path: "uploads/copied.json",
        filename: "copied.json",
      });

      renderDatasets();

      fireEvent.click(screen.getByText("Templates"));
      fireEvent.click(await screen.findByText("Basic Chatbot"));

      expect(await screen.findByText("Hello there")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Copy to my datasets" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Copy to my datasets" }));
      expect(screen.getByText("Copy to my datasets?")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Copy" }));

      await waitFor(() => expect(deepEvalMocks.uploadDataset).toHaveBeenCalled());
      expect(deepEvalMocks.uploadDataset).toHaveBeenCalledWith(
        expect.any(File),
        "chatbot",
        "single-turn",
        "org-1",
      );
      expect(
        await screen.findByText('"Basic Chatbot" copied to your datasets'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/No datasets found\. Upload a dataset or copy from templates\./),
      ).toBeInTheDocument();
    });

    it("expands a multi-turn template conversation", async () => {
      deepEvalMocks.listDatasets.mockResolvedValue({
        chatbot: [{ ...SINGLE_TURN_TEMPLATE, key: "multi", name: "Multi Bot", type: "multi-turn" }],
        rag: [],
        agent: [],
      });
      deepEvalMocks.readDataset.mockResolvedValue({ prompts: [MULTI_TURN_PROMPT] });

      renderDatasets();

      fireEvent.click(screen.getByText("Templates"));
      fireEvent.click(await screen.findByText("Multi Bot"));

      expect(await screen.findByText("Customer asks about plan")).toBeInTheDocument();
      expect(screen.getByText("2 TURNS")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Customer asks about plan"));
      expect(screen.getByText("Hi, what features are included?")).toBeInTheDocument();
      expect(screen.getByText("The premium plan includes unlimited storage.")).toBeInTheDocument();
    });
  });

  describe("create from scratch", () => {
    it("seeds an empty multi-turn prompt and opens the editor", async () => {
      mockUserDatasets([]);

      renderDatasets();

      fireEvent.click(screen.getByRole("button", { name: "Add dataset" }));
      fireEvent.click(await screen.findByText("Create from scratch"));

      expect(await screen.findByText("Choose dataset format")).toBeInTheDocument();
      fireEvent.click(screen.getByText("RAG"));
      fireEvent.click(screen.getByText("Multi-turn"));
      fireEvent.click(screen.getByRole("button", { name: "Create Dataset" }));

      expect(await screen.findByText("Edit dataset")).toBeInTheDocument();
      expect(screen.getByText("Empty conversation")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });
  });

  describe("RBAC", () => {
    it("keeps upload and add enabled for super admins", async () => {
      authMock.isSuperAdmin = true;
      mockUserDatasets([]);

      renderDatasets();

      expect(await screen.findByRole("button", { name: "Upload dataset" })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: "Add dataset" })).not.toBeDisabled();
    });
  });
});
