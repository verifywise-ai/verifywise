import { Box, Button, Stack, Typography, useTheme } from "@mui/material";
import { ENV_VARs } from "../../../../env.vars";
import getStyles from "./styles";

// URL constants
const PRICING_URL = "https://verifywise.ai/pricing/";

const ReadyToSubscribeBox = () => {
  const theme = useTheme();
  const styles = getStyles(theme);

  // Early return if not in demo app mode
  if (!ENV_VARs.IS_DEMO_APP) {
    return null;
  }

  const handleClick = () => {
    window.open(PRICING_URL, "_blank");
  };

  return (
    <Box sx={styles.container}>
      <Stack spacing={3} sx={styles.stack}>
        <Typography variant="h5" sx={styles.title}>
          Ready to subscribe?
        </Typography>
        <Typography variant="subtitle1" sx={styles.description}>
          Unlock the full potential of VerifyWise AI governance with our premium features.
        </Typography>
        <Button sx={styles.button} onClick={handleClick}>
          View plans
        </Button>
      </Stack>
    </Box>
  );
};

export default ReadyToSubscribeBox;
