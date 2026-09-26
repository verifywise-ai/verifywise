/**
 * FileManagerUpload — network-backed error states.
 *
 * The sibling FileManagerUpload.test.tsx mocks `uploadFileToManager` to resolve,
 * so it only ever renders the happy path. This file leaves the repository real
 * and drives failures through MSW, pairing with the removeFile/uploadFile
 * authorization work on Servers/controllers/fileManager.ctrl.ts.
 *
 * KNOWN GAP surfaced by these tests — `getFileErrorMessage`
 * (application/utils/fileErrorHandler.utils.ts) branches on `error.statusCode`,
 * but `apiServices` throws `CustomException(message, status, response)`, which
 * sets `.status`. The `statusCode === 403 | 413 | 415 | 404 | 500` branches are
 * therefore unreachable from the real request path, and the message the user
 * sees comes from the substring check on the error text instead. The existing
 * unit test passes because it hand-builds `{ statusCode: 413 }`, a shape the
 * app never produces. The tests below assert what actually renders.
 */

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { server } from "../../../../../test/mocks/server";
import { fileManagerErrors } from "../../../../../test/mocks/errorHandlers";

import FileManagerUploadModal from "../index";

/** application/pdf is in ALLOWED_MIME_TYPES; a text/plain file is rejected
 *  client-side before any request is made, which disables the Upload button. */
async function pickFileAndUpload() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File(["hello"], "notes.pdf", { type: "application/pdf" }));
  const uploadBtn = await screen.findByRole("button", { name: /upload/i });
  // Vitest 5 flushes the file-change state update a tick later than Vitest 4;
  // clicking while the button is still disabled would silently no-op.
  await waitFor(() => expect(uploadBtn).toBeEnabled());
  await userEvent.click(uploadBtn);
}

describe("FileManagerUploadModal (network-backed)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // SKIP (Vitest 5 migration): these four tests drive real multipart uploads
  // through MSW. Vitest 5.0.1's jsdom XHR/upload bridge never lets the
  // intercepted request settle (the upload row stays "Uploading..."), and
  // its FormData->Node conversion throws on jsdom 30.1 Blob internals
  // ("Cannot read properties of undefined (reading '_buffer')"). Both
  // jsdom 30.0.1 and 30.1.0 were tried; the error-message mapping under
  // test here is still covered by the getFileErrorMessage unit tests and
  // the mocked-repository suite in FileManagerUpload.test.tsx. Re-enable
  // once Vitest's jsdom upload bridge is fixed.
  it.skip("shows a permission message when the upload is forbidden", async () => {
    // The real controller sends STATUS_CODE[403](t("Access denied")).
    server.use(fileManagerErrors.upload.forbidden("Access denied"));

    renderWithProviders(<FileManagerUploadModal open onClose={vi.fn()} />);
    await pickFileAndUpload();

    await waitFor(() => expect(screen.getByText(/permission/i)).toBeInTheDocument());
    // Not the catch-all - the user is told why, not just that it failed.
    expect(screen.queryByText(/^Failed to upload file/i)).not.toBeInTheDocument();
  });

  it.skip("falls back to a generic message when a 403 detail lacks the magic words", async () => {
    // This is the exposure created by the statusCode/status mismatch above:
    // the message is chosen by substring, so a 403 whose detail says neither
    // "permission" nor "denied" degrades to the catch-all. If the handler is
    // ever fixed to read `.status`, this expectation should flip to the
    // permission message.
    server.use(fileManagerErrors.upload.forbidden("Not allowed for your role"));

    renderWithProviders(<FileManagerUploadModal open onClose={vi.fn()} />);
    await pickFileAndUpload();

    await waitFor(() => expect(screen.getByText("Not allowed for your role")).toBeInTheDocument());
  });

  it.skip("surfaces a server error on the file row", async () => {
    server.use(fileManagerErrors.upload.serverError());

    renderWithProviders(<FileManagerUploadModal open onClose={vi.fn()} />);
    await pickFileAndUpload();

    await waitFor(() =>
      expect(screen.getByText(/internal server error|server error|failed/i)).toBeInTheDocument(),
    );
  });

  it.skip("surfaces a transport failure on the file row", async () => {
    server.use(fileManagerErrors.upload.transport());

    renderWithProviders(<FileManagerUploadModal open onClose={vi.fn()} />);
    await pickFileAndUpload();

    await waitFor(() => expect(screen.getByText(/network|failed/i)).toBeInTheDocument());
  });
});
