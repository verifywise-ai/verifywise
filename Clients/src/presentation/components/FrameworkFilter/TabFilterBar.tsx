import { Dispatch, SetStateAction, useMemo, useCallback, useEffect, useState } from "react";
import { Box } from "@mui/material";
import { SearchBox } from "../Search";
import { FilterBy, FilterColumn, FilterCondition } from "../Table/FilterBy";

interface TabFilterBarProps {
  statusFilter?: string;
  onStatusChange?: (val: string) => void;
  applicabilityFilter?: string;
  onApplicabilityChange?: (val: string) => void;
  ownerFilter?: string;
  approverFilter?: string;
  onOwnerChange?: (val: string) => void;
  reviewerFilter?: string;
  onReviewerChange?: (val: string) => void;
  onApproverChange?: (val: string) => void;
  dueDateFilter?: string;
  onDueDateChange?: (val: string) => void;
  showStatusFilter?: boolean;
  showApplicabilityFilter?: boolean;
  showOwnerFilter?: boolean;
  showReviewerFilter?: boolean;
  showApproverFilter?: boolean;
  showDueDateFilter?: boolean;
  statusOptions?: { label: string; value: string }[];
  approverOptions?: { label: string; value: string }[];
  ownerOptions?: { label: string; value: string }[];
  reviewerOptions?: { label: string; value: string }[];
  showSearchBar?: boolean;
  searchTerm?: string;
  setSearchTerm?: Dispatch<SetStateAction<string>>;
}

export const TabFilterBar = ({
  onStatusChange,
  onApplicabilityChange,
  onOwnerChange,
  onReviewerChange,
  showStatusFilter,
  showApplicabilityFilter,
  showOwnerFilter,
  showReviewerFilter,
  statusOptions = [],
  ownerOptions = [],
  reviewerOptions = [],
  approverOptions = [],
  onApproverChange,
  showApproverFilter,
  onDueDateChange,
  showDueDateFilter,
  showSearchBar = false,
  searchTerm,
  setSearchTerm,
}: TabFilterBarProps) => {
  // Track last filter conditions to detect changes
  const [lastConditions, setLastConditions] = useState<FilterCondition[]>([]);

  // Build filter columns dynamically based on what's shown
  const filterColumns: FilterColumn[] = useMemo(() => {
    const columns: FilterColumn[] = [];

    if (showStatusFilter) {
      columns.push({
        id: "status",
        label: "Status",
        type: "select" as const,
        options: statusOptions.map((opt) => ({ value: opt.value, label: opt.label })),
      });
    }

    if (showApplicabilityFilter) {
      columns.push({
        id: "applicability",
        label: "Applicability",
        type: "select" as const,
        options: [
          { value: "true", label: "Applicable" },
          { value: "false", label: "Not applicable" },
        ],
      });
    }

    if (showOwnerFilter) {
      columns.push({
        id: "owner",
        label: "Owner",
        type: "select" as const,
        options: ownerOptions.map((opt) => ({ value: opt.value, label: opt.label })),
      });
    }

    if (showReviewerFilter) {
      columns.push({
        id: "reviewer",
        label: "Reviewer",
        type: "select" as const,
        options: reviewerOptions.map((opt) => ({ value: opt.value, label: opt.label })),
      });
    }

    if (showApproverFilter) {
      columns.push({
        id: "approver",
        label: "Approver",
        type: "select" as const,
        options: approverOptions.map((opt) => ({ value: opt.value, label: opt.label })),
      });
    }

    if (showDueDateFilter) {
      columns.push({
        id: "due_date",
        label: "Due date",
        type: "date" as const,
      });
    }

    return columns;
  }, [
    showStatusFilter,
    statusOptions,
    showApplicabilityFilter,
    showOwnerFilter,
    ownerOptions,
    showReviewerFilter,
    reviewerOptions,
    showApproverFilter,
    approverOptions,
    showDueDateFilter,
  ]);

  // Handle filter changes from FilterBy component
  const handleFilterChange = useCallback((conditions: FilterCondition[]) => {
    setLastConditions(conditions);
  }, []);

  // Effect to propagate filter changes to parent callbacks
  useEffect(() => {
    // Extract filter values from conditions
    const statusCondition = lastConditions.find((c) => c.columnId === "status");
    const applicabilityCondition = lastConditions.find((c) => c.columnId === "applicability");
    const ownerCondition = lastConditions.find((c) => c.columnId === "owner");
    const reviewerCondition = lastConditions.find((c) => c.columnId === "reviewer");
    const approverCondition = lastConditions.find((c) => c.columnId === "approver");
    const dueDateCondition = lastConditions.find((c) => c.columnId === "due_date");

    // Call parent callbacks with the filter values
    if (onStatusChange) {
      const statusValue = statusCondition?.operator === "is" ? statusCondition.value : "";
      onStatusChange(statusValue);
    }

    if (onApplicabilityChange) {
      const applicabilityValue =
        applicabilityCondition?.operator === "is" ? applicabilityCondition.value : "all";
      onApplicabilityChange(applicabilityValue);
    }

    if (onOwnerChange) {
      const ownerValue = ownerCondition?.operator === "is" ? ownerCondition.value : "";
      onOwnerChange(ownerValue);
    }

    if (onReviewerChange) {
      const reviewerValue = reviewerCondition?.operator === "is" ? reviewerCondition.value : "";
      onReviewerChange(reviewerValue);
    }

    if (onApproverChange) {
      const approverValue = approverCondition?.operator === "is" ? approverCondition.value : "";
      onApproverChange(approverValue);
    }

    if (onDueDateChange) {
      // Map date filter operators to the number of days
      let dueDateValue = "";
      if (dueDateCondition) {
        switch (dueDateCondition.operator) {
          case "in_1_day":
            dueDateValue = "1";
            break;
          case "in_7_days":
            dueDateValue = "7";
            break;
          case "in_2_weeks":
            dueDateValue = "14";
            break;
          case "in_30_days":
            dueDateValue = "30";
            break;
          default:
            dueDateValue = "";
        }
      }
      onDueDateChange(dueDateValue);
    }
  }, [
    lastConditions,
    onStatusChange,
    onApplicabilityChange,
    onOwnerChange,
    onReviewerChange,
    onApproverChange,
    onDueDateChange,
  ]);

  // Don't render FilterBy if no filter columns are configured
  if (filterColumns.length === 0 && !showSearchBar) {
    return null;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 4, mb: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        {filterColumns.length > 0 && (
          <FilterBy columns={filterColumns} onFilterChange={handleFilterChange} />
        )}

        {showSearchBar && (
          <SearchBox
            placeholder="Search by title..."
            value={searchTerm ?? ""}
            onChange={(value) => setSearchTerm?.(value)}
            fullWidth={false}
          />
        )}
      </Box>
    </Box>
  );
};
