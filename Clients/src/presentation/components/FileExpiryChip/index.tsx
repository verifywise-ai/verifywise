import type { FC } from "react";
import HouseChip from "../Chip";
import { isFileExpired, isFileExpiringSoon } from "../../../application/utils/fileExpiry";

interface FileExpiryChipProps {
  expiryDate: string | Date | null | undefined;
}

/**
 * Single source of truth for the file expiry/expiring-soon chip. Renders:
 *   - "Expired" (red)         when expiry_date < today
 *   - "Expiring soon" (amber) when expiry_date is 0..6 days away (matches the
 *                             server sweep window; uploader is being notified)
 *   - nothing                 otherwise (fresh, indefinite, unset, or invalid)
 *
 * Expired wins — the two states are mutually exclusive by the helpers'
 * contract. Consumers pass the raw expiry_date value; parsing and TZ safety
 * live inside fileExpiry.ts.
 */
export const FileExpiryChip: FC<FileExpiryChipProps> = ({ expiryDate }) => {
  if (isFileExpired(expiryDate)) return <HouseChip label="Expired" variant="error" />;
  if (isFileExpiringSoon(expiryDate)) return <HouseChip label="Expiring soon" variant="warning" />;
  return null;
};

export default FileExpiryChip;
