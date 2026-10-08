import React from "react";
import { Stack, Typography } from "@mui/material";
import type { ClassificationReason } from "../../../domain/types/euAiActClassification";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const ReasonList: React.FC<{ heading: string; items: ClassificationReason[] }> = ({
  heading,
  items,
}) => (
  <Stack sx={{ gap: "8px" }}>
    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{heading}</Typography>
    <Stack
      sx={{ gap: "8px", border: "1px solid #d0d5dd", borderRadius: "4px", padding: "12px 16px" }}
    >
      {items.map((item, index) => (
        <Stack key={`${item.article}-${index}`} sx={{ gap: "2px" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{item.article}</Typography>
          <Typography sx={{ fontSize: 13 }}>{item.text}</Typography>
          {item.appliesFrom && (
            <Stack direction="row" sx={{ gap: "4px", fontSize: 13, color: "text.secondary" }}>
              <span>Applies from</span>
              <span>{formatDate(item.appliesFrom)}</span>
            </Stack>
          )}
        </Stack>
      ))}
    </Stack>
  </Stack>
);

export default ReasonList;
