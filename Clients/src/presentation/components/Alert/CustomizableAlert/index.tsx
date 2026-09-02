import { Alert, Typography } from "@mui/material";
import { singleTheme } from "../../../themes";

const alertStyles = singleTheme.alertStyles;

type CustomizableAlertProps = {
  title?: string;
  status?: "success" | "info" | "warning" | "error";
};

const CustomizableAlert = ({
  title = "This is a success vwAlert — check it out!",
  status = "success",
}: CustomizableAlertProps) => {
  const { text, bg, border } = alertStyles[status];

  return (
    <Alert
      severity={status}
      onClose={() => {}}
      sx={{ border: `1px solid ${border}`, backgroundColor: bg }}
    >
      <Typography
        color={text}
        sx={{
          fontSize: 13,
        }}
      >
        {title}
      </Typography>
    </Alert>
  );
};

export default CustomizableAlert;
