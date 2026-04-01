import React, { useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import { Copy, Check } from "lucide-react";
import Prism from "prismjs";
import { text, background } from "../../../themes/palette";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/themes/prism-tomorrow.css";

interface CodeBlockProps {
  code: string;
  language?: string;
  onCopy?: (text: string) => void;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = "tsx",
  onCopy,
}) => {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    onCopy?.(code);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box
      sx={{
        position: "relative",
        backgroundColor: "#1e1e1e",
        borderRadius: "0 0 4px 4px",
        overflow: "hidden",
      }}
    >
      <Box
        onClick={handleCopy}
        sx={{
          position: "absolute",
          top: "8px",
          right: "8px",
          cursor: "pointer",
          color: copied ? "#4ade80" : `${text.disabled}`,
          display: "flex",
          alignItems: "center",
          gap: "4px",
          fontSize: 11,
          zIndex: 1,
          "&:hover": {
            color: copied ? "#4ade80" : `${background.main}`,
          },
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy"}
      </Box>
      <Box
        component="pre"
        sx={{
          margin: 0,
          padding: "12px",
          overflow: "auto",
          fontSize: "11px",
          lineHeight: 1.4,
          fontFamily: "'Fira Code', 'Consolas', monospace",
          "& code": {
            fontFamily: "inherit",
          },
        }}
      >
        <code ref={codeRef} className={`language-${language}`}>
          {code}
        </code>
      </Box>
    </Box>
  );
};

export default CodeBlock;
