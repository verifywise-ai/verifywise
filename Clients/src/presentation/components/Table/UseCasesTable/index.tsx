import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Stack,
  Typography,
  LinearProgress,
} from "@mui/material";
import Chip from "../../Chip";

export interface UseCaseRow {
  id: number;
  name: string;
  framework: string;
  progress: number;
  status: string;
  updated: string;
}

interface UseCasesTableProps {
  data: UseCaseRow[];
  onRowClick?: (id: number) => void;
  formatDate?: (date: string) => string;
}

const defaultFormatDate = (dateString: string): string => {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "Unknown";

  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
};

const headerCellStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: "text.icon",
  borderBottom: "1px solid status.default.border",
};

const bodyCellStyle = {
  borderBottom: "1px solid background.hover",
};

const UseCasesTable: React.FC<UseCasesTableProps> = ({
  data,
  onRowClick,
  formatDate = defaultFormatDate,
}) => {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={headerCellStyle}>Name</TableCell>
            <TableCell sx={headerCellStyle}>Progress</TableCell>
            <TableCell sx={headerCellStyle}>Status</TableCell>
            <TableCell sx={headerCellStyle}>Updated</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((useCase) => (
            <TableRow
              key={useCase.id}
              sx={{
                "&:hover": { backgroundColor: "background.accent" },
                cursor: onRowClick ? "pointer" : "default",
              }}
              onClick={(e) => {
                e.stopPropagation();
                onRowClick?.(useCase.id);
              }}
            >
              <TableCell sx={{ fontSize: 13, color: "#1F2937", ...bodyCellStyle }}>
                {useCase.name}
              </TableCell>
              <TableCell sx={bodyCellStyle}>
                <Stack direction="row" alignItems="center" gap={1}>
                  <LinearProgress
                    variant="determinate"
                    value={useCase.progress}
                    sx={{
                      width: 60,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: "status.default.border",
                      "& .MuiLinearProgress-bar": {
                        backgroundColor: "brand.primary",
                        borderRadius: 2,
                      },
                    }}
                  />
                  <Typography sx={{ fontSize: 12, color: "text.icon" }}>
                    {useCase.progress}%
                  </Typography>
                </Stack>
              </TableCell>
              <TableCell sx={bodyCellStyle}>
                <Chip label={useCase.status} uppercase={false} />
              </TableCell>
              <TableCell sx={{ fontSize: 12, color: "text.disabled", ...bodyCellStyle }}>
                {formatDate(useCase.updated)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default UseCasesTable;
