import React from "react";
import { Box, Stack, Typography, CircularProgress } from "@mui/material";
import { VWLink } from "../../../../components/Link";
import axios from "axios";
import { ENV_VARs } from "../../../../../../env.vars";

interface AITrustCentreHeaderProps {
  data: any;
  hash: string | null;
}
const AITrustCentreHeader: React.FC<AITrustCentreHeaderProps> = ({
  data,
  hash,
}) => {
  const [logo, setLogo] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!hash) return;
    setLoading(true);
    axios
      .get(`${ENV_VARs.URL}/api/aiTrustCentre/${hash}/logo`)
      .then((response) => {
        // Extract the buffer and type
        const logoData = response?.data?.data?.logo;
        if (
          logoData?.content?.type === "Buffer" &&
          Array.isArray(logoData?.content?.data)
        ) {
          // Convert buffer to base64
          const byteArray = new Uint8Array(logoData.content.data);
          const binary = byteArray.reduce(
            (acc, byte) => acc + String.fromCharCode(byte),
            ""
          );
          const base64 = window.btoa(binary);
          const imageUrl = `data:${logoData.type};base64,${base64}`;
          setLogo(imageUrl);
        }
      })
      .catch((err) => {
        // 404 is expected when no logo has been uploaded - handle silently
        if (err?.response?.status !== 404) {
          console.error(
            err?.response?.data?.error || err.message || "Failed to fetch logo"
          );
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [hash]);
  if (!data) return null;

  return (
    <Box
      sx={{
        backgroundColor: "white",
        padding: 6,
        borderRadius: 1,
        border: "1px solid #E0E0E0",
        width: "80%",
      }}
    >
      <Stack alignItems="center" spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1}>
          {loading ? (
            <CircularProgress size={28} />
          ) : (
            <>
              {(logo || data?.info?.logo) && (
                <img
                  src={logo || data?.info?.logo}
                  alt="Company Logo"
                  style={{ height: 35 }}
                />
              )}
              <Typography
                variant="h5"
                fontWeight="semibold"
                sx={{ color: "text.secondary" }}
              >
                {data?.info?.title}
              </Typography>
            </>
          )}
        </Stack>
        {data?.terms_and_contact && (
          <Stack direction="row" spacing={2} alignItems="center">
            {data?.terms_and_contact?.terms && (
              <VWLink
                url={data?.terms_and_contact?.terms}
                openInNewTab={true}
                showIcon={false}
              >
                Terms of service
              </VWLink>
            )}
            {data?.terms_and_contact?.terms &&
              data?.terms_and_contact?.privacy && (
                <Typography sx={{ fontSize: 13 }}>•</Typography>
              )}
            {data?.terms_and_contact?.privacy && (
              <VWLink
                url={data?.terms_and_contact?.privacy}
                openInNewTab={true}
                showIcon={false}
              >
                Privacy policy
              </VWLink>
            )}
            {data?.terms_and_contact?.privacy &&
              data?.terms_and_contact?.email && (
                <Typography sx={{ fontSize: 13 }}>•</Typography>
              )}
            {data?.terms_and_contact?.email && (
              <VWLink
                url={`mailto:${data?.terms_and_contact?.email}`}
                showIcon={false}
              >
                {data?.terms_and_contact?.email}
              </VWLink>
            )}
          </Stack>
        )}
      </Stack>
    </Box>
  );
};

export default AITrustCentreHeader;
