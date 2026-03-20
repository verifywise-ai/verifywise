import { useMemo } from "react";
import { Box, Typography, Stack } from "@mui/material";
import StandardModal from "../../../components/Modals/StandardModal";
import palette from "../../../themes/palette";

interface Message { role: string; content: string }
interface Version {
  version: number;
  content: Message[];
  model: string | null;
  config: Record<string, any> | null;
}

interface VersionDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  versionA: Version | null;
  versionB: Version | null;
}

type DiffStatus = "added" | "removed" | "changed" | "unchanged";

interface DiffRow {
  status: DiffStatus;
  left: Message | null;
  right: Message | null;
}

function diffMessages(a: Message[], b: Message[]): DiffRow[] {
  const rows: DiffRow[] = [];
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const left = i < a.length ? a[i] : null;
    const right = i < b.length ? b[i] : null;

    if (!left && right) {
      rows.push({ status: "added", left: null, right });
    } else if (left && !right) {
      rows.push({ status: "removed", left, right: null });
    } else if (left && right) {
      const same = left.role === right.role && left.content === right.content;
      rows.push({ status: same ? "unchanged" : "changed", left, right });
    }
  }
  return rows;
}

const STATUS_COLORS: Record<DiffStatus, string> = {
  added: "#ECFDF3",
  removed: "#FEF3F2",
  changed: "#FFFAEB",
  unchanged: "transparent",
};

const STATUS_BORDERS: Record<DiffStatus, string> = {
  added: "#A6F4C5",
  removed: "#FECDCA",
  changed: "#FDE68A",
  unchanged: palette.border.light,
};

function MessageCell({ msg, placeholder }: { msg: Message | null; placeholder?: string }) {
  if (!msg) {
    return (
      <Box sx={{ flex: 1, p: "12px", opacity: 0.4, fontSize: 12, color: "text.secondary" }}>
        {placeholder || "—"}
      </Box>
    );
  }
  return (
    <Box sx={{ flex: 1, p: "12px" }}>
      <Typography fontSize={11} fontWeight={600} color="text.secondary" textTransform="uppercase" mb={0.5}>
        {msg.role}
      </Typography>
      <Typography fontSize={12} sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
        {msg.content || "(empty)"}
      </Typography>
    </Box>
  );
}

function ConfigDiff({ a, b }: { a: Version; b: Version }) {
  const changes: Array<{ field: string; from: string; to: string }> = [];

  if (a.model !== b.model) {
    changes.push({ field: "Model", from: a.model || "(none)", to: b.model || "(none)" });
  }

  const configA = a.config || {};
  const configB = b.config || {};
  const allKeys = new Set([...Object.keys(configA), ...Object.keys(configB)]);
  for (const key of allKeys) {
    const valA = String(configA[key] ?? "(default)");
    const valB = String(configB[key] ?? "(default)");
    if (valA !== valB) {
      changes.push({ field: key, from: valA, to: valB });
    }
  }

  if (changes.length === 0) return null;

  return (
    <Box sx={{ mt: "16px", p: "16px", border: `1px solid ${palette.border.light}`, borderRadius: "4px" }}>
      <Typography fontSize={12} fontWeight={600} color="text.secondary" mb="8px">Configuration changes</Typography>
      <Stack spacing="4px">
        {changes.map((c) => (
          <Typography key={c.field} fontSize={12}>
            <strong>{c.field}:</strong>{" "}
            <span style={{ color: "#B42318" }}>{c.from}</span>
            {" → "}
            <span style={{ color: "#027A48" }}>{c.to}</span>
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}

export default function VersionDiffModal({ isOpen, onClose, versionA, versionB }: VersionDiffModalProps) {
  const rows = useMemo(() => {
    if (!versionA || !versionB) return [];
    return diffMessages(versionA.content || [], versionB.content || []);
  }, [versionA, versionB]);

  if (!versionA || !versionB) return null;

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title={`v${versionA.version} vs v${versionB.version}`}
      description="Compare message content and configuration between two versions."
      maxWidth="900px"
      fitContent
    >
      {/* Column headers */}
      <Box sx={{ display: "flex", gap: "8px", mb: "8px" }}>
        <Box sx={{ flex: 1 }}>
          <Typography fontSize={12} fontWeight={600} color="text.secondary">v{versionA.version}</Typography>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography fontSize={12} fontWeight={600} color="text.secondary">v{versionB.version}</Typography>
        </Box>
      </Box>

      {/* Diff rows */}
      <Stack spacing="8px">
        {rows.map((row, idx) => (
          <Box
            key={idx}
            sx={{
              display: "flex",
              gap: "8px",
              borderRadius: 1,
              overflow: "hidden",
              border: `1px solid ${STATUS_BORDERS[row.status]}`,
              bgcolor: STATUS_COLORS[row.status],
            }}
          >
            <MessageCell msg={row.left} placeholder={row.status === "added" ? "(not present)" : undefined} />
            <Box sx={{ width: 1, bgcolor: STATUS_BORDERS[row.status], flexShrink: 0 }} />
            <MessageCell msg={row.right} placeholder={row.status === "removed" ? "(removed)" : undefined} />
          </Box>
        ))}
      </Stack>

      {rows.length === 0 && (
        <Box sx={{ textAlign: "center", py: "32px" }}>
          <Typography fontSize={13} color="text.secondary">No differences found</Typography>
        </Box>
      )}

      <ConfigDiff a={versionA} b={versionB} />
    </StandardModal>
  );
}
