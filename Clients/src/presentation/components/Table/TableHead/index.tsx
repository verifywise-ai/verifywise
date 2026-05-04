import { TableHead, TableRow, TableCell } from "@mui/material";
import singleTheme from "../../../themes/v1SingleTheme";

/**
 * Generic TableHeader component used by various tables.
 * Columns receive dynamic widths based on the table theme.
 * For custom column widths, create a dedicated TableHead in your table's directory.
 */
const TableHeader = ({ columns, centered = false }: { columns: string[]; centered?: boolean }) => {
  return (
    <TableHead
      sx={{
        backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
      }}
    >
      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
        {columns.map((column, index) => {
          const isActionColumn = column === "ACTION" || column === "Actions";
          const isFirstColumn = index === 0;
          return (
            <TableCell
              key={index}
              style={{
                ...singleTheme.tableStyles.primary.header.cell,
                ...(centered && !isFirstColumn ? { textAlign: "center" } : {}),
                ...(isActionColumn
                  ? {
                      minWidth: "80px",
                      maxWidth: "80px",
                    }
                  : {}),
              }}
            >
              {column}
            </TableCell>
          );
        })}
      </TableRow>
    </TableHead>
  );
};

export default TableHeader;
