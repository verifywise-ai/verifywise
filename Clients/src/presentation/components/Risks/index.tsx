import { Theme } from "@emotion/react";
import { SxProps, Stack, Typography, useTheme } from "@mui/material";
import { FC } from "react";
import { RiskData } from "../../pages/ProjectView/Overview";
import { palette, radiusPx } from "../../themes/palette";

const Risks: FC<RiskData & { sx?: SxProps<Theme> | undefined }> = ({
  veryHighRisks,
  highRisks,
  mediumRisks,
  lowRisks,
  veryLowRisks,
  sx,
}) => {
  const theme = useTheme();

  const styles = {
    stack: {
      border: `1px solid ${theme.palette.border.light}`,
      borderRadius: radiusPx.sm,
      backgroundColor: theme.palette.background.main,
      minWidth: 532,
      width: "fit-content",
    },
    stackItem: {
      "p": "15px",
      "position": "relative",
      "width": 124,
      "&:after": {
        content: `""`,
        position: "absolute",
        backgroundColor: palette.border.light,
        top: "13px",
        right: 0,
        width: "1px",
        height: "43px",
      },
    },
    stackItemText: {
      fontSize: "13px",
    },
  };

  return (
    <Stack direction="row" justifyContent="space-between" sx={{ ...styles.stack, ...sx }}>
      <Stack sx={styles.stackItem}>
        <Typography sx={{ color: palette.risk.critical.text, ...styles.stackItemText }}>
          Very high risks
        </Typography>
        <Typography sx={{ color: theme.palette.text.secondary, ...styles.stackItemText }}>
          {veryHighRisks}
        </Typography>
      </Stack>
      <Stack sx={styles.stackItem}>
        <Typography sx={{ color: palette.risk.high.text, ...styles.stackItemText }}>
          High risks
        </Typography>
        <Typography sx={{ color: theme.palette.text.secondary, ...styles.stackItemText }}>
          {highRisks}
        </Typography>
      </Stack>
      <Stack sx={styles.stackItem}>
        <Typography sx={{ color: palette.risk.medium.text, ...styles.stackItemText }}>
          Medium risks
        </Typography>
        <Typography sx={{ color: theme.palette.text.secondary, ...styles.stackItemText }}>
          {mediumRisks}
        </Typography>
      </Stack>
      <Stack sx={styles.stackItem}>
        <Typography sx={{ color: palette.risk.low.text, ...styles.stackItemText }}>
          Low risks
        </Typography>
        <Typography sx={{ color: theme.palette.text.secondary, ...styles.stackItemText }}>
          {lowRisks}
        </Typography>
      </Stack>
      <Stack sx={{ p: "15px", width: 124 }}>
        <Typography sx={{ color: palette.risk.veryLow.text, ...styles.stackItemText }}>
          Very low risks
        </Typography>
        <Typography sx={{ color: theme.palette.text.secondary, ...styles.stackItemText }}>
          {veryLowRisks}
        </Typography>
      </Stack>
    </Stack>
  );
};

export default Risks;
