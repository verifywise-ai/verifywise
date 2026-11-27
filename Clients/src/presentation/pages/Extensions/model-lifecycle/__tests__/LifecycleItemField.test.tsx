import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LifecycleItemField from "../LifecycleItemField";
import CustomException from "../../../../../infrastructure/exceptions/customException";
import type { LifecycleItem } from "../useModelLifecycle";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const api = vi.hoisted(() => ({ delete: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("../../../../../infrastructure/api/networkServices", () => ({ apiServices: api }));
// These tests exercise the editing controls, so the user holds model.edit.
vi.mock("../../../../../application/hooks/useCan", () => ({
  useCan: () => true,
  useCanCheck: () => () => true,
  usePermissionsSettled: () => true,
}));
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));

const documentsItem: LifecycleItem = {
  id: 20,
  phase_id: 1,
  name: "Model card",
  item_type: "documents",
  is_required: false,
  display_order: 1,
  config: {},
  is_active: true,
  value: {
    id: 5,
    model_inventory_id: 10,
    item_id: 20,
    files: [{ id: 1, value_id: 5, file_id: 99, filename: "card.pdf" }],
  },
};

async function removeFile(onValueChanged: () => void) {
  render(<LifecycleItemField modelId={10} item={documentsItem} onValueChanged={onValueChanged} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove file" }));
  await waitFor(() =>
    expect(api.delete).toHaveBeenCalledWith(
      "/extensions/model-lifecycle/models/10/lifecycle/items/20/files/99",
    ),
  );
  // Let the rejected request's catch block run.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("LifecycleItemField documents: remove file", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refreshes after a successful detach", async () => {
    api.delete.mockResolvedValueOnce({ status: 200 });
    const onValueChanged = vi.fn();

    await removeFile(onValueChanged);

    expect(onValueChanged).toHaveBeenCalledTimes(1);
  });

  it("refreshes when the link is already gone (404), so the stale row disappears", async () => {
    api.delete.mockRejectedValueOnce(new CustomException("File link not found", 404, {}));
    const onValueChanged = vi.fn();

    await removeFile(onValueChanged);

    expect(onValueChanged).toHaveBeenCalledTimes(1);
  });

  it("keeps the row and shows an error for any other failure so the user can retry", async () => {
    api.delete.mockRejectedValueOnce(new CustomException("Internal server error", 500, {}));
    const onValueChanged = vi.fn();

    await removeFile(onValueChanged);

    expect(onValueChanged).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not remove the file. Try again.",
    );
  });

  it("shows no error after a successful detach", async () => {
    api.delete.mockResolvedValueOnce({ status: 200 });

    await removeFile(vi.fn());

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

async function uploadFiles(onValueChanged: () => void, names: string[]) {
  const { container } = render(
    <LifecycleItemField modelId={10} item={documentsItem} onValueChanged={onValueChanged} />,
  );
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: names.map((n) => new File(["x"], n, { type: "application/pdf" })) },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("LifecycleItemField documents: upload", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows an error and refreshes the files that did attach when a later attach fails", async () => {
    api.post
      .mockResolvedValueOnce({ data: { data: { id: 1 } } }) // upload a
      .mockResolvedValueOnce({ status: 201 }) // attach a
      .mockResolvedValueOnce({ data: { data: { id: 2 } } }) // upload b
      .mockRejectedValueOnce(new CustomException("Internal server error", 500, {})); // attach b
    const onValueChanged = vi.fn();

    await uploadFiles(onValueChanged, ["a.pdf", "b.pdf"]);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not upload the file. Try again.",
    );
    expect(onValueChanged).toHaveBeenCalledTimes(1);
  });

  it("shows an error without refreshing when nothing attached", async () => {
    api.post.mockRejectedValueOnce(new CustomException("Internal server error", 500, {}));
    const onValueChanged = vi.fn();

    await uploadFiles(onValueChanged, ["a.pdf"]);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not upload the file. Try again.",
    );
    expect(onValueChanged).not.toHaveBeenCalled();
  });

  it("clears an earlier remove error when an upload succeeds", async () => {
    api.delete.mockRejectedValueOnce(new CustomException("Internal server error", 500, {}));
    api.post
      .mockResolvedValueOnce({ data: { data: { id: 3 } } })
      .mockResolvedValueOnce({ status: 201 });
    const onValueChanged = vi.fn();
    const { container } = render(
      <LifecycleItemField modelId={10} item={documentsItem} onValueChanged={onValueChanged} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove file" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "c.pdf")] } });

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(onValueChanged).toHaveBeenCalledTimes(1);
  });
});

const textItem: LifecycleItem = {
  id: 21,
  phase_id: 1,
  name: "Purpose",
  item_type: "text",
  is_required: false,
  display_order: 2,
  config: {},
  is_active: true,
  value: null,
};

const classificationItem: LifecycleItem = {
  id: 22,
  phase_id: 1,
  name: "Risk tier",
  item_type: "classification",
  is_required: false,
  display_order: 3,
  config: { levels: ["Low", "High"] },
  is_active: true,
  value: null,
};

describe("LifecycleItemField: failed writes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the typed text and says it was not saved when the text write fails", async () => {
    api.put.mockRejectedValueOnce(new CustomException("Internal server error", 500, {}));
    const onValueChanged = vi.fn();
    renderWithProviders(
      <LifecycleItemField modelId={10} item={textItem} onValueChanged={onValueChanged} />,
    );

    const input = screen.getByPlaceholderText("Enter purpose");
    fireEvent.change(input, { target: { value: "Fraud scoring" } });
    fireEvent.blur(input);

    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved. Try again.");
    expect(input).toHaveValue("Fraud scoring");
    expect(onValueChanged).not.toHaveBeenCalled();
  });

  it("clears the message when the retry saves", async () => {
    api.put
      .mockRejectedValueOnce(new CustomException("Internal server error", 500, {}))
      .mockResolvedValueOnce({ status: 200 });
    const onValueChanged = vi.fn();
    renderWithProviders(
      <LifecycleItemField modelId={10} item={textItem} onValueChanged={onValueChanged} />,
    );

    const input = screen.getByPlaceholderText("Enter purpose");
    fireEvent.change(input, { target: { value: "Fraud scoring" } });
    fireEvent.blur(input);
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.blur(input);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(onValueChanged).toHaveBeenCalledTimes(1);
  });

  it("clears the message when the text is put back to the saved value", async () => {
    api.put.mockRejectedValueOnce(new CustomException("Internal server error", 500, {}));
    renderWithProviders(<LifecycleItemField modelId={10} item={textItem} />);

    const input = screen.getByPlaceholderText("Enter purpose");
    fireEvent.change(input, { target: { value: "Fraud scoring" } });
    fireEvent.blur(input);
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it("shows the saved level again and says it was not saved when the classification write fails", async () => {
    api.put.mockRejectedValueOnce(new CustomException("Internal server error", 500, {}));
    render(<LifecycleItemField modelId={10} item={classificationItem} />);

    fireEvent.click(screen.getByRole("radio", { name: "High" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved. Try again.");
    expect(screen.getByRole("radio", { name: "High" })).not.toBeChecked();
  });

  it("lets the user pick the failed level again to retry", async () => {
    api.put
      .mockRejectedValueOnce(new CustomException("Internal server error", 500, {}))
      .mockResolvedValueOnce({ status: 200 });
    const onValueChanged = vi.fn();
    render(
      <LifecycleItemField modelId={10} item={classificationItem} onValueChanged={onValueChanged} />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "High" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "High" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("radio", { name: "High" })).toBeChecked();
    expect(onValueChanged).toHaveBeenCalledTimes(1);
  });
});
