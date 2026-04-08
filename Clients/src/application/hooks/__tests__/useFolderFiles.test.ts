import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useFolderFiles } from "../useFolderFiles";

// ✅ IMPORTANT:
// This test file lives in src/application/hooks/tests
// The hook imports repositories using paths relative to src/application/hooks,
// so here we mock them using paths relative to THIS test file (../../repository/... and ../../utils/...).

const getFilesInFolderMock = vi.fn();
const getUncategorizedFilesMock = vi.fn();
const assignFilesToFolderMock = vi.fn();
const removeFileFromFolderMock = vi.fn();
const getFileFoldersMock = vi.fn();
const updateFileFoldersMock = vi.fn();

vi.mock("../../repository/virtualFolder.repository", () => ({
  getFilesInFolder: (...args: any[]) => getFilesInFolderMock(...args),
  getUncategorizedFiles: (...args: any[]) => getUncategorizedFilesMock(...args),
  assignFilesToFolder: (...args: any[]) => assignFilesToFolderMock(...args),
  removeFileFromFolder: (...args: any[]) => removeFileFromFolderMock(...args),
  getFileFolders: (...args: any[]) => getFileFoldersMock(...args),
  updateFileFolders: (...args: any[]) => updateFileFoldersMock(...args),
}));

const getUserFilesMetaDataMock = vi.fn();

vi.mock("../../repository/file.repository", () => ({
  getUserFilesMetaData: (...args: any[]) => getUserFilesMetaDataMock(...args),
}));

const transformFilesDataMock = vi.fn();

vi.mock("../../utils/fileTransform.utils", () => ({
  transformFilesData: (...args: any[]) => transformFilesDataMock(...args),
}));

type SelectedFolder = "all" | "uncategorized" | number;

describe("useFolderFiles", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    getFilesInFolderMock.mockReset();
    getUncategorizedFilesMock.mockReset();
    assignFilesToFolderMock.mockReset();
    removeFileFromFolderMock.mockReset();
    getFileFoldersMock.mockReset();
    updateFileFoldersMock.mockReset();
    getUserFilesMetaDataMock.mockReset();
    transformFilesDataMock.mockReset();
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Recreate the console error spy for next test file execution
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should load files for 'uncategorized' folder on mount and also load allFiles reference list", async () => {
    const uncategorized = [
      {
        id: 1,
        filename: "u.pdf",
        size: 10,
        mimetype: "application/pdf",
        upload_date: "2026-02-20T00:00:00Z",
        uploaded_by: 99,
        uploader_name: "A",
        uploader_surname: undefined,
        folders: [],
      },
    ];

    getUncategorizedFilesMock.mockResolvedValueOnce(uncategorized);

    // Second effect always loads all files as reference
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useFolderFiles("uncategorized" as SelectedFolder));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getUncategorizedFilesMock).toHaveBeenCalledTimes(1);
    expect(result.current.files).toEqual(uncategorized);

    // allFiles reference list should be set by the second effect (empty here)
    await waitFor(() => expect(result.current.allFiles).toEqual([]));
    expect(result.current.error).toBe(null);
  });

  it("should load files for a specific folder id on mount", async () => {
    const folderFiles = [
      {
        id: 2,
        filename: "f.pdf",
        size: 20,
        mimetype: "application/pdf",
        upload_date: "2026-02-20T00:00:00Z",
        uploaded_by: 1,
        uploader_name: "B",
        uploader_surname: undefined,
        folders: [],
      },
    ];

    getFilesInFolderMock.mockResolvedValueOnce(folderFiles);

    // Second effect loadAllFiles
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useFolderFiles(7 as SelectedFolder));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getFilesInFolderMock).toHaveBeenCalledTimes(1);
    expect(getFilesInFolderMock).toHaveBeenCalledWith(7);
    expect(result.current.files).toEqual(folderFiles);
  });

  it("should load 'all' files via metadata + transform pipeline, and set files + allFiles", async () => {
    // refreshFiles('all') calls getUserFilesMetaData + transformFilesData + internal mapping
    // plus the second effect loads all files again (same pipeline)

    const rawMeta = [{ any: "raw" }];

    const transformed = [
      {
        id: "10",
        fileName: "report.pdf",
        size: 123,
        type: "application/pdf",
        uploadDate: new Date("2026-02-20T10:00:00Z"),
        uploader: "55",
        uploaderName: "John",
      },
    ];

    getUserFilesMetaDataMock.mockResolvedValue(rawMeta);
    transformFilesDataMock.mockReturnValue(transformed);

    const { result } = renderHook(() => useFolderFiles("all" as SelectedFolder));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Should have at least one call from refreshFiles('all'), and one from loadAllFiles effect
    expect(getUserFilesMetaDataMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(transformFilesDataMock.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Validate mapping defaults from transformToFileWithFolders
    expect(result.current.files).toEqual([
      {
        id: 10,
        filename: "report.pdf",
        size: 123,
        mimetype: "application/pdf",
        upload_date: new Date("2026-02-20T10:00:00Z").toISOString(),
        uploaded_by: 55,
        uploader_name: "John",
        uploader_surname: undefined,
        folders: [],
      },
    ]);

    // allFiles should also contain the same mapped file
    expect(result.current.allFiles).toEqual(result.current.files);
  });

  it("refreshFiles should set error when fetch fails and always stop loading", async () => {
    // Second effect loadAllFiles
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    getFilesInFolderMock.mockResolvedValueOnce([]); // initial mount
    const { result } = renderHook(() => useFolderFiles(1 as SelectedFolder));
    await waitFor(() => expect(result.current.loading).toBe(false));

    getFilesInFolderMock.mockRejectedValueOnce(new Error("Network down"));

    await act(async () => {
      await result.current.refreshFiles(1);
    });

    // The key behavior: error message + loading reset
    expect(result.current.error).toBe("Failed to load files");
    expect(result.current.loading).toBe(false);

    // Optional: ensure it actually tried to re-fetch
    expect(getFilesInFolderMock).toHaveBeenCalledWith(1);
  });

  it("handleAssignFilesToFolder should return true on success and refresh selected folder", async () => {
    // Mount selectedFolder = 2
    getFilesInFolderMock.mockResolvedValueOnce([]);
    // Second effect loadAllFiles
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useFolderFiles(2 as SelectedFolder));
    await waitFor(() => expect(result.current.loading).toBe(false));

    assignFilesToFolderMock.mockResolvedValueOnce(undefined);
    getFilesInFolderMock.mockResolvedValueOnce([]); // refresh after assign

    let ok = false;
    await act(async () => {
      ok = await result.current.handleAssignFilesToFolder(9, [1, 2, 3]);
    });

    expect(ok).toBe(true);
    expect(assignFilesToFolderMock).toHaveBeenCalledWith(9, [1, 2, 3]);

    // Refreshes the selected folder (2) after assignment
    expect(getFilesInFolderMock).toHaveBeenCalledWith(2);
    expect(result.current.loadingOperation).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it("handleAssignFilesToFolder should return false and set fallback error message when rejection is not Error", async () => {
    // Mount selectedFolder = 2
    getFilesInFolderMock.mockResolvedValueOnce([]);
    // Second effect loadAllFiles
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useFolderFiles(2 as SelectedFolder));
    await waitFor(() => expect(result.current.loading).toBe(false));

    assignFilesToFolderMock.mockRejectedValueOnce("oops"); // non-Error

    let ok = true;
    await act(async () => {
      ok = await result.current.handleAssignFilesToFolder(9, [1]);
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("Failed to assign files");
    expect(result.current.loadingOperation).toBe(false);
  });

  it("handleRemoveFileFromFolder should return false and set Error.message when rejection is Error", async () => {
    // Mount selectedFolder = 3
    getFilesInFolderMock.mockResolvedValueOnce([]);
    // Second effect loadAllFiles
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useFolderFiles(3 as SelectedFolder));
    await waitFor(() => expect(result.current.loading).toBe(false));

    removeFileFromFolderMock.mockRejectedValueOnce(new Error("Cannot remove"));

    let ok = true;
    await act(async () => {
      ok = await result.current.handleRemoveFileFromFolder(3, 11);
    });

    expect(ok).toBe(false);
    expect(removeFileFromFolderMock).toHaveBeenCalledWith(3, 11);
    expect(result.current.error).toBe("Cannot remove");
    expect(result.current.loadingOperation).toBe(false);
  });

  it("handleUpdateFileFolders should return updated folders on success and refresh selected folder", async () => {
    // Mount selectedFolder = 4
    getFilesInFolderMock.mockResolvedValueOnce([]);
    // Second effect loadAllFiles
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useFolderFiles(4 as SelectedFolder));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const updatedFolders = [{ id: 1, name: "A" }];
    updateFileFoldersMock.mockResolvedValueOnce(updatedFolders);
    getFilesInFolderMock.mockResolvedValueOnce([]); // refresh

    let returned: any = null;
    await act(async () => {
      returned = await result.current.handleUpdateFileFolders(10, [1, 2]);
    });

    expect(updateFileFoldersMock).toHaveBeenCalledWith(10, [1, 2]);
    expect(returned).toEqual(updatedFolders);
    expect(getFilesInFolderMock).toHaveBeenCalledWith(4);
    expect(result.current.loadingOperation).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it("getFileCurrentFolders should return [] when repository throws", async () => {
    // Mount selectedFolder = 1
    getFilesInFolderMock.mockResolvedValueOnce([]);
    // Second effect loadAllFiles
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useFolderFiles(1 as SelectedFolder));
    await waitFor(() => expect(result.current.loading).toBe(false));

    getFileFoldersMock.mockRejectedValueOnce(new Error("fail"));

    let folders: any[] = [{ id: 999 }];
    await act(async () => {
      folders = await result.current.getFileCurrentFolders(123);
    });

    expect(folders).toEqual([]);
    expect(getFileFoldersMock).toHaveBeenCalledWith(123);
  });

  it("handleRemoveFileFromFolder should return true on success and refresh selected folder (covers success path)", async () => {
    // Mount selectedFolder = 3
    getFilesInFolderMock.mockResolvedValueOnce([]); // initial mount load
    // Second effect loadAllFiles
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useFolderFiles(3 as SelectedFolder));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Remove succeeds
    removeFileFromFolderMock.mockResolvedValueOnce(undefined);

    // refreshFiles(selectedFolder) should run after removal
    getFilesInFolderMock.mockResolvedValueOnce([]); // refresh after remove

    let ok = false;
    await act(async () => {
      ok = await result.current.handleRemoveFileFromFolder(3, 11);
    });

    expect(ok).toBe(true);
    expect(removeFileFromFolderMock).toHaveBeenCalledWith(3, 11);

    // Called once on mount + once after successful removal
    expect(getFilesInFolderMock).toHaveBeenCalledTimes(2);
    expect(getFilesInFolderMock.mock.calls[0][0]).toBe(3);
    expect(getFilesInFolderMock.mock.calls[1][0]).toBe(3);

    expect(result.current.loadingOperation).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it("handleUpdateFileFolders should return null and set fallback error when rejection is not Error (covers update catch)", async () => {
    // Mount selectedFolder = 4
    getFilesInFolderMock.mockResolvedValueOnce([]); // initial mount load
    // Second effect loadAllFiles
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useFolderFiles(4 as SelectedFolder));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Make update fail with a non-Error value (covers the fallback message branch)
    updateFileFoldersMock.mockRejectedValueOnce("nope");

    let returned: any = "not-null";
    await act(async () => {
      returned = await result.current.handleUpdateFileFolders(10, [1, 2]);
    });

    expect(returned).toBeNull();
    expect(updateFileFoldersMock).toHaveBeenCalledWith(10, [1, 2]);

    // Since update throws, refreshFiles(selectedFolder) is NOT executed
    expect(getFilesInFolderMock).toHaveBeenCalledTimes(1);

    expect(result.current.error).toBe("Failed to update file folders");
    expect(result.current.loadingOperation).toBe(false);
  });

  it("should log error when loading all files for reference fails (covers loadAllFiles catch)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // selectedFolder = uncategorized => refreshFiles does NOT call getUserFilesMetaData
    getUncategorizedFilesMock.mockResolvedValueOnce([]); // initial mount load

    // Force loadAllFiles effect to fail
    getUserFilesMetaDataMock.mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useFolderFiles("uncategorized" as SelectedFolder));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The effect runs asynchronously; wait until the error is logged
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(String(consoleErrorSpy.mock.calls[0][0])).toContain("Error loading all files:");
    });
  });

  it("should apply default values when transformed metadata has missing/invalid fields (covers transformToFileWithFolders fallbacks)", async () => {
    // We don't need fake timers; we only assert that a valid ISO string is produced.
    const nowIso = new Date().toISOString();

    // refreshFiles('all') pipeline
    getUserFilesMetaDataMock.mockResolvedValueOnce([{ raw: true }]);
    transformFilesDataMock.mockReturnValueOnce([
      {
        id: "not-a-number", // -> Number(...) || 0
        fileName: undefined, // -> ''
        size: undefined, // -> 0
        type: undefined, // -> application/octet-stream
        uploadDate: undefined, // -> new Date().toISOString()
        uploader: "NaN", // -> 0
        uploaderName: undefined,
      },
    ]);

    // loadAllFiles effect (second effect) — keep it quick
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useFolderFiles("all" as SelectedFolder));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const file = result.current.files[0];

    expect(file.id).toBe(0);
    expect(file.filename).toBe("");
    expect(file.size).toBe(0);
    expect(file.mimetype).toBe("application/octet-stream");
    expect(file.uploaded_by).toBe(0);

    // upload_date should be a valid ISO string (and should not be older than 'nowIso' computed before render).
    expect(typeof file.upload_date).toBe("string");
    expect(Number.isNaN(Date.parse(file.upload_date))).toBe(false);
    expect(Date.parse(file.upload_date)).toBeGreaterThanOrEqual(Date.parse(nowIso));

    expect(file.folders).toEqual([]);
  });

  it("handleAssignFilesToFolder should use Error.message when rejection is an Error (covers assign catch message branch)", async () => {
    // Mount selectedFolder = 2
    getFilesInFolderMock.mockResolvedValueOnce([]); // initial refreshFiles(selectedFolder)
    // loadAllFiles effect
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useFolderFiles(2 as SelectedFolder));
    await waitFor(() => expect(result.current.loading).toBe(false));

    assignFilesToFolderMock.mockRejectedValueOnce(new Error("No permission"));

    let ok = true;
    await act(async () => {
      ok = await result.current.handleAssignFilesToFolder(9, [1, 2]);
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("No permission");
    expect(result.current.loadingOperation).toBe(false);
  });

  it("handleAssignFilesToFolder should use Error.message when rejection is an Error (covers assign catch message branch)", async () => {
    // Mount selectedFolder = 2
    getFilesInFolderMock.mockResolvedValueOnce([]);
    // Second effect loadAllFiles
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useFolderFiles(2 as SelectedFolder));
    await waitFor(() => expect(result.current.loading).toBe(false));

    assignFilesToFolderMock.mockRejectedValueOnce(new Error("No permission"));

    let ok = true;
    await act(async () => {
      ok = await result.current.handleAssignFilesToFolder(9, [1, 2]);
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("No permission");
    expect(result.current.loadingOperation).toBe(false);
  });

  it("handleRemoveFileFromFolder should use fallback message when rejection is not Error (covers remove catch fallback branch)", async () => {
    // Mount selectedFolder = 3
    getFilesInFolderMock.mockResolvedValueOnce([]);
    // loadAllFiles effect
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useFolderFiles(3 as SelectedFolder));
    await waitFor(() => expect(result.current.loading).toBe(false));

    removeFileFromFolderMock.mockRejectedValueOnce("oops"); // non-Error

    let ok = true;
    await act(async () => {
      ok = await result.current.handleRemoveFileFromFolder(3, 11);
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("Failed to remove file");
    expect(result.current.loadingOperation).toBe(false);
  });

  it("handleUpdateFileFolders should use Error.message when rejection is an Error (covers update catch message branch)", async () => {
    // Mount selectedFolder = 4
    getFilesInFolderMock.mockResolvedValueOnce([]);
    // loadAllFiles effect
    getUserFilesMetaDataMock.mockResolvedValueOnce([]);
    transformFilesDataMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useFolderFiles(4 as SelectedFolder));
    await waitFor(() => expect(result.current.loading).toBe(false));

    updateFileFoldersMock.mockRejectedValueOnce(new Error("Update failed"));

    let returned: any = "not-null";
    await act(async () => {
      returned = await result.current.handleUpdateFileFolders(10, [1, 2]);
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe("Update failed");
    expect(result.current.loadingOperation).toBe(false);
  });
});