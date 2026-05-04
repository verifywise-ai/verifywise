// AlertBody.tsx
import React, { useState } from "react";
import { Box, IconButton, Typography } from "@mui/material";
import { Copy as ContentCopyIcon } from "lucide-react";

interface AlertBodyProps {
  body: string;
  textColor: string;
}

const AlertBody: React.FC<AlertBodyProps> = ({ body, textColor }) => {
  const [copied, setCopied] = useState(false);

  // Ensure body is a string and handle non-string values
  const bodyString = typeof body === "string" ? body : String(body || "");
  const linkMatch = bodyString.match(/https?:\/\/[^\s]+/);
  const link = linkMatch ? linkMatch[0] : null;

  // Limit link to 35 characters
  const limitedLink = link && link.length > 25 ? link.substring(0, 25) + "..." : link;

  const handleCopy = async () => {
    if (link) {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <Typography sx={{ fontWeight: 400, color: textColor, whiteSpace: "pre-line" }}>
      {link ? (
        <>
          {bodyString.split(link)[0]}
          <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
            {limitedLink}
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              aria-label={copied ? "Link copied to clipboard" : "Copy link to clipboard"}
              sx={{ paddingLeft: 3 }}
            >
              <Box
                sx={{
                  width: "50px",
                  height: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {copied ? (
                  <Typography variant="caption" sx={{ color: textColor }} aria-live="polite">
                    Copied!
                  </Typography>
                ) : (
                  <ContentCopyIcon size={13} style={{ color: textColor }} aria-hidden="true" />
                )}
              </Box>
            </IconButton>
          </Box>
          {bodyString.split(link)[1]}
        </>
      ) : (
        bodyString
      )}
    </Typography>
  );
};

export default AlertBody;
