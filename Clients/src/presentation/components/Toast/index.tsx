import { Stack } from "@mui/material";
import { useTheme } from "@mui/material";
const CustomizableToast = ({ title = "Request is in the process. Please wait..." }) => {
  const theme = useTheme();
  return (
    <Stack
      sx={{
        width: "100%",
        maxWidth: "100%",
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 9999,

        backdropFilter: "blur(8px)", // Glass effect
        background: "rgba(255, 255, 255, 0.37)", // Slightly dark and blue with opacity
      }}
    >
      <Stack
        sx={{
          border: 1,
          borderColor: theme.palette.border.light,
          borderRadius: theme.shape.borderRadius,
          backgroundColor: theme.palette.background.main,
          width: "fit-content",
          height: "fit-content",
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9999,
          padding: "20px 40px",
          fontSize: 13,
        }}
      >
        {title}
      </Stack>
    </Stack>
  );
};

export default CustomizableToast;
