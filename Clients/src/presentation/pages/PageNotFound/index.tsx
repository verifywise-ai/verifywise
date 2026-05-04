import { ReactComponent as Background } from "../../assets/imgs/background-grid.svg";
import { ArrowLeft as LeftArrowLong } from "lucide-react";
import { Typography, Stack, useTheme } from "@mui/material";
import { useNavigate } from "react-router-dom";

function PageNotFound() {
  const theme = useTheme();
  const navigate = useNavigate();

  return (
    <div>
      <Background
        style={{
          position: "absolute",
          top: "-40%",
          zIndex: -1,
          backgroundPosition: "center",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />
      <Stack
        className="reg-admin-form"
        sx={{
          width: 360,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          margin: "auto",
          gap: theme.spacing(20),
        }}
      >
        <Typography sx={{ fontSize: 16, fontWeight: "bold" }}>404 | Page not found</Typography>
        <Stack
          sx={{
            display: "flex",
            flexDirection: "row",
            gap: theme.spacing(5),
            alignItems: "center",
            cursor: "pointer",
          }}
          onClick={() => {
            navigate("/");
          }}
        >
          <LeftArrowLong size={16} />
          <Typography sx={{ height: 22, fontSize: 13, fontWeight: 500 }}>Back to home</Typography>
        </Stack>
      </Stack>
    </div>
  );
}

export default PageNotFound;
