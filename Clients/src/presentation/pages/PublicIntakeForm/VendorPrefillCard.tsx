import { useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { FileUp, Loader2 } from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import { border, status } from "../../themes/palette";

/** Largest file the server accepts for prefill (10 MB). */
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * "Fill from a vendor document": the submitter picks a PDF or Word file and
 * the page asks the server for suggested answers. A failure only shows a
 * message here; the form itself is never blocked.
 */
export function VendorPrefillCard({
  onUpload,
}: {
  /** Resolves with the number of answers filled in; rejects with a message to show. */
  onUpload: (file: File) => Promise<number>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setMessage({ text: "This file is larger than 10 MB.", isError: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const filled = await onUpload(file);
      if (filled === 0) {
        setMessage({
          text: "No answers were found in this document for the empty questions.",
          isError: false,
        });
      }
    } catch (error) {
      setMessage({
        text:
          error instanceof Error && error.message
            ? error.message
            : "We couldn't read answers from this document. You can fill in the form as usual.",
        isError: true,
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Box
      data-testid="vendor-prefill-card"
      sx={{
        mb: "24px",
        p: "16px",
        border: `1px solid ${border.dark}`,
        borderRadius: "4px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <Typography component="h2" sx={{ fontSize: "14px", fontWeight: 600, color: "text.primary" }}>
        Fill from a vendor document
      </Typography>
      <Typography sx={{ fontSize: "13px", color: "text.secondary", lineHeight: 1.5 }}>
        {
          "Upload a PDF or Word file, up to 10 MB. AI suggests answers for empty questions, and you confirm each one."
        }
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          data-testid="vendor-prefill-input"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <CustomizableButton
          variant="outlined"
          text={busy ? "Reading the document..." : "Choose a file"}
          isDisabled={busy}
          startIcon={
            busy ? (
              <Loader2
                size={14}
                strokeWidth={1.5}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              <FileUp size={14} strokeWidth={1.5} />
            )
          }
          onClick={() => inputRef.current?.click()}
          sx={{ height: 30 }}
        />
      </Box>
      {message && (
        <Typography
          role={message.isError ? "alert" : "status"}
          sx={{ fontSize: "13px", color: message.isError ? status.error.text : "text.secondary" }}
        >
          {message.text}
        </Typography>
      )}
    </Box>
  );
}

export default VendorPrefillCard;
