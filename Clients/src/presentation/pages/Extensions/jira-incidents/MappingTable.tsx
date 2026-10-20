import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";
import { VWSelect } from "../../../components/VWComponents";

interface MappingTableProps {
  sourceHeader: string;
  targetHeader: string;
  rows: { key: string; label: string }[];
  options: { _id: string; name: string }[];
  value: Record<string, string>;
  onChange: (key: string, value: string) => void;
  idPrefix: string;
  error?: string;
}

/** One row per source value, each with a select of target values. */
export function MappingTable({
  sourceHeader,
  targetHeader,
  rows,
  options,
  value,
  onChange,
  idPrefix,
  error,
}: MappingTableProps) {
  const theme = useTheme();
  const cell = { borderColor: theme.palette.border.light, py: "8px", px: "12px" };
  return (
    <>
      <Table
        size="small"
        sx={{ border: `1px solid ${theme.palette.border.dark}`, borderRadius: "4px" }}
      >
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...cell, fontWeight: 600, fontSize: 13, width: "45%" }}>
              {sourceHeader}
            </TableCell>
            <TableCell sx={{ ...cell, fontWeight: 600, fontSize: 13 }}>{targetHeader}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell sx={{ ...cell, fontSize: 13 }}>{row.label}</TableCell>
              <TableCell sx={cell}>
                <VWSelect
                  id={`${idPrefix}-${row.key}`}
                  value={value[row.key] ?? ""}
                  items={options}
                  placeholder="Choose"
                  onChange={(e) => onChange(row.key, String(e.target.value))}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {error && (
        <Typography variant="caption" color="error" sx={{ display: "block", mt: "4px" }}>
          {error}
        </Typography>
      )}
    </>
  );
}

export default MappingTable;
