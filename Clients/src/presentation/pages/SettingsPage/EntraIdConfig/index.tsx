import React from "react";
import { Box } from "@mui/material";
import SsoConfigTab from "./SsoConfigTab";

const EntraIdConfig: React.FC = () => {
  return (
    <Box
      sx={{
        position: "relative",
        mt: 3,
        width: { xs: "90%", md: "70%" },
      }}
    >
      <SsoConfigTab />
    </Box>
  );
};

export default EntraIdConfig;
