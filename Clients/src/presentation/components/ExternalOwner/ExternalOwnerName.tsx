import { Stack } from "@mui/material";
import { Mail } from "lucide-react";

interface ExternalOwnerNameProps {
  name: string;
  /** False inside a sentence, where the icon would break the line. */
  showIcon?: boolean;
}

/** An external owner's name marked as external, with a mail icon by default. */
const ExternalOwnerName = ({ name, showIcon = true }: ExternalOwnerNameProps) => (
  <Stack component="span" direction="row" alignItems="center" gap="4px" display="inline-flex">
    {showIcon && <Mail size={14} strokeWidth={1.5} aria-hidden="true" />}
    <span>{name}</span>
    <span>(external)</span>
  </Stack>
);

export default ExternalOwnerName;
