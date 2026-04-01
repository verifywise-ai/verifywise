import React, { useState, useMemo } from "react";
import FileBasicTable from "../FilesBasicTable/FileBasicTable";
import { Stack } from "@mui/material";
import {
  ArrowUp as AscendingIcon,
  ArrowDown as DescendingIcon,
  FileText,
} from "lucide-react";
import { EmptyState } from "../../EmptyState";
import { FileModel } from "../../../../domain/models/Common/file/file.model";
import { IFileTableProps } from "../../../types/interfaces/i.table";

type SortDirection = "asc" | "desc" | null;

const FileTable: React.FC<IFileTableProps> = ({
  cols,
  files,
  onFileDeleted,
  hidePagination = false,
  onAssignToFolder,
  onPreview,
  onEditMetadata,
  onViewHistory,
  visibleColumnKeys,
}) => {
  const [sortField, setSortField] = useState<keyof FileModel | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = (field: keyof FileModel) => {
    const isAsc = sortField === field && sortDirection === "asc";
    setSortDirection(isAsc ? "desc" : "asc");
    setSortField(field);
  };

  const sortedFiles = useMemo(() => {
    if (!sortField) return files;
    return [...files].sort((a, b) => {
      const aValue = a[sortField] ?? "";
      const bValue = b[sortField] ?? "";

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return 0;
    });
  }, [files, sortField, sortDirection]);

  const sortedCols = useMemo(
    () =>
      cols.map((col) => {
        const colKey = col.name.toLowerCase();
        const isSortable = ["upload date", "uploader"].includes(col.name);

        return isSortable
          ? {
              ...col,
              name: (
                <Stack
                  direction="row"
                  alignItems="center"
                  onClick={() => handleSort(colKey as keyof FileModel)}
                  sx={{ cursor: "pointer" }}
                >
                  {col.name}
                  {sortField === colKey && sortDirection === "asc" ? (
                    <AscendingIcon size={16} style={{ marginLeft: 4 }} />
                  ) : (
                    <DescendingIcon size={16} style={{ marginLeft: 4 }} />
                  )}
                </Stack>
              ),
            }
          : col;
      }),
    [cols, sortField, sortDirection]
  );

  const rows = useMemo(
    () =>
      sortedFiles.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        projectTitle: file.projectTitle,
        uploadDate: file.getFormattedUploadDate(),
        uploader: file.uploaderName || file.uploader,
        source: file.source,
        version: file.version,
        reviewStatus: file.reviewStatus,
      })),
    [sortedFiles]
  );

  return files.length === 0 ? (
    <EmptyState
      icon={FileText}
      message="There are currently no pieces of evidence or other documents uploaded."
      imageAlt="No files available"
    />
  ) : (
    <FileBasicTable
      data={{ cols: sortedCols, rows }}
      bodyData={sortedFiles}
      paginated={files.length > 0 && !hidePagination}
      table="fileManager"
      onFileDeleted={onFileDeleted}
      hidePagination={hidePagination}
      onAssignToFolder={onAssignToFolder}
      onPreview={onPreview}
      onEditMetadata={onEditMetadata}
      onViewHistory={onViewHistory}
      visibleColumnKeys={visibleColumnKeys}
    />
  );
};

export default FileTable;
