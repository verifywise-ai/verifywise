import { Box, Button } from "@mui/material";
import { approvalButtonStyle, approvalCountBadgeStyle } from "./style";
import { ApprovalButtonProps } from "src/domain/interfaces/i.approvalForkflow";

export function ApprovalButton({ label, count, onClick }: ApprovalButtonProps) {
  return (
    <Button variant="contained" size="small" onClick={onClick} sx={approvalButtonStyle}>
      {label}
      <Box component="span" sx={approvalCountBadgeStyle}>
        {count}
      </Box>
    </Button>
  );
}
