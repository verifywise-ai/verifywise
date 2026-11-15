import { useEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { Filter } from "lucide-react";
import { VWLink } from "../../../components/Link";
import { alertTextSx, infoAlertSx } from "../../RiskInheritanceGraph/reportStyles";

interface HeatCellNoticeProps {
  /** Shows every risk again. */
  onClear: () => void;
  /**
   * Takes the focus when it opens. The reader chose a cell on another tab, which is gone with the
   * tab, so the focus would otherwise fall to the page, and a notice that appears with its text
   * already in it is not reliably read out. Not for a notice that opens because the Risks tab was.
   */
  focusOnMount?: boolean;
  /** Told once the focus has been taken, so that the next time the notice opens it is not. */
  onFocused?: () => void;
}

/**
 * Says, above the vendor risk register, that a heat map cell of the Insights tab is filtering it,
 * with the way back. Without it the register would look short for no reason.
 */
export default function HeatCellNotice({
  onClear,
  focusOnMount = false,
  onFocused,
}: HeatCellNoticeProps) {
  const notice = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusOnMount) return;
    notice.current?.focus();
    onFocused?.();
  }, [focusOnMount, onFocused]);

  return (
    <Box ref={notice} tabIndex={-1} sx={{ ...infoAlertSx, mb: 0 }} role="status">
      <Filter size={16} />
      <Typography sx={alertTextSx}>
        The table shows only the risks in the selected heat map cell.
      </Typography>
      <Box sx={{ ml: "auto" }}>
        <VWLink onClick={onClear} showUnderline={false} showIcon={false}>
          Show all risks
        </VWLink>
      </Box>
    </Box>
  );
}
