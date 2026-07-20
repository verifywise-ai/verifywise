import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar } from "@mui/material";
import { Copy, Database } from "lucide-react";
import CodeBlock from "../CodeBlock";

interface MockEmptyStateProps {
  message?: string;
  showBorder?: boolean;
}

const MockEmptyState: React.FC<MockEmptyStateProps> = ({
  message = "No datasets found. Add a dataset to get started.",
  showBorder = true,
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pt: "48px",
        pb: "24px",
        ...(showBorder && {
          border: `1px dashed ${theme.palette.divider}`,
          borderRadius: "4px",
          backgroundColor: theme.palette.background.paper,
        }),
      }}
    >
      <Box
        sx={{
          width: 180,
          height: 120,
          borderRadius: "4px",
          backgroundColor: theme.palette.action.hover,
          mb: "24px",
        }}
      />
      <Typography sx={{ fontSize: 13, fontWeight: 500, color: theme.palette.text.secondary, px: 2 }}>
        {message}
      </Typography>
    </Box>
  );
};

const emptyStateSnippets = {
  standard: `import { EmptyState } from "../EmptyState";
import { Database } from "lucide-react";

<EmptyState
  icon={Database}
  message="No datasets found. Add a dataset to get started."
/>`,
  withTips: `import { EmptyState } from "../EmptyState";
import EmptyStateTip from "../EmptyState/EmptyStateTip";

<EmptyState icon={Database} message="No datasets found...">
  <EmptyStateTip icon={PlusCircle} title="Create a dataset" description="..." />
</EmptyState>`,
  widget: `import { EmptyStateMessage } from "../EmptyStateMessage";

<EmptyStateMessage message="No upcoming deadlines" />`,
};

const EmptyStatesSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <Box sx={{ p: "32px 40px" }}>
      <Snackbar
        open={!!copiedText}
        autoHideDuration={2000}
        onClose={() => setCopiedText(null)}
        message="Copied to clipboard"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />

      <Box sx={{ mb: "32px" }}>
        <Typography sx={{ fontSize: 24, fontWeight: 600, color: theme.palette.text.primary, mb: "8px" }}>
          Empty states
        </Typography>
        <Typography sx={{ fontSize: 14, color: theme.palette.text.secondary, maxWidth: 600 }}>
          Standard empty state for tables and lists: SVG illustration with contextual Lucide icon,
          message, and dashed border (on by default).
        </Typography>
      </Box>

      <SpecSection title="EmptyState component">
        <Stack spacing="24px">
          <ExampleWithCode label="Standard empty state" code={emptyStateSnippets.standard} onCopy={handleCopy}>
            <Box sx={{ p: 2, backgroundColor: theme.palette.action.hover, borderRadius: "4px" }}>
              <MockEmptyState />
            </Box>
          </ExampleWithCode>

          <ExampleWithCode label="With guidance tips" code={emptyStateSnippets.withTips} onCopy={handleCopy}>
            <Box sx={{ p: 2, backgroundColor: theme.palette.action.hover, borderRadius: "4px" }}>
              <MockEmptyState />
            </Box>
          </ExampleWithCode>
        </Stack>

        <Box sx={{ mt: "24px" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase" }}>
            EmptyState props
          </Typography>
          <SpecTable
            onCopy={handleCopy}
            specs={[
              { property: "icon", value: "Inbox (fallback — pass contextual LucideIcon)" },
              { property: "message", value: '"There is currently no data in this table."' },
              { property: "showBorder", value: "true (default)" },
              { property: "children", value: "EmptyStateTip blocks (optional)" },
            ]}
          />
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      <SpecSection title="EmptyStateMessage component">
        <ExampleWithCode label="Dashboard widget" code={emptyStateSnippets.widget} onCopy={handleCopy}>
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <Stack alignItems="center" gap={1}>
              <Database size={24} color={theme.palette.primary.main} />
              <Typography sx={{ fontSize: 14, color: theme.palette.text.secondary }}>
                No upcoming deadlines
              </Typography>
            </Stack>
          </Box>
        </ExampleWithCode>
      </SpecSection>
    </Box>
  );
};

const SpecSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const theme = useTheme();
  return (
    <Box sx={{ mb: "16px" }}>
      <Typography sx={{ fontSize: 18, fontWeight: 600, color: theme.palette.text.primary, mb: "16px" }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
};

const SpecTable: React.FC<{
  specs: { property: string; value: string }[];
  onCopy: (text: string) => void;
}> = ({ specs, onCopy }) => {
  const theme = useTheme();
  return (
    <Box sx={{ backgroundColor: theme.palette.action.hover, borderRadius: "4px", border: `1px solid ${theme.palette.divider}` }}>
      {specs.map((spec, index) => (
        <Box
          key={index}
          onClick={() => onCopy(spec.value)}
          sx={{
            display: "flex",
            justifyContent: "space-between",
            p: "10px 14px",
            borderBottom: index < specs.length - 1 ? `1px solid ${theme.palette.divider}` : "none",
            cursor: "pointer",
          }}
        >
          <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>{spec.property}</Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 500, fontFamily: "monospace" }}>{spec.value}</Typography>
        </Box>
      ))}
    </Box>
  );
};

const ExampleWithCode: React.FC<{
  label: string;
  code: string;
  onCopy: (text: string) => void;
  children: React.ReactNode;
}> = ({ label, code, onCopy, children }) => {
  const theme = useTheme();
  const [showCode, setShowCode] = useState(true);

  return (
    <Box sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: "4px", overflow: "hidden" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", p: "8px 12px", backgroundColor: theme.palette.action.hover }}>
        <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{label}</Typography>
        <Box onClick={() => setShowCode(!showCode)} sx={{ fontSize: 11, cursor: "pointer" }}>
          {showCode ? "Hide code" : "Show code"}
        </Box>
      </Box>
      <Box>{children}</Box>
      {showCode && <CodeBlock code={code} language="tsx" onCopy={onCopy} />}
    </Box>
  );
};

export default EmptyStatesSection;
