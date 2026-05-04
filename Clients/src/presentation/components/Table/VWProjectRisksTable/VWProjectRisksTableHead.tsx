import { TableCell, TableHead, TableRow } from "@mui/material";
import singleTheme from "../../../themes/v1SingleTheme";

const VWProjectRisksTableHead = ({ columns }: { columns: any[] }) => {
  return (
    <TableHead
      sx={{
        backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
      }}
    >
      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
        {columns.map((column, index) => (
          <TableCell
            key={index}
            style={{
              ...singleTheme.tableStyles.primary.header.cell,
            }}
          >
            {column}
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
};

export default VWProjectRisksTableHead;
