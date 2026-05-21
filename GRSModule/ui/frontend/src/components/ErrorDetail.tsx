import { useState } from "react";

interface Props {
  error: string;
}

export default function ErrorDetail({ error }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          fontSize: 12,
          color: "#c62828",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {open ? "▾ Hide error" : "▸ Show error details"}
      </button>
      {open && (
        <pre
          style={{
            marginTop: 4,
            padding: "8px 12px",
            background: "#1a1a1a",
            color: "#ef9a9a",
            fontSize: 12,
            borderRadius: 4,
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            maxHeight: 200,
          }}
        >
          {error}
        </pre>
      )}
    </div>
  );
}
