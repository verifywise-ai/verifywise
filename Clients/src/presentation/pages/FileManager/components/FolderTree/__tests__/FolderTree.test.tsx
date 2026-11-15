import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import { FolderTree } from "../index";
import type { IFolderTreeNode } from "../../../../../../domain/interfaces/i.virtualFolder";

const node = (id: number, name: string, fileCount: number, children: IFolderTreeNode[] = []) =>
  ({ id, name, file_count: fileCount, created_by: 1, children, path: [name] }) as IFolderTreeNode;

const folders = [node(1, "Security", 7, [node(2, "Access", 3)]), node(3, "HR", 5)];

const renderTree = (countByFolderId?: Record<number, number> | null) =>
  renderWithProviders(
    <FolderTree
      folders={folders}
      selectedFolder="all"
      onSelectFolder={vi.fn()}
      showUncategorized={false}
      showExpired={false}
      countByFolderId={countByFolderId}
    />,
  );

describe("FolderTree counts", () => {
  it("shows each folder's file_count when countByFolderId is absent", () => {
    renderTree();
    expect(screen.getByText("(7)")).toBeInTheDocument();
    expect(screen.getByText("(5)")).toBeInTheDocument();
  });

  it("shows the supplied count, and 0 for a folder missing from the map", () => {
    renderTree({ 1: 2 });
    expect(screen.getByText("(2)")).toBeInTheDocument();
    // Access (nested) and HR are both missing from the map
    expect(screen.getAllByText("(0)")).toHaveLength(2);
    expect(screen.queryByText("(7)")).not.toBeInTheDocument();
    expect(screen.queryByText("(5)")).not.toBeInTheDocument();
  });

  it("applies the supplied counts to nested folders", () => {
    renderTree({ 1: 1, 2: 4, 3: 0 });
    expect(screen.getByText("(4)")).toBeInTheDocument();
    expect(screen.queryByText("(3)")).not.toBeInTheDocument();
  });

  it("shows no counts at all when countByFolderId is null", () => {
    renderTree(null);
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.queryByText(/^\(\d+\)$/)).not.toBeInTheDocument();
  });
});
