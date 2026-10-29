import { Box, Typography } from "@mui/material";
import { questionTitle } from "./intakeLayout";

export interface OpenVeto {
  key: string;
  /** Saved as "I don't know", which leaves the question open. */
  dontKnow: boolean;
}

interface OpenVetoListProps {
  vetoes: OpenVeto[];
  /** Text colour; inherits the surrounding text's when omitted. */
  color?: string;
}

/** Required questions still open, by title, marking those answered "I don't know". */
const OpenVetoList = ({ vetoes, color = "inherit" }: OpenVetoListProps) => (
  <Box component="ul" sx={{ m: 0, pl: "18px" }} data-testid="open-veto-list">
    {vetoes.map((v) => (
      <Typography component="li" key={v.key} sx={{ fontSize: 13, color }}>
        <span>{questionTitle(v.key)}</span>
        {v.dontKnow && <span> (answered &quot;I don&apos;t know&quot;)</span>}
      </Typography>
    ))}
  </Box>
);

export default OpenVetoList;
