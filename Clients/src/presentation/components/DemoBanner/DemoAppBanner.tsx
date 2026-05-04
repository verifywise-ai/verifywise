import { ENV_VARs } from "../../../../env.vars";
import { Container, Text } from "./styles";

const DemoAppBanner = () => {
  if (!ENV_VARs.IS_DEMO_APP) {
    return null;
  }

  return (
    <Container role="alert" aria-live="polite">
      <Text>
        You're viewing a public demo of the VerifyWise AI governance platform. Feel free to explore
        using demo data, but please don't enter any personal or company information.
      </Text>
    </Container>
  );
};

export default DemoAppBanner;
