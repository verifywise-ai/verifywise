/**
 * Component for pagination actions (first, previous, next, last).
 *
 * @component
 * @param {Object} props
 * @param {number} props.count - Total number of items.
 * @param {number} props.page - Current page number.
 * @param {number} props.rowsPerPage - Number of rows per page.
 * @param {function} props.onPageChange - Callback function to handle page change.
 *
 * @returns {JSX.Element} Pagination actions component.
 */

import { Box, Button } from "@mui/material";
import "../Table/index.css";

import {
  ChevronsLeft as LeftArrowDouble,
  ChevronLeft as LeftArrow,
  ChevronRight as RightArrow,
  ChevronsRight as RightArrowDouble,
} from "lucide-react";
import { ITablePaginationActionsProps } from "../../types/interfaces/i.tablePagination";

const TablePaginationActions: React.FC<ITablePaginationActionsProps> = ({
  count,
  page,
  rowsPerPage,
  onPageChange,
}) => {
  const handleFirstPageButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onPageChange(event, 0);
  };

  const handleBackButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onPageChange(event, page - 1);
  };

  const handleNextButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onPageChange(event, page + 1);
  };

  const handleLastPageButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onPageChange(event, Math.max(0, Math.ceil(count / rowsPerPage) - 1));
  };

  return (
    <Box sx={{ flexShrink: 0, ml: 3 }}>
      <Button
        variant="text"
        onClick={handleFirstPageButtonClick}
        disabled={page === 0}
        aria-label="first page"
      >
        <LeftArrowDouble size={16} />
      </Button>
      <Button
        variant="text"
        onClick={handleBackButtonClick}
        disabled={page === 0}
        aria-label="previous page"
      >
        <LeftArrow size={16} />
      </Button>
      <Button
        variant="text"
        onClick={handleNextButtonClick}
        disabled={page >= Math.ceil(count / rowsPerPage) - 1}
        aria-label="next page"
      >
        <RightArrow size={16} />
      </Button>
      <Button
        variant="text"
        onClick={handleLastPageButtonClick}
        disabled={page >= Math.ceil(count / rowsPerPage) - 1}
        aria-label="last page"
      >
        <RightArrowDouble size={16} />
      </Button>
    </Box>
  );
};

export default TablePaginationActions;
